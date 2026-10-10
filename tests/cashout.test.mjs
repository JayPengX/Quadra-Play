import test from 'node:test';
import assert from 'node:assert/strict';
import { cashOutValue, cashOutState, CASHOUT_KEEP, LEG_CUT } from '../public/lib/cashout.mjs';
import { settleSlip, slipPayoutTable, boostRate } from '../public/lib/odds.mjs';
import { newAccount, placeSlip, cashOut, applyResults, balance, recoverFromWallet, poolEntries } from '../public/lib/account.mjs';

const leg = (gameId, odds, result = null) => ({ gameId, odds, result, kind: 'ml', side: 'home' });

test('cash out: a single sells back at its chance cut by the house’s margin, less the keep', () => {
  // 1.85 on a 51% pick: the board's margin is in the odds (held, it pays 94.35% back on average).
  const slip = { id: 's', status: 'open', mode: 'single', sizes: [1], stake: 1000, cost: 1000, legs: [leg('g1', 1.85)] };
  assert.equal(cashOutValue(slip, [0.51]), Math.floor(1000 * 1.85 * 0.51 * (1 - LEG_CUT.pre) * (1 - CASHOUT_KEEP)));
  // In play, the cut is the live one's.
  assert.equal(cashOutValue(slip, [{ p: 0.51, live: true }]), Math.floor(1000 * 1.85 * 0.51 * (1 - LEG_CUT.live) * (1 - CASHOUT_KEEP)));
  // Never worth more than holding it, Plus or not, while nothing's changed.
  for (const keep of [CASHOUT_KEEP, 0.02]) assert.ok(cashOutValue(slip, [0.51], { keep }) < 1000 * 1.85 * 0.51);
  // Odds that wobble a little don't make a profit; the pick really getting likelier does.
  assert.ok(cashOutValue(slip, [0.53], { keep: 0.02 }) < 1000);
  assert.ok(cashOutValue(slip, [0.7]) > 1000);
  // No price now: suspended.
  assert.equal(cashOutValue(slip, [null]), null);
  assert.equal(cashOutValue(slip, [1]), null);
});

test('cash out: a parlay with a won leg carries that leg; a lost one leaves nothing', () => {
  const slip = { id: 'p', status: 'open', mode: 'parlay', sizes: [2], stake: 100, cost: 100, legs: [leg('g1', 2, 'won'), leg('g2', 2)] };
  assert.equal(cashOutValue(slip, [null, 0.45]), Math.floor(100 * 2 * 2 * 0.45 * (1 - LEG_CUT.pre) * (1 - CASHOUT_KEEP)));
  assert.equal(cashOutValue({ ...slip, legs: [leg('g1', 2, 'lost'), leg('g2', 2)] }, [null, 0.45]), null);
  // Two undecided picks of one game aren't independent: suspended, and said why.
  assert.deepEqual(cashOutState({ ...slip, legs: [leg('g1', 2), leg('g1', 2)] }, [0.45, 0.45]), { value: null, reason: 'sameGame', leg: 1 });
  assert.deepEqual(cashOutState(slip, [null, null]), { value: null, reason: 'noPrice', leg: 1 });
  // Plus keeps less.
  assert.ok(cashOutValue(slip, [null, 0.45], { keep: 0.02 }) > cashOutValue(slip, [null, 0.45]));
});

test("cash out: a parlay's offer drops with each pick still to play, and is never its payout", () => {
  const legs = n => Array.from({ length: 6 }, (_, k) => leg(`g${k}`, 2, k < 6 - n ? 'won' : null));
  const slip = n => ({ id: 'six', status: 'open', mode: 'parlay', sizes: [6], stake: 100, cost: 100, legs: legs(n) });
  // Every undecided pick even (50%): its fair worth is the same as stake x what's won so far x ½ each.
  const share = n => cashOutValue(slip(n), Array(6).fill(0.5)) / (100 * 2 ** 6 * 0.5 ** n);
  assert.ok(share(4) < share(1), 'the cut compounds');
  // One pick left at 99%: bought back under what it pays.
  const pays = settleSlip({ legs: legs(0), sizes: [6], stake: 100 }).net;
  assert.ok(cashOutValue(slip(1), [...Array(5).fill(null), 0.99]) < pays * 0.95);
});

test('cash out: paid once, as the payout; a late result changes nothing; recoverable', () => {
  let a = newAccount(new Date('2026-10-01T00:00:00Z'));
  const slip = { id: 'x1', mode: 'single', sizes: [1], stake: 500, cost: 500, legs: [leg('g1', 1.9)] };
  a = placeSlip(a, slip, new Date('2026-10-01T01:00:00Z')).account;
  const before = balance(a);
  a = cashOut(a, 'x1', 470, new Date('2026-10-01T02:00:00Z'));
  assert.equal(balance(a), before + 470);
  assert.equal(a.slips[0].status, 'settled');
  assert.equal(a.slips[0].cashedOut, true);
  assert.equal(cashOut(a, 'x1', 470), a, 'never twice');
  assert.equal(applyResults(a, 'x1', ['won']), a, 'the result no longer pays');
  // Lost on the device: the wallet brings back what was paid.
  const wallet = { entries: poolEntries(a).map(e => ({ ...e })) };
  const lost = recoverFromWallet({ ...a, slips: [] }, wallet);
  assert.equal(lost.slips[0].payout, 470);
});

test('parlay boost: winnings of 3+ pick combinations raised, doubled for Plus, old slips unchanged', () => {
  const legs = [leg('a', 2), leg('b', 2), leg('c', 2)].map(l => ({ ...l, result: 'won' }));
  const plain = settleSlip({ legs, sizes: [3], stake: 100 }).gross;
  assert.equal(plain, 800);
  assert.ok(Math.abs(settleSlip({ legs, sizes: [3], stake: 100, boost: 1 }).gross - (100 + 700 * (1 + boostRate(3)))) < 1e-9);
  assert.ok(Math.abs(settleSlip({ legs, sizes: [3], stake: 100, boost: 2 }).gross - (100 + 700 * (1 + 2 * boostRate(3)))) < 1e-9);
  // Doubles pay no boost.
  assert.equal(slipPayoutTable({ legs: legs.slice(0, 2), sizes: [2], stake: 100, boost: 2 }).gross[3], 400);
  assert.equal(boostRate(12), boostRate(7));
});

test('editing a slip: cashed out at its price, the new slip staked from it; only the difference moves', () => {
  let a = newAccount(new Date('2026-10-01T00:00:00Z'));
  const old = { id: 'e1', mode: 'parlay', sizes: [2], stake: 500, cost: 500, legs: [leg('g1', 2), leg('g2', 2)] };
  a = placeSlip(a, old, new Date('2026-10-01T01:00:00Z')).account;
  const before = balance(a);
  const credit = cashOutValue(a.slips[0], [0.5, 0.5]);
  // Edited into a single at 1.9 staked 1,000: the credit pays first, the rest from the balance.
  a = cashOut(a, 'e1', credit, new Date('2026-10-01T02:00:00Z'));
  a = placeSlip(a, { id: 'e2', mode: 'single', sizes: [1], stake: 1000, cost: 1000, legs: [leg('g3', 1.9)], editedFrom: 'e1' }, new Date('2026-10-01T02:00:00Z'), { extra: Infinity }).account;
  assert.equal(balance(a), before + credit - 1000);
  assert.equal(a.slips.find(x => x.id === 'e1').cashedOut, true);
  // Never worth more than holding the slip: its credit is under the slip's fair worth.
  assert.ok(credit < 500 * 4 * 0.25);
});
