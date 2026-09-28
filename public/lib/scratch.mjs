// 刮刮樂: six instant scratch cards in the style of Taiwan Lottery's, played
// with Quadra money. What a card wins is fixed the moment it's bought (the
// device's crypto random number, by the card's prize table, like a printed
// run of tickets); scratching only reveals it. The card's face is then laid
// out to show exactly that result, the way its game reads.
//
// Each table pays back about 58-65% of what's spent, like the real ones,
// with the top prize at 10,000 times the price.
import { randomInt } from './lottery.mjs';

// Prize tiers as multiples of the price and their odds (1 in N tickets).
const TABLE = [
  [1, 6],
  [2, 12],
  [5, 40],
  [10, 150],
  [20, 600],
  [100, 10_000],
  [1_000, 250_000],
  [10_000, 2_000_000]
];

export const CARDS = {
  lucky7: { zh: '幸運7', en: 'Lucky 7', price: 100, color: '#dc2626', layout: 'symbol', symbol: '7', spots: 6, how: { zh: '刮出「7」就贏得它下面的獎金。', en: 'Uncover a 7 to win the prize under it.' } },
  triple: { zh: '三個一樣', en: 'Match 3', price: 200, color: '#d97706', layout: 'match3', how: { zh: '刮出三個相同金額，就贏得該金額。', en: 'Uncover three of the same amount to win it.' } },
  numbers: { zh: '對中發財', en: 'Lucky Numbers', price: 300, color: '#059669', layout: 'numbers', winning: 3, yours: 10, how: { zh: '「你的號碼」和「中獎號碼」任一相同，就贏得旁邊的獎金。', en: 'Any of your numbers matching a winning number wins the prize beside it.' } },
  bingo: { zh: '賓果連線', en: 'Bingo Line', price: 500, color: '#7c3aed', layout: 'bingo', how: { zh: '開出的號碼在卡上連成一線（橫、直、斜），就贏得該線的獎金。', en: 'Called numbers making a line (across, down or diagonal) win that line’s prize.' } },
  gold: { zh: '金幣翻倍', en: 'Golden Coins', price: 1000, color: '#ca8a04', layout: 'symbol', symbol: '💰', spots: 10, multiplier: true, how: { zh: '刮出💰贏得它的獎金，再乘上左上角的倍數。', en: 'Each 💰 wins its prize, times the multiplier in the corner.' } },
  million: { zh: '億萬富翁', en: 'Millionaire', price: 2000, color: '#0f172a', layout: 'numbers', winning: 5, yours: 20, how: { zh: '「你的號碼」和「中獎號碼」任一相同，就贏得旁邊的獎金。頭獎 2,000 萬。', en: 'Match any winning number to win the prize beside it. Top prize NT$20 million.' } }
};
export const CARD_ORDER = ['lucky7', 'triple', 'numbers', 'bingo', 'gold', 'million'];

export const tiersOf = id => TABLE.map(([mult, odds]) => ({ prize: mult * CARDS[id].price, odds }));
export const topPrize = id => TABLE.at(-1)[0] * CARDS[id].price;
export const expectedReturn = id => tiersOf(id).reduce((s, t) => s + t.prize / t.odds, 0) / CARDS[id].price;

// The prize a new card holds: one uniform draw against the table.
export function drawPrize(id, rand = Math.random) {
  let r = rand();
  for (const t of tiersOf(id)) {
    if (r < 1 / t.odds) return t.prize;
    r -= 1 / t.odds;
  }
  return 0;
}
const cryptoRand = () => randomInt(2 ** 30) / 2 ** 30;

// A small seeded generator, so a card's face is the same every time it's drawn.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOf = (rand, list) => list[Math.floor(rand() * list.length)];
const shuffle = (rand, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// The amounts a face shows (losing ones as decoys too).
const amounts = id => [...new Set(tiersOf(id).map(t => t.prize))];

// Splits a prize into up to `n` shown amounts that add up to it.
function split(rand, prize, list, n) {
  const parts = [];
  let left = prize;
  const usable = list.filter(a => a <= prize).sort((a, b) => b - a);
  while (left > 0 && parts.length < n - 1 && rand() < 0.45) {
    const a = usable.find(x => x < left && rand() < 0.7);
    if (!a) break;
    parts.push(a);
    left -= a;
  }
  parts.push(left);
  return parts;
}

// The card's face for its prize: what's under the scratch-off.
export function face(id, prize, seed) {
  const c = CARDS[id];
  const rand = seeded(seed);
  const list = amounts(id);
  if (c.layout === 'symbol') {
    const decoys = c.symbol === '7' ? ['🍒', '🔔', '🍋', '⭐', '🍀', '💎'] : ['🪙', '💎', '👑', '🏆', '⭐', '🍀'];
    let mult = 1;
    let base = prize;
    if (c.multiplier && prize) {
      const options = [1, 2, 5, 10].filter(m => prize % m === 0 && list.some(a => a <= prize / m));
      mult = pickOf(rand, options);
      base = prize / mult;
    } else if (c.multiplier) mult = pickOf(rand, [1, 2, 5, 10]);
    const wins = prize ? split(rand, base, list, 3) : [];
    const spots = [...wins.map(a => ({ s: c.symbol, a, win: true }))];
    while (spots.length < c.spots) spots.push({ s: pickOf(rand, decoys), a: pickOf(rand, list), win: false });
    return { kind: 'symbol', mult: c.multiplier ? mult : null, spots: shuffle(rand, spots) };
  }
  if (c.layout === 'match3') {
    // Nine amounts; the prize three times, nothing else three times.
    const cells = prize ? [prize, prize, prize] : [];
    const counts = new Map(cells.length ? [[prize, 3]] : []);
    while (cells.length < 9) {
      const a = pickOf(rand, list);
      if ((counts.get(a) || 0) >= 2) continue;
      counts.set(a, (counts.get(a) || 0) + 1);
      cells.push(a);
    }
    return { kind: 'match3', cells: shuffle(rand, cells) };
  }
  if (c.layout === 'numbers') {
    const pool = shuffle(rand, Array.from({ length: 60 }, (_, i) => i + 1));
    const winning = pool.slice(0, c.winning);
    const others = pool.slice(c.winning);
    const wins = prize ? split(rand, prize, list, 3) : [];
    const yours = wins.map((a, i) => ({ n: winning[i % winning.length], a, win: true }));
    let k = 0;
    while (yours.length < c.yours) yours.push({ n: others[k++], a: pickOf(rand, list), win: false });
    return { kind: 'numbers', winning, yours: shuffle(rand, yours) };
  }
  if (c.layout === 'bingo') {
    // A 5×5 card of 1-75 (free centre), 24 called numbers; the prize's line
    // complete (a row, a column or a diagonal) and no other.
    const cols = [0, 1, 2, 3, 4].map(col => shuffle(rand, Array.from({ length: 15 }, (_, i) => col * 15 + i + 1)).slice(0, 5));
    const grid = Array.from({ length: 5 }, (_, r) => cols.map(col => col[r]));
    grid[2][2] = 0;
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(grid[i].map((_, j) => [i, j]), grid.map((_, j) => [j, i]));
    lines.push([0, 1, 2, 3, 4].map(i => [i, i]), [0, 1, 2, 3, 4].map(i => [i, 4 - i]));
    const complete = called => lines.filter(line => line.every(([r, c2]) => !grid[r][c2] || called.has(grid[r][c2])));
    for (let attempt = 0; attempt < 400; attempt++) {
      const called = new Set();
      let line = null;
      if (prize) {
        line = pickOf(rand, lines);
        for (const [r, c2] of line) if (grid[r][c2]) called.add(grid[r][c2]);
      }
      const all = shuffle(rand, Array.from({ length: 75 }, (_, i) => i + 1));
      for (const n of all) {
        if (called.size >= 24) break;
        if (called.has(n)) continue;
        called.add(n);
        if (complete(called).length > (prize ? 1 : 0)) called.delete(n);
      }
      if (called.size === 24 && complete(called).length === (prize ? 1 : 0)) return { kind: 'bingo', grid, called: shuffle(rand, [...called]), line, prize };
    }
    return { kind: 'bingo', grid, called: [], line: null, prize };
  }
  return null;
}

// What a face pays, read from the face alone (the tests check it equals the
// prize the card was bought with).
export function facePays(id, f) {
  if (f.kind === 'symbol') return f.spots.filter(s => s.win).reduce((s, x) => s + x.a, 0) * (f.mult || 1);
  if (f.kind === 'match3') {
    const counts = new Map();
    for (const a of f.cells) counts.set(a, (counts.get(a) || 0) + 1);
    return [...counts].filter(([, n]) => n >= 3).reduce((s, [a]) => s + a, 0);
  }
  if (f.kind === 'numbers') return f.yours.filter(y => f.winning.includes(y.n)).reduce((s, y) => s + y.a, 0);
  if (f.kind === 'bingo') return f.line ? f.prize : 0;
  return 0;
}

// Buying: the cost now; the prize goes in once it's scratched (revealScratch).
export function buyScratch(account, { id, card }, now = new Date(), { extra = 0, rand = cryptoRand, seed = randomInt(2 ** 31) } = {}) {
  const c = CARDS[card];
  if (!c) return { error: 'game' };
  const own = account.ledger.reduce((s, e) => s + e.amount, 0);
  if (c.price > own + extra) return { error: 'funds' };
  const t = now.toISOString();
  const ticket = { id, t, game: `scratch:${card}`, card, cost: c.price, prize: drawPrize(card, rand), seed, status: 'open' };
  return { account: { ...account, updated: t, ledger: [...account.ledger, { id: `lotto-${id}`, t, kind: 'lottery', amount: -c.price }], tickets: [ticket, ...(account.tickets || [])] }, ticket };
}

// Scratched: the prize paid in (taxed like any lottery prize over NT$5,000).
export function revealScratch(account, ticketId, now = new Date()) {
  const ticket = (account.tickets || []).find(x => x.id === ticketId);
  if (!ticket || ticket.status !== 'open' || !ticket.card) return account;
  const net = ticket.prize > 5_000 ? Math.round(ticket.prize * 0.796) : ticket.prize;
  const t = now.toISOString();
  const ledger = net > 0 && !account.ledger.some(e => e.id === `prize-${ticketId}`) ? [...account.ledger, { id: `prize-${ticketId}`, t, kind: 'prize', amount: net }] : account.ledger;
  return { ...account, updated: t, ledger, tickets: account.tickets.map(x => (x.id === ticketId ? { ...x, status: 'settled', gross: x.prize, prize: net, settledAt: t } : x)) };
}
