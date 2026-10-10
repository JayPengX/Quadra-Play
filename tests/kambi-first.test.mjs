// Kambi first: its prices on ESPN's games, DraftKings the cross-check; the
// house's own price only for the winner on a small ticket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachKambi, mergeGames } from '../public/lib/sources.mjs';
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

test('tennis and UFC are no longer sold: an open pick on one is void', async () => {
  const { fetchOutcomes } = await import('../public/lib/sources.mjs');
  const legs = ['atp', 'ufc'].map(sport => ({ id: sport, sport, kind: 'ml', side: 'home', start: '2026-10-02T02:00:00Z', home: 'A', away: 'B' }));
  const out = await fetchOutcomes(legs, new Date('2026-10-11T00:00:00Z'));
  for (const leg of legs) assert.equal(out.get(leg.id)?.status, 'void', leg.sport);
});

test('live: Kambi\'s in-play prices on ESPN\'s live games, turned to ESPN\'s sides; soccer with its draw', async () => {
  const { attachKambiLive } = await import('../public/lib/sources.mjs');
  const { parseKambiInPlay } = await import('../public/lib/kambi.mjs');
  const offer = (type, label, outcomes) => ({ betOfferType: { englishName: type }, criterion: { englishLabel: label }, outcomes });
  const data = { events: [{ event: { id: 5, state: 'STARTED', homeName: 'Arsenal', awayName: 'Leeds United', start: '2026-10-10T11:30:00Z' },
    betOffers: [
      offer('Match', 'Full Time', [{ type: 'OT_ONE', odds: 1500 }, { type: 'OT_CROSS', odds: 4000 }, { type: 'OT_TWO', odds: 7000 }]),
      offer('Over/Under', 'Total Goals', [{ type: 'OT_OVER', odds: 1900, line: 2500 }, { type: 'OT_UNDER', odds: 1900, line: 2500 }])
    ], liveData: { score: { home: 1, away: 0 } } }] };
  const [k] = parseKambiInPlay(data, 'epl');
  assert.ok(k.ml.draw > 0.1 && Math.abs(k.ml.home + k.ml.draw + k.ml.away - 1) < 1e-9);
  assert.equal(k.total.line, 2.5);
  const [same] = attachKambiLive([{ sport: 'epl', home: 'Arsenal', away: 'Leeds United' }], [k]);
  assert.equal(same.kambi.kambiId, 5);
  assert.equal(same.kambi.ml.home, k.ml.home);
  const [flip] = attachKambiLive([{ sport: 'epl', home: 'Leeds United', away: 'Arsenal' }], [k]);
  assert.equal(flip.kambi.ml.away, k.ml.home);
  const [none] = attachKambiLive([{ sport: 'mls', home: 'Arsenal', away: 'Leeds United' }], [k]);
  assert.equal(none.kambi, undefined);
  // NHL: the winner with overtime, not the regular-time 1X2.
  const nhl = { events: [{ event: { id: 6, state: 'STARTED', homeName: 'A', awayName: 'B', start: '2026-10-10T00:00:00Z' },
    betOffers: [
      offer('Match', 'Match Odds - Regular Time', [{ type: 'OT_ONE', odds: 2000 }, { type: 'OT_CROSS', odds: 4000 }, { type: 'OT_TWO', odds: 3000 }]),
      offer('Match', 'Moneyline - Including Overtime and penalty shootout', [{ type: 'OT_ONE', odds: 1800 }, { type: 'OT_TWO', odds: 2000 }])
    ], liveData: { score: { home: 0, away: 0 } } }] };
  const [h] = parseKambiInPlay(nhl, 'nhl');
  assert.ok(Math.abs(h.ml.home - (1 / 1.8) / (1 / 1.8 + 1 / 2)) < 1e-9);
});

test('soccer settles on 90 minutes: a cup tie that went to extra time counts its two halves', async () => {
  const { parseEspnResults } = await import('../public/lib/sources.mjs');
  const side = (homeAway, name, score, halves) => ({ homeAway, team: { displayName: name }, score: String(score), linescores: halves.map(value => ({ value })) });
  const board = name => ({ events: [{ id: '1', date: '2026-10-01T19:00Z', competitions: [{ status: { type: { name, state: 'post', completed: true } }, competitors: [side('home', 'Arsenal', 2, [0, 1, 1, 0]), side('away', 'Leeds United', 1, [1, 0, 0, 0])] }] }] });
  const [aet] = parseEspnResults(board('STATUS_FINAL_AET'), 'facup');
  assert.deepEqual([aet.homeScore, aet.awayScore], [1, 1]);
  const [ft] = parseEspnResults(board('STATUS_FULL_TIME'), 'facup');
  assert.deepEqual([ft.homeScore, ft.awayScore], [2, 1]);
});
