import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEspnScoreboard } from '../public/lib/sources.mjs';
import * as k from '#kit/postseason.mjs';

const list = k.mlbPostseason(JSON.parse(await readFile(new URL('./fixtures/mlb-postseason-2026-10-10.json', import.meta.url))));
const team = (name, id) => ({ id, displayName: name, abbreviation: name.slice(0, 3).toUpperCase() });
const event = (id, date, note, home, away, timeValid = true) => ({
  id,
  date,
  season: { type: 3 },
  competitions: [{ timeValid, status: { type: { state: 'pre' } }, notes: [{ headline: note }], competitors: [{ homeAway: 'home', team: team(...home) }, { homeAway: 'away', team: team(...away) }], odds: [{ moneyline: { home: { close: { odds: '-130' } }, away: { close: { odds: '+110' } } } }] }]
});

test("MLB's postseason list over ESPN's copy: a game made sure is sold, one off the list (its series over) isn't, MLB's time stands", () => {
  const page = {
    events: [
      // ESPN still says If Necessary; at 2-2 MLB says it's on.
      event('1', '2026-10-11T00:00Z', 'ALDS - Game 5 If Necessary', ['Cleveland Guardians', '5'], ['Chicago White Sox', '4']),
      // The Rays' series with the Yankees is over: no Game 5.
      event('2', '2026-10-10T00:00Z', 'ALDS - Game 5 If Necessary', ['Tampa Bay Rays', '30'], ['New York Yankees', '10']),
      // ESPN's copy hadn't the time; MLB has.
      event('3', '2026-10-15T04:00Z', 'NLCS - Game 4', ['Los Angeles Dodgers', '19'], ['Milwaukee Brewers', '8'], false)
    ]
  };
  const games = parseEspnScoreboard(page, 'mlb', { k, from: '2026-10-09', list });
  assert.deepEqual(
    games.map(g => [g.home, g.startUtc, Boolean(g.timeTbd)]),
    [
      ['Cleveland Guardians', '2026-10-11T00:00:00.000Z', false],
      ['Los Angeles Dodgers', '2026-10-16T01:00:00.000Z', false]
    ]
  );
  // Without MLB's list (an older kit): ESPN's as before.
  assert.deepEqual(parseEspnScoreboard(page, 'mlb').map(g => g.home), ['Los Angeles Dodgers']);
});
