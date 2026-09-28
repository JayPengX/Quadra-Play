import {
  FUTURES_OVERROUND,
  ODDS_ERROR,
  backMargin,
  estimateF1LotteryOdds,
  f1Phase,
  estimateFuturesOdds,
  analyzeSlip,
  slipPayoutTable,
  expectedReturn,
  settleSlip,
  median,
  quantile,
  SLIP_RULES,
  afterTax,
  choose,
  seededRandom,
  slipErrors,
  slipSizes
} from './lib/odds.mjs';
import {
  FANS,
  fanSeries,
  STYLES,
  TRAITS,
  TRAIT_ROWS,
  SPORTS,
  SIM_SPORTS,
  traitKeys,
  sportTemplate,
  weekOfYear,
  crowdPools,
  crowdSize,
  hashString,
  SIM_START_BALANCE,
  SIM_WEEKLY_GRANT,
  simulateCrowd,
  gamesInWeek,
  MONTH_WEEKS,
  PERIOD_MONTHS,
  monthWeeks,
  replayPlayer
} from './lib/sim.mjs';
import { ticketProfile, accountTickets } from './lib/profile.mjs';
import { useSourcesSession, loadOdds, loadExtraLeagues, loadExtraFutures, taipeiDayKey, fetchOutcomes, loadLive, loadLeagueTeams, parseInning, loadFutureTeams, futureTeamLeagues, FUTURES, EXTRA_FUTURES } from './lib/sources.mjs';
import { inningsLeft, liveBaseball, liveSoccer, fitGoals, liveMarkets, liveOdds, pregameRuns, nextRunChances, nextRunOdds, LIVE_MIN_LIQUIDITY } from './lib/live.mjs';
import {
  WEEKLY_GRANT,
  newAccount,
  balance,
  canClaim,
  claimGrant,
  nextGrantAt,
  weekKey,
  newSlipId,
  placeSlip,
  legResult,
  applyResults,
  mergeAccounts,
  recoverFromWallet,
  refundLost,
  mergeDistinct,
  poolEntries,
  compactAccount,
  isAccount
} from './lib/account.mjs';
import { renderHome } from './home.js';
import { mountLottery } from './lottery-ui.js';
import { mountStats } from './stats-ui.js';
import {
  othersBalance,
  APPS,
  appUrl,
  setting,
  installGate,
  watchUpdates,
  quadraSession,
  accountButton,
  recordAffinity,
  affinityPatch,
  activityPatch,
  notify,
  storedAccount,
  helpUrl
} from './lib/quadra.mjs';
import { pack, unpack } from './lib/codec.mjs';
import { historyStats, outlookOf, chanceOf, funFacts, crowdPercentile } from './lib/history.mjs';
import { detectLocale, makeT } from './lib/i18n.mjs';
import { f1Driver, f1Constructor, findTeamLogo, countryFlag, leagueLogo, teamLogo, teamZh, LEAGUES, familyOf, isSoccer, isSets, isNeutral, normalizeTeamName } from './lib/teams.mjs';
import { houseRule, minLegsProblem } from './lib/rules.mjs';
import { gameOptions, crowdPool, f1Podium, f1Markets } from './lib/board.mjs';
import { auditPools, auditCrowd } from './lib/audit.mjs';
import { recommend } from './lib/recommend.mjs';

const STAKE = 100;
// Simulated people per pick style x series-follow group, on average: each style
// gets its share of the crowd, 100,000 people in all.
const PER_GROUP = Math.ceil(100_000 / (STYLES.length * FANS.length));
const SIM_PLAYERS = crowdSize(PER_GROUP);
const SIM_SEED = 1;
// Shown as a round "100,000".
const SIM_PLAYERS_SHOWN = Math.round(SIM_PLAYERS / 1000) * 1000;
const THIN_LIQUIDITY = 10_000;
// Championship teams shown before the rest fold away.
const FUTURES_SHOWN = 8;
const ACCOUNT_KEY = 'oddsStudy.account';
const SYNC_KEY = 'oddsStudy.syncCode';
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
  slipMode: 'single',
  // Chosen 過關組合 sizes; 'all' stands for 全過, whatever the leg count.
  slipSizes: new Set([2, 'all']),
  slipStake: 100,
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

// A small amount that may be a half dollar: NT$0.5, NT$3.
function fmtPay(value) {
  return Number.isInteger(value) ? fmtMoney(value, { sign: false }) : `NT$${value}`;
}

function fmtAxis(value) {
  const abs = fmtInt(Math.abs(Math.round(value)));
  return value < -0.5 ? `−${abs}` : abs;
}

function fmtPct(p) {
  return `${(p * 100).toFixed(1)}%`;
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
  const event = game.group && normalizeTeamName(game.group) !== normalizeTeamName(league) ? game.group : null;
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
        matchup: data.f1.title,
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
      bets.push({ ...w, id: `f1pod|${w.driverEn}`, kind: 'f1podium', market: `f1podium|${w.driverEn}`, label: `F1 ${t('f1PodiumShort')} ${w.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    });
    // Top six, top ten, teammates head to head and the winning team.
    const more = f1Markets(winners.map(b => ({ fair: b.fairChance, odds: b.estOdds, team: b.driver.team })));
    for (const [key, list, short] of [['f1top6', more.top6, 'f1Top6Short'], ['f1top10', more.top10, 'f1Top10Short']])
      list.forEach((p, i) => {
        const w = winners[i];
        bets.push({ ...w, id: `${key}|${w.driverEn}`, kind: key, market: `${key}|${w.driverEn}`, label: `F1 ${t(short)} ${w.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
      });
    for (const p of more.h2h) {
      const w = winners[p.driver];
      const r = winners[p.rival];
      bets.push({ ...w, id: `f1h2h|${w.driverEn}|${r.driverEn}`, kind: 'f1h2h', market: `f1h2h|${[w.driverEn, r.driverEn].sort().join('|')}`, rival: r.driverEn, rivalLabel: r.shortLabel, label: `F1 ${w.shortLabel} ${t('f1H2HBeats')} ${r.shortLabel}`, shortLabel: `${w.shortLabel} > ${r.shortLabel}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    }
    for (const p of more.teams) {
      bets.push({ id: `f1team|${p.team}`, gameId: 'f1', kind: 'f1team', sport: 'f1', market: 'f1team', matchup: data.f1.title, start: data.f1.startUtc, team: p.team, label: `F1 ${t('f1TeamShort')} ${p.team}`, shortLabel: p.team, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
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

function betReturn(bet) {
  return expectedReturn(bet.fairChance, effectiveOdds(bet), STAKE);
}

// Relative margin of the odds used: none once real odds are typed in.
function oddsError(bet) {
  return ODDS_ERROR[bet.errKey]?.rel ?? 0;
}

function betBackMargin(bet) {
  return backMargin(bet.fairChance, bet.fairMargin, effectiveOdds(bet), oddsError(bet));
}

function fmtMarginPts(m) {
  return `±${(m * 100).toFixed(m < 0.01 ? 1 : 0)}`;
}

// Days follow Taiwan time, like the lottery.
function dayKey(iso) {
  return taipeiDayKey(iso);
}

// The sport filter: everything, a kind of sport (g:<group>), or one league.
const SPORT_GROUPS = {
  baseball: { icon: '⚾', leagues: ['mlb', 'npb', 'kbo', 'cpbl'] },
  basketball: { icon: '🏀', leagues: ['nba', 'wnba', 'ncaam', 'ncaaw', 'euroleague', 'bleague'] },
  soccer: { icon: '⚽', leagues: Object.keys(LEAGUES).filter(key => LEAGUES[key].family === 'soccer') },
  football: { icon: '🏈', leagues: ['nfl', 'ncaaf'] },
  hockey: { icon: '🏒', leagues: ['nhl'] },
  tennis: { icon: '🎾', leagues: ['tennis', 'wta'] },
  badminton: { icon: '🏸', leagues: ['badminton'] },
  tabletennis: { icon: '🏓', leagues: ['tabletennis'] },
  volleyball: { icon: '🏐', leagues: ['volleyball'] },
  snooker: { icon: '🎱', leagues: ['snooker'] },
  f1: { icon: '🏎️', leagues: ['f1'] }
};
const groupOfSport = sport => Object.keys(SPORT_GROUPS).find(g => SPORT_GROUPS[g].leagues.includes(sport));

function inSport(sport) {
  if (state.sport === 'all' || state.sport === sport) return true;
  return state.sport.startsWith('g:') && SPORT_GROUPS[state.sport.slice(2)]?.leagues.includes(sport);
}

function visibleBets() {
  return state.bets.filter(b => inSport(b.sport) && dayKey(b.start) === state.day);
}

function rerenderFiltered() {
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
  const days = [...new Set(state.bets.filter(b => inSport(b.sport)).map(b => dayKey(b.start)))].sort();
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
      const [y, m, d] = day.split('-').map(Number);
      const date = new Date(y, m - 1, d);
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
        el('span', { class: 'day-count', text: [games ? t('gamesN', { n: games }) : null, hasF1 ? 'F1' : null].filter(Boolean).join(' + ') })
      ]);
    })
  );
}

function backClass(back) {
  if (back > 100) return 'back-high';
  if (back < 80) return 'back-low';
  return '';
}

// A logo with its dark-background version, or `fallback()` if it fails.
function logoPicture(light, dark, cls, fallback) {
  if (!light) return fallback();
  const img = el('img', { class: cls, src: light, alt: '', loading: 'lazy', decoding: 'async' });
  const picture = el('picture', { class: 'logo-wrap' }, [dark ? el('source', { srcset: dark, media: '(prefers-color-scheme: dark)' }) : null, img]);
  // A logo that fails is tried once more (a slow or dropped connection),
  // then gives way to the fallback.
  let retried = false;
  img.addEventListener('error', () => {
    if (retried || !navigator.onLine) return picture.replaceWith(fallback());
    retried = true;
    // The same address again (TheSportsDB refuses any extra ?query).
    setTimeout(() => {
      const source = picture.querySelector('source');
      if (source) source.srcset = dark;
      img.removeAttribute('src');
      img.setAttribute('src', light);
    }, 1500);
  });
  return picture;
}

// A team logo, or its initials in a circle when there's no logo (or it fails).
function logoImg(sport, enName, label, size = '') {
  // A national team's flag; else one character: a Chinese name's first
  // character, or an English initial.
  const flag = countryFlag(enName);
  const fallback = () =>
    flag ? el('span', { class: `logo logo-flag ${size}`, 'aria-hidden': 'true', text: flag }) : el('span', { class: `logo logo-fallback ${size}`, 'aria-hidden': 'true', text: (label || '?').trim().slice(0, 1) });
  const url = teamLogo(sport, enName) ?? findTeamLogo(futureTeamLeagues(sport), enName);
  return logoPicture(url, url === teamLogo(sport, enName) ? teamLogo(sport, enName, true) : null, `logo ${size}`, fallback);
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
  $('refresh').setAttribute('aria-label', t('refresh'));
  $('refresh').title = t('refresh');
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
  for (const tab of TABS) $(`tab-${tab}`).querySelector('.tab-label').textContent = t(`tab_${tab}`);
}

// One icon per guide group, in order: reading the numbers, the odds math,
// traits, fans, kinds of bet, the lottery's rules, recommendations, the
// simulator, data and margins.
const GUIDE_ICONS = ['🔎', '🗂️', '🧮', '🧑‍🤝‍🧑', '🏟️', '🎫', '⚖️', '👍', '🎲', '📡'];

// Every sport and league the page covers, and every championship board,
// built from the page's own lists, so it's always complete: one line per
// sport (its leagues and where their odds come from), then the championships.
function supportedGames() {
  const t = state.t;
  const source = league => (league === 'f1' ? 'sourceF1' : LEAGUES[league]?.kambi ? 'sourceKambiShort' : ['mlb', 'epl'].includes(league) ? 'sourceBothShort' : 'sourceEspnShort');
  const sports = Object.entries(SPORT_GROUPS).map(([group, { icon, leagues }]) => {
    const bySource = groupBy(leagues, source);
    const text = [...bySource].map(([src, list]) => `${list.map(l => t(`sport_${l}`)).join('、')}（${t(src)}）`).join('；');
    return [`${icon} ${t(`group_${group}`)}`, text];
  });
  // Names without their season ("{season} 西甲冠軍" → "西甲冠軍").
  const futures = [...FUTURES, ...EXTRA_FUTURES].map(f => t(`future_${f.key}`, { season: '' }).trim());
  return [...sports, [`🏆 ${t('guideFuturesTitle')}`, futures.join('、')], [t('guideWhenTitle'), t('guideWhen')]];
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
  container.replaceChildren(...games.filter(g => byGame.get(g.id)).map(game => gameCard(game, byGame.get(game.id))));
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
    open ? gameMore(game, others) : null,
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
  const sourceKey = game.live ? (game.live.pmWin != null ? 'liveSourcePm' : 'liveSource') : game.book === 'kambi' ? 'sourceKambi' : game.draftKings && game.polymarket ? 'sourceBoth' : game.draftKings ? 'sourceDk' : 'sourcePm';
  const thin = sourceKey === 'sourcePm' && (game.polymarketLiquidity ?? 0) < THIN_LIQUIDITY;
  const notes = [];
  if (game.live) notes.push(t(game.sport === 'mlb' ? 'liveNote' : 'liveNoteSoccer'));
  if (game.book === 'kambi') notes.push(t('kambiNote'));
  if (isSoccer(game.sport)) notes.push(t('soccerUnverified'));
  if (['football', 'basketball', 'hockey'].includes(familyOf(game.sport))) notes.push(t('otherSportNote'));
  if (game.sport !== 'mlb' && game.total && game.total.line % 1 === 0) notes.push(t('wholeLine', { line: game.total.line, a: game.total.line - 0.5, b: game.total.line + 0.5 }));
  if (thin) notes.push(t('thin'));
  return el('div', { class: 'game-more' }, [
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
      : null,
    current ? marketPanel(game, current, bets.filter(b => b.kind === current.kind)) : null,
    el('div', { class: 'game-foot' }, [
      game.live ? null : pinButton(game),
      el('details', { class: 'info' }, [el('summary', { text: t('notesTitle') }), el('p', { text: `${fmtTime(game.startUtc)} · ${t(sourceKey)}` }), ...notes.map(text => el('p', { text }))])
    ])
  ]);
}

// One line of a two-way market: the line (tagged when the lottery posts it)
// and its two picks.
function lineRow(label, pair, { posted = false, main = false } = {}) {
  const t = state.t;
  // Outside MLB the tagged line is DraftKings' main line, not a checked lottery line.
  if (posted && pair[0]?.sport !== 'mlb') main = true;
  return el('div', { class: `line-row ${posted ? 'posted' : ''} ${main ? 'main' : ''}` }, [
    el('span', { class: 'line-label' }, [
      el('strong', { text: label }),
      posted ? el('small', { class: 'line-tag', text: t(main ? 'lineMain' : 'lineLottery') }) : null
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
  const extra = bets.some(b => b.posted === false);
  // Only MLB's lines were compared with the lottery; elsewhere the main line is DraftKings'.
  const note = game.sport === 'mlb' ? (extra ? t('linesNote') : null) : ['total', 'runline', 'teamtotal'].includes(section.kind) ? t('linesNoteOther') : null;
  return el('div', { class: `market-panel ${section.kind}` }, [...body, note ? el('p', { class: 'note', text: note }) : null]);
}

// Kinds laid out as tables of lines: over/under, and one team giving a line.
const TOTAL_KINDS = new Set(['total', 'gametotal', 'htotal', 'totalsets']);
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

function pickTitle(bet) {
  const t = state.t;
  const err = ODDS_ERROR[bet.errKey] ?? ODDS_ERROR.extra;
  return [
    bet.label,
    `${t('legendOdds')} ${fmtOdds(effectiveOdds(bet))} ±${fmtOdds(bet.estOdds * err.rel)}${err.checked ? '' : '?'}`,
    bet.cut ? `${t('takeTitle')} ${fmtPct(1 - 1 / bet.cut)}` : null,
    `${t('colFair')} ${fmtPct(bet.fairChance)}${bet.fairMargin ? ` ${fmtMarginPts(bet.fairMargin)}${bet.typicalMargin ? '*' : ''}` : ''}`,
    `${t('legendBack')} ${fmtMoney(betReturn(bet), { sign: false })} ±${Math.round(betBackMargin(bet))}`,
    bet.lock ? t(`lock_${bet.lock}`) : bet.minLegs > 1 ? t('minLegsNote', { n: bet.minLegs }) : null
  ]
    .filter(Boolean)
    .join('\n');
}

// A pick: tap to put it on the bet slip (or take it off). The big number is
// the estimated lottery odds; its colour, whether it pays back more or less
// than most (the numbers behind it are in its tooltip and in 說明). A locked
// pick (the house doesn't sell it) shows a lock; one sold only in parlays
// shows its minimum (2關, 3關).
function pickButton(bet, name) {
  const t = state.t;
  const back = betReturn(bet);
  const inSlip = state.parlay.includes(bet.id);
  const locked = Boolean(bet.lock);
  const rec = !locked && (bet.live ? state.liveRecs : state.recs)?.get(bet.id);
  const body = [
    rec ? el('span', { class: `rec rec-${rec.tag}`, text: t(`rec_${rec.tag}`) }) : null,
    name ? el('span', { class: 'pick-name', text: name }) : null,
    el('span', { class: 'pick-odds' }, [
      locked ? el('span', { class: 'lock', 'aria-hidden': 'true', text: '🔒' }) : document.createTextNode(fmtOdds(effectiveOdds(bet))),
      !locked && bet.minLegs > 1 ? el('small', { class: 'min-legs', text: t('minLegsTag', { n: bet.minLegs }) }) : null
    ])
  ];
  return el('button', {
    class: `pick ${locked ? 'locked' : backClass(back)} ${rec ? 'has-rec' : ''} ${inSlip ? 'in-slip' : ''}`,
    type: 'button',
    title: [rec ? t(`recWhy_${rec.tag}`, { back: Math.round(rec.back), beats: Math.round(rec.beats * 100) }) : null, pickTitle(bet)].filter(Boolean).join('\n'),
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

// "4局下 1出局", "中場", "67'".
function liveStateText(live) {
  const t = state.t;
  if (live.delayed) return `${live.detail} · ${t('livePaused')}`;
  if (live.sport !== 'mlb') return live.minute >= 45 && /half/i.test(live.detail) ? t('liveHalfTime') : `${live.minute}'`;
  const text = t(`liveHalf_${live.half}`, { n: live.inning });
  return live.half === 'top' || live.half === 'bottom' ? `${text} ${t('liveOuts', { n: live.outs })}` : text;
}

// Every live game as a game card's data, and its bets at live odds.
function buildLiveBets(data) {
  const t = state.t;
  const games = [];
  const bets = [];
  for (const g of data?.games ?? []) {
    const pre = g.pregame;
    let dist;
    if (g.sport === 'mlb') {
      if (!pre.totalLine) continue;
      const means = pregameRuns({ homeWin: pre.homeWin, totalLine: pre.totalLine, overFair: pre.overFair });
      const left = inningsLeft(g);
      dist = liveBaseball({ means, awayScore: g.awayScore, homeScore: g.homeScore, awayLeft: left.away, homeLeft: left.home });
    } else {
      if (!(pre.draw > 0)) continue;
      dist = liveSoccer({ means: fitGoals(pre.homeWin, pre.awayWin), awayScore: g.awayScore, homeScore: g.homeScore, minutesLeft: 90 - g.minute });
    }
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
    const base = { gameId: game.id, game, sport: g.sport, matchup, start: g.startUtc, live: true, fairMargin: null, errKey: g.sport === 'mlb' ? 'live' : 'liveSoccer' };
    for (const m of liveMarkets(dist, { sport: g.sport, awayScore: g.awayScore, homeScore: g.homeScore, pm: g.pm })) {
      const common = { ...base, kind: m.kind, side: m.side, market: m.market, posted: m.posted, fairChance: m.fair, estOdds: liveOdds(m.fair) };
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
  const games = state.liveGames.filter(g => inSport(g.sport));
  $('live').hidden = !games.length;
  if (!games.length) return;
  const byGame = groupBy(state.liveBets, b => b.gameId);
  $('live-updated').textContent = state.liveAt ? t('liveUpdated', { time: formatter('hms', locale => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' })).format(new Date(state.liveAt)) }) : '';
  $('live-list').replaceChildren(...games.map(g => gameCard(g, byGame.get(g.id) ?? [])));
}

// Live games refresh every 30 seconds while the games tab is on screen.
const LIVE_REFRESH_MS = 30_000;
let liveBusy = false;
async function refreshLive() {
  if (liveBusy) return;
  liveBusy = true;
  try {
    const data = await loadLive(new Date(), LIVE_MIN_LIQUIDITY);
    const { games, bets } = buildLiveBets(data);
    state.liveRecs = recommend(bets);
    state.liveGames = games;
    state.liveBets = bets;
    state.liveAt = data.loadedAt;
    // A live pick whose line is gone (the game moved on, or ended) leaves the slip.
    const ids = new Set(slipCandidates().map(b => b.id));
    state.parlay = state.parlay.filter(id => ids.has(id));
    renderLive();
    renderParlay();
    renderTabs();
  } catch (error) {
    console.error(error);
  } finally {
    liveBusy = false;
  }
}

setInterval(() => {
  if (document.visibilityState === 'visible' && (state.tab === 'games' || (state.tab === 'slip' && state.parlay.some(id => id.startsWith('live|'))))) refreshLive();
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
    el('span', { class: 'entry-name' }, [document.createTextNode(bet.shortLabel), el('small', { text: [fmtPctShort(bet.fairChance), sub].filter(Boolean).join(' · ') })]),
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

function board({ emblem, title, sub, bets, rows, id, notes = [], shown = Infinity }) {
  const t = state.t;
  const entries = bets.map((b, i) => rows(b, i));
  const rest = entries.slice(shown);
  return el('article', { class: 'board' }, [
    el('div', { class: 'board-head' }, [
      el('span', { class: 'board-emblem' }, leagueImg(emblem)),
      el('div', {}, [el('p', { class: 'board-title', text: title }), el('p', { class: 'board-sub', text: sub })])
    ]),
    el('div', { class: 'entries' }, entries.slice(0, shown)),
    rest.length ? el('details', { class: 'board-more' }, [el('summary', { text: t('futureMore', { n: rest.length }) }), el('div', { class: 'entries' }, rest)]) : null,
    notes.length ? el('div', { class: 'board-foot' }, [el('details', { class: 'info' }, [el('summary', { text: t('notesTitle') }), ...notes.map(text => el('p', { text }))])]) : null
  ]);
}

function renderFutures() {
  const t = state.t;
  const markets = groupBy(state.futures.filter(b => inSport(b.sport)), b => b.market);
  $('futures').hidden = markets.size === 0;
  $('futures-list').replaceChildren(
    ...[...markets.values()].map(bets => {
      const { market, matchup, sport } = bets[0];
      const notes = [];
      if (sport === 'nba') notes.push(t('futureNbaNote'));
      if (sport === 'epl') notes.push(t('futureEplNote'));
      if (bets[0].errKey === 'futureOther') notes.push(t('futureOtherNote'));
      return board({
        emblem: sport,
        title: matchup,
        sub: `${t('futureSettles')} ${t(`futureSettle_${market}`)}`,
        bets,
        id: `fut|${market}`,
        notes,
        shown: FUTURES_SHOWN,
        rows: (b, i) => entryRow(b, i, market === 'f1drivers' ? driverBadge({ driverEn: b.teamEn, driver: f1Driver(b.teamEn) }) : market === 'f1constructors' ? constructorBadge(b.teamEn) : logoImg(b.sport, b.teamEn, b.shortLabel))
      });
    })
  );
}

// ---- Bet slip -----------------------------------------------------------------

function toggleLeg(bet) {
  if (bet.lock && !state.parlay.includes(bet.id)) return;
  if (state.parlay.includes(bet.id)) {
    state.parlay = state.parlay.filter(id => id !== bet.id);
  } else {
    // One pick per game: a new pick from the same game replaces the old one.
    const sameGame = slipCandidates().filter(b => b.gameId === bet.gameId).map(b => b.id);
    state.parlay = state.parlay.filter(id => !sameGame.includes(id));
    state.parlay.push(bet.id);
    if (state.parlay.length > SLIP_RULES.maxLegs) state.parlay.shift();
  }
  renderGames();
  renderLive();
  renderF1();
  renderFutures();
  renderParlay();
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

// A number with its label.
function statTile(label, value, extraClass = '', icon = null) {
  return el('div', { class: `stat ${icon ? 'has-icon' : ''}` }, [
    icon ? el('span', { class: 'stat-icon', 'aria-hidden': 'true', text: icon }) : null,
    el('p', { class: `stat-value ${extraClass}`, text: value }),
    el('p', { class: 'stat-label', text: label })
  ]);
}

function fmtChance(p) {
  if (p >= 0.995) return p >= 1 ? '100%' : '>99%';
  if (p >= 0.1) return `${Math.round(p * 100)}%`;
  if (p >= 0.001) return `${(p * 100).toFixed(1)}%`;
  if (p >= 0.0001) return `${(p * 100).toFixed(2)}%`;
  return p > 0 ? '<0.01%' : '0%';
}

function sizeName(k, n) {
  return k === n ? state.t('slipAll') : state.t('slipSize', { k });
}

// A deep look at the ticket, all computed exactly from each pick's fair chance.
function slipAnalysisView(a, legs, extra) {
  const t = state.t;
  const money = v => fmtMoney(v, { sign: false });
  const n = legs.length;
  const cards = [];
  cards.push(gradeCard(a));

  // Key numbers.
  cards.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'kpis' }, [
        statTile(t('slipCost'), money(a.cost), '', '💵'),
        statTile(t('slipBest'), money(a.top.net), 'back-high', '🏆'),
        statTile(t('slipExpected'), money(a.expectedNet), a.backPer100 < 100 ? 'back-low' : 'back-high', '⚖️'),
        statTile(t('slipProfit'), fmtChance(a.profit), a.profit < 0.5 ? 'back-low' : '', '📈')
      ])
    ])
  );
  cards.push(drawCard(legs, a, extra.sig));

  // Where each NT$100 goes.
  const { take, tax, back } = a.per100;
  const seg = (cls, v) => el('span', { class: `split-seg ${cls}`, style: `flex:${Math.max(0, v)}` });
  cards.push(
    el('div', { class: 'card' }, [
      el('h3', { class: 'card-title', text: `${t('anaSplitTitle')}` }),
      el('div', { class: 'split-bar', 'aria-hidden': 'true' }, [seg('split-back', back), seg('split-take', take), seg('split-tax', tax)]),
      el('div', { class: 'split-legend' }, [
        el('span', {}, [el('i', { class: 'split-back' }), document.createTextNode(`${t('anaBack')} ${money(back)}`)]),
        el('span', {}, [el('i', { class: 'split-take' }), document.createTextNode(`${t('anaTake')} ${money(take)}`)]),
        el('span', {}, [el('i', { class: 'split-tax' }), document.createTextNode(`${t('anaTax')} ${money(tax)}`)])
      ])
    ])
  );

  // Every result, exactly.
  const scale = Math.max(...a.byHits.map(r => r.chance));
  cards.push(
    el('div', { class: 'card' }, [
      el('h3', { class: 'card-title', text: `${t('anaResultsTitle')}` }),
      el('ol', { class: 'run-bars' },
        [...a.byHits].reverse().map(r =>
          el('li', { class: r.profit ? 'row-profit' : '' }, [
            el('span', { class: 'run-hits', text: t('slipHitsN', { k: r.hits, n }) }),
            el('span', { class: 'run-track' }, [el('span', { class: 'run-bar', style: `width:${(r.chance / scale) * 100}%` })]),
            el('span', { class: 'run-share' }, [el('strong', { text: fmtChance(r.chance) }), el('small', { text: r.max > 0 ? (r.min === r.max ? money(r.max) : `${money(r.min)}–${money(r.max)}`) : '—' })])
          ])
        )
      ),
      el('p', { class: 'note', text: a.profitFrom == null ? t('anaNoProfit') : t('anaProfitFrom', { k: a.profitFrom, n, p: fmtChance(a.profit) }) })
    ])
  );

  cards.push(rareCard(a));

  // Each pick on its own.
  cards.push(
    el('div', { class: 'card' }, [
      el('h3', { class: 'card-title', text: `${t('anaLegsTitle')}` }),
      el('ul', { class: 'leg-analysis' },
        legs.map((b, i) => {
          const info = a.legs[i];
          return el('li', { class: i === a.weakest && n > 1 ? 'weakest' : '' }, [
            betIcon(b),
            el('span', { class: 'leg-main' }, [
              el('strong', { text: b.shortLabel }),
              el('small', { class: 'slip-leg-game', text: t('anaLegOdds', { odds: fmtOdds(effectiveOdds(b)), fair: fmtOdds(info.fairOdds), p: fmtPctShort(b.fairChance) }) })
            ]),
            el('span', { class: 'leg-value' }, [
              el('strong', { class: backClass(info.value), text: money(info.value) })
            ])
          ]);
        })
      ),
      n > 1 ? el('p', { class: 'note', text: t('anaWeakest', { leg: legs[a.weakest].shortLabel, v: money(a.legs[a.weakest].value) }) }) : null
    ])
  );

  // Missing by one only means something when the picks share one ticket.
  if (state.slipMode !== 'single') cards.push(heartbreakCard(a, legs));
  return cards;
}

// ---- Bet slip extras: a grade, how rare a win is, and trying a draw ----------

// Things everyone knows the odds of, to measure a ticket's chances against.
const RARE_EVENTS = [
  { key: 'coin', p: 1 / 2, icon: '🪙' },
  { key: 'dice', p: 1 / 6, icon: '🎲' },
  { key: 'birthday', p: 1 / 365, icon: '🎂' },
  { key: 'tenHeads', p: 1 / 1024, icon: '🪙' },
  { key: 'royal', p: 1 / 649_740, icon: '🃏' },
  { key: 'lotto', p: 1 / 13_983_816, icon: '🎱' },
  { key: 'power', p: 1 / 22_085_448, icon: '🎱' }
];
const TICKET_TYPES = [
  { key: 'steady', min: 0.4, icon: '🐢' },
  { key: 'balanced', min: 0.15, icon: '⚖️' },
  { key: 'thrill', min: 0.03, icon: '🎢' },
  { key: 'dream', min: 0.002, icon: '🌈' },
  { key: 'lottery', min: 0, icon: '🎰' }
];

// A school grade from the average back per NT$100 (a single game at the
// lottery's usual cut gets about 87, an A), and a type from the chance of profit.
function slipGrade(a) {
  const b = a.backPer100;
  const grade = b >= 100 ? 'S' : b >= 85 ? 'A' : b >= 72 ? 'B' : b >= 62 ? 'C' : b >= 50 ? 'D' : 'F';
  return { grade, type: TICKET_TYPES.find(x => a.profit >= x.min) };
}

function gradeCard(a) {
  const t = state.t;
  const { grade, type } = slipGrade(a);
  const loss = a.cost - a.expectedNet;
  return el('div', { class: 'card grade-card' }, [
    el('div', { class: `grade-letter grade-${grade}`, text: grade, 'aria-label': t('gradeTitle') }),
    el('div', { class: 'grade-main' }, [
      el('p', { class: 'grade-kicker', text: t('gradeTitle') }),
      el('p', { class: 'grade-type' }, [el('span', { 'aria-hidden': 'true', text: type.icon }), document.createTextNode(` ${t(`type_${type.key}`)}`)]),
      el('p', { class: 'grade-note', text: `${t(`typeNote_${type.key}`)} · ${t(`gradeNote_${grade}`)}` }),
      el('div', { class: 'grade-lines' }, [
        loss > 0 ? el('span', { text: t('gradeLoss', { loss: fmtMoney(loss, { sign: false }), cups: (loss / BOBA_PRICE).toLocaleString(numberLocale(), { maximumFractionDigits: 1 }) }) }) : null,
        a.paid > 0 ? el('span', { text: t('gradeEvery', { n: (1 / a.paid).toLocaleString(numberLocale(), { maximumFractionDigits: 1 }) }) }) : null
      ])
    ])
  ]);
}

function fmtOneIn(p) {
  return t => t('anaOneIn', { n: fmtCount(1 / Math.max(p, 1e-12)) });
}

// The ticket's chances placed among well-known odds, rarest at the bottom.
function rareCard(a) {
  const t = state.t;
  const same = Math.abs(a.profit - a.top.chance) < 1e-12;
  const mine = [{ key: same ? 'mineBoth' : 'mineTop', p: a.top.chance, icon: '🎫', mine: true }];
  if (!same && a.profit > 0) mine.push({ key: 'mineProfit', p: a.profit, icon: '💰', mine: true });
  const all = [...RARE_EVENTS, ...mine].sort((x, y) => y.p - x.p);
  // Keep the neighbours of the ticket's rows: one well-known event above and below.
  const idx = all.map((r, i) => (r.mine ? i : -1)).filter(i => i >= 0);
  const rows = all.slice(Math.max(0, idx[0] - 1), Math.min(all.length, idx.at(-1) + 2));
  const rarest = Math.max(...rows.map(r => -Math.log10(r.p)));
  const coins = Math.round(Math.log2(1 / Math.max(a.top.chance, 1e-15)));
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title', text: t('rareTitle') }),
    el('ol', { class: 'rare-list' },
      rows.map(r =>
        el('li', { class: r.mine ? 'rare-mine' : '' }, [
          el('span', { class: 'rare-icon', 'aria-hidden': 'true', text: r.icon }),
          el('span', { class: 'rare-name', text: t(`rare_${r.key}`) }),
          el('span', { class: 'rare-track' }, [el('span', { class: 'rare-bar', style: `width:${Math.max(3, (-Math.log10(r.p) / rarest) * 100)}%` })]),
          el('strong', { class: 'rare-odds', text: r.p >= 0.5 ? fmtChance(r.p) : fmtOneIn(r.p)(t) })
        ])
      )
    ),
    coins >= 2 ? el('p', { class: 'note', text: t('rareCoins', { n: coins }) }) : null
  ]);
}

// Opens the ticket for real: every pick drawn from its fair chance. One at a
// time with each pick revealed in turn, with a running tally.
function drawCard(legs, a, sig) {
  const t = state.t;
  const money = v => fmtMoney(v, { sign: false });
  if (state.draws?.sig !== sig) state.draws = { sig, n: 0, spent: 0, back: 0, best: 0, wins: 0, path: [], last: null, busy: false };
  const d = state.draws;
  const box = el('div', { class: 'card draw-card' });
  const drawOne = () => legs.reduce((won, b, i) => (Math.random() < b.fairChance ? won | (1 << i) : won), 0);
  const record = won => {
    const pay = a.net[won];
    d.n++;
    d.spent += a.cost;
    d.back += pay;
    if (pay > 0) d.wins++;
    d.best = Math.max(d.best, pay);
    d.path.push(d.back - d.spent);
    return pay;
  };
  const openOne = () => {
    if (d.busy) return;
    d.busy = true;
    d.last = { won: drawOne(), shown: 0 };
    paint();
    const step = () => {
      if (state.draws !== d || !box.isConnected) return (d.busy = false);
      d.last.shown++;
      if (d.last.shown >= legs.length) {
        d.last.pay = record(d.last.won);
        d.busy = false;
      } else setTimeout(step, 380);
      paint();
    };
    setTimeout(step, 380);
  };
  function paint() {
    const last = d.last;
    const parts = [
      el('h3', { class: 'card-title', text: t('drawTitle') }),
      el('p', { class: 'lede', text: t('drawNote') }),
      el('div', { class: 'draw-buttons' }, [
        el('button', { class: 'primary-button', type: 'button', text: t(d.n > 0 ? 'drawAgain' : 'drawStart'), disabled: d.busy ? '' : null, onclick: openOne })
      ])
    ];
    if (last && last.batch == null) {
      const done = last.shown >= legs.length;
      parts.push(
        el('ul', { class: 'draw-legs' },
          legs.map((b, i) => {
            const shown = i < last.shown;
            const hit = (last.won >> i) & 1;
            return el('li', { class: shown ? (hit ? 'hit' : 'miss') : 'wait' }, [
              el('span', { class: 'draw-mark', 'aria-hidden': 'true', text: shown ? (hit ? '✓' : '✗') : '?' }),
              el('span', { class: 'draw-leg', text: b.shortLabel }),
              el('small', { text: fmtPctShort(b.fairChance) })
            ]);
          })
        )
      );
      if (done) {
        const pay = last.pay;
        const text = pay <= 0 ? t('drawLost', { cost: money(a.cost) }) : pay > a.cost ? t('drawWon', { v: money(pay), profit: money(pay - a.cost) }) : t('drawBackSome', { v: money(pay), loss: money(a.cost - pay) });
        parts.push(el('p', { class: `draw-result ${pay > a.cost ? 'win' : 'lose'}`, text }));
      }
    }
    if (d.n > 0) {
      const net = d.back - d.spent;
      parts.push(
        el('div', { class: 'kpis draw-tally' }, [
          statTile(t('drawOpened'), fmtCount(d.n), '', '🎫'),
          statTile(t('drawWins'), `${fmtCount(d.wins)} (${fmtShare(d.wins / d.n)})`, '', '🎯'),
          statTile(t('drawNet'), fmtMoney(net), net < 0 ? 'back-low' : 'back-high', '💵'),
          statTile(t('drawBest'), d.best > 0 ? money(d.best) : '—', '', '🏆')
        ]),
        d.path.length > 1 ? sparkline(d.path) : null,
        el('p', { class: 'note', text: t('drawExpected', { n: fmtCount(d.n), v: fmtMoney(d.n * (a.expectedNet - a.cost)) }) })
      );
    }
    box.replaceChildren(...parts.filter(Boolean));
  }
  paint();
  return box;
}

// Missing by one pick: how often it happens next to winning outright, and
// which pick is most often the one that lets the ticket down.
function heartbreakCard(a, legs) {
  const t = state.t;
  const n = legs.length;
  if (n < 2) return null;
  const scale = Math.max(...a.lone);
  const worst = a.lone.indexOf(scale);
  const times = a.top.chance > 0 ? a.nearMiss / a.top.chance : 0;
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title', text: t('heartTitle') }),
    el('p', { class: 'heart-big' }, [
      el('span', { 'aria-hidden': 'true', text: '💔 ' }),
      document.createTextNode(t('heartPre')),
      el('strong', { text: fmtChance(a.nearMiss) }),
      document.createTextNode(times >= 1.05 ? t('heartTimes', { x: times.toLocaleString(numberLocale(), { maximumFractionDigits: 1 }) }) : t('heartPost'))
    ]),
    el('ol', { class: 'run-bars heart-bars' },
      legs.map((b, i) =>
        el('li', { class: i === worst ? 'heart-worst' : '' }, [
          el('span', { class: 'run-hits', text: b.shortLabel }),
          el('span', { class: 'run-track' }, [el('span', { class: 'run-bar', style: `width:${scale > 0 ? (a.lone[i] / scale) * 100 : 0}%` })]),
          el('span', { class: 'run-share' }, [el('strong', { text: fmtChance(a.lone[i]) })])
        ])
      )
    ),
    el('p', { class: 'note', text: t('heartWorst', { leg: legs[worst].shortLabel, p: fmtPctShort(1 - legs[worst].fairChance) }) })
  ]);
}

function renderParlay() {
  const t = state.t;
  const body = $('parlay-body');
  const { legs, dropped } = slipLegs();
  const n = legs.length;
  renderTabs();
  const mode = state.slipMode;
  const chosen = [...state.slipSizes].map(k => (k === 'all' ? n : k));
  const sizes = slipSizes(mode, n, chosen);
  const stake = state.slipStake;
  const slip = legs.map(b => ({ gameId: b.gameId, odds: effectiveOdds(b), fairChance: b.fairChance, minLegs: b.minLegs ?? 1, lock: b.lock ?? null }));
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
          el('span', { class: 'leg-odds' }, [el('small', { text: '@' }), document.createTextNode(fmtOdds(effectiveOdds(b)))]),
          el('button', { class: 'leg-remove', type: 'button', 'aria-label': t('removeLeg'), text: '×', onclick: () => toggleLeg(b) })
        ])
      )
    )
  ];
  if (mode === 'system' && n >= 3) {
    const options = [...Array.from({ length: n - 2 }, (_, i) => i + 2), 'all'];
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
              count: `×${fmtCount(choose(n, size))}`,
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
      if (value === state.slipStake) return;
      state.slipStake = value;
      // Redraw after the event: redrawing removes this input, and removing a
      // focused input fires another change while the first is still running.
      setTimeout(rerender);
    }
  });
  numberField(stakeInput, { digits: 5 });
  ticket.push(
    el('label', { class: 'slip-field' }, [
      el('span', { text: t('slipStake') }),
      el('span', { class: 'stake-box' }, [
        stakeInput,
        el('strong', { text: t('slipStakeEquals', { v: fmtMoney(stake, { sign: false }) }) }),
        el('small', { text: t('slipStakeHint', { unit: SLIP_RULES.unit }) })
      ])
    ])
  );
  if (errors.length) {
    ticket.push(el('ul', { class: 'slip-errors' }, errors.map(e => el('li', { text: t(`slipError_${e}`, { max: SLIP_RULES.maxLegs, min: fmtMoney(SLIP_RULES.minTicket, { sign: false }), maxTicket: fmtMoney(SLIP_RULES.maxTicket, { sign: false }), unit: SLIP_RULES.unit, need: minLegsProblem(slip, sizes) }) }))));
  }
  const cost = sizes.reduce((sum, k) => sum + choose(n, k), 0) * stake;
  if (sizes.length && !errors.includes('stakeUnit')) ticket.push(payoutBox(slip, sizes, stake, mode));
  ticket.push(placeButton(legs, sizes, cost, errors));
  ticket.push(el('details', { class: 'info' }, [el('summary', { text: t('slipRulesTitle') }), el('p', { text: t('slipRulesNote') })]));

  let results = [];
  if (sizes.length && !errors.includes('stakeUnit')) {
    const a = analyzeSlip({ legs: slip, sizes, stake });
    results = slipAnalysisView(a, legs, {
      // A new ticket starts a new tally of draws.
      sig: JSON.stringify([slip, sizes, stake])
    });
  }
  body.replaceChildren(el('div', { class: 'slip has-legs' }, [el('div', { class: 'card ticket' }, ticket), el('div', { class: 'slip-results' }, results)]));
}

// ---- Slip: what each pick is, what the ticket pays ------------------------------

// A kind of bet's name (its board section's).
function kindKey(kind) {
  const sec = SECTIONS.find(x => x.kind === kind);
  return { f1: 'f1Title', f1podium: 'f1PodiumShort', f1top6: 'f1Top6Short', f1top10: 'f1Top10Short', f1h2h: 'f1H2HShort', f1team: 'f1TeamShort', future: 'futuresTitle' }[kind] ?? sec?.short ?? sec?.title ?? null;
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
function payoutBox(legs, sizes, stake, mode) {
  const t = state.t;
  const n = legs.length;
  const combos = sizes.reduce((sum, k) => sum + choose(n, k), 0);
  const cost = combos * stake;
  const { gross, net } = slipPayoutTable({ legs, sizes, stake });
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
    legs.forEach((l, i) => rows.push(payLine(`${t('payEach', { i: i + 1 })} ${fmtMoney(stake, { sign: false })} × ${fmtOdds(l.odds)}`, fmtMoney(afterTax(stake * l.odds), { sign: false }))));
  } else {
    for (const k of sizes) rows.push(payLine(t('paySize', { size: sizeName(k, n), c: fmtInt(choose(n, k)) }), fmtMoney(choose(n, k) * stake, { sign: false })));
  }
  rows.push(payLine(t('payCost', { c: fmtInt(combos) }), fmtMoney(cost, { sign: false }), 'pay-cost'));
  const taxed = gross[all] - net[all] > 0.5;
  return el('div', { class: 'pay-box' }, [
    el('p', { class: 'pay-title', text: t('payTitle') }),
    ...rows,
    el('div', { class: 'pay-top' }, [
      el('span', { text: t('payAll') }),
      el('strong', { text: fmtMoney(net[all], { sign: false }) }),
      el('small', { class: net[all] > cost ? 'back-high' : 'back-low', text: t('payProfit', { v: fmtMoney(net[all] - cost) }) })
    ]),
    taxed ? el('p', { class: 'pay-note', text: t('payTaxed', { gross: fmtMoney(gross[all], { sign: false }), tax: fmtMoney(gross[all] - net[all], { sign: false }) }) }) : null,
    mode !== 'parlay' && least < net[all] ? el('p', { class: 'pay-note', text: t('payLeast', { v: fmtMoney(least, { sign: false }) }) }) : null
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
// money pool, and the rest of the pool (Securities' cash, Rewards' earnings,
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
      account = mergeAccounts(account, compactAccount(stored));
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

// A slip or lottery ticket just settled: a notice (a banner on screen, a
// system notice when Play is in the background and they're allowed).
function noticeSettled(prev, next) {
  if (!prev) return;
  const was = new Map(prev.slips.map(x => [x.id, x.status]));
  for (const slip of next.slips) {
    if (slip.status !== 'settled' || was.get(slip.id) !== 'open') continue;
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
  merged = refundLost(recoverFromWallet(merged, wallet));
  const have = new Set((wallet?.entries || []).map(e => e.id));
  const entries = poolEntries(merged).filter(e => !have.has(e.id));
  const open = merged.slips.filter(x => x.status === 'open').reduce((sum, x) => sum + x.cost, 0);
  // Open slips, for Quadra Fixtures to show (openSlips).
  const { kinds, slips, n } = openSlips(merged);
  const had = wallet?.snap?.odds;
  const same = had?.open === open && had?.n === n && JSON.stringify(had?.slips || []) === JSON.stringify(slips) && JSON.stringify(had?.kinds || {}) === JSON.stringify(kinds);
  const snap = same ? undefined : { odds: { open, n, kinds, slips, t: Date.now() } };
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
  if ((leg.kind === 'f1' || leg.kind === 'f1podium') && leg.driver) {
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

// The 模擬下注 button: buys the slip on the simulated account.
function placeButton(legs, sizes, cost, errors) {
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
      text: updating ? t('placeUpdating') : short ? t('placeShort', { v: fmtMoney(money, { sign: false }) }) : t('placeSlip', { v: fmtMoney(cost, { sign: false }) }),
      onclick: () => {
        const slip = { id: newSlipId(), mode: state.slipMode, sizes, stake: state.slipStake, cost, legs: legs.map(legRecord) };
        const { account, error } = placeSlip(state.account, slip, new Date(), { extra: poolExtra() });
        if (error) return;
        state.parlay = [];
        state.freshSlips.add(slip.id);
        commitAccount(account);
        // Synced at once, not in a moment: going straight back to Quadra
        // Fixtures should find the new slip there.
        clearTimeout(pushTimer);
        syncNow();
        track('bet', [...new Set(slip.legs.flatMap(leg => betKeys(leg)))], 3);
        renderGames();
        renderLive();
        renderF1();
        renderFutures();
              renderParlay();
        showTab('history');
      }
    }),
    el('small', { class: 'muted', text: t('placeNote', { v: fmtMoney(money, { sign: false }) }) })
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
  const own = balance(account);
  const money = funds();
  // Money that didn't come from betting: the start and the weekly grants.
  const grants = account.ledger.filter(e => e.kind === 'grant' || e.kind === 'game' || e.kind === 'start').reduce((sum, e) => sum + e.amount, 0);
  const open = account.slips.filter(x => x.status === 'open');
  const atStake = open.reduce((sum, x) => sum + x.cost, 0);
  const net = own + atStake - grants;
  $('account-body').replaceChildren(
    el('div', { class: 'card account-card' }, [
      el('div', { class: 'account-top' }, [
        el('div', {}, [el('p', { class: 'muted', text: t('poolTotal') }), el('p', { class: 'account-balance stat-value', text: fmtMoney(money, { sign: false }) })]),
        el('div', { class: 'account-side' }, [
          el('p', {}, [el('span', { class: 'muted', text: `${t('accountAtStake')} ` }), el('strong', { text: fmtMoney(atStake, { sign: false }) })]),
          el('p', {}, [el('span', { class: 'muted', text: `${t('accountNet')} ` }), el('strong', { class: net < -0.5 ? 'back-low' : net > 0.5 ? 'back-high' : '', text: fmtMoney(net) })])
        ])
      ]),
      canClaim(account, now) || state.grantNote ? el('p', { class: 'muted', text: state.grantNote ? t('grantAdded', { v: fmtMoney(WEEKLY_GRANT, { sign: false }) }) : '' }) : null
    ])
  );
}

// The open slips, compact, for Quadra Fixtures (the wallet's snap.odds.slips):
// each one's play (m: single, parlay or system, z: a system's sizes), its
// cost (c) and the most it can still pay (x), and its picks: the game
// (Sportsbook's id, before the first "|"), the pick, its market (k), odds,
// start, league and result so far. The market names go along in both
// languages (kinds). The soonest slips first, as many as fit the wallet's
// room for it.
const slipTagZh = makeT('zh');
const slipTagEn = makeT('en');
function openSlips(account) {
  const kinds = {};
  const tagName = (t, kind) => {
    const key = { inning: 'topInningShort', f1: 'f1Short' }[kind] ?? kindKey(kind);
    return key ? t(key) : '';
  };
  const firstStart = slip => slip.legs.map(leg => leg.start || '').filter(Boolean).sort()[0] || '';
  const slips = account.slips
    .filter(slip => slip.status === 'open')
    .sort((a, b) => firstStart(a).localeCompare(firstStart(b)))
    .map(slip => {
      const range = slipRange(slip);
      return {
        id: slip.id,
        m: slip.mode,
        z: slip.mode === 'system' ? slip.sizes : undefined,
        c: slip.cost,
        x: Math.max(0, Math.round(slip.cost + range.most)),
        l: slip.legs.map(leg => {
          if (leg.kind && !kinds[leg.kind]) kinds[leg.kind] = [tagName(slipTagZh, leg.kind), tagName(slipTagEn, leg.kind)];
          return { g: String(leg.id).split('|')[0], p: leg.shortLabel || leg.label || '', k: leg.kind || '', o: Math.round(leg.odds * 100) / 100, s: leg.start || null, sp: leg.sport || '', r: leg.result || undefined, live: leg.live || undefined };
        })
      };
    });
  const out = [];
  for (const slip of slips) {
    if (JSON.stringify({ kinds, slips: [...out, slip] }).length > 3500) break;
    out.push(slip);
  }
  const used = new Set(out.flatMap(slip => slip.l.map(leg => leg.k)));
  return { kinds: Object.fromEntries(Object.entries(kinds).filter(([k]) => used.has(k))), slips: out, n: slips.length };
}



const RESULT_ICON = { won: '✓', lost: '✗', void: '↺' };

// Where each pick stands: won / lost / void, 'live' (its game is on), or
// 'waiting' (not started).
function legState(leg, now = Date.now()) {
  if (leg.result) return leg.result;
  return leg.start && Date.parse(leg.start) <= now ? 'live' : 'waiting';
}

// What an open slip has locked in (every undecided pick lost) and the most it
// can still pay (every undecided pick won).
function slipRange(slip) {
  const as = result => slip.legs.map(leg => ({ odds: leg.odds, result: leg.result ?? result }));
  return {
    locked: settleSlip({ legs: as('lost'), sizes: slip.sizes, stake: slip.stake }).net,
    most: settleSlip({ legs: as('won'), sizes: slip.sizes, stake: slip.stake }).net
  };
}

const LEG_ICON = { won: '✓', lost: '✗', void: '↺', live: '●', waiting: '⏳' };

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
    const pay = settleSlip({ legs: slip.legs.map((leg, k) => ({ odds: leg.odds, result: now[k] })), sizes: slip.sizes, stake: slip.stake }).net;
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
  if (slip.recovered) return recoveredSlipCard(slip);
  const t = state.t;
  const n = slip.legs.length;
  const now = Date.now();
  const settled = slip.status === 'settled';
  const states = slip.legs.map(leg => legState(leg, now));
  const decided = states.filter(st => ['won', 'lost', 'void'].includes(st)).length;
  const profit = settled ? slip.payout - slip.cost : null;
  const range = settled ? null : slipRange(slip);
  // Open, but nothing left can pay: a parlay with a lost pick.
  const dead = !settled && range.most <= 0;
  const mode = slip.mode === 'system' ? slip.sizes.map(k => sizeName(k, n)).join('、') : t(`slipMode_${slip.mode}`);
  const pill = settled
    ? el('span', { class: `slip-pill ${profit > 0 ? 'won' : profit < 0 ? 'lost' : ''}`, text: slip.payout > 0 ? t('slipPaid', { v: fmtMoney(slip.payout, { sign: false }) }) : t('slipLost') })
    : dead
      ? el('span', { class: 'slip-pill lost', text: t('slipDead') })
      : el('span', { class: `slip-pill ${states.includes('live') ? 'live' : 'open'}`, text: states.includes('live') ? t('slipLiveNow') : t('slipOpen') });
  const nextStart = slip.legs.filter((leg, k) => states[k] === 'waiting' && leg.start).map(leg => leg.start).sort()[0];
  return el('article', { class: `card saved-slip ${state.freshSlips.has(slip.id) ? 'fresh' : ''} ${dead ? 'dead' : ''}` }, [
    el('div', { class: 'saved-head' }, [
      el('div', { class: 'saved-title' }, [
        el('span', { class: 'mode-tag', text: mode }),
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
          payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
          payCell(t('slipPaidLabel'), fmtMoney(slip.payout, { sign: false })),
          payCell(t('slipResult'), fmtMoney(profit), profit > 0 ? 'back-high' : profit < 0 ? 'back-low' : '')
        ]
      : [
          payCell(t('slipCost'), fmtMoney(slip.cost, { sign: false })),
          slip.mode === 'parlay' ? payCell(t('payOdds'), `×${fmtOdds(slip.legs.reduce((p, l) => p * l.odds, 1))}`) : null,
          decided && range.locked > 0 ? payCell(t('slipLocked'), fmtMoney(range.locked, { sign: false }), 'back-high') : null,
          payCell(decided ? t('slipMost') : t('payAll'), fmtMoney(range.most, { sign: false }), dead ? 'back-low' : '')
        ]),
    slipInsight(slip)
  ]);
}

// What the odds said when the slip was bought, and (once settled) how it
// went against that; each pick's chance in the folded part.
function slipInsight(slip) {
  const t = state.t;
  const look = outlookOf(slip);
  const lines = [t('insightBought', { exp: fmtMoney(look.mean, { sign: false }), back: fmtBack((look.mean / slip.cost) * 100), any: fmtPctShort(look.any) })];
  if (slip.status === 'settled') lines.push(t('insightLuck', { v: fmtMoney(slip.payout - look.mean) }));
  const tax = (slip.gross ?? slip.payout) - slip.payout;
  if (tax > 0) lines.push(t('insightTax', { v: fmtMoney(tax, { sign: false }) }));
  return el('details', { class: 'slip-insight' }, [
    el('summary', { text: lines[0] }),
    ...lines.slice(1).map(text => el('p', { text })),
    table([t('colPick'), t('colOddsBought'), t('colFair'), t('colBackPer')], slip.legs.map(leg => [leg.shortLabel, fmtOdds(leg.odds), fmtPctShort(chanceOf(leg)), fmtBack(chanceOf(leg) * leg.odds * 100)]))
  ]);
}

const HISTORY_FILTERS = {
  all: () => true,
  open: s => s.status === 'open',
  won: s => s.status === 'settled' && s.payout > s.cost,
  lost: s => s.status === 'settled' && s.payout <= s.cost
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
  if (slip.recovered) return 'recovered';
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
  if (key.startsWith('day|') || key === 'recovered') {
    const net = slips.reduce((s, x) => s + x.payout - x.cost, 0);
    return el('span', { class: 'group-sum' }, [
      document.createTextNode(t('groupCountCost', { n: slips.length, cost: fmtMoney(cost, { sign: false }) })),
      el('strong', { class: net > 0.5 ? 'back-high' : net < -0.5 ? 'back-low' : '', text: fmtMoney(net) })
    ]);
  }
  if (key === 'dead') return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupCountCost', { n: slips.length, cost: fmtMoney(cost, { sign: false }) })), el('strong', { class: 'back-low', text: fmtMoney(-cost) })]);
  const most = slips.reduce((s, x) => s + slipRange(x).most, 0);
  return el('span', { class: 'group-sum' }, [document.createTextNode(t('groupCountCost', { n: slips.length, cost: fmtMoney(cost, { sign: false }) })), el('strong', { text: t('groupMost', { v: fmtMoney(most, { sign: false }) }) })]);
}

// The 紀錄 tab shows the slips, the stats or the mini games, one at a time
// (the games on their own, so a running one takes no room from the rest).
function applyHistoryView() {
  const t = state.t;
  if (!state.accountReady) return;
  const any = state.account.slips.length > 0;
  const view = ['stats', 'tickets'].includes(state.historyView) ? state.historyView : 'slips';
  const openTickets = (state.account.tickets || []).filter(x => x.status === 'open').length;
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
        [document.createTextNode(t(`historyView_${key}`)), key === 'tickets' && openTickets ? el('span', { class: 'lotto-count', text: String(openTickets) }) : null]
      )
    )
  );
  $('saved').hidden = view !== 'slips' || !any;
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
  $('saved').hidden = slips.length === 0;
  applyHistoryView();
  if (!slips.length) return;
  const now = Date.now();
  const filtered = slips.filter(HISTORY_FILTERS[state.historyFilter]);
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
  const settledNet = slips.filter(s => s.status === 'settled').reduce((s, x) => s + x.payout - x.cost, 0);
  $('saved-body').replaceChildren(
    el('div', { class: 'saved-summary' }, [
      payCell(t('sumOpen'), t('sumSlips', { n: open.length })),
      payCell(t('sumAtStake'), fmtMoney(openCost, { sign: false })),
      payCell(t('sumMost'), fmtMoney(openMost, { sign: false })),
      payCell(t('sumSettledNet'), fmtMoney(settledNet), settledNet > 0.5 ? 'back-high' : settledNet < -0.5 ? 'back-low' : '')
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

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

// Each character is the real simulated player at that point of the ranking.
const CHARACTERS = [
  { key: 'best', name: 'simLucky', rank: 'simLuckyRank', color: 'var(--good)', icon: '🍀' },
  { key: 'median', name: 'simTypical', rank: 'simTypicalRank', color: 'var(--series-1)', icon: '🙂' },
  { key: 'worst', name: 'simUnlucky', rank: 'simUnluckyRank', color: 'var(--bad-strong)', icon: '🌧️' }
];

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
function sparkline(path) {
  const w = 300;
  const h = 64;
  let lo = 0;
  let hi = 0;
  for (const v of path) (lo = Math.min(lo, v), hi = Math.max(hi, v));
  const span = hi - lo || 1;
  const y = v => 4 + ((hi - v) / span) * (h - 8);
  let d = `M0,${y(0).toFixed(1)}`;
  path.forEach((v, i) => (d += `L${(((i + 1) / path.length) * w).toFixed(1)},${y(v).toFixed(1)}`));
  const svg = svgEl('svg', { class: 'sparkline', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  svg.append(svgEl('line', { class: 'zero-line', x1: 0, x2: w, y1: y(0), y2: y(0) }), svgEl('path', { class: path.at(-1) < 0 ? 'spark-bad' : 'spark-good', d }));
  return svg;
}

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

function renderF1() {
  const t = state.t;
  const f1 = state.data.f1;
  $('f1').hidden = !inSport('f1') || !f1;
  if (!f1) return;
  const drivers = state.bets.filter(b => b.kind === 'f1');
  const podium = state.bets.filter(b => b.kind === 'f1podium');
  $('f1-body').replaceChildren(
    board({
      emblem: 'f1',
      title: f1.title,
      sub: `${fmtTime(f1.startUtc)} · ${t(f1.phase === 'pre' ? 'f1PhasePre' : 'f1PhasePost')}`,
      bets: drivers,
      id: 'f1',
      notes: [t('f1Intro'), t('f1PhaseNote')],
      rows: (b, i) => entryRow(b, i, driverBadge(b), b.driver.team)
    }),
    podium.length
      ? board({
          emblem: 'f1',
          title: `${f1.title} · ${t('f1Podium')}`,
          sub: t('f1PodiumSub'),
          bets: podium,
          id: 'f1podium',
          shown: 8,
          notes: [t('f1PodiumNote')],
          rows: (b, i) => entryRow(b, i, driverBadge(b), b.driver.team)
        })
      : null,
    ...[
      ['f1top6', 'f1Top6', 'f1Top6Sub'],
      ['f1top10', 'f1Top10', 'f1Top10Sub'],
      ['f1h2h', 'f1H2H', 'f1H2HSub'],
      ['f1team', 'f1Team', 'f1TeamSub']
    ].map(([kind, title, sub]) => {
      const list = state.bets.filter(b => b.kind === kind);
      if (!list.length) return null;
      return board({
        emblem: 'f1',
        title: `${f1.title} · ${t(title)}`,
        sub: t(sub),
        bets: list,
        id: kind,
        shown: 8,
        notes: [t('f1PodiumNote')],
        rows: (b, i) => (kind === 'f1team' ? entryRow(b, i, constructorBadge(b.team), '') : entryRow(b, i, driverBadge(b), kind === 'f1h2h' ? `vs ${b.rivalLabel}` : b.driver.team))
      });
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

// Start-up shows the first screen as soon as it is ready: the main odds,
// then the other leagues and the games in play (both on the first screen,
// fetched side by side, each within BOOT_PART_MS) and the logos in view.
// Everything a scroll or a tab away (championship boards, their club logos,
// the other tabs' pictures) loads in the background after the page opens.
// The page never opens empty: past BOOT_LIMIT_MS (a very slow connection)
// it opens with whatever has arrived.
const BOOT_LIMIT_MS = 45_000;
const BOOT_PART_MS = 6_000;
const BOOT_IMAGES_MS = 1_200;
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
  if (saved) {
    clearTimeout(limit);
    open();
    refreshLive();
  }
  try {
    // The main board first (the request queue serves it before anything else).
    const now = new Date();
    const fresh = await loadOdds(now, saved ? undefined : onProgress);
    const extraGames = loadExtraLeagues(now).catch(error => (console.error(error), []));
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
    // A tab asked for in the address (#sim) that needed the odds opens now.
    if (state.wantedTab && state.tab !== state.wantedTab && tabAvailable(state.wantedTab)) state.tab = state.wantedTab;
    state.wantedTab = null;
    const addGames = games => {
      if (!games.length || !state.data) return;
      const ids = new Set(state.data.games.map(g => g.id));
      state.data.games = [...state.data.games, ...games.filter(g => !ids.has(g.id))].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    };
    const addFutures = futures => {
      if (!futures.length || !state.data) return;
      const keys = new Set(state.data.futures.map(f => f.key));
      state.data.futures = [...state.data.futures, ...futures.filter(f => !keys.has(f.key))];
    };
    let gamesIn = false;
    if (booting) {
      // The page opens as soon as the main board is drawn (it used to wait
      // up to 6 s more for the other leagues and the games in play, and 4 s
      // for the logos: Play opened about twice as slowly as the other
      // apps). Those join a moment later, a short wait for the logos first
      // so they don't pop in.
      renderAll();
      openWantedGame();
      await within(imagesReady($('panel-' + state.tab)), BOOT_IMAGES_MS);
      clearTimeout(limit);
      open();
      const [games] = await Promise.all([within(extraGames, BOOT_PART_MS, null), within(refreshLive(), BOOT_PART_MS)]);
      if (games) {
        addGames(games);
        gamesIn = true;
      }
      renderAll();
      openWantedGame();
      saveSnapshot();
    } else {
      renderAll();
      openWantedGame();
    }
    // The rest, in the background: the other leagues (if they missed the
    // first screen), the championship boards and their clubs' logos.
    if (!gamesIn)
      extraGames.then(games => {
        const before = state.data.games.length;
        addGames(games);
        if (state.data.games.length !== before) {
          renderAll();
          openWantedGame();
          warmImages();
          saveSnapshot();
        }
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

function renderTabs() {
  const t = state.t;
  if (!tabAvailable(state.tab)) state.tab = 'home';
  const legs = state.parlay.length;
  const badge = $('tab-slip').querySelector('.tab-badge');
  badge.hidden = legs === 0;
  badge.textContent = String(legs);
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    button.hidden = !tabAvailable(tab);
    button.setAttribute('aria-selected', String(tab === state.tab));
    button.tabIndex = tab === state.tab ? 0 : -1;
    $(`panel-${tab}`).hidden = tab !== state.tab;
  }
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
  try {
    history.replaceState(null, '', `#${tab}`);
  } catch {}
  renderTabs();
  window.scrollTo({ top: 0 });
  if (tab === 'home') renderHome(homeCtx());
  if (tab === 'lottery') lotteryUi?.render();
  if (tab === 'history') {
    checkResults();
    renderStats();
  }
}

for (const button of document.querySelectorAll('#tabs .tab')) button.addEventListener('click', () => showTab(button.dataset.tab));
$('game-search').addEventListener('input', event => {
  state.query = event.target.value.trim();
  if (state.data) renderGames();
});
$('tabs').addEventListener('keydown', event => {
  const visible = TABS.filter(tab => !$(`tab-${tab}`).hidden);
  const i = visible.indexOf(state.tab);
  const next = event.key === 'ArrowRight' ? visible[(i + 1) % visible.length] : event.key === 'ArrowLeft' ? visible[(i - 1 + visible.length) % visible.length] : null;
  if (!next) return;
  event.preventDefault();
  showTab(next);
  $(`tab-${next}`).focus();
});
{
  const fromHash = location.hash.slice(1);
  if (TABS.includes(fromHash)) state.tab = state.wantedTab = fromHash;
  if (fromHash === 'tickets') ((state.tab = state.wantedTab = 'history'), (state.historyView = 'tickets'));
  // #game=<id>: Quadra Fixtures' "bet on this" opens that game.
  const wanted = /^game=(.+)$/.exec(fromHash);
  if (wanted) state.wantedGame = decodeURIComponent(wanted[1]);
}
window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  // A notice's tap: its tab, or 紀錄's tickets.
  if (hash === 'tickets') return showTickets();
  if (TABS.includes(hash)) return showTab(hash);
  const wanted = /^game=(.+)$/.exec(hash);
  if (!wanted) return;
  state.wantedGame = decodeURIComponent(wanted[1]);
  openWantedGame();
});

// Opens the game asked for in the address: its day and sport, its card
// open with every market, scrolled into view.
function openWantedGame() {
  const id = state.wantedGame;
  // By id; or, from Quadra Fixtures, the same league and teams (a start
  // time moved since leaves the id's hour behind).
  const [sport, , away, home] = String(id || '').split('_');
  const game =
    id &&
    (state.data?.games.find(g => g.id === id || g.id.toLowerCase() === id.toLowerCase()) ||
      state.data?.games.find(g => g.sport === sport && g.id.endsWith(`_${away}_${home}`)));
  if (!game) return;
  state.wantedGame = null;
  state.tab = 'games';
  state.day = dayKey(game.startUtc);
  state.dayPicked = true;
  state.sport = 'all';
  state.open.add(game.id);
  renderAll();
  showTab('games');
  requestAnimationFrame(() => document.querySelector(`[data-game="${CSS.escape(game.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

$('refresh').addEventListener('click', load);
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

// Phones: no app header. The status and refresh move to a
// slim row at the top of the page (the tabs are already at the bottom).
// The same top-right in every Quadra app: help, refresh, then the account.
const helpLink = Object.assign(document.createElement('a'), { className: 'icon-button help-button', href: helpUrl('odds'), textContent: '?' });
helpLink.addEventListener('click', e => (e.preventDefault(), q.go('vocab', 'help=odds')));
helpLink.setAttribute('aria-label', state.locale === 'en' ? 'Help' : '說明');
{
  const phone = matchMedia('(max-width: 720px)');
  const place = () => {
    const into = phone.matches ? $('mobile-bar') : document.querySelector('.appbar-inner');
    if (phone.matches) into.append($('status'), helpLink, $('refresh'), $('account-slot'));
    else {
      document.querySelector('.brand-text').append($('status'));
      into.append(helpLink, $('refresh'), $('account-slot'));
    }
  };
  place();
  phone.addEventListener('change', place);
}

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
$('account-slot').append(accountButton(q));
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

// What the home tab and the lottery need from here.
function homeCtx() {
  return { state, q, el, fmtMoney, fmtOdds, fmtTime, pickTitle, gameSeries, matchupText, logoImg, leagueImg, toggleLeg, showTab, openGame: id => ((state.wantedGame = id), openWantedGame()), betKeys, track, funds, slipRange };
}
statsUi = mountStats({ state, el, svgEl, fmtMoney, fmtInt, fmtPctShort, fmtOdds, fmtTime, sportName: key => (key === 'mixed' ? state.t('sportMixed') : state.t(`sport_${key}`) === `sport_${key}` ? String(key).toUpperCase() : state.t(`sport_${key}`)), youCard, crowdCard, funCard, picksCard, breakdownCard });
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
