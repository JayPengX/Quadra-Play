// The simulated betting account: play money only. It starts with NT$10,000,
// gets ECONOMY.oddsWeekly (NT$500) once a week when the app is opened (Taiwan time, weeks from
// Monday; it was NT$5,000 before the Quadra money pool), and buys
// saved slips at the lottery's own prices; once every game on a slip is over,
// the slip pays out like a real ticket (tax and payout cap included).
//
// The balance is never stored: it's the sum of a ledger of entries with fixed
// ids ('start', 'grant-<Monday>', 'stake-<slip>', 'payout-<slip>'), so two
// devices' copies merge by taking the union, and nothing counts twice.
import { settleSlip } from './odds.mjs';
import { mergeTickets } from './lottery.mjs';
import { taipeiDayKey } from './sources.mjs';
import { isSoccer, f1Driver } from './teams.mjs';

// What Play itself gave before Quadra paid into the pool (from the week of
// 2026-10-05, GRANTS_UNTIL_WEEK, Quadra pays the week, whichever app is
// opened; a pass made since then gets its opening money from Quadra).
export const START_BALANCE = 10_000;
export const WEEKLY_GRANT = 500;
// Play's own weekly grants ended with the week of 2026-09-28: Quadra's
// monthly payday is the one income.
export const GRANTS_UNTIL_WEEK = '2026-09-28';

// start: false for an account funded by the Quadra pool alone.
export function newAccount(now = new Date(), { start = true } = {}) {
  const t = now.toISOString();
  return { v: 1, created: t, updated: t, ledger: start ? [{ id: 'start', t, kind: 'start', amount: START_BALANCE }] : [], slips: [] };
}

export function balance(account) {
  return account.ledger.reduce((sum, entry) => sum + entry.amount, 0);
}

// Monday (YYYY-MM-DD) of the Taiwan week a moment falls in.
export function weekKey(now) {
  const d = new Date(`${taipeiDayKey(now)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// The next Monday 00:00 Taiwan time after `now`.
export function nextGrantAt(now) {
  const monday = new Date(`${weekKey(now)}T00:00:00+08:00`);
  return new Date(monday.getTime() + 7 * 86_400_000);
}

// A new account starts with its NT$10,000; the weekly NT$5,000 is there from
// the next week on, once a week, and doesn't pile up over skipped weeks.
export function canClaim(account, now = new Date()) {
  const week = weekKey(now);
  if (week >= GRANTS_UNTIL_WEEK) return false;
  return weekKey(new Date(account.created)) !== week && !account.ledger.some(e => e.id === `grant-${week}`);
}

function touched(account, now) {
  return { ...account, updated: now.toISOString() };
}

export function claimGrant(account, now = new Date()) {
  if (!canClaim(account, now)) return account;
  const entry = { id: `grant-${weekKey(now)}`, t: now.toISOString(), kind: 'grant', amount: WEEKLY_GRANT };
  return touched({ ...account, ledger: [...account.ledger, entry] }, now);
}

export function newSlipId(now = new Date()) {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${now.getTime().toString(36)}${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

// Buys a slip: { id, mode, sizes, stake, cost, legs }. The cost comes off the
// balance at once. Returns { account } or { error: 'funds' }.
// A pick as saved: empty fields left out, so years of slips stay small.
export function compactLeg(leg) {
  return Object.fromEntries(Object.entries(leg).filter(([key, v]) => v != null || key === 'result'));
}

// Every saved pick compacted (older accounts saved empty fields too).
export function compactAccount(account) {
  return { ...account, slips: account.slips.map(slip => ({ ...slip, legs: slip.legs.map(compactLeg) })) };
}

// Staked in the Taiwan week `now` falls in.
export function stakedThisWeek(account, now = new Date()) {
  const week = weekKey(now);
  return 0 - account.ledger.filter(e => e.kind === 'stake' && weekKey(new Date(e.t)) === week).reduce((sum, e) => sum + e.amount, 0);
}

// `extra`: money in the shared Quadra pool beyond this account's own ledger
// (Securities' cash, the pay), spendable here too.
// Returns { account } or { error: 'funds' }.
export function placeSlip(account, slip, now = new Date(), { extra = 0 } = {}) {
  if (!(slip.cost > 0) || slip.cost > balance(account) + extra) return { error: 'funds' };
  const t = now.toISOString();
  const saved = { ...slip, t, status: 'open', legs: slip.legs.map(leg => compactLeg({ ...leg, result: null })) };
  const entry = { id: `stake-${slip.id}`, t, kind: 'stake', amount: -slip.cost, slipId: slip.id };
  return { account: touched({ ...account, ledger: [...account.ledger, entry], slips: [saved, ...account.slips] }, now) };
}

// Buys a slip with a free bet (Plus's weekly bonus bet or the welcome offer, kit freeBets): the token's
// value is (part of) the stake; only a top-up beyond it comes off the
// balance, and the token is marked spent ('fb-<token id>', so the same token
// is never staked twice). Winning pays all but the free part's stake
// (applyResults): a top-up's stake comes back as usual.
// Like a sportsbook's free bet terms: odds of FREE_MIN_ODDS or longer (no
// near-certain bet) — a single's pick, a parlay's odds all together (a
// recommended parlay with a 1.43 in it still qualifies) — and never cashed
// out early.
export const FREE_MIN_ODDS = 1.5;
export const freeOddsOk = legs => legs.length > 0 && legs.reduce((x, l) => x * Number(l.odds), 1) >= FREE_MIN_ODDS - 1e-9;
export function placeFreeSlip(account, slip, token, now = new Date(), { extra = 0 } = {}) {
  if (!token?.id || !(token.value > 0) || account.ledger.some(e => e.id === `fb-${token.id}`)) return { error: 'token' };
  if (!freeOddsOk(slip.legs || [])) return { error: 'freeOdds' };
  // More than the free bet on it: the rest from the balance (the free bet
  // a cut off the stake).
  const cash = Math.max(0, Math.round((Number(slip.stake) || 0) - token.value));
  if (cash > 0 && cash > balance(account) + extra) return { error: 'funds' };
  const t = now.toISOString();
  const saved = { ...slip, stake: token.value + cash, cost: cash, free: token.id, freeValue: token.value, t, status: 'open', legs: slip.legs.map(leg => compactLeg({ ...leg, result: null })) };
  const entries = [
    { id: `stake-${slip.id}`, t, kind: 'stake', amount: -cash, slipId: slip.id },
    { id: `fb-${token.id}`, t, kind: 'freebet', amount: 0, slipId: slip.id }
  ];
  return { account: touched({ ...account, ledger: [...account.ledger, ...entries], slips: [saved, ...account.slips] }, now) };
}

const norm = name =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Top-scoring inning: 0-8 for innings 1-9, 9 for a tie for the most. Extra
// innings don't count; an inning a team didn't bat counts as 0.
export function topInning(awayInnings, homeInnings) {
  const runs = Array.from({ length: 9 }, (_, i) => (Number(awayInnings[i]) || 0) + (Number(homeInnings[i]) || 0));
  const most = Math.max(...runs);
  const at = runs.flatMap((r, i) => (r === most ? [i] : []));
  return at.length === 1 ? at[0] : 9;
}

// 'won', 'lost' or 'void' for one leg from its game's (or race's, or
// championship's) outcome; null while it isn't decided.
// outcome: { status: 'final' | 'void' | 'pending', awayScore, homeScore,
// awayInnings, homeInnings } for a game, { status, winner } otherwise.
export function legResult(leg, outcome) {
  if (!outcome || outcome.status === 'pending') return null;
  if (outcome.status === 'void') return 'void';
  const win = test => (test ? 'won' : 'lost');
  if (leg.kind === 'f1') return win(norm(outcome.winner) === norm(leg.driver));
  if (leg.kind === 'f1pole') return outcome.pole ? win(norm(outcome.pole) === norm(leg.driver)) : null;
  if (leg.kind === 'future') return win(norm(outcome.winner) === norm(leg.team));
  if (leg.kind === 'f1podium') return outcome.podium ? win(outcome.podium.some(name => norm(name) === norm(leg.driver))) : null;
  if (leg.kind === 'f1top6' || leg.kind === 'f1top10' || leg.kind === 'f1h2h') {
    if (!outcome.order) return null;
    const at = name => {
      const i = outcome.order.findIndex(x => norm(x) === norm(name));
      return i < 0 ? Infinity : i;
    };
    if (leg.kind === 'f1h2h') {
      // The rival from the pick's id (f1h2h|driver|rival) where it wasn't kept.
      const rival = leg.rival ?? String(leg.id || '').split('|')[2];
      if (!rival) return null;
      return at(leg.driver) === at(rival) ? 'void' : win(at(leg.driver) < at(rival));
    }
    return win(at(leg.driver) < (leg.kind === 'f1top6' ? 6 : 10));
  }
  // Safety car, VSC, red flag: whether it happened, against the pick (yes / no).
  if (leg.kind === 'f1sc' || leg.kind === 'f1vsc' || leg.kind === 'f1red') {
    const happened = outcome.flags?.[leg.kind.slice(2)];
    return typeof happened === 'boolean' ? win(happened === (leg.pick === 'yes')) : null;
  }
  if (leg.kind === 'f1team') return win(norm(f1Driver(outcome.winner).team) === norm(leg.team));
  const away = Number(outcome.awayScore);
  const home = Number(outcome.homeScore);
  if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
  const push = diff => (diff === 0 ? 'void' : win(diff > 0));
  switch (leg.kind) {
    case 'ml':
      return win(leg.side === 'draw' ? away === home : leg.side === 'away' ? away > home : home > away);
    case 'total':
      return push(leg.side === 'over' ? away + home - leg.line : leg.line - away - home);
    case 'runline':
      return push(leg.side === 'away' ? away + leg.line - home : home + leg.line - away);
    case 'teamtotal': {
      const runs = leg.team === 'away' ? away : home;
      return push(leg.side === 'over' ? runs - leg.line : leg.line - runs);
    }
    case 'oddeven':
      return win((away + home) % 2 === (leg.side === 'odd' ? 1 : 0));
    case 'btts':
      return win((away > 0 && home > 0) === (leg.side === 'yes'));
    case 'margin': {
      // The picked team winning by lo to hi (no upper end when hi is null).
      const m = leg.team === 'home' ? home - away : away - home;
      return win(m >= leg.lo && (leg.hi == null || m <= leg.hi));
    }
    case 'score': {
      // Correct score, written home-away; 'other' is any score not listed.
      const final = `${home}-${away}`;
      return win(leg.score === 'other' ? !(leg.listed || []).includes(final) : leg.score === final);
    }
    case 'htft': {
      // Half-time and full-time results, both right.
      const a = outcome.awayInnings || [];
      const h = outcome.homeInnings || [];
      if (!a.length && !h.length) return null;
      const res = (x, y) => (y > x ? 'home' : y === x ? 'draw' : 'away');
      return win(res(Number(a[0]) || 0, Number(h[0]) || 0) === leg.ht && res(away, home) === leg.ft);
    }
    case 'dc':
      // Double chance: either of two results.
      return win(leg.side.split('|').includes(away > home ? 'away' : away === home ? 'draw' : 'home'));
    case 'htotal': {
      // First-half total: one soccer half, two quarters.
      const a = outcome.awayInnings || [];
      const h = outcome.homeInnings || [];
      if (!a.length && !h.length) return null;
      const periods = leg.sport && isSoccer(leg.sport) ? 1 : 2;
      const sum = list => list.slice(0, periods).reduce((s, x) => s + (Number(x) || 0), 0);
      const pts = sum(a) + sum(h);
      return push(leg.side === 'over' ? pts - leg.line : leg.line - pts);
    }
    case 'f5total': {
      // Runs in the first five innings.
      const a = outcome.awayInnings || [];
      const h = outcome.homeInnings || [];
      // A final shorter than five innings (called off early): the stake back.
      if (a.length < 5 || h.length < 5) return outcome.status === 'final' ? 'void' : null;
      const runs = [...a.slice(0, 5), ...h.slice(0, 5)].reduce((s, x) => s + (Number(x) || 0), 0);
      return push(leg.side === 'over' ? runs - leg.line : leg.line - runs);
    }
    case 'goalbands':
      return win(away + home >= leg.lo && (leg.hi == null || away + home <= leg.hi));
    case 'q1':
    case 'half':
    case 'f5':
    case 'regulation': {
      // Part of the game, from the period scores: the first half (one soccer
      // half, two quarters), the first five innings, or hockey's three periods.
      const periods = leg.kind === 'f5' ? 5 : leg.kind === 'regulation' ? 3 : leg.kind === 'q1' || (leg.sport && isSoccer(leg.sport)) ? 1 : 2;
      const a = outcome.awayInnings || [];
      const h = outcome.homeInnings || [];
      if (!a.length && !h.length) return null;
      const sum = list => list.slice(0, periods).reduce((s, x) => s + (Number(x) || 0), 0);
      const pa = sum(a);
      const ph = sum(h);
      return win(leg.side === 'draw' ? pa === ph : leg.side === 'away' ? pa > ph : ph > pa);
    }
    case 'firstinning': {
      if (!outcome.awayInnings?.length) return null;
      const runs = (Number(outcome.awayInnings[0]) || 0) + (Number(outcome.homeInnings?.[0]) || 0);
      return win((runs > 0) === (leg.side === 'yes'));
    }
    case 'nextrun': {
      // The game's Nth run: whose it was, or no one's if the game ended first.
      if (!outcome.runOrder) return null;
      return win(leg.side === (outcome.runOrder[leg.line - 1] ?? 'none'));
    }
    case 'inning':
      if (!outcome.awayInnings?.length) return null;
      return win(topInning(outcome.awayInnings, outcome.homeInnings || []) === leg.inning);
    default:
      return null;
  }
}

// Records leg results (one per leg, null if not known yet); once every leg
// is decided the slip is settled and its payout (after tax) is paid in.
// `finals` (optional, one per leg): the final score to keep with a pick as it
// is decided, { away, home } (and each set's score), so a slip's history
// never depends on the sources keeping old games.
export function applyResults(account, slipId, results, now = new Date(), finals = []) {
  const slip = account.slips.find(s => s.id === slipId);
  if (!slip || slip.status !== 'open') return account;
  const legs = slip.legs.map((leg, i) => {
    if (leg.result || !results[i]) return leg;
    return { ...leg, result: results[i], ...(finals[i] ? { final: finals[i] } : {}) };
  });
  if (legs.every((leg, i) => leg.result === slip.legs[i].result)) return account;
  let updated = { ...slip, legs };
  let ledger = account.ledger;
  if (legs.every(leg => leg.result)) {
    const settle = boost => {
      const { gross, net } = settleSlip({ legs, sizes: slip.sizes, stake: slip.stake, boost });
      // A free bet pays what it won, less the stake it never cost.
      return { gross, payout: slip.free ? Math.max(0, Math.round(net) - (slip.freeValue ?? slip.stake)) : Math.round(net) };
    };
    const { gross, payout } = settle(slip.boost ?? 0);
    // What Quadra Plus's bigger parlay boost added (a member's slip keeps
    // boost PLUS.odds.boost) is paid as its own entry ('plus-<slip>', kind
    // 'plusboost'), so the statement and the Plus sheet show what it gave.
    const extra = slip.boost > 1 ? Math.max(0, payout - settle(1).payout) : 0;
    updated = { ...updated, status: 'settled', settledAt: now.toISOString(), gross: Math.round(gross), payout };
    // (A slip refunded while it was lost, then found on another device, has
    // had its cost back already.)
    const refunded = ledger.some(e => e.id === `refund-${slip.id}`) ? slip.cost : 0;
    if (!ledger.some(e => e.id === `payout-${slip.id}`)) {
      ledger = [...ledger, { id: `payout-${slip.id}`, t: now.toISOString(), kind: 'payout', amount: payout - extra - refunded, slipId: slip.id }];
      if (extra) ledger = [...ledger, { id: `plus-${slip.id}`, t: now.toISOString(), kind: 'plusboost', amount: extra, slipId: slip.id }];
    }
  }
  return touched({ ...account, ledger, slips: account.slips.map(s => (s.id === slipId ? updated : s)) }, now);
}

// Cashes out an open slip for `amount` (cashout.mjs prices it): settled at
// once, paid in as its payout (`payout-<slip>`, so a result coming in later
// on another device can never pay it twice). Picks not yet decided stay
// undecided.
export function cashOut(account, slipId, amount, now = new Date()) {
  const slip = account.slips.find(s => s.id === slipId);
  if (!slip || slip.status !== 'open' || slip.recovered || slip.free || !(amount > 0)) return account;
  if (account.ledger.some(e => e.id === `payout-${slip.id}`)) return account;
  const t = now.toISOString();
  const payout = Math.floor(amount);
  const updated = { ...slip, status: 'settled', settledAt: t, cashedOut: true, gross: payout, payout };
  const entry = { id: `payout-${slip.id}`, t, kind: 'cashout', amount: payout, slipId: slip.id };
  return touched({ ...account, ledger: [...account.ledger, entry], slips: account.slips.map(s => (s.id === slipId ? updated : s)) }, now);
}

// Two copies of one account (this device's and the synced one) as one: every
// ledger entry and slip from either, a settled slip over an open one, and
// leg results known on either side.
export function mergeAccounts(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ledger = new Map();
  for (const entry of [...a.ledger, ...b.ledger]) if (!ledger.has(entry.id)) ledger.set(entry.id, entry);
  const slips = new Map();
  for (const slip of [...a.slips, ...b.slips]) {
    const other = slips.get(slip.id);
    if (!other) slips.set(slip.id, slip);
    // A slip recovered from the wallet (no picks) gives way to the real one.
    else if (other.recovered || slip.recovered) {
      if (other.recovered && !slip.recovered) slips.set(slip.id, slip);
    } else if (other.status !== 'settled' && slip.status === 'settled') slips.set(slip.id, slip);
    else if (other.status !== 'settled') slips.set(slip.id, { ...other, legs: other.legs.map((leg, i) => ({ ...leg, result: leg.result ?? slip.legs[i]?.result ?? null, ...(leg.final ?? slip.legs[i]?.final ? { final: leg.final ?? slip.legs[i]?.final } : {}) })) });
  }
  const out = {
    v: 1,
    created: a.created < b.created ? a.created : b.created,
    updated: a.updated > b.updated ? a.updated : b.updated,
    ledger: [...ledger.values()].sort((x, y) => x.t.localeCompare(y.t)),
    slips: [...slips.values()].sort((x, y) => y.t.localeCompare(x.t))
  };
  // Lottery tickets (lottery.mjs): a settled copy wins over an open one.
  if (a.tickets || b.tickets) out.tickets = mergeTickets(a.tickets, b.tickets);
  return out;
}

// Another, separate account folded into this one (the Quadra merge tool):
// both accounts' money and slips, kept apart where their fixed ids ('start',
// 'grant-<Monday>') would collide.
export function mergeDistinct(a, b) {
  if (!a) return b;
  if (!b) return a;
  const tag = `m${Date.parse(b.created).toString(36)}`;
  const have = new Set(a.ledger.map(e => e.id));
  const ledger = b.ledger.map(e => (have.has(e.id) && !/^(stake|payout|refund|plus)-/.test(e.id) ? { ...e, id: `${e.id}-${tag}` } : e));
  return mergeAccounts(a, { ...b, created: a.created, ledger });
}

// The ledger as the shared pool's entries.
export function poolEntries(account) {
  return account.ledger.map(e => ({ id: `odds:${e.id}`, t: Date.parse(e.t), app: 'odds', kind: e.kind, amount: e.amount }));
}

// What the pass's wallet still records of this account that the account
// itself lost (every ledger entry goes to the wallet as `odds:<id>`, and the
// wallet never drops one): the missing ledger entries come back as they
// were, and each bet with no slip left comes back as a recovered slip with
// its cost, time and payout but no picks (`recovered: true`).
export function recoverFromWallet(account, wallet) {
  const mine = (wallet?.entries || []).filter(e => e.app === 'odds' && typeof e.id === 'string' && e.id.startsWith('odds:'));
  const have = new Set(account.ledger.map(e => e.id));
  const ledger = [];
  for (const e of mine) {
    const id = e.id.slice(5);
    if (have.has(id)) continue;
    const entry = { id, t: new Date(e.t).toISOString(), kind: e.kind, amount: e.amount };
    const slipId = /^(?:stake|payout|refund)-(.+)$/.exec(id)?.[1];
    if (slipId) entry.slipId = slipId;
    ledger.push(entry);
  }
  const all = [...account.ledger, ...ledger];
  const slipIds = new Set(account.slips.map(s => s.id));
  const paid = new Map(all.filter(e => (e.kind === 'payout' || e.kind === 'cashout') && e.slipId).map(e => [e.slipId, e]));
  const refunds = new Set(all.filter(e => e.kind === 'refund' && e.slipId).map(e => e.slipId));
  const slips = [];
  for (const e of all) {
    if (e.kind !== 'stake' || !e.slipId || slipIds.has(e.slipId)) continue;
    const payout = paid.get(e.slipId);
    const cost = -e.amount;
    const refunded = !payout && refunds.has(e.slipId);
    slips.push({ id: e.slipId, t: e.t, mode: 'single', sizes: [1], stake: cost, cost, legs: [], status: 'settled', payout: payout ? payout.amount : refunded ? cost : 0, settledAt: payout ? payout.t : e.t, recovered: true, ...(refunded ? { refunded: true } : {}) });
  }
  if (!ledger.length && !slips.length) return account;
  return {
    ...account,
    ledger: all.sort((x, y) => x.t.localeCompare(y.t)),
    slips: [...account.slips, ...slips].sort((x, y) => y.t.localeCompare(x.t))
  };
}

// A recovered bet with no payout on record was never settled: its picks are
// gone, so it can never be. Once it is old enough that no other device can
// still be holding the real slip (REFUND_AFTER_MS), its cost comes back
// (`refund-<slip>`) and it shows as refunded.
export const REFUND_AFTER_MS = 3 * 86_400_000;
export function refundLost(account, now = new Date()) {
  const have = new Set(account.ledger.map(e => e.id));
  const add = [];
  const slips = account.slips.map(slip => {
    if (!slip.recovered || slip.refunded || have.has(`payout-${slip.id}`)) return slip;
    if (now.getTime() - Date.parse(slip.t) < REFUND_AFTER_MS) return slip;
    if (!have.has(`refund-${slip.id}`)) add.push({ id: `refund-${slip.id}`, t: now.toISOString(), kind: 'refund', amount: slip.cost, slipId: slip.id });
    return { ...slip, payout: slip.cost, refunded: true, settledAt: slip.settledAt || now.toISOString() };
  });
  if (!add.length && slips.every((s, i) => s === account.slips[i])) return account;
  return { ...account, ledger: [...account.ledger, ...add].sort((x, y) => x.t.localeCompare(y.t)), slips };
}

// Whether a stored value looks like an account (from storage or the sync).
export function isAccount(value) {
  return Boolean(value && value.v === 1 && Array.isArray(value.ledger) && Array.isArray(value.slips) && typeof value.created === 'string');
}
