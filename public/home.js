// The home tab: the few things worth a look now, nothing shouted.
//
// - The balance, with what's out in open bets and what they could cash out
//   for right now.
// - 場中焦點: games on now with live prices (the same ranking), a tap on a
//   price puts it on the slip, the card opens the game's live markets.
// - 為你推薦 (foryou.mjs): one pick a game on the teams and leagues the
//   person follows in Orbit Sports and bets on here, the next games of the teams
//   they've backed, and the best prices; a tap puts it on the slip. Its top
//   three as a ready-made parlay too.
// - 焦點賽事: the games worth betting on, as the board shows them (the win
//   prices, a tap puts one on the slip). Ranked by the shared recommender
//   (quadra.mjs's rank): the teams, leagues and sports the person bets on
//   and opens; each game's own weight is its league (the big leagues first,
//   thinly traded ones last) and how soon it starts. One per game.
// - 你的投注: the open slips, each with its cash-out price.
// - The lottery's jackpots.
// - Quadra Plus, once, for someone who isn't a member.
import { rank, affinity, plusMember, plusCard, vipStatus, vipName, VIP, tell, welcomeDue, WELCOME, cachedPayload } from '#kit/quadra.mjs';
import { tasteOf, gameInterest, forYouPicks, fixturesTaste, leagueTaste, spreadLeagues } from './lib/foryou.mjs';
import { GAMES, nextDraw, latestResults, gameName } from './lib/lottery.mjs';
import { icon } from './icons.js';

const TXT = {
  zh: {
    balance: 'Quadra 餘額', atStake: '投注中', slipsN: '{n} 張', cashNow: '可兌現', most: '全中最多',
    live: '場中焦點', allLive: '全部場中 {n} 場',
    featured: '焦點賽事', allGames: '全部賽事', markets: '{n} 種玩法',
    mine: '你的投注', seeAll: '全部', legs: '{n} 場', cashOut: '兌現', paused: '兌現暫停', freeBet: '免費投注',
    lottery: '彩券', drawIn: '{when} 開獎', none: '賽事載入中，或目前沒有開賣的比賽。', draw: '和',
    overdrawn: '透支 · 月息 1%', cover: '賣出持股補足',
    vipNone: 'VIP 回饋', vipNoneSub: '本月投注滿 {v} 起，最高回饋 {top}', vipBack: '本月回饋 {p} · 約 {v}', vipNext: '再投注 {v} 升{name}', vipTop: '最高等級', vipPaid: '上月回饋 {v} 已入帳',
    vipTitle: 'VIP 投注回饋', vipBody: '每月投注決定等級，下個月初自動回饋。免費，不用報名。', vipTier: '月投注 {min} 起 · 回饋 {back}',
    welcome: '第一次下注，就送 {v} 免費投注',
    forYou: '為你推薦', why_follow: '★ 追蹤 · {team}', why_backed: '↺ 押過 · {team}', why_like: '♥ 常看 · {team}', why_league: '你常玩的{league}', why_sport: '你常玩的{league}', why_value: '🔥 划算', why_steady: '✓ 穩', why_shot: '⚡ 值博', payLine: '押 {s} 可贏 {w}', comboMine: '為你串 3 場',
    combos: '精選串關', comboSafe: '穩膽 3 串', comboBold: '高賠 3 串', comboTag: '{n} 串 1', comboTagBoost: '{n} 串 1 · 加成 +{b}%', comboStake: '投注 {v} · 賠率 ×{x}', comboGo: '加入投注單'
  },
  en: {
    balance: 'Quadra balance', atStake: 'In play', slipsN: '{n} slips', cashNow: 'Cash out now', most: 'Most to win',
    live: 'Live now', allLive: 'All {n} live',
    featured: 'Featured', allGames: 'All games', markets: '{n} markets',
    mine: 'Your bets', seeAll: 'See all', legs: '{n} picks', cashOut: 'Cash out', paused: 'Suspended', freeBet: 'Free bet',
    lottery: 'Lottery', drawIn: 'Draw {when}', none: 'Games are loading, or none are on sale right now.', draw: 'Draw',
    overdrawn: 'Overdrawn · 1% a month', cover: 'Sell to cover',
    vipNone: 'VIP cashback', vipNoneSub: 'From {v} staked this month, up to {top} back', vipBack: '{p} back this month · about {v}', vipNext: '{v} more for {name}', vipTop: 'Top tier', vipPaid: 'Last month’s {v} paid in',
    vipTitle: 'VIP cashback', vipBody: 'A month’s stakes set your tier; the cashback arrives early next month. Free, nothing to sign up for.', vipTier: '{min}+ a month · {back} back',
    welcome: 'Place your first bet and get a {v} free bet',
    forYou: 'For you', why_follow: '★ Following · {team}', why_backed: '↺ Backed · {team}', why_like: '♥ Watching · {team}', why_league: 'Your {league}', why_sport: 'Your {league}', why_value: '🔥 Value', why_steady: '✓ Steady', why_shot: '⚡ Long shot', payLine: '{s} wins {w}', comboMine: 'Your treble',
    combos: 'Parlays of the day', comboSafe: 'Favourites treble', comboBold: 'Big-price treble', comboTag: '{n}-pick parlay', comboTagBoost: '{n}-pick · +{b}% boost', comboStake: 'Stake {v} · odds ×{x}', comboGo: 'Add to slip'
  }
};
let latest = null;

// Big money, short: NT$1.59億 / NT$158.8M.
export function compactMoney(x, lang) {
  if (lang === 'en') return x >= 1e6 ? `NT$${(x / 1e6).toFixed(1)}M` : `NT$${Math.round(x).toLocaleString('en-US')}`;
  if (x >= 1e8) return `NT$${(x / 1e8).toFixed(2)}億`;
  if (x >= 1e4) return `NT$${Math.round(x / 1e4).toLocaleString('en-US')}萬`;
  return `NT$${Math.round(x).toLocaleString('en-US')}`;
}

const norm = name =>
  String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/\b(fc|afc|cf|sc|and)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TIER_WEIGHT = { major: 0.6, minor: 0.3, thin: 0.05 };

// What 為你推薦 is drawn from on the pass (Orbit Sports' follows, every
// app's affinity): when it changes, home is drawn again (app.js).
export const tasteKey = wallet => JSON.stringify([fixturesTaste(cachedPayload, wallet), Object.keys(affinity(wallet, Date.now(), ['odds', 'stock', 'match'])).sort().slice(0, 40)]);
export function renderHome(ctx) {
  const { state, el, fmtMoney, fmtTime } = ctx;
  const root = document.getElementById('home-body');
  if (!root) return;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const T = TXT[lang];
  const f = (k, v = {}) => String(T[k]).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const now = Date.now();
  const money = v => fmtMoney(v, { sign: false });

  // ---- 焦點賽事: upcoming games with a win price on sale
  // Every app's affinity, Orbit Sports' too, and what the person follows there.
  const aff = affinity(state.wallet, now, ['odds', 'stock', 'match']);
  const taste = tasteOf({ aff, fixtures: fixturesTaste(cachedPayload, state.wallet), slips: state.account?.slips || [], now });
  const teamKey = (g, side) => `team:${g.sport}:${norm(g[side]?.en ?? g[side])}`;
  const betsOf = new Map();
  for (const b of state.bets || []) {
    if (!b.gameId) continue;
    if (!betsOf.has(b.gameId)) betsOf.set(b.gameId, []);
    betsOf.get(b.gameId).push(b);
  }
  // 為你推薦 first; 焦點賽事 then shows other games (and none already bet on).
  const mine = forYouPicks({ games: state.data?.games || [], bets: state.bets || [], recs: state.recs || new Map(), taste, now });
  const shownIds = new Set(mine.map(x => x.game.id));
  // Nor the teams already there (their later games): other teams below.
  const shownTeams = new Set(mine.flatMap(x => ['home', 'away'].map(side => teamKey(x.game, side))));
  const upcoming = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now && !taste.held.has(g.id) && !shownIds.has(g.id) && !shownTeams.has(teamKey(g, 'home')) && !shownTeams.has(teamKey(g, 'away')) && (betsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const items = upcoming.map(g => {
    const hours = (Date.parse(g.startUtc) - now) / 3_600_000;
    const keys = [`league:${g.sport}`, `sport:${g.sport}`, teamKey(g, 'away'), teamKey(g, 'home')];
    const quality = TIER_WEIGHT[ctx.leagueTier(g.sport)] + (hours < 18 ? 0.3 : hours < 42 ? 0.15 : 0) + gameInterest(g, taste).score * 0.5;
    return { id: `game:${g.id}`, game: g, keys, quality, group: g.sport };
  });
  // One game a league (two of a league the person likes).
  const featured = spreadLeagues(rank(items, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: 4 });

  // ---- 場中焦點: games on now with a live win price, ranked the same way
  const liveBetsOf = new Map();
  for (const b of state.liveBets || []) {
    if (!liveBetsOf.has(b.gameId)) liveBetsOf.set(b.gameId, []);
    liveBetsOf.get(b.gameId).push(b);
  }
  const onNow = (state.liveGames || []).filter(g => (liveBetsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const liveItems = onNow.map(g => ({ id: `live:${g.id}`, game: g, keys: [`league:${g.sport}`, `sport:${g.sport}`, teamKey(g, 'away'), teamKey(g, 'home')], quality: TIER_WEIGHT[ctx.leagueTier(g.sport)] + 0.3 + gameInterest(g, taste).score * 0.6 + (taste.held.has(g.id) ? 0.4 : 0), group: g.sport }));
  const liveTop = spreadLeagues(rank(liveItems, { wallet: state.wallet, n: 40, aff, now, diversity: 0.2, explore: 0 }), taste, { n: 3 });
  const liveCard = ({ game: g }) => {
    const bets = liveBetsOf.get(g.id) || [];
    const ml = bets.filter(b => b.kind === 'ml');
    const sides = ctx.isSoccer(g.sport) ? ['home', 'draw', 'away'] : ['away', 'home'];
    return el('article', { class: 'feature live' }, [
      el('button', { class: 'feature-top', type: 'button', onclick: () => ctx.openLive(g.id) }, [
        ctx.leagueImg(g.sport, 'logo-xs'),
        el('span', { class: 'feature-series', text: ctx.gameSeries(g) }),
        el('span', { class: 'feature-live' }, [el('span', { class: 'live-dot', text: ctx.state.t('tagLive') }), document.createTextNode(ctx.liveStateText(g.live))])
      ]),
      el('div', { class: 'feature-rows' }, sides.map(side => {
        const bet = ml.find(b => b.side === side);
        return el('div', { class: 'feature-row' }, [
          side === 'draw' ? el('span', { class: 'feature-draw', 'aria-hidden': 'true', text: '=' }) : ctx.logoImg(g.sport, g[side].en, ctx.teamName(g[side])),
          el('span', { class: 'feature-team', text: side === 'draw' ? T.draw : ctx.teamName(g[side]) }),
          side === 'draw' ? el('span') : el('strong', { class: 'feature-score num', text: String(g.live?.[`${side}Score`] ?? '') }),
          bet ? ctx.pickButton(bet, '') : el('span')
        ]);
      })),
      bets.length > ml.length ? el('button', { class: 'feature-more', type: 'button', onclick: () => ctx.openLive(g.id), text: `${f('markets', { n: bets.length })} ›` }) : null
    ]);
  };

  const featureCard = ({ game: g }) => {
    const bets = betsOf.get(g.id) || [];
    const ml = bets.filter(b => b.kind === 'ml');
    const sides = ctx.isSoccer(g.sport) ? ['home', 'draw', 'away'] : ['away', 'home'];
    const others = bets.length - ml.length;
    return el('article', { class: 'feature' }, [
      el('button', { class: 'feature-top', type: 'button', onclick: () => ctx.openGame(g.id) }, [
        ctx.leagueImg(g.sport, 'logo-xs'),
        el('span', { class: 'feature-series', text: ctx.gameSeries(g) }),
        el('span', { class: 'feature-time', text: fmtTime(g.startUtc) })
      ]),
      el('div', { class: 'feature-rows' }, sides.map(side => {
        const bet = ml.find(b => b.side === side);
        return el('div', { class: 'feature-row' }, [
          side === 'draw' ? el('span', { class: 'feature-draw', 'aria-hidden': 'true', text: '=' }) : ctx.logoImg(g.sport, g[side].en, ctx.teamName(g[side])),
          el('span', { class: 'feature-team', text: side === 'draw' ? T.draw : ctx.teamName(g[side]) }),
          bet ? ctx.pickButton(bet, '') : el('span')
        ]);
      })),
      others > 0 ? el('button', { class: 'feature-more', type: 'button', onclick: () => ctx.openGame(g.id), text: `${f('markets', { n: others + ml.length })} ›` }) : null
    ]);
  };

  // A 為你推薦 pick: why it's here, the team, the pick and what it pays.
  const STAKE = 500;
  const forYouCard = ({ bet, game: g, why, side, tag }) => {
    const team = side ? ctx.teamName(g[side]) : '';
    const league = state.t(`sport_${g.sport}`);
    const tone = why === 'follow' ? 'follow' : why === 'backed' ? 'backed' : tag || 'like';
    const face = side ?? (['home', 'away'].includes(bet.side) ? bet.side : null);
    return el('article', { class: `fy ${tone}` }, [
      el('button', { class: 'fy-top', type: 'button', onclick: () => ctx.openGame(g.id) }, [
        el('span', { class: 'fy-why', text: f(`why_${why}`, { team, league }) }),
        el('span', { class: 'fy-time', text: fmtTime(g.startUtc) })
      ]),
      el('button', { class: 'fy-game', type: 'button', onclick: () => ctx.openGame(g.id) }, [
        face ? ctx.logoImg(g.sport, g[face].en, ctx.teamName(g[face]), 'logo-lg') : ctx.leagueImg(g.sport, 'logo-lg'),
        el('span', { class: 'fy-text' }, [el('strong', { text: bet.shortLabel || bet.label }), el('small', { text: `${state.t(`sport_${g.sport}`)} · ${ctx.matchupText(g)}` })])
      ]),
      el('div', { class: 'fy-foot' }, [el('small', { class: 'num', text: f('payLine', { s: money(STAKE), w: money(Math.round(STAKE * bet.estOdds)) }) }), ctx.pickButton(bet, '')])
    ]);
  };

  // ---- 精選串關: two ready-made parlays from the big leagues' win prices,
  // one of favourites, one of longer prices; one pick a game, games in the
  // next two days, none that must be bought with more picks.
  const soonest = (a, b) => a.start.localeCompare(b.start);
  const winPicks = (state.bets || []).filter(b => b.kind === 'ml' && b.side !== 'draw' && !b.lock && !b.cap && !(b.minLegs > 3) && ctx.leagueTier(b.sport) !== 'thin' && Date.parse(b.start) > now && Date.parse(b.start) - now < 48 * 3_600_000);
  const onePerGame = list => {
    const seen = new Set();
    return list.filter(b => !seen.has(b.gameId) && seen.add(b.gameId));
  };
  // The person's leagues first, then the big ones; one pick a league.
  // Three sports when it can (two of one at most otherwise).
  const build = (lo, hi) => {
    const pool = onePerGame(winPicks.filter(b => b.estOdds >= lo && b.estOdds <= hi).sort((a, b) => leagueTaste(b.sport, taste) - leagueTaste(a.sport, taste) || (ctx.leagueTier(a.sport) === 'major' ? 0 : 1) - (ctx.leagueTier(b.sport) === 'major' ? 0 : 1) || soonest(a, b)));
    const wide = spreadLeagues(pool, taste, { n: 3, liked: 1, perSport: 1, sportOf: b => b.sport });
    return wide.length === 3 ? wide : spreadLeagues(pool, taste, { n: 3, liked: 1, perSport: 2, sportOf: b => b.sport });
  };
  const safe = build(1.3, 1.8);
  const bold = build(1.9, 4).filter(b => !safe.some(x => x.gameId === b.gameId));
  const PARLAY_STAKE = 500;
  const parlayCard = (legs, title, tone) => {
    const odds = legs.reduce((m, b) => m * b.estOdds, 1);
    const boost = ctx.boostPct(legs.length);
    return el('article', { class: `combo ${tone}` }, [
      el('div', { class: 'combo-head' }, [el('strong', { text: title }), el('span', { class: 'combo-tag', text: boost ? f('comboTagBoost', { n: legs.length, b: boost }) : f('comboTag', { n: legs.length }) })]),
      el('ul', { class: 'combo-legs' }, legs.map(b => {
        const g = (state.data?.games || []).find(x => x.id === b.gameId);
        return el('li', {}, [
          g && g[b.side] ? ctx.logoImg(g.sport, g[b.side].en, ctx.teamName(g[b.side]), 'logo-sm') : g ? ctx.leagueImg(g.sport, 'logo-sm') : null,
          el('span', { class: 'combo-pick' }, [el('strong', { text: b.shortLabel || b.label }), el('small', { text: [g ? ctx.gameSeries(g) : '', fmtTime(b.start)].filter(Boolean).join(' · ') })]),
          el('b', { class: 'num', text: ctx.fmtOdds(b.estOdds) })
        ]);
      })),
      el('div', { class: 'combo-foot' }, [
        el('span', { class: 'combo-pay' }, [el('small', { text: f('comboStake', { v: money(PARLAY_STAKE), x: ctx.fmtOdds(odds) }) }), el('strong', { class: 'num', text: money(ctx.parlayPays(legs, PARLAY_STAKE)) })]),
        el('button', { class: 'combo-go', type: 'button', text: T.comboGo, onclick: () => (ctx.track([...new Set(legs.flatMap(b => ctx.betKeys(b)))], 1), ctx.takeParlay(legs.map(b => b.id))) })
      ])
    ]);
  };
  const mineLegs = mine.filter(x => !x.bet.cap && !(x.bet.minLegs > 3)).slice(0, 3).map(x => x.bet);
  const combos = [mineLegs.length === 3 ? parlayCard(mineLegs, T.comboMine, 'mine') : null, safe.length === 3 ? parlayCard(safe, T.comboSafe, 'safe') : null, bold.length === 3 ? parlayCard(bold, T.comboBold, 'bold') : null].filter(Boolean);

  // ---- 你的投注: open slips and their cash-out prices
  const open = (state.account?.slips || []).filter(s => s.status === 'open' && !s.recovered && s.legs?.length);
  const atStake = open.reduce((s, x) => s + x.cost, 0);
  // A free bet's slip is never cashed out (like a sportsbook's): no price.
  const prices = new Map(open.filter(s => !s.free).map(s => [s.id, ctx.cashOutPrice(s)]));
  const cashable = [...prices.values()].reduce((s, v) => s + (v || 0), 0);
  const most = open.reduce((s, x) => s + Math.max(0, ctx.slipRange(x).most), 0);
  // A slip: its picks' pictures (a team's logo, a driver's face) overlapping,
  // the picks, when and how many, then what's in and what it can pay, each a
  // line of its own; its cash-out (or the free bet's mark) at the side.
  const slipRow = s => {
    const value = prices.get(s.id);
    const first = s.legs.map(l => l.start).filter(Boolean).sort()[0];
    const most = Math.max(0, ctx.slipRange(s).most);
    return el('div', { class: 'bet-row' }, [
      el('span', { class: `bet-pics n${Math.min(3, s.legs.length)}`, 'aria-hidden': 'true' }, s.legs.slice(0, 3).map(l => ctx.legIcon(l))),
      el('button', { class: 'bet-main', type: 'button', onclick: () => ctx.showTab('history') }, [
        el('strong', { text: s.legs.map(l => ctx.shortPick(l)).slice(0, 3).join('、') + (s.legs.length > 3 ? '…' : '') }),
        el('small', { text: [first ? ctx.fmtShort(first) : null, f('legs', { n: s.legs.length })].filter(Boolean).join(' · ') }),
        el('span', { class: 'bet-money num' }, [el('span', { text: money(s.cost) }), el('span', { class: 'bet-arrow', text: '→' }), el('strong', { text: money(most) })])
      ]),
      s.free
        ? el('span', { class: 'bet-cash off free' }, [icon('gift'), el('small', { text: T.freeBet })])
        : el('button', { class: `bet-cash${value == null ? ' off' : ''}`, type: 'button', disabled: value == null ? '' : null, onclick: () => ctx.doCashOut(s, value) }, [
            el('small', { text: value == null ? T.paused : T.cashOut }),
            value == null ? null : el('strong', { class: 'num', text: money(value) })
          ])
    ]);
  };

  // ---- Lottery jackpots
  if (!latest) {
    latest = {};
    latestResults()
      .then(r => ((latest = r), document.getElementById('panel-home')?.hidden === false && renderHome(ctx)))
      .catch(() => {});
  }
  const when = at => new Date(at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
  // Each game: its ball in its colour, the name and the next draw, the last
  // draw's numbers as small balls, and the jackpot (539: what a ticket costs).
  const ball = (n, cls = '') => el('span', { class: `jp-ball${cls ? ` ${cls}` : ''}`, text: String(n).padStart(2, '0') });
  const lottoCards = ['super638', 'lotto649', 'daily539'].map(id => {
    const d = nextDraw(id);
    const last = latest?.[id];
    const jp = last?.jackpot;
    const balls = last?.numbers?.length ? [...last.numbers.map(n => ball(n)), last.zone2 != null && Number.isFinite(last.zone2) ? ball(last.zone2, 'second') : null, last.special != null && Number.isFinite(last.special) ? ball(last.special, 'second') : null].filter(Boolean) : [];
    return el('button', { class: 'jackpot', type: 'button', style: `--lotto:${GAMES[id].color}`, onclick: () => ((state.lotteryView = 'draws'), ctx.showTab('lottery')) }, [
      el('span', { class: 'lotto-emblem jp-emblem', 'aria-hidden': 'true', text: gameName(id, lang).slice(0, 1) }),
      el('span', { class: 'jackpot-what' }, [
        el('span', { class: 'jackpot-top' }, [el('span', { class: 'jackpot-name', text: gameName(id, lang) }), el('strong', { class: 'jackpot-amount num', text: jp ? compactMoney(jp, lang) : money(GAMES[id].price) })]),
        el('small', { class: 'jackpot-when', text: d ? f('drawIn', { when: when(d.at) }) : '' }),
        balls.length ? el('span', { class: 'jp-balls' }, balls) : null
      ])
    ]);
  });

  // ---- VIP: this month's tier, its cashback so far, the next step
  const pct = x => `${Math.round(x * 1000) / 10}%`;
  function vipRow() {
    if (!state.wallet) return null;
    const v = vipStatus(state.wallet, now);
    const explain = () =>
      tell({ lang, icon: '◆', title: T.vipTitle, body: T.vipBody, points: VIP.tiers.map(x => [x.icon, vipName(x, lang), f('vipTier', { min: money(x.min), back: pct(x.back) })]) });
    const top = VIP.tiers.at(-1);
    const share = v.next ? Math.min(1, v.stakes / v.next.min) : 1;
    const paidNow = v.paid && Date.now() - v.paid.t < 7 * 86_400_000 ? f('vipPaid', { v: money(v.paid.amount) }) : '';
    return el('button', { class: `wallet-vip${v.tier ? ` vip-${v.tier.id}` : ''}`, type: 'button', onclick: explain }, [
      el('span', { class: 'vip-line' }, [
        el('strong', { text: v.tier ? vipName(v.tier, lang) : T.vipNone }),
        el('small', { class: 'num', text: v.tier ? f('vipBack', { p: pct(v.tier.back), v: money(v.back) }) : f('vipNoneSub', { v: money(VIP.tiers[0].min), top: pct(top.back) }) })
      ]),
      el('span', { class: 'vip-bar', 'aria-hidden': 'true' }, [el('i', { style: `width:${Math.round(share * 100)}%` })]),
      el('small', { class: 'vip-next num', text: paidNow || (v.next ? f('vipNext', { v: money(v.toNext), name: vipName(v.next, lang) }) : T.vipTop) })
    ]);
  }

  // ---- The balance
  const member = plusMember(state.wallet);
  const cash = state.account ? ctx.funds() : null;
  const header = el('section', { class: 'wallet-card' }, [
    el('div', { class: 'wallet-top' }, [el('span', { class: 'wallet-label', text: T.balance }), member ? el('span', { class: 'wallet-plus', text: '✦ PLUS' }) : null]),
    // Drawn from the saved board before the account has loaded: the balance a moment later.
    el('strong', { class: `wallet-balance num${cash < 0 ? ' neg' : ''}`, text: cash == null ? '…' : fmtMoney(cash, { sign: cash < 0 }) }),
    cash < 0
      ? el('button', { class: 'wallet-od', type: 'button', onclick: () => ctx.q.go('stock', 'portfolio') }, [el('span', { text: T.overdrawn }), el('strong', { text: `${T.cover} ›` })])
      : null,
    state.wallet && welcomeDue(state.wallet) ? el('p', { class: 'wallet-welcome' }, [icon('gift'), el('span', { text: f('welcome', { v: money(WELCOME.bet) }) })]) : null,
    open.length
      ? el('div', { class: 'wallet-stats' }, [
          el('div', {}, [el('small', { text: T.atStake }), el('strong', { class: 'num', text: `${money(atStake)} · ${f('slipsN', { n: open.length })}` })]),
          el('div', {}, cashable > 0 ? [el('small', { text: T.cashNow }), el('strong', { class: 'num', text: money(cashable) })] : [el('small', { text: T.most }), el('strong', { class: 'num', text: money(most) })])
        ])
      : null,
    vipRow()
  ]);

  // A section's title and its way to everything (no line under it: the cards say enough).
  const head = (title, { action = null } = {}) => el('div', { class: 'home-head' }, [el('div', {}, [el('h2', { text: title })]), action]);

  root.replaceChildren(
    ...[
      header,
      liveTop.length
        ? el('section', { class: 'home-block home-live' }, [
            head(`● ${T.live}`, { action: el('button', { class: 'home-link', type: 'button', text: `${f('allLive', { n: onNow.length })} ›`, onclick: () => ctx.openLive(null) }) }),
            el('div', { class: 'features' }, liveTop.map(liveCard))
          ])
        : null,
      mine.length ? el('section', { class: 'home-block home-foryou' }, [head(T.forYou), el('div', { class: 'fys' }, mine.map(forYouCard))]) : null,
      el('section', { class: 'home-block' }, [
        head(T.featured, { action: el('button', { class: 'home-link', type: 'button', text: `${T.allGames} ›`, onclick: () => ctx.showTab('games') }) }),
        featured.length ? el('div', { class: 'features' }, featured.map(featureCard)) : el('p', { class: 'empty', text: T.none })
      ]),
      combos.length ? el('section', { class: 'home-block' }, [head(T.combos), el('div', { class: 'combos' }, combos)]) : null,
      open.length
        ? el('section', { class: 'home-block' }, [
            head(`${T.mine} · ${open.length}`, { action: el('button', { class: 'home-link', type: 'button', text: `${T.seeAll} ›`, onclick: () => ctx.showTab('history') }) }),
            el('div', { class: 'bet-rows' }, open.slice(0, 5).map(slipRow))
          ])
        : null,
      el('section', { class: 'home-block' }, [head(T.lottery, { action: el('button', { class: 'home-link', type: 'button', text: `${T.seeAll} ›`, onclick: () => ctx.showTab('lottery') }) }), el('div', { class: 'jackpots' }, lottoCards)]),
      member ? null : el('section', { class: 'home-block' }, [plusCard(ctx.q)])
    ].filter(Boolean)
  );
}
