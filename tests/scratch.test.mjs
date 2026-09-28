import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_ORDER, tiersOf, expectedReturn, face, facePays, drawPrize, buyScratch, revealScratch, topPrize } from '../public/lib/scratch.mjs';
import { newAccount, balance } from '../public/lib/account.mjs';

test('six scratch cards, each paying back like a real one', () => {
  assert.equal(CARD_ORDER.length, 6);
  for (const id of CARD_ORDER) {
    const r = expectedReturn(id);
    assert.ok(r > 0.55 && r < 0.7, `${id}: ${r}`);
    assert.equal(topPrize(id), CARDS[id].price * 10_000);
  }
});

test('every card face shows exactly the prize it was bought with', () => {
  for (const id of CARD_ORDER) {
    for (const prize of [0, ...tiersOf(id).map(t => t.prize)]) {
      for (let seed = 1; seed <= 25; seed++) {
        const f = face(id, prize, seed * 7919);
        assert.equal(facePays(id, f), prize, `${id} ${prize} seed ${seed}`);
      }
    }
  }
});

test('the prize draw follows the table', () => {
  let n = 0;
  let won = 0;
  let i = 0;
  const rand = () => ((i = (i * 1103515245 + 12345) % 2147483648), i / 2147483648);
  for (; n < 200_000; n++) won += drawPrize('lucky7', rand);
  // The top prizes are too rare to show in 200,000 cards: the rest of the
  // table is what's measured.
  const r = won / n / CARDS.lucky7.price;
  assert.ok(r > 0.4 && r < 0.75, `returned ${r}`);
});

test('buying costs the price; scratching pays the prize once', () => {
  const now = new Date('2026-09-28T10:00:00+08:00');
  const bought = buyScratch(newAccount(now), { id: 's1', card: 'triple' }, now, { rand: () => 0.01, seed: 5 });
  assert.equal(bought.ticket.prize, 200);
  assert.equal(balance(bought.account), 10_000 - 200);
  const shown = revealScratch(bought.account, 's1', now);
  assert.equal(balance(shown), 10_000);
  assert.equal(revealScratch(shown, 's1', now), shown);
  assert.equal(buyScratch(newAccount(now, { start: false }), { id: 's2', card: 'million' }, now).error, 'funds');
});
