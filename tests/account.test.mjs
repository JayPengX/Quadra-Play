import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_BALANCE,
  WEEKLY_GRANT,
  newAccount,
  balance,
  canClaim,
  claimGrant,
  weekKey,
  placeSlip,
  legResult,
  applyResults,
  mergeAccounts,
  topInning,
  placeFreeSlip,
  cashOut,
  liftUsedToday,
  liftFits
} from '../public/lib/account.mjs';
import { settleSlip, slipOutlook, SLIP_RULES } from '../public/lib/odds.mjs';
import { BASE_CUT } from '../public/lib/rules.mjs';
import { parseEspnResults, parseEspnRace, parseFutureResult } from '../public/lib/sources.mjs';

const at = iso => new Date(iso);

test('weeks start on Monday, Taiwan time', () => {
  // Sunday 23:30 in Taiwan is still the week of Monday the 21st.
  assert.equal(weekKey(at('2026-09-27T15:30:00Z')), '2026-09-21');
  // Monday 00:30 in Taiwan (Sunday in UTC) is the next week.
  assert.equal(weekKey(at('2026-09-27T16:30:00Z')), '2026-09-28');
});

test('a new account starts with NT$10,000 and gets its weekly grant once a week, until Quadra\'s payday replaced it', () => {
  let account = newAccount(at('2026-09-18T00:00:00Z'));
  assert.equal(balance(account), START_BALANCE);
  assert.equal(canClaim(account, at('2026-09-19T00:00:00Z')), false);
  const monday = at('2026-09-21T02:00:00Z');
  assert.equal(canClaim(account, monday), true);
  account = claimGrant(account, monday);
  assert.equal(balance(account), START_BALANCE + WEEKLY_GRANT);
  assert.equal(canClaim(account, monday), false);
  assert.equal(claimGrant(account, monday), account);
  // From the week of 2026-09-28 there are no grants (Quadra's monthly payday).
  assert.equal(canClaim(account, at('2026-09-29T02:00:00Z')), false);
  assert.equal(canClaim(account, at('2026-10-06T02:00:00Z')), false);
  assert.equal(claimGrant(account, at('2026-10-14T02:00:00Z')), account);
  // A pool-funded account opens empty.
  assert.equal(balance(newAccount(at('2026-10-01T00:00:00Z'), { start: false })), 0);
});

const slip = (id, cost, legs, extra = {}) => ({ id, mode: 'parlay', sizes: [legs.length], stake: cost, cost, legs, ...extra });

test('placing a slip takes its cost; not more than the balance', () => {
  const account = newAccount(at('2026-09-25T00:00:00Z'));
  assert.deepEqual(placeSlip(account, slip('a', 20_000, [{ id: 'x', odds: 2 }])), { error: 'funds' });
  const { account: after } = placeSlip(account, slip('a', 1000, [{ id: 'x', odds: 2 }]));
  assert.equal(balance(after), START_BALANCE - 1000);
  assert.equal(after.slips[0].status, 'open');
});

test('settling pays like a real ticket: voids count at 1.00, tax over NT$5,000', () => {
  // Parlay of 2.0 x 1.5 at NT$100: 300.
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'won' }], sizes: [2], stake: 100 }).net, 300);
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'lost' }], sizes: [2], stake: 100 }).net, 0);
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'void' }], sizes: [2], stake: 100 }).net, 200);
  // Singles: each leg its own ticket.
  assert.equal(settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 1.5, result: 'lost' }], sizes: [1], stake: 100 }).net, 200);
  // NT$10,000 at 1.8: 18,000 before tax.
  const big = settleSlip({ legs: [{ odds: 1.8, result: 'won' }], sizes: [1], stake: 10_000 });
  assert.equal(big.gross, 18_000);
  assert.ok(Math.abs(big.net - 18_000 * (1 - SLIP_RULES.taxRate - SLIP_RULES.stampRate)) < 1e-6);
});

test('each kind of leg is judged from the final score', () => {
  const game = { status: 'final', awayScore: 5, homeScore: 3, awayInnings: [0, 3, 0, 0, 2, 0, 0, 0, 0], homeInnings: [1, 0, 0, 0, 0, 2, 0, 0] };
  assert.equal(legResult({ kind: 'ml', side: 'away' }, game), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'home' }, game), 'lost');
  assert.equal(legResult({ kind: 'total', side: 'over', line: 7.5 }, game), 'won');
  assert.equal(legResult({ kind: 'total', side: 'under', line: 8.5 }, game), 'won');
  assert.equal(legResult({ kind: 'runline', side: 'away', line: -1.5 }, game), 'won');
  assert.equal(legResult({ kind: 'runline', side: 'away', line: -2.5 }, game), 'lost');
  assert.equal(legResult({ kind: 'runline', side: 'home', line: 2.5 }, game), 'won');
  assert.equal(legResult({ kind: 'teamtotal', team: 'home', side: 'under', line: 3.5 }, game), 'won');
  assert.equal(legResult({ kind: 'teamtotal', team: 'away', side: 'over', line: 5.5 }, game), 'lost');
  // Innings: 2nd has 3 runs, the most on its own.
  assert.equal(legResult({ kind: 'inning', inning: 1 }, game), 'won');
  assert.equal(topInning([1, 0], [0, 1]), 9);
  assert.equal(legResult({ kind: 'ml', side: 'draw' }, { status: 'final', awayScore: 1, homeScore: 1 }), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'away' }, { status: 'void' }), 'void');
  assert.equal(legResult({ kind: 'ml', side: 'away' }, { status: 'pending' }), null);
  assert.equal(legResult({ kind: 'f1', driver: 'Kimi Antonelli' }, { status: 'final', winner: 'Kimi Antonelli' }), 'won');
  assert.equal(legResult({ kind: 'future', team: 'Los Angeles Dodgers' }, { status: 'final', winner: 'New York Yankees' }), 'lost');
});

test('a slip settles once every leg is decided, and pays in once', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  ({ account } = placeSlip(account, slip('s', 100, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }])));
  account = applyResults(account, 's', ['won', null]);
  assert.equal(account.slips[0].status, 'open');
  assert.equal(account.slips[0].legs[0].result, 'won');
  account = applyResults(account, 's', [null, 'won']);
  assert.equal(account.slips[0].status, 'settled');
  assert.equal(account.slips[0].payout, 300);
  assert.equal(balance(account), START_BALANCE - 100 + 300);
  assert.equal(applyResults(account, 's', ['won', 'won']), account);
});

test('a free bet: no cost, the token spent once, only the winnings paid, no cash out', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  const token = { id: 'vocab:fb:2026-09-25:parlay3', value: 100 };
  ({ account } = placeFreeSlip(account, slip('f', 0, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }]), token));
  assert.equal(balance(account), START_BALANCE);
  assert.equal(account.slips[0].stake, 100);
  assert.equal(account.slips[0].free, token.id);
  assert.ok(account.ledger.some(e => e.id === `fb-${token.id}`));
  assert.equal(placeFreeSlip(account, slip('g', 0, [{ id: 'c', odds: 2 }]), token).error, 'token');
  assert.equal(cashOut(account, 'f', 150), account);
  const won = applyResults(account, 'f', ['won', 'won']);
  assert.equal(won.slips[0].payout, 200);
  assert.equal(balance(won), START_BALANCE + 200);
  const lost = applyResults(account, 'f', ['won', 'lost']);
  assert.equal(balance(lost), START_BALANCE);
});

test('a free bet with more on it: the free bet comes off the stake; a win returns the paid part', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  const token = { id: 'eco:fb:2026-09-21', value: 200 };
  ({ account } = placeFreeSlip(account, slip('t', 0, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }], { stake: 500 }), token));
  // NT$500 on it: NT$200 free, NT$300 from the balance.
  assert.equal(balance(account), START_BALANCE - 300);
  assert.deepEqual([account.slips[0].stake, account.slips[0].cost, account.slips[0].freeValue], [500, 300, 200]);
  // ×3 on NT$500 is NT$1,500 back, less the free NT$200.
  assert.equal(applyResults(account, 't', ['won', 'won']).slips[0].payout, 1_300);
  assert.equal(balance(applyResults(account, 't', ['won', 'lost'])), START_BALANCE - 300);
  // Not enough for the top-up: refused.
  assert.equal(placeFreeSlip(newAccount(at('2026-09-25T00:00:00Z')), slip('u', 0, [{ id: 'c', odds: 2 }], { stake: START_BALANCE + 1_000 }), token).error, 'funds');
});

test('Plus daily boost: +10% of the winnings, paid as its own entry, one slip a Taiwan day', () => {
  let account = newAccount(at('2026-09-25T00:00:00Z'));
  const now = at('2026-09-25T04:00:00Z');
  assert.equal(liftUsedToday(account, now), false);
  ({ account } = placeSlip(account, { ...slip('s', 100, [{ id: 'a', odds: 2 }, { id: 'b', odds: 1.5 }]), lift: 0.1 }, now));
  assert.equal(liftUsedToday(account, now), true);
  // The next Taiwan day it's back.
  assert.equal(liftUsedToday(account, at('2026-09-25T16:30:00Z')), false);
  const won = applyResults(account, 's', ['won', 'won'], now);
  // 100 × 3.00: winnings 200, +10% = 220, paid 320: 300 as winnings, 20 as the boost.
  assert.equal(won.slips[0].payout, 320);
  assert.equal(won.ledger.find(e => e.id === 'payout-s').amount, 300);
  assert.deepEqual(won.ledger.find(e => e.id === 'plus-s'), { id: 'plus-s', t: now.toISOString(), kind: 'plusboost', amount: 20, slipId: 's' });
  assert.equal(balance(won), START_BALANCE - 100 + 320);
  // A lost slip pays nothing, and no boost entry.
  const lost = applyResults(account, 's', ['won', 'lost'], now);
  assert.ok(!lost.ledger.some(e => e.id === 'plus-s'));
  assert.equal(liftFits(1000, 1000), true);
  assert.equal(liftFits(1010, 1000), false);
  assert.equal(liftFits(0, 1000), false);
});

test('Plus daily boost keeps the house ahead at any price, on every market cut', () => {
  for (const cut of Object.values(BASE_CUT)) {
    for (const odds of [1.2, 1.85, 3, 8, 50]) {
      const fairChance = 1 / (odds * cut);
      const { mean } = slipOutlook({ legs: [{ gameId: 'g', odds, fairChance }], sizes: [1], stake: 100, lift: 0.1 });
      assert.ok(mean < 100, `cut ${cut} odds ${odds}: returns ${mean}`);
    }
  }
});

test('two devices merge without counting anything twice', () => {
  const base = newAccount(at('2026-09-25T00:00:00Z'));
  const { account: a } = placeSlip(base, slip('a', 500, [{ id: 'x', odds: 2 }]), at('2026-09-25T01:00:00Z'));
  const { account: b0 } = placeSlip(base, slip('b', 300, [{ id: 'y', odds: 3 }]), at('2026-09-25T02:00:00Z'));
  const b = applyResults(b0, 'b', ['won'], at('2026-09-25T05:00:00Z'));
  const merged = mergeAccounts(a, b);
  assert.equal(merged.slips.length, 2);
  assert.equal(balance(merged), START_BALANCE - 500 - 300 + 900);
  assert.deepEqual(mergeAccounts(merged, b).ledger, merged.ledger);
  // A slip settled on one device wins over the open copy on the other.
  const settledA = applyResults(a, 'a', ['lost']);
  assert.equal(mergeAccounts(a, settledA).slips.find(s => s.id === 'a').status, 'settled');
});

test('ESPN results: final scores and innings, postponed games void', () => {
  const data = {
    events: [
      {
        date: '2026-09-24T16:35Z',
        competitions: [{
          status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '2', team: { displayName: 'Pittsburgh Pirates' }, linescores: [{ value: 1 }, { value: 0 }] },
            { homeAway: 'away', score: '1', team: { displayName: 'St. Louis Cardinals' }, linescores: [{ value: 1 }] }
          ]
        }]
      },
      {
        date: '2026-09-24T23:05Z',
        competitions: [{
          status: { type: { name: 'STATUS_POSTPONED', state: 'post', completed: false } },
          competitors: [
            { homeAway: 'home', score: '0', team: { displayName: 'A' } },
            { homeAway: 'away', score: '0', team: { displayName: 'B' } }
          ]
        }]
      }
    ]
  };
  const [played, postponed] = parseEspnResults(data, 'mlb');
  assert.equal(played.status, 'final');
  assert.equal(played.homeScore, 2);
  assert.deepEqual(played.homeInnings, [1, 0]);
  assert.equal(postponed.status, 'void');
});

test('F1 winner from ESPN, championship winner from Polymarket', () => {
  const race = {
    events: [{ competitions: [
      { type: { abbreviation: 'Qual' }, date: '2026-09-12T14:00Z', status: { type: { completed: true } }, competitors: [{ order: 1, athlete: { displayName: 'Lando Norris' } }] },
      { type: { abbreviation: 'Race' }, date: '2026-09-13T13:00Z', status: { type: { completed: true } }, competitors: [{ order: 2, athlete: { displayName: 'Max Verstappen' } }, { order: 1, winner: true, athlete: { displayName: 'Kimi Antonelli' } }] }
    ] }]
  };
  assert.deepEqual(parseEspnRace(race, '2026-09-13T13:00:00Z'), { status: 'final', winner: 'Kimi Antonelli' });
  // ESPN's 'session complete' (not yet final, no winner flag) already has the order.
  const complete = { events: [{ competitions: [{ type: { abbreviation: 'Race' }, date: '2026-09-26T11:00Z', status: { type: { name: 'STATUS_SESSION_COMPLETE', state: 'in', completed: false } }, competitors: [
    { order: 3, athlete: { displayName: 'Isack Hadjar' } }, { order: 1, athlete: { displayName: 'George Russell' } }, { order: 2, athlete: { displayName: 'Max Verstappen' } }
  ] }] }] };
  assert.deepEqual(parseEspnRace(complete, '2026-09-26T11:00:00Z'), { status: 'final', winner: 'George Russell', podium: ['George Russell', 'Max Verstappen', 'Isack Hadjar'] });
  // A pick's start a day off the race still finds it.
  assert.equal(parseEspnRace(complete, '2026-09-25T12:00:00Z').winner, 'George Russell');
  const running = { events: [{ competitions: [{ type: { abbreviation: 'Race' }, date: '2026-09-26T11:00Z', status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } }, competitors: [] }] }] };
  assert.deepEqual(parseEspnRace(running, '2026-09-26T11:00:00Z'), { status: 'pending' });
  assert.equal(parseFutureResult([{ closed: false, markets: [] }]).status, 'pending');
  const done = parseFutureResult([{ closed: true, markets: [
    { question: 'Will the New York Yankees win the 2026 World Series?', outcomes: '["Yes","No"]', outcomePrices: '["0","1"]' },
    { question: 'Will the Los Angeles Dodgers win the 2026 World Series?', outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' }
  ] }]);
  assert.deepEqual(done, { status: 'final', winner: 'Los Angeles Dodgers' });
});

test('a slip outlook: average payout, spread and chance of any payout', async () => {
  const { slipOutlook, evaluateSlip } = await import('../public/lib/odds.mjs');
  const legs = [{ odds: 2, fairChance: 0.5 }, { odds: 3, fairChance: 0.3 }];
  const look = slipOutlook({ legs, sizes: [2], stake: 100 });
  // Pays 600 with chance 0.15.
  assert.ok(Math.abs(look.mean - 90) < 1e-9);
  assert.ok(Math.abs(look.any - 0.15) < 1e-9);
  assert.ok(Math.abs(look.sd - 600 * Math.sqrt(0.15 * 0.85)) < 1e-6);
  assert.ok(Math.abs(evaluateSlip({ legs, sizes: [2], stake: 100 }).expectedNet - look.mean) < 1e-9);
});

test('history stats: money, luck, picks against their chances, streaks', async () => {
  const { historyStats } = await import('../public/lib/history.mjs');
  let account = newAccount(at('2026-09-01T00:00:00Z'));
  const legs = (...r) => r.map((result, i) => ({ id: `l${i}`, kind: i ? 'total' : 'ml', sport: 'mlb', odds: 2, fairChance: 0.45, result }));
  const place = (id, t, results) => {
    ({ account } = placeSlip(account, { id, mode: 'single', sizes: [1], stake: 100, cost: 100 * results.length, legs: legs(...results.map(() => null)) }, at(t)));
    account = applyResults(account, id, results, at(t));
  };
  place('a', '2026-09-02T00:00:00Z', ['won', 'lost']); // pays 200 of 200
  place('b', '2026-09-03T00:00:00Z', ['lost', 'lost']); // 0 of 200
  place('c', '2026-09-10T00:00:00Z', ['won', 'won']); // 400 of 200
  ({ account } = placeSlip(account, { id: 'd', mode: 'parlay', sizes: [2], stake: 100, cost: 100, legs: legs(null, null) }, at('2026-09-11T00:00:00Z')));
  const s = historyStats(account);
  assert.equal(s.placed, 4);
  assert.equal(s.settled, 3);
  assert.equal(s.open, 1);
  assert.equal(s.staked, 600);
  assert.equal(s.paid, 600);
  assert.equal(s.net, 0);
  // Each NT$100 single at 2.0 and 45% averages 90 back.
  assert.ok(Math.abs(s.expected - 540) < 1e-9);
  assert.ok(Math.abs(s.luck - 60) < 1e-9);
  assert.equal(s.picks.legs, 6);
  assert.equal(s.picks.won, 3);
  assert.ok(Math.abs(s.picks.expectedRate - 0.45) < 1e-9);
  assert.equal(s.streak.bestLoss, 1);
  assert.equal(s.streak.current, 1);
  assert.equal(s.records.best.slip.id, 'c');
  assert.equal(s.records.worst.slip.id, 'b');
  assert.equal(s.weeks.length, 2);
  assert.equal(s.timeline.at(-1).balance, 10_000 - 700 + 600);
});

test('saves are gzip-compressed and read back; old plain saves still read', async () => {
  const { pack, unpack } = await import('../public/lib/codec.mjs');
  let account = newAccount(at('2026-09-01T00:00:00Z'));
  for (let i = 0; i < 40; i++) {
    const legs = Array.from({ length: 4 }, (_, j) => ({ id: `mlb_2026-09-0${j}|tot|8.5|over`, kind: 'total', sport: 'mlb', label: 'Texas Rangers @ Minnesota Twins Over 8.5', shortLabel: 'Over 8.5', matchup: 'Texas Rangers @ Minnesota Twins', start: '2026-09-26T00:10:00.000Z', odds: 1.87, fairChance: 0.5, side: 'over', line: 8.5, away: 'Texas Rangers', home: 'Minnesota Twins' }));
    ({ account } = placeSlip(account, { id: `s${i}`, mode: 'parlay', sizes: [4], stake: 10, cost: 10, legs }));
  }
  const json = JSON.stringify(account);
  const packed = await pack(account);
  assert.ok(packed.startsWith('gz1:'));
  assert.ok(packed.length * 5 < json.length, `${packed.length} vs ${json.length}`);
  assert.deepEqual(await unpack(packed), account);
  assert.deepEqual(await unpack(json), account);
  assert.equal(await unpack('gz1:!!'), null);
});

test('fun facts, and your tickets told like a simulated person\'s', async () => {
  const { funFacts, crowdPercentile } = await import('../public/lib/history.mjs');
  const { ticketProfile, accountTickets } = await import('../public/lib/profile.mjs');
  let account = newAccount(at('2026-09-01T00:00:00Z'));
  const leg = (id, name, chance, odds, result) => ({ id, kind: 'ml', side: 'away', sport: 'mlb', shortLabel: name, matchup: 'A @ B', odds, fairChance: chance, result: null, final: result });
  const add = (id, t, legs) => {
    ({ account } = placeSlip(account, { id, mode: 'parlay', sizes: [legs.length], stake: 100, cost: 100, legs }, at(t)));
    account = applyResults(account, id, legs.map(l => l.final), at(t));
  };
  add('a', '2026-09-05T10:00:00Z', [leg('1', '道奇', 0.3, 3.1, 'won'), leg('2', '洋基', 0.8, 1.2, 'lost')]);
  add('b', '2026-09-12T10:00:00Z', [leg('3', '道奇', 0.5, 1.8, 'won'), leg('4', '水手', 0.5, 1.8, 'won')]);
  add('c', '2026-09-19T10:00:00Z', [leg('5', '道奇', 0.5, 1.8, 'lost'), leg('6', '小熊', 0.5, 1.8, 'lost')]);
  const f = funFacts(account);
  assert.equal(f.upset.leg.shortLabel, '道奇');
  assert.equal(f.heartbreak.leg.shortLabel, '洋基');
  assert.equal(f.nearMiss.count, 1);
  assert.ok(Math.abs(f.nearMiss.missed - 372) < 1e-9);
  assert.deepEqual([f.team.name, f.team.picks, f.team.won], ['道奇', 3, 2]);
  assert.equal(f.weekday.day, 6); // Saturdays
  const profile = ticketProfile(accountTickets(account));
  assert.equal(profile.tickets, 3);
  assert.equal(profile.avgLegs, 2);
  assert.equal(profile.avgStake, 100);
  assert.equal(profile.won, 1);
  assert.equal(profile.nearMisses, 1);
  assert.deepEqual([profile.longestWin, profile.longestLose], [1, 1]);
  // One ticket a week over three weeks, two picks at about 50%: no trait shows.
  assert.deepEqual(profile.traits, []);
  assert.equal(crowdPercentile([-3, -1, 0, 2, 10], 1), 0.625);
});

test('slip history keeps itself: final scores with each pick, compact picks, backups merge', async () => {
  const { newAccount, placeSlip, applyResults, compactLeg, compactAccount, mergeAccounts, balance } = await import('../public/lib/account.mjs');
  const now = new Date('2026-09-26T04:00:00Z');
  const leg = { id: 'g1|ml|home', kind: 'ml', sport: 'mlb', odds: 1.9, side: 'home', line: null, inning: null, driver: null, away: 'Houston Astros', home: 'Athletics' };
  let account = placeSlip(newAccount(now), { id: 's1', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [leg] }, now).account;
  // Empty fields aren't saved.
  assert.equal('line' in account.slips[0].legs[0], false);
  assert.deepEqual(compactLeg({ a: 1, b: null, result: null }), { a: 1, result: null });
  account = applyResults(account, 's1', ['won'], now, [{ away: 4, home: 6 }]);
  assert.deepEqual(account.slips[0].legs[0].final, { away: 4, home: 6 });
  assert.equal(account.slips[0].status, 'settled');
  // A backup restored onto a device that has it already changes nothing.
  const backup = JSON.parse(JSON.stringify(account));
  assert.equal(balance(mergeAccounts(account, backup)), balance(account));
  assert.equal(mergeAccounts(newAccount(now), backup).slips.length, 1);
  assert.deepEqual(compactAccount(backup).slips[0].legs[0].final, { away: 4, home: 6 });
});

test('money sources: every NT$ in and out of the account, by where it came from', async () => {
  const { moneySources } = await import('../public/lib/history.mjs');
  const t = '2026-09-21T02:00:00.000Z';
  const account = {
    v: 1, created: t, updated: t,
    ledger: [
      { id: 'start', t, kind: 'start', amount: 10000 },
      { id: 'grant-2026-09-21', t, kind: 'grant', amount: 5000 },
      { id: 'game-a', t, kind: 'game', game: 'typing', amount: 25 },
      { id: 'game-b', t, kind: 'game', game: 'typing', amount: 20 },
      { id: 'game-c', t, kind: 'game', game: 'derby', amount: 40 },
      { id: 'stake-s1', t, kind: 'stake', amount: -1000, slipId: 's1' },
      { id: 'payout-s1', t, kind: 'payout', amount: 1500, slipId: 's1' },
      { id: 'stake-s2', t, kind: 'stake', amount: -500, slipId: 's2' },
      { id: 'payout-s2', t, kind: 'payout', amount: 0, slipId: 's2' },
      { id: 'stake-s3', t, kind: 'stake', amount: -200, slipId: 's3' }
    ],
    slips: [
      { id: 's1', status: 'settled', cost: 1000, payout: 1500, gross: 1600, legs: [] },
      { id: 's2', status: 'settled', cost: 500, payout: 0, gross: 0, legs: [] },
      { id: 's3', status: 'open', cost: 200, legs: [] }
    ]
  };
  const m = moneySources(account);
  assert.equal(m.balance, 10000 + 5000 + 85 - 1700 + 1500);
  assert.equal(m.start + m.grants.sum + m.games.sum + m.payouts.sum - m.stakes.sum, m.balance);
  assert.deepEqual(m.games.byGame.typing, { rounds: 2, sum: 45, best: 25 });
  assert.equal(m.payouts.n, 1);
  assert.equal(m.bettingNet, 0);
  assert.equal(m.houseKept, 1500 - 1600);
  assert.equal(m.tax, 100);
  assert.deepEqual(m.open, { n: 1, sum: 200 });
  assert.equal(m.weeks.length, 1);
  assert.equal(m.weeks[0].games, 85);
});

test('Quadra pool: extra money to bet with, the weekly limit, entries for the pool', async () => {
  const { newAccount, placeSlip, poolEntries, stakedThisWeek, mergeDistinct, balance, claimGrant } = await import('../public/lib/account.mjs');
  const now = new Date('2026-09-23T04:00:00Z');
  const base = newAccount(new Date('2026-09-01T00:00:00Z'));
  const slip = (id, cost) => ({ id, mode: 'single', sizes: [1], stake: cost, cost, legs: [{ id: 'x', odds: 2 }] });
  // Beyond the ledger's own NT$10,000, with the pool's extra.
  assert.deepEqual(placeSlip(base, slip('a', 15_000), now), { error: 'funds' });
  const { account } = placeSlip(base, slip('a', 15_000), now, { extra: 90_000 });
  assert.equal(balance(account), -5_000);
  assert.equal(stakedThisWeek(account, now), 15_000);
  // No weekly limit: anything the pool covers.
  assert.ok(placeSlip(account, slip('b', 60_000), now, { extra: 90_000 }).account);
  // A new week starts the limit over.
  assert.equal(stakedThisWeek(account, new Date('2026-09-29T04:00:00Z')), 0);
  const entries = poolEntries(account, now);
  assert.deepEqual(entries.map(e => [e.id, e.amount, e.app]), [['odds:start', 10_000, 'odds'], ['odds:stake-a', -15_000, 'odds']]);
  // Two separate accounts folded together keep both starts and grants.
  const other = claimGrant(newAccount(new Date('2026-08-01T00:00:00Z')), new Date('2026-09-22T01:00:00Z'));
  const both = mergeDistinct(claimGrant(base, new Date('2026-09-22T01:00:00Z')), other);
  const { WEEKLY_GRANT } = await import('../public/lib/account.mjs');
  assert.equal(balance(both), 2 * (10_000 + WEEKLY_GRANT));
  assert.equal(mergeDistinct(both, other).ledger.length, both.ledger.length);
});

test('the wallet brings back a lost ledger and slips, and a real slip wins over a recovered one', async () => {
  const { recoverFromWallet, mergeAccounts, newAccount, balance } = await import('../public/lib/account.mjs');
  const { historyStats } = await import('../public/lib/history.mjs');
  const empty = newAccount(new Date('2026-09-28T00:00:00Z'), { start: false });
  const wallet = {
    entries: [
      { id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 110000 },
      { id: 'odds:start', t: 2, app: 'odds', kind: 'start', amount: 10000 },
      { id: 'odds:stake-a', t: 3, app: 'odds', kind: 'stake', amount: -1000 },
      { id: 'odds:payout-a', t: 4, app: 'odds', kind: 'payout', amount: 2500 },
      { id: 'odds:stake-b', t: 5, app: 'odds', kind: 'stake', amount: -500 }
    ]
  };
  const back = recoverFromWallet(empty, wallet);
  assert.equal(balance(back), 11000);
  assert.deepEqual(back.slips.map(s => [s.id, s.cost, s.payout, s.recovered]), [['b', 500, 0, true], ['a', 1000, 2500, true]]);
  assert.equal(recoverFromWallet(back, wallet), back);
  const stats = historyStats(back);
  assert.ok(stats);
  const real = { ...newAccount(new Date('2026-09-20T00:00:00Z')), slips: [{ id: 'a', t: '2026-09-20T01:00:00.000Z', mode: 'single', sizes: [1], stake: 1000, cost: 1000, status: 'open', legs: [{ id: 'x', odds: 2.5, result: null }] }] };
  assert.equal(mergeAccounts(back, real).slips.find(s => s.id === 'a').recovered, undefined);
  assert.equal(mergeAccounts(real, back).slips.find(s => s.id === 'a').recovered, undefined);
});

test('a lost slip that was never settled is refunded once it is old enough, and a found one is not paid twice', async () => {
  const { recoverFromWallet, refundLost, applyResults, newAccount, balance, REFUND_AFTER_MS } = await import('../public/lib/account.mjs');
  const t0 = Date.parse('2026-09-01T00:00:00Z');
  const wallet = {
    entries: [
      { id: 'odds:stake-a', t: t0, app: 'odds', kind: 'stake', amount: -1000 },
      { id: 'odds:payout-a', t: t0 + 1, app: 'odds', kind: 'payout', amount: 0 },
      { id: 'odds:stake-b', t: t0 + 2, app: 'odds', kind: 'stake', amount: -2000 }
    ]
  };
  const back = recoverFromWallet(newAccount(new Date(t0), { start: false }), wallet);
  assert.equal(balance(back), -3000);
  // Too soon: another device may still hold the real slip.
  assert.equal(refundLost(back, new Date(t0 + REFUND_AFTER_MS - 1000)), back);
  const later = new Date(t0 + REFUND_AFTER_MS + 1000);
  const refunded = refundLost(back, later);
  assert.equal(balance(refunded), -1000);
  const b = refunded.slips.find(s => s.id === 'b');
  assert.equal(b.refunded, true);
  assert.equal(b.payout, 2000);
  // The lost bet that did settle (a loss) is left alone; nothing is refunded twice.
  assert.equal(refunded.slips.find(s => s.id === 'a').refunded, undefined);
  assert.equal(refundLost(refunded, later), refunded);
  // Rebuilt again from the wallet (which now has the refund), it stays refunded.
  const again = recoverFromWallet(newAccount(new Date(t0), { start: false }), { entries: [...wallet.entries, { id: 'odds:refund-b', t: later.getTime(), app: 'odds', kind: 'refund', amount: 2000 }] });
  assert.equal(again.slips.find(s => s.id === 'b').refunded, true);
  assert.equal(balance(refundLost(again, later)), -1000);
  // The real slip turns up and wins: it pays only what's beyond the refunded cost.
  const found = { ...refunded, slips: refunded.slips.map(s => (s.id === 'b' ? { id: 'b', t: s.t, mode: 'single', sizes: [1], stake: 2000, cost: 2000, status: 'open', legs: [{ id: 'x', odds: 2, result: null }] } : s)) };
  const settled = applyResults(found, 'b', ['won'], later);
  assert.equal(balance(settled), -3000 + settled.slips.find(s => s.id === 'b').payout);
});
