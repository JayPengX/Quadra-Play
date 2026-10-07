import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEspnScoreboard, parsePolymarketMlb, parsePolymarketEpl, mergeGames, parseF1RaceWinner } from '../public/lib/sources.mjs';

const NOW = new Date('2026-09-25T12:00:00Z');

const espn = {
  events: [
    {
      date: '2026-09-25T22:40Z',
      competitions: [
        {
          status: { type: { state: 'pre' } },
          competitors: [
            { homeAway: 'home', team: { displayName: 'Detroit Tigers' } },
            { homeAway: 'away', team: { displayName: 'Pittsburgh Pirates' } }
          ],
          odds: [
            {
              moneyline: { away: { close: { odds: '-109' } }, home: { close: { odds: '-110' } } },
              total: { over: { close: { line: 'o7.5', odds: '-102' } }, under: { close: { line: 'u7.5', odds: '-118' } } }
            }
          ]
        }
      ]
    },
    { date: '2026-09-25T01:40Z', competitions: [{ status: { type: { state: 'post' } }, competitors: [] }] }
  ]
};

const polymarket = [
  {
    title: 'Pittsburgh Pirates vs. Detroit Tigers',
    startTime: '2026-09-25T22:40:00Z',
    teams: [
      { name: 'Pittsburgh Pirates', ordering: 'away' },
      { name: 'Detroit Tigers', ordering: 'home' }
    ],
    markets: [
      { question: 'Pittsburgh Pirates vs. Detroit Tigers', outcomes: '["Pittsburgh Pirates","Detroit Tigers"]', outcomePrices: '["0.505","0.495"]', liquidity: '101745' },
      { question: 'Pittsburgh Pirates to win the 1st inning?', outcomes: '["Yes","No"]', outcomePrices: '["0.21","0.79"]' }
    ]
  },
  {
    title: 'Houston Astros vs. Athletics',
    startTime: '2026-09-25T01:40:00Z',
    teams: [{ name: 'Houston Astros', ordering: 'away' }, { name: 'Athletics', ordering: 'home' }],
    markets: [{ question: 'Houston Astros vs. Athletics', outcomes: '["Houston Astros","Athletics"]', outcomePrices: '["0.99","0.01"]' }]
  }
];

test('ESPN parser keeps only upcoming games and devigs moneyline and total', () => {
  const games = parseEspnScoreboard(espn, 'mlb');
  assert.equal(games.length, 1);
  assert.equal(games[0].away, 'Pittsburgh Pirates');
  assert.ok(Math.abs(games[0].outcomes.away - 0.4988) < 0.001);
  assert.equal(games[0].total.line, 7.5);
});

test('Polymarket parser skips started games and reads the moneyline market', () => {
  const games = parsePolymarketMlb(polymarket, NOW);
  assert.equal(games.length, 1);
  assert.ok(Math.abs(games[0].outcomes.away - 0.505) < 1e-9);
  assert.equal(games[0].liquidity, 101745);
});

test('mergeGames joins both sources and adds Chinese names', () => {
  const [game] = mergeGames(parseEspnScoreboard(espn, 'mlb'), parsePolymarketMlb(polymarket, NOW));
  assert.equal(game.sport, 'mlb');
  assert.equal(game.away.zh, '匹茲堡海盜');
  assert.equal(game.home.zh, '底特律老虎');
  assert.ok(Math.abs(game.polymarket.away - 0.505) < 1e-9);
  assert.ok(game.draftKings.away > 0.49);
  assert.equal(game.total.line, 7.5);
});

test('F1 parser picks the next race-winner event and devigs drivers', () => {
  const f1 = parseF1RaceWinner(
    [
      { slug: 'f1-azerbaijan-grand-prix-driver-pole-position-2026-09-25', startTime: '2026-09-25T12:00:00Z', markets: [] },
      {
        slug: 'f1-azerbaijan-grand-prix-winner-2026-09-26',
        title: 'Azerbaijan Grand Prix: Driver Winner',
        startTime: '2026-09-26T11:00:00Z',
        markets: [
          { groupItemTitle: 'Kimi Antonelli', outcomePrices: '["0.41","0.59"]' },
          { groupItemTitle: 'George Russell', outcomePrices: '["0.2","0.8"]' },
          { groupItemTitle: 'Lando Norris', outcomePrices: '["0.4","0.6"]', closed: true },
          { groupItemTitle: 'Yuki Tsunoda', outcomePrices: '["0.0005","0.9995"]' },
          { groupItemTitle: 'Driver A', outcomePrices: null },
          { groupItemTitle: 'Other', outcomePrices: '["0.001","0.999"]' }
        ]
      }
    ],
    NOW
  );
  // Every priced driver is listed, however long a longshot; placeholders aren't.
  assert.deepEqual(f1.drivers.map(d => d.name), ['Kimi Antonelli', 'George Russell', 'Yuki Tsunoda']);
  assert.equal(f1.drivers[0].name, 'Kimi Antonelli');
  assert.ok(Math.abs(f1.drivers.reduce((sum, d) => sum + d.fair, 0) - 1) < 1e-6);
});

const eplEspn = {
  events: [
    {
      date: '2026-10-10T11:30Z',
      competitions: [
        {
          status: { type: { state: 'pre' } },
          competitors: [
            { homeAway: 'home', team: { displayName: 'Arsenal' } },
            { homeAway: 'away', team: { displayName: 'Leeds United' } }
          ],
          odds: [
            {
              moneyline: { home: { close: { odds: '-270' } }, away: { close: { odds: '+650' } }, draw: { close: { odds: '+380' } } },
              total: { over: { close: { line: 'o2.5', odds: '-135' } }, under: { close: { line: 'u2.5', odds: '+100' } } }
            }
          ]
        }
      ]
    }
  ]
};

const eplPolymarket = [
  {
    title: 'Arsenal FC vs. Leeds United FC',
    startTime: '2026-10-10T11:30:00Z',
    teams: [
      { name: 'Arsenal FC', ordering: 'home' },
      { name: 'Leeds United FC', ordering: 'away' }
    ],
    markets: [
      { question: 'Will Arsenal FC win on 2026-10-10?', outcomes: '["Yes","No"]', outcomePrices: '["0.69","0.31"]', liquidity: '50000' },
      { question: 'Will Arsenal FC vs. Leeds United FC end in a draw?', outcomes: '["Yes","No"]', outcomePrices: '["0.19","0.81"]', liquidity: '20000' },
      { question: 'Will Leeds United FC win on 2026-10-10?', outcomes: '["Yes","No"]', outcomePrices: '["0.13","0.87"]', liquidity: '30000' },
      { question: 'Arsenal FC vs. Leeds United FC: O/U 2.5', outcomes: '["Over","Under"]', outcomePrices: '["0.55","0.45"]' }
    ]
  }
];

test('ESPN soccer parser devigs home/draw/away', () => {
  const [game] = parseEspnScoreboard(eplEspn, 'epl');
  const { away, draw, home } = game.outcomes;
  assert.ok(Math.abs(away + draw + home - 1) < 1e-9);
  assert.ok(home > 0.67 && home < 0.69);
  assert.ok(draw > 0.19 && draw < 0.2);
  assert.equal(game.total.line, 2.5);
});

test('Polymarket soccer parser reads the three yes/no markets', () => {
  const [game] = parsePolymarketEpl(eplPolymarket, NOW);
  assert.equal(game.home, 'Arsenal FC');
  assert.ok(Math.abs(game.outcomes.home - 0.69 / 1.01) < 1e-9);
  assert.equal(game.liquidity, 20000);
});

test('soccer games merge across name styles and get Chinese names', () => {
  const [game] = mergeGames(parseEspnScoreboard(eplEspn, 'epl'), parsePolymarketEpl(eplPolymarket, NOW));
  assert.equal(game.sport, 'epl');
  assert.equal(game.home.en, 'Arsenal');
  assert.equal(game.home.zh, '兵工廠');
  assert.equal(game.away.zh, '利茲聯');
  assert.ok(game.draftKings.draw > 0 && game.polymarket.draw > 0);
});

test('lottery window ends at the end of tomorrow, Taiwan time', async () => {
  const { lotteryWindowEnd, taipeiDayKey } = await import('../public/lib/sources.mjs');
  // 2026-09-25 23:30 in Taiwan is 15:30 UTC; the window ends 2026-09-27 00:00 Taiwan = 09-26 16:00 UTC.
  assert.equal(lotteryWindowEnd(new Date('2026-09-25T15:30:00Z')).toISOString(), '2026-09-26T16:00:00.000Z');
  // 00:30 Taiwan on 09-26 is still 09-25 in UTC, but already the 26th in Taiwan.
  assert.equal(taipeiDayKey('2026-09-25T16:30:00Z'), '2026-09-26');
  assert.equal(lotteryWindowEnd(new Date('2026-09-25T16:30:00Z')).toISOString(), '2026-09-27T16:00:00.000Z');
});

test('futures parser reads teams from questions and drops placeholders', async () => {
  const { parseFutures } = await import('../public/lib/sources.mjs');
  const market = (question, yes) => ({ question, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify([String(yes), String(1 - yes)]) });
  const events = [
    { title: 'MLB World Series Champion 2027', markets: [market('Will the New York Yankees win the 2027 World Series?', 0.2)] },
    {
      title: 'MLB World Series Champion 2026',
      markets: [
        market('Will the Los Angeles Dodgers win the 2026 World Series?', 0.6),
        market('Will the New York Yankees win the 2026 World Series?', 0.44),
        market('Will the Toronto Blue Jays win the 2026 World Series?', 0),
        market('Will another team win the 2026 World Series?', 0.5)
      ]
    },
    { title: 'MLB: 2026 AL Central Champion', markets: [market('Will Detroit Tigers win the AL Central?', 0.5)] },
    { title: 'Dodgers vs. Padres', startTime: '2026-09-26T02:00:00Z', markets: [] }
  ];
  const [ws, ...others] = parseFutures(events, 'mlb');
  assert.equal(others.length, 0);
  assert.equal(ws.key, 'ws');
  assert.equal(ws.season, '2026');
  assert.deepEqual(ws.teams.map(t => t.name.en), ['Los Angeles Dodgers', 'New York Yankees']);
  assert.equal(ws.teams[0].name.zh, '洛杉磯道奇');
  assert.ok(Math.abs(ws.teams[0].fair + ws.teams[1].fair - 1) < 1e-9);
  const [epl] = parseFutures(
    [{ title: 'EPL: 2027 Champion', markets: [market('Will Arsenal win the 2026-27 English Premier League (EPL) Championship?', 0.5), market('Will Team C win the 2026-27 English Premier League (EPL) Championship?', 0.5), market('Will Brighton win the 2026-27 English Premier League (EPL) Championship?', 0.02)] }],
    'epl'
  );
  assert.deepEqual(epl.teams.map(t => t.name.zh), ['兵工廠', '布萊頓']);
  assert.equal(epl.season, '2026/27');
});

test('every game not yet started is listed, up to two weeks ahead', async () => {
  const { lotteryGames, nextMatchweek } = await import('../public/lib/sources.mjs');
  const epl = (startUtc, away, home) => ({ sport: 'epl', startUtc, away: { en: away }, home: { en: home } });
  const round = [
    epl('2026-09-26T11:30:00Z', 'Chelsea', 'Arsenal'),
    epl('2026-09-26T14:00:00Z', 'Everton', 'Fulham'),
    epl('2026-09-27T15:30:00Z', 'Liverpool FC', 'Brighton'),
    epl('2026-09-28T19:00:00Z', 'Leeds United', 'Burnley')
  ];
  // Next round starts the day after: Arsenal again ends this matchweek.
  const next = [epl('2026-09-29T18:45:00Z', 'Arsenal', 'Everton'), epl('2026-09-29T19:00:00Z', 'Tottenham', 'Wolves')];
  assert.deepEqual(nextMatchweek([...next, ...round]), round);
  // A long break ends it too.
  assert.equal(nextMatchweek([round[0], epl('2026-10-10T14:00:00Z', 'Everton', 'Fulham')]).length, 1);
  const mlb = (startUtc, id) => ({ sport: 'mlb', startUtc, id, away: { en: 'A' }, home: { en: 'B' } });
  const now = new Date('2026-09-25T07:00:00Z'); // 15:00 on 09-25 in Taiwan
  const shown = lotteryGames([mlb('2026-09-26T02:00:00Z', 'tomorrow'), mlb('2026-09-26T23:00:00Z', 'day after'), mlb('2026-09-25T01:00:00Z', 'started'), ...round, ...next], now);
  assert.deepEqual(shown.filter(g => g.sport === 'mlb').map(g => g.id), ['tomorrow', 'day after']);
  assert.equal(shown.filter(g => g.sport === 'epl').length, 6);
  // A round a week and a half out is listed too; one past two weeks isn't.
  const soon = round.map(g => ({ ...g, startUtc: g.startUtc.replace('2026-09-2', '2026-10-0') }));
  assert.equal(lotteryGames(soon, now).length, 4);
  const later = round.map(g => ({ ...g, startUtc: g.startUtc.replace('2026-09-2', '2026-10-1') }));
  assert.equal(lotteryGames(later, now).length, 0);
});

test('the NBA shows only from opening night to the end of June', async () => {
  const { nbaInSeason } = await import('../public/lib/sources.mjs');
  // 2026-27 opens on Tuesday 20 October.
  assert.equal(nbaInSeason(new Date('2026-09-25T07:00:00Z')), false);
  assert.equal(nbaInSeason(new Date('2026-10-19T07:00:00Z')), false);
  assert.equal(nbaInSeason(new Date('2026-10-20T07:00:00Z')), true);
  assert.equal(nbaInSeason(new Date('2027-03-01T07:00:00Z')), true);
  assert.equal(nbaInSeason(new Date('2027-06-30T07:00:00Z')), true);
  assert.equal(nbaInSeason(new Date('2027-07-15T07:00:00Z')), false);
});

// Polymarket's F1 tag holds IndyCar's races too; one that's a "Grand Prix" and sooner is never F1's.
test("F1 parser never takes another series' grand prix", () => {
  const board = [
    { groupItemTitle: 'Kimi Antonelli', outcomePrices: '["0.5","0.5"]' },
    { groupItemTitle: 'George Russell', outcomePrices: '["0.3","0.7"]' },
    { groupItemTitle: 'Max Verstappen', outcomePrices: '["0.2","0.8"]' }
  ];
  const f1 = parseF1RaceWinner(
    [
      { slug: 'indycar-sonsio-grand-prix-winner-2026-09-26', title: 'IndyCar', startTime: '2026-09-26T09:00:00Z', markets: board },
      { slug: 'f1-azerbaijan-grand-prix-winner-2026-09-26', title: 'Azerbaijan Grand Prix: Driver Winner', startTime: '2026-09-26T11:00:00Z', markets: board }
    ],
    NOW
  );
  assert.equal(f1?.slug, 'f1-azerbaijan-grand-prix-winner-2026-09-26');
});

test("an F1 race's boards as one: each driver at the most any says, a trade counted as a price", async () => {
  const { mergeF1Boards, parseF1RaceWinner } = await import('../public/lib/sources.mjs');
  const merged = mergeF1Boards(
    { drivers: [{ name: 'Max Verstappen', fair: 0.27 }, { name: 'George Russell', fair: 0.025 }, { name: 'Carlos Sainz Jr.', fair: 0.005 }] },
    { drivers: [{ name: 'Max Verstappen', fair: 0.22 }, { name: 'George Russell', fair: 0.1 }, { name: 'Carlos Sainz', fair: 0.004 }] }
  );
  assert.deepEqual(merged.map(d => [d.name, d.fair]), [['Max Verstappen', 0.27], ['George Russell', 0.1], ['Carlos Sainz Jr.', 0.005]]);
  // Polymarket: a thin quote under a real trade gives way to the trade; a firm
  // quote (traded, tight) is the price whatever the older trades or Kambi say.
  const market = (name, price, last, volume, spread = 0.01) => ({ groupItemTitle: name, outcomePrices: JSON.stringify([String(price), String(1 - price)]), lastTradePrice: last, volume, closed: false, bestBid: price - spread / 2, bestAsk: price + spread / 2 });
  const now = new Date('2026-10-07T00:00:00Z');
  const event = { slug: 'f1-singapore-grand-prix-winner-2026-10-11', title: 'Singapore Grand Prix', startTime: '2026-10-11T12:00:00Z', markets: [market('Max Verstappen', 0.5, 0.5, 1300), market('Kimi Antonelli', 0.45, 0.45, 1200), market('George Russell', 0.028, 0.15, 3680, 0.004), market('Lando Norris', 0.025, 0.15, 900), market('Lewis Hamilton', 0.025, null, 0)] };
  const race = parseF1RaceWinner([event], now);
  const russell = race.drivers.find(d => d.name === 'George Russell');
  assert.ok(russell.firm && russell.fair === 0.028, 'firm: his quote as traded, not the old trade');
  assert.equal(race.drivers.find(d => d.name === 'Lando Norris').fair, 0.15, 'under $1,000 traded: the trade counts');
  assert.ok(race.drivers.find(d => d.name === 'Lewis Hamilton').fair < 0.05, 'never traded: its quote alone');
  const kambi = { drivers: [{ name: 'George Russell', fair: 0.11 }, { name: 'Lewis Hamilton', fair: 0.11 }] };
  const both = mergeF1Boards(race, kambi);
  assert.equal(both.find(d => d.name === 'George Russell').fair, russell.fair, "the firm quote over Kambi's");
  assert.equal(both.find(d => d.name === 'Lewis Hamilton').fair, 0.11, 'not firm: the most any gives');
});
