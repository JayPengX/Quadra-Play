// The leagues Play sells: from the shared catalogue, the purged ones gone
// K League's prices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKambiEvents } from '../public/lib/kambi.mjs';
import { LEAGUES, familyOf } from '../public/lib/teams.mjs';
import { gameOptions } from '../public/lib/board.mjs';
import { legResult } from '../public/lib/account.mjs';

test('Play leagues come from the shared catalogue; the purged sports are gone, not hidden; tennis, UFC and the new leagues are back', () => {
  assert.equal(LEAGUES.facup.path, 'soccer/eng.fa');
  assert.equal(familyOf('euroleague'), 'basketball');
  for (const key of ['badminton', 'boxing', 'tennis', 'tabletennis', 'volleyball', 'snooker', 'cricket', 'rugbyunion', 'acb', 'cba', 'kbl', 'bleague', 'acl', 'asiancup', 'wcqeurope', 'nrl', 'afl']) assert.equal(LEAGUES[key], undefined, key);
  for (const l of Object.values(LEAGUES)) assert.equal(l.off, undefined);
  for (const key of ['atp', 'wta', 'ufc']) assert.ok(LEAGUES[key].kambi && LEAGUES[key].results, key);
  for (const key of ['ncaaf', 'nbl', 'championship', 'eredivisie', 'ligamx', 'brasileirao']) assert.ok(LEAGUES[key].path && LEAGUES[key].book, key);
  // An ESPN league Kambi lists: Kambi's prices first.
  assert.equal(LEAGUES.epl.book, 'football/england/premier_league');
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
