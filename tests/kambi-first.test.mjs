// Kambi first: its prices on ESPN's games, DraftKings the cross-check; the
// house's own price only for the winner on a small ticket; tennis and UFC
// settled from ESPN's scoreboards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachKambi, mergeGames, parseEspnDuel } from '../public/lib/sources.mjs';
import { blendOutcomes, BOOKS_APART, slipErrors, SLIP_RULES } from '../public/lib/odds.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { legResult } from '../public/lib/account.mjs';

const espnGame = { sport: 'epl', startUtc: '2026-10-03T14:00:00.000Z', away: 'Leeds United', home: 'Arsenal', outcomes: { away: 0.15, draw: 0.22, home: 0.63 }, total: { line: 2.5, overFair: 0.55 }, spread: null };
const kambiGame = (home, away, o) => ({ sport: 'epl', startUtc: '2026-10-03T14:00:00.000Z', home: { en: home }, away: { en: away }, draftKings: o, spread: { awayLine: 1.5, awayFair: 0.6 }, total: { line: 3.5, overFair: 0.3 }, kambiId: 77 });

test('Kambi prices attach to the ESPN game, turned round when Kambi lists the sides the other way', () => {
  const [same] = attachKambi([espnGame], [kambiGame('Arsenal', 'Leeds United', { home: 0.6, draw: 0.24, away: 0.16 })]);
  assert.deepEqual(same.kambi.outcomes, { home: 0.6, draw: 0.24, away: 0.16 });
  assert.equal(same.kambi.kambiId, 77);
  const [flipped] = attachKambi([espnGame], [kambiGame('Leeds United', 'Arsenal', { home: 0.16, draw: 0.24, away: 0.6 })]);
  assert.deepEqual([flipped.kambi.outcomes.home, flipped.kambi.outcomes.away], [0.6, 0.16]);
  assert.deepEqual(flipped.kambi.spread, { awayLine: -1.5, awayFair: 0.4 });
  // Another day's match: not this one.
  const [none] = attachKambi([espnGame], [{ ...kambiGame('Arsenal', 'Leeds United', { home: 0.6, draw: 0.24, away: 0.16 }), startUtc: '2026-10-05T14:00:00.000Z' }]);
  assert.equal(none.kambi, undefined);
});

test('the board blends Kambi and DraftKings; far apart, the game is locked', () => {
  const [g] = mergeGames(attachKambi([espnGame], [kambiGame('Arsenal', 'Leeds United', { home: 0.6, draw: 0.24, away: 0.16 })]), []);
  assert.equal(g.kambiId, 77);
  const blend = blendOutcomes(g.draftKings, g.polymarket, g.house, g.kambi);
  assert.equal(blend.source, 'both');
  assert.ok(Math.abs(blend.probs.home - 0.615) < 1e-9);
  assert.ok(!gameOptions(g).some(o => o.lock === 'check'));
  // DraftKings' own total kept; Kambi's when DraftKings has none.
  assert.equal(g.total.line, 2.5);
  const [noDk] = mergeGames(attachKambi([{ ...espnGame, outcomes: null, total: null }], [kambiGame('Arsenal', 'Leeds United', { home: 0.6, draw: 0.24, away: 0.16 })]), []);
  assert.equal(noDk.total.line, 3.5);
  assert.equal(blendOutcomes(noDk.draftKings, null, noDk.house, noDk.kambi).source, 'kambi');
  assert.equal(noDk.house, null);
  // A late injury on one book only: held until they agree.
  const apart = { home: 0.63 - BOOKS_APART - 0.01, draw: 0.24, away: 0.15 + BOOKS_APART + 0.01 - 0.02 };
  const [held] = mergeGames(attachKambi([espnGame], [kambiGame('Arsenal', 'Leeds United', apart)]), []);
  assert.ok(gameOptions(held).every(o => o.lock === 'check'));
});

test('a house-priced pick caps the ticket', () => {
  const leg = (cap, gameId) => ({ id: gameId, gameId, odds: 2, fairChance: 0.5, cap });
  assert.deepEqual(slipErrors({ mode: 'single', legs: [leg('house', 'a')], sizes: [1], stake: SLIP_RULES.capped }), []);
  assert.deepEqual(slipErrors({ mode: 'single', legs: [leg('house', 'a')], sizes: [1], stake: SLIP_RULES.capped + 10 }), ['ticketCapped']);
  assert.deepEqual(slipErrors({ mode: 'single', legs: [leg(undefined, 'a')], sizes: [1], stake: SLIP_RULES.capped + 10 }), []);
});

const duelBoard = (competitors, name = 'STATUS_FINAL', date = '2026-10-02T03:00Z') => ({
  events: [{ date: '2026-09-27T04:00Z', groupings: [{ grouping: { displayName: "Men's Singles" }, competitions: [{ date, status: { type: { name, state: 'post', completed: true } }, competitors }] }] }]
});
const player = (name, winner, sets) => ({ athlete: { displayName: name }, winner, linescores: sets.map(value => ({ value })) });

test('tennis from ESPN: sets won, every set\'s games; a retirement is void', () => {
  const leg = { start: '2026-10-02T02:00:00Z', home: 'Jaume Munar', away: 'Jaime Faria' };
  const data = duelBoard([player('Jaime Faria', false, [4, 7, 3]), player('Jaume Munar', true, [6, 5, 6])]);
  const r = parseEspnDuel(data, leg);
  assert.deepEqual([r.status, r.homeScore, r.awayScore], ['final', 2, 1]);
  assert.equal(legResult({ kind: 'ml', side: 'home' }, r), 'won');
  // 17 games to 14: Munar -2.5 covers, the total 31.
  assert.equal(legResult({ kind: 'gamehcap', side: 'home', line: -2.5 }, r), 'won');
  assert.equal(legResult({ kind: 'gamehcap', side: 'away', line: 2.5 }, r), 'lost');
  assert.equal(legResult({ kind: 'gametotal', side: 'over', line: 30.5 }, r), 'won');
  assert.equal(parseEspnDuel(duelBoard([player('Jaime Faria', false, [4, 1]), player('Jaume Munar', true, [6, 0])], 'STATUS_RETIRED'), leg).status, 'void');
  // Not these two, or days away: not found.
  assert.equal(parseEspnDuel(data, { ...leg, away: 'Someone Else' }), null);
  assert.equal(parseEspnDuel(duelBoard([player('Jaime Faria', false, [4]), player('Jaume Munar', true, [6])], 'STATUS_FINAL', '2026-10-09T03:00Z'), leg), null);
});

test('UFC from ESPN: the winner 1-0, a draw or no contest void', () => {
  const leg = { start: '2026-10-03T20:00:00Z', home: 'Marvin Vettori', away: 'Ismail Naurdiev' };
  const card = (a, b) => ({ events: [{ date: '2026-10-03T20:00Z', competitions: [{ date: '2026-10-03T22:00Z', status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } }, competitors: [a, b] }] }] });
  const r = parseEspnDuel(card({ athlete: { displayName: 'Ismail Naurdiev' }, winner: true }, { athlete: { displayName: 'Marvin Vettori' }, winner: false }), leg);
  assert.deepEqual([r.homeScore, r.awayScore], [0, 1]);
  assert.equal(legResult({ kind: 'ml', side: 'away' }, r), 'won');
  assert.equal(parseEspnDuel(card({ athlete: { displayName: 'Ismail Naurdiev' }, winner: false }, { athlete: { displayName: 'Marvin Vettori' }, winner: false }), leg).status, 'void');
});
