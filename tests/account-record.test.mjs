import test from 'node:test';
import assert from 'node:assert/strict';
import { accountRecord } from '../public/lib/history.mjs';

test("the account card counts bets and lottery tickets together; nothing decided yet is said, not NT$0 and —", () => {
  const slip = (id, status, cost, payout = 0) => ({ id, status, cost, payout, legs: [] });
  const ticket = (id, status, cost, prize = 0) => ({ id, status, cost, prize });
  // The owner's: one bet riding, a lottery prize of NT$148 from NT$100 of tickets.
  const a = {
    slips: [slip('s1', 'open', 800)],
    tickets: [ticket('t1', 'settled', 50, 148), ticket('t2', 'settled', 50), ticket('t3', 'open', 50)],
    ledger: [{ kind: 'prize', amount: 148 }]
  };
  assert.deepEqual(accountRecord(a), { open: 850, openCount: 2, won: 148, decided: 2, net: 48, back: 148 });
  // Losses shown as they are.
  const b = { slips: [slip('s1', 'settled', 200, 0), slip('s2', 'settled', 100, 150)], tickets: [], ledger: [{ kind: 'payout', amount: 150 }] };
  assert.deepEqual([accountRecord(b).net, accountRecord(b).back], [-150, 50]);
  // Nothing decided: null, not 0.
  const c = { slips: [slip('s1', 'open', 100)], ledger: [] };
  assert.deepEqual([accountRecord(c).net, accountRecord(c).back, accountRecord(c).decided], [null, null, 0]);
});
