// A game's own markets from Kambi (offers.mjs) and the players' (props.mjs):
// sides turned to ESPN's, prices without Kambi's margin, settled from the
// box score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOffers, LINES_SHOWN } from '../public/lib/offers.mjs';
import { propOf, boxPlayers, propOutcome, propResult, firstScorer } from '../public/lib/props.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { legResult } from '../public/lib/account.mjs';
import { slipErrors, SLIP_RULES } from '../public/lib/odds.mjs';

const offer = (label, type, outcomes, tags = []) => ({ criterion: { englishLabel: label }, betOfferType: { englishName: type }, tags, outcomes });
const o = (type, odds, extra = {}) => ({ type, odds, status: 'OPEN', ...extra });

// Kambi names Arsenal first; ESPN has Arsenal at home too, or (flipped) away.
const data = {
  events: [{ homeName: 'Arsenal', awayName: 'Leeds United' }],
  betOffers: [
    offer('Total Goals', 'Over/Under', [o('OT_OVER', 1800, { line: 2500 }), o('OT_UNDER', 2000, { line: 2500 })], ['MAIN_LINE']),
    offer('Total Goals', 'Over/Under', [o('OT_OVER', 1900, { line: 2250 }), o('OT_UNDER', 1900, { line: 2250 })]),
    offer('Asian Handicap', 'Asian Handicap', [o('OT_UNTYPED', 1900, { line: -1500, participant: 'Arsenal' }), o('OT_UNTYPED', 1900, { line: 1500, participant: 'Leeds United' })]),
    offer('Total Goals by Leeds United', 'Over/Under', [o('OT_OVER', 2500, { line: 500 }), o('OT_UNDER', 1500, { line: 500 })]),
    offer('Draw No Bet', 'Match', [o('OT_ONE', 1100), o('OT_TWO', 6000)]),
    offer('Double Chance', 'Double Chance', [o('OT_ONE_OR_CROSS', 1070), o('OT_ONE_OR_TWO', 1160), o('OT_CROSS_OR_TWO', 3000)]),
    offer('Correct Score', 'Correct Score', [o('OT_UNTYPED', 7000, { label: '2-1' }), o('OT_UNTYPED', 9000, { label: '1-1' }), o('OT_UNTYPED', 20000, { label: '0-1' })]),
    offer('Total Corners', 'Over/Under', [o('OT_OVER', 1900, { line: 9500 }), o('OT_UNDER', 1900, { line: 9500 })]),
    offer('First Goal', 'Match', [o('OT_ONE', 1500), o('OT_TWO', 3000)]),
    offer('To Score', 'Player Occurrence Line', [o('OT_YES', 3300, { line: 1000, participant: 'Bukayo Saka' })]),
    offer("Player's shots on target (Settled using Opta data)", 'Player Occurrence Line', [o('OT_OVER', 1800, { line: 1500, participant: 'Bukayo Saka' }), o('OT_UNDER', 2000, { line: 1500, participant: 'Bukayo Saka' })]),
    offer('First Goal Scorer', 'Player Occurrence Number', [o('OT_PLAYER_PARTICIPANT', 5000, { participant: 'Bukayo Saka' }), o('OT_NO_GOAL', 11000)])
  ]
};
const game = (home, away) => ({ id: 'epl_g', sport: 'epl', startUtc: '2026-10-10T11:30:00.000Z', home: { en: home }, away: { en: away }, kambiId: 1, draftKings: { home: 0.7, draw: 0.18, away: 0.12 }, polymarket: null, house: null, total: { line: 2.5, overFair: 0.55 }, spread: null });

test('Kambi\'s markets: the board\'s sides, margin-free prices, only lines the page settles', () => {
  const { markets } = parseOffers(data, game('Arsenal', 'Leeds United'));
  const by = kind => markets.filter(m => m.kind === kind);
  // The quarter line (2.25) is left out.
  assert.deepEqual(by('total').map(m => m.line), [2.5]);
  assert.ok(Math.abs(by('total')[0].picks[0].fair - 2000 / 3800) < 1e-9);
  assert.deepEqual(by('runline')[0].awayLine, 1.5);
  assert.equal(by('teamtotal')[0].team, 'away');
  assert.deepEqual(by('dnb')[0].picks.map(p => p.side), ['home', 'away']);
  assert.deepEqual(by('dc')[0].picks.map(p => p.side), ['home|draw', 'home|away', 'draw|away']);
  assert.deepEqual(by('score')[0].picks.map(p => p.score), ['2-1', '1-1', '0-1']);
  assert.equal(by('corners')[0].line, 9.5);
  // Not a market the page settles: left out.
  assert.equal(markets.some(m => /first/i.test(m.market)), false);
  // ESPN with the sides the other way: every side turned.
  const flipped = parseOffers(data, game('Leeds United', 'Arsenal')).markets;
  assert.equal(flipped.find(m => m.kind === 'teamtotal').team, 'home');
  assert.equal(flipped.find(m => m.kind === 'runline').awayLine, -1.5);
  assert.deepEqual(flipped.find(m => m.kind === 'score').picks.map(p => p.score), ['1-0', '1-1', '1-2']);
  assert.deepEqual(flipped.find(m => m.kind === 'dc').picks.map(p => p.side), ['draw|away', 'home|away', 'home|draw']);
});

test('the board takes Kambi\'s markets over the model\'s; players\' picks cap the ticket', () => {
  const g = game('Arsenal', 'Leeds United');
  const model = gameOptions(g);
  g.offers = parseOffers(data, g);
  const real = gameOptions(g);
  // The same id for the main total either way: a pick on the slip stays put.
  assert.ok(model.some(x => x.id === 'epl_g|tot|2.5|over') && real.some(x => x.id === 'epl_g|tot|2.5|over' && x.real));
  assert.deepEqual(real.filter(x => x.kind === 'total').map(x => x.totalLine), [2.5, 2.5]);
  assert.ok(real.some(x => x.kind === 'corners') && real.some(x => x.kind === 'dnb'));
  const props = real.filter(x => x.kind === 'prop');
  assert.equal(props.length, 4);
  const saka = props.find(x => x.stat === 'goals');
  assert.ok(Math.abs(saka.fairChance - 1 / 3.3 / 1.1) < 1e-9);
  assert.ok(props.every(x => x.cap === 'prop'));
  assert.deepEqual(slipErrors({ mode: 'single', legs: [{ ...saka, odds: saka.estOdds }], sizes: [1], stake: SLIP_RULES.capped + 10 }), ['ticketCapped']);
});

test('only whole-game player markets the box score has', () => {
  assert.deepEqual(propOf('soccer', 'To score at least 2 goals', 'Player Occurrence Line'), { stat: 'goals', line: 2 });
  assert.deepEqual(propOf('baseball', '3+ Hits by the Player - Including Extra Innings (Listed player must be in starting lineup for bets to stand)', 'Player Occurrence Line'), { stat: 'hits', line: 3 });
  assert.equal(propOf('baseball', '1+ Doubles by the Player - Including Extra Innings', 'Player Occurrence Line'), null);
  assert.equal(propOf('football', '125+ Passing Yards By The Player - First Half', 'Player Occurrence Line'), null);
  assert.deepEqual(propOf('football', '225+ Passing Yards By The Player - Including Overtime', 'Player Occurrence Line'), { stat: 'passYds', line: 225 });
});

test('players settle from the box score; a player who didn\'t play is void', () => {
  const summary = {
    rosters: [{ roster: [
      { athlete: { displayName: 'Bukayo Saka' }, starter: true, stats: [{ name: 'totalGoals', value: 1 }, { name: 'shotsOnTarget', value: 2 }, { name: 'goalAssists', value: 0 }] },
      { athlete: { displayName: 'Ben White' }, starter: false, subbedIn: false, stats: [] }
    ] }],
    keyEvents: [
      { scoringPlay: true, type: { text: 'Own Goal' }, participants: [{ athlete: { displayName: 'Ben White' } }] },
      { scoringPlay: true, type: { text: 'Goal' }, participants: [{ athlete: { displayName: 'Bukayo Saka' } }] }
    ]
  };
  assert.equal(boxPlayers(summary).size, 2);
  assert.equal(firstScorer(summary), 'Bukayo Saka');
  const r = leg => legResult({ kind: 'prop', ...leg }, { status: 'final', awayScore: 0, homeScore: 2, prop: propOutcome(leg, summary) });
  assert.equal(r({ stat: 'goals', line: 1, side: 'yes', player: 'Bukayo Saka' }), 'won');
  assert.equal(r({ stat: 'goals', line: 2, side: 'yes', player: 'Bukayo Saka' }), 'lost');
  assert.equal(r({ stat: 'sot', line: 1.5, side: 'over', player: 'Bukayo Saka' }), 'won');
  assert.equal(r({ stat: 'first', line: null, side: 'yes', player: 'Bukayo Saka' }), 'won');
  assert.equal(r({ stat: 'goals', line: 1, side: 'yes', player: 'Ben White' }), 'void');
  assert.equal(r({ stat: 'goals', line: 1, side: 'yes', player: 'Nobody Here' }), 'void');
  // MLB: only the starting lineup stands.
  const box = { boxscore: { players: [{ statistics: [{ type: 'batting', keys: ['hits-atBats', 'atBats', 'runs', 'hits', 'RBIs', 'homeRuns'], athletes: [
    { athlete: { displayName: 'Francisco Lindor' }, starter: true, stats: ['2-4', '4', '2', '2', '1', '1'] },
    { athlete: { displayName: 'Bench Bat' }, starter: false, stats: ['1-1', '1', '0', '1', '0', '0'] }
  ] }] }] } };
  assert.deepEqual(propOutcome({ stat: 'hrr', player: 'Francisco Lindor' }, box), { status: 'final', value: 5 });
  assert.equal(propOutcome({ stat: 'hits', player: 'Bench Bat' }, box).status, 'void');
  assert.equal(propResult({ stat: 'hits', line: 1.5, side: 'under' }, { status: 'final', value: 2 }), 'lost');
});

test('new kinds settle: draw no bet, corners, the first set, the set score', () => {
  const draw = { status: 'final', awayScore: 1, homeScore: 1 };
  assert.equal(legResult({ kind: 'dnb', side: 'home' }, draw), 'void');
  assert.equal(legResult({ kind: 'corners', side: 'over', line: 9.5 }, { ...draw, corners: { home: 7, away: 4 } }), 'won');
  assert.equal(legResult({ kind: 'corners', side: 'over', line: 9.5 }, draw), null);
  const tennis = { status: 'final', homeScore: 2, awayScore: 1, homeInnings: [4, 6, 6], awayInnings: [6, 3, 2] };
  assert.equal(legResult({ kind: 'set1', side: 'away' }, tennis), 'won');
  assert.equal(legResult({ kind: 'setscore', score: '2-1' }, tennis), 'won');
  assert.ok(LINES_SHOWN >= 5);
});
