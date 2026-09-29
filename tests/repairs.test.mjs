import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreDodgersSlip } from '../public/lib/repairs.mjs';
import { mergeAccounts, refundLost, balance } from '../public/lib/account.mjs';

const ID = 'c7334d292057cc65';
const lost = {
  v: 1,
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-09-20T00:00:00.000Z',
  ledger: [
    { id: 'grant-1', t: '2026-01-01T00:00:00.000Z', kind: 'grant', amount: 5000 },
    { id: 'stake-abc', t: '2026-06-10T04:00:00.000Z', kind: 'stake', amount: -2000, slipId: 'abc' },
    { id: 'refund-abc', t: '2026-06-14T04:00:00.000Z', kind: 'refund', amount: 2000, slipId: 'abc' }
  ],
  slips: [{ id: 'abc', t: '2026-06-10T04:00:00.000Z', mode: 'single', sizes: [1], stake: 2000, cost: 2000, legs: [], status: 'settled', payout: 2000, settledAt: '2026-06-10T04:00:00.000Z', recovered: true, refunded: true }]
};

test('the lost Dodgers slip comes back open, staked again, at that day’s odds', () => {
  const fixed = restoreDodgersSlip(lost, ID);
  const slip = fixed.slips[0];
  assert.equal(slip.status, 'open');
  assert.equal(slip.recovered, undefined);
  assert.equal(slip.legs[0].kind, 'future');
  assert.equal(slip.legs[0].team, 'Los Angeles Dodgers');
  assert.equal(slip.legs[0].odds, 2.84);
  assert.equal(balance(fixed), 3000);
  assert.equal(fixed.ledger.find(e => e.id === 'restake-abc').t, '2026-06-14T04:00:00.000Z');
  // Once done it stays done, refundLost leaves it alone, and it wins a merge
  // with a device still holding the refunded copy.
  assert.equal(restoreDodgersSlip(fixed, ID), fixed);
  assert.equal(refundLost(fixed, new Date('2026-09-30')).slips[0].status, 'open');
  for (const merged of [mergeAccounts(lost, fixed), mergeAccounts(fixed, lost)]) {
    assert.equal(merged.slips[0].status, 'open');
    assert.equal(balance(merged), 3000);
  }
});

test('other accounts are left alone', () => {
  assert.equal(restoreDodgersSlip(lost, 'ffffffffffffffff'), lost);
});
