// 為你推薦: picks for this person, not just the board's best prices.
//
// What they care about, from everything Quadra knows on this device:
// - the teams and leagues they follow in Fixtures (its pass data, cached on
//   this device, and its affinity map), the strongest signal;
// - the teams they've bet on here (their slips: the more often, the more);
// - every app's affinity map (what they open, bet on and trade).
//
// Then each upcoming pick is scored: how much they care about its game's
// teams and league, how good a price it is (recommend.mjs's tag), and how
// soon it starts. Games they already hold a bet on are left out (those are
// in 你的投注): what they've backed points at the next games instead, the
// same teams' and the same leagues'. One pick a game; picks on the team they
// care about, never against it.
import { normalizeTeamName } from './logos.mjs';
import { CATALOG } from './catalog.mjs';
import { familyOf } from './teams.mjs';

export const FOR_YOU = { n: 6, horizonH: 72, follow: 1, backed: 0.6, league: 0.35, sport: 0.12 };

const teamKey = (sport, name) => `team:${sport}:${normalizeTeamName(name)}`;
// Fixtures' league key to Play's.
const playKey = league => CATALOG[league]?.bet ?? league;

// { teams: Map key -> { w, why }, leagues: Map sport -> w, sports: Map family -> w, held: Set gameId }
export function tasteOf({ aff = {}, fixtures = null, slips = [], now = Date.now() } = {}) {
  const teams = new Map();
  const leagues = new Map();
  const sports = new Map();
  const lift = (map, k, w, why) => {
    const had = map.get(k);
    if (!had || had.w < w) map.set(k, why ? { w, why } : { w });
  };
  // Every app's affinity, scaled to its strongest key.
  const max = Math.max(1, ...Object.values(aff));
  for (const [k, v] of Object.entries(aff)) {
    const w = Math.min(1, v / max);
    if (k.startsWith('team:')) lift(teams, k, w * 0.7, 'like');
    else if (k.startsWith('league:')) lift(leagues, k.slice(7), w);
    else if (k.startsWith('sport:')) lift(sports, k.slice(6), w);
  }
  // Fixtures: followed teams (a player's team too), followed leagues in order.
  for (const f of fixtures?.follows || []) {
    const sport = playKey(f.league);
    const name = f.athlete ? f.team?.name : f.name;
    if (name) lift(teams, teamKey(sport, name), 1, 'follow');
    lift(leagues, sport, 0.8);
  }
  (fixtures?.leagues || []).forEach((l, i) => lift(leagues, playKey(l), Math.max(0.4, 0.9 - i * 0.1)));
  // Slips: teams backed (recent ones more), and the games still open.
  const held = new Set();
  const backed = new Map();
  for (const s of slips) {
    const t = typeof s.t === 'number' ? s.t : Date.parse(s.t) || now;
    const fresh = 0.5 ** ((now - t) / (30 * 86_400_000));
    for (const leg of s.legs || []) {
      if (s.status === 'open' && leg.gameId) held.add(leg.gameId);
      if (!leg.sport) continue;
      lift(leagues, leg.sport, Math.min(1, (leagues.get(leg.sport)?.w || 0) + 0.15 * fresh));
      const side = ['home', 'away'].includes(leg.team) ? leg.team : ['home', 'away'].includes(leg.side) ? leg.side : null;
      const name = side ? leg[side] : leg.kind === 'future' ? leg.team : null;
      if (name) backed.set(teamKey(leg.sport, name), (backed.get(teamKey(leg.sport, name)) || 0) + fresh);
    }
  }
  for (const [k, n] of backed) lift(teams, k, Math.min(0.9, 0.35 + 0.15 * n), 'backed');
  return { teams, leagues: new Map([...leagues].map(([k, v]) => [k, v.w])), sports: new Map([...sports].map(([k, v]) => [k, v.w])), held };
}

// How much the person cares about a game: { score, why, side, team } with
// `side` the team they care about ('home' | 'away' | null).
export function gameInterest(game, taste) {
  let best = { score: 0, why: null, side: null };
  for (const side of ['home', 'away']) {
    const t = taste.teams.get(teamKey(game.sport, game[side]?.en ?? game[side]));
    if (!t) continue;
    const s = t.w * (t.why === 'follow' ? FOR_YOU.follow : t.why === 'backed' ? FOR_YOU.backed + 0.25 : FOR_YOU.backed);
    if (s > best.score) best = { score: s, why: t.why, side };
  }
  const league = (taste.leagues.get(game.sport) || 0) * FOR_YOU.league;
  const sport = (taste.sports.get(familyOf(game.sport) || game.sport) || 0) * FOR_YOU.sport;
  if (!best.side) return { score: league + sport, why: league > sport ? 'league' : sport > 0 ? 'sport' : null, side: null };
  return { ...best, score: best.score + league + sport };
}

// The picks: [{ bet, game, why, side, score }], best first, one a game.
// `bets`: the board's picks; `recs`: recommend()'s map; `games`: the board's games.
export function forYouPicks({ games = [], bets = [], recs = new Map(), taste, now = Date.now(), n = FOR_YOU.n, exclude = new Set() } = {}) {
  const byGame = new Map();
  for (const b of bets) {
    if (!b.gameId || b.lock || b.cap || !(b.estOdds > 1) || exclude.has(b.id)) continue;
    if (!byGame.has(b.gameId)) byGame.set(b.gameId, []);
    byGame.get(b.gameId).push(b);
  }
  const out = [];
  for (const g of games) {
    const start = Date.parse(g.startUtc);
    if (!(start > now) || start - now > FOR_YOU.horizonH * 3_600_000 || taste.held.has(g.id)) continue;
    const picks = byGame.get(g.id);
    if (!picks?.length) continue;
    const interest = gameInterest(g, taste);
    const soon = start - now < 12 * 3_600_000 ? 0.12 : start - now < 30 * 3_600_000 ? 0.06 : 0;
    // The pick: on their team when they have one (its win, else its handicap),
    // else the game's best-tagged pick, else its favourite's win.
    const tagValue = b => ({ value: 0.3, shot: 0.2, steady: 0.18 }[recs.get(b.id)?.tag] || 0);
    const onSide = b => (b.kind === 'ml' || b.kind === 'spread' || b.kind === 'runline' || b.kind === 'dnb') && b.side === interest.side;
    let choice;
    if (interest.side) {
      const mine = picks.filter(b => onSide(b) && b.fairChance >= 0.2);
      choice = mine.sort((a, b) => (a.kind === 'ml' ? 0 : 1) - (b.kind === 'ml' ? 0 : 1) || tagValue(b) - tagValue(a))[0];
    }
    if (!choice) {
      // A price worth a look: no 1.10 sure things, no lottery tickets.
      const tagged = picks.filter(b => recs.has(b.id) && b.estOdds >= 1.4 && b.estOdds <= 5 && (!interest.side || !['away', 'home'].includes(b.side) || b.side === interest.side || b.kind === 'total'));
      choice = tagged.sort((a, b) => tagValue(b) - tagValue(a) || b.fairChance - a.fairChance)[0];
    }
    if (!choice) choice = picks.filter(b => b.kind === 'ml' && b.side !== 'draw' && b.estOdds >= 1.25).sort((a, b) => b.fairChance - a.fairChance)[0];
    if (!choice) continue;
    const why = interest.why && interest.score >= 0.1 ? interest.why : recs.has(choice.id) ? recs.get(choice.id).tag : null;
    if (!why) continue;
    out.push({ bet: choice, game: g, why, side: interest.side, tag: recs.get(choice.id)?.tag ?? null, score: interest.score + tagValue(choice) + soon });
  }
  // Best first, no league more than twice (so one league doesn't fill it).
  out.sort((a, b) => b.score - a.score);
  const perLeague = new Map();
  return out.filter(x => {
    const k = perLeague.get(x.game.sport) || 0;
    if (k >= 2 && x.why !== 'follow') return false;
    perLeague.set(x.game.sport, k + 1);
    return true;
  }).slice(0, n);
}

// The person's Fixtures data on this device (its pass payload), or null.
export function fixturesTaste(cachedPayload) {
  try {
    const p = JSON.parse(cachedPayload('match') || 'null');
    return p ? { leagues: Array.isArray(p.leagues) ? p.leagues : [], follows: Array.isArray(p.follows) ? p.follows : [] } : null;
  } catch {
    return null;
  }
}
