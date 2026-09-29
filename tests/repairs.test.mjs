import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreDodgersSlip } from '../public/lib/repairs.mjs';
import { mergeAccounts, refundLost, balance } from '../public/lib/account.mjs';

const ID = 'c7334d292057cc65';
const lostSlip = (id, t) => ({ id, t, mode: 'single', sizes: [1], stake: 2000, cost: 2000, legs: [], status: 'settled', payout: 2000, settledAt: t, recovered: true, refunded: true });
// Two lost NT$2,000 bets: 'sat' on Saturday 9/26 (Taiwan), 'thu' on Thursday 9/24.
const lost = {
  v: 1,
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-09-28T00:00:00.000Z',
  ledger: [
    { id: 'grant-1', t: '2026-01-01T00:00:00.000Z', kind: 'grant', amount: 10000 },
    { id: 'stake-thu', t: '2026-09-24T04:00:00.000Z', kind: 'stake', amount: -2000, slipId: 'thu' },
    { id: 'stake-sat', t: '2026-09-26T04:00:00.000Z', kind: 'stake', amount: -2000, slipId: 'sat' },
    { id: 'refund-thu', t: '2026-09-28T01:00:00.000Z', kind: 'refund', amount: 2000, slipId: 'thu' },
    { id: 'refund-sat', t: '2026-09-28T01:00:00.000Z', kind: 'refund', amount: 2000, slipId: 'sat' }
  ],
  slips: [lostSlip('sat', '2026-09-26T04:00:00.000Z'), lostSlip('thu', '2026-09-24T04:00:00.000Z')]
};
const open = (fixed, id) => fixed.slips.find(s => s.id === id);

// What the first version of the repair did: both rebuilt, both staked again.
const dodgers = { id: 'fut|ws|Los Angeles Dodgers', kind: 'future', team: 'Los Angeles Dodgers', odds: 2.5, result: null };
const wrong = {
  ...lost,
  ledger: [...lost.ledger, { id: 'restake-thu', t: '2026-09-28T01:00:00.000Z', kind: 'stake', amount: -2000, slipId: 'thu' }, { id: 'restake-sat', t: '2026-09-28T01:00:00.000Z', kind: 'stake', amount: -2000, slipId: 'sat' }],
  slips: lost.slips.map(s => ({ id: s.id, t: s.t, mode: 'single', sizes: [1], stake: 2000, cost: 2000, legs: [dodgers], status: 'open' }))
};

test('only the Saturday slip comes back as the Dodgers bet', () => {
  const fixed = restoreDodgersSlip(lost, ID);
  assert.equal(open(fixed, 'sat').status, 'open');
  assert.equal(open(fixed, 'sat').legs[0].team, 'Los Angeles Dodgers');
  assert.equal(open(fixed, 'sat').legs[0].odds, 2.44);
  assert.equal(open(fixed, 'thu').recovered, true);
  assert.equal(balance(fixed), 8000);
  assert.equal(restoreDodgersSlip(fixed, ID), fixed);
  assert.equal(open(refundLost(fixed, new Date('2026-10-05')), 'sat').status, 'open');
});

test('the first version’s extra slip is put back and its stake returned', () => {
  const fixed = restoreDodgersSlip(wrong, ID);
  assert.equal(open(fixed, 'sat').status, 'open');
  assert.equal(open(fixed, 'thu').status, 'settled');
  assert.equal(open(fixed, 'thu').refunded, true);
  assert.equal(balance(fixed), 8000);
  assert.equal(restoreDodgersSlip(fixed, ID), fixed);
  // A device still holding the wrong copy doesn't bring it back.
  for (const merged of [mergeAccounts(wrong, fixed), mergeAccounts(fixed, wrong)]) {
    const again = restoreDodgersSlip(merged, ID);
    assert.equal(open(again, 'thu').status, 'settled');
    assert.equal(open(again, 'sat').status, 'open');
    assert.equal(balance(again), 8000);
  }
});

test('other accounts are left alone', () => {
  assert.equal(restoreDodgersSlip(lost, 'ffffffffffffffff'), lost);
});
