// Kambi's leagues sell every game on their own schedules, not only the ones
// Kambi prices yet: a game Kambi hasn't priced is the house's to price
// (house.mjs), from what each schedule knows.
//
//   NPB, KBO, CPBL   the leagues' own month lists (the kit's asiaMonth), each
//                    club's strength from this season's results in them;
//                    settled from the same lists, which have final scores
//                    only (so only markets a final score settles: `scoreOnly`)
//   UFC              ESPN's cards, each fighter's strength from their record
//   ATP, WTA         ESPN's draws (singles), each player's strength from
//                    their ranking points
//   NRL, AFL         ESPN's schedules and standings (sources.mjs, like any
//                    ESPN league)
//   the rest         Kambi's own list, a match it lists without a price
//                    (kambi.mjs)
//
// Games come out shaped like parseEspnScoreboard's (names as strings,
// `outcomes: null`, the house's chances as `house`), so mergeGames makes them
// board games like any other.
import { housePrices, strengths, parseRecord, strengthOf } from './house.mjs';
import { normalizeTeamName } from './teams.mjs';

const game = (sport, startUtc, away, home, house, extra = {}) => ({ sport, startUtc: new Date(startUtc).toISOString(), away, home, neutral: false, preseason: false, outcomes: null, total: null, spread: null, house, ...extra });

// Asian baseball: each club's results in the month lists (games over) as
// { wins, games }.
export function asiaRecords(games) {
  const out = new Map();
  const add = (name, won) => {
    const key = normalizeTeamName(name);
    const r = out.get(key) || { wins: 0, games: 0 };
    out.set(key, { wins: r.wins + won, games: r.games + 1 });
  };
  for (const g of games || []) {
    if (g.state !== 'post' || g.homeScore == null || g.awayScore == null) continue;
    const h = Number(g.homeScore);
    const a = Number(g.awayScore);
    add(g.home.en, h > a ? 1 : h === a ? 0.5 : 0);
    add(g.away.en, a > h ? 1 : h === a ? 0.5 : 0);
  }
  return out;
}

// The games still to come in the month lists (`games` every month read,
// finished ones too, for the clubs' records).
export function parseAsiaSchedule(games, sport, now = new Date()) {
  const table = strengths(sport, asiaRecords(games), new Map());
  return (games || [])
    .filter(g => g.state === 'pre' && Date.parse(g.start) > now.getTime() && g.home?.en && g.away?.en)
    .map(g => game(sport, g.start, g.away.en, g.home.en, housePrices(sport, g.away.en, g.home.en, table), { scoreOnly: true, asiaId: g.id }));
}

const named = c => {
  const name = c?.athlete?.displayName || c?.team?.displayName || '';
  return name && !/\bTBA\b|\bTBD\b/i.test(name) ? name : null;
};
// A two-sided competition's sides, home first as Kambi lists them (ESPN's order 1).
function sides(comp) {
  const list = [...(comp.competitors || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const home = list.find(c => c.homeAway === 'home') || list[0];
  const away = list.find(c => c !== home);
  return home && away ? { home, away } : null;
}

// ESPN's fight cards: every bout not yet fought, each fighter's strength from
// their record (a short record counts little).
export function parseEspnCard(data, sport, now = new Date()) {
  const out = [];
  for (const event of data?.events || []) {
    for (const comp of event.competitions || []) {
      if (comp.status?.type?.state !== 'pre') continue;
      const s = sides(comp);
      const [home, away] = [named(s?.home), named(s?.away)];
      const start = comp.date || event.date;
      if (!home || !away || !(Date.parse(start) > now.getTime())) continue;
      const record = c => parseRecord(c.records?.find(r => r.type === 'total' || r.name === 'overall')?.summary);
      const table = new Map([
        [normalizeTeamName(home), strengthOf(sport, record(s.home), null)],
        [normalizeTeamName(away), strengthOf(sport, record(s.away), null)]
      ]);
      out.push(game(sport, start, away, home, housePrices(sport, away, home, table, { neutral: true }), { neutral: true }));
    }
  }
  return out;
}

// ESPN's tennis draws: every singles match of the tour (a combined event's
// scoreboard has both tours' draws) with both players known and not yet
// played, priced by the players' ranking points (house.mjs pointsStrengths).
export function parseEspnDraw(data, sport, table, now = new Date()) {
  const out = [];
  const tour = sport === 'wta' ? /^women'?s singles/i : /^men'?s singles/i;
  for (const event of data?.events || []) {
    for (const grouping of event.groupings || []) {
      if (!tour.test(grouping.grouping?.displayName || '')) continue;
      for (const comp of grouping.competitions || []) {
        if (comp.status?.type?.state !== 'pre') continue;
        const s = sides(comp);
        const [home, away] = [named(s?.home), named(s?.away)];
        if (!home || !away || !(Date.parse(comp.date) > now.getTime())) continue;
        out.push(game(sport, comp.date, away, home, housePrices(sport, away, home, table, { neutral: true }), { neutral: true }));
      }
    }
  }
  return out;
}

// ESPN's ranking list as [{ name, points }].
export function parseRankings(data) {
  return (data?.rankings?.[0]?.ranks || []).map(r => ({ name: r.athlete?.displayName, points: r.points }));
}
