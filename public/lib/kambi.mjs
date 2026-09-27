// Kambi's public odds feed (the bookmaker behind Unibet and others): the
// sports ESPN doesn't carry, from Asian baseball to tennis, badminton, table
// tennis, volleyball and snooker. Read through the shared sports proxy, which
// caches each list for every viewer (2 minutes) and trims it to the fields
// read here, so the feed sees one request per league per few minutes. Odds come as thousandths (1950 = 1.95) and lines as
// thousandths too (1500 = 1.5); a match lists its home player first.
import { devigProportional } from './odds.mjs';
import { LEAGUES, normalizeTeamName, teamZh } from './teams.mjs';

export const KAMBI = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub';

export function kambiUrl(path, kind = 'matches') {
  const parts = path.split('/');
  while (parts.length < 4) parts.push('all');
  return `${KAMBI}/listView/${parts.join('/')}/${kind}.json?lang=en_GB&market=GB&useCombined=true`;
}

const outcome = (offer, type) => offer.outcomes.find(o => o.type === type);
const odds = o => (o && o.odds > 1000 ? o.odds / 1000 : null);

// Fair chances from one offer's two (or three) prices, the margin removed.
function fairPair(a, b) {
  const pa = odds(a);
  const pb = odds(b);
  if (!pa || !pb) return null;
  return devigProportional([1 / pa, 1 / pb]);
}

// Upcoming matches of one league: games shaped like the rest of the page's
// ({ id, sport, startUtc, away, home, draftKings: fair win chances, total,
// spread }), with `book: 'kambi'`. `limit` keeps busy leagues (table tennis
// runs matches around the clock) to the next few.
export function parseKambiEvents(data, sport, now = new Date(), limit = Infinity) {
  const games = [];
  for (const item of data?.events || []) {
    const e = item.event;
    if (!e || e.state !== 'NOT_STARTED' || Date.parse(e.start) <= now.getTime()) continue;
    if (!e.homeName || !e.awayName) continue;
    const offers = item.betOffers || [];
    const match = offers.find(o => o.betOfferType?.englishName === 'Match' || /match odds|moneyline/i.test(o.criterion?.englishLabel || ''));
    if (!match) continue;
    // Two-way winner; a three-way one (a draw after regulation) is split between the two.
    const win = fairPair(outcome(match, 'OT_ONE'), outcome(match, 'OT_TWO'));
    if (!win) continue;
    const game = {
      id: `${sport}_${e.start.slice(0, 13)}_${normalizeTeamName(e.awayName)}_${normalizeTeamName(e.homeName)}`.replaceAll(' ', ''),
      sport,
      startUtc: new Date(e.start).toISOString(),
      away: { en: e.awayName, zh: teamZh(sport, e.awayName) },
      home: { en: e.homeName, zh: teamZh(sport, e.homeName) },
      draftKings: { home: win[0], away: win[1] },
      polymarket: null,
      polymarketLiquidity: null,
      total: null,
      spread: null,
      book: 'kambi',
      kambiId: e.id,
      group: e.group || ''
    };
    const handicap = offers.find(o => o.betOfferType?.englishName === 'Handicap');
    if (handicap) {
      const home = outcome(handicap, 'OT_ONE');
      const away = outcome(handicap, 'OT_TWO');
      const fair = fairPair(away, home);
      if (fair && away?.line != null) game.spread = { awayLine: away.line / 1000, awayFair: fair[0] };
    }
    const total = offers.find(o => o.betOfferType?.englishName === 'Over/Under');
    if (total) {
      const over = outcome(total, 'OT_OVER');
      const fair = fairPair(over, outcome(total, 'OT_UNDER'));
      if (fair && over?.line != null) game.total = { line: over.line / 1000, overFair: fair[0] };
    }
    games.push(game);
  }
  return games.sort((a, b) => a.startUtc.localeCompare(b.startUtc)).slice(0, limit);
}

export async function fetchKambiLeague(key, now = new Date(), getJson) {
  const league = LEAGUES[key];
  return parseKambiEvents(await getJson(kambiUrl(league.kambi), 'kambi-events'), key, now, league.cap ?? Infinity);
}

// ---- Live scores ---------------------------------------------------------------

// Every match Kambi has in play: kambiId -> { sport, home, away, score, sets }
// where `sets` is each side's score in every set played so far (-1: not
// played), and `score` the match score (sets won, or runs/points).
export function parseKambiLive(data) {
  const out = new Map();
  for (const item of data?.liveEvents || []) {
    const e = item.event;
    const live = item.liveData || {};
    if (!e) continue;
    const sets = live.statistics?.sets;
    out.set(e.id, {
      state: e.state,
      home: e.homeName,
      away: e.awayName,
      score: { home: Number(live.score?.home) || 0, away: Number(live.score?.away) || 0 },
      sets: sets ? { home: sets.home.filter(x => x >= 0), away: sets.away.filter(x => x >= 0) } : null
    });
  }
  return out;
}

export async function fetchKambiLive(getJson) {
  return parseKambiLive(await getJson(`${KAMBI}/event/live/open.json?lang=en_GB&market=GB`, 'kambi-events'));
}

// Sets each side has won from the set scores. A set counts once someone has
// won it: reached the set's target (the deciding set's, if it has its own)
// two clear, or the cap (badminton's 30), or in tennis 7 games (a tiebreak).
export function setsWon(sets, spec) {
  const won = { home: 0, away: 0 };
  if (!sets || !spec) return won;
  const n = Math.min(sets.home.length, sets.away.length);
  for (let i = 0; i < n; i++) {
    const h = sets.home[i];
    const a = sets.away[i];
    const hi = Math.max(h, a);
    const target = spec.last && i === spec.bestOf - 1 ? spec.last : spec.target;
    const done = (hi >= target && Math.abs(h - a) >= 2) || (spec.cap && hi >= spec.cap) || (spec.unit === 'games' && hi === 7);
    if (done) won[h > a ? 'home' : 'away']++;
  }
  return won;
}

// A match's result once the live score shows it decided: someone has won
// the sets they need. { status: 'final', homeScore, awayScore (sets won),
// homeSets, awaySets (each set's score) }, or null while it isn't decided.
export function decidedFromLive(live, sport) {
  const spec = LEAGUES[sport]?.sets;
  if (!live?.sets || !spec?.bestOf) return null;
  const need = Math.ceil(spec.bestOf / 2);
  const won = setsWon(live.sets, spec);
  if (won.home < need && won.away < need) return null;
  return { status: 'final', homeScore: won.home, awayScore: won.away, homeSets: live.sets.home, awaySets: live.sets.away };
}

// ---- Results ---------------------------------------------------------------------
//
// A match's own live data (event/{id}/livedata.json) stays readable for a day
// or more after it ends, still marked as started: Kambi never says "final"
// in public. So the result is read from the score itself: set sports once
// someone has won the sets they need; baseball and basketball once the
// regulation innings or quarters are played, the score isn't level (or
// baseball's extra innings have run out) and it hasn't changed for a while.

export const kambiLiveDataUrl = id => `${KAMBI}/event/${encodeURIComponent(id)}/livedata.json?lang=en_GB&market=GB`;

// Each period's score, home first ("0-1 | 2-0" for innings, "Q1: 11-16 | Q2: 22-24"
// for quarters): { home: [...], away: [...] }.
export function kambiPeriods(info) {
  const home = [];
  const away = [];
  for (const part of String(info || '').split('|')) {
    const m = /(\d+)\s*-\s*(\d+)\s*$/.exec(part.trim());
    if (!m) continue;
    home.push(Number(m[1]));
    away.push(Number(m[2]));
  }
  return { home, away };
}

// One match's live data: the same shape as parseKambiLive's entries, with
// each period's score, when the score last changed and the clock.
export function parseKambiLiveData(data) {
  const live = Array.isArray(data?.liveData) ? data.liveData[0] : data?.liveData;
  if (!live?.score) return null;
  const sets = live.statistics?.sets;
  const changed = Number(live.score.version);
  return {
    score: { home: Number(live.score.home) || 0, away: Number(live.score.away) || 0 },
    periods: kambiPeriods(live.score.info),
    sets: sets ? { home: sets.home.filter(x => x >= 0), away: sets.away.filter(x => x >= 0) } : null,
    changedAt: Number.isFinite(changed) ? changed : null,
    clock: live.matchClock ? { period: live.matchClock.periodId || '', left: (Number(live.matchClock.minutesLeftInPeriod) || 0) * 60 + (Number(live.matchClock.secondsLeftInMinute) || 0), running: Boolean(live.matchClock.running) } : null
  };
}

// How long a score must stay the same before a finished-looking game counts as over.
export const KAMBI_QUIET_MS = 30 * 60_000;
// Innings after which a level baseball game ends level (NPB and CPBL stop at 12, KBO at 11).
const TIE_INNINGS = { npb: 12, cpbl: 12, kbo: 11 };

// The result of a baseball or basketball game from its live data, or null
// while it may still be going. `start` is the scheduled start.
export function decidedTeamGame(live, sport, start, now = new Date()) {
  const family = LEAGUES[sport]?.family;
  if (!live || (family !== 'baseball' && family !== 'basketball')) return null;
  const { home, away } = live.score;
  const n = live.periods.home.length;
  const t = now.getTime();
  const began = Date.parse(start) || 0;
  // The score's own timestamp when it's a sensible one; if not, a generous
  // time after the start.
  const changed = live.changedAt && live.changedAt >= began && live.changedAt <= t + 3_600_000 ? live.changedAt : null;
  const quiet = changed ? t - changed >= KAMBI_QUIET_MS : began && t - began >= (family === 'baseball' ? 5 : 3.5) * 3_600_000;
  let over = false;
  if (family === 'baseball') over = n >= 9 && quiet && (home !== away || n >= (TIE_INNINGS[sport] ?? 99));
  else {
    const clockDone = live.clock && !live.clock.running && live.clock.left === 0 && /QUARTER4|OVERTIME|OT/i.test(live.clock.period);
    over = n >= 4 && home !== away && (clockDone ? t - (changed ?? 0) >= 5 * 60_000 : quiet);
  }
  if (!over) return null;
  return { status: 'final', homeScore: home, awayScore: away, homeInnings: live.periods.home, awayInnings: live.periods.away };
}
