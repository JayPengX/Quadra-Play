// Play's own model fills every market Kambi leaves out: players' picks from
// their season numbers, soccer's draw no bet and corners, tennis's sets and games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, parseAthletes, totalsOf, blendTotals, playerByName } from '../public/lib/players.mjs';
import { modelProps, atLeast, binomAtLeast, normalOver, teamScores } from '../public/lib/propmodel.mjs';
import { matchModel, tennisMarkets, matchWin, setWin, gameEdge } from '../public/lib/tennis.mjs';
import { gameOptions } from '../public/lib/board.mjs';

test('distributions add up', () => {
  assert.ok(Math.abs(atLeast(0.3, 1) - (1 - Math.exp(-0.3))) < 1e-6);
  assert.ok(Math.abs(binomAtLeast(4, 0.25, 1) - (1 - 0.75 ** 4)) < 1e-9);
  assert.ok(Math.abs(normalOver(20, 5, 20) - 0.5) < 1e-6);
  assert.deepEqual(teamScores('basketball', { total: 220, spread: -4 }), { home: 108, away: 112 });
});

test('rosters and season lists become players with the board\'s stat names', () => {
  const roster = { athletes: [{ position: 'x', items: [{ id: 7, displayName: 'Matt Olson', position: { abbreviation: '1B' }, headshot: { href: 'https://a.espncdn.com/i/headshots/mlb/players/full/7.png' } }] }] };
  const [p] = parseRoster(roster, 'mlb');
  assert.equal(p.name, 'Matt Olson');
  assert.ok(p.photo.includes('combiner') && p.photo.includes('/7.png'));
  const list = parseAthletes({ categories: [{ name: 'batting', names: ['gamesPlayed', 'atBats', 'runs', 'hits', 'homeRuns', 'RBIs'] }], athletes: [{ athlete: { id: '7', displayName: 'Matt Olson', teamId: '15' }, categories: [{ name: 'batting', values: [160, 600, 90, 160, 41, 93] }] }] });
  const t = totalsOf('baseball', list.get('7').raw);
  assert.deepEqual([t.gp, t.ab, t.hr, t.rbi], [160, 600, 41, 93]);
  assert.deepEqual(blendTotals({ gp: 2, goals: 1 }, { gp: 30, goals: 10 }), { gp: 17, goals: 6 });
  assert.equal(playerByName([{ name: 'J.T. Realmuto' }], 'JT Realmuto')?.name, 'J.T. Realmuto');
});

test('the model prices every regular, scaled by the team\'s expected score', () => {
  const batter = (name, side, hr) => ({ name, side, pos: '1B', out: false, gp: 150, totals: { gp: 150, ab: 580, hits: 150, runs: 80, rbi: 85, hr } });
  const props = modelProps('mlb', [batter('Slugger', 'home', 45), batter('Slapper', 'away', 5), { ...batter('Hurt', 'home', 30), out: true }, { ...batter('Pitcher', 'home', 0), pos: 'SP' }], { home: 5.5, away: 3.5 });
  const hr = name => props.find(p => p.player === name && p.stat === 'hr').fair;
  assert.ok(hr('Slugger') > 0.2 && hr('Slapper') < 0.06, `${hr('Slugger')} ${hr('Slapper')}`);
  assert.ok(!props.some(p => p.player === 'Hurt' || p.player === 'Pitcher'));
  assert.ok(props.every(p => p.model && p.fair > 0 && p.fair < 1));
  // Soccer: a striker's goal and the first goal; a keeper none.
  const soccer = modelProps('epl', [
    { name: 'Striker', side: 'home', pos: 'F', gp: 10, totals: { gp: 10, subIns: 0, goals: 7, assists: 2, sot: 15 } },
    { name: 'Keeper', side: 'home', pos: 'G', gp: 10, totals: { gp: 10, subIns: 0, goals: 0, assists: 0, sot: 0 } }
  ], { home: 2, away: 1 });
  const goal = soccer.find(p => p.stat === 'goals' && p.line === 1).fair;
  const first = soccer.find(p => p.stat === 'first').fair;
  assert.ok(goal > 0.4 && first < goal && first > 0.1, `${goal} ${first}`);
  assert.ok(!soccer.some(p => p.player === 'Keeper'));
});

test('tennis from the winner\'s price: sets and games that add up', () => {
  const q = gameEdge(0.7);
  assert.ok(Math.abs(matchWin(setWin(q)) - 0.7) < 1e-6);
  const m = matchModel(0.7);
  assert.ok(Math.abs([...m.setScore.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const markets = tennisMarkets(0.3, { cut: { twoWay: 1.158, bands: 1.35 } });
  // The away side is the favourite: the first set leans away.
  const set1 = markets.find(x => x.kind === 'set1');
  assert.ok(set1.picks.find(p => p.side === 'away').fair > 0.55);
  assert.equal(markets.filter(x => x.kind === 'gametotal').length, 3);
  assert.equal(markets.filter(x => x.kind === 'gamehcap').length, 3);
  const best5 = matchModel(0.7, 5);
  assert.ok([...best5.setScore.keys()].includes('3-2'));
});

test('the board falls back to the model: draw no bet and corners for soccer, sets for tennis, players once read', () => {
  const soccer = { id: 's', sport: 'epl', startUtc: '2026-10-10T11:30:00.000Z', home: { en: 'A' }, away: { en: 'B' }, draftKings: { home: 0.5, draw: 0.27, away: 0.23 }, polymarket: null, house: null, total: { line: 2.5, overFair: 0.5 }, spread: null };
  const kinds = new Set(gameOptions(soccer).map(o => o.kind));
  for (const k of ['dnb', 'corners', 'btts', 'dc', 'score']) assert.ok(kinds.has(k), k);
  const tennis = { id: 't', sport: 'atp', startUtc: '2026-10-10T03:00:00.000Z', home: { en: 'P' }, away: { en: 'Q' }, draftKings: { home: 0.6, away: 0.4 }, polymarket: null, house: null, total: null, spread: null, group: 'Tokyo' };
  const tk = new Set(gameOptions(tennis).map(o => o.kind));
  for (const k of ['ml', 'set1', 'setscore', 'gametotal', 'gamehcap']) assert.ok(tk.has(k), k);
  // Players: the model's picks, with the player's picture.
  const withPlayers = { ...soccer, players: [{ name: 'Striker', side: 'home', pos: 'F', gp: 10, photo: 'x.png', totals: { gp: 10, subIns: 0, goals: 7, assists: 2, sot: 15 } }] };
  const props = gameOptions(withPlayers).filter(o => o.kind === 'prop');
  assert.ok(props.length >= 5 && props.every(p => p.photo === 'x.png' && p.cap === 'prop'));
  // Kambi's own pick for the same player and line wins over the model's.
  const both = gameOptions({ ...withPlayers, offers: { markets: [], props: [{ stat: 'goals', line: 1, side: 'yes', player: 'Striker', fair: 0.3 }] } }).filter(o => o.kind === 'prop' && o.stat === 'goals' && o.propLine === 1);
  assert.equal(both.length, 1);
  assert.equal(both[0].fairChance, 0.3);
});
