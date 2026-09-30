import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAsiaSchedule, asiaRecords, parseEspnCard, parseEspnDraw, parseRankings } from '../public/lib/schedules.mjs';
import { pointsStrengths, parseRecord, sameSide } from '../public/lib/house.mjs';
import { mergeGames, pricedByKambi, asiaResult } from '../public/lib/sources.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { LEAGUES } from '../public/lib/teams.mjs';

const now = new Date('2026-09-30T00:00:00Z');
const asia = (id, start, home, away, state = 'pre', homeScore = null, awayScore = null) => ({ id, start, home: { en: home, zh: home }, away: { en: away, zh: away }, state, homeScore, awayScore });

test('every Kambi league has a schedule of its own, or sells what Kambi lists', () => {
  assert.deepEqual(LEAGUES.cpbl.schedule, { asia: 'cpbl' });
  assert.equal(LEAGUES.ufc.schedule.kind, 'card');
  assert.equal(LEAGUES.tennis.schedule.kind, 'draw');
  assert.equal(LEAGUES.rugbyunion.schedule, undefined);
  assert.equal(LEAGUES.tabletennis.schedule, undefined);
});

test('Asian baseball: the games to come, priced from this season\'s results, only markets a final score settles', () => {
  const games = [
    ...Array.from({ length: 10 }, (_, i) => asia(`p${i}`, `2026-09-${10 + i}T10:35:00Z`, 'Rakuten Monkeys', 'Wei Chuan Dragons', 'post', 5, 2)),
    asia('n1', '2026-10-02T10:35:00Z', 'Rakuten Monkeys', 'Wei Chuan Dragons'),
    asia('old', '2026-09-29T10:35:00Z', 'Rakuten Monkeys', 'Wei Chuan Dragons')
  ];
  assert.deepEqual(asiaRecords(games).get('rakuten monkeys'), { wins: 10, games: 10 });
  const [g] = parseAsiaSchedule(games, 'cpbl', now);
  assert.equal(g.startUtc, '2026-10-02T10:35:00.000Z');
  assert.ok(g.house.home > 0.6, `${g.house.home}`);
  const [board] = mergeGames([g], []);
  assert.equal(board.scoreOnly, true);
  const kinds = new Set(gameOptions(board).map(o => o.kind));
  assert.ok(kinds.has('ml') && kinds.has('total') && kinds.has('runline'));
  for (const k of ['f5', 'f5total', 'inning', 'firstinning']) assert.ok(!kinds.has(k), k);
  // Settled from the list.
  assert.deepEqual(asiaResult(asia('x', '', 'A', 'B', 'post', 3, 1)), { status: 'final', homeScore: 3, awayScore: 1, awayInnings: [], homeInnings: [] });
  assert.equal(asiaResult(asia('x', '', 'A', 'B', 'void')).status, 'void');
  assert.equal(asiaResult(asia('x', '', 'A', 'B', 'in')).status, 'pending');
});

test('a schedule\'s game Kambi prices already is Kambi\'s', () => {
  const kambi = [{ sport: 'cpbl', startUtc: '2026-10-02T10:35:00.000Z', home: { en: 'Rakuten Monkeys' }, away: { en: 'Wei Chuan Dragons' } }];
  const game = { sport: 'cpbl', startUtc: '2026-10-02T10:35:00.000Z', home: 'Rakuten Monkeys', away: 'Wei Chuan Dragons' };
  assert.equal(pricedByKambi(game, kambi), true);
  assert.equal(pricedByKambi({ ...game, home: 'Wei Chuan Dragons', away: 'Rakuten Monkeys' }, kambi), true);
  assert.equal(pricedByKambi({ ...game, startUtc: '2026-10-04T10:35:00.000Z' }, kambi), false);
  assert.ok(sameSide('Penrith Panthers', 'Panthers'));
});

test('UFC: every bout on a card not yet fought, the better record favoured, TBA left out', () => {
  assert.deepEqual(parseRecord('23-14-0'), { wins: 23, games: 37 });
  const fighter = (name, record, order) => ({ order, athlete: { displayName: name }, records: [{ type: 'total', summary: record }] });
  const card = { events: [{ date: '2026-10-03T20:00Z', competitions: [
    { date: '2026-10-03T20:00Z', status: { type: { state: 'pre' } }, competitors: [fighter('Court McGee', '23-14-0', 1), fighter('Eric Nolan', '8-5-0', 2)] },
    { date: '2026-10-03T21:00Z', status: { type: { state: 'pre' } }, competitors: [fighter('Unbeaten', '20-0-0', 1), fighter('Newcomer', '2-3-0', 2)] },
    { date: '2026-10-03T22:00Z', status: { type: { state: 'pre' } }, competitors: [fighter('TBA', '', 1), fighter('Opponent TBA', '', 2)] }
  ] }] };
  const bouts = parseEspnCard(card, 'ufc', now);
  assert.equal(bouts.length, 2);
  assert.equal(bouts[0].home, 'Court McGee');
  assert.ok(bouts[1].house.home > 0.7, `${bouts[1].house.home}`);
  assert.ok(gameOptions(mergeGames(bouts, [])[0]).some(o => o.kind === 'ml'));
});

test('tennis: singles matches with both players known, priced by ranking points', () => {
  const table = pointsStrengths(parseRankings({ rankings: [{ ranks: [{ athlete: { displayName: 'Jannik Sinner' }, points: 11000 }, { athlete: { displayName: 'Matteo Arnaldi' }, points: 1000 }] }] }));
  const player = (name, order, homeAway) => ({ order, homeAway, athlete: { displayName: name } });
  const draw = { events: [{ groupings: [
    { grouping: { displayName: "Men's Singles" }, competitions: [
      { date: '2026-10-01T08:30Z', status: { type: { state: 'pre' } }, competitors: [player('Matteo Arnaldi', 1, 'home'), player('Jannik Sinner', 2, 'away')] },
      { date: '2026-10-01T09:30Z', status: { type: { state: 'pre' } }, competitors: [player('Rei Sakamoto', 1, 'home'), player('Matteo Arnaldi', 2, 'away')] },
      { date: '2026-10-01T10:30Z', status: { type: { state: 'pre' } }, competitors: [player('TBD', 1, 'home'), player('Jannik Sinner', 2, 'away')] }
    ] },
    { grouping: { displayName: "Men's Doubles" }, competitions: [{ date: '2026-10-01T08:30Z', status: { type: { state: 'pre' } }, competitors: [player('A / B', 1, 'home'), player('C / D', 2, 'away')] }] },
    { grouping: { displayName: "Women's Singles" }, competitions: [{ date: '2026-10-01T08:30Z', status: { type: { state: 'pre' } }, competitors: [player('Katie Boulter', 1, 'home'), player('Mai Hontama', 2, 'away')] }] }
  ] }] };
  const matches = parseEspnDraw(draw, 'tennis', table, now);
  assert.equal(matches.length, 2);
  // The women's draw on the same scoreboard is the WTA's.
  assert.deepEqual(parseEspnDraw(draw, 'wta', table, now).map(m => m.home), ['Katie Boulter']);
  assert.ok(matches[0].house.away > 0.85, `${matches[0].house.away}`);
  // An unranked player against a ranked one.
  assert.ok(matches[1].house.away > 0.5);
});
