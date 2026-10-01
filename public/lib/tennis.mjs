// Tennis from the match winner's price alone: Play's own first set, set
// score, game handicap and total games when Kambi doesn't post them.
//
// One number drives it: the chance `q` the stronger side wins any one game
// (serve and return averaged), found so that a whole match, played out set by
// set (to six games, a tiebreak at 6-6 won at the same edge), comes out at the
// winner's price. Every set's games and every set score follow exactly from q.

// One set: the chance of each final games score, as [mine, theirs, chance].
export function setScores(q) {
  // From a games score, the chance of each way the set can end.
  const out = new Map();
  const walk = (a, b, p) => {
    if (p < 1e-12) return;
    if ((a === 6 && b <= 4) || (a === 7 && (b === 5 || b === 6))) return void out.set(`${a}-${b}`, (out.get(`${a}-${b}`) ?? 0) + p);
    if ((b === 6 && a <= 4) || (b === 7 && (a === 5 || a === 6))) return void out.set(`${a}-${b}`, (out.get(`${a}-${b}`) ?? 0) + p);
    if (a === 6 && b === 6) {
      // The tiebreak, at the same edge as a game.
      out.set('7-6', (out.get('7-6') ?? 0) + p * q);
      out.set('6-7', (out.get('6-7') ?? 0) + p * (1 - q));
      return;
    }
    walk(a + 1, b, p * q);
    walk(a, b + 1, p * (1 - q));
  };
  walk(0, 0, 1);
  return [...out].map(([k, p]) => [...k.split('-').map(Number), p]);
}
export const setWin = q => setScores(q).reduce((s, [a, b, p]) => s + (a > b ? p : 0), 0);

// The match from the set chance: best of 3 or 5.
export function matchWin(s, bestOf = 3) {
  return bestOf === 5 ? s ** 3 * (10 - 15 * s + 6 * s * s) : s * s * (3 - 2 * s);
}

// q for a match-win chance (the side's, 0-1).
export function gameEdge(pMatch, bestOf = 3) {
  let lo = 0.2;
  let hi = 0.8;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (matchWin(setWin(mid), bestOf) < pMatch) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The whole match: each set score's chance ("2-1") and the games each side
// wins, as a joint distribution: Map("myGames|theirGames" -> chance).
export function matchModel(pMatch, bestOf = 3) {
  const q = gameEdge(pMatch, bestOf);
  const sets = setScores(q);
  const need = bestOf === 5 ? 3 : 2;
  const setScore = new Map();
  const games = new Map();
  const step = (mine, theirs, gm, gt, p) => {
    if (mine === need || theirs === need) {
      setScore.set(`${mine}-${theirs}`, (setScore.get(`${mine}-${theirs}`) ?? 0) + p);
      games.set(`${gm}|${gt}`, (games.get(`${gm}|${gt}`) ?? 0) + p);
      return;
    }
    for (const [a, b, ps] of sets) step(mine + (a > b ? 1 : 0), theirs + (b > a ? 1 : 0), gm + a, gt + b, p * ps);
  };
  step(0, 0, 0, 0, 1);
  return { q, setWin: setWin(q), setScore, games };
}

// Grand Slams' men play best of five.
export const bestOfFor = (sport, group = '') => (sport === 'atp' && /australian open|french open|roland garros|wimbledon|us open/i.test(group) ? 5 : 3);

// The board's tennis markets in markets.mjs's shape, for the home side's
// match chance `homeWin`: first set, set score, a game handicap and total
// games at the lines nearest even (and one either side).
export function tennisMarkets(homeWin, { bestOf = 3, cut } = {}) {
  const fav = homeWin >= 0.5 ? 'home' : 'away';
  const m = matchModel(Math.max(homeWin, 1 - homeWin), bestOf);
  const asHome = (mine, theirs) => (fav === 'home' ? [mine, theirs] : [theirs, mine]);
  const out = [];
  const s1 = fav === 'home' ? m.setWin : 1 - m.setWin;
  out.push({ kind: 'set1', market: 'set1', cut: cut.twoWay, picks: [{ side: 'home', fair: s1 }, { side: 'away', fair: 1 - s1 }] });
  const scores = [...m.setScore].map(([k, p]) => {
    const [h, a] = asHome(...k.split('-').map(Number));
    return { side: `${h}-${a}`, score: `${h}-${a}`, fair: p };
  });
  out.push({ kind: 'setscore', market: 'setscore', cut: cut.bands, picks: scores.sort((x, y) => y.fair - x.fair) });
  // Games: the home side's margin and the total.
  const margin = new Map();
  const total = new Map();
  for (const [k, p] of m.games) {
    const [h, a] = asHome(...k.split('|').map(Number));
    margin.set(h - a, (margin.get(h - a) ?? 0) + p);
    total.set(h + a, (total.get(h + a) ?? 0) + p);
  }
  const over = (dist, line) => [...dist].reduce((s, [v, p]) => s + (v > line ? p : 0), 0);
  // Total games: the half line nearest even, and one either side.
  const lines = [];
  for (let l = 12.5; l <= 60; l += 1) lines.push([l, over(total, l)]);
  lines.sort((x, y) => Math.abs(x[1] - 0.5) - Math.abs(y[1] - 0.5));
  for (const [line, p] of lines.slice(0, 3).sort((x, y) => x[0] - y[0])) out.push({ kind: 'gametotal', market: `gt|${line}`, line, main: line === lines[0][0], cut: cut.twoWay, picks: [{ side: 'over', fair: p }, { side: 'under', fair: 1 - p }] });
  // Game handicap from the away side: away + line beats home.
  const hcaps = [];
  for (let l = -12.5; l <= 12.5; l += 1) {
    // Away covers at awayLine l: away margin + l > 0, i.e. home margin < l.
    const cover = [...margin].reduce((s, [v, p]) => s + (v < l ? p : 0), 0);
    hcaps.push([l, cover]);
  }
  hcaps.sort((x, y) => Math.abs(x[1] - 0.5) - Math.abs(y[1] - 0.5));
  for (const [awayLine, cover] of hcaps.slice(0, 3).sort((x, y) => x[0] - y[0]))
    out.push({ kind: 'gamehcap', market: `gh|${awayLine}`, awayLine, giver: awayLine < 0 ? 'away' : 'home', cut: cut.twoWay, picks: [{ side: 'away', line: awayLine, fair: cover }, { side: 'home', line: -awayLine, fair: 1 - cover }] });
  return out;
}
