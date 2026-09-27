import test from 'node:test';
import assert from 'node:assert/strict';
import { kambiPeriods, parseKambiLiveData, decidedTeamGame, decidedFromLive } from '../public/lib/kambi.mjs';
import { legResult } from '../public/lib/account.mjs';

const at = iso => new Date(iso);
// Kambi's live data as it reads after a game (still "started", never "final").
const baseball = (info, home, away, version) => ({ liveData: { eventId: 1, score: { home: String(home), away: String(away), info, version } } });

test('Kambi periods: innings and quarters, home first', () => {
  assert.deepEqual(kambiPeriods('0-1 | 0-0 | 2-0'), { home: [0, 0, 2], away: [1, 0, 0] });
  assert.deepEqual(kambiPeriods('Q1: 11-16 | Q2: 22-24'), { home: [11, 22], away: [16, 24] });
  assert.deepEqual(kambiPeriods(''), { home: [], away: [] });
});

test('baseball settles once nine innings are in and the score has sat still', () => {
  const changed = Date.parse('2026-09-26T12:24:44Z');
  const live = parseKambiLiveData(baseball('0-1 | 0-0 | 2-0 | 0-0 | 1-0 | 0-0 | 2-1 | 2-0 | 0-0', 7, 2, changed));
  // Ten minutes after the last run: maybe still the top of the ninth.
  assert.equal(decidedTeamGame(live, 'npb', '2026-09-26T10:00:00Z', at('2026-09-26T12:35:00Z')), null);
  const final = decidedTeamGame(live, 'npb', '2026-09-26T10:00:00Z', at('2026-09-26T13:10:00Z'));
  assert.deepEqual({ ...final, homeInnings: final.homeInnings.length }, { status: 'final', homeScore: 7, awayScore: 2, homeInnings: 9, awayInnings: [1, 0, 0, 0, 0, 0, 1, 0, 0] });
  // Every kind of pick settles from it.
  assert.equal(legResult({ kind: 'ml', side: 'home' }, final), 'won');
  assert.equal(legResult({ kind: 'total', side: 'over', line: 8.5 }, final), 'won');
  assert.equal(legResult({ kind: 'f5', side: 'home' }, final), 'won');
  // Seven innings: not over, however long it's been.
  const short = parseKambiLiveData(baseball('1-0 | 0-0 | 0-0 | 0-0 | 0-0 | 0-0 | 0-0', 1, 0, changed));
  assert.equal(decidedTeamGame(short, 'kbo', '2026-09-26T10:00:00Z', at('2026-09-26T20:00:00Z')), null);
  // Level after the last extra inning (12 in NPB): a tie.
  const tie = parseKambiLiveData(baseball(Array(12).fill('0-0').join(' | '), 0, 0, changed));
  assert.equal(decidedTeamGame(tie, 'npb', '2026-09-26T10:00:00Z', at('2026-09-26T14:00:00Z')).status, 'final');
  const tie10 = parseKambiLiveData(baseball(Array(10).fill('0-0').join(' | '), 0, 0, changed));
  assert.equal(decidedTeamGame(tie10, 'npb', '2026-09-26T10:00:00Z', at('2026-09-26T14:00:00Z')), null);
});

test('basketball settles at the end of the fourth quarter (or overtime)', () => {
  const changed = Date.parse('2026-09-26T13:00:00Z');
  const data = { liveData: { score: { home: '83', away: '82', info: 'Q1: 22-26 | Q2: 25-25 | Q3: 29-22 | Q4: 7-9', version: changed }, matchClock: { periodId: 'QUARTER4', minutesLeftInPeriod: 0, secondsLeftInMinute: 0, running: false } } };
  const live = parseKambiLiveData(data);
  assert.equal(decidedTeamGame(live, 'euroleague', '2026-09-26T11:00:00Z', at('2026-09-26T13:02:00Z')), null);
  assert.equal(decidedTeamGame(live, 'euroleague', '2026-09-26T11:00:00Z', at('2026-09-26T13:06:00Z')).homeScore, 83);
  // Mid-game, the clock running: never.
  const running = parseKambiLiveData({ liveData: { score: { home: '52', away: '43', info: 'Q1: 26-22 | Q2: 26-21 | Q3: 0-0', version: changed }, matchClock: { periodId: 'QUARTER3', minutesLeftInPeriod: 5, running: true } } });
  assert.equal(decidedTeamGame(running, 'bleague', '2026-09-26T11:00:00Z', at('2026-09-26T18:00:00Z')), null);
});

test('set sports settle from the same live data', () => {
  const live = parseKambiLiveData({ liveData: { score: { home: '2', away: '0', info: '' }, statistics: { sets: { home: [21, 21, -1], away: [15, 18, -1] } } } });
  assert.equal(decidedFromLive(live, 'badminton').homeScore, 2);
});

test('the Worker\'s kept copy of a dropped match settles at once', () => {
  // Nine innings, the last score only five minutes before Kambi dropped it.
  const changed = Date.parse('2026-09-26T12:55:00Z');
  const live = parseKambiLiveData(baseball('0-1 | 0-0 | 2-0 | 0-0 | 1-0 | 0-0 | 2-1 | 2-0 | 0-0', 7, 2, changed));
  const now = at('2026-09-26T13:00:00Z');
  assert.equal(decidedTeamGame(live, 'npb', '2026-09-26T10:00:00Z', now), null);
  assert.equal(decidedTeamGame(live, 'npb', '2026-09-26T10:00:00Z', now, { ended: true }).homeScore, 7);
  // Dropped in the eighth: still not a result.
  const early = parseKambiLiveData(baseball('0-1 | 0-0 | 2-0 | 0-0 | 1-0 | 0-0 | 2-1 | 2-0', 7, 2, changed));
  assert.equal(decidedTeamGame(early, 'npb', '2026-09-26T10:00:00Z', now, { ended: true }), null);
});
