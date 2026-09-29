import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combosBySize, comboCount, slipErrors, slipPayoutTable, settleSlip } from '../public/lib/odds.mjs';

const legs = [
  { gameId: 'g1', odds: 2, fairChance: 0.5 },
  { gameId: 'g1', odds: 2, fairChance: 0.5 },
  { gameId: 'g2', odds: 3, fairChance: 0.3 }
];

test('Picks of one game: every single, but never two in one combination', () => {
  assert.deepEqual(combosBySize(legs), [1, 3, 2]);
  assert.equal(comboCount(legs, [1]), 3);
  assert.equal(comboCount(legs, [2]), 2);
  assert.deepEqual(slipErrors({ mode: 'single', legs, sizes: [1], stake: 100 }).filter(e => e === 'sameGame'), []);
  assert.ok(slipErrors({ mode: 'parlay', legs, sizes: [3], stake: 100 }).includes('sameGame'));
  assert.deepEqual(slipErrors({ mode: 'system', legs, sizes: [2], stake: 100 }).filter(e => e === 'sameGame'), []);
  // All three won (can't happen for one game's both sides, but the table stays
  // right): the two 2-leg combinations g1a×g2 and g1b×g2, never g1a×g1b.
  const { gross } = slipPayoutTable({ legs, sizes: [2], stake: 100 });
  assert.equal(gross[0b111], 1200);
  assert.equal(settleSlip({ legs: legs.map((l, i) => ({ ...l, result: i === 1 ? 'lost' : 'won' })), sizes: [2], stake: 100 }).gross, 600);
});

test('Legs saved without a gameId: each its own game, as before', () => {
  const old = legs.map(({ odds }) => ({ odds }));
  assert.deepEqual(combosBySize(old), [1, 3, 3, 1]);
});

test('Picks that rule each other out: at most one of them wins', async () => {
  const { maskChance, analyzeSlip } = await import('../public/lib/odds.mjs');
  const two = [
    { gameId: 'f1', market: 'f1', odds: 3.35, fairChance: 0.17 },
    { gameId: 'f1', market: 'f1', odds: 4.49, fairChance: 0.11 },
    { gameId: 'f1red', market: 'f1red', odds: 6.64, fairChance: 0.13 }
  ];
  assert.equal(maskChance(two, 0b011), 0);
  assert.ok(Math.abs(maskChance(two, 0b000) - (1 - 0.28) * 0.87) < 1e-12);
  let total = 0;
  for (let m = 0; m < 8; m++) total += maskChance(two, m);
  assert.ok(Math.abs(total - 1) < 1e-12);
  const a = analyzeSlip({ legs: two, sizes: [1], stake: 100 });
  assert.equal(a.byHits[3].chance, 0);
  // Same game, different lines: not exclusive.
  assert.ok(maskChance([{ gameId: 'g', market: 'total|8.5', fairChance: 0.5 }, { gameId: 'g', market: 'total|9.5', fairChance: 0.4 }], 0b11) > 0);
});
