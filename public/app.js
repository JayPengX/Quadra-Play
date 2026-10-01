import {
  FUTURES_OVERROUND, ODDS_ERROR, estimateF1LotteryOdds, f1Phase, estimateFuturesOdds, slipPayoutTable, settleSlip, boostRate, PARLAY_BOOST, median, quantile, SLIP_RULES, afterTax, slipErrors, slipSizes, combosBySize, comboCount, estimateLineOdds, MLB_MARKET_OVERROUND
} from './lib/odds.mjs';
import {
  FANS, STYLES, SPORTS, SIM_SPORTS, sportTemplate, weekOfYear, crowdPools, crowdSize, hashString, simulateCrowd, MONTH_WEEKS, PERIOD_MONTHS, monthWeeks
} from './lib/sim.mjs';
import { ticketProfile, accountTickets } from './lib/profile.mjs';
import { useSourcesSession, loadOdds, loadExtraLeagues, loadExtraFutures, taipeiDayKey, fetchOutcomes, loadLive, parseInning, loadFutureTeams, futureTeamLeagues } from './lib/sources.mjs';
import { inningsLeft, liveBaseball, liveSoccer, liveGoals, livePoints, fitGoals, liveMarkets, liveOdds, pregameRuns, nextRunChances, nextRunOdds, LIVE_MIN_LIQUIDITY, LIVE_THREE_WAY, PERIODS } from './lib/live.mjs';
import { fitHockey } from './lib/markets.mjs';
import {
  WEEKLY_GRANT, newAccount, balance, canClaim, claimGrant, newSlipId, placeSlip, placeFreeSlip, FREE_MIN_ODDS, freeOddsOk, legResult, applyResults, mergeAccounts, recoverFromWallet, refundLost, mergeDistinct, poolEntries, compactAccount, cashOut, isAccount, liftUsedToday, liftFits
} from './lib/account.mjs';
import { cashOutValue, CASHOUT_KEEP } from './lib/cashout.mjs';
import { renderHome } from './home.js';
import { mountLottery } from './lottery-ui.js';
import { mountStats } from './stats-ui.js';
import {
  othersBalance, installGate, watchUpdates, quadraSession, tabBar, topActions, recordAffinity, affinityPatch, activityPatch, notify, schedulePush, storedAccount, PLUS, plusMember, openPlus, ask, tell, freeBets
} from './lib/quadra.mjs';
import { pack, unpack } from './lib/codec.mjs';
import { historyStats, funFacts, crowdPercentile } from './lib/history.mjs';
import { detectLocale, makeT } from './lib/i18n.mjs';
import { f1Driver, f1Constructor, findTeamLogo, countryFlag, countryCode, leagueLogo, teamLogo, teamZh, LEAGUES, familyOf, isSoccer, isNeutral, isPlayers, normalizeTeamName, playerNation, flagEmoji } from './lib/teams.mjs';
import { flagUrl } from './lib/logos.mjs';
import { logoPicture, raceName } from './lib/logos.mjs';
import { houseRule, houseCut, minLegsProblem, leagueTier } from './lib/rules.mjs';
import { gameOptions, crowdPool, f1Podium, f1Markets, f1PoleFromWinner } from './lib/board.mjs';
import { auditPools } from './lib/audit.mjs';
import { recommend } from './lib/recommend.mjs';

// Simulated people per pick style x series-follow group, on average: each style
// gets its share of the crowd, 100,000 people in all.
const PER_GROUP = Math.ceil(100_000 / (STYLES.length * FANS.length));
const SIM_PLAYERS = crowdSize(PER_GROUP);
const SIM_SEED = 1;
// Shown as a round "100,000".
const SIM_PLAYERS_SHOWN = Math.round(SIM_PLAYERS / 1000) * 1000;
// Championship teams shown before the rest fold away.
const FUTURES_SHOWN = 8;
const ACCOUNT_KEY = 'oddsStudy.account';
// Saved slips shown before the rest fold away.
const SAVED_SHOWN = 10;

const state = {
  locale: detectLocale(),
  t: null,
  data: null,
  bets: [],
  futures: [],
  // Recommended picks (recommend.mjs): bet id -> { tag, back, beats }.
  recs: new Map(),
  // Games in progress and their live bets.
  liveGames: [],
  liveBets: [],
  liveRecs: new Map(),
  liveAt: null,
  parlay: [],
  pickedOdds: {},
  slipMode: 'single',
  // Chosen 過關組合 sizes; 'all' stands for 全過, whatever the leg count.
  slipSizes: new Set([2, 'all']),
  // The stake per combination: the last one used on this device.
  slipStake: (() => {
    try {
      const v = Number(localStorage.getItem('play.stake'));
      return v >= 10 && v % 10 === 0 ? v : 500;
    } catch {
      return 500;
    }
  })(),
  day: null,
  dayPicked: false,
  // True until the first simulation is ready: the loading screen covers the page.
  booting: true,
  sport: 'all',
  tab: 'home',
  // Game cards showing all their markets.
  open: new Set(),
  // Each open game's market tab (大小分, 讓分, 單隊大小, 得分最高單局).
  marketTab: new Map(),
  // The simulated account (play money) and its sync.
  account: null,
  accountReady: false,
  // Resolves once the account is read and merged with the pass (boot).
  accountIn: null,
  // Resolves once the account is read and merged with the pass (boot).
  accountIn: null,
  sync: { busy: false, error: '', at: null },
  // The Quadra Pass's wallet (the shared money pool), when the code is a pass.
  wallet: null,
  // Slips saved or settled since the page opened, highlighted.
  freshSlips: new Set(),
  checking: false,
  checkedAt: 0,
  // Games in progress on open slips: leg id -> its outcome so far.
  legLive: new Map(),
  showAllSaved: false,
  // 大手筆 (bets grow with the balance) or 真實 (survey-based stakes) in the simulator.
  // The leaderboard shown.
  leaderKey: 'best',
  historyFilter: 'all',
  // 紀錄 shows the slips or the stats.
  historyView: 'slips'
};
state.t = makeT(state.locale);

const $ = id => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ---- Formatting -------------------------------------------------------------

function numberLocale() {
  return state.locale === 'zh' ? 'zh-TW' : 'en-US';
}

// Formatters are made once per language and kept: making one is slow
// (Safari especially), and hundreds of bets are formatted on every tap.
const formatters = new Map();
function formatter(kind, make) {
  const key = `${kind}|${numberLocale()}`;
  if (!formatters.has(key)) formatters.set(key, make(numberLocale()));
  return formatters.get(key);
}
const fmtInt = n => formatter('int', locale => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })).format(n);

function fmtMoney(value, { sign = true } = {}) {
  const abs = fmtInt(Math.abs(Math.round(value)));
  if (!sign) return `NT$${abs}`;
  return `${value < -0.5 ? '−' : value > 0.5 ? '+' : ''}NT$${abs}`;
}

function fmtOdds(o) {
  return o.toFixed(2);
}

// Taiwan time, like the lottery, wherever the page is opened.
function fmtTime(iso) {
  return formatter('time', locale =>
    new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Taipei'
    })
  ).format(new Date(iso));
}

function teamName(team) {
  return state.locale === 'zh' ? team.zh : team.en;
}

// ---- Bets -------------------------------------------------------------------

function matchupText(game) {
  // Players at a neutral venue: in the order the draw lists them.
  return isSoccer(game.sport) || isNeutral(game.sport)
    ? `${teamName(game.home)} vs ${teamName(game.away)}`
    : `${teamName(game.away)} @ ${teamName(game.home)}`;
}

// Which competition a game is in: its league, and for tours and cups the
// event (Kambi's group: "Chengdu", "Italy Serie A" …).
function gameSeries(game) {
  const league = state.t(`sport_${game.sport}`);
  // Leagues whose Kambi group is only the league again ("Chinese Professional Baseball", "UFC"), or says nothing ("Upcoming Fights", cricket's "Matches").
  const plain = ['baseball', 'basketball', 'rugby', 'mma', 'boxing', 'cricket'].includes(familyOf(game.sport));
  const event = game.group && !plain && normalizeTeamName(game.group) !== normalizeTeamName(league) ? game.group : null;
  return event ? `${league} · ${event}` : league;
}

// ---- Names for the board's options (board.mjs prices them) --------------------

function fmtLine(line) {
  return `${line > 0 ? '+' : line < 0 ? '−' : ''}${Math.abs(line)}`;
}

// A priced option with what the page calls it: `chip` (on its button),
// `label` (in full), `shortLabel` (on the slip) and `marketLabel` (its
// market's heading).
function named(game, o, matchup) {
  const t = state.t;
  const team = side => teamName(game[side]);
  const unit = () => t(`unit_${LEAGUES[game.sport]?.sets?.unit ?? 'points'}`);
  switch (o.kind) {
    case 'ml': {
      const name = o.side === 'draw' ? t('draw') : team(o.side);
      return { ...o, matchup, chip: name, label: o.side === 'draw' ? `${matchup} ${name}` : `${name} ${t('win')}`, shortLabel: name };
    }
    case 'total':
      return { ...o, matchup, marketLabel: String(o.totalLine), chip: t(o.side), label: `${matchup} ${t(o.side)} ${o.totalLine}`, shortLabel: `${t(o.side)} ${o.totalLine}` };
    case 'runline': {
      const text = `${team(o.side)} ${fmtLine(o.runLine)}`;
      return { ...o, matchup, marketLabel: `${team(o.giver)} ${fmtLine(-Math.abs(o.awayLine))}`, chip: text, label: text, shortLabel: `${t('runLine')} ${text}` };
    }
    case 'teamtotal': {
      const text = `${team(o.team)} ${t(o.side)} ${o.teamLine}`;
      return { ...o, matchup, marketLabel: `${team(o.team)} ${o.teamLine}`, chip: t(o.side), label: text, shortLabel: text };
    }
    case 'inning': {
      const name = o.inning < 9 ? t('inningN', { n: o.inning + 1 }) : t('inningTie');
      return { ...o, matchup, chip: name, label: `${matchup} ${t('topInning')} ${name}`, shortLabel: name };
    }
    case 'gamehcap': {
      const text = `${team(o.side)} ${fmtLine(o.line)}`;
      return { ...o, matchup, marketLabel: `${team(o.giver)} ${fmtLine(-Math.abs(o.awayLine))} ${unit()}`, chip: text, label: text, shortLabel: `${t('secGameHcap')} ${text}` };
    }
    case 'gametotal':
      return { ...o, matchup, marketLabel: `${o.line} ${unit()}`, chip: t(o.side), label: `${matchup} ${t(o.side)} ${o.line}`, shortLabel: `${t(o.side)} ${o.line} ${unit()}` };
    default: {
      const name = pickName(game, o.m, o.pick);
      return { ...o, matchup, marketLabel: marketLabelOf(game, o.m), chip: name, label: `${matchup} ${name}`, shortLabel: name };
    }
  }
}

// A market's heading inside its section, when it needs one.
function marketLabelOf(game, m) {
  const t = state.t;
  if (m.kind === 'runline' || m.kind === 'total') return null;
  if (m.kind === 'totalsets') return `${t('secTotalSets')} ${m.line}`;
  if (m.kind === 'sethcap') return `${teamName(game[m.giver])} ${fmtLine(-Math.abs(m.awayLine))}`;
  if (m.kind === 'nextrun') return t('firstScore');
  return t(SECTIONS.find(sec => sec.kind === m.kind)?.title ?? m.kind);
}

const RESULT_SHORT = { home: 'homeShort', draw: 'drawShort', away: 'awayShort' };

// What a pick is called: a team, a line, a band, a score …
function pickName(game, market, pick) {
  const t = state.t;
  if (market.kind === 'runline' || market.kind === 'sethcap') return `${teamName(game[pick.side])} ${fmtLine(pick.line)}`;
  if (market.kind === 'dc') return pick.side.split('|').map(x => (x === 'draw' ? t('draw') : teamName(game[x]))).join(' / ');
  if (market.kind === 'htft') return `${t(RESULT_SHORT[pick.ht])}/${t(RESULT_SHORT[pick.ft])}`;
  if (market.kind === 'goalbands') return pick.hi == null ? `${pick.lo}+` : `${pick.lo}-${pick.hi}`;
  if (market.kind === 'sets') {
    // The winner and the score in sets (frames): "Sinner 2:1".
    const [h, a] = pick.score.split('-').map(Number);
    return `${teamName(game[h > a ? 'home' : 'away'])} ${Math.max(h, a)}:${Math.min(h, a)}`;
  }
  if (market.kind === 'margin') return `${teamName(game[pick.team])} ${pick.hi == null ? `${pick.lo}+` : pick.lo === pick.hi ? pick.lo : `${pick.lo}-${pick.hi}`}`;
  if (market.kind === 'score') return pick.score === 'other' ? t('scoreOther') : pick.score.replace('-', ':');
  if (pick.side === 'away' || pick.side === 'home') return teamName(game[pick.side]);
  return t({ draw: 'draw', odd: 'odd', even: 'even', yes: 'yes', no: 'no', over: 'over', under: 'under' }[pick.side] ?? pick.side);
}

function buildBets(data) {
  const t = state.t;
  const bets = [];
  for (const game of data.games) {
    const matchup = matchupText(game);
    for (const o of gameOptions(game)) bets.push(named(game, o, matchup));
  }
  if (data.f1) {
    // Before qualifying the lottery prices the race on its own curve.
    const phase = f1Phase(new Date(), { qualifyingUtc: data.f1.qualifyingUtc, raceUtc: data.f1.startUtc });
    data.f1.phase = phase;
    for (const d of data.f1.drivers) {
      const driver = f1Driver(d.name);
      const name = state.locale === 'zh' ? driver.zh : d.name;
      bets.push({
        id: `f1|${d.name}`,
        gameId: 'f1',
        kind: 'f1',
        sport: 'f1',
        matchup: raceName(data.f1.title, state.locale),
        start: data.f1.startUtc,
        label: `F1 ${name}`,
        shortLabel: name,
        driverEn: d.name,
        driver,
        fairChance: d.fair,
        fairMargin: null,
        errKey: `${phase === 'pre' ? 'f1Pre' : 'f1'}${d.fair < 0.01 ? 'Longshot' : ''}`,
        estOdds: estimateF1LotteryOdds(d.fair, phase)
      });
    }
    // 前三名: the same drivers finishing in the top three.
    const winners = bets.filter(b => b.kind === 'f1');
    f1Podium(winners.map(b => ({ fair: b.fairChance, odds: b.estOdds }))).forEach((p, i) => {
      const w = winners[i];
      bets.push({ ...w, id: `f1pod|${w.driverEn}`, gameId: `f1pod|${w.driverEn}`, kind: 'f1podium', market: `f1podium|${w.driverEn}`, label: `F1 ${t('f1PodiumShort')} ${w.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    });
    // Top six, top ten, teammates head to head and the winning team.
    const more = f1Markets(winners.map(b => ({ fair: b.fairChance, odds: b.estOdds, team: b.driver.team })));
    for (const [key, list, short] of [['f1top6', more.top6, 'f1Top6Short'], ['f1top10', more.top10, 'f1Top10Short']])
      list.forEach((p, i) => {
        const w = winners[i];
        bets.push({ ...w, id: `${key}|${w.driverEn}`, gameId: `${key}|${w.driverEn}`, kind: key, market: `${key}|${w.driverEn}`, label: `F1 ${t(short)} ${w.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
      });
    for (const p of more.h2h) {
      const w = winners[p.driver];
      const r = winners[p.rival];
      bets.push({ ...w, id: `f1h2h|${w.driverEn}|${r.driverEn}`, gameId: `f1h2h|${[w.driverEn, r.driverEn].sort().join('|')}`, kind: 'f1h2h', market: `f1h2h|${[w.driverEn, r.driverEn].sort().join('|')}`, rival: r.driverEn, settle: { rival: r.driverEn }, rivalLabel: r.shortLabel, label: `F1 ${w.shortLabel} ${t('f1H2HBeats')} ${r.shortLabel}`, shortLabel: `${w.shortLabel} > ${r.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    }
    for (const p of more.teams) {
      bets.push({ id: `f1team|${p.team}`, gameId: 'f1team', kind: 'f1team', sport: 'f1', market: 'f1team', matchup: raceName(data.f1.title, state.locale), start: data.f1.startUtc, team: p.team, label: `F1 ${t('f1TeamShort')} ${p.team}`, shortLabel: p.team, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    }
    // 排位賽第一 (pole position), until qualifying starts: Polymarket's or
    // Kambi's price when either has one, else from the race winner's chances
    // (the pole sitter is usually among the favourites, a little more so).
    if (data.f1.qualifyingUtc && Date.parse(data.f1.qualifyingUtc) > Date.now()) {
      const pole = data.f1.pole?.drivers?.length ? data.f1.pole.drivers : f1PoleFromWinner(data.f1.drivers);
      for (const d of pole) {
        const w = winners.find(b => normalizeTeamName(b.driverEn) === normalizeTeamName(d.name));
        const driver = w?.driver ?? f1Driver(d.name);
        const name = w?.shortLabel ?? (state.locale === 'zh' ? driver.zh : d.name);
        bets.push({
          id: `f1pole|${d.name}`,
          gameId: 'f1pole',
          kind: 'f1pole',
          sport: 'f1',
          market: 'f1pole',
          matchup: `${raceName(data.f1.title, state.locale)} ${t('f1PoleShort')}`,
          start: data.f1.qualifyingUtc,
          label: `F1 ${t('f1PoleShort')} ${name}`,
          shortLabel: name,
          driverEn: d.name,
          driver,
          poleSource: data.f1.pole?.source ?? 'model',
          fairChance: d.fair,
          fairMargin: null,
          errKey: data.f1.pole ? `f1Pre${d.fair < 0.01 ? 'Longshot' : ''}` : 'extra',
          estOdds: estimateF1LotteryOdds(d.fair, 'pre')
        });
      }
    }
    // Safety car, virtual safety car, red flag: yes or no, priced like a
    // two-way game line.
    for (const [key, name] of [['sc', 'f1Sc'], ['vsc', 'f1Vsc'], ['red', 'f1Red']]) {
      const flag = data.f1.flags?.[key];
      if (!flag) continue;
      for (const pick of ['yes', 'no']) {
        const fair = pick === 'yes' ? flag.fair : 1 - flag.fair;
        const short = `${t(name)} ${t(pick === 'yes' ? 'f1FlagYes' : 'f1FlagNo')}`;
        bets.push({ id: `f1${key}|${pick}`, gameId: `f1${key}`, kind: `f1${key}`, sport: 'f1', market: `f1${key}`, matchup: raceName(data.f1.title, state.locale), start: data.f1.startUtc, pick, settle: { pick }, flagSource: flag.source, label: `F1 ${short}`, shortLabel: short, fairChance: fair, estOdds: estimateLineOdds(fair, MLB_MARKET_OVERROUND), errKey: 'extra' });
      }
    }
  }
  // Single-source games: the typical DraftKings-Polymarket gap of that sport.
  for (const sport of new Set(bets.map(b => b.sport))) {
    const gaps = bets.filter(b => b.sport === sport && b.fairMargin != null).map(b => b.fairMargin);
    const typical = median(gaps) ?? 0.02;
    for (const b of bets) if (b.sport === sport && b.fairMargin == null && (b.kind === 'ml' || b.kind === 'total')) Object.assign(b, { fairMargin: typical, typicalMargin: true });
  }
  return withHouseRules(bets);
}

// The lottery's locks and parlay-only rules (rules.mjs), on every pick
// (board.mjs already applies them to games; F1 and live picks here).
function withHouseRules(bets) {
  for (const b of bets) Object.assign(b, houseRule(b.kind, b.estOdds));
  return bets;
}

// A championship pick's name: drivers as the lottery writes them.
function futureName(market, team) {
  if (market.key === 'f1drivers' && state.locale === 'zh') return f1Driver(team.name.en).zh;
  return teamName(team.name);
}

// One bet per team of every championship market.
function buildFutures(data) {
  const t = state.t;
  return withHouseRules((data.futures || []).flatMap(market => {
    const odds = estimateFuturesOdds(market.teams.map(team => team.fair), FUTURES_OVERROUND[market.key] ?? FUTURES_OVERROUND[market.sport] ?? FUTURES_OVERROUND.other);
    const title = t(`future_${market.key}`, { season: market.season });
    return market.teams.map((team, i) => ({
      id: `fut|${market.key}|${team.name.en}`,
      gameId: `fut|${market.key}`,
      kind: 'future',
      market: market.key,
      sport: market.sport,
      matchup: title,
      label: `${title} ${futureName(market, team)}`,
      shortLabel: futureName(market, team),
      teamEn: team.name.en,
      eventSlug: market.slug,
      fairChance: team.fair,
      fairMargin: null,
      errKey: ODDS_ERROR[`future_${market.key}`] ? (team.fair < 0.004 && market.sport !== 'nba' ? 'futureLongshot' : `future_${market.key}`) : 'futureOther',
      estOdds: odds[i]
    }));
  }));
}

function effectiveOdds(bet) {
  return bet.estOdds;
}

// Days follow Taiwan time, like the lottery.
function dayKey(iso) {
  return taipeiDayKey(iso);
}

// Where a league sits on screen: the catalogue's headline leagues (CPBL
// among them) with the majors, whatever the house's risk tier says about its cut.
const shownTier = sport => (LEAGUES[sport]?.top ? 'major' : leagueTier(sport));

// The sport filter: everything, a kind of sport (g:<group>), or one league.
const SPORT_GROUPS_ALL = {
  baseball: { icon: '⚾', leagues: ['mlb', 'npb', 'kbo', 'cpbl'] },
  basketball: { icon: '🏀', leagues: Object.keys(LEAGUES).filter(key => LEAGUES[key].family === 'basketball' && !LEAGUES[key].off) },
  soccer: { icon: '⚽', leagues: Object.keys(LEAGUES).filter(key => LEAGUES[key].family === 'soccer' && !LEAGUES[key].off) },
  football: { icon: '🏈', leagues: ['nfl', 'ncaaf'] },
  hockey: { icon: '🏒', leagues: ['nhl'] },
  mma: { icon: '🥊', leagues: ['ufc'] },
  boxing: { icon: '🥊', leagues: ['boxing'] },
  cricket: { icon: '🏏', leagues: ['cricket'] },
  rugby: { icon: '🏉', leagues: ['rugbyunion'] },
  tennis: { icon: '🎾', leagues: ['tennis', 'wta'] },
  badminton: { icon: '🏸', leagues: ['badminton'] },
  tabletennis: { icon: '🏓', leagues: ['tabletennis'] },
  volleyball: { icon: '🏐', leagues: ['volleyball'] },
  snooker: { icon: '🎱', leagues: ['snooker'] },
  f1: { icon: '🏎️', leagues: ['f1'] }
};
// Only leagues on sale (Taiwan can watch them); a kind with none left goes.
const SPORT_GROUPS = Object.fromEntries(
  Object.entries(SPORT_GROUPS_ALL)
    .map(([g, x]) => [g, { ...x, leagues: x.leagues.filter(k => k === 'f1' || (LEAGUES[k] && !LEAGUES[k].off)) }])
    .filter(([, x]) => x.leagues.length)
);
const groupOfSport = sport => Object.keys(SPORT_GROUPS).find(g => SPORT_GROUPS[g].leagues.includes(sport));

function inSport(sport) {
  if (state.sport === 'all' || state.sport === sport) return true;
  return state.sport.startsWith('g:') && SPORT_GROUPS[state.sport.slice(2)]?.leagues.includes(sport);
}

// Why the games tab opened on a league instead of the game asked for; gone once another sport is picked.
function renderWantedNote() {
  const note = $('wanted-note');
  if (!note) return;
  note.hidden = !state.wantedNote;
  note.textContent = state.wantedNote || '';
}

function rerenderFiltered() {
  state.wantedNote = '';
  renderWantedNote();
  renderSportFilter();
  renderTabs();
  renderDayFilter();
  renderGames();
  renderLive();
  renderFutures();
  renderF1();
}

function chip({ pressed, icon, text, count, onclick }) {
  return el('button', { class: 'chip', type: 'button', 'aria-pressed': String(pressed), onclick }, [
    icon ?? null,
    el('span', { text }),
    count ? el('span', { class: 'chip-count', text: count }) : null
  ]);
}

// Kinds of sport as tiles (an icon, the name, games listed), and once one
// with several leagues is picked, its leagues as small chips underneath.
function renderSportFilter() {
  const t = state.t;
  const present = new Set([...state.bets, ...state.futures].map(b => b.sport));
  const groups = Object.keys(SPORT_GROUPS).filter(g => SPORT_GROUPS[g].leagues.some(l => present.has(l)));
  const valid = state.sport === 'all' || (state.sport.startsWith('g:') && groups.includes(state.sport.slice(2))) || present.has(state.sport);
  if (!valid) state.sport = 'all';
  const games = inside => state.data.games.filter(g => inside(g.sport)).length;
  const countText = (n, f1) => (f1 ? t('f1Race') : n > 0 ? t('gamesN', { n }) : t('futuresOnly'));
  const current = state.sport === 'all' ? null : state.sport.startsWith('g:') ? state.sport.slice(2) : groupOfSport(state.sport);
  const pick = value => () => {
    state.sport = value;
    rerenderFiltered();
  };
  const tile = (value, icon, name, count, pressed) =>
    el('button', { class: 'sport-tile', type: 'button', 'aria-pressed': String(pressed), onclick: pick(value) }, [icon, el('span', { class: 'tile-name', text: name }), el('span', { class: 'tile-count', text: count })]);
  const groupIcon = g => (SPORT_GROUPS[g].leagues.length === 1 && leagueLogo(SPORT_GROUPS[g].leagues[0]) ? leagueImg(SPORT_GROUPS[g].leagues[0], 'logo-tile') : el('span', { class: 'league-badge logo-tile' }, el('span', { class: 'league-img league-icon', 'aria-hidden': 'true', text: SPORT_GROUPS[g].icon })));
  $('sport-filter').replaceChildren(
    tile('all', allIcon(), t('sport_all'), countText(games(() => true)), state.sport === 'all'),
    ...groups.map(g => {
      const leagues = SPORT_GROUPS[g].leagues.filter(l => present.has(l));
      const value = leagues.length === 1 ? leagues[0] : `g:${g}`;
      return tile(value, groupIcon(g), t(`group_${g}`), countText(games(sp => SPORT_GROUPS[g].leagues.includes(sp)), g === 'f1'), current === g);
    })
  );
  // Keep the picked tile in view in the scrolling row.
  {
    const row = $('sport-filter');
    const on = row.querySelector('[aria-pressed="true"]');
    if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) row.scrollLeft = on.offsetLeft - 16;
  }
  // The picked kind's leagues.
  const leagues = current ? SPORT_GROUPS[current].leagues.filter(l => present.has(l)) : [];
  $('league-filter').hidden = leagues.length < 2;
  $('league-filter').replaceChildren(
    ...(leagues.length < 2
      ? []
      : [
          chip({ pressed: state.sport === `g:${current}`, text: t('leagueAll'), onclick: pick(`g:${current}`) }),
          ...leagues.map(l => chip({ pressed: state.sport === l, icon: leagueImg(l, 'logo-xs'), text: t(`sport_${l}`), count: games(sp => sp === l) || null, onclick: pick(l) }))
        ])
  );
}

// "All sports": four small squares.
function allIcon() {
  const svg = svgEl('svg', { class: 'logo logo-tile all-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  for (const [x, y] of [[3, 3], [13, 3], [3, 13], [13, 13]]) svg.append(svgEl('rect', { x, y, width: 8, height: 8, rx: 2.5 }));
  return svg;
}

// 今天 / 明天 / the weekday, in Taiwan time.
function dayLabel(day) {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  if (day === today) return state.t('today');
  if (day === tomorrow) return state.t('tomorrow');
  const [y, m, d] = day.split('-').map(Number);
  return formatter('weekday', locale => new Intl.DateTimeFormat(locale, { weekday: 'short' })).format(new Date(y, m - 1, d));
}

// Days as a calendar strip: weekday, date, and what's on.
function renderDayFilter() {
  const t = state.t;
  const today = dayKey(new Date().toISOString());
  const liveNow = state.liveGames.filter(g => inSport(g.sport)).length;
  // Today stays on the strip while games are on (場中 lives there), even with
  // every one of today's games already under way.
  const days = [...new Set([...state.bets.filter(b => inSport(b.sport)).map(b => dayKey(b.start)), ...(liveNow ? [today] : [])])].sort();
  // The earliest day with games (today, unless today's are all under way),
  // until a day is picked: games arriving later (the other leagues, a
  // refresh after midnight) move it to the new earliest day too.
  if (!state.dayPicked || !days.includes(state.day)) {
    state.day = days[0] ?? null;
    state.dayPicked = false;
  }
  // One day only (the usual case): no picker, the day goes in the heading.
  $('day-filter').hidden = days.length <= 1;
  const [, gm, gd] = (state.day ?? '').split('-').map(Number);
  $('games-title').textContent = state.day ? `${t('gamesTitle')} · ${dayLabel(state.day)} ${gm}/${gd}` : t('gamesTitle');
  $('day-filter').replaceChildren(
    ...days.map(day => {
      const games = state.data.games.filter(g => inSport(g.sport) && dayKey(g.startUtc) === day).length;
      const hasF1 = inSport('f1') && state.data.f1 && dayKey(state.data.f1.startUtc) === day;
      const [, m, d] = day.split('-').map(Number);
      const label = dayLabel(day);
      return el('button', {
        class: 'day-tile',
        type: 'button',
        'aria-pressed': String(day === state.day),
        onclick: () => {
          state.day = day;
          state.dayPicked = true;
          rerenderFiltered();
        }
      }, [
        el('span', { class: 'day-text' }, [el('span', { class: 'day-week', text: label }), el('span', { class: 'day-num', text: `${m}/${d}` })]),
        el('span', { class: 'day-count', text: [day === today && liveNow ? `${t('liveTitle')} ${liveNow}` : null, games ? t('gamesN', { n: games }) : null, hasF1 ? 'F1' : null].filter(Boolean).join(' + ') })
      ]);
    })
  );
  // 場中 shows on today only.
  renderLive();
}

// Where Kambi filed each player's match (its group and path words): their
// country when the kit's table doesn't know them. Rebuilt when the games change.
const whereIndex = { games: null, live: null, map: new Map() };
function whereFor(sport, en) {
  const games = state.data?.games;
  const live = state.liveGames;
  if (whereIndex.games !== games || whereIndex.live !== live) {
    whereIndex.map = new Map();
    for (const g of [...(games || []), ...(live || [])]) for (const side of ['home', 'away']) if (g.where?.length && g[side]?.en) whereIndex.map.set(`${g.sport}|${g[side].en}`, g.where);
    Object.assign(whereIndex, { games, live });
  }
  return whereIndex.map.get(`${sport}|${en}`) || [];
}

// A team logo, or its initials in a circle when there's no logo (or it fails).
// Players (tennis, table tennis, badminton, snooker, fighters): their nation's flag.
function logoImg(sport, enName, label, size = '') {
  if (isPlayers(sport)) {
    // A flag ESPN gave for them (fighters' cards), else the kit's table or where the match is filed.
    const seen = teamLogo(sport, enName);
    const nation = playerNation(enName, whereFor(sport, enName));
    const initial = () => el('span', { class: `logo logo-fallback ${size}`, 'aria-hidden': 'true', text: (label || '?').trim().slice(0, 1) });
    const emoji = () => (nation ? el('span', { class: `logo logo-flag ${size}`, 'aria-hidden': 'true', text: flagEmoji(nation) }) : initial());
    if (seen || nation) return logoPicture(seen || flagUrl(nation), null, `logo player-flag ${size}`, emoji);
    return initial();
  }
  // A national team's flag; else one character: a Chinese name's first
  // character, or an English initial.
  const flag = countryFlag(enName);
  const fallback = () =>
    flag ? el('span', { class: `logo logo-flag ${size}`, 'aria-hidden': 'true', text: flag }) : el('span', { class: `logo logo-fallback ${size}`, 'aria-hidden': 'true', text: (label || '?').trim().slice(0, 1) });
  // A side not decided yet ("Yankees/Red Sox"): no one team's logo.
  if (/\//.test(enName || '')) return fallback();
  // No club logo for a national side (rugby, a Kambi friendly): its round flag.
  const code = countryCode(enName);
  const url = teamLogo(sport, enName) ?? findTeamLogo(futureTeamLeagues(sport), enName) ?? (code ? flagUrl(code) : null);
  return logoPicture(url, url === teamLogo(sport, enName) ? teamLogo(sport, enName, true) : null, `logo ${code && url === flagUrl(code) ? 'player-flag ' : ''}${size}`, fallback);
}

// The league's own logo on a small white disc, the same for every league in
// light and dark mode (as Quadra Fixtures shows them), so no logo ever vanishes
// into a dark background and none stands out.
function leagueImg(sport, size = '') {
  const icon = LEAGUES[sport]?.icon;
  const fallback = () => (icon ? el('span', { class: 'league-img league-icon', 'aria-hidden': 'true', text: icon }) : el('span', { class: 'league-img league-missing', 'aria-hidden': 'true' }));
  return el('span', { class: `league-badge ${size}` }, logoPicture(leagueLogo(sport), null, 'league-img', fallback));
}

// A round badge with a letter, in a group's colour.
function badge(text, color, size = '') {
  return el('span', { class: `badge ${size}`, style: `--badge:${color}`, 'aria-hidden': 'true', text });
}

// ---- Rendering: static text ------------------------------------------------

// The guide's groups, in order: the odds math, then i18n's `guide` groups.

function renderStatic() {
  const t = state.t;
  document.documentElement.lang = state.locale === 'zh' ? 'zh-Hant' : 'en';
  // The app's name in the page's language only: 四方運彩 or Quadra Sportsbook.
  document.title = t('title');
  $('loading-title').textContent = t('title');
  $('title').textContent = t('title');
  $('notice').textContent = t('notice');
  $('game-search').placeholder = t('searchPlaceholder');
  $('game-search').setAttribute('aria-label', t('searchPlaceholder'));
  $('games-footnote').textContent = t('notice');
  $('footer').textContent = t('footer');
  for (const [id, key] of [
    ['games-title', 'gamesTitle'],
    ['live-title', 'liveTitle'],
    ['futures-title', 'futuresTitle'],
    ['parlay-title', 'parlayTitle'],
    ['account-title', 'accountTitle'],
    ['saved-title', 'savedTitle'],
    ['stats-title', 'statsTitle'],
    ['f1-title', 'f1Title']
  ])
    $(id).textContent = t(key);
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
  for (const tab of TABS) tabNav.label(tab, t(`tab_${tab}`));
}

function renderStatus(kind) {
  const t = state.t;
  const status = $('status');
  if (kind === 'loading') status.textContent = t('loading');
  else if (kind === 'error') status.textContent = t('loadFailed');
  else if (state.fromSnapshot) {
    status.textContent = t('updatingShort', { time: fmtTime(state.data.loadedAt) });
    status.title = '';
  } else {
    status.textContent = t('updatedShort', { time: fmtTime(state.data.loadedAt) });
    status.title = `${fmtTime(state.data.loadedAt)} · ${t('sources')}`;
  }
}

// ---- Ranking ------------------------------------------------------------------

function betIcon(bet) {
  if (bet.kind === 'f1team') return constructorBadge(bet.team, 'logo-sm');
  if (bet.kind?.startsWith('f1') && bet.driver) return driverBadge(bet, 'logo-sm');
  if (bet.kind === 'future') return logoImg(bet.sport, bet.teamEn, bet.shortLabel, 'logo-sm');
  // Totals' side is over/under: they show the league, team totals the team.
  const side = bet.kind === 'teamtotal' ? bet.team : ['away', 'home'].includes(bet.side) ? bet.side : null;
  if (bet.game && side) return logoImg(bet.sport, bet.game[side].en, teamName(bet.game[side]), 'logo-sm');
  return leagueImg(bet.sport, 'logo-sm');
}

// ---- Games --------------------------------------------------------------------

// The search bar: teams (Chinese or English) and leagues, every day and
// sport at once; the filters step aside while it's in use.
state.query = '';
const searchKey = text => normalizeTeamName(String(text || '')).replace(/\s+/g, '') || String(text || '').toLowerCase().replace(/\s+/g, '');
function gameMatches(game, query) {
  const t = state.t;
  const hay = [game.away.en, game.away.zh, game.home.en, game.home.zh, t(`sport_${game.sport}`), gameSeries(game)].filter(Boolean);
  const want = searchKey(query);
  return hay.some(text => searchKey(text).includes(want) || String(text).includes(query));
}
function searchGames() {
  const q = state.query;
  document.body.classList.toggle('searching', Boolean(q));
  return state.data.games.filter(g => gameMatches(g, q)).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

function renderGames() {
  const t = state.t;
  const container = $('games-list');
  const searching = Boolean(state.query);
  document.body.classList.toggle('searching', searching);
  const games = searching ? searchGames() : state.data.games.filter(g => inSport(g.sport) && dayKey(g.startUtc) === state.day);
  if (searching) $('games-title').textContent = t('searchResults', { q: state.query, n: games.length });
  else renderDayFilter();
  $('games').hidden = games.length === 0 && !(inSport('f1') && state.data.f1);
  if (games.length === 0) {
    container.replaceChildren(el('p', { class: 'muted', text: t(searching ? 'searchNone' : 'noBets') }));
    if (searching) $('games').hidden = false;
    return;
  }
  const byGame = groupBy(state.bets, b => b.gameId);
  const listed = games.filter(g => byGame.get(g.id));
  // The big leagues first (by time), then the rest; with every sport shown,
  // the thinly traded ones (table tennis, lower tennis tours…) fold away
  // behind one row, so the board opens on the games people know.
  const TIER = { major: 0, minor: 1, thin: 2 };
  const ordered = searching ? listed : [...listed].sort((a, b) => TIER[shownTier(a.sport)] - TIER[shownTier(b.sport)] || a.startUtc.localeCompare(b.startUtc));
  const fold = !searching && state.sport === 'all' && !state.showThin && ordered.some(g => shownTier(g.sport) !== 'thin');
  const shown = fold ? ordered.filter(g => shownTier(g.sport) !== 'thin') : ordered;
  const rest = ordered.length - shown.length;
  container.replaceChildren(
    ...shown.map(game => gameCard(game, byGame.get(game.id))),
    rest
      ? el('button', { class: 'more-leagues', type: 'button', onclick: () => ((state.showThin = true), renderGames()) }, [
          el('span', { text: t('moreLeagues', { n: rest }) }),
          el('small', { text: [...new Set(ordered.slice(shown.length).map(g => t(`sport_${g.sport}`)))].slice(0, 4).join('・') })
        ])
      : ''
  );
}

function hhmm(iso) {
  return formatter('hhmm', locale => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' })).format(new Date(iso));
}

// A game: its teams with logos and win picks; every other market folds away.
function gameCard(game, bets) {
  const t = state.t;
  const rerender = game.live ? renderLive : renderGames;
  const open = state.open.has(game.id);
  const ml = bets.filter(b => b.kind === 'ml');
  const neutral = isNeutral(game.sport);
  const sides = isSoccer(game.sport) ? ['home', 'draw', 'away'] : neutral ? ['home', 'away'] : ['away', 'home'];
  const rows = sides.map(side => {
    const bet = ml.find(b => b.side === side);
    const who =
      side === 'draw'
        ? [badge('=', 'var(--text-muted)'), el('span', { class: 'team-name', text: t('draw') })]
        : [
            logoImg(game.sport, game[side].en, teamName(game[side])),
            el('span', { class: 'team-name' }, [document.createTextNode(teamName(game[side])), neutral ? null : el('small', { text: t(side === 'home' ? 'homeTag' : 'awayTag') })])
          ];
    const score = game.live && side !== 'draw' ? el('span', { class: 'live-score', text: String(game.live[`${side}Score`]) }) : null;
    return el('div', { class: 'team-row' }, [...who, score, bet ? pickButton(bet, '') : null]);
  });
  const others = bets.filter(b => b.kind !== 'ml');
  const toggle = () => {
    if (state.open.has(game.id)) state.open.delete(game.id);
    else state.open.add(game.id);
    rerender();
  };
  return el('article', { class: `game ${open ? 'open' : ''} ${game.live ? 'live' : ''}`, 'data-game': game.id }, [
    el('div', { class: 'game-top' }, [
      leagueImg(game.sport, 'logo-xs'),
      el('span', { class: 'game-series', text: gameSeries(game) }),
      game.live
        ? el('span', { class: 'game-time live-state' }, [el('span', { class: 'live-dot', text: t('tagLive') }), document.createTextNode(liveStateText(game.live))])
        : el('span', { class: 'game-time', text: state.query ? `${dayKey(game.startUtc).slice(5).replace('-', '/')} ${hhmm(game.startUtc)}` : hhmm(game.startUtc) })
    ]),
    el('div', { class: 'team-rows' }, rows),
    open && (others.length || !game.live) ? gameMore(game, others) : null,
    others.length === 0 ? null : el('button', { class: 'more-toggle', type: 'button', 'aria-expanded': String(open), onclick: toggle }, [
      document.createTextNode(open ? t('lessMarkets') : t('moreMarkets'))
    ])
  ]);
}

// Pins a game to Quadra Fixtures (Match Find): kept in the pass's wallet,
// where Fixtures reads it and puts the game in your schedule.
function pinButton(game) {
  const t = state.t;
  const pinned = Boolean(state.wallet?.pins?.[game.id]?.on);
  return el('button', {
    class: `ghost-button pin-button ${pinned ? 'on' : ''}`,
    type: 'button',
    'aria-pressed': String(pinned),
    text: t(pinned ? 'pinRemove' : 'pinAdd'),
    onclick: async () => {
      const pin = { t: Date.now(), on: !pinned, sport: game.sport, start: game.startUtc, home: game.home.en, away: game.away.en, homeZh: game.home.zh, awayZh: game.away.zh, series: gameSeries(game) };
      state.wallet = { ...state.wallet, pins: { ...(state.wallet?.pins || {}), [game.id]: pin } };
      renderGames();
      try {
        await q.write({ wallet: { pins: { [game.id]: pin } } });
        state.wallet = q.wallet;
      } catch (error) {
        console.error(error);
      }
      renderGames();
    }
  });
}

// Every other market of a game, one small card each, then the game's details.
function gameMore(game, bets) {
  const t = state.t;
  const kinds = SECTIONS.filter(sec => sec.kind !== 'ml' && bets.some(b => b.kind === sec.kind));
  const current = kinds.find(sec => sec.kind === state.marketTab.get(game.id)) ?? kinds[0];
  const tabs =
    kinds.length > 1
      ? el('div', { class: 'segmented market-tabs', role: 'tablist', 'aria-label': t('moreMarkets') },
          kinds.map(sec =>
            el('button', {
              type: 'button',
              role: 'tab',
              'aria-selected': String(sec === current),
              'aria-pressed': String(sec === current),
              text: t(sec.kind === 'runline' && isSoccer(game.sport) ? 'secHandicap' : sec.short ?? sec.title),
              onclick: () => {
                state.marketTab.set(game.id, sec.kind);
                (game.live ? renderLive : renderGames)();
              }
            })
          )
        )
      : null;
  // The row scrolls sideways: the chosen tab kept in view after a redraw.
  if (tabs)
    requestAnimationFrame(() => {
      const on = tabs.querySelector('[aria-selected="true"]');
      if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2);
    });
  return el('div', { class: 'game-more' }, [
    tabs,
    current ? marketPanel(game, current, bets.filter(b => b.kind === current.kind)) : null,
    game.live ? null : el('div', { class: 'game-foot' }, [pinButton(game)])
  ]);
}

// One line of a two-way market: the line (tagged when the lottery posts it)
// and its two picks.
function lineRow(label, pair, { posted = false, main = false } = {}) {
  // Outside MLB the tagged line is DraftKings' main line, not a checked lottery line.
  if (posted && pair[0]?.sport !== 'mlb') main = true;
  return el('div', { class: `line-row ${posted ? 'posted' : ''} ${main ? 'main' : ''}` }, [
    el('span', { class: 'line-label' }, [
      el('strong', { text: label }),
    ]),
    ...pair.map(b => (b ? pickButton(b, '') : el('span')))
  ]);
}

// A block of lines under its own heading: [first column, pick A, pick B].
function lineTable(heads, rows, title = null) {
  return el('div', { class: 'line-table' }, [
    title ? el('p', { class: 'line-title', text: title }) : null,
    el('div', { class: 'line-head' }, heads.map(text => el('span', { text }))),
    ...rows
  ]);
}

// Each kind of market laid out as a table of its lines.
function marketPanel(game, section, bets) {
  const t = state.t;
  const by = (list, side) => list.find(b => b.side === side);
  let body;
  if (TOTAL_KINDS.has(section.kind)) {
    const lineOf = b => b.totalLine ?? b.line;
    const rows = [...groupBy(bets, lineOf).values()]
      .sort((a, b) => lineOf(a[0]) - lineOf(b[0]))
      .map(pair => lineRow(String(lineOf(pair[0])), [by(pair, 'over'), by(pair, 'under')], { posted: pair[0].posted, main: pair[0].mainLine }));
    body = [lineTable([t('colLine'), t('over'), t('under')], rows)];
  } else if (HCAP_KINDS.has(section.kind)) {
    // One block per team giving the runs: "遊騎兵 讓分" -1.5, -2.5, …
    body = ['away', 'home']
      .map(giver => {
        const taker = giver === 'away' ? 'home' : 'away';
        const markets = [...groupBy(bets.filter(b => b.giver === giver), b => b.market).values()].sort((a, b) => Math.abs(a[0].awayLine) - Math.abs(b[0].awayLine));
        if (!markets.length) return null;
        const rows = markets.map(pair => lineRow(fmtLine(-Math.abs(pair[0].awayLine)), [by(pair, giver), by(pair, taker)], { posted: pair[0].posted }));
        const heading = section.kind === 'runline' ? t(isSoccer(game.sport) ? 'giveGoals' : familyOf(game.sport) === 'baseball' ? 'giveRuns' : 'givePoints', { team: teamName(game[giver]) }) : `${teamName(game[giver])} · ${t(section.title)}`;
        return lineTable([t('colLine'), teamName(game[giver]), teamName(game[taker])], rows, heading);
      })
      .filter(Boolean);
  } else if (section.kind === 'teamtotal') {
    body = ['away', 'home']
      .map(team => {
        const lines = [...groupBy(bets.filter(b => b.team === team), b => b.teamLine).values()].sort((a, b) => a[0].teamLine - b[0].teamLine);
        if (!lines.length) return null;
        const rows = lines.map(pair => lineRow(String(pair[0].teamLine), [by(pair, 'over'), by(pair, 'under')], { posted: pair[0].posted, main: pair[0].posted }));
        return lineTable([t('colLine'), t('over'), t('under')], rows, teamName(game[team]));
      })
      .filter(Boolean);
  } else {
    // One block per market (最高單局 has one; 第N分 one per run).
    body = [...groupBy(bets, b => b.market).values()].flatMap(list => [
      el('div', { class: 'market-head' }, [el('span', { class: 'market-title', text: list[0].marketLabel ?? t(section.title) })]),
      el('div', { class: 'market-picks' }, list.map(b => pickButton(b, b.chip ?? b.shortLabel)))
    ]);
  }
  return el('div', { class: `market-panel ${section.kind}` }, body);
}

// Kinds laid out as tables of lines: over/under, and one team giving a line.
const TOTAL_KINDS = new Set(['total', 'gametotal', 'htotal', 'f5total', 'totalsets']);
const HCAP_KINDS = new Set(['runline', 'gamehcap', 'sethcap']);

// One section per kind of bet, each market of it with its own take. The
// inning market's ten results take a whole row.
const SECTIONS = [
  { kind: 'ml', title: 'secMoneyline' },
  { kind: 'total', title: 'secTotal' },
  { kind: 'runline', title: 'secRunLine' },
  { kind: 'teamtotal', title: 'secTeamTotal' },
  { kind: 'inning', title: 'secTopInning', short: 'topInningShort' },
  { kind: 'nextrun', title: 'secNextRun' },
  { kind: 'margin', title: 'secMargin' },
  { kind: 'half', title: 'secHalf' },
  { kind: 'htotal', title: 'secHalfTotal' },
  { kind: 'dc', title: 'secDoubleChance' },
  { kind: 'f5', title: 'secF5' },
  { kind: 'f5total', title: 'secF5Total' },
  { kind: 'regulation', title: 'secRegulation' },
  { kind: 'firstinning', title: 'secFirstInning' },
  { kind: 'btts', title: 'secBtts' },
  { kind: 'score', title: 'secScore' },
  { kind: 'oddeven', title: 'secOddEven' },
  { kind: 'htft', title: 'secHtft' },
  { kind: 'goalbands', title: 'secGoalBands' },
  { kind: 'q1', title: 'secQ1' },
  { kind: 'firstset', title: 'secFirstSet' },
  { kind: 'sets', title: 'secSets' },
  { kind: 'totalsets', title: 'secTotalSets' },
  { kind: 'sethcap', title: 'secSetHcap' },
  { kind: 'gamehcap', title: 'secGameHcap' },
  { kind: 'gametotal', title: 'secGameTotal' }
];

function fmtPctShort(p) {
  return p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`;
}

// A pick's tooltip: what it is, its odds, and whether the house limits it.
function pickTitle(bet) {
  const t = state.t;
  return [
    bet.label,
    `${t('legendOdds')} ${fmtOdds(effectiveOdds(bet))}`,
    bet.lock ? t(`lock_${bet.lock}`) : bet.minLegs > 1 ? t('minLegsNote', { n: bet.minLegs }) : null
  ]
    .filter(Boolean)
    .join('\n');
}

// A pick: tap to put it on the bet slip (or take it off). The big number is
// the odds, like any sportsbook's board. A locked
// pick (the house doesn't sell it) shows a lock; one sold only in parlays
// shows its minimum (2關, 3關).
function pickButton(bet, name) {
  const t = state.t;
  const inSlip = state.parlay.includes(bet.id);
  const locked = Boolean(bet.lock);
  const body = [
    name ? el('span', { class: 'pick-name', text: name }) : null,
    el('span', { class: 'pick-odds' }, [
      locked ? el('span', { class: 'lock', 'aria-hidden': 'true', text: '🔒' }) : document.createTextNode(fmtOdds(effectiveOdds(bet))),
      !locked && bet.minLegs > 1 ? el('small', { class: 'min-legs', text: t('minLegsTag', { n: bet.minLegs }) }) : null
    ])
  ];
  return el('button', {
    class: `pick ${locked ? 'locked' : ''} ${inSlip ? 'in-slip' : ''}`,
    type: 'button',
    title: pickTitle(bet),
    disabled: locked ? true : null,
    'aria-pressed': String(inSlip),
    'aria-label': `${bet.label} ${fmtOdds(effectiveOdds(bet))} · ${locked ? t(`lock_${bet.lock}`) : inSlip ? t('removeLeg') : t('addLeg')}`,
    onclick: locked ? null : () => toggleLeg(bet)
  }, body);
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

// ---- Live (場中) --------------------------------------------------------------------

// "4局下 1出局", "中場", "67'", "第3節 5:32", "第 2 局" (a set), "延長".
function liveStateText(live) {
  const t = state.t;
  if (live.delayed) return `${live.detail} · ${t('livePaused')}`;
  if (live.book === 'kambi') {
    if (live.setNo) return t('liveSetN', { n: live.setNo });
    if (live.inningNo) return t('liveInningN', { n: live.inningNo });
    if (live.quarter) return t('livePeriodN', { n: live.quarter, clock: '' }).trim();
    return t('liveInPlay');
  }
  if (isSoccer(live.sport)) return live.minute >= 45 && /half/i.test(live.detail) ? t('liveHalfTime') : `${live.minute}'`;
  if (live.period != null) {
    if (/^half/i.test(live.detail)) return t('liveHalfTime');
    const regulation = PERIODS[live.sport]?.[0] ?? 4;
    if (live.period > regulation) return t('liveOT', { clock: live.clock }).trim();
    return t('livePeriodN', { n: live.period, clock: live.clock }).trim();
  }
  const text = t(`liveHalf_${live.half}`, { n: live.inning });
  return live.half === 'top' || live.half === 'bottom' ? `${text} ${t('liveOuts', { n: live.outs })}` : text;
}

// Kambi's live prices for one match (its sports: Asian baseball, EuroLeague
// and B.League, tennis, badminton, table tennis, volleyball, snooker), at the
// house's live cut.
function kambiLiveBets(game, g, base) {
  const t = state.t;
  const bets = [];
  const k = houseCut({ base: 'live' });
  const common = { ...base, fairMargin: null, errKey: 'liveOther', cut: k };
  if (g.ml) {
    for (const side of ['away', 'home']) {
      const name = teamName(game[side]);
      bets.push({ ...common, id: `${game.id}|ml|${side}`, kind: 'ml', side, market: 'ml', posted: true, fairChance: g.ml[side], estOdds: liveOdds(g.ml[side], k), chip: name, label: `${name} ${t('win')}`, shortLabel: name });
    }
  }
  if (g.spread) {
    const { awayLine, awayFair } = g.spread;
    for (const side of ['away', 'home']) {
      const line = side === 'away' ? awayLine : -awayLine;
      const p = side === 'away' ? awayFair : 1 - awayFair;
      const text = `${teamName(game[side])} ${fmtLine(line)}`;
      bets.push({ ...common, id: `${game.id}|rl|${line}|${side}`, kind: 'runline', side, market: `rl|${awayLine}`, posted: true, runLine: line, awayLine, giver: awayLine < 0 ? 'away' : 'home', fairChance: p, estOdds: liveOdds(p, k), chip: text, label: text, shortLabel: `${t('runLine')} ${text}` });
    }
  }
  if (g.total) {
    const { line, overFair } = g.total;
    for (const side of ['over', 'under']) {
      const p = side === 'over' ? overFair : 1 - overFair;
      bets.push({ ...common, id: `${game.id}|tot|${line}|${side}`, kind: 'total', side, market: `total|${line}`, posted: true, totalLine: line, mainLine: true, fairChance: p, estOdds: liveOdds(p, k), chip: t(side), label: `${base.matchup} ${t(side)} ${line}`, shortLabel: `${t(side)} ${line}` });
    }
  }
  return bets;
}

// Every live game as a game card's data, and its bets at live odds.
function buildLiveBets(data) {
  const t = state.t;
  const games = [];
  const bets = [];
  for (const g of data?.kambi ?? []) {
    const game = {
      id: `live|${g.sport}|k${g.kambiId}`,
      kambiId: g.kambiId,
      sport: g.sport,
      startUtc: g.startUtc,
      away: { en: g.away, zh: teamZh(g.sport, g.away) },
      home: { en: g.home, zh: teamZh(g.sport, g.home) },
      group: g.group || '',
      where: g.where || [],
      live: { ...g, book: 'kambi' }
    };
    games.push(game);
    bets.push(...kambiLiveBets(game, g, { gameId: game.id, game, sport: g.sport, matchup: matchupText(game), start: g.startUtc, live: true }));
  }
  for (const g of data?.games ?? []) {
    const pre = g.pregame;
    const family = familyOf(g.sport);
    let dist = null;
    let markets = null;
    if (family === 'baseball') {
      if (!pre.totalLine) continue;
      const means = pregameRuns({ homeWin: pre.homeWin, totalLine: pre.totalLine, overFair: pre.overFair });
      const left = inningsLeft(g);
      dist = liveBaseball({ means, awayScore: g.awayScore, homeScore: g.homeScore, awayLeft: left.away, homeLeft: left.home });
    } else if (family === 'soccer') {
      if (!(pre.draw > 0)) continue;
      dist = liveSoccer({ means: fitGoals(pre.homeWin, pre.awayWin), awayScore: g.awayScore, homeScore: g.homeScore, minutesLeft: 90 - g.minute });
    } else if (family === 'hockey') {
      const total = pre.totalLine ? { line: pre.totalLine, overFair: pre.overFair } : null;
      dist = g.left > 0.01 ? liveGoals({ means: fitHockey(pre.homeWin, total), awayScore: g.awayScore, homeScore: g.homeScore, share: g.left }) : null;
    } else markets = livePoints({ sport: g.sport, pre, awayScore: g.awayScore, homeScore: g.homeScore, left: g.left });
    const game = {
      id: `live|${g.sport}|${g.espnId}`,
      espnId: g.espnId,
      sport: g.sport,
      startUtc: g.startUtc,
      away: { en: g.away, zh: teamZh(g.sport, g.away) },
      home: { en: g.home, zh: teamZh(g.sport, g.home) },
      live: { ...g, pmWin: g.pm?.awayWin ?? null }
    };
    games.push(game);
    // Rain delay or suspended: no live odds until play resumes.
    if (g.delayed) continue;
    const matchup = matchupText(game);
    const base = { gameId: game.id, game, sport: g.sport, matchup, start: g.startUtc, live: true, fairMargin: null, errKey: g.sport === 'mlb' ? 'live' : family === 'soccer' ? 'liveSoccer' : 'liveOther' };
    // The live cut (soccer's winner at its three-way one), more for the leagues the house knows less.
    const cut = { ml: houseCut({ base: family === 'soccer' ? LIVE_THREE_WAY : 'live' }), other: houseCut({ base: 'live' }) };
    for (const m of markets ?? (dist ? liveMarkets(dist, { sport: g.sport, awayScore: g.awayScore, homeScore: g.homeScore, pm: g.pm }) : [])) {
      const k = m.kind === 'ml' ? cut.ml : cut.other;
      const common = { ...base, kind: m.kind, side: m.side, market: m.market, posted: m.posted, fairChance: m.fair, cut: k, estOdds: liveOdds(m.fair, k) };
      if (m.kind === 'ml') {
        const name = m.side === 'draw' ? t('draw') : teamName(game[m.side]);
        bets.push({ ...common, id: `${game.id}|ml|${m.side}`, chip: name, label: m.side === 'draw' ? `${matchup} ${name}` : `${name} ${t('win')}`, shortLabel: name });
      } else if (m.kind === 'total') {
        bets.push({ ...common, id: `${game.id}|tot|${m.line}|${m.side}`, totalLine: m.line, mainLine: m.main, chip: t(m.side), label: `${matchup} ${t(m.side)} ${m.line}`, shortLabel: `${t(m.side)} ${m.line}` });
      } else if (m.kind === 'runline') {
        const text = `${teamName(game[m.side])} ${fmtLine(m.line)}`;
        bets.push({ ...common, id: `${game.id}|rl|${m.line}|${m.side}`, runLine: m.line, awayLine: m.awayLine, giver: m.giver, chip: text, label: text, shortLabel: `${t('runLine')} ${text}` });
      } else if (m.kind === 'teamtotal') {
        const text = `${teamName(game[m.team])} ${t(m.side)} ${m.line}`;
        bets.push({ ...common, id: `${game.id}|tt|${m.team}|${m.line}|${m.side}`, team: m.team, teamLine: m.line, chip: t(m.side), label: text, shortLabel: text });
      }
    }
    // 第N分: the next two runs of the game.
    if (g.sport === 'mlb') {
      const means = pregameRuns({ homeWin: pre.homeWin, totalLine: pre.totalLine, overFair: pre.overFair });
      for (const ahead of [1, 2]) {
        const n = g.awayScore + g.homeScore + ahead;
        const chances = nextRunChances({ means, state: g, runsAhead: ahead });
        for (const side of ['away', 'none', 'home']) {
          const name = side === 'none' ? t('nextRunNone') : teamName(game[side]);
          const label = `${t('nextRunN', { n })} ${name}`;
          bets.push({ ...base, id: `${game.id}|nr|${n}|${side}`, kind: 'nextrun', side, runN: n, market: `nr|${n}`, marketLabel: t('nextRunN', { n }), posted: true, fairChance: chances[side], estOdds: nextRunOdds(chances[side]), errKey: 'liveNextRun', chip: name, label: `${matchup} ${label}`, shortLabel: label });
        }
      }
    }
  }
  return { games, bets: withHouseRules(bets) };
}

function renderLive() {
  const t = state.t;
  // The big leagues first, then by start.
  const TIER = { major: 0, minor: 1, thin: 2 };
  const games = state.liveGames.filter(g => inSport(g.sport)).sort((a, b) => TIER[shownTier(a.sport)] - TIER[shownTier(b.sport)] || a.startUtc.localeCompare(b.startUtc));
  // Only on today's board: another day's games haven't started.
  const onToday = state.day === dayKey(new Date().toISOString());
  $('live').hidden = !games.length || !onToday;
  if (!games.length || !onToday) return;
  const byGame = groupBy(state.liveBets, b => b.gameId);
  $('live-updated').textContent = state.liveAt ? t('liveUpdated', { time: formatter('hms', locale => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' })).format(new Date(state.liveAt)) }) : '';
  $('live-list').replaceChildren(...games.map(g => gameCard(g, byGame.get(g.id) ?? [])));
}

// Live games refresh every 30 seconds while the games tab is on screen.
const LIVE_REFRESH_MS = 30_000;
let liveBusy = false;
let liveAgain = false;
async function refreshLive() {
  // Asked again while reading (the other leagues just came in): once more after.
  if (liveBusy) return void (liveAgain = true);
  liveBusy = true;
  try {
    // The league of a game Fixtures sent here, read even if the board didn't list it.
    const wantedSport = String(state.wantedGame || '').split('_')[0];
    const data = await loadLive(new Date(), LIVE_MIN_LIQUIDITY, LEAGUES[wantedSport] ? [wantedSport] : []);
    const { games, bets } = buildLiveBets(data);
    state.liveRecs = recommend(bets);
    state.liveGames = games;
    state.liveBets = bets;
    state.liveAt = data.loadedAt;
    // A live pick whose line is gone (the game moved on, or ended) leaves the slip.
    const ids = new Set(slipCandidates().map(b => b.id));
    state.parlay = state.parlay.filter(id => ids.has(id));
    // The day strip (today stays on it while games are on), and 場中 with it.
    if (state.data && !state.query) renderDayFilter();
    else renderLive();
    renderParlay();
    renderTabs();
    if (state.tab === 'home') renderHome(homeCtx());
    // A game Fixtures asked for that's already on.
    if (state.wantedGame) openWantedGame();
  } catch (error) {
    console.error(error);
  } finally {
    liveBusy = false;
    if (liveAgain) {
      liveAgain = false;
      refreshLive();
    }
  }
}

setInterval(() => {
  if (document.visibilityState === 'visible' && (state.tab === 'games' || state.tab === 'home' || (state.tab === 'slip' && state.parlay.some(id => id.startsWith('live|'))))) refreshLive();
}, LIVE_REFRESH_MS);

// ---- Championships and F1: one board each -------------------------------------

// An F1 constructor: its colour and a short name ("MCL").
function constructorBadge(name, size = '') {
  const c = f1Constructor(name);
  return badge(c.short, c.color, `badge-text ${size}`);
}

function driverBadge(bet, size = '') {
  const initials = bet.driverEn.split(/\s+/).filter(w => !/^jr\.?$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return el('span', { class: `driver-badge ${size}`, style: `--team:${bet.driver.color}`, 'aria-hidden': 'true', text: initials });
}

// One row per team or driver: picture, name, chance, then the estimated odds
// and average back as a button that puts the pick on the slip.
function entryRow(bet, i, picture, sub) {
  const t = state.t;
  const inSlip = state.parlay.includes(bet.id);
  const locked = Boolean(bet.lock);
  return el('div', { class: `entry ${inSlip ? 'in-slip' : ''} ${locked ? 'locked' : ''}`, title: pickTitle(bet) }, [
    el('span', { class: 'entry-rank', text: String(i + 1) }),
    picture,
    // sub === null: the name alone (no chance, no second line).
    el('span', { class: 'entry-name' }, [document.createTextNode(bet.shortLabel), sub === null ? null : sub ? el('small', { text: sub }) : null]),
    el('button', {
      class: `entry-odds ${inSlip ? 'in-slip' : ''}`,
      type: 'button',
      'aria-pressed': String(inSlip),
      'aria-label': `${bet.label} ${fmtOdds(effectiveOdds(bet))} · ${locked ? t(`lock_${bet.lock}`) : inSlip ? t('removeLeg') : t('addLeg')}`,
      disabled: locked ? true : null,
      onclick: locked ? null : () => toggleLeg(bet)
    }, [locked ? el('span', { class: 'lock', 'aria-hidden': 'true', text: '🔒' }) : document.createTextNode(fmtOdds(effectiveOdds(bet))), !locked && bet.minLegs > 1 ? el('small', { class: 'min-legs', text: t('minLegsTag', { n: bet.minLegs }) }) : null])
  ]);
}

// A board of prices (F1, championships): its picks and nothing else.
function board({ emblem, title, sub, bets, rows, id, shown = Infinity, tabs = null, lead = null }) {
  const t = state.t;
  const entries = bets.map((b, i) => rows(b, i));
  const rest = entries.slice(shown);
  return el('article', { class: 'board' }, [
    el('div', { class: 'board-head' }, [
      el('span', { class: 'board-emblem' }, leagueImg(emblem)),
      el('div', {}, [el('p', { class: 'board-title', text: title }), el('p', { class: 'board-sub', text: sub })])
    ]),
    tabs ? el('div', { class: 'board-tabs' }, tabs) : null,
    lead ? el('p', { class: 'board-lead', text: lead }) : null,
    el('div', { class: 'entries' }, entries.slice(0, shown)),
    rest.length ? el('details', { class: 'board-more' }, [el('summary', { text: t('futureMore', { n: rest.length }) }), el('div', { class: 'entries' }, rest)]) : null
  ]);
}

function renderFutures() {
  const t = state.t;
  const markets = groupBy(state.futures.filter(b => inSport(b.sport)), b => b.market);
  $('futures').hidden = markets.size === 0;
  $('futures-list').replaceChildren(
    ...[...markets.values()].map(bets => {
      const { market, matchup, sport } = bets[0];
      return board({
        emblem: sport,
        title: matchup,
        sub: `${t('futureSettles')} ${t(`futureSettle_${market}`)}`,
        bets,
        id: `fut|${market}`,
        shown: FUTURES_SHOWN,
        rows: (b, i) => entryRow(b, i, market === 'f1drivers' ? driverBadge({ driverEn: b.teamEn, driver: f1Driver(b.teamEn) }) : market === 'f1constructors' ? constructorBadge(b.teamEn) : logoImg(b.sport, b.teamEn, b.shortLabel))
      });
    })
  );
}

// ---- Bet slip -----------------------------------------------------------------

// A pick's odds on the slip: as now, and the way they moved since it was
// picked (the old figure beside them).
function legOdds(b) {
  const now = effectiveOdds(b);
  const was = state.pickedOdds[b.id];
  const moved = was && Math.abs(now - was) >= 0.005 ? (now > was ? 'up' : 'down') : '';
  return el('span', { class: `leg-odds${moved ? ` moved ${moved}` : ''}` }, [
    moved ? el('small', { class: 'leg-was', text: `${moved === 'up' ? '▲' : '▼'} ${fmtOdds(was)}` }) : null,
    el('small', { text: '@' }),
    document.createTextNode(fmtOdds(now))
  ]);
}
function toggleLeg(bet) {
  if (bet.lock && !state.parlay.includes(bet.id)) return;
  if (state.parlay.includes(bet.id)) {
    state.parlay = state.parlay.filter(id => id !== bet.id);
  } else {
    // Picks of one game can all be chosen: singles buy each, a parlay or
    // system combination never holds two of the same game (odds.mjs).
    state.parlay.push(bet.id);
    // The odds when it was picked: the slip shows if they move after.
    state.pickedOdds[bet.id] = effectiveOdds(bet);
    if (state.parlay.length > SLIP_RULES.maxLegs) state.parlay.shift();
    // Two picks or more make a parlay unless another way was chosen.
    if (!state.modeChosen && state.parlay.length >= 2) state.slipMode = 'parlay';
  }
  renderGames();
  renderLive();
  renderF1();
  renderFutures();
  renderParlay();
  if (state.tab === 'home') renderHome(homeCtx());
}

// Everything that can go on the slip: games, F1 and championships.
function slipCandidates() {
  return [...state.bets, ...state.liveBets, ...state.futures];
}

// Championships have no start time: they stay open until the lottery closes them.
function started(bet) {
  return !bet.live && bet.start != null && Date.parse(bet.start) <= Date.now();
}

// Picks on the slip. Games already under way are dropped: the page doesn't
// cover live (in-play) betting.
function slipLegs() {
  const candidates = slipCandidates();
  const legs = state.parlay.map(id => candidates.find(b => b.id === id)).filter(Boolean);
  const live = legs.filter(started);
  if (live.length) state.parlay = state.parlay.filter(id => !live.some(b => b.id === id));
  return { legs: legs.filter(b => !started(b)), dropped: live.length };
}

function sizeName(k, n) {
  return k === n ? state.t('slipAll') : state.t('slipSize', { k });
}

// ---- Bet slip extras: a grade, how rare a win is, and trying a draw ----------

function renderParlay() {
  renderSlipBar();
  const t = state.t;
  const body = $('parlay-body');
  const { legs, dropped } = slipLegs();
  const n = legs.length;
  renderTabs();
  const mode = state.slipMode;
  const chosen = [...state.slipSizes].map(k => (k === 'all' ? n : k));
  const sizes = slipSizes(mode, n, chosen);
  // A free bet (Plus's weekly one, the welcome offer; Rewards' missions gave
  // them before v7): one slip, the free bet part of its stake; the person can
  // put more on it with their own money (state.freeTopUp), so it works as a
  // cut off a bigger bet.
  const tokens = freeBetList();
  const free = tokens.find(x => x.id === state.useFree) || null;
  const freeShape = Boolean(free) && (mode === 'parlay' || (mode === 'single' && n === 1));
  const freeOn = freeShape && freeOddsOk(legs.map(b => ({ odds: effectiveOdds(b) })));
  const stake = freeOn ? free.value + (state.freeTopUp || 0) : state.slipStake;
  const slip = legs.map(b => ({ gameId: b.gameId, market: b.market ?? b.kind, odds: effectiveOdds(b), fairChance: b.fairChance, minLegs: b.minLegs ?? 1, lock: b.lock ?? null }));
  const errors = slipErrors({ mode, legs: slip, sizes, stake });
  const rerender = () => renderParlay();

  if (n === 0) {
    body.replaceChildren(
      el('div', { class: 'card slip-empty' }, [
        el('div', { class: 'big-emoji', 'aria-hidden': 'true', text: '🎫' }),
        el('p', { text: t('parlayEmpty') }),
        dropped ? el('p', { class: 'back-low', text: t('slipDroppedLive', { n: dropped }) }) : null,
        el('button', { class: 'primary-button', type: 'button', text: t('goPick'), onclick: () => showTab('games') })
      ])
    );
    return;
  }

  // Left: the ticket itself. Right: what it can pay and what it costs on average.
  const ticket = [
    el('div', { class: 'ticket-head' }, [
      el('strong', { text: t('slipLegs', { n }) }),
      el('button', {
        class: 'ghost-button',
        type: 'button',
        text: t('clearParlay'),
        onclick: () => {
          state.parlay = [];
          renderGames();
          renderLive();
          renderF1();
          renderFutures();
                  renderParlay();
        }
      })
    ]),
    el('div', { class: 'segmented slip-modes', role: 'group', 'aria-label': t('slipMode') },
      ['single', 'parlay', 'system'].map(m =>
        el('button', {
          type: 'button',
          'aria-pressed': String(m === mode),
          text: t(`slipMode_${m}`),
          onclick: () => {
            state.slipMode = m;
            state.modeChosen = true;
            rerender();
          }
        })
      )
    ),
    el('p', { class: 'mode-note', text: t(`slipModeNote_${mode}`) }),
    dropped ? el('p', { class: 'note back-low', text: t('slipDroppedLive', { n: dropped }) }) : null,
    el('ul', { class: 'parlay-legs' },
      legs.map(b =>
        el('li', {}, [
          betIcon(b),
          legMain(b),
          legOdds(b),
          el('button', { class: 'leg-remove', type: 'button', 'aria-label': t('removeLeg'), text: '×', onclick: () => toggleLeg(b) })
        ])
      )
    )
  ];
  if (mode === 'system' && n >= 3) {
    const bySize = combosBySize(slip);
    const options = [...Array.from({ length: n - 2 }, (_, i) => i + 2), 'all'].filter(k => bySize[k === 'all' ? n : k] > 0 || state.slipSizes.has(k));
    ticket.push(
      el('div', { class: 'slip-field' }, [
        el('span', { text: t('slipSizes') }),
        el('div', { class: 'slip-sizes', role: 'group', 'aria-label': t('slipSizes') },
          options.map(k => {
            const size = k === 'all' ? n : k;
            const on = state.slipSizes.has(k);
            return chip({
              pressed: on,
              text: sizeName(size, n),
              count: `×${fmtCount(bySize[size] ?? 0)}`,
              onclick: () => {
                if (on) state.slipSizes.delete(k);
                else state.slipSizes.add(k);
                rerender();
              }
            });
          })
        )
      ])
    );
  }
  // Typed in NT$10 units, like the lottery's own slip: 10 units = NT$100.
  const stakeInput = el('input', {
    type: 'text',
    min: '1',
    step: '1',
    value: String(Math.round(stake / SLIP_RULES.unit)),
    'aria-label': t('slipStake'),
    onchange: event => {
      const units = Math.max(0, Math.round(Number(event.target.value) || 0));
      const value = units * SLIP_RULES.unit;
      if (freeOn) {
        // The total: never below the free bet; the rest is the top-up.
        state.freeTopUp = Math.max(0, value - free.value);
        return void setTimeout(rerender);
      }
      if (value === state.slipStake) return;
      setStake(value);
      // Redraw after the event: redrawing removes this input, and removing a
      // focused input fires another change while the first is still running.
      setTimeout(rerender);
    }
  });
  numberField(stakeInput, { digits: 5 });
  if (tokens.length) ticket.push(freeBetRow(tokens, free, freeOn, rerender, freeShape));
  ticket.push(
    el('label', { class: 'slip-field' }, [
      el('span', { text: freeOn ? t('freeTotal', { v: fmtMoney(free.value, { sign: false }) }) : t('slipStake') }),
      el('span', { class: 'stake-box' }, [
        stakeInput,
        el('strong', { text: t('slipStakeEquals', { v: fmtMoney(stake, { sign: false }) }) }),
        el('small', { text: t('slipStakeHint', { unit: SLIP_RULES.unit }) })
      ])
    ])
  );
  // Quick stakes: one tap to the usual amounts.
  ticket.push(
    freeOn
      ? el('div', { class: 'stake-quick', role: 'group', 'aria-label': t('freeTopUp') }, [0, 100, 300, 500, 1_000].map(v =>
          el('button', { type: 'button', 'aria-pressed': String((state.freeTopUp || 0) === v), text: v ? `+${fmtMoney(v, { sign: false }).replace('NT$', '')}` : t('freeOnly'), onclick: () => ((state.freeTopUp = v), rerender()) })
        ))
      : el('div', { class: 'stake-quick', role: 'group', 'aria-label': t('slipStake') }, QUICK_STAKES.map(v =>
          el('button', { type: 'button', 'aria-pressed': String(stake === v), text: fmtMoney(v, { sign: false }).replace('NT$', ''), onclick: () => (setStake(v), rerender()) })
        ))
  );
  if (errors.length) {
    ticket.push(el('ul', { class: 'slip-errors' }, errors.map(e => el('li', { text: t(`slipError_${e}`, { max: SLIP_RULES.maxLegs, min: fmtMoney(SLIP_RULES.minTicket, { sign: false }), maxTicket: fmtMoney(SLIP_RULES.maxTicket, { sign: false }), unit: SLIP_RULES.unit, need: minLegsProblem(slip, sizes) }) }))));
  }
  // What comes off the balance: a free bet's top-up only.
  const cost = freeOn ? stake - free.value : comboCount(slip, sizes) * stake;
  // Quadra Plus's daily boost: on this slip (or the first of several singles).
  const multi = mode === 'single' && n > 1;
  const each = multi ? stake : cost;
  const lift = freeOn ? 0 : liftFor(each);
  if (!freeOn && cost > 0 && sizes.length && !errors.length) {
    const row = liftRow(slip, sizes, stake, mode, each, lift, multi);
    if (row) ticket.push(row);
  }
  if (sizes.length && !errors.includes('stakeUnit') && (cost > 0 || freeOn)) ticket.push(payoutBox(slip, sizes, stake, mode, multi ? 0 : lift, freeOn ? free.value : 0));
  if (mode !== 'single' && n >= 2 && !errors.includes('stakeUnit')) ticket.push(boostLadder(mode === 'parlay' ? n : Math.max(...sizes, 0)));
  ticket.push(placeButton(legs, sizes, cost, errors, freeOn ? free : null));
  ticket.push(el('details', { class: 'info' }, [el('summary', { text: t('slipRulesTitle') }), el('p', { text: t('slipRulesNote') })]));

  // The ticket and what it pays: no analysis beside it.
  body.replaceChildren(el('div', { class: 'slip has-legs' }, [el('div', { class: 'card ticket' }, ticket)]));
}

// The stake per combination, kept on the device for next time.
const QUICK_STAKES = [100, 500, 1000, 2000, 5000];
function setStake(v) {
  state.slipStake = v;
  try {
    localStorage.setItem('play.stake', String(v));
  } catch {}
}

// The slip, always at hand: a bar above the tab bar while it has picks
// (not on the slip itself): how many, what they pay together, and the way in.
function renderSlipBar() {
  let bar = $('slip-bar');
  if (!bar) {
    bar = el('button', { id: 'slip-bar', class: 'slip-bar', type: 'button', hidden: '', onclick: () => showTab('slip') });
    document.body.append(bar);
  }
  const { legs } = slipLegs();
  const n = legs.length;
  if (!n || state.tab === 'slip' || !state.accountReady) return void (bar.hidden = true);
  const t = state.t;
  const slip = legs.map(b => ({ gameId: b.gameId, market: b.market ?? b.kind, odds: effectiveOdds(b), fairChance: b.fairChance }));
  const mode = n >= 2 && state.slipMode !== 'single' ? 'parlay' : 'single';
  const sizes = slipSizes(mode, n, [n]);
  const pay = sizes.length ? slipPayoutTable({ legs: slip, sizes, stake: state.slipStake, boost: mode === 'single' ? 0 : boostX() }) : null;
  const all = pay ? pay.net[(1 << n) - 1] : 0;
  bar.hidden = false;
  bar.replaceChildren(
    el('span', { class: 'slip-bar-count num', text: String(n) }),
    el('span', { class: 'slip-bar-main' }, [
      el('strong', { text: mode === 'parlay' ? t('barParlay', { n }) : t('barSingles', { n }) }),
      el('small', { class: 'num', text: t('barPays', { stake: fmtMoney(comboCount(slip, sizes) * state.slipStake, { sign: false }), v: fmtMoney(all, { sign: false }) }) })
    ]),
    el('span', { class: 'slip-bar-go', text: `${t('barGo')} ›` })
  );
}

// ---- Slip: what each pick is, what the ticket pays ------------------------------

// A kind of bet's name (its board section's).
function kindKey(kind) {
  const sec = SECTIONS.find(x => x.kind === kind);
  return { f1: 'f1Title', f1pole: 'f1PoleShort', f1podium: 'f1PodiumShort', f1top6: 'f1Top6Short', f1top10: 'f1Top10Short', f1h2h: 'f1H2HShort', f1team: 'f1TeamShort', f1sc: 'f1Sc', f1vsc: 'f1Vsc', f1red: 'f1Red', future: 'futuresTitle' }[kind] ?? sec?.short ?? sec?.title ?? null;
}

// The market a pick is from, as a small tag: 不讓分, 大小分, 讓分 …
function marketTag(kind) {
  const key = { inning: 'topInningShort', f1: 'f1Short' }[kind] ?? kindKey(kind);
  return key ? el('span', { class: `market-tag tag-${kind}`, text: state.t(key) }) : null;
}

// A pick on a slip: what it is (with its market), then its game and start
// time in full (the time tells doubleheader games apart).
function legMain(leg) {
  return el('span', { class: 'leg-main' }, [
    el('span', { class: 'leg-pick' }, [leg.live ? el('span', { class: 'market-tag tag-live', text: state.t('tagLive') }) : null, marketTag(leg.kind), el('strong', { text: leg.shortLabel })]),
    el('small', { class: 'slip-leg-game', text: leg.start ? `${leg.matchup} · ${fmtTime(leg.start)}` : leg.matchup })
  ]);
}

// Payout at a glance: for a parlay the odds multiplied out, for singles each
// pick's return, for a system each size; then cost, what all correct pays
// (after tax) and the least a winning ticket pays.
// `free`: the free bet part of the stake (its stake isn't paid back).
function payoutBox(legs, sizes, stake, mode, plusLift = 0, free = 0) {
  const t = state.t;
  const n = legs.length;
  const combos = comboCount(legs, sizes);
  const bySize = combosBySize(legs);
  const cost = combos * stake - free;
  const table = slipPayoutTable({ legs, sizes, stake, boost: mode === 'single' ? 0 : boostX(), lift: plusLift });
  const gross = table.gross;
  const net = free ? table.net.map(v => Math.max(0, v - free)) : table.net;
  const all = (1 << n) - 1;
  let least = Infinity;
  for (let won = 1; won < gross.length; won++) if (gross[won] > 0) least = Math.min(least, net[won]);
  const rows = [];
  if (mode === 'parlay') {
    const product = legs.reduce((p, l) => p * l.odds, 1);
    rows.push(el('div', { class: 'pay-line pay-formula' }, [
      el('span', { text: `${legs.map(l => fmtOdds(l.odds)).join(' × ')} =` }),
      el('strong', { text: `×${fmtOdds(product)}` })
    ]));
    rows.push(payLine(t('payStake'), fmtMoney(stake, { sign: false })));
  } else if (mode === 'single') {
    legs.forEach((l, i) => rows.push(payLine(`${t('payEach', { i: i + 1 })} ${fmtMoney(stake, { sign: false })} × ${fmtOdds(l.odds)}`, fmtMoney(afterTax(stake * (1 + (l.odds - 1) * (1 + plusLift))), { sign: false }))));
  } else {
    for (const k of sizes) rows.push(payLine(t('paySize', { size: sizeName(k, n), c: fmtInt(bySize[k] ?? 0) }), fmtMoney((bySize[k] ?? 0) * stake, { sign: false })));
  }
  const lift = mode === 'single' ? 0 : boostRate(Math.max(...sizes, 0), boostX());
  if (lift > 0) rows.push(payLine(t('payBoost'), `+${Math.round(lift * 100)}%`, 'pay-boost'));
  if (plusLift > 0) rows.push(payLine(t('payLift'), `+${Math.round(plusLift * 100)}%`, 'pay-boost'));
  if (free) rows.push(payLine(t('payFree'), `−${fmtMoney(free, { sign: false })}`, 'pay-boost'));
  rows.push(payLine(t('payCost', { c: fmtInt(combos) }), fmtMoney(cost, { sign: false }), 'pay-cost'));
  // Tax is the payout table's own (the free part taken off isn't tax).
  const taxed = gross[all] - table.net[all] > 0.5;
  return el('div', { class: 'pay-box' }, [
    el('p', { class: 'pay-title', text: t('payTitle') }),
    ...rows,
    el('div', { class: 'pay-top' }, [
      el('span', { text: t('payAll') }),
      el('strong', { text: fmtMoney(net[all], { sign: false }) }),
      el('small', { class: net[all] > cost ? 'back-high' : 'back-low', text: t('payProfit', { v: fmtMoney(net[all] - cost) }) })
    ]),
    taxed ? el('p', { class: 'pay-note', text: t('payTaxed', { gross: fmtMoney(gross[all], { sign: false }), tax: fmtMoney(gross[all] - table.net[all], { sign: false }) }) }) : null,
    mode !== 'parlay' && least < net[all] ? el('p', { class: 'pay-note', text: t('payLeast', { v: fmtMoney(least, { sign: false }) }) }) : null
  ]);
}

// The parlay boost's multiplier for a slip bought now: PLUS.odds.boost for
// a Quadra Plus member (1 since v7: the same as everyone's).
function boostX() {
  return plusMember(q.wallet) ? PLUS.odds.boost : 1;
}
// Quadra Plus's daily boost for a paid slip costing `each` bought now: its
// share of the winnings, or 0 (not a member, today's used, or too big).
function liftFor(each) {
  if (!state.accountReady || !plusMember(q.wallet) || liftUsedToday(state.account)) return 0;
  return liftFits(each, PLUS.odds.liftMax) ? PLUS.odds.lift : 0;
}
// Above the payout: the boost on this slip for a member, why not, or (for
// anyone else) what Plus would add to it if every pick wins.
function liftRow(legs, sizes, stake, mode, each, lift, multi) {
  const t = state.t;
  // No daily lift in Plus since v8 (PLUS.odds.lift 0): nothing to show.
  if (!(PLUS.odds.lift > 0)) return null;
  const pct = `${Math.round(PLUS.odds.lift * 100)}%`;
  if (lift > 0) return el('p', { class: 'boost-plus lift-on', text: t(multi ? 'liftOnFirst' : 'liftOn', { v: pct }) });
  if (plusMember(q.wallet)) {
    if (liftUsedToday(state.account)) return el('p', { class: 'note muted', text: t('liftUsed') });
    return el('p', { class: 'note muted', text: t('liftTooBig', { max: fmtMoney(PLUS.odds.liftMax, { sign: false }) }) });
  }
  if (!liftFits(each, PLUS.odds.liftMax)) return null;
  // Not a member: what this slip (the first single) would win more with it.
  const one = multi ? [legs[0]] : legs;
  const oneSizes = multi ? [1] : sizes;
  const all = (1 << one.length) - 1;
  const boost = mode === 'single' ? 0 : boostX();
  const more = slipPayoutTable({ legs: one, sizes: oneSizes, stake, boost, lift: PLUS.odds.lift }).net[all] - slipPayoutTable({ legs: one, sizes: oneSizes, stake, boost }).net[all];
  if (!(more >= 1)) return null;
  return el('button', { class: 'q-plus-hint', type: 'button', onclick: () => openPlus(q), text: t('liftPlusOff', { v: fmtMoney(Math.floor(more), { sign: false }) }) });
}
// The parlay boost as a ladder: 3 picks and up, the share the winnings grow
// by at each size, where this slip stands, and what Plus makes of it (when
// Plus changes it at all).
function boostLadder(size) {
  const t = state.t;
  const x = boostX();
  const steps = PARLAY_BOOST.map((r, k) => k).filter(k => k >= 3);
  const pct = r => `+${Math.round(r * 100)}%`;
  const now = boostRate(size, x);
  const next = steps.find(k => k > size);
  const line = now > 0 ? t('boostNow', { v: pct(now) }) : t('boostFrom', { n: 3 });
  const more = next ? t('boostNext', { n: next - size, v: pct(boostRate(next, x)) }) : t('boostTop');
  return el('div', { class: `boost${now > 0 ? ' on' : ''}` }, [
    el('div', { class: 'boost-head' }, [el('strong', { text: line }), el('small', { text: more })]),
    el('ol', { class: 'boost-steps' }, steps.map(k => el('li', { class: k <= size ? 'hit' : '' }, [el('span', { text: k === steps.at(-1) ? `${k}+` : String(k) }), el('b', { class: 'num', text: pct(boostRate(k, x)) })]))),
    PLUS.odds.boost <= 1
      ? null
      : x > 1
        ? el('p', { class: 'boost-plus', text: t('boostPlusOn') })
        : el('button', { class: 'q-plus-hint', type: 'button', onclick: () => openPlus(q), text: t('boostPlusOff', { v: pct(boostRate(Math.max(size, 3), PLUS.odds.boost)) }) })
  ]);
}

function payCell(label, value, cls = '') {
  return el('div', { class: 'pay-cell' }, [el('small', { text: label }), el('strong', { class: cls, text: value })]);
}

function payLine(label, value, cls = '') {
  return el('div', { class: `pay-line ${cls}` }, [el('span', { text: label }), el('strong', { text: value })]);
}

// ---- The account: kept with the Quadra Pass ------------------------------------
//
// Signing in is required (quadra.mjs's sign-in screen). The account is this
// app's data on the pass (a copy on the device under the pass, so it opens
// at once); its ledger's entries go to the pass's wallet, the one Quadra
// money pool, and the rest of the pool (Securities' cash, Rewards' shop,
// Quadra's pay) is money to bet with here too.

const q = quadraSession('odds', { lang: state.locale });
let lotteryUi = null;
let statsUi = null;
useSourcesSession(q);
const accountKey = () => `${ACCOUNT_KEY}:${q.pass}`;

async function loadAccount() {
  let account = null;
  // This pass's copy on the device, and the one Quadra Sportsbook kept
  // before accounts moved onto the pass (left in place as a backup).
  // The old copy only when it is this pass's: its bets are in the pass's wallet.
  const onPass = new Set((state.wallet?.entries || []).map(e => e.id));
  // (Also the copy older versions kept under the pass itself.)
  for (const key of [accountKey(), q.oldPass ? `${ACCOUNT_KEY}:${q.oldPass}` : '', ACCOUNT_KEY].filter(Boolean)) {
    try {
      const stored = await unpack(localStorage.getItem(key));
      if (!isAccount(stored)) continue;
      if (key === ACCOUNT_KEY && !stored.ledger.some(e => e.kind === 'stake' && onPass.has(`odds:${e.id}`))) continue;
      account = splitOnce(mergeAccounts(account, compactAccount(stored)));
    } catch {}
  }
  return account;
}
// A pass that got its opening money from Quadra itself opens an empty ledger.
const freshAccount = () => newAccount(new Date(), { start: !(state.wallet?.entries || []).some(e => e.id === 'eco:start') });

function poolExtra() {
  return othersBalance(state.wallet, 'odds');
}
function funds(account = state.account) {
  return balance(account) + poolExtra();
}

// The weekly grant (until Quadra pays the week itself) arrives by itself.
function applyGrant() {
  if (!state.accountReady || !canClaim(state.account)) return;
  commitAccount(claimGrant(state.account));
  state.grantNote = true;
}

// Writes go one after another, so an older (slower to compress) save never
// lands after a newer one.
let saving = Promise.resolve();
function saveAccountLocal() {
  const account = state.account;
  const key = accountKey();
  saving = saving.then(async () => {
    try {
      localStorage.setItem(key, await pack(account));
    } catch {}
  });
  return saving;
}

// Every change goes to this device at once and to the pass shortly after.
function commitAccount(next) {
  if (next === state.account || !state.accountReady) return;
  noticeSettled(state.account, next);
  state.account = next;
  saveAccountLocal();
  renderAccount();
  renderSaved();
  pushSoon();
}

// While Play is closed: when an open slip's last game should be over, a
// notice to come and see how it went (it settles when Play is opened).
const GAME_HOURS = { baseball: 3.3, football: 3.5, basketball: 2.6, hockey: 2.7, soccer: 2.1, sets: 2.5, racing: 2.2, mma: 5, rugby: 2, cricket: 8, boxing: 4 };
function syncPush(profile) {
  const now = Date.now();
  const items = [];
  for (const slip of profile?.slips || []) {
    if (slip.status !== 'open') continue;
    const ends = slip.legs.map(l => (l.start ? Date.parse(l.start) + (GAME_HOURS[familyOf(l.sport)] || 3) * 3_600_000 : NaN)).filter(Number.isFinite);
    if (!ends.length) continue;
    const at = Math.max(...ends);
    if (at > now && at < now + 30 * 86_400_000) items.push({ at, title: state.t('noticeSlipDone'), body: slip.legs.map(l => l.shortLabel || l.label).slice(0, 3).join('、'), tag: `slip:${slip.id}`, hash: 'history', kind: 'slip' });
  }
  schedulePush(q, items);
}

// A slip or lottery ticket just settled: a notice (a banner on screen, a
// system notice when Play is in the background and they're allowed).
function noticeSettled(prev, next) {
  syncPush(next);
  if (!prev) return;
  const was = new Map(prev.slips.map(x => [x.id, x.status]));
  for (const slip of next.slips) {
    if (slip.status !== 'settled' || was.get(slip.id) !== 'open' || slip.cashedOut) continue;
    const won = slip.payout > 0;
    notify(q, {
      title: won ? state.t('noticeSlipWon', { v: fmtMoney(slip.payout, { sign: false }) }) : state.t('noticeSlipLost'),
      body: slip.legs.map(l => l.shortLabel || l.label).slice(0, 3).join('、'),
      tag: `slip:${slip.id}`,
      hash: 'history',
      kind: 'slip'
    });
  }
  const had = new Map((prev.tickets || []).map(x => [x.id, x.status]));
  for (const ticket of next.tickets || []) {
    if (ticket.status !== 'settled' || had.get(ticket.id) !== 'open' || !(ticket.prize > 0) || ticket.card) continue;
    notify(q, { title: state.t('noticeTicketWon', { v: fmtMoney(ticket.prize, { sign: false }) }), body: '', tag: `ticket:${ticket.id}`, hash: 'tickets', kind: 'ticket' });
  }
}

let pushTimer = null;
addEventListener('pagehide', () => {
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  syncNow();
});
function pushSoon() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow();
  }, 1200);
}

// Reads the pass's copy, merges it with this device's and writes back what's
// new: no device ever overwrites another's slips or grants. Syncs run one
// after another (a write already on its way must never land after a newer
// one and take a slip or ticket back out).
let syncChain = Promise.resolve();
let syncQueued = false;
function syncNow() {
  if (!state.accountReady || syncQueued) return syncChain;
  syncQueued = true;
  syncChain = syncChain.then(async () => {
    syncQueued = false;
    if (!q.active) return;
    state.sync = { ...state.sync, busy: true, error: '' };
    try {
      await mergeRemote(await q.read({ data: true, inbox: true }));
      state.sync = { ...state.sync, busy: false, at: new Date().toISOString() };
    } catch (error) {
      state.sync = { ...state.sync, busy: false, error: error.code === 'ECO_SESSION_MOVED' ? '' : state.t(error.code === 'TOO_BIG' ? 'syncTooBig' : 'syncFailed') };
    }
    renderAccount();
    renderParlay();
  });
  return syncChain;
}
const mergeFirst = remote => (syncChain = syncChain.then(() => mergeRemote(remote)).catch(console.error));

// A one-time repair (2026-09-29): one pass's 單場 purchase of two picks from
// the same game, saved as one slip before 單場 made a slip per pick, split
// into two slips of NT$1,000 each. The money's stake entry stays as it was
// (NT$2,000, under the first slip); only the slips change. Runs on every
// load and merge, so any copy that still has the old slip is fixed too.
const SPLIT_ONCE = 'mumi7p13fbc6ea9f';
function splitOnce(account) {
  const slip = account?.slips.find(x => x.id === SPLIT_ONCE);
  if (!slip || slip.legs.length !== 2 || slip.mode !== 'single') return account;
  const [first, second] = slip.legs;
  const half = slip.cost / 2;
  const slips = account.slips.flatMap(x =>
    x.id !== SPLIT_ONCE ? [x] : [{ ...x, cost: half, legs: [first] }, ...(account.slips.some(y => y.id === `${SPLIT_ONCE}b`) ? [] : [{ ...x, id: `${SPLIT_ONCE}b`, cost: half, legs: [second] }])]
  );
  return { ...account, slips };
}

async function mergeRemote(remote) {
  if (!remote) return;
  const theirs = remote.payload ? await unpack(remote.payload).catch(() => null) : null;
  // A copy there that can't be read is never saved over.
  if ((remote.payload && !theirs) || (theirs && !isAccount(theirs))) throw new Error('bad account');
  let merged = mergeAccounts(state.account || (theirs ? null : freshAccount()), theirs);
  if (!merged) merged = theirs || freshAccount();
  for (const item of remote.inbox || []) {
    const other = await unpack(item.payload).catch(() => null);
    if (isAccount(other)) merged = mergeDistinct(merged, compactAccount(other));
  }
  const wallet = remote.wallet || state.wallet;
  merged = splitOnce(refundLost(recoverFromWallet(merged, wallet)));
  const have = new Set((wallet?.entries || []).map(e => e.id));
  const entries = poolEntries(merged).filter(e => !have.has(e.id));
  const open = merged.slips.filter(x => x.status === 'open').reduce((sum, x) => sum + x.cost, 0);
  // Open slips, for Quadra Fixtures to show (openSlips).
  const { kinds, slips, done, n } = openSlips(merged);
  const had = wallet?.snap?.odds;
  const same = had?.open === open && had?.n === n && JSON.stringify(had?.slips || []) === JSON.stringify(slips) && JSON.stringify(had?.done || []) === JSON.stringify(done) && JSON.stringify(had?.kinds || {}) === JSON.stringify(kinds);
  const snap = same ? undefined : { odds: { open, n, kinds, slips, done, t: Date.now() } };
  const changed = !theirs || JSON.stringify(merged) !== JSON.stringify(theirs);
  if (JSON.stringify(merged) !== JSON.stringify(state.account)) {
    state.account = merged;
    saveAccountLocal();
    renderSaved();
  }
  if (changed || entries.length || snap) {
    const payload = changed ? await pack(merged) : undefined;
    if (payload && payload.length > 1_000_000) throw Object.assign(new Error('too big'), { code: 'TOO_BIG' });
    const res = await q.write({ payload, wallet: { entries, snap, settings: affinityPatch('odds').settings } });
    state.wallet = res.wallet || state.wallet;
  } else state.wallet = wallet;
  for (const item of remote.inbox || []) await q.dropInbox(item.id).catch(() => {});
}

// What the person bets on and opens, for recommendations here and in every
// Quadra app, and Rewards' missions.
function track(action, keys = [], weight = 1) {
  if (keys.length) recordAffinity('odds', keys, weight);
  if (action && q.active) q.write({ wallet: activityPatch(q.wallet, 'odds', action) }).catch(() => {});
}
// The keys a pick is about: its league, sport, teams (or driver) and market.
function betKeys(bet) {
  const game = state.data?.games.find(g => g.id === bet.gameId);
  const teams = game ? [game.away, game.home] : [bet.away, bet.home].filter(Boolean);
  return [
    bet.sport ? `league:${bet.sport}` : null,
    bet.sport ? `sport:${familyOf(bet.sport) || bet.sport}` : null,
    ...teams.map(team => `team:${bet.sport}:${normalizeTeamName(team?.en ?? team)}`),
    bet.driverEn ? `driver:${normalizeTeamName(bet.driverEn)}` : null,
    bet.kind ? `market:${bet.kind}` : null
  ].filter(Boolean);
}

// The logo of the team a pick is on (saved with the pick, so history shows
// it whatever the board holds later), or null for picks on no one team.
function legLogo(bet) {
  if (bet.kind === 'future') return teamLogo(bet.sport, bet.teamEn) ?? findTeamLogo(futureTeamLeagues(bet.sport), bet.teamEn);
  const side = bet.kind === 'teamtotal' ? bet.team : bet.settle?.team ?? (['away', 'home'].includes(bet.side) ? bet.side : null);
  return side && bet.game ? teamLogo(bet.sport, bet.game[side].en) : null;
}

// A saved pick's picture: its team's logo, the driver's badge, or the league's logo.
function legIcon(leg) {
  if ((leg.kind === 'f1' || leg.kind === 'f1pole' || leg.kind === 'f1podium') && leg.driver) {
    const driver = f1Driver(leg.driver);
    return driverBadge({ driverEn: leg.driver, driver }, 'logo-sm');
  }
  if (leg.logo) {
    const fallback = () => leagueImg(leg.sport, 'logo-sm');
    return logoPicture(leg.logo, leg.logo.includes('/500/') ? leg.logo.replace('/500/', '/500-dark/') : null, 'logo logo-sm', fallback);
  }
  const side = leg.kind === 'teamtotal' ? leg.team : ['away', 'home'].includes(leg.side) ? leg.side : null;
  const url = side && leg[side] ? teamLogo(leg.sport, leg[side]) : null;
  if (url) return logoPicture(url, teamLogo(leg.sport, leg[side], true), 'logo logo-sm', () => leagueImg(leg.sport, 'logo-sm'));
  return leagueImg(leg.sport, 'logo-sm');
}

// What a pick on the slip needs to be settled later, whatever the board shows then.
function legRecord(bet) {
  return {
    id: bet.id,
    gameId: bet.gameId ?? undefined,
    market: bet.gameId ? bet.market ?? bet.kind : undefined,
    kind: bet.kind,
    sport: bet.sport,
    label: bet.label,
    shortLabel: bet.shortLabel,
    matchup: bet.matchup,
    start: bet.start ?? null,
    odds: effectiveOdds(bet),
    fairChance: bet.fairChance,
    side: bet.side ?? null,
    line: bet.totalLine ?? bet.runLine ?? bet.teamLine ?? bet.runN ?? null,
    inning: bet.inning ?? null,
    away: bet.game?.away.en ?? null,
    home: bet.game?.home.en ?? null,
    driver: bet.driverEn ?? null,
    eventSlug: bet.eventSlug ?? null,
    live: bet.live ? true : undefined,
    kambiId: bet.game?.kambiId ?? undefined,
    ...(bet.settle ?? {}),
    team: bet.kind === 'future' ? bet.teamEn : bet.settle?.team ?? bet.team ?? null,
    logo: legLogo(bet)
  };
}

// The free bets not yet spent (on this device either).
function freeBetList() {
  if (!state.accountReady) return [];
  return freeBets(state.wallet, Date.now(), state.account.ledger.filter(e => e.kind === 'freebet').map(e => e.id.slice(3)));
}
// Above the stake: the free bets to use, one tap each.
function freeBetRow(tokens, free, freeOn, rerender, freeShape = true) {
  const t = state.t;
  const days = x => Math.max(1, Math.ceil((x.until - Date.now()) / 86_400_000));
  return el('div', { class: 'free-bets' }, [
    el('div', { class: 'free-bets-head' }, [el('strong', { text: t('freeBetsTitle') }), el('small', { class: 'muted', text: t('freeBetsSub') })]),
    el('div', { class: 'free-bets-row', role: 'group' }, tokens.map(x =>
      el('button', { type: 'button', class: 'free-bet', 'aria-pressed': String(free?.id === x.id), onclick: () => ((state.useFree = free?.id === x.id ? null : x.id), (state.freeTopUp = 0), rerender()) }, [
        el('strong', { class: 'num', text: `🎁 ${fmtMoney(x.value, { sign: false })}` }),
        el('small', { text: x.id === 'eco:fb:welcome' ? `${t('freeBetWelcome')} · ${t('freeBetDays', { n: days(x) })}` : x.id.startsWith('eco:fb:') ? `✦ ${t('freeBetPlus')} · ${t('freeBetDays', { n: days(x) })}` : x.id.startsWith('vocab:xs:') ? `⭐ ${t('freeBetPoints')} · ${t('freeBetDays', { n: days(x) })}` : t('freeBetDays', { n: days(x) }) })
      ])
    )),
    free && !freeOn ? el('p', { class: 'note back-low', text: freeShape ? t('freeBetMinOdds', { v: FREE_MIN_ODDS.toFixed(2) }) : t('freeBetOneSlip') }) : free ? el('p', { class: 'note', text: t('freeBetNote') }) : null
  ]);
}

// The 模擬下注 button: buys the slip on the simulated account.
function placeButton(legs, sizes, cost, errors, free = null) {
  const t = state.t;
  const money = funds();
  const short = cost > money;
  // Opened on the last board saved: bets wait for today's odds.
  const updating = Boolean(state.fromSnapshot);
  const blocked = errors.length > 0 || sizes.length === 0 || short || !state.accountReady || updating;
  return el('div', { class: 'place-row' }, [
    el('button', {
      class: 'primary-button place-button',
      type: 'button',
      disabled: blocked ? '' : null,
      text: updating ? t('placeUpdating') : free && !short ? (cost > 0 ? t('placeFreePlus', { f: fmtMoney(free.value, { sign: false }), v: fmtMoney(cost, { sign: false }) }) : t('placeFree', { v: fmtMoney(free.value, { sign: false }) })) : short ? t('placeShort', { v: fmtMoney(money, { sign: money < 0 }) }) : t('placeSlip', { v: fmtMoney(cost, { sign: false }) }),
      onclick: async () => {
        // Bought in one tap at the board's odds now: the slip redraws with
        // every refresh (moved odds marked there), so what it shows is what's
        // bought. Only a pick gone, locked or started stops it.
        const current = () => {
          const board = new Map(slipCandidates().map(b => [b.id, b]));
          const now = legs.map(b => board.get(b.id));
          return now.every(b => b && !b.lock && b.estOdds > 1 && !started(b)) ? now : null;
        };
        // 單場: each pick its own slip (its own bet, its own line in 紀錄),
        // the stake the same on each; the others, one slip.
        const build = picks => {
          const records = picks.map(legRecord);
          // The parlay boost as it stands now (doubled for Quadra Plus), kept with the slip.
          const boost = boostX();
          const slips = free
            ? [{ id: newSlipId(), mode: state.slipMode, sizes, stake: free.value + cost, cost, legs: records, ...(state.slipMode !== 'single' ? { boost } : {}) }]
            : state.slipMode === 'single' && records.length > 1
              ? records.map(leg => ({ id: newSlipId(), mode: 'single', sizes: [1], stake: state.slipStake, cost: cost / records.length, legs: [leg] }))
              : [{ id: newSlipId(), mode: state.slipMode, sizes, stake: state.slipStake, cost, legs: records, ...(state.slipMode !== 'single' ? { boost } : {}) }];
          // Quadra Plus's daily boost goes with the first paid slip it fits.
          if (!free) {
            const lift = liftFor(slips[0].cost);
            if (lift > 0) slips[0] = { ...slips[0], lift };
          }
          return { records, slips };
        };
        const stop = () => (renderParlay(), tell({ lang: state.locale, icon: '⏳', title: t('pickGone'), body: t('pickGoneBody') }));
        let picks = current();
        if (!picks) return stop();
        let { records, slips } = build(picks);
        if (cost > funds()) return;
        // Every purchase asks first: what it costs, and the most it can pay.
        const most = slips.reduce((sum, one) => sum + Math.max(0, slipRange(free ? { ...one, free: true, freeValue: free.value } : one).most), 0);
        const asked = await ask({
          lang: state.locale,
          icon: free ? '🎁' : '🎫',
          title: free ? (cost > 0 ? t('placeAskFreePlus', { f: fmtMoney(free.value, { sign: false }), v: fmtMoney(cost, { sign: false }) }) : t('placeAskFree', { v: fmtMoney(free.value, { sign: false }) })) : t('placeAsk', { v: fmtMoney(cost, { sign: false }) }),
          body: t('placeAskBody', { n: records.length, most: fmtMoney(most, { sign: false }) }),
          ok: t('placeOk'),
          cancel: t('askCancel')
        });
        if (!asked || cost > funds()) return;
        picks = current();
        if (!picks) return stop();
        ({ records, slips } = build(picks));
        let account = state.account;
        const now = new Date();
        if (free) {
          const placed = placeFreeSlip(account, slips[0], free, now, { extra: Infinity });
          if (placed.error) return;
          account = placed.account;
          state.useFree = null;
          state.freeTopUp = 0;
        } else for (const one of slips) {
          // The whole cost was checked above: each part goes through.
          const placed = placeSlip(account, one, now, { extra: Infinity });
          if (placed.error) return;
          account = placed.account;
        }
        const slip = { legs: records };
        state.parlay = [];
        state.modeChosen = false;
        state.justPlaced = { at: Date.now(), n: slips.length, cost, free: free ? free.value : 0 };
        for (const one of slips) state.freshSlips.add(one.id);
        commitAccount(account);
        // Synced at once, not in a moment: going straight back to Quadra
        // Fixtures should find the new slip there.
        clearTimeout(pushTimer);
        syncNow();
        track('bet', [...new Set(slip.legs.flatMap(leg => betKeys(leg)))], 3);
        // Rewards' mission: a parlay of three picks or more.
        if (state.slipMode !== 'single' && records.length >= 3) track('parlay');
        renderGames();
        renderLive();
        renderF1();
        renderFutures();
              renderParlay();
        showTab('history');
      }
    }),
    el('small', { class: 'muted', text: t('placeNote', { v: fmtMoney(money, { sign: money < 0 }) }) })
  ]);
}

// Legs of open slips whose games are over get their results; a slip is paid
// once every leg is decided. A game still not found three days after its
// start (postponed and never replayed) counts as void, as the lottery does.
const RESULT_CHECK_MS = 90_000;
const VOID_AFTER_MS = 3 * 86_400_000;
async function checkResults(force = false) {
  if (!state.accountReady) return;
  const open = state.account.slips.filter(s => s.status === 'open');
  const now = new Date();
  const pending = open.flatMap(s => s.legs.filter(l => !l.result && (l.kind === 'future' || (l.start && Date.parse(l.start) <= now.getTime()))));
  if (!pending.length || state.checking) return;
  if (!force && now.getTime() - state.checkedAt < (state.legLive.size ? LIVE_REFRESH_MS : RESULT_CHECK_MS)) return;
  state.checking = true;
  state.checkedAt = now.getTime();
  renderSaved();
  try {
    const outcomes = await fetchOutcomes(pending, now);
    state.legLive = new Map([...outcomes].filter(([, o]) => o?.status === 'pending' && o.state === 'in'));
    let account = state.account;
    for (const slip of open) {
      const results = slip.legs.map(leg => {
        if (leg.result) return leg.result;
        const result = legResult(leg, outcomes.get(leg.id));
        if (result) return result;
        const stale = leg.kind !== 'future' && leg.start && now.getTime() - Date.parse(leg.start) > VOID_AFTER_MS;
        return stale ? 'void' : null;
      });
      const next = applyResults(account, slip.id, results, now, slip.legs.map(leg => finalOf(outcomes.get(leg.id))));
      if (next !== account && next.slips.find(s => s.id === slip.id).status === 'settled') state.freshSlips.add(slip.id);
      account = next;
    }
    commitAccount(account);
  } catch (error) {
    console.error(error);
  } finally {
    state.checking = false;
    renderSaved();
  }
}

// What to keep of a decided game with its pick: the final score (and each
// set's), or a race's or championship's winner.
function finalOf(outcome) {
  if (outcome?.status !== 'final') return null;
  if (outcome.winner) return { winner: outcome.winner, ...(outcome.podium ? { podium: outcome.podium } : {}) };
  if (!Number.isFinite(outcome.awayScore) || !Number.isFinite(outcome.homeScore)) return null;
  return { away: outcome.awayScore, home: outcome.homeScore, ...(outcome.homeSets ? { homeSets: outcome.homeSets, awaySets: outcome.awaySets } : {}) };
}

function renderAccount() {
  if (!state.accountReady || !state.account) return;
  const t = state.t;
  const account = state.account;
  const now = new Date();
  const money = funds();
  const open = account.slips.filter(x => x.status === 'open');
  const atStake = open.reduce((sum, x) => sum + x.cost, 0);
  // Everything won: slips paid (cashed out too) and lottery prizes.
  const won = account.ledger.filter(e => e.kind === 'payout' || e.kind === 'cashout' || e.kind === 'prize').reduce((sum, e) => sum + Math.max(0, e.amount), 0);
  $('account-body').replaceChildren(
    el('div', { class: 'card account-card' }, [
      el('div', { class: 'account-top' }, [
        el('div', {}, [el('p', { class: 'muted', text: t('poolTotal') }), el('p', { class: `account-balance stat-value${money < 0 ? ' back-low' : ''}`, text: fmtMoney(money, { sign: money < 0 }) })]),
        el('div', { class: 'account-side' }, [
          el('p', {}, [el('span', { class: 'muted', text: `${t('accountAtStake')} ` }), el('strong', { text: fmtMoney(atStake, { sign: false }) })]),
          el('p', {}, [el('span', { class: 'muted', text: `${t('accountWon')} ` }), el('strong', { class: won > 0 ? 'back-high' : '', text: fmtMoney(won, { sign: false }) })])
        ])
      ]),
      canClaim(account, now) || state.grantNote ? el('p', { class: 'muted', text: state.grantNote ? t('grantAdded', { v: fmtMoney(WEEKLY_GRANT, { sign: false }) }) : '' }) : null
    ])
  );
}

// The open slips, compact, for Quadra Fixtures (the wallet's snap.odds.slips),
// and (done) the slips settled in the last DONE_DAYS, for its picks to show
// how they ended (each with st: won / lost / void / cashed):
// each one's play (m: single, parlay or system, z: a system's sizes), its
// cost (c) and the most it can still pay (x), and its picks: the game
// (Sportsbook's id, before the first "|"), the pick, its market (k), odds,
// start, league and result so far. The market names go along in both
// languages (kinds). The soonest slips first, as many as fit the wallet's
// room for it.
const slipTagZh = makeT('zh');
const slipTagEn = makeT('en');
const DONE_DAYS = 8;
function openSlips(account, now = Date.now()) {
  const kinds = {};
  const tagName = (t, kind) => {
    const key = { inning: 'topInningShort', f1: 'f1Short' }[kind] ?? kindKey(kind);
    return key ? t(key) : '';
  };
  const firstStart = slip => slip.legs.map(leg => leg.start || '').filter(Boolean).sort()[0] || '';
  // A championship pick (futures) has no game: its team (in English) and
  // market go with it, for Fixtures to find the games that decide it.
  const compactLeg = leg => {
    if (leg.kind && !kinds[leg.kind]) kinds[leg.kind] = [tagName(slipTagZh, leg.kind), tagName(slipTagEn, leg.kind)];
    return { g: String(leg.id).split('|')[0], p: leg.shortLabel || leg.label || '', k: leg.kind || '', o: Math.round(leg.odds * 100) / 100, s: leg.start || null, sp: leg.sport || '', r: leg.result || undefined, live: leg.live || undefined, ...(leg.kind === 'future' ? { tm: leg.team || undefined, fk: String(leg.id).split('|')[1] || undefined } : {}) };
  };
  const compact = slip => {
    const range = slipRange(slip);
    return { id: slip.id, m: slip.mode, z: slip.mode === 'system' ? slip.sizes : undefined, c: slip.cost, x: Math.max(0, Math.round(slip.cost + range.most)), l: slip.legs.map(compactLeg) };
  };
  const slips = account.slips
    .filter(slip => slip.status === 'open')
    .sort((a, b) => firstStart(a).localeCompare(firstStart(b)))
    .map(compact);
  const outcome = slip => (slip.cashedOut ? 'cashed' : slip.refunded ? 'void' : slip.payout > slip.cost ? 'won' : slip.payout > 0 ? 'void' : 'lost');
  const done = account.slips
    .filter(slip => slip.status === 'settled' && slip.legs?.length && Date.parse(slip.settledAt) > now - DONE_DAYS * 86_400_000)
    .sort((a, b) => Date.parse(b.settledAt) - Date.parse(a.settledAt))
    .map(slip => ({ ...compact(slip), x: undefined, st: outcome(slip) }));
  const out = [];
  for (const slip of slips) {
    if (JSON.stringify({ kinds, slips: [...out, slip] }).length > 3500) break;
    out.push(slip);
  }
  // Settled ones in what room is left (open ones first).
  const doneOut = [];
  for (const slip of done) {
    if (JSON.stringify({ kinds, slips: out, done: [...doneOut, slip] }).length > 3500) break;
    doneOut.push(slip);
  }
  const used = new Set([...out, ...doneOut].flatMap(slip => slip.l.map(leg => leg.k)));
  return { kinds: Object.fromEntries(Object.entries(kinds).filter(([k]) => used.has(k))), slips: out, done: doneOut, n: slips.length };
}

// Where each pick stands: won / lost / void, 'live' (its game is on), or
// 'waiting' (not started).
function legState(leg, now = Date.now()) {
  if (leg.result) return leg.result;
  return leg.start && Date.parse(leg.start) <= now ? 'live' : 'waiting';
}

// What an open slip has locked in (every undecided pick lost) and the most it
// can still pay (every undecided pick won).
function slipRange(slip) {
  const as = result => slip.legs.map(leg => ({ gameId: leg.gameId, odds: leg.odds, result: leg.result ?? result }));
  // A free bet pays its winnings only, not the stake.
  const less = x => (slip.free ? Math.max(0, x - (slip.freeValue ?? slip.stake)) : x);
  return {
    locked: less(settleSlip({ legs: as('lost'), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0, lift: slip.lift ?? 0 }).net),
    most: less(settleSlip({ legs: as('won'), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0, lift: slip.lift ?? 0 }).net)
  };
}

const LEG_ICON = { won: '✓', lost: '✗', void: '↺', live: '●', waiting: '⏳', cashed: '–' };

// A free bet's slip: the free part, and what was put on top.
const freeCellText = slip => (slip.cost > 0 ? `${fmtMoney(slip.freeValue ?? slip.stake - slip.cost, { sign: false })} + ${fmtMoney(slip.cost, { sign: false })}` : fmtMoney(slip.stake, { sign: false }));

// ---- Cash out ------------------------------------------------------------------------

// A pick's price right now: its own on the board before the game, the same
// market on the live board once it's under way (win, total, run line, team
// total), or null (no cash out on it now).
// The board's bet a pick is on now (before the start, or live).
function currentBet(leg, now = Date.now()) {
  if (leg.result) return null;
  if (!leg.start || Date.parse(leg.start) > now) return [...state.bets, ...state.futures].find(b => b.id === leg.id) ?? null;
  const game = state.liveGames.find(g => g.sport === leg.sport && g.away.en === leg.away && g.home.en === leg.home);
  if (!game) return null;
  const line = b => b.totalLine ?? b.runLine ?? b.teamLine ?? null;
  return state.liveBets.find(b => b.gameId === game.id && b.kind === leg.kind && b.side === leg.side && (leg.kind === 'ml' || line(b) === leg.line) && (leg.kind !== 'teamtotal' || b.team === leg.team)) ?? null;
}
function currentOdds(leg, now = Date.now()) {
  const b = currentBet(leg, now);
  return b && !b.lock && b.estOdds > 1 ? effectiveOdds(b) : null;
}
// A pick's fair chance now, for cash out: the board's own (its odds less the
// margin). Without one (an odd market), its odds' chance less a full margin.
function currentChance(leg, now = Date.now()) {
  const odds = currentOdds(leg, now);
  if (odds == null) return null;
  const bet = currentBet(leg, now);
  return bet?.fairChance > 0 && bet.fairChance < 1 ? bet.fairChance : (1 / odds) * (1 - FALLBACK_MARGIN);
}
const FALLBACK_MARGIN = 0.1;
function cashOutPrice(slip, { plus = plusMember(q.wallet) } = {}) {
  const keep = plus ? PLUS.odds.cashOutKeep : CASHOUT_KEEP;
  return cashOutValue(slip, slip.legs.map(leg => currentChance(leg)), { keep });
}
async function doCashOut(slip, value) {
  const t = state.t;
  const fresh = cashOutPrice(slip);
  // The price moved since it was shown: ask again at the new one.
  if (fresh == null) return tell({ lang: state.locale, title: t('cashOutGone'), body: t('cashOutGoneBody') });
  if (!(await ask({ lang: state.locale, icon: '💵', title: t('cashOutAsk', { v: fmtMoney(fresh, { sign: false }) }), body: t('cashOutAskBody', { most: fmtMoney(Math.max(0, slipRange(slip).most), { sign: false }) }), ok: t('cashOutOk'), cancel: t('cashOutKeep') }))) return;
  const account = cashOut(state.account, slip.id, cashOutPrice(slip) ?? fresh);
  if (account === state.account) return;
  state.freshSlips.add(slip.id);
  commitAccount(account);
  clearTimeout(pushTimer);
  syncNow();
  track('cashout', [...new Set(slip.legs.flatMap(leg => betKeys(leg)))], 1);
  renderSaved();
  if (state.tab === 'home') renderHome(homeCtx());
}
function cashOutRow(slip) {
  const t = state.t;
  const value = cashOutPrice(slip);
  const plus = plusMember(q.wallet);
  return el('div', { class: `cashout${value == null ? ' off' : ''}` }, [
    el('button', { class: 'cashout-btn', type: 'button', disabled: value == null ? '' : null, onclick: () => doCashOut(slip, value) }, [
      el('span', { text: t('cashOut') }),
      el('strong', { class: 'num', text: value == null ? t('cashOutPaused') : fmtMoney(value, { sign: false }) })
    ]),
    value != null && !plus ? el('button', { class: 'q-plus-hint', type: 'button', onclick: () => openPlus(q), text: t('cashOutPlus', { v: fmtMoney(cashOutPrice(slip, { plus: true }) ?? value, { sign: false }) }) }) : null
  ]);
}

// Where a pick's game in play stands, if the game ended right now: the same
// settlement the slip will use ('won', 'lost', 'void' for a push), 'level'
// for a winner pick with the score level, or null when the score can't tell
// yet (the first run, a set not played).
function legStanding(leg) {
  const live = state.legLive.get(leg.id);
  if (!live) return null;
  // A level winner pick (no draw to back) is neither winning nor losing yet.
  if (leg.kind === 'ml' && leg.side !== 'draw' && live.homeScore === live.awayScore) return 'level';
  return legResult(leg, { ...live, status: 'final' });
}

// ESPN's short detail in the page's language: baseball's half-innings and
// half-time translated, the rest ("Q3 5:21", "67'") as it is.
function liveDetail(live, sport) {
  const t = state.t;
  // Matches in sets: the set being played.
  if (!live.detail && live.homeSets?.length) return t('liveSetN', { n: live.homeSets.length });
  if (!live.detail) return t('liveInPlay');
  if (familyOf(sport) === 'baseball') {
    const inning = parseInning(live.detail, live.period);
    if (inning) return t(`liveHalf_${inning.half}`, { n: inning.inning });
  }
  if (/half/i.test(live.detail)) return t('liveHalfTime');
  return live.detail;
}

// An open slip with games in play: how many picks are winning and losing
// right now, and what it would pay if every game in play ended now (once
// nothing is still to start).
function slipNowLine(slip, states) {
  const t = state.t;
  // A level winner pick isn't settled either way: no payout figure while one is.
  const now = slip.legs.map((leg, k) => leg.result ?? (states[k] === 'live' ? legStanding(leg) : null)).map(x => (x === 'level' ? null : x));
  const live = slip.legs.filter((leg, k) => states[k] === 'live' && state.legLive.has(leg.id));
  if (!live.length) return null;
  const count = x => slip.legs.filter((leg, k) => states[k] === 'live' && now[k] === x).length;
  const parts = [t('slipNowCount', { win: count('won'), lose: count('lost') })];
  if (now.every(Boolean)) {
    const pay = settleSlip({ legs: slip.legs.map((leg, k) => ({ gameId: leg.gameId, odds: leg.odds, result: now[k] })), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0, lift: slip.lift ?? 0 }).net;
    parts.push(pay > 0 ? t('slipNowPays', { v: fmtMoney(pay, { sign: false }) }) : t('slipNowNothing'));
  }
  return el('p', { class: 'slip-now' }, [el('span', { class: 'live-dot', text: t('tagLive') }), document.createTextNode(` ${parts.join(' · ')}`)]);
}

// A pick's game in play in one line: the score (sets and each set's score
// for matches in sets), where the game is, and whether the pick is winning
// right now.
// A game's score in one line, the teams in the card's order: "太空人 4 : 6
// 運動家", with each set's score for matches in sets.
function scoreText(leg, score) {
  const name = side => teamName({ en: leg[side], zh: teamZh(leg.sport, leg[side]) });
  const first = isSoccer(leg.sport) || isNeutral(leg.sport) ? ['home', 'away'] : ['away', 'home'];
  const sets = score.homeSets ? ` (${score.homeSets.map((h, i) => (first[0] === 'home' ? `${h}-${score.awaySets[i]}` : `${score.awaySets[i]}-${h}`)).join(' ')})` : '';
  return `${name(first[0])} ${score[first[0]]} : ${score[first[1]]} ${name(first[1])}${sets}`;
}

// A decided pick's final score (or race winner), kept with the slip.
function legFinalLine(leg) {
  const f = leg.final;
  if (!f) return null;
  const text = f.winner ? `${state.t('finalWinner')} ${f.winner}` : `${state.t('finalScore')} ${scoreText(leg, f)}`;
  return el('span', { class: 'leg-inplay muted', text });
}

function legLiveLine(leg) {
  const t = state.t;
  const live = state.legLive.get(leg.id);
  if (!live) return null;
  const score = scoreText(leg, { away: live.awayScore, home: live.homeScore, homeSets: live.homeSets, awaySets: live.awaySets });
  const standing = legStanding(leg);
  const tag = { won: ['winning', 'legNowWinning'], lost: ['losing', 'legNowLosing'], void: ['level', 'legNowLevel'], level: ['level', 'legNowLevel'] }[standing];
  return el('span', { class: 'leg-inplay' }, [
    el('span', { class: 'leg-live-score', text: score }),
    el('span', { class: 'muted', text: ` · ${liveDetail(live, leg.sport)}` }),
    tag ? el('span', { class: `leg-now ${tag[0]}`, text: t(tag[1]) }) : null
  ]);
}

// A bet brought back from the pass's money records: its cost, time and
// payout are known, its picks aren't.
function recoveredSlipCard(slip) {
  const t = state.t;
  const profit = slip.payout - slip.cost;
  return el('article', { class: 'card saved-slip recovered' }, [
    el('div', { class: 'saved-head' }, [
      el('div', { class: 'saved-title' }, [
        el('span', { class: 'mode-tag', text: t('slipRecoveredTag') }),
        el('strong', { text: t('slipRecoveredTitle') }),
        el('small', { class: 'muted', text: t('slipBoughtAt', { time: fmtTime(slip.t) }) })
      ]),
      el('span', { class: `slip-pill ${slip.refunded ? '' : profit > 0 ? 'won' : 'lost'}`, text: slip.refunded ? t('slipRefunded') : slip.payout > 0 ? t('slipPaid', { v: fmtMoney(slip.payout, { sign: false }) }) : t('slipRecoveredNoPay') })
    ]),
    el('p', { class: 'muted recovered-note', text: t(slip.refunded ? 'slipRefundedNote' : 'slipRecoveredNote') }),
    el('div', { class: 'saved-pay' }, [
      payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
      payCell(t('slipPaidLabel'), fmtMoney(slip.payout, { sign: false })),
      payCell(t('slipResult'), fmtMoney(profit), profit > 0 ? 'back-high' : profit < 0 ? 'back-low' : '')
    ])
  ]);
}

function savedSlipCard(slip) {
  if (slip.recovered || !slip.legs.length) return recoveredSlipCard(slip);
  const t = state.t;
  const n = slip.legs.length;
  const now = Date.now();
  const settled = slip.status === 'settled';
  const states = slip.legs.map(leg => (slip.cashedOut && !leg.result ? 'cashed' : legState(leg, now)));
  const decided = states.filter(st => ['won', 'lost', 'void'].includes(st)).length;
  const profit = settled ? slip.payout - slip.cost : null;
  const range = settled ? null : slipRange(slip);
  // Open, but nothing left can pay: a parlay with a lost pick.
  const dead = !settled && range.most <= 0;
  const mode = slip.mode === 'system' ? slip.sizes.map(k => sizeName(k, n)).join('、') : t(`slipMode_${slip.mode}`);
  const pill = settled
    ? el('span', { class: `slip-pill ${slip.cashedOut ? 'cashed' : profit > 0 ? 'won' : profit < 0 ? 'lost' : ''}`, text: slip.cashedOut ? t('slipCashed', { v: fmtMoney(slip.payout, { sign: false }) }) : slip.payout > 0 ? t('slipPaid', { v: fmtMoney(slip.payout, { sign: false }) }) : t('slipLost') })
    : dead
      ? el('span', { class: 'slip-pill lost', text: t('slipDead') })
      : el('span', { class: `slip-pill ${states.includes('live') ? 'live' : 'open'}`, text: states.includes('live') ? t('slipLiveNow') : t('slipOpen') });
  const nextStart = slip.legs.filter((leg, k) => states[k] === 'waiting' && leg.start).map(leg => leg.start).sort()[0];
  return el('article', { class: `card saved-slip ${state.freshSlips.has(slip.id) ? 'fresh' : ''} ${dead ? 'dead' : ''}` }, [
    el('div', { class: 'saved-head' }, [
      el('div', { class: 'saved-title' }, [
        el('span', { class: 'mode-tag', text: slip.free ? `${mode} · ${t('freeBetTag')}` : mode }),
        el('strong', { text: t('slipLegs', { n }) }),
        el('small', { class: 'muted', text: t('slipBoughtAt', { time: fmtTime(slip.t) }) })
      ]),
      pill
    ]),
    // One segment per pick, coloured by where it stands.
    el('div', { class: 'leg-bar', role: 'img', 'aria-label': t('slipProgress', { k: decided, n }) }, states.map(st => el('span', { class: `seg seg-${st}` }))),
    el('p', { class: 'saved-progress' }, [
      document.createTextNode(t('slipProgress', { k: decided, n })),
      !settled && nextStart ? el('span', { class: 'muted', text: ` · ${t('slipNextStart', { time: fmtTime(nextStart) })}` }) : null
    ]),
    !settled ? slipNowLine(slip, states) : null,
    el('ul', { class: 'parlay-legs saved-legs' },
      slip.legs.map((leg, k) =>
        el('li', { class: `leg-${states[k]}` }, [
          el('span', { class: 'leg-result', 'aria-label': t(`legState_${states[k]}`), title: t(`legState_${states[k]}`), text: LEG_ICON[states[k]] }),
          legIcon(leg),
          el('span', { class: 'leg-body' }, [legMain(leg), states[k] === 'live' ? legLiveLine(leg) : leg.result ? legFinalLine(leg) : null]),
          el('span', { class: 'leg-odds' }, [el('small', { text: '@' }), document.createTextNode(fmtOdds(leg.odds))])
        ])
      )
    ),
    el('div', { class: 'saved-pay' }, settled
      ? [
          slip.free ? payCell(t('freeBetTag'), freeCellText(slip)) : payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
          payCell(t('slipPaidLabel'), fmtMoney(slip.payout, { sign: false })),
          profit > 0 ? payCell(t('slipResult'), fmtMoney(profit), 'back-high') : null
        ]
      : [
          slip.free ? payCell(t('freeBetTag'), freeCellText(slip)) : payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
          slip.mode === 'parlay' ? payCell(t('payOdds'), `×${fmtOdds(slip.legs.reduce((p, l) => p * l.odds, 1))}`) : null,
          decided && range.locked > 0 ? payCell(t('slipLocked'), fmtMoney(range.locked, { sign: false }), 'back-high') : null,
          payCell(decided ? t('slipMost') : t('payAll'), fmtMoney(range.most, { sign: false }), dead ? 'back-low' : '')
        ]),
    slip.boost && boostRate(Math.max(...slip.sizes), slip.boost) > 0 ? el('p', { class: 'saved-boost', text: t('slipBoosted', { v: `+${Math.round(boostRate(Math.max(...slip.sizes), slip.boost) * 100)}%` }) }) : null,
    slip.lift > 0 ? el('p', { class: 'saved-boost', text: t('slipLifted', { v: `+${Math.round(slip.lift * 100)}%` }) }) : null,
    settled || dead || slip.free ? null : cashOutRow(slip),
  ]);
}

const HISTORY_FILTERS = {
  all: () => true,
  open: s => s.status === 'open',
  won: s => s.status === 'settled' && s.payout > 0
};

// When a settled slip's last game was played: its day is the day to file it
// under, not the day the app happened to settle it (an F1 result can come
// in days after the race, or a slip is settled when the app is next opened).
function slipEndedAt(slip) {
  const last = slip.legs.map(leg => leg.start || '').filter(Boolean).sort().at(-1);
  if (last && slip.settledAt && last < slip.settledAt) return last;
  return slip.settledAt ?? slip.t;
}

// Groups for the slip list: games on now, waiting to start, already lost
// (a parlay with a lost pick, waiting for its other games), then settled
// slips by the Taiwan day they were settled.
function slipGroupKey(slip, now) {
  if (slip.recovered || !slip.legs.length) return 'recovered';
  if (slip.status === 'settled') return `day|${taipeiDayKey(slipEndedAt(slip))}`;
  if (slipRange(slip).most <= 0) return 'dead';
  return slip.legs.some(leg => legState(leg, now) === 'live') ? 'live' : 'waiting';
}

function groupTitle(key) {
  const t = state.t;
  if (key === 'live') return t('groupLive');
  if (key === 'waiting') return t('groupWaiting');
  if (key === 'dead') return t('groupDead');
  if (key === 'recovered') return t('groupRecovered');
  const day = key.slice(4);
  const today = taipeiDayKey(new Date());
  const yesterday = taipeiDayKey(new Date(Date.now() - 86_400_000));
  const [, m, d] = day.split('-').map(Number);
  const name = day === today ? t('today') : day === yesterday ? t('yesterday') : `${m}/${d}（${dayLabel(day)}）`;
  return t('groupSettled', { day: name });
}

function groupSummary(key, slips) {
  const t = state.t;
  const cost = slips.reduce((s, x) => s + x.cost, 0);
  // Settled days: what they paid, never a net.
  if (key.startsWith('day|') || key === 'recovered') {
    const paid = slips.reduce((s, x) => s + (x.payout || 0), 0);
    return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupSlips', { n: slips.length })), paid > 0 ? el('strong', { class: 'back-high', text: t('groupPaid', { v: fmtMoney(paid, { sign: false }) }) }) : null]);
  }
  if (key === 'dead') return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupSlips', { n: slips.length }))]);
  const most = slips.reduce((s, x) => s + slipRange(x).most, 0);
  return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupCountCost', { n: slips.length, cost: fmtMoney(cost, { sign: false }) })), el('strong', { text: t('groupMost', { v: fmtMoney(most, { sign: false }) }) })]);
}

// The 紀錄 tab shows the slips, the stats or the mini games, one at a time
// (the games on their own, so a running one takes no room from the rest).
function applyHistoryView() {
  const t = state.t;
  if (!state.accountReady) return;
  const view = ['stats', 'tickets'].includes(state.historyView) ? state.historyView : 'slips';
  $('history-tabs').hidden = false;
  $('history-tabs').replaceChildren(
    ...['slips', 'tickets', 'stats'].map(key =>
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': String(key === view),
          onclick: () => {
            state.historyView = key;
            applyHistoryView();
            renderStats();
          }
        },
        [document.createTextNode(t(`historyView_${key}`))]
      )
    )
  );
  $('saved').hidden = view !== 'slips';
  $('stats').hidden = view !== 'stats';
  $('tickets').hidden = view !== 'tickets';
  if (view === 'tickets') lotteryUi?.renderTickets($('tickets-body'));
}

// 紀錄's lottery tickets (the 彩券 tab's “我的彩券” and notices lead here).
function showTickets() {
  state.historyView = 'tickets';
  showTab('history');
  applyHistoryView();
}

function renderSaved() {
  renderStats();
  if (!state.accountReady) return;
  const t = state.t;
  const slips = state.account.slips;
  const open = slips.filter(s => s.status === 'open');
  applyHistoryView();
  // No slips yet: a line and the way to the games, not an empty page.
  if (!slips.length)
    return void $('saved-body').replaceChildren(
      el('div', { class: 'card empty-slips' }, [el('p', { text: t('noSlipsYet') }), el('button', { class: 'primary-button', type: 'button', text: t('goPick'), onclick: () => showTab('games') })])
    );
  const now = Date.now();
  const filtered = slips.filter(HISTORY_FILTERS[state.historyFilter] ?? HISTORY_FILTERS.all);
  // Open slips all show; settled ones fold after SAVED_SHOWN.
  let settledShown = 0;
  const groups = new Map();
  for (const slip of filtered) {
    const key = slipGroupKey(slip, now);
    if ((key.startsWith('day|') || key === 'recovered') && !state.showAllSaved && settledShown++ >= SAVED_SHOWN) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slip);
  }
  const rank = key => ({ live: 0, waiting: 1, dead: 2, recovered: 4 })[key] ?? 3;
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
  const hidden = filtered.filter(s => s.status === 'settled').length - Math.min(settledShown, SAVED_SHOWN);
  const openCost = open.reduce((s, x) => s + x.cost, 0);
  const openMost = open.reduce((s, x) => s + slipRange(x).most, 0);
  const totalWon = slips.filter(s => s.status === 'settled').reduce((s, x) => s + (x.payout || 0), 0);
  // Right after a bet: the way straight back to the board.
  const placed = state.justPlaced && Date.now() - state.justPlaced.at < 5 * 60_000 ? state.justPlaced : null;
  $('saved-body').replaceChildren(
    placed
      ? el('div', { class: 'placed-card' }, [
          el('span', { class: 'placed-check', 'aria-hidden': 'true', text: '✓' }),
          el('span', { class: 'placed-main' }, [el('strong', { text: t('placedTitle') }), el('small', { text: placed.free ? t('placedSubFree', { v: fmtMoney(placed.free, { sign: false }) }) : t('placedSub', { n: placed.n, v: fmtMoney(placed.cost, { sign: false }) }) })]),
          el('button', { class: 'placed-go', type: 'button', text: `${t('placedMore')} ›`, onclick: () => ((state.justPlaced = null), showTab('games')) })
        ])
      : '',
    el('div', { class: 'saved-summary' }, [
      payCell(t('sumOpen'), t('sumSlips', { n: open.length })),
      payCell(t('sumAtStake'), fmtMoney(openCost, { sign: false })),
      payCell(t('sumMost'), fmtMoney(openMost, { sign: false })),
      payCell(t('sumWon'), fmtMoney(totalWon, { sign: false }), totalWon > 0 ? 'back-high' : '')
    ]),
    el('div', { class: 'saved-toolbar' }, [
      el('div', { class: 'chips history-filter', role: 'group', 'aria-label': t('savedTitle') },
        Object.keys(HISTORY_FILTERS).map(key =>
          chip({
            pressed: key === state.historyFilter,
            text: t(`filter_${key}`),
            count: String(slips.filter(HISTORY_FILTERS[key]).length),
            onclick: () => {
              state.historyFilter = key;
              state.showAllSaved = false;
              renderSaved();
            }
          })
        )
      ),
      open.length
        ? el('button', { class: 'ghost-button', type: 'button', disabled: state.checking ? '' : null, text: state.checking ? t('checking') : t('checkResults'), onclick: () => checkResults(true) })
        : null
    ]),
    ...(order.length
      ? order.map(key =>
          el('section', { class: `slip-group group-${key.split('|')[0]}` }, [
            el('div', { class: 'group-head' }, [el('h3', { text: groupTitle(key) }), groupSummary(key, groups.get(key))]),
            el('div', { class: 'saved-list' }, groups.get(key).map(savedSlipCard))
          ])
        )
      : [el('p', { class: 'muted', text: t('filterEmpty') })]),
    ...(hidden > 0 && !state.showAllSaved
      ? [el('button', { class: 'ghost-button', type: 'button', text: t('savedMore', { n: hidden }), onclick: () => ((state.showAllSaved = true), renderSaved()) })]
      : [])
  );
}

// ---- History: stats and analysis --------------------------------------------------

function table(head, rows) {
  return el('div', { class: 'table-view' }, el('table', {}, [
    el('thead', {}, el('tr', {}, head.map(h => el('th', { text: h })))),
    el('tbody', {}, rows.map(cells => el('tr', {}, cells.map(c => (c instanceof Node ? el('td', {}, c) : el('td', { text: c }))))))
  ]));
}

const fmtBack = v => (v == null ? '–' : fmtInt(Math.round(v)));
const fmtRate = v => (v == null ? '–' : fmtPctShort(v));
function netCell(v) {
  return el('span', { class: v < -0.5 ? 'back-low' : v > 0.5 ? 'back-high' : '', text: fmtMoney(v) });
}

function picksCard(s) {
  const t = state.t;
  if (!s.picks.legs) return null;
  const bandName = ([lo, hi]) => `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`;
  const kindName = k => (kindKey(k) ? t(kindKey(k)) : k);
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title', text: t('picksTitle') }),
    el('p', { class: 'lede', text: t('picksSummary', { n: fmtInt(s.picks.legs), won: fmtInt(s.picks.won), rate: fmtRate(s.picks.rate), exp: fmtRate(s.picks.expectedRate), odds: fmtOdds(s.picks.avgOdds), voids: fmtInt(s.picks.void) }) }),
    table([t('colChance'), t('colPicks'), t('colHit'), t('colExpectedHit')], s.bands.filter(b => b.legs).map(b => [bandName(b.range), fmtInt(b.legs), fmtRate(b.rate), fmtRate(b.expectedRate)])),
    el('p', { class: 'note', text: t('picksBandsNote') }),
    table([t('colMarket'), t('colPicks'), t('colHit'), t('colExpectedHit'), t('colAvgOdds')], s.byKind.map(k => [kindName(k.key), fmtInt(k.legs), fmtRate(k.rate), fmtRate(k.expectedRate), fmtOdds(k.avgOdds)]))
  ]);
}

function breakdownCard(s) {
  const t = state.t;
  const moneyRows = list => list.map(b => [b.name, fmtInt(b.slips), fmtMoney(b.staked, { sign: false }), netCell(b.net), fmtBack(b.back), fmtBack(b.expectedBack)]);
  const head = first => [first, t('colSlips'), t('colStaked'), t('colNet'), t('colBackActual'), t('colExpectedBack')];
  const sports = s.bySport.filter(b => b.slips).map(b => ({ ...b, name: b.key === 'mixed' ? t('sportMixed') : t(`sport_${b.key}`) }));
  const modes = s.byMode.map(b => ({ ...b, name: t(`slipMode_${b.key}`) }));
  const legs = s.byLegs.map(b => ({ ...b, name: t('legsN', { n: b.key }) }));
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title', text: t('breakdownTitle') }),
    el('p', { class: 'note', text: t('breakdownNote') }),
    table(head(t('colSport')), moneyRows(sports)),
    table(head(t('colMode')), moneyRows(modes)),
    table(head(t('colLegs')), moneyRows(legs))
  ]);
}

// Fun facts from the slips.
function funCard() {
  const t = state.t;
  const f = funFacts(state.account);
  const s = historyStats(state.account);
  const items = [];
  const leg = l => `${l.shortLabel}（${l.matchup}）`;
  if (f.upset) items.push(t('funUpset', { pick: leg(f.upset.leg), p: fmtPctShort(f.upset.chance), odds: fmtOdds(f.upset.leg.odds) }));
  if (f.heartbreak) items.push(t('funHeartbreak', { pick: leg(f.heartbreak.leg), p: fmtPctShort(f.heartbreak.chance) }));
  if (f.nearMiss) items.push(t('funNearMiss', { n: f.nearMiss.count, v: fmtMoney(f.nearMiss.missed, { sign: false }) }));
  if (f.team) items.push(t('funTeam', { team: f.team.name, n: f.team.picks, won: f.team.won, decided: f.team.decided }));
  if (f.market) items.push(t('funMarket', { market: marketTag(f.market.kind)?.textContent ?? f.market.kind, share: fmtPctShort(f.market.share) }));
  if (f.weekday) items.push(t('funWeekday', { day: formatter('weekdayLong', locale => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })).format(new Date(Date.UTC(2026, 0, 4 + f.weekday.day))), n: f.weekday.slips }));
  if (f.live) items.push(t('funLive', { n: f.live.picks, share: fmtPctShort(f.live.share) }));
  if (f.dream) items.push(t('funDream', { x: fmtInt(Math.round(f.dream.times)), cost: fmtMoney(f.dream.slip.cost, { sign: false }) }));
  if (s.settled && s.expectedLoss >= BOBA_PRICE) items.push(t('funBoba', { v: fmtMoney(s.expectedLoss, { sign: false }), cups: fmtInt(Math.round(s.expectedLoss / BOBA_PRICE)) }));
  if (!items.length) return null;
  return el('div', { class: 'card' }, [el('h3', { class: 'card-title', text: t('funTitle') }), el('ul', { class: 'facts' }, items.map(text => el('li', { text })))]);
}

// One person's betting in numbers (profile.mjs), the same card for you and
// for anyone in the simulated crowd: what they bought, how it went, their
// streaks and best and worst moments, and the traits their tickets show.
function profileCard(p, { weekLabel = w => state.t('simWeekN', { n: fmtCount(w + 1) }) } = {}) {
  const t = state.t;
  if (!p) return null;
  const money = v => fmtMoney(v, { sign: false });
  const line = (label, value, cls = '', note = null) => el('div', { class: 'player-line' }, [el('span', { text: label }), el('strong', { class: cls, text: value }), note ? el('small', { text: note }) : null]);
  return el('div', { class: 'profile' }, [
    el('div', { class: 'player-lines' }, [
      line(t('profTickets'), t('profTicketsV', { n: fmtCount(p.tickets), won: fmtCount(p.won) }), '', t('profHit', { v: fmtShare(p.hitRate) })),
      line(t('profBack'), p.back == null ? '–' : money(p.back), p.back != null && p.back < 100 ? 'back-low' : 'back-high', t('profPer100')),
      line(t('profStake'), money(p.avgStake), '', t('profMaxStake', { v: money(p.maxStake) })),
      line(t('profLegs'), p.avgLegs.toFixed(1), '', t('profSingles', { v: fmtShare(p.singleShare) })),
      line(t('profOdds'), `×${fmtOdds(p.avgOdds)}`, '', t('profChance', { v: fmtPctShort(p.avgChance) })),
      line(t('profBigWin'), p.biggestWin ? fmtMoney(p.biggestWin.net) : t('playerNoWin'), p.biggestWin ? 'back-high' : '', p.biggestWin ? t('profBigWinNote', { odds: fmtOdds(p.biggestWin.odds), legs: p.biggestWin.legs, week: weekLabel(p.biggestWin.w) }) : null),
      line(t('profStreaks'), t('profStreaksV', { won: fmtCount(p.longestWin), lost: fmtCount(p.longestLose) })),
      line(t('profNearMiss'), t('timesN', { n: fmtCount(p.nearMisses) })),
      p.bestWeek ? line(t('profBestWeek'), fmtMoney(p.bestWeek.net), 'back-high', weekLabel(p.bestWeek.w)) : null,
      p.worstWeek ? line(t('profWorstWeek'), fmtMoney(p.worstWeek.net), 'back-low', weekLabel(p.worstWeek.w)) : null,
      line(t('profPace'), t('profPaceV', { n: p.perWeek.toFixed(1) }), '', t('profWeeksPlayed', { n: fmtCount(p.weeksPlayed), of: fmtCount(p.weeks) }))
    ]),
    p.traits.length ? el('div', { class: 'player-tags' }, [el('small', { class: 'muted', text: t('profSeen') }), ...p.traits.map(key => el('span', { class: 'habit-tag trait-tag', title: t(`traitDesc_${key}`), text: `${TRAIT_ICON[key]} ${t(`trait_${key}`)}` }))]) : null
  ]);
}

// Your betting in the same numbers as the crowd's people.
function youCard() {
  const t = state.t;
  const p = ticketProfile(accountTickets(state.account));
  if (!p) return null;
  const first = state.account.slips.filter(s => s.status === 'settled').map(s => s.t).sort()[0];
  const weekLabel = w => fmtTime(new Date(Date.parse(first) + w * 7 * 86_400_000).toISOString()).split(' ')[0];
  return el('div', { class: 'card' }, [el('h3', { class: 'card-title', text: t('youProfileTitle') }), profileCard(p, { weekLabel })]);
}

// The account against the simulated crowd, over the same length of time.
// The crowd is simulated only here or on the simulator tab, never at start-up.
function crowdCard(s) {
  const t = state.t;
  const slips = state.account.slips;
  if (!slips.length || !state.data) return null;
  const firstMs = Math.min(...slips.map(x => Date.parse(x.t)));
  const accountWeeks = Math.max(1, (Date.now() - firstMs) / (7 * 86_400_000));
  const months = PERIOD_MONTHS.find(m => m >= Math.min(60, Math.ceil((accountWeeks * 12) / 52))) ?? 60;
  const weeks = monthWeeks(months);
  const sportBets = simSportBets();
  const crowd = crowdCache.get(crowdKey(sportBets, weeks));
  const title = el('h3', { class: 'card-title', text: t('crowdTitle', { n: fmtCount(SIM_PLAYERS_SHOWN), period: periodName(weeks) }) });
  if (!crowd) {
    crowdStats(sportBets, weeks, { quiet: true }).then(
      () => state.tab === 'history' && state.historyView === 'stats' && renderStats(),
      () => {}
    );
    return el('div', { class: 'card' }, [title, el('p', { class: 'muted crowd-wait' }, [el('span', { class: 'spinner small', 'aria-hidden': 'true' }), document.createTextNode(t('crowdRunning', { n: fmtCount(SIM_PLAYERS_SHOWN) }))])]);
  }
  const mine = s.net;
  const beat = crowdPercentile(crowd.finalQuantiles, mine);
  const crowdBack = crowd.totals.staked ? ((crowd.totals.staked + crowd.totals.net) / crowd.totals.staked) * 100 : null;
  const profile = ticketProfile(accountTickets(state.account));
  const perPerson = { tickets: crowd.totals.tickets / crowd.players, staked: crowd.totals.staked / crowd.players };
  const rows = [
    [t('crowdColNet'), fmtMoney(mine), fmtMoney(quantile(crowd.finalQuantiles, 0.5))],
    [t('crowdColBack'), s.settled ? fmtBack(s.back) : '–', fmtBack(crowdBack)],
    [t('crowdColSlips'), fmtInt(s.placed), fmtCount(perPerson.tickets)],
    [t('crowdColStaked'), fmtMoney(slips.reduce((x, y) => x + y.cost, 0), { sign: false }), fmtMoney(perPerson.staked, { sign: false })],
    [t('crowdColLegs'), profile ? profile.avgLegs.toFixed(1) : '–', crowd.crowd.avgLegs ? crowd.crowd.avgLegs.toFixed(1) : '–']
  ];
  // People in the crowd with the traits your tickets show.
  const like = (profile?.traits ?? []).map(key => crowd.traitSummaries.find(x => x.trait.key === key)).filter(Boolean);
  return el('div', { class: 'card crowd-card' }, [
    title,
    el('div', { class: 'crowd-hero' }, [
      el('strong', { text: fmtPctShort(beat) }),
      el('span', { text: t('crowdBeat', { n: fmtCount(SIM_PLAYERS_SHOWN), period: periodName(weeks) }) })
    ]),
    el('div', { class: 'crowd-bar', role: 'img', 'aria-label': t('crowdBeat', { n: fmtCount(SIM_PLAYERS_SHOWN), period: periodName(weeks) }) }, [el('span', { class: 'crowd-you', style: `left:${(beat * 100).toFixed(1)}%` })]),
    el('p', { class: 'crowd-scale muted' }, [el('span', { text: t('crowdWorst') }), el('span', { text: t('crowdBest') })]),
    table([t('crowdColWhat'), t('crowdColYou'), t('crowdColCrowd')], rows),
    like.length
      ? el('ul', { class: 'facts crowd-like-list' }, like.map(x => el('li', {}, [el('span', { class: 'crowd-like-icon', 'aria-hidden': 'true', text: TRAIT_ICON[x.trait.key] }), document.createTextNode(t('crowdLikeTrait', { trait: t(`trait_${x.trait.key}`), ahead: fmtPctShort(x.aheadShare), final: fmtMoney(x.avgFinal), period: periodName(weeks) }))])))
      : null,
    el('ul', { class: 'facts' }, [
      el('li', { text: t('crowdAhead', { share: fmtPctShort(crowd.totals.aheadShare), period: periodName(weeks) }) }),
      el('li', { text: t('crowdNote', { weeks: fmtCount(Math.max(1, Math.round(accountWeeks))) }) })
    ])
  ]);
}

function renderStats() {
  // Drawn only when on screen: it can start the crowd simulation.
  if (!state.accountReady || state.tab !== 'history' || state.historyView !== 'stats') return;
  $('stats').hidden = false;
  statsUi.render($('stats-body'));
}

// ---- Simulator ----------------------------------------------------------------

// What the crowd bets on, per sport: this board's options as they are (the
// same options you see, by board.mjs), or a typical week (made-up games run
// through the same code) for a sport with nothing on today. Every sport is
// simulated, whatever the sport filter shows. A sport whose pool returns
// clearly more or less than the rest is flagged (audit.mjs).
function simSportBets() {
  if (state.simBets?.bets === state.bets) return state.simBets.pools;
  const pools = Object.fromEntries(
    SPORTS.map(sport => {
      const bets = crowdPool(state.bets.filter(b => b.sport === sport), effectiveOdds);
      const games = new Set(bets.map(b => b.gameId)).size;
      return [sport, games >= (SIM_SPORTS[sport].family === 'racing' ? 1 : 2) ? bets : sportTemplate(sport)];
    })
  );
  const flagged = auditPools(pools);
  if (flagged.length) console.warn('Simulator pools out of line with the rest:', flagged);
  state.simBets = { bets: state.bets, pools };
  return pools;
}

function fmtShare(p) {
  if (p === 0) return '0%';
  if (p < 0.01) return '<1%';
  return `${Math.round(p * 100)}%`;
}

function fmtCount(n) {
  return fmtInt(Math.round(n));
}

// ---- Crowd simulation: worker, cache and loading screen ----------------------

// Results per pool and period. The 100,000-player run is the slow part, so it
// runs once per period in a background worker, and only when it's shown.
const crowdCache = new Map();
let crowdJob = null;
let worker = null;

// A short key for a pool and period (the pool itself is large).
const poolKeys = new WeakMap();
function crowdKey(sportBets, weeks) {
  if (!poolKeys.has(sportBets)) poolKeys.set(sportBets, String(hashString(JSON.stringify(sportBets))));
  return `${weeks}|${poolKeys.get(sportBets)}`;
}

// The loading screen: the Quadra one, the same in every app (icon, name,
// spinner, nothing more). Callers still pass what's loading and how far
// along; it isn't shown.
function showLoading() {
  $('loading').hidden = false;
  $('loading-error').hidden = true;
  $('loading-spinner').hidden = false;
}

function hideLoading() {
  $('loading').hidden = true;
}

// Runs (or reuses) the simulation for this pool and period. A new request
// cancels a running one, so no power goes to a result nobody will see.
// `quiet`: run without the loading screen (the history tab's comparison).
function crowdStats(sportBets, weeks, { quiet = false } = {}) {
  const key = crowdKey(sportBets, weeks);
  const startWeek = weekOfYear(new Date());
  if (crowdCache.has(key)) return Promise.resolve(crowdCache.get(key));
  if (crowdJob?.key === key) return crowdJob.promise;
  if (crowdJob) {
    worker?.terminate();
    worker = null;
    crowdJob.reject(new Error('cancelled'));
  }
  // The loading screen (the plain Quadra one) while it runs.
  const report = quiet ? () => {} : () => showLoading();
  report(0);
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  crowdJob = { key, promise, reject };
  // Every period the run answered (a 1-year run also gives 1, 3 and 6 months).
  const done = results => {
    for (const [w, stats] of Object.entries(results)) crowdCache.set(crowdKey(sportBets, Number(w)), stats);
    crowdJob = null;
    if (!quiet) hideLoading();
    resolve(results[weeks]);
  };
  try {
    worker ??= new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.id !== key) return;
      if (data.results) done(data.results);
      else report(data.progress);
    };
    worker.onerror = () => {
      worker = null;
      runHere();
    };
    worker.postMessage({ id: key, sportBets, startWeek, weeks, perGroup: PER_GROUP, seed: SIM_SEED });
  } catch {
    runHere();
  }
  // No worker (very old browser): run here after the loading screen paints.
  function runHere() {
    const sportPools = Object.fromEntries(Object.entries(sportBets).map(([sport, bets]) => [sport, crowdPools(bets)]));
    const checkpoints = [...MONTH_WEEKS.filter(w => w <= weeks), weeks];
    setTimeout(() => done(simulateCrowd({ sportPools, startWeek, weeks, checkpoints, perGroup: PER_GROUP, seed: SIM_SEED }).results), 30);
  }
  return promise;
}

// Kept from the simulator: its traits' icons, the bubble-tea yardstick, a sparkline.
const TRAIT_ICON = {
  favorite: '📣', underdog: '🎯', value: '🧮', exotic: '🎲', single: '1️⃣', parlay: '🎰', whale: '🐋', small: '🪙', daily: '📅', rare: '🌙',
  tilt: '🔥', chaser: '🔁', cashOut: '💰', streaky: '🍀', pressOn: '🚀', revenge: '😤', heartbroken: '💔', soClose: '😣', jackpot: '🌠',
  rider: '⛄', guardian: '🛡️', stopLoss: '🛑', content: '😊', moody: '🎭', bored: '🥱', hailMary: '🙏', loyal: '❤️', hopper: '🦘', plainStyle: '😐', plainReact: '😐'
};
const BOBA_PRICE = 65;

// ---- Number fields ---------------------------------------------------------------------

// Numbers are typed on the phone's own number keyboard, as in Quadra
// Securities (inputmode numeric, no autocomplete), not a pad of the page's
// own: digits only, at most `digits` of them; Enter (the keyboard's Go/Done)
// runs `onEnter`, and leaving the field commits it (its change event).
function numberField(input, { digits = 7, onEnter = null } = {}) {
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', onEnter ? 'go' : 'done');
  input.setAttribute('pattern', '[0-9]*');
  input.addEventListener('input', () => {
    const clean = input.value.replace(/\D/g, '').slice(0, digits);
    if (clean !== input.value) input.value = clean;
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onEnter ? onEnter(input.value) : input.blur();
  });
}

// F1: one card, a tab per market (the winner, places, head to heads, the
// winning team, and safety car, VSC and red flag each on their own).
const FLAG_ICON = { f1sc: '🚗', f1vsc: '🟨', f1red: '🟥' };
const F1_TABS = [
  { kind: 'f1', tab: 'f1WinnerTab', sub: null, notes: ['f1Intro', 'f1PhaseNote'] },
  { kind: 'f1pole', tab: 'f1PoleShort', sub: 'f1PoleSub', notes: ['f1PoleNote'], shown: 10 },
  { kind: 'f1podium', tab: 'f1PodiumShort', sub: 'f1PodiumSub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1top6', tab: 'f1Top6Short', sub: 'f1Top6Sub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1top10', tab: 'f1Top10Short', sub: 'f1Top10Sub', notes: ['f1PodiumNote'], shown: 12 },
  { kind: 'f1h2h', tab: 'f1H2HShort', sub: 'f1H2HSub', notes: ['f1PodiumNote'], shown: 10 },
  { kind: 'f1team', tab: 'f1TeamShort', sub: 'f1TeamSub', notes: ['f1PodiumNote'] },
  { kind: 'f1sc', tab: 'f1Sc', sub: 'f1ScSub', notes: ['f1FlagsNote'], flag: true },
  { kind: 'f1vsc', tab: 'f1Vsc', sub: 'f1VscSub', notes: ['f1FlagsNote'], flag: true },
  { kind: 'f1red', tab: 'f1Red', sub: 'f1RedSub', notes: ['f1FlagsNote'], flag: true }
];
function renderF1() {
  const t = state.t;
  const f1 = state.data.f1;
  $('f1').hidden = !inSport('f1') || !f1;
  if (!f1) return;
  const tabs = F1_TABS.filter(x => state.bets.some(b => b.kind === x.kind));
  if (!tabs.length) return $('f1-body').replaceChildren();
  const current = tabs.find(x => x.kind === state.f1Tab) ?? tabs[0];
  const list = state.bets.filter(b => b.kind === current.kind);
  // How many picks of each market are on the slip: a dot on its tab.
  const picked = kind => state.parlay.some(id => state.bets.find(b => b.id === id)?.kind === kind);
  const tabRow = el(
    'div',
    { class: 'segmented market-tabs', role: 'tablist', 'aria-label': t('moreMarkets') },
    tabs.map(x =>
      el('button', {
        type: 'button',
        role: 'tab',
        class: picked(x.kind) ? 'has-pick' : '',
        'aria-selected': String(x === current),
        'aria-pressed': String(x === current),
        text: t(x.tab),
        onclick: () => {
          state.f1Tab = x.kind;
          renderF1();
        }
      })
    )
  );
  requestAnimationFrame(() => {
    const on = tabRow.querySelector('[aria-selected="true"]');
    if (on && tabRow.scrollWidth > tabRow.clientWidth) tabRow.scrollLeft = Math.max(0, on.offsetLeft - (tabRow.clientWidth - on.offsetWidth) / 2);
  });
  const badge = b => (current.flag ? el('span', { class: 'flag-badge', 'aria-hidden': 'true', text: FLAG_ICON[b.kind] }) : b.kind === 'f1team' ? constructorBadge(b.team) : driverBadge(b));
  const sub = b => (current.flag ? null : b.kind === 'f1team' ? '' : b.kind === 'f1h2h' ? `vs ${b.rivalLabel}` : b.driver.team);
  $('f1-body').replaceChildren(
    board({
      emblem: 'f1',
      title: raceName(f1.title, state.locale),
      sub: `${fmtTime(f1.startUtc)} · ${t(f1.phase === 'pre' ? 'f1PhasePre' : 'f1PhasePost')}`,
      tabs: tabRow,
      lead: current.sub ? t(current.sub) : null,
      bets: list,
      id: current.kind,
      shown: current.shown ?? Infinity,
      rows: (b, i) => entryRow(b, i, badge(b), sub(b))
    })
  );
}

// ============================================================================
// DO NOT REMOVE - iOS Safari "a tap needs two taps" fix (from Quadra Fixtures).
// ============================================================================
// Empty, passive, page-wide touch/pointer listeners. They do nothing; their
// existence is the fix. iOS WebKit handles a tap differently depending on
// whether the spot touched has touch/pointer listeners; with listeners only
// on some elements (the mini games' canvases and pads) a
// gesture there can leave its tap handling stuck, and the next tap
// elsewhere is used up clearing it. With listeners on the whole document
// every tap goes down the same path. Passive, so they never block
// scrolling. Chromium never reproduces this, so no test can catch it.
['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'pointercancel'].forEach(type => {
  document.addEventListener(type, () => {}, { capture: true, passive: true });
});

// ---- Boot ---------------------------------------------------------------------

function renderAll() {
  renderStatic();
  if (!state.data) return;
  state.bets = buildBets(state.data);
  state.futures = buildFutures(state.data);
  state.recs = recommend(state.bets);
  state.parlay = state.parlay.filter(id => slipCandidates().some(b => b.id === id));
  renderStatus('ok');
  renderTabs();
  renderSportFilter();
  renderDayFilter();
  renderGames();
  renderFutures();
  renderParlay();
  renderF1();
  if (state.tab === 'home') renderHome(homeCtx());
  renderAccount();
  renderSaved();
  warmImages();
}

// Start-up keeps the loading screen until the board is really there: the
// main odds, every other league (each drawn as it arrives) and the games in
// play, within BOOT_FULL_MS, then the logos in view.
// Everything a scroll or a tab away (championship boards, their club logos,
// the other tabs' pictures) loads in the background after the page opens.
// The page never opens empty: past BOOT_LIMIT_MS (a very slow connection)
// it opens with whatever has arrived.
const BOOT_LIMIT_MS = 45_000;
// The whole board (every league) before the loading screen goes, at most.
const BOOT_FULL_MS = 9_000;
// The first screen's logos (only those in view), at most.
const BOOT_IMAGES_MS = 2_500;
// A saved board waits this long at most for the balance and the live games.
const SNAPSHOT_WAIT_MS = 3_000;
const within = (promise, ms, fallback) => Promise.race([Promise.resolve(promise).catch(() => fallback), new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);
// Every picture on screen in `root` loaded (or failed): no logo pops in as
// the page opens. Pictures further down wait for their turn (lazy), then
// warmImages fetches them in the background.
function imagesReady(root) {
  const bottom = window.innerHeight;
  const images = [...(root?.querySelectorAll('img') || [])].filter(img => {
    if (!img.getAttribute('src') || img.complete) return false;
    const box = img.getBoundingClientRect();
    return box.height > 0 && box.top < bottom && box.bottom > 0;
  });
  return Promise.all(
    images.map(img => {
      img.loading = 'eager';
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })
  );
}

// Every logo on the page (other tabs, further down, dark-mode versions)
// fetched quietly a few at a time once the first screen is up, so a tab or
// a scroll finds them already loaded.
const warmed = new Set();
let warmTimer = null;
function warmImages() {
  if (state.booting) return;
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    const urls = new Set();
    for (const img of document.querySelectorAll('main img[src]')) if (!img.complete) urls.add(img.src);
    for (const source of document.querySelectorAll('main picture source[srcset]')) if (matchMedia(source.media || 'all').matches) urls.add(source.srcset);
    const queue = [...urls].filter(u => !warmed.has(u));
    queue.forEach(u => warmed.add(u));
    const next = () => {
      const url = queue.shift();
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = next;
      img.src = url;
    };
    for (let i = 0; i < 6; i++) next();
  }, 300);
}

// The last board, kept on the device: the page opens on it at once and
// swaps in today's odds when they arrive (bets wait for those). Tied to
// its shape (SNAPSHOT_V: bump it when state.data's shape changes), not to the
// deploy: tying it to the deploy made every open after a new version a cold
// start of many seconds.
const SNAPSHOT_KEY = 'oddsStudy.board';
const SNAPSHOT_V = 2;
const SNAPSHOT_MAX_AGE_MS = 24 * 3_600_000;
function readSnapshot() {
  try {
    const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
    if (!saved?.data?.games || saved.v !== SNAPSHOT_V || !(Date.now() - saved.at < SNAPSHOT_MAX_AGE_MS)) return null;
    return saved.data;
  } catch {
    return null;
  }
}
let snapshotTimer = null;
function saveSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    if (!state.data || state.fromSnapshot) return;
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ v: SNAPSHOT_V, at: Date.now(), data: state.data }));
    } catch {
      try {
        localStorage.removeItem(SNAPSHOT_KEY);
      } catch {}
    }
  }, 1000);
}

async function load() {
  const startedAt = Date.now();
  renderStatus('loading');
  const booting = state.booting;
  const onProgress = booting ? () => showLoading() : undefined;
  if (booting) onProgress(0);
  const open = () => {
    if (!state.booting) return;
    state.booting = false;
    hideLoading();
    warmImages();
  };
  // Past the limit the page opens with whatever has arrived; the rest joins as it comes.
  const limit = booting
    ? setTimeout(() => {
        if (state.data) renderAll();
        open();
      }, BOOT_LIMIT_MS)
    : null;
  $('refresh').disabled = true;
  // The last board saved opens the page at once (boot drew it while signing
  // in); today's replaces it below.
  const saved = booting && state.fromSnapshot ? state.data : null;
  // The first screen is the balance and the games on now as well as the
  // board: the loading screen waits for the account (read and merged with
  // the pass) and the live games too.
  const firstScreen = () => Promise.all([state.accountIn, refreshLive()]);
  if (saved) {
    // The saved board opens once those are in (a second or so, never more
    // than SNAPSHOT_WAIT_MS), while today's board loads behind it.
    within(firstScreen(), SNAPSHOT_WAIT_MS).then(() => {
      clearTimeout(limit);
      if (state.tab === 'home') renderHome(homeCtx());
      open();
    });
  }
  try {
    // The main board first (the request queue serves it before anything else).
    const now = new Date();
    const fresh = await loadOdds(now, saved ? undefined : onProgress);
    const addGames = games => {
      if (!games.length || !state.data) return;
      const ids = new Set(state.data.games.map(g => g.id));
      state.data.games = [...state.data.games, ...games.filter(g => !ids.has(g.id))].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    };
    // The other leagues join one by one as each is read (a slow one holds
    // back no other), drawn together a moment after the last to arrive.
    const pending = [];
    let joining = false;
    let drawTimer = 0;
    const join = () => {
      if (!joining || !pending.length) return;
      addGames(pending.splice(0));
      clearTimeout(drawTimer);
      drawTimer = setTimeout(() => {
        renderAll();
        openWantedGame();
      }, 250);
    };
    const extraGames = loadExtraLeagues(now, games => (pending.push(...games), join())).catch(error => (console.error(error), []));
    // Their scoreboards tell which leagues have a game on: the live board again.
    extraGames.then(() => {
      state.boardComplete = true;
      refreshLive();
    });
    const extraFutures = loadExtraFutures().catch(error => (console.error(error), []));
    if (saved) {
      // Swapped in whole (every league's games at once), so the list doesn't
      // shrink to the main leagues and grow back.
      const games = await within(extraGames, BOOT_LIMIT_MS, []);
      const ids = new Set(fresh.games.map(g => g.id));
      fresh.games = [...fresh.games, ...(games || []).filter(g => !ids.has(g.id))].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
      const futures = await within(extraFutures, 4000, null);
      if (futures) {
        const keys = new Set(fresh.futures.map(f => f.key));
        fresh.futures = [...fresh.futures, ...futures.filter(f => !keys.has(f.key))];
      }
      state.data = fresh;
      state.fromSnapshot = false;
      renderAll();
      openWantedGame();
      warmImages();
      saveSnapshot();
      if (!futures)
        extraFutures.then(async more => {
          const keys = new Set(state.data.futures.map(f => f.key));
          state.data.futures = [...state.data.futures, ...more.filter(f => !keys.has(f.key))];
          renderAll();
          saveSnapshot();
          await loadFutureTeams(state.data.futures).catch(() => {});
          renderFutures();
          warmImages();
        });
      else loadFutureTeams(state.data.futures).then(() => (renderFutures(), warmImages())).catch(() => {});
      return;
    }
    state.data = fresh;
    joining = true;
    join();
    // A tab asked for in the address (#sim) that needed the odds opens now.
    if (state.wantedTab && state.tab !== state.wantedTab && tabAvailable(state.wantedTab)) state.tab = state.wantedTab;
    state.wantedTab = null;
    const addFutures = futures => {
      if (!futures.length || !state.data) return;
      const keys = new Set(state.data.futures.map(f => f.key));
      state.data.futures = [...state.data.futures, ...futures.filter(f => !keys.has(f.key))];
    };
    renderAll();
    openWantedGame();
    if (booting) {
      // The loading screen stays until the whole board is in: every league
      // and the games in play (each league drawn as it arrives, behind it),
      // then the logos of the first screen; past BOOT_FULL_MS it opens with
      // what has come and the rest keeps joining.
      await within(Promise.all([extraGames, firstScreen()]), Math.max(1_000, BOOT_FULL_MS - (Date.now() - startedAt)));
      clearTimeout(drawTimer);
      renderAll();
      openWantedGame();
      await within(imagesReady($('panel-' + state.tab)), BOOT_IMAGES_MS);
      clearTimeout(limit);
      open();
    }
    // Once every league is in: kept for the next visit.
    extraGames.then(() => {
      warmImages();
      saveSnapshot();
    });
    extraFutures.then(async futures => {
      addFutures(futures);
      renderAll();
      saveSnapshot();
      // The clubs' logos: ESPN's team lists for the boards' leagues, then the boards again.
      await loadFutureTeams(state.data.futures).catch(() => {});
      renderFutures();
      warmImages();
    });
  } catch (error) {
    console.error(error);
    renderStatus('error');
  } finally {
    clearTimeout(limit);
    open();
    $('refresh').disabled = false;
  }
}

// ---- Tabs ---------------------------------------------------------------------

const TABS = ['home', 'games', 'lottery', 'slip', 'history'];

function tabAvailable(tab) {
  if (!state.data) return tab !== 'slip';
  return true;
}

const TAB_ICONS = { home: 'home', games: 'calendar', lottery: 'balls', slip: 'ticket', history: 'history' };
const tabNav = tabBar({ tabs: TABS.map(id => ({ id, label: state.t(`tab_${id}`), icon: TAB_ICONS[id] })), onSelect: (tab, { again }) => !again && showTab(tab) });
function renderTabs() {
  if (!tabAvailable(state.tab)) state.tab = 'home';
  tabNav.badge('slip', state.parlay.length, { tone: 'accent' });
  for (const tab of TABS) tabNav.hide(tab, !tabAvailable(tab));
  // Every tab starts at its top: what was opened on it folds when it's left.
  tabNav.select(state.tab, { top: true });
}

// The simulated period as pills; the hidden select keeps the value.
// "1 個月", "半年", "1 年 3 個月", "5 年": a period of whole months.
function periodName(weeks) {
  const t = state.t;
  const months = PERIOD_MONTHS[MONTH_WEEKS.indexOf(weeks)] ?? Math.round((weeks * 12) / 52);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y && m === 6) return t('periodHalf');
  const part = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
  return [y ? part(y, 'periodYear', 'periodYears') : '', m ? part(m, 'periodMonth', 'periodMonths') : ''].filter(Boolean).join(' ');
}

// Everything opened on a tab folds back when you leave it (a game's 更多玩法,
// every folding card), so coming back starts tidy, not where you left off.
function collapseAll() {
  const had = state.open.size > 0 || state.dayPicked;
  state.open.clear();
  // Back to the earliest day as well.
  state.dayPicked = false;
  for (const d of document.querySelectorAll('.tab-panel details[open]')) d.open = false;
  if (had && state.data) {
    renderDayFilter();
    renderGames();
  }
}

function showTab(tab) {
  if (tab !== state.tab) collapseAll();
  state.tab = tab;
  renderTabs();
  renderSlipBar();
  if (tab === 'home') renderHome(homeCtx());
  if (tab === 'lottery') lotteryUi?.render();
  if (tab === 'history') {
    checkResults();
    renderStats();
  }
}

$('game-search').addEventListener('input', event => {
  state.query = event.target.value.trim();
  if (state.data) renderGames();
});
{
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) state.tab = state.wantedTab = fromHash;
  if (fromHash === 'tickets') ((state.tab = state.wantedTab = 'history'), (state.historyView = 'tickets'));
  // #game=<id>: Quadra Fixtures' "bet on this" opens that game (the address
  // can also carry Fixtures' sign-in, "&qh=…", taken out by the kit).
  const wanted = hashGame(fromHash);
  if (wanted) state.wantedGame = wanted;
}
window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  // A notice's tap: its tab, or 紀錄's tickets.
  if (hash === 'tickets') return showTickets();
  if (TABS.includes(hash)) return showTab(hash);
  const wanted = hashGame(hash);
  if (!wanted) return;
  state.wantedGame = wanted;
  openWantedGame();
});
// "game=<id>" (a game, or f1 / f1pole), or "league=<key>" (a league's board:
// a fight card, a tennis draw), as the wanted game ("league:<key>" for the latter).
function hashGame(hash) {
  const parts = String(hash || '').split('&');
  const game = parts.find(p => p.startsWith('game='));
  if (game) return decodeURIComponent(game.slice(5));
  const league = parts.find(p => p.startsWith('league='));
  return league ? `league:${decodeURIComponent(league.slice(7))}` : null;
}

// Opens the game asked for in the address: its day and sport, its card
// open with every market, scrolled into view.
// The games tab on one league (the wanted game's, when it can't be found),
// its live games first, with a line saying why (`note`).
function showLeague(key, note = '') {
  state.wantedGame = null;
  state.wantedNote = note;
  state.tab = 'games';
  state.sport = LEAGUES[key] || key === 'f1' ? key : 'all';
  state.dayPicked = false;
  state.query = '';
  renderAll();
  renderWantedNote();
  showTab('games');
  const live = state.liveGames.some(g => g.sport === key);
  requestAnimationFrame(() => $(live ? 'live' : 'games')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

function openWantedGame() {
  const id = state.wantedGame;
  if (!id || !state.data) return;
  if (id.startsWith('league:')) {
    // Once its games are on the board (the other leagues come in after the main board).
    const key = id.slice(7);
    const has = state.data.games.some(g => g.sport === key) || state.liveGames.some(g => g.sport === key);
    if (has) return showLeague(key);
    if (state.boardComplete && state.liveAt) return showLeague('all', state.t('wantedGone', { league: state.t(`sport_${key}`) }));
    return;
  }
  // F1 from Quadra Fixtures ("f1", or "f1pole" for qualifying): the race's board.
  if (/^f1(pole)?$/.test(id || '') && state.data?.f1) {
    state.wantedGame = null;
    state.tab = 'games';
    state.day = dayKey(state.data.f1.startUtc);
    state.dayPicked = true;
    state.sport = 'all';
    if (id === 'f1pole' && state.bets.some(b => b.kind === 'f1pole')) state.f1Tab = 'f1pole';
    renderAll();
    showTab('games');
    requestAnimationFrame(() => $('f1')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    return;
  }
  // By id; or, from Quadra Fixtures, the same league and teams (a start
  // time moved since leaves the id's hour behind), or teams sharing a name
  // word each (sources spell clubs differently: "Uni-President Lions",
  // "Uni Lions").
  const [sport, hour, away, home] = String(id || '').split('_');
  const near = (name, want = '') => {
    const key = normalizeTeamName(name);
    const flat = key.replace(/\s+/g, '');
    return Boolean(want) && (flat === want || want.includes(flat) || flat.includes(want) || key.split(' ').some(w => w.length >= 4 && want.includes(w)));
  };
  // Players (tennis, fights…) in either order: the two sources list them differently.
  const sides = g => (near(g.away.en, away) && near(g.home.en, home)) || (isNeutral(sport) && near(g.away.en, home) && near(g.home.en, away));
  // Within half a day of the id's hour: the same clubs meet again the next
  // day in a baseball series, and that's another game.
  const near12 = g => !hour || Math.abs(Date.parse(g.startUtc) - Date.parse(`${hour}:00:00Z`)) < 12 * 3_600_000;
  const alike = g => g.sport === sport && sides(g) && near12(g);
  const game =
    id &&
    (state.data?.games.find(g => g.id === id || g.id.toLowerCase() === id.toLowerCase()) ||
      state.data?.games.find(g => g.sport === sport && g.id.endsWith(`_${away}_${home}`) && near12(g)) ||
      state.data?.games.find(alike));
  // Under way: its live card (the board can still hold it from before the start).
  const live = id ? state.liveGames.find(alike) : null;
  if (live) {
    state.wantedGame = null;
    state.tab = 'games';
    state.sport = 'all';
    state.day = dayKey(new Date().toISOString());
    state.dayPicked = true;
    state.open.add(live.id);
    renderAll();
    showTab('games');
    requestAnimationFrame(() => document.querySelector(`[data-game="${CSS.escape(live.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return;
  }
  if (!game) {
    // Every league and the games in play read, and still not there (over,
    // not on sale yet, or no live price right now): its league's board, and why.
    if (!state.boardComplete || !state.liveAt) return;
    const league = state.t(`sport_${sport}`);
    const started = hour && Date.parse(`${hour}:00:00Z`) < Date.now();
    return showLeague(LEAGUES[sport] ? sport : 'all', state.t(started ? 'wantedNoLive' : 'wantedGone', { league: LEAGUES[sport] ? league : '' }));
  }
  state.wantedGame = null;
  state.wantedNote = '';
  state.tab = 'games';
  state.day = dayKey(game.startUtc);
  state.dayPicked = true;
  state.sport = 'all';
  state.open.add(game.id);
  renderAll();
  showTab('games');
  requestAnimationFrame(() => document.querySelector(`[data-game="${CSS.escape(game.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

// Redraw only when the width changes: phones fire resize when the address bar
// slides away, and that shouldn't reset the chart.
let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
  }, 150);
});

// The same top-right in every Quadra app: help, refresh, then the account.
topActions(q, { refresh: load });

// Big numbers on one line: each of these shrinks its font (down to 60%) to
// fit its box, instead of wrapping onto a second row on phones. Checked when
// its text changes and when its box resizes (which also covers a tab showing
// it for the first time). Only the slip and simulator
// have such numbers. All reads, then all writes, so the page lays out once.
const FIT_SELECTOR = '.stat-value, .player-line strong, .lapse-stats strong, .story-big, .buy strong, .you-end';
function fitNumbers(nodes) {
  for (const node of nodes) node.style.fontSize = '';
  const sizes = nodes.map(node => {
    const box = node.clientWidth;
    const need = node.scrollWidth;
    if (!box || need <= box + 0.5) return null;
    const full = parseFloat(getComputedStyle(node).fontSize);
    return Math.max(full * 0.6, Math.floor(((full * box) / need) * 10) / 10);
  });
  nodes.forEach((node, i) => sizes[i] && (node.style.fontSize = `${sizes[i]}px`));
}
if ('ResizeObserver' in window) {
  const fitted = new WeakSet();
  const resized = new ResizeObserver(entries => fitNumbers(entries.map(entry => entry.target)));
  const watch = new MutationObserver(mutations => {
    const found = new Set();
    for (const m of mutations) {
      const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!target) continue;
      const own = target.closest(FIT_SELECTOR);
      if (own) found.add(own);
      else for (const node of target.querySelectorAll(FIT_SELECTOR)) found.add(node);
    }
    for (const node of found) {
      if (fitted.has(node)) continue;
      fitted.add(node);
      resized.observe(node);
    }
    if (found.size) fitNumbers([...found]);
  });
  for (const id of ['panel-slip', 'panel-history']) watch.observe($(id), { childList: true, subtree: true, characterData: true });
}

// Tells the page's failsafe (in index.html) that the scripts loaded and started.
window.__oddsStarted = true;
// Phones and tablets: from the home screen only. Always the newest deploy.
const gated = installGate('odds', state.locale);
watchUpdates({ current: document.querySelector('meta[name="build-version"]')?.content, key: 'oddsStudy', cachePrefix: 'quadra-odds-' });
renderStatic();
renderTabs();
q.on('wallet', wallet => {
  state.wallet = wallet;
  renderAccount();
  renderParlay();
});
q.on('active', live => {
  if (!live) return;
  syncNow();
  if (state.data) checkResults(true);
});

// What a parlay of these picks pays if all win (after tax, boost included).
function parlayPays(bets, stake) {
  const legs = bets.map(b => ({ gameId: b.gameId, market: b.market ?? b.kind, odds: effectiveOdds(b) }));
  return slipPayoutTable({ legs, sizes: [legs.length], stake, boost: boostX() }).net[(1 << legs.length) - 1];
}

// What the home tab and the lottery need from here.
function homeCtx() {
  // A ready-made parlay onto the slip in one tap (replacing what's there).
  const takeParlay = ids => {
    state.parlay = [...ids];
    state.slipMode = 'parlay';
    state.modeChosen = false;
    renderGames();
    renderParlay();
    showTab('slip');
  };
  // A live game's card on the games tab, open with its markets (null: the live list's top).
  const openLive = id => {
    state.tab = 'games';
    state.sport = 'all';
    state.query = '';
    state.day = dayKey(new Date().toISOString());
    state.dayPicked = true;
    if (id) state.open.add(id);
    renderAll();
    showTab('games');
    requestAnimationFrame(() => (id ? document.querySelector(`[data-game="${CSS.escape(id)}"]`) : $('live'))?.scrollIntoView({ block: id ? 'center' : 'start', behavior: 'smooth' }));
  };
  return { state, q, el, fmtMoney, fmtOdds, fmtTime, pickTitle, pickButton, teamName, gameSeries, matchupText, logoImg, leagueImg, toggleLeg, takeParlay, showTab, openGame: id => ((state.wantedGame = id), openWantedGame()), openLive, liveStateText, betKeys, track, funds, slipRange, cashOutPrice, doCashOut, leagueTier: shownTier, isSoccer, isNeutral, parlayPays, boostPct: n => Math.round(boostRate(n, boostX()) * 100) };
}
statsUi = mountStats({ state, el, svgEl, fmtMoney, fmtInt, fmtPctShort, fmtOdds, fmtTime, showTab, sportName: key => (key === 'mixed' ? state.t('sportMixed') : state.t(`sport_${key}`) === `sport_${key}` ? String(key).toUpperCase() : state.t(`sport_${key}`)), youCard, crowdCard, funCard, picksCard, breakdownCard });
lotteryUi = mountLottery({ state, q, el, fmtMoney, funds, commitAccount, track, getAccount: () => state.account, syncNow, showTickets });

// The saved board, drawn while signing in (a network round trip).
function drawSnapshot() {
  const saved = storedAccount() ? readSnapshot() : null;
  if (!saved) return;
  try {
    state.data = saved;
    state.fromSnapshot = true;
    if (state.wantedTab && tabAvailable(state.wantedTab)) state.tab = state.wantedTab;
    state.wantedTab = null;
    renderAll();
    openWantedGame();
  } catch (error) {
    // A saved board this version can't draw: a normal start.
    console.error(error);
    state.data = null;
    state.fromSnapshot = false;
  }
}
async function boot() {
  let accountDone;
  state.accountIn = new Promise(resolve => (accountDone = resolve));
  drawSnapshot();
  const first = await q.start();
  state.wallet = first.wallet || q.wallet;
  const loading = load();
  state.account = await loadAccount();
  state.accountReady = true;
  if (first && !first.offline) await mergeFirst(first);
  if (!state.account) {
    state.account = freshAccount();
    saveAccountLocal();
  }
  applyGrant();
  renderAccount();
  renderSaved();
  lotteryUi.render();
  if (state.tab === 'home' && state.data) renderHome(homeCtx());
  accountDone();
  syncNow();
  await loading;
  checkResults();
  if (state.tab === 'home') renderHome(homeCtx());
}
if (!gated) boot();
// Open slips with games in play update every 30 seconds while 紀錄 is on screen.
setInterval(() => {
  if (document.visibilityState === 'visible' && state.tab === 'history' && state.data) checkResults();
}, LIVE_REFRESH_MS);

// Back on the tab: pick up what another device did, and any games that ended.
// After ten minutes or more away, everything opened is folded again.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) collapseAll();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  applyGrant();
  syncNow();
  if (state.tab === 'history') checkResults();
});

// Offline and installable: the page's own files, kept by the service worker.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(reg => {
      const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name)].filter(u => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'cache', urls });
    })
    .catch(() => {});
}
