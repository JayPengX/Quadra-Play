// UFC, rugby union and the FA Cup in Play: priced, named, settled; players' flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEspnFight, findEspnGame, parseFighterFlags, liveLeagues } from '../public/lib/sources.mjs';
import { parseKambiEvents } from '../public/lib/kambi.mjs';
import { LEAGUES, familyOf, isNeutral, isPlayers, playerNation } from '../public/lib/teams.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { legResult } from '../public/lib/account.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('UFC, rugby union, the new basketball and Asian soccer and the FA Cup are Play leagues, from the shared catalogue', () => {
  assert.equal(LEAGUES.ufc.kambi, 'ufc_mma/ufc');
  assert.equal(familyOf('ufc'), 'mma');
  assert.ok(isNeutral('ufc') && isPlayers('ufc'));
  assert.ok(LEAGUES.rugbyunion.scores.includes('rugby/180659'));
  assert.equal(familyOf('rugbyunion'), 'rugby');
  assert.equal(LEAGUES.acb.kambi, 'basketball/spain/liga_acb');
  assert.equal(familyOf('nbl'), 'basketball');
  assert.equal(LEAGUES.acl.path, 'soccer/afc.champions');
  assert.equal(LEAGUES.asiancup.path, 'soccer/afc.asian.cup');
  // Gone for good (2026-09-30): not even kept for settling.
  for (const key of ['nrl', 'afl', 'nascar', 'indycar', 'aleague', 'csl', 'nwsl', 'austria', 'chile']) assert.equal(LEAGUES[key], undefined, key);
  assert.equal(LEAGUES.facup.path, 'soccer/eng.fa');
  for (const key of ['tennis', 'wta', 'badminton', 'tabletennis', 'snooker']) assert.ok(isPlayers(key), key);
});

test("a UFC bout from Kambi is a two-way match: the winner only, both sides priced", () => {
  const games = parseKambiEvents(fixture('kambi-ufc-2026-09-30.json'), 'ufc', new Date('2026-09-30T00:00:00Z'));
  assert.equal(games.length, 3);
  const [g] = games;
  assert.equal(g.home.en, 'Marvin Vettori');
  assert.ok(Math.abs(g.draftKings.home + g.draftKings.away - 1) < 1e-9);
  assert.deepEqual(g.where, ['UFC', 'ufc_mma', 'ufc']);
  const options = gameOptions(g);
  assert.deepEqual([...new Set(options.map(o => o.kind))], ['ml']);
  assert.deepEqual(options.map(o => o.side).sort(), ['away', 'home']);
});

test('a fight is settled from ESPN\'s card, by the fighters in either order', () => {
  const card = fixture('espn-ufc-2026-09-26.json');
  // Kambi lists Jauregui first; ESPN the other way round.
  const r = parseEspnFight(card, 'Yazmin Jauregui', 'Vanessa Demopoulos');
  assert.deepEqual(r, { status: 'final', homeScore: 1, awayScore: 0 });
  assert.equal(legResult({ kind: 'ml', side: 'home' }, r), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'away' }, r), 'lost');
  assert.equal(parseEspnFight(card, 'Nobody Here', 'Somebody Else'), null);
  // A draw or no contest (no winner on a finished bout) gives the stake back.
  const draw = { events: [{ competitions: [{ status: { type: { completed: true, state: 'post', name: 'STATUS_FINAL' } }, competitors: [{ athlete: { displayName: 'A One' } }, { athlete: { displayName: 'B Two' } }] }] }] };
  assert.deepEqual(parseEspnFight(draw, 'A One', 'B Two'), { status: 'void' });
  // Fighters' flags for their pictures.
  assert.ok(parseFighterFlags(card).some(([name, flag]) => name === 'Yazmin Jauregui' && /countries\/500\/mex\.png$/.test(flag)));
});

test('rugby games Kambi priced are found on ESPN by club words, sides turned when ESPN has them the other way', () => {
  const espn = [{ sport: 'rugbyunion', startUtc: '2026-10-04T08:30:00.000Z', home: 'Sydney Roosters', away: 'Newcastle Knights', status: 'final', homeScore: 20, awayScore: 18, homeInnings: [], awayInnings: [] }];
  const same = findEspnGame(espn, { start: '2026-10-04T08:30:00Z', home: 'Roosters', away: 'Knights' });
  assert.equal(same.homeScore, 20);
  const turned = findEspnGame(espn, { start: '2026-10-04T08:30:00Z', home: 'Newcastle Knights', away: 'Sydney Roosters' });
  assert.deepEqual([turned.homeScore, turned.awayScore], [18, 20]);
  assert.equal(findEspnGame(espn, { start: '2026-10-06T08:30:00Z', home: 'Roosters', away: 'Knights' }), null);
});

test('rugby union gets the points markets, whole game only', () => {
  const game = { id: 'ru_x', sport: 'rugbyunion', startUtc: '2026-10-04T08:30:00.000Z', away: { en: 'A', zh: 'A' }, home: { en: 'B', zh: 'B' }, draftKings: { home: 0.6, away: 0.4 }, polymarket: null, spread: { awayLine: 4.5, awayFair: 0.5 }, total: { line: 44.5, overFair: 0.5 } };
  const kinds = new Set(gameOptions(game).map(o => o.kind));
  for (const k of ['ml', 'runline', 'total', 'margin']) assert.ok(kinds.has(k), k);
  for (const k of ['half', 'htotal', 'q1']) assert.ok(!kinds.has(k), k);
});

test("a game Fixtures sent here is read live even when the board didn't list its league", () => {
  assert.ok(liveLeagues(new Date(), ['nhl']).includes('nhl'));
  assert.ok(!liveLeagues(new Date(), ['nope']).includes('nope'));
});

test("players' nations: the kit's table, else where Kambi files the match", () => {
  assert.equal(playerNation('Lin Yun-Ju'), 'TW');
  assert.equal(playerNation('Mark Williams'), 'GB-WLS');
  assert.equal(playerNation('Radek Bartunek', ['Czech Liga Pro', 'table_tennis', 'czech_republic', 'czech_liga_pro']), 'CZ');
  assert.equal(playerNation('Marian Lebek', ['TT Elite Series', 'table_tennis', 'tt_elite_series']), 'PL');
  assert.equal(playerNation('Nobody Known', ['Some Open']), null);
});

test('K League from Kambi: three-way prices, full-time markets only, a draw settles from the last score', async () => {
  const { decidedTeamGame } = await import('../public/lib/kambi.mjs');
  const offer = (type, label, outcomes) => ({ betOfferType: { englishName: type }, criterion: { englishLabel: label }, outcomes });
  const data = { events: [{ event: { id: 9, homeName: 'Ulsan HD', awayName: 'Jeonbuk Hyundai Motors', start: '2026-10-04T05:00:00Z', state: 'NOT_STARTED', path: ['football', 'south_korea', 'k-league_1'] },
    betOffers: [offer('Match', 'Full Time', [{ type: 'OT_ONE', odds: 2100 }, { type: 'OT_CROSS', odds: 3300 }, { type: 'OT_TWO', odds: 3500 }]), offer('Over/Under', 'Total Goals', [{ type: 'OT_OVER', odds: 1900, line: 2500 }, { type: 'OT_UNDER', odds: 1900, line: 2500 }])] }] };
  const [g] = parseKambiEvents(data, 'kleague', new Date('2026-10-01T00:00:00Z'));
  assert.ok(g.draftKings.draw > 0.25 && Math.abs(g.draftKings.home + g.draftKings.draw + g.draftKings.away - 1) < 1e-9);
  assert.ok(g.scoreOnly);
  const kinds = new Set(gameOptions(g).map(o => o.kind));
  assert.ok(kinds.has('ml') && kinds.has('total'));
  assert.ok(gameOptions(g).some(o => o.side === 'draw'));
  const live = { score: { home: 1, away: 1 }, periods: { home: [], away: [] }, sets: null, changedAt: null, clock: null };
  const result = decidedTeamGame(live, 'kleague', '2026-10-04T05:00:00Z', new Date('2026-10-04T07:10:00Z'), { ended: true });
  assert.deepEqual([result.status, result.homeScore, result.awayScore], ['final', 1, 1]);
  assert.equal(legResult({ kind: 'ml', side: 'draw' }, result), 'won');
  assert.equal(decidedTeamGame(live, 'kleague', '2026-10-04T05:00:00Z', new Date('2026-10-04T06:00:00Z')), null);
});

test('every league Play sells sits in one of the sport filter groups', async () => {
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const fixed = [...src.matchAll(/leagues: \[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9]+)'/g)].map(x => x[1]));
  for (const [key, l] of Object.entries(LEAGUES)) assert.ok(['soccer', 'basketball'].includes(l.family) || fixed.includes(key), key);
});
