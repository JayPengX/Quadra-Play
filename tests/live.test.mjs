import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { americanToProbability, devigProportional } from '../public/lib/odds.mjs';
import { inningsLeft, liveBaseball, liveMarkets, liveOdds, pregameRuns, chance, fitGoals, liveSoccer, LIVE_OVERROUND } from '../public/lib/live.mjs';
import { parseInning, parseEspnLive, parsePregameLines } from '../public/lib/sources.mjs';

const snap = JSON.parse(readFileSync(new URL('./fixtures/lottery-live-2026-09-26.json', import.meta.url)));

test('innings left from the live state', () => {
  assert.deepEqual(inningsLeft({ inning: 4, half: 'mid' }), { away: 5, home: 6 });
  assert.deepEqual(inningsLeft({ inning: 4, half: 'top', outs: 1 }), { away: 6 - 1 / 3, home: 6 });
  assert.deepEqual(inningsLeft({ inning: 9, half: 'end' }), { away: 0, home: 0 });
  assert.deepEqual(parseInning('Rain Delay, Top 1st', 1), { inning: 1, half: 'top' });
  assert.deepEqual(parseInning('Mid 4th', 4), { inning: 4, half: 'mid' });
});

test('the live model posts the lottery\'s lines and lands near its prices', () => {
  const p = snap.pregame;
  const [away, home] = devigProportional([americanToProbability(p.awayMoneyline), americanToProbability(p.homeMoneyline)]);
  const [over] = devigProportional([americanToProbability(p.overOdds), americanToProbability(p.underOdds)]);
  const means = pregameRuns({ homeWin: home, totalLine: p.total, overFair: over });
  assert.ok(away < 0.5);
  const left = inningsLeft(snap.state);
  const dist = liveBaseball({ means, awayScore: 5, homeScore: 2, awayLeft: left.away, homeLeft: left.home });
  assert.ok(Math.abs(dist.reduce((s, x) => s + x.p, 0) - 1) < 1e-6);
  const markets = liveMarkets(dist, { sport: 'mlb', awayScore: 5, homeScore: 2, pm: { awayWin: snap.polymarketAwayWin } });
  const posted = kind => markets.filter(m => m.kind === kind && m.posted);
  // The same lines the lottery posted: total 11.5, CIN -2.5.
  assert.equal(posted('total')[0].line, snap.lottery.total.line);
  assert.equal(posted('runline')[0].giver, 'away');
  assert.equal(posted('runline')[0].awayLine, -snap.lottery.runline.line);
  const L = snap.lottery;
  const pairs = [
    [liveOdds(posted('ml').find(m => m.side === 'away').fair), L.ml.away],
    [liveOdds(posted('ml').find(m => m.side === 'home').fair), L.ml.home],
    [liveOdds(posted('total').find(m => m.side === 'over').fair), L.total.over],
    [liveOdds(posted('total').find(m => m.side === 'under').fair), L.total.under],
    [liveOdds(posted('runline').find(m => m.side === 'away').fair), L.runline.giverOdds],
    [liveOdds(posted('runline').find(m => m.side === 'home').fair), L.runline.takerOdds]
  ];
  const err = pairs.reduce((s, [est, real]) => s + Math.abs(est - real) / real, 0) / pairs.length;
  assert.ok(err < 0.08, `average error ${err} ${JSON.stringify(pairs)}`);
  // The lottery's live cut is its usual one.
  for (const book of [[L.ml.away, L.ml.home], [L.total.over, L.total.under], [L.runline.giverOdds, L.runline.takerOdds]]) {
    assert.ok(Math.abs(book.reduce((s, o) => s + 1 / o, 0) - LIVE_OVERROUND) < 0.02);
  }
});

test('a finished game is certain; soccer goals scale with the minutes left', () => {
  const dist = liveBaseball({ means: { home: 4.5, away: 4 }, awayScore: 3, homeScore: 1, awayLeft: 0, homeLeft: 0 });
  assert.equal(chance(dist, (a, h) => a > h), 1);
  const means = fitGoals(0.45, 0.28);
  const full = liveSoccer({ means, awayScore: 0, homeScore: 0, minutesLeft: 90 });
  const homeWin = chance(full, (a, h) => h > a);
  const draw = chance(full, (a, h) => h === a);
  assert.ok(Math.abs(homeWin - 0.45) < 0.03, homeWin);
  assert.ok(Math.abs(draw - 0.27) < 0.03, draw);
  const late = liveSoccer({ means, awayScore: 0, homeScore: 1, minutesLeft: 5 });
  assert.ok(chance(late, (a, h) => h > a) > 0.85);
});

test('ESPN live games and pregame lines', () => {
  const board = { events: [
    { id: '1', date: '2026-09-25T23:07Z', competitions: [{ status: { period: 4, displayClock: '0:00', type: { state: 'in', shortDetail: 'Bot 4th' } }, situation: { outs: 1 }, competitors: [
      { homeAway: 'home', score: '2', team: { displayName: 'Toronto Blue Jays' } },
      { homeAway: 'away', score: '5', team: { displayName: 'Cincinnati Reds' } }
    ] }] },
    { id: '2', date: '2026-09-25T23:07Z', competitions: [{ status: { type: { state: 'post' } }, competitors: [] }] }
  ] };
  const [game] = parseEspnLive(board, 'mlb');
  assert.equal(game.half, 'bottom');
  assert.equal(game.outs, 1);
  assert.equal(game.awayScore, 5);
  const lines = parsePregameLines({ pickcenter: [{ overUnder: 7.5, overOdds: -114, underOdds: -105, homeTeamOdds: { moneyLine: -174 }, awayTeamOdds: { moneyLine: 143 } }] });
  assert.equal(lines.totalLine, 7.5);
  assert.ok(lines.homeWin > 0.6);
  const soccer = parsePregameLines({ pickcenter: [{ overUnder: 2.5, overOdds: -170, underOdds: 135, homeTeamOdds: { moneyLine: 215 }, awayTeamOdds: { moneyLine: 115 }, drawOdds: { moneyLine: 270 } }] });
  assert.ok(Math.abs(soccer.homeWin + soccer.draw + soccer.awayWin - 1) < 1e-9);
  assert.ok(soccer.draw > 0.2);
});

test('every league with a game on is read live, with the pregame line from its scoreboard', async () => {
  const { parseEspnScoreboard, liveLeagues } = await import('../public/lib/sources.mjs');
  const now = new Date('2026-09-29T18:00:00Z');
  const side = (homeAway, name, score = '0') => ({ homeAway, score, team: { displayName: name } });
  // A Championship game kicked off an hour ago; an NBA game tomorrow.
  parseEspnScoreboard({ events: [{ id: '77', date: '2026-09-29T17:00Z', competitions: [{ status: { type: { state: 'pre' } }, competitors: [side('home', 'Celtic'), side('away', 'Rangers')], odds: [{ moneyline: { home: { close: { odds: '-150' } }, draw: { close: { odds: '+280' } }, away: { close: { odds: '+400' } } } }] }] }] }, 'scotland');
  parseEspnScoreboard({ events: [{ id: '78', date: '2026-09-30T23:00Z', competitions: [{ status: { type: { state: 'pre' } }, competitors: [side('home', 'Boston Celtics'), side('away', 'New York Knicks')] }] }] }, 'nba');
  const leagues = liveLeagues(now);
  assert.ok(leagues.includes('scotland'));
  assert.ok(leagues.includes('mlb') && leagues.includes('epl'));
  assert.ok(!leagues.includes('nba'));
  // Two hours later the game is over: no longer read.
  assert.ok(!liveLeagues(new Date('2026-09-29T20:00:00Z')).includes('scotland'));
});

test('hockey, football and basketball in progress', async () => {
  const { shareLeft, livePoints, liveGoals } = await import('../public/lib/live.mjs');
  const { fitHockey } = await import('../public/lib/markets.mjs');
  assert.equal(shareLeft('nba', 1, 720), 1);
  assert.equal(shareLeft('nba', 3, 360), 0.375);
  assert.equal(shareLeft('nba', 4, 0), 0);
  assert.equal(shareLeft('nfl', 4, 450), 0.125);
  assert.ok(shareLeft('nba', 5, 300) < 0.11);
  const board = { events: [{ id: '9', date: '2026-10-20T23:30Z', competitions: [{ status: { period: 3, clock: 360, displayClock: '6:00', type: { state: 'in', shortDetail: '6:00 - 3rd' } }, competitors: [
    { homeAway: 'home', score: '80', team: { displayName: 'Boston Celtics' } },
    { homeAway: 'away', score: '70', team: { displayName: 'New York Knicks' } }
  ] }] }] };
  const [game] = parseEspnLive(board, 'nba');
  assert.equal(game.left, 0.375);
  // An even game, home up 10 with 18 minutes left: home a clear favourite; lines around the live score.
  const bets = livePoints({ sport: 'nba', pre: { homeWin: 0.5, totalLine: 220, overFair: 0.5 }, awayScore: 70, homeScore: 80, left: game.left });
  const home = bets.find(b => b.kind === 'ml' && b.side === 'home').fair;
  assert.ok(home > 0.8 && home < 0.97, home);
  const total = bets.find(b => b.kind === 'total' && b.posted && b.side === 'over');
  assert.ok(Math.abs(total.line - (150 + 220 * 0.375)) <= 1, total.line);
  assert.ok(Math.abs(total.fair - 0.5) < 0.05);
  const spread = bets.find(b => b.kind === 'runline' && b.posted && b.side === 'away');
  assert.equal(spread.line, spread.awayLine);
  assert.ok(spread.awayLine > 5 && spread.awayLine < 15, spread.awayLine);
  assert.deepEqual(livePoints({ sport: 'nba', pre: { homeWin: 0.5 }, awayScore: 0, homeScore: 0, left: 0.01 }), []);
  // Hockey: level in the third with little left leans on the stronger team, never a draw.
  const dist = liveGoals({ means: fitHockey(0.6, { line: 6.5, overFair: 0.5 }), awayScore: 2, homeScore: 2, share: 0.1 });
  assert.ok(Math.abs(dist.reduce((s, x) => s + x.p, 0) - 1) < 1e-6);
  assert.equal(chance(dist, (a, h) => a === h), 0);
  assert.ok(chance(dist, (a, h) => h > a) > 0.5);
  const hockey = liveMarkets(dist, { sport: 'nhl', awayScore: 2, homeScore: 2 });
  assert.deepEqual(hockey.filter(m => m.kind === 'ml').map(m => m.side), ['away', 'home']);
  // Any soccer league gets the three-way winner.
  const soccer = liveMarkets(liveSoccer({ means: fitGoals(0.45, 0.28), awayScore: 0, homeScore: 0, minutesLeft: 60 }), { sport: 'scotland', awayScore: 0, homeScore: 0 });
  assert.deepEqual(soccer.filter(m => m.kind === 'ml').map(m => m.side), ['home', 'draw', 'away']);
});

test('Kambi\'s matches in play: its live prices, open ones only', async () => {
  const { parseKambiInPlay } = await import('../public/lib/kambi.mjs');
  const offer = (type, label, outcomes) => ({ betOfferType: { englishName: type }, criterion: { englishLabel: label }, outcomes });
  const baseball = parseKambiInPlay({ events: [
    { event: { id: 4, homeName: 'Rakuten Monkeys', awayName: 'Uni Lions', start: '2026-09-29T10:35:00Z', state: 'STARTED' },
      betOffers: [
        offer('Match', 'Moneyline - Including Extra Innings', [{ type: 'OT_ONE', odds: 1800 }, { type: 'OT_TWO', odds: 2000 }]),
        offer('Handicap', 'Handicap - 1st Inning', [{ type: 'OT_ONE', odds: 1900, line: -500 }, { type: 'OT_TWO', odds: 1900, line: 500 }]),
        offer('Handicap', 'Handicap - Including Extra Innings', [{ type: 'OT_ONE', odds: 1900, line: -1500 }, { type: 'OT_TWO', odds: 1900, line: 1500 }]),
        offer('Over/Under', 'Total Runs - Including Extra Innings', [{ type: 'OT_OVER', odds: 1850, line: 9500 }, { type: 'OT_UNDER', odds: 1950, line: 9500 }])
      ],
      liveData: { score: { home: '3', away: '2', info: '0-1 | 3-1 | 0-0' } } }
  ] }, 'cpbl');
  assert.deepEqual(baseball[0].spread.awayLine, 1.5);
  assert.equal(baseball[0].total.line, 9.5);
  assert.equal(baseball[0].inningNo, 3);
  assert.deepEqual([baseball[0].homeScore, baseball[0].awayScore], [3, 2]);
});

test('第N分: who scores the next runs, at the lottery\'s price', async () => {
  const { nextRunChances, nextRunOdds, halvesLeft, runOrder } = await import('../public/lib/live.mjs');
  const { legResult } = await import('../public/lib/account.mjs');
  assert.deepEqual(halvesLeft({ inning: 9, half: 'mid' }).map(h => h.team), ['home']);
  assert.equal(halvesLeft({ inning: 4, half: 'mid' }).length, 11);
  const p = snap.pregame;
  const [, home] = devigProportional([americanToProbability(p.awayMoneyline), americanToProbability(p.homeMoneyline)]);
  const [over] = devigProportional([americanToProbability(p.overOdds), americanToProbability(p.underOdds)]);
  const means = pregameRuns({ homeWin: home, totalLine: p.total, overFair: over });
  const pairs = [];
  for (const [ahead, real] of [[1, snap.lottery.nextRun8], [2, snap.lottery.nextRun9]]) {
    const c = nextRunChances({ means, state: snap.state, runsAhead: ahead });
    assert.ok(Math.abs(c.away + c.home + c.none - 1) < 1e-9);
    // Toronto bats next, so it's likelier to score the 8th run.
    if (ahead === 1) assert.ok(c.home > c.away);
    for (const side of ['away', 'none', 'home']) pairs.push([nextRunOdds(c[side]), real[side]]);
  }
  const err = pairs.reduce((s, [est, real]) => s + Math.abs(est - real) / real, 0) / pairs.length;
  assert.ok(err < 0.08, `average error ${err} ${JSON.stringify(pairs)}`);
  // Settling: the order runs were scored in, from the scoring plays.
  const order = runOrder([
    { scoringPlay: true, awayScore: 0, homeScore: 1 },
    { scoringPlay: false },
    { scoringPlay: true, awayScore: 2, homeScore: 1 }
  ]);
  assert.deepEqual(order, ['home', 'away', 'away']);
  const final = { status: 'final', awayScore: 2, homeScore: 1, runOrder: order };
  assert.equal(legResult({ kind: 'nextrun', line: 2, side: 'away' }, final), 'won');
  assert.equal(legResult({ kind: 'nextrun', line: 1, side: 'away' }, final), 'lost');
  assert.equal(legResult({ kind: 'nextrun', line: 4, side: 'none' }, final), 'won');
  assert.equal(legResult({ kind: 'nextrun', line: 4, side: 'none' }, { status: 'final', awayScore: 2, homeScore: 1 }), null);
});
