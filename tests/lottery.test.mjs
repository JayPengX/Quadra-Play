import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAMES, GAME_ORDER, nextDraw, ticketPrize, expectedReturn, parseDraw, parseBingo, houseDraw, buyTicket, settleTicket, checkSelection, betCount, boxWays, HOUSE_SLOT, dueTickets } from '../public/lib/lottery.mjs';
import { newAccount, balance, mergeAccounts } from '../public/lib/account.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/lottery-api/${name}.json`, import.meta.url)));
const first = (name, list) => fixture(name).content[list][0];

test('eleven computer-drawn games', () => {
  assert.equal(GAME_ORDER.length, 11);
  for (const id of GAME_ORDER) assert.ok(GAMES[id], id);
});

test('draw times: evening draws on their days, closing 30 minutes before; BINGO every 5 minutes', () => {
  // Monday 2026-09-28 10:00 Taipei.
  const mon = Date.parse('2026-09-28T10:00:00+08:00');
  assert.equal(nextDraw('super638', mon).date, '2026-09-28');
  assert.equal(nextDraw('lotto649', mon).date, '2026-09-29');
  // After 20:00 the evening draw is closed: the next one.
  assert.equal(nextDraw('daily539', Date.parse('2026-09-28T20:10:00+08:00')).date, '2026-09-29');
  // Saturday evening: 539's next draw is Monday (no Sunday draw).
  assert.equal(nextDraw('daily539', Date.parse('2026-10-03T21:00:00+08:00')).date, '2026-10-05');
  const b = nextDraw('bingo', mon);
  assert.equal(b.date, '2026-09-28');
  assert.equal(new Date(b.at).toISOString(), '2026-09-28T02:05:00.000Z');
  // Night: the first draw tomorrow at 07:05.
  const night = nextDraw('bingo', Date.parse('2026-09-28T23:58:00+08:00'));
  assert.equal(night.date, '2026-09-29');
  assert.equal(night.slot, 0);
  assert.equal(HOUSE_SLOT, 161);
});

test('威力彩 prizes from a real draw, pool tiers from what it paid', () => {
  const draw = parseDraw('super638', first('super638', 'superLotto638Res'));
  assert.deepEqual(draw.numbers, [3, 8, 25, 27, 30, 31]);
  assert.equal(draw.zone2, 1);
  const ticket = (a, z) => ({ game: 'super638', sel: { zones: [a, [z]] } });
  assert.equal(ticketPrize(ticket([3, 8, 25, 27, 30, 1], 1), draw).prize, 150_000);
  assert.equal(ticketPrize(ticket([3, 8, 25, 2, 4, 6], 1), draw).prize, 400);
  assert.equal(ticketPrize(ticket([3, 10, 11, 12, 13, 14], 1), draw).prize, 100);
  assert.equal(ticketPrize(ticket([10, 11, 12, 13, 14, 15], 2), draw).prize, 0);
  // Nobody won the jackpot: the whole pool.
  const jp = ticketPrize(ticket([3, 8, 25, 27, 30, 31], 1), draw);
  assert.equal(jp.tier, 'jackpot');
  assert.ok(jp.prize > 50_000_000);
});

test('大樂透 with its special number; 今彩539', () => {
  const draw = parseDraw('lotto649', first('lotto649', 'lotto649Res'));
  assert.equal(draw.special, 40);
  const t = n => ({ game: 'lotto649', sel: { zones: [n] } });
  assert.equal(ticketPrize(t([5, 13, 24, 1, 2, 40]), draw).prize, 1_000);
  assert.equal(ticketPrize(t([5, 13, 24, 1, 2, 3]), draw).prize, 400);
  assert.equal(ticketPrize(t([5, 13, 24, 25, 2, 3]), draw).prize, 2_000);
  const d539 = parseDraw('daily539', first('daily539', 'daily539Res'));
  assert.equal(ticketPrize({ game: 'daily539', sel: { zones: [[17, 18, 30, 1, 2]] } }, d539).prize, 300);
});

test('3星彩 and 4星彩: straight, box and pair', () => {
  const d3 = parseDraw('star3', first('3d', 'lotto3DRes'));
  assert.deepEqual(d3.digits, [3, 5, 9]);
  const t = (digits, play) => ({ game: 'star3', sel: { digits, play } });
  assert.equal(ticketPrize(t([3, 5, 9], 'straight'), d3).prize, 12_500);
  assert.equal(ticketPrize(t([9, 3, 5], 'box'), d3).prize, 2_000);
  assert.equal(ticketPrize(t([0, 5, 9], 'pair'), d3).prize, 1_250);
  const d4 = parseDraw('star4', first('4d', 'lotto4DRes'));
  assert.equal(ticketPrize({ game: 'star4', sel: { digits: [7, 7, 4, 1], play: 'box' } }, d4).prize, 10_000);
  assert.equal(boxWays([7, 7, 4, 1]), 12);
  assert.equal(checkSelection('star3', { digits: [1, 1, 1], play: 'box' }).error, 'boxSame');
});

test('樂合彩: every combination is a bet, each inside the draw wins', () => {
  const draw = parseDraw('lotto649', first('lotto649', 'lotto649Res'));
  const sel = { numbers: [5, 13, 24, 1], size: 2 };
  assert.equal(betCount('m49', sel), 6);
  // 3 of the 4 are drawn: C(3,2) = 3 winning pairs.
  assert.equal(ticketPrize({ game: 'm49', sel }, draw).prize, 3 * 1_250);
});

test('BINGO BINGO from a real day of draws', () => {
  const list = fixture('bingo').content.bingoQueryResult.sort((a, b) => a.drawTerm - b.drawTerm);
  assert.equal(list.length, 203);
  const draw = parseBingo(list.at(-1));
  assert.equal(draw.numbers.length, 20);
  assert.equal(draw.bull, 62);
  const t = numbers => ({ game: 'bingo', sel: { numbers } });
  assert.equal(ticketPrize(t([17]), draw).prize, 50);
  assert.equal(ticketPrize(t([17, 9, 80]), draw).prize, 25 * 20);
  assert.equal(ticketPrize({ game: 'bingo', sel: { side: 'bullseye', bull: 62 } }, draw).prize, 25 * 48);
});

test('house draws are fixed by the BINGO draw they come from', async () => {
  const list = fixture('bingo').content.bingoQueryResult.sort((a, b) => a.drawTerm - b.drawTerm);
  const b = parseBingo(list[HOUSE_SLOT]);
  const a1 = await houseDraw('lotto1224', b);
  const a2 = await houseDraw('lotto1224', b);
  assert.deepEqual(a1, a2);
  assert.equal(new Set(a1.numbers).size, 12);
  assert.ok(a1.numbers.every(n => n >= 1 && n <= 24));
  const other = await houseDraw('lotto1224', parseBingo(list[HOUSE_SLOT + 1]));
  assert.notDeepEqual(other.numbers, a1.numbers);
  assert.equal((await houseDraw('lotto740', b)).numbers.length, 7);
});

test('fixed-prize tables pay back like a real lottery (40-80% of spend)', () => {
  const checks = [
    ['daily539'], ['lotto740'], ['lotto1224'], ['m38', { size: 2 }], ['m38', { size: 3 }], ['m39', { size: 2 }], ['m39', { size: 4 }], ['m49', { size: 2 }], ['m49', { size: 4 }],
    ['star3', { play: 'straight' }], ['star3', { play: 'box', ways: 6 }], ['star3', { play: 'box', ways: 3 }], ['star3', { play: 'pair' }], ['star4', { play: 'straight' }], ['star4', { play: 'box', ways: 24 }]
  ];
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) checks.push(['bingo', { stars: s }]);
  for (const [id, extra] of checks) {
    const r = expectedReturn(id, extra);
    // 大福彩's real table with its 頭獎 at the guaranteed NT$1億 (a rolling
    // pool made it more in life, and Play has none): about 30%.
    const low = id === 'lotto740' ? 0.25 : 0.4;
    assert.ok(r > low && r < 0.8, `${id} ${JSON.stringify(extra || {})}: ${r.toFixed(3)}`);
  }
});

test('buying and settling: the cost now, the prize (taxed over NT$5,000) at the draw, merged like slips', () => {
  const now = new Date('2026-09-28T10:00:00+08:00');
  let account = newAccount(now);
  const bought = buyTicket(account, { id: 'a', game: 'daily539', sel: { zones: [[17, 18, 30, 34, 1]] } }, now);
  account = bought.account;
  assert.equal(balance(account), 10_000 - 50);
  assert.equal(dueTickets(account, now.getTime()).length, 0);
  const later = new Date('2026-09-28T21:00:00+08:00');
  assert.equal(dueTickets(account, later.getTime()).length, 1);
  const draw = { numbers: [17, 18, 30, 34, 39] };
  const settled = settleTicket(account, 'a', draw, later);
  assert.equal(settled.tickets[0].prize, Math.round(20_000 * 0.796));
  assert.equal(balance(settled), 10_000 - 50 + Math.round(20_000 * 0.796));
  // A device that still has it open: the settled copy wins, paid once.
  const merged = mergeAccounts(account, settled);
  assert.equal(merged.tickets[0].status, 'settled');
  assert.equal(balance(merged), balance(settled));
  assert.equal(buyTicket(newAccount(now, { start: false }), { id: 'b', game: 'super638', sel: { zones: [[1, 2, 3, 4, 5, 6], [1]] } }, now).error, 'funds');
  // Pool money from the other apps counts.
  assert.ok(buyTicket(newAccount(now, { start: false }), { id: 'b', game: 'super638', sel: { zones: [[1, 2, 3, 4, 5, 6], [1]] } }, now, { extra: 500 }).account);
});
