import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAsiaSchedule, asiaRecords } from '../public/lib/schedules.mjs';
import { sameSide } from '../public/lib/house.mjs';
import { mergeGames, pricedByKambi, asiaResult } from '../public/lib/sources.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { LEAGUES } from '../public/lib/teams.mjs';

const now = new Date('2026-09-30T00:00:00Z');
const asia = (id, start, home, away, state = 'pre', homeScore = null, awayScore = null) => ({ id, start, home: { en: home, zh: home }, away: { en: away, zh: away }, state, homeScore, awayScore });

test('every Kambi league has a schedule of its own, or sells what Kambi lists', () => {
  assert.deepEqual(LEAGUES.cpbl.schedule, { asia: 'cpbl' });
  assert.equal(LEAGUES.euroleague.schedule, undefined);
});

test('Asian baseball: the games to come, priced from this season\'s results, the winner only', () => {
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
  // The house's own price: the winner only (Kambi's price opens the rest).
  const kinds = new Set(gameOptions(board).map(o => o.kind));
  assert.deepEqual([...kinds], ['ml']);
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
