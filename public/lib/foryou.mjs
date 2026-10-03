// 為你推薦: picks for this person, not just the board's best prices.
//
// What they care about, from everything Quadra knows on this device:
// - the teams and leagues they follow in Orbit Sports (its pass data, cached on
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
import { normalizeTeamName } from '#kit/logos.mjs';
import { CATALOG } from '#kit/catalog.mjs';
import { familyOf } from './teams.mjs';

export const FOR_YOU = { n: 8, horizonH: 72, followH: 10 * 24, backedH: 5 * 24, perSport: 2, follow: 1, backed: 0.6, league: 0.35, sport: 0.12 };

const teamKey = (sport, name) => `team:${sport}:${normalizeTeamName(name)}`;
// Orbit Sports' league key to Play's.
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
  // Orbit Sports: followed teams (a player's team too), followed leagues in order.
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
    // Capped picks (a house-priced game's) only for the person's own teams below.
    if (!b.gameId || b.lock || b.cap === 'prop' || !(b.estOdds > 1) || exclude.has(b.id)) continue;
    if (!byGame.has(b.gameId)) byGame.set(b.gameId, []);
    byGame.get(b.gameId).push(b);
  }
  const out = [];
  for (const g of games) {
    const start = Date.parse(g.startUtc);
    if (!(start > now) || taste.held.has(g.id)) continue;
    const picks = byGame.get(g.id);
    if (!picks?.length) continue;
    const interest = gameInterest(g, taste);
    // A followed team's next game however far this week (an NFL or a
    // league side plays once a week); a backed team's within five days.
    const horizon = interest.why === 'follow' ? FOR_YOU.followH : interest.why === 'backed' ? FOR_YOU.backedH : FOR_YOU.horizonH;
    if (start - now > horizon * 3_600_000) continue;
    const soon = start - now < 12 * 3_600_000 ? 0.12 : start - now < 30 * 3_600_000 ? 0.06 : start - now > 72 * 3_600_000 ? -0.1 : 0;
    // The pick: on their team when they have one (its win, else its handicap),
    // else the game's best-tagged pick, else its favourite's win.
    const tagValue = b => ({ value: 0.3, shot: 0.2, steady: 0.18 }[recs.get(b.id)?.tag] || 0);
    const onSide = b => (b.kind === 'ml' || b.kind === 'spread' || b.kind === 'runline' || b.kind === 'dnb') && b.side === interest.side;
    let choice;
    if (interest.side) {
      const mine = picks.filter(b => onSide(b) && b.fairChance >= 0.12 && (!b.cap || interest.why === 'follow' || interest.why === 'backed'));
      choice = mine.sort((a, b) => (a.kind === 'ml' ? 0 : 1) - (b.kind === 'ml' ? 0 : 1) || tagValue(b) - tagValue(a))[0];
    }
    if (!choice) {
      // A price worth a look: no 1.10 sure things, no lottery tickets.
      const tagged = picks.filter(b => !b.cap && recs.has(b.id) && b.estOdds >= 1.4 && b.estOdds <= 5 && (!interest.side || !['away', 'home'].includes(b.side) || b.side === interest.side || b.kind === 'total'));
      choice = tagged.sort((a, b) => tagValue(b) - tagValue(a) || b.fairChance - a.fairChance)[0];
    }
    if (!choice) choice = picks.filter(b => !b.cap && b.kind === 'ml' && b.side !== 'draw' && b.estOdds >= 1.25).sort((a, b) => b.fairChance - a.fairChance)[0];
    if (!choice) continue;
    const why = interest.why && interest.score >= 0.1 ? interest.why : recs.has(choice.id) ? recs.get(choice.id).tag : null;
    if (!why) continue;
    // A price alone counts for less than the person's own teams and leagues.
    const own = interest.why && interest.score >= 0.1;
    out.push({ bet: choice, game: g, why, side: interest.side, tag: recs.get(choice.id)?.tag ?? null, score: interest.score + (own ? 1 : 0.4) * (tagValue(choice) + soon) });
  }
  // Best first. A league the person shows no interest in gets one card at
  // most (two such cards in all), a league they like two, followed teams
  // all theirs: a night of many games in one league doesn't fill the row.
  out.sort((a, b) => b.score - a.score);
  // One followed team's game first per team (its next one), then the caps.
  const perLeague = new Map();
  const perFamily = new Map();
  const teamsShown = new Set();
  let strangers = 0;
  const kept = out.filter(x => {
    const k = perLeague.get(x.game.sport) || 0;
    const fam = familyOf(x.game.sport) || x.game.sport;
    const f = perFamily.get(fam) || 0;
    const known = leagueTaste(x.game.sport, taste) >= 0.2;
    const mine = x.why === 'follow' || x.why === 'backed';
    if (mine) {
      const team = `${x.game.sport}:${x.game[x.side]?.en ?? x.game[x.side]}`;
      if (teamsShown.has(team)) return false;
      teamsShown.add(team);
    } else {
      if (k >= (known ? 2 : 1) || f >= FOR_YOU.perSport) return false;
      if (!known && !x.side) {
        if (strangers >= 2) return false;
        strangers++;
      }
    }
    perLeague.set(x.game.sport, k + 1);
    perFamily.set(fam, f + 1);
    return true;
  });
  return interleave(kept, x => familyOf(x.game.sport) || x.game.sport).slice(0, n);
}

// Best first, but never two of a sport in a row while another sport waits
// (each next one: the best whose sport differs from the one before).
export function interleave(list, kindOf) {
  const left = [...list];
  const out = [];
  while (left.length) {
    const prev = out.length ? kindOf(out.at(-1)) : null;
    const i = left.findIndex(x => kindOf(x) !== prev);
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

// How much the person likes a league (0-1): the league itself, or a team in it.
export function leagueTaste(sport, taste) {
  let w = taste.leagues.get(sport) || 0;
  for (const [k, t] of taste.teams) if (t.why !== 'like' && k.startsWith(`team:${sport}:`)) w = Math.max(w, t.w);
  return w;
}

// The best of `items` (sorted best first) with at most `per` a league, or
// `liked` for a league the person likes; `sportOf` reads an item's league.
export function spreadLeagues(items, taste, { n, per = 1, liked = 2, perSport = 2, sportOf = x => x.game.sport } = {}) {
  const count = new Map();
  const fams = new Map();
  const out = [];
  for (const x of items) {
    const sport = sportOf(x);
    const fam = familyOf(sport) || sport;
    const k = count.get(sport) || 0;
    if (k >= (leagueTaste(sport, taste) >= 0.2 ? liked : per) || (fams.get(fam) || 0) >= perSport) continue;
    count.set(sport, k + 1);
    fams.set(fam, (fams.get(fam) || 0) + 1);
    out.push(x);
    if (out.length >= n) break;
  }
  return interleave(out, x => familyOf(sportOf(x)) || sportOf(x));
}

// The person's Orbit Sports follows: the pass's copy (`follows:match`, written
// by Orbit Sports, so every device and home-screen app has it) and this
// device's Orbit Sports data, together.
export function fixturesTaste(cachedPayload, wallet = null) {
  let local = null;
  try {
    local = JSON.parse(cachedPayload('match') || 'null');
  } catch {}
  const synced = wallet?.settings?.['follows:match']?.value;
  const leagues = [...new Set([...(Array.isArray(local?.leagues) ? local.leagues : []), ...(Array.isArray(synced?.leagues) ? synced.leagues : [])])];
  const follows = [...(Array.isArray(local?.follows) ? local.follows : []), ...(Array.isArray(synced?.teams) ? synced.teams.filter(t => Array.isArray(t) && t[1]).map(([league, name]) => ({ league, name })) : [])];
  return leagues.length || follows.length ? { leagues, follows } : null;
}
