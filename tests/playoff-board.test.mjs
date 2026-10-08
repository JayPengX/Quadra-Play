// The board in a play-off: no game that won't be played, no side not known
// yet, no game without its time unless a book gives one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnScoreboard, mergeGames, attachKambi } from '../public/lib/sources.mjs';

const team = (id, name, abbreviation) => ({ id, displayName: name, abbreviation });
const event = (id, date, away, home, { note = '', timeValid = true } = {}) => ({
  id, date,
  competitions: [{ status: { type: { state: 'pre' } }, timeValid, notes: note ? [{ headline: note }] : [], competitors: [{ homeAway: 'away', team: away }, { homeAway: 'home', team: home }] }]
});
const NYY = team('10', 'New York Yankees', 'NYY');
const TB = team('30', 'Tampa Bay Rays', 'TB');
const LAD = team('19', 'Los Angeles Dodgers', 'LAD');
const MIL = team('8', 'Milwaukee Brewers', 'MIL');

test("ESPN: a side not known yet, or a game only if needed, isn't on the board", () => {
  const games = parseEspnScoreboard({ events: [
    event('1', '2026-10-12T04:00Z', team('-2', 'CLE/CHW', 'CLE/CHW'), TB, { note: 'ALCS - Game 1', timeValid: false }),
    event('2', '2026-10-12T04:00Z', team('-1', 'TBD', 'TBD'), TB, { note: 'ALCS - Game 1', timeValid: false }),
    event('3', '2026-10-11T00:00Z', NYY, TB, { note: 'ALDS - Game 5 If Necessary' }),
    event('4', '2026-10-11T04:00Z', LAD, MIL, { note: 'NLCS - Game 1', timeValid: false })
  ] }, 'mlb');
  assert.deepEqual(games.map(g => g.away), ['Los Angeles Dodgers']);
  assert.equal(games[0].timeTbd, true);
});

test("a game ESPN hasn't timed: a book's time, else not sold", () => {
  const [g] = parseEspnScoreboard({ events: [event('4', '2026-10-11T04:00Z', LAD, MIL, { note: 'NLCS - Game 1', timeValid: false })] }, 'mlb');
  assert.equal(mergeGames([g], [], { scheduled: new Set(['mlb']) }).length, 0);
  const pm = { sport: 'mlb', startUtc: '2026-10-12T00:08:00.000Z', away: 'Los Angeles Dodgers', home: 'Milwaukee Brewers', outcomes: { away: 0.55, home: 0.45 } };
  const [withPm] = mergeGames([g], [pm], { scheduled: new Set(['mlb']) });
  assert.equal(withPm.startUtc, pm.startUtc);
  const kambi = { startUtc: '2026-10-12T00:08:00.000Z', home: { en: 'Milwaukee Brewers' }, away: { en: 'Los Angeles Dodgers' }, draftKings: { home: 0.45, away: 0.55 }, kambiId: 'k1' };
  const [withKambi] = attachKambi([g], [kambi]);
  assert.equal(withKambi.startUtc, kambi.startUtc);
  assert.ok(!withKambi.timeTbd);
});

test("a Polymarket game not on ESPN's schedule isn't one (a series already over)", () => {
  const pm = { sport: 'mlb', startUtc: '2026-10-11T00:00:00.000Z', away: 'New York Yankees', home: 'Tampa Bay Rays', outcomes: { away: 0.5, home: 0.5 } };
  assert.equal(mergeGames([], [pm], { scheduled: new Set(['mlb']) }).length, 0);
  // ESPN unread: Polymarket's list stands in.
  assert.equal(mergeGames([], [pm], { scheduled: new Set() }).length, 1);
});
