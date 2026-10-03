// Every priced option of a game, the one place a board is built. The page
// adds names to these for you, and the simulated crowd bets on exactly the
// same options (real games, and the typical weeks of sports with nothing on
// today, which are made-up games run through this same code). One pricing
// path, so nothing can be cheaper to bet on in the simulator than on the page
// or the other way round.
//
// An option: { id, gameId, sport, kind, side, market, fairChance, fairMargin,
// errKey, cut, estOdds, posted, lock, minLegs, ... } plus the fields its kind
// needs to be named and settled (totalLine, runLine, awayLine, giver, team,
// teamLine, inning, line, settle) and, for side markets, the market and pick
// it came from (`m`, `pick`).
import {
  blendOutcomes,
  estimateLotteryOdds,
  estimateLineOdds,
  lotteryTotalLines,
  lotteryRunLines,
  lotteryTeamTotal,
  fitTeamRuns,
  fitTotalRuns,
  totalOverChance,
  teamOverChance,
  runLineCover,
  scoreGrid,
  lineInRange,
  MLB_TOTAL_DISPERSION,
  GOALS_DISPERSION,
  TOP_INNING_ODDS
} from './odds.mjs';
import { pointsModel, pointsMarkets, goalMarkets, fitHockey, baseballMarkets, marketOdds } from './markets.mjs';
import { fitGoals } from './live.mjs';
import { houseCut, houseRule } from './rules.mjs';
import { withModelLines } from './lines.mjs';
import { LEAGUES, familyOf, isSoccer } from './teams.mjs';
import { modelProps, teamScores, atLeast, MODEL_CUT } from './propmodel.mjs';
import { tennisMarkets, bestOfFor } from './tennis.mjs';
import { normPlayer } from './props.mjs';
import { playerByName } from './players.mjs';

// Lines besides the lottery's own: totals this many either side of the main
// line, team totals this many, run lines up to 4.5 runs either way.
const TOTAL_SPAN = 3;
const TEAM_TOTAL_SPAN = 2;
const RUN_LINES = [1.5, 2.5, 3.5, 4.5];

// Lottery-checked error sizes exist for MLB and the Premier League; every
// other league uses its kind of sport's (unchecked) one.
export function errKeyOf(sport) {
  return ['mlb', 'epl'].includes(sport) ? sport : familyOf(sport);
}

// Each game's run and goal models, fitted once: fitting team runs is slow.
// The fitted team runs are also kept on the device, so opening the page
// again doesn't fit the same games anew.
const modelCache = new Map();
const MEANS_KEY = 'oddsStudy.teamRuns';
let savedMeans = null;
let meansTimer = null;
// Tied to the model (bump MEANS_V when the fit changes), not the deploy:
// every deploy used to throw the fits away and make the next open slow.
const MEANS_V = 2;
const meansVersion = () => MEANS_V;
function storedMeans() {
  if (savedMeans) return savedMeans;
  savedMeans = new Map();
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(MEANS_KEY) || 'null');
    const list = saved?.v === meansVersion() ? saved.list : null;
    if (Array.isArray(list)) for (const [key, home, away] of list) if (Number.isFinite(home) && Number.isFinite(away)) savedMeans.set(key, { home, away });
  } catch {}
  return savedMeans;
}
function keepMeans(key, means) {
  const store = storedMeans();
  store.delete(key);
  store.set(key, means);
  if (!globalThis.localStorage || meansTimer) return;
  meansTimer = setTimeout(() => {
    meansTimer = null;
    try {
      const list = [...store].slice(-600).map(([k, m]) => [k, m.home, m.away]);
      globalThis.localStorage.setItem(MEANS_KEY, JSON.stringify({ v: meansVersion(), list }));
    } catch {}
  }, 2000);
}
function gameModel(game, homeWin) {
  const key = `${game.id}|${game.total?.line}|${game.total?.overFair}|${homeWin}`;
  if (modelCache.has(key)) return modelCache.get(key);
  const model = {};
  const baseball = familyOf(game.sport) === 'baseball';
  if (game.total) model.mu = fitTotalRuns(game.total.line, game.total.overFair, baseball ? MLB_TOTAL_DISPERSION : GOALS_DISPERSION);
  // Each team's runs from the win chance (DraftKings', or the blended one
  // when it has none) and the total.
  if (baseball && game.total && homeWin != null) {
    const fitKey = `${homeWin}|${game.total.line}|${game.total.overFair}`;
    model.means = storedMeans().get(fitKey) || fitTeamRuns(homeWin, game.total.line, game.total.overFair);
    keepMeans(fitKey, model.means);
    model.grid = scoreGrid(model.means.home, model.means.away);
  }
  if (modelCache.size > 2000) modelCache.clear();
  modelCache.set(key, model);
  return model;
}

// Totals, run lines and team totals of baseball and soccer: the lottery's own
// lines (MLB's checked against its prices) and the wider range.
function lineOptions(game, base, probs) {
  const out = [];
  const homeWin = game.draftKings?.home ?? probs.home / (probs.home + probs.away);
  const model = gameModel(game, homeWin);
  const total = game.total;
  // A total from our own model (lines.mjs), not a bookmaker's: never "the
  // lottery's line", and a little more room for error.
  const modeled = Boolean(total?.modeled);
  const mlb = game.sport === 'mlb';
  const baseball = familyOf(game.sport) === 'baseball';
  const cut = k => houseCut({ base: k });

  // 大小分. MLB: the lottery's three lines, from one line; elsewhere the
  // bookmaker's own half line; then the wider range from the model.
  const totals = new Map();
  if (total && mlb && !modeled) for (const l of lotteryTotalLines(total.line, total.overFair)) totals.set(l.line, { ...l, posted: true });
  else if (total && total.line % 1 !== 0) totals.set(total.line, { line: total.line, over: total.overFair, main: true, posted: !modeled });
  if (model.mu != null) {
    const r = baseball ? MLB_TOTAL_DISPERSION : GOALS_DISPERSION;
    const main = [...totals.values()].find(l => l.main)?.line ?? Math.floor(model.mu) + 0.5;
    for (let d = -TOTAL_SPAN; d <= TOTAL_SPAN; d++) {
      const line = main + d;
      if (line <= 0 || totals.has(line)) continue;
      const over = totalOverChance(line, model.mu, r);
      if (lineInRange(over) && lineInRange(1 - over)) totals.set(line, { line, over, main: false, posted: false });
    }
  }
  for (const { line, over, main, posted } of [...totals.values()].sort((a, b) => a.line - b.line)) {
    const k = cut('twoWay');
    for (const side of ['over', 'under']) {
      const p = side === 'over' ? over : 1 - over;
      out.push({
        ...base,
        id: `${game.id}|tot|${line}|${side}`,
        kind: 'total',
        side,
        totalLine: line,
        mainLine: main,
        posted,
        market: `total|${line}`,
        // The main line's margin is the usual source gap; lines either side add the model's error.
        fairMargin: modeled ? 0.04 : main ? null : posted ? 0.02 : 0.03,
        errKey: modeled ? 'extra' : !mlb ? errKeyOf(game.sport) : posted ? 'mlbTotal' : 'mlbTotalExtra',
        fairChance: p,
        cut: k,
        estOdds: estimateLineOdds(p, k)
      });
    }
  }

  // 讓分: MLB's two posted lines priced from the lottery's own (shrunk)
  // chance; other leagues the bookmaker's line; the rest from the score model.
  if (baseball && (game.spread || model.grid)) {
    const lines = new Map();
    if (game.spread && mlb) {
      for (const [i, l] of lotteryRunLines(game.spread.awayLine, game.spread.awayFair).entries()) lines.set(l.awayLine, { ...l, posted: true, first: i === 0 });
    } else if (game.spread && game.spread.awayLine % 1 !== 0) {
      lines.set(game.spread.awayLine, { awayLine: game.spread.awayLine, fair: game.spread.awayFair, lottery: game.spread.awayFair, posted: true, first: true });
    }
    if (model.grid) {
      for (const abs of RUN_LINES) {
        for (const awayLine of [-abs, abs]) {
          if (lines.has(awayLine)) continue;
          const fair = runLineCover(model.grid, awayLine);
          if (lineInRange(fair) && lineInRange(1 - fair)) lines.set(awayLine, { awayLine, fair, lottery: fair, posted: false });
        }
      }
    }
    const order = [...lines.values()].sort((a, b) => Math.abs(a.awayLine) - Math.abs(b.awayLine) || a.awayLine - b.awayLine);
    for (const { awayLine, fair, lottery, posted, first } of order) {
      const giver = awayLine < 0 ? 'away' : 'home';
      const k = cut('twoWay');
      for (const side of ['away', 'home']) {
        const p = side === 'away' ? fair : 1 - fair;
        const priced = side === 'away' ? lottery : 1 - lottery;
        out.push({
          ...base,
          id: `${game.id}|rl|${side === 'away' ? awayLine : -awayLine}|${side}`,
          kind: 'runline',
          side,
          runLine: side === 'away' ? awayLine : -awayLine,
          awayLine,
          giver,
          posted,
          market: `rl|${awayLine}`,
          fairMargin: first ? 0.02 : 0.03,
          errKey: !mlb ? errKeyOf(game.sport) : posted ? 'mlbRunLine' : 'mlbRunLineExtra',
          fairChance: p,
          cut: k,
          estOdds: estimateLineOdds(priced, k)
        });
      }
    }
  }

  // 單隊大小: each team's runs; the lottery's line is the one closest to 50/50.
  if (model.means) {
    for (const team of ['away', 'home']) {
      const posted = lotteryTeamTotal(model.means[team]).line;
      for (let d = -TEAM_TOTAL_SPAN; d <= TEAM_TOTAL_SPAN; d++) {
        const line = posted + d;
        if (line <= 0) continue;
        const over = teamOverChance(model.means[team], line);
        if (!(lineInRange(over) && lineInRange(1 - over))) continue;
        const k = cut('twoWay');
        for (const side of ['over', 'under']) {
          const p = side === 'over' ? over : 1 - over;
          out.push({
            ...base,
            id: `${game.id}|tt|${team}|${line}|${side}`,
            kind: 'teamtotal',
            side,
            team,
            teamLine: line,
            posted: line === posted,
            market: `tt|${team}|${line}`,
            fairMargin: line === posted ? 0.03 : 0.04,
            errKey: !mlb ? errKeyOf(game.sport) : line === posted ? 'mlbTeamTotal' : 'mlbTeamTotalExtra',
            fairChance: p,
            cut: k,
            estOdds: estimateLineOdds(p, k)
          });
        }
      }
    }
  }
  return out;
}

// Tennis: the bookmaker's game handicap and total games (every set's games),
// at the two-way cut.
function tennisLines(game, base) {
  const out = [];
  const k = houseCut({ base: 'twoWay' });
  if (game.spread) {
    const { awayLine, awayFair } = game.spread;
    for (const side of ['away', 'home']) {
      const p = side === 'away' ? awayFair : 1 - awayFair;
      const line = side === 'away' ? awayLine : -awayLine;
      out.push({ ...base, id: `${game.id}|gh|${line}|${side}`, kind: 'gamehcap', side, runLine: line, awayLine, giver: awayLine < 0 ? 'away' : 'home', posted: true, market: `gh|${awayLine}`, fairMargin: 0.03, errKey: 'extra', fairChance: p, cut: k, estOdds: estimateLineOdds(p, k) });
    }
  }
  if (game.total) {
    const { line, overFair } = game.total;
    for (const side of ['over', 'under']) {
      const p = side === 'over' ? overFair : 1 - overFair;
      out.push({ ...base, id: `${game.id}|gt|${line}|${side}`, kind: 'gametotal', side, totalLine: line, mainLine: true, posted: true, market: `gt|${line}`, fairMargin: 0.03, errKey: 'extra', fairChance: p, cut: k, estOdds: estimateLineOdds(p, k) });
    }
  }
  return out;
}

// ---- The model's fallbacks ----------------------------------------------------------
//
// Markets Kambi has and the model otherwise wouldn't: soccer's draw no bet
// and corners, tennis's first set, set score and game lines. Kambi's own
// (offers.mjs) take their place once read.
export const CORNERS_MEAN = 10.2;
const CORNERS_DISPERSION = 12;
function fallbackOptions(game, base, probs, made) {
  const family = familyOf(game.sport);
  const markets = [];
  const twoWay = houseCut({ base: 'twoWay' });
  if (family === 'soccer' && probs.draw != null) {
    const h = probs.home / (probs.home + probs.away);
    markets.push({ kind: 'dnb', market: 'dnb', cut: twoWay, picks: [{ side: 'home', fair: h }, { side: 'away', fair: 1 - h }] });
    // Corners settle from ESPN's team stats.
    if (LEAGUES[game.sport]?.path && !game.scoreOnly) {
      for (const line of [8.5, 9.5, 10.5, 11.5]) {
        const over = atLeast(CORNERS_MEAN, Math.ceil(line), CORNERS_DISPERSION);
        markets.push({ kind: 'corners', market: `corners|${line}`, line, main: line === 9.5, cut: twoWay, picks: [{ side: 'over', fair: over }, { side: 'under', fair: 1 - over }] });
      }
    }
  }
  if (family === 'tennis') {
    const have = new Set(made.map(o => o.kind));
    const model = tennisMarkets(probs.home / (probs.home + probs.away), { bestOf: bestOfFor(game.sport, game.group), cut: { twoWay, bands: houseCut({ base: 'bands' }) } });
    markets.push(...model.filter(m => !have.has(m.kind)));
  }
  return marketOptions(game, base, markets);
}

// The game's players' picks: Kambi's first, then the model's (propmodel.mjs)
// for every player, number and line Kambi doesn't price; each with the
// player's picture when ESPN's roster has them.
// A player's picture from the roster, and whether it's only ESPN's guess by id.
const photoOf = (players, name) => {
  const p = playerByName(players, name);
  return { photo: p?.photo ?? null, photoGuessed: Boolean(p?.guessed) };
};
function gameProps(game, probs) {
  const players = game.players ?? null;
  const kambi = game.offers?.props ?? [];
  const key = p => `${p.stat}|${p.line ?? ''}|${normPlayer(p.player)}|${p.side}`;
  const seen = new Set(kambi.map(key));
  let model = [];
  if (players?.length) {
    const family = familyOf(game.sport);
    let scores = null;
    if (family === 'soccer' && probs.draw != null) scores = fitGoals(probs.home, probs.away);
    else scores = teamScores(family, { total: game.total?.line, spread: game.spread?.awayLine ?? null, homeWin: probs.home / (probs.home + probs.away) });
    model = modelProps(game.sport, players, scores).filter(p => !seen.has(key(p)));
  }
  return [...kambi, ...model].map(p => ({ ...p, ...photoOf(players, p.player) }));
}

// A game's own Kambi markets and players alone (a live game's: the page
// prices its winner and main lines itself), with the house's rules on each.
export function offerOptions(game, offers, extra = {}) {
  const base = { gameId: game.id, game, sport: game.sport, start: game.startUtc, ...extra };
  const out = [...marketOptions(game, base, offers.markets || [], { real: true }), ...(LEAGUES[game.sport]?.path ? propOptions(game, base, offers.props || []) : [])];
  for (const o of out) Object.assign(o, houseRule(o.kind, o.estOdds));
  return out;
}

// One option per player pick, at the two-way cut; a ticket with one is
// capped (SLIP_RULES.capped).
function propOptions(game, base, props) {
  const k = houseCut({ base: 'twoWay' });
  const modelCut = houseCut({ base: MODEL_CUT });
  return props.map(p => {
    const key = `${p.stat}|${p.line ?? ''}|${p.player}`;
    const cut = p.model ? modelCut : k;
    return {
      ...base,
      id: `${game.id}|prop|${key}|${p.side}`,
      kind: 'prop',
      side: p.side,
      market: `prop|${key}`,
      group: `${p.stat}|${p.line ?? ''}`,
      stat: p.stat,
      propLine: p.line,
      player: p.player,
      posted: !p.model,
      real: !p.model,
      photo: p.photo ?? null,
      photoGuessed: Boolean(p.photoGuessed),
      fairChance: p.fair,
      fairMargin: p.model ? 0.06 : p.sided ? 0.04 : 0.02,
      errKey: 'extra',
      cut,
      estOdds: estimateLineOdds(p.fair, cut),
      cap: 'prop',
      settle: { stat: p.stat, line: p.line, player: p.player }
    };
  });
}

// Every side market of a game (markets.mjs).
function sideOptions(game, base, probs) {
  const family = familyOf(game.sport);
  const homeWin = probs.home / (probs.home + probs.away);
  let markets = [];
  if (family === 'baseball') markets = baseballMarkets({ homeWin, total: game.total });
  else if (family === 'football' || family === 'basketball') {
    const model = pointsModel(game.sport, { homeWin, spread: game.spread, total: game.total });
    if (model) markets = pointsMarkets(model, { spreadLine: game.spread?.awayLine ?? null, totalLine: game.total?.line ?? null });
  } else if (family === 'hockey') markets = goalMarkets(fitHockey(homeWin, game.total), { family, totalLine: game.total?.line ?? null });
  else if (family === 'soccer' && probs.draw != null) {
    // Totals come from lineOptions; the rest from each team's mean goals.
    markets = goalMarkets(fitGoals(probs.home, probs.away), { family }).filter(m => m.kind !== 'total');
  }
  return marketOptions(game, base, markets);
}

// Options from markets in markets.mjs's shape (the models', or Kambi's own:
// offers.mjs). A line market of baseball and soccer keeps lineOptions' ids,
// tennis's tennisLines', so a pick on the slip stays the same pick whichever
// priced it.
function optionId(game, m, pick) {
  const family = familyOf(game.sport);
  if (family === 'baseball' || family === 'soccer') {
    if (m.kind === 'total') return `${game.id}|tot|${m.line}|${pick.side}`;
    if (m.kind === 'runline') return `${game.id}|rl|${pick.line}|${pick.side}`;
    if (m.kind === 'teamtotal') return `${game.id}|tt|${m.team}|${m.line}|${pick.side}`;
  }
  if (m.kind === 'gametotal') return `${game.id}|gt|${m.line}|${pick.side}`;
  if (m.kind === 'gamehcap') return `${game.id}|gh|${pick.line}|${pick.side}`;
  return `${game.id}|${m.kind}|${m.market}|${pick.side}`;
}
function marketOptions(game, base, markets, { real = false } = {}) {
  const out = [];
  for (const m of markets) {
    const k = houseCut({ base: m.cut });
    for (const pick of m.picks) {
      const o = {
        ...base,
        id: optionId(game, m, pick),
        kind: m.kind,
        side: pick.side,
        market: m.market,
        posted: m.posted ?? false,
        fairChance: pick.fair,
        fairMargin: null,
        errKey: 'extra',
        cut: k,
        estOdds: marketOdds(m, pick.fair, k),
        ...(real ? { real: true } : {}),
        m,
        pick,
        settle: { lo: pick.lo, hi: pick.hi, score: pick.score, listed: m.listed, team: pick.team, ht: pick.ht, ft: pick.ft, ...(m.line != null && m.kind !== 'total' ? { line: m.line } : {}) }
      };
      if (m.kind === 'runline' || m.kind === 'gamehcap') Object.assign(o, { runLine: pick.line, awayLine: m.awayLine, giver: m.giver });
      if (m.kind === 'teamtotal') Object.assign(o, { team: m.team, teamLine: m.line });
      if (m.kind === 'htotal' || m.kind === 'f5total' || m.kind === 'corners') Object.assign(o, { line: m.line });
      if (m.kind === 'total' || m.kind === 'gametotal') Object.assign(o, { totalLine: m.line, mainLine: m.main });
      out.push(o);
    }
  }
  return out;
}

// Every option of one game, priced, with the house's rules on each.
export function gameOptions(game) {
  const blend = blendOutcomes(game.draftKings, game.polymarket, game.house, game.kambi);
  if (!blend) return [];
  // No total posted (a game only Polymarket or Kambi prices the winner of):
  // our own, so it gets every market all the same.
  game = withModelLines(game, blend.probs);
  const base = { gameId: game.id, game, sport: game.sport, start: game.startUtc };
  const sides = isSoccer(game.sport) ? ['home', 'draw', 'away'] : ['away', 'home'];
  // The winner at the lottery's cut (rules.mjs houseCut), the same for every
  // source; two books' gap is the price's margin of error.
  const [first, second] = [game.kambi, game.draftKings, game.polymarket].filter(Boolean);
  const both = first && second && Object.keys(first).every(k => k in second);
  // Soccer's 不讓分 has three outcomes: the lottery's three-way cut (its 1X2
  // odds add up to about 120%), not the two-way one.
  const mlCut = houseCut({ base: isSoccer(game.sport) ? 'threeWay' : blend.k });
  const out = sides.map(side => ({
    ...base,
    id: `${game.id}|ml|${side}`,
    kind: 'ml',
    side,
    market: 'ml',
    // Never below half of Polymarket's 1-cent price step.
    fairMargin: both ? Math.max(0.005, Math.abs(first[side] - second[side]) / 2) : null,
    errKey: errKeyOf(game.sport),
    fairChance: blend.probs[side],
    cut: mlCut,
    estOdds: estimateLotteryOdds(blend.probs[side], mlCut)
  }));
  const family = familyOf(game.sport);
  if (family === 'baseball' || family === 'soccer') out.push(...lineOptions(game, base, blend.probs));
  if (family === 'tennis') out.push(...tennisLines(game, base));
  out.push(...sideOptions(game, base, blend.probs));
  out.push(...fallbackOptions(game, base, blend.probs, out));
  // 得分最高單局: the lottery's own (nearly fixed) table, its cut removed;
  // every baseball league (the table barely moves from game to game).
  if (family === 'baseball') {
    const book = TOP_INNING_ODDS.reduce((sum, o) => sum + 1 / o, 0);
    TOP_INNING_ODDS.forEach((odds, i) => out.push({ ...base, id: `${game.id}|inning|${i}`, kind: 'inning', market: 'inning', inning: i, fairMargin: null, errKey: 'topInning', fairChance: 1 / odds / book, estOdds: odds }));
  }
  // Kambi's own markets of the game, once its page has them (offers.mjs):
  // each kind Kambi prices takes the place of the model's.
  if (game.offers?.markets?.length) {
    // Corners settle from ESPN's team stats: not for a league ESPN doesn't carry.
    const markets = LEAGUES[game.sport]?.path ? game.offers.markets : game.offers.markets.filter(m => m.kind !== 'corners');
    const real = marketOptions(game, base, markets, { real: true });
    const kinds = new Set(real.map(o => o.kind));
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind !== 'ml' && kinds.has(out[i].kind)) out.splice(i, 1);
    out.push(...real);
  }
  // Players' markets (props.mjs), only where ESPN's box score settles them:
  // Kambi's, and the model's for every player and number Kambi leaves out.
  if (LEAGUES[game.sport]?.path) out.push(...propOptions(game, base, gameProps(game, blend.probs)));
  // Odd or even: a coin flip at a full cut, no longer sold.
  for (let i = out.length - 1; i >= 0; i--) if (out[i].kind === 'oddeven') out.splice(i, 1);
  for (const o of out) Object.assign(o, houseRule(o.kind, o.estOdds));
  // The books far apart on the game: locked until they agree (blendOutcomes).
  if (blend.disputed) for (const o of out) o.lock = 'check';
  // Priced by the house alone (no bookmaker yet: weeks out, preseason, a
  // cup's minnow): every market all the same, on a smaller ticket (SLIP_RULES.capped).
  if (blend.source === 'house') for (const o of out) o.cap = 'house';
  // A game settled from its final score alone (schedules.mjs): nothing on a part of it.
  return game.scoreOnly ? out.filter(o => !PART_KINDS.has(o.kind)) : out;
}
const PART_KINDS = new Set(['htft', 'htotal', 'f5', 'f5total', 'q1', 'half', 'regulation', 'firstinning', 'inning', 'nextrun', 'firstset', 'gamehcap', 'gametotal']);

// ---- The simulated crowd's pool ----------------------------------------------

// Where each option sits on its game's shared result: the winner and every
// handicap of a game on one number line (the away side's slice first), every
// total line on another (under first), so one game's markets agree; other
// markets stacked in order within their own.
function resultSlice(o, probs) {
  const game = `${o.sport}|${o.gameId}`;
  if (o.kind === 'ml') {
    const lo = { away: 0, draw: probs.away ?? 0, home: (probs.away ?? 0) + (probs.draw ?? 0) }[o.side];
    return { key: `${game}|side`, outLo: lo, outHi: lo + o.fairChance };
  }
  if (o.kind === 'runline') {
    const away = o.side === 'away' ? o.fairChance : 1 - o.fairChance;
    return { key: `${game}|side`, outLo: o.side === 'away' ? 0 : away, outHi: o.side === 'away' ? away : 1 };
  }
  // A podium finish: its own yes-or-no draw, not stacked with the others.
  if (o.kind === 'f1podium') return { key: `${game}|${o.market}`, outLo: 0, outHi: o.fairChance };
  if (o.kind === 'dc') {
    // Two results of three on the winner's line (away, draw, home); away or
    // home wraps round it (from home's start, past 1, to away's end).
    const a = probs.away ?? 0;
    const d = probs.draw ?? 0;
    const slice = { 'draw|away': [0, a + d], 'home|draw': [a, 1], 'home|away': [a + d, a] }[o.side];
    return { key: `${game}|side`, outLo: slice[0], outHi: slice[1] };
  }
  if (o.kind === 'total' || o.kind === 'teamtotal' || o.kind === 'htotal' || o.kind === 'f5total') {
    const over = o.side === 'over' ? o.fairChance : 1 - o.fairChance;
    return { key: `${game}|${o.kind}${o.kind === 'teamtotal' ? `|${o.team}` : ''}`, outLo: o.side === 'under' ? 0 : 1 - over, outHi: o.side === 'under' ? 1 - over : 1 };
  }
  return { key: `${game}|${o.market ?? o.kind}` };
}

// A board's options as the crowd's pool: what's on sale (locked options and
// live ones dropped), at `oddsOf(option)` (the estimate by default).
export function crowdPool(options, oddsOf = o => o.estOdds) {
  const winners = new Map();
  for (const o of options) if (o.kind === 'ml') winners.set(o.gameId, { ...(winners.get(o.gameId) ?? {}), [o.side]: o.fairChance });
  return options
    .filter(o => !o.lock && !o.live && o.fairChance > 0)
    .map(o => ({ gameId: o.gameId, kind: o.kind, market: o.market ?? o.kind, fairChance: o.fairChance, odds: oddsOf(o), minLegs: o.minLegs ?? 1, ...resultSlice(o, winners.get(o.gameId) ?? {}) }));
}

// ---- F1: 前三名 (podium) --------------------------------------------------------

// Pole position from the race winner's chances when no market prices it:
// the same order, a little sharper (qualifying is pace alone, no strategy or
// incidents; the pole sitter goes on to win about 45% of races).
export const POLE_SHARPEN = 1.2;
export function f1PoleFromWinner(drivers) {
  const w = drivers.map(d => Math.max(0, d.fair) ** POLE_SHARPEN);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return drivers.map((d, i) => ({ name: d.name, fair: w[i] / sum }));
}

// Each driver's chance of a top-three finish from the win chances (Harville:
// second place goes as the win chances of the rest, and so on), priced to
// return what the race's winner board does on average (the lottery takes
// the same on both), at most the lottery's 500.
export function f1Podium(drivers) {
  const p = drivers.map(d => d.fair);
  const n = p.length;
  const podium = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    podium[i] += p[i];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const second = (p[j] * p[i]) / (1 - p[j]);
      podium[i] += second;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        podium[i] += (p[j] * p[k] * p[i]) / ((1 - p[j]) * (1 - p[j] - p[k]));
      }
    }
  }
  // The winner board's return, weighted as people pick (by chance).
  const sum = p.reduce((a, b) => a + b, 0) || 1;
  const back = drivers.reduce((s, d) => s + (d.fair / sum) * d.fair * d.odds, 0);
  return drivers.map((d, i) => {
    const fair = Math.min(0.995, podium[i]);
    const odds = Math.min(500, Math.max(1.01, Math.round((back / fair) * 100) / 100));
    return { fair, odds, ...houseRule('f1podium', odds) };
  });
}

// More F1 markets from the same win chances: each driver's chance of a top
// six or top ten finish, of beating their teammate, and each team's chance
// of the win. Finishing orders are drawn by Harville (the next place goes as
// the win chances of the drivers left), 40,000 times with a fixed seed, so
// the board is the same on every device. Priced like the podium: to return
// what the winner board does on average, at most 500.
export function f1Markets(drivers, { runs = 40_000, seed = 7 } = {}) {
  const n = drivers.length;
  const p = drivers.map(d => Math.max(1e-6, d.fair));
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const top6 = new Float64Array(n);
  const top10 = new Float64Array(n);
  const place = new Int32Array(n);
  const teams = [...new Set(drivers.map(d => d.team).filter(Boolean))];
  const pairs = teams.map(team => drivers.map((d, i) => (d.team === team ? i : -1)).filter(i => i >= 0)).filter(x => x.length === 2);
  const ahead = pairs.map(() => 0);
  const left = new Float64Array(n);
  for (let r = 0; r < runs; r++) {
    left.set(p);
    let total = p.reduce((x, y) => x + y, 0);
    for (let pos = 0; pos < n; pos++) {
      let u = rand() * total;
      let k = 0;
      while (k < n - 1 && (left[k] === 0 || (u -= left[k]) > 0)) k++;
      if (left[k] === 0) k = left.findIndex(v => v > 0);
      place[k] = pos;
      total -= left[k];
      left[k] = 0;
      if (pos < 6) top6[k]++;
      if (pos < 10) top10[k]++;
    }
    pairs.forEach(([i, j], x) => place[i] < place[j] && ahead[x]++);
  }
  const sum = p.reduce((x, y) => x + y, 0) || 1;
  const back = drivers.reduce((s, d) => s + (d.fair / sum) * d.fair * d.odds, 0);
  const price = (fair, kind) => {
    const odds = Math.min(500, Math.max(1.01, Math.round((back / Math.min(0.995, fair)) * 100) / 100));
    return { fair: Math.min(0.995, fair), odds, ...houseRule(kind, odds) };
  };
  return {
    top6: drivers.map((d, i) => price(top6[i] / runs, 'f1top')),
    top10: drivers.map((d, i) => price(top10[i] / runs, 'f1top')),
    h2h: pairs.flatMap(([i, j], x) => {
      const pi = ahead[x] / runs;
      return [{ driver: i, rival: j, ...price(pi, 'f1h2h') }, { driver: j, rival: i, ...price(1 - pi, 'f1h2h') }];
    }),
    teams: teams.map(team => price(drivers.reduce((s, d) => s + (d.team === team ? d.fair / sum : 0), 0), 'f1team')).map((x, k) => ({ team: teams[k], ...x }))
  };
}
