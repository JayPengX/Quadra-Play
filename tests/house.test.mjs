import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStandings, strengthOf, strengths, housePrices, withHousePrices } from '../public/lib/house.mjs';
import { mergeGames, monthsAhead, laterGames, DAYS_AHEAD } from '../public/lib/sources.mjs';
import { gameOptions } from '../public/lib/board.mjs';

const entry = (name, wins, losses, ties = 0) => ({ team: { displayName: name }, stats: [{ name: 'wins', value: wins }, { name: 'losses', value: losses }, { name: 'ties', value: ties }] });
const standings = (...entries) => ({ children: [{ standings: { entries: entries.slice(0, 1) } }, { children: [{ standings: { entries: entries.slice(1) } }] }] });

test('standings: every team, nested any depth, a draw half a win', () => {
  const table = parseStandings(standings(entry('Detroit Pistons', 60, 22), entry('Chicago Fire FC', 12, 8, 6)));
  assert.deepEqual(table.get('detroit pistons'), { wins: 60, games: 82 });
  assert.deepEqual(table.get('chicago fire'), { wins: 15, games: 26 });
  assert.equal(parseStandings(null).size, 0);
});

test('strength: last season pulled towards even before a game, this season taking over', () => {
  const last = { wins: 60, games: 82 };
  const preseason = strengthOf('nba', { wins: 0, games: 0 }, last);
  assert.ok(preseason > 0.6 && preseason < 60 / 82, `${preseason}`);
  assert.equal(strengthOf('nba', null, null), 0.5);
  // Half a season of losing outweighs last year's good one.
  assert.ok(strengthOf('nba', { wins: 10, games: 41 }, last) < 0.4);
});

test('a game: the stronger side favoured, the home side a little more, soccer with a draw', () => {
  const table = strengths('nba', new Map(), new Map([['detroit pistons', { wins: 60, games: 82 }], ['washington wizards', { wins: 18, games: 64 }]]));
  const p = housePrices('nba', 'Washington Wizards', 'Detroit Pistons', table);
  assert.ok(p.home > 0.75 && p.home < 0.97, `${p.home}`);
  assert.ok(Math.abs(p.home + p.away - 1) < 1e-9);
  const even = housePrices('nba', 'A', 'B', new Map());
  assert.ok(even.home > 0.53 && even.home < 0.6);
  assert.equal(housePrices('nba', 'A', 'B', new Map(), { neutral: true }).home, 0.5);
  const soccer = housePrices('epl', 'A', 'B', new Map());
  assert.ok(Math.abs(soccer.home + soccer.draw + soccer.away - 1) < 1e-9);
  assert.ok(soccer.draw > 0.25 && soccer.home > soccer.away);
});

test('unpriced games get the house\'s chances, every market on a capped ticket; priced ones keep theirs', async () => {
  const getJson = async url => (url.includes('season=') ? standings(entry('Detroit Pistons', 60, 22), entry('Miami Heat', 30, 52)) : { seasons: [{ year: 2027 }], ...standings(entry('Detroit Pistons', 0, 0)) });
  const games = await withHousePrices(
    [
      { sport: 'nba', startUtc: '2026-10-05T23:00:00.000Z', away: 'Miami Heat', home: 'Detroit Pistons', outcomes: null, total: null, spread: null },
      { sport: 'nba', startUtc: '2026-10-21T23:00:00.000Z', away: 'Boston Celtics', home: 'New York Knicks', outcomes: { away: 0.4, home: 0.6 }, total: null, spread: null }
    ],
    'nba',
    'basketball/nba',
    getJson
  );
  assert.ok(games[0].house.home > 0.6);
  assert.equal(games[1].house, undefined);
  const merged = mergeGames(games, []);
  assert.equal(merged.length, 2);
  const house = merged.find(g => g.house);
  assert.equal(house.draftKings, null);
  // Sold on every market, at the same cut as a bookmaker-priced game, on a
  // smaller ticket.
  const options = gameOptions(house);
  assert.ok(options.length > 10 && options.every(o => o.cap === 'house'));
  const priced = gameOptions({ ...house, draftKings: house.house, house: null });
  assert.ok(priced.every(o => !o.cap));
  assert.deepEqual(options.map(o => [o.id, o.estOdds]), priced.map(o => [o.id, o.estOdds]));
});

test('two weeks ahead: the months to ask for, only the games past the daily pages', () => {
  const now = new Date('2026-09-30T04:00:00Z');
  assert.deepEqual(monthsAhead(now), ['202610']);
  assert.deepEqual(monthsAhead(new Date('2026-10-25T04:00:00Z')), ['202611']);
  assert.deepEqual(monthsAhead(new Date('2026-10-20T04:00:00Z')), ['202610', '202611']);
  const g = (day, away = 'A', home = 'B') => ({ startUtc: `2026-10-${day}T23:00:00.000Z`, away, home });
  const listed = [g('03')];
  const later = laterGames([g('03'), g('08'), g('12'), g('12'), g('13', 'C', 'D'), g('20')], listed, now);
  assert.deepEqual(later.map(x => x.startUtc.slice(8, 10)), ['08', '12', '13']);
  assert.equal(DAYS_AHEAD, 14);
});

test('preseason: pulled halfway to even (starters sit)', () => {
  const table = new Map([['detroit pistons', 0.7], ['washington wizards', 0.3]]);
  const season = housePrices('nba', 'Washington Wizards', 'Detroit Pistons', table);
  const pre = housePrices('nba', 'Washington Wizards', 'Detroit Pistons', table, { preseason: true });
  assert.ok(pre.home > 0.5 && pre.home < season.home, `${pre.home} < ${season.home}`);
});
