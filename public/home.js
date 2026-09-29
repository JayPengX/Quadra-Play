// The home tab: the few things worth a look now, nothing shouted.
//
// - The balance, with what's out in open bets and what they could cash out
//   for right now.
// - 焦點賽事: the games worth betting on, as the board shows them (the win
//   prices, a tap puts one on the slip). Ranked by the shared recommender
//   (quadra.mjs's rank): what's followed in Quadra Fixtures weighs most (the
//   wallet's 'follow:match'), then the teams, leagues and sports the person
//   bets on and opens; each game's own weight is its league (the big leagues
//   first, thinly traded ones last) and how soon it starts. One per game.
// - 你的投注: the open slips, each with its cash-out price.
// - The lottery's jackpots.
// - Quadra Plus, once, for someone who isn't a member.
import { rank, affinity, setting, plusMember, plusCard } from './lib/quadra.mjs';
import { GAMES, nextDraw, latestResults, gameName } from './lib/lottery.mjs';

const TXT = {
  zh: {
    balance: 'Quadra 餘額', atStake: '投注中', slipsN: '{n} 張', cashNow: '可兌現', most: '全中最多',
    featured: '焦點賽事', featuredSub: '依你追蹤和常玩的聯盟排序', allGames: '全部賽事', following: '追蹤中', markets: '{n} 種玩法',
    mine: '你的投注', seeAll: '全部', legs: '{n} 場', cashOut: '兌現', paused: '兌現暫停',
    lottery: '彩券', drawIn: '{when} 開獎', none: '賽事載入中，或目前沒有開賣的比賽。', draw: '和'
  },
  en: {
    balance: 'Quadra balance', atStake: 'In play', slipsN: '{n} slips', cashNow: 'Cash out now', most: 'Most to win',
    featured: 'Featured', featuredSub: 'By what you follow and play', allGames: 'All games', following: 'Following', markets: '{n} markets',
    mine: 'Your bets', seeAll: 'See all', legs: '{n} picks', cashOut: 'Cash out', paused: 'Suspended',
    lottery: 'Lottery', drawIn: 'Draw {when}', none: 'Games are loading, or none are on sale right now.', draw: 'Draw'
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

// What's followed in Fixtures, as affinity keys: a followed team weighs as
// much as the strongest habit, a followed league a little less, the first
// sports more than the later ones.
export function followAffinity(follow, top = 1) {
  const out = {};
  if (!follow) return out;
  const sports = follow.sports || [];
  sports.forEach((sp, i) => (out[`sport:${sp === 'tennis' || sp === 'racket' ? 'sets' : sp}`] = top * (0.6 - (0.3 * i) / Math.max(1, sports.length))));
  for (const k of follow.leagues || []) out[`league:${k}`] = Math.max(out[`league:${k}`] || 0, top * 0.7);
  for (const t of follow.teams || []) out[`team:${t.league}:${norm(t.name)}`] = top * 1.2;
  return out;
}

const TIER_WEIGHT = { major: 0.6, minor: 0.3, thin: 0.05 };

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
  const follow = setting(state.wallet, 'follow:match', null);
  const habits = affinity(state.wallet, now);
  const top = Math.max(1, ...Object.values(habits));
  const fromFixtures = followAffinity(follow, top);
  const aff = { ...habits };
  for (const [k, v] of Object.entries(fromFixtures)) aff[k] = Math.max(aff[k] || 0, v);
  const teamKey = (g, side) => `team:${g.sport}:${norm(g[side]?.en ?? g[side])}`;
  const followed = g => Boolean(fromFixtures[teamKey(g, 'away')] || fromFixtures[teamKey(g, 'home')]);
  const betsOf = new Map();
  for (const b of state.bets || []) {
    if (!b.gameId) continue;
    if (!betsOf.has(b.gameId)) betsOf.set(b.gameId, []);
    betsOf.get(b.gameId).push(b);
  }
  const upcoming = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now && (betsOf.get(g.id) || []).some(b => b.kind === 'ml' && !b.lock));
  const items = upcoming.map(g => {
    const hours = (Date.parse(g.startUtc) - now) / 3_600_000;
    const keys = [`league:${g.sport}`, `sport:${g.sport}`, teamKey(g, 'away'), teamKey(g, 'home')];
    const quality = TIER_WEIGHT[ctx.leagueTier(g.sport)] + (hours < 18 ? 0.3 : hours < 42 ? 0.15 : 0);
    return { id: `game:${g.id}`, game: g, keys, quality, group: g.sport };
  });
  const featured = rank(items, { wallet: state.wallet, n: 4, aff, now, diversity: 0.2, explore: 0 });

  const featureCard = ({ game: g }) => {
    const bets = betsOf.get(g.id) || [];
    const ml = bets.filter(b => b.kind === 'ml');
    const sides = ctx.isSoccer(g.sport) ? ['home', 'draw', 'away'] : ctx.isNeutral(g.sport) ? ['home', 'away'] : ['away', 'home'];
    const others = bets.length - ml.length;
    return el('article', { class: 'feature' }, [
      el('button', { class: 'feature-top', type: 'button', onclick: () => ctx.openGame(g.id) }, [
        ctx.leagueImg(g.sport, 'logo-xs'),
        el('span', { class: 'feature-series', text: ctx.gameSeries(g) }),
        followed(g) ? el('span', { class: 'feature-tag', text: T.following }) : null,
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

  // ---- 你的投注: open slips and their cash-out prices
  const open = (state.account?.slips || []).filter(s => s.status === 'open' && !s.recovered && s.legs?.length);
  const atStake = open.reduce((s, x) => s + x.cost, 0);
  const prices = new Map(open.map(s => [s.id, ctx.cashOutPrice(s)]));
  const cashable = [...prices.values()].reduce((s, v) => s + (v || 0), 0);
  const most = open.reduce((s, x) => s + Math.max(0, ctx.slipRange(x).most), 0);
  const slipRow = s => {
    const value = prices.get(s.id);
    const first = s.legs.map(l => l.start).filter(Boolean).sort()[0];
    return el('div', { class: 'bet-row' }, [
      el('button', { class: 'bet-main', type: 'button', onclick: () => ctx.showTab('history') }, [
        el('strong', { text: s.legs.map(l => l.shortLabel || l.label).slice(0, 2).join('、') + (s.legs.length > 2 ? '…' : '') }),
        el('small', { text: [f('legs', { n: s.legs.length }), first ? fmtTime(first) : null, `${money(s.cost)} → ${money(Math.max(0, ctx.slipRange(s).most))}`].filter(Boolean).join(' · ') })
      ]),
      el('button', { class: `bet-cash${value == null ? ' off' : ''}`, type: 'button', disabled: value == null ? '' : null, onclick: () => ctx.doCashOut(s, value) }, [
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
  const lottoCards = ['super638', 'lotto649', 'daily539'].map(id => {
    const d = nextDraw(id);
    const jp = latest?.[id]?.jackpot;
    return el('button', { class: 'jackpot', type: 'button', style: `--lotto:${GAMES[id].color}`, onclick: () => ((state.lotteryView = 'draws'), ctx.showTab('lottery')) }, [
      el('span', { class: 'jackpot-what' }, [el('span', { class: 'jackpot-name', text: gameName(id, lang) }), el('small', { text: d ? f('drawIn', { when: when(d.at) }) : '' })]),
      el('strong', { class: 'jackpot-amount num', text: jp ? compactMoney(jp, lang) : money(GAMES[id].price) })
    ]);
  });

  // ---- The balance
  const member = plusMember(state.wallet);
  const header = el('section', { class: 'wallet-card' }, [
    el('div', { class: 'wallet-top' }, [el('span', { class: 'wallet-label', text: T.balance }), member ? el('span', { class: 'wallet-plus', text: '✦ PLUS' }) : null]),
    el('strong', { class: 'wallet-balance num', text: money(ctx.funds()) }),
    open.length
      ? el('div', { class: 'wallet-stats' }, [
          el('div', {}, [el('small', { text: T.atStake }), el('strong', { class: 'num', text: `${money(atStake)} · ${f('slipsN', { n: open.length })}` })]),
          el('div', {}, cashable > 0 ? [el('small', { text: T.cashNow }), el('strong', { class: 'num', text: money(cashable) })] : [el('small', { text: T.most }), el('strong', { class: 'num', text: money(most) })])
        ])
      : null
  ]);

  const head = (title, { sub = '', action = null } = {}) =>
    el('div', { class: 'home-head' }, [el('div', {}, [el('h2', { text: title }), sub ? el('p', { class: 'home-sub', text: sub }) : null]), action]);

  root.replaceChildren(
    ...[
      header,
      el('section', { class: 'home-block' }, [
        head(T.featured, { sub: follow || Object.keys(habits).length ? T.featuredSub : '', action: el('button', { class: 'home-link', type: 'button', text: `${T.allGames} ›`, onclick: () => ctx.showTab('games') }) }),
        featured.length ? el('div', { class: 'features' }, featured.map(featureCard)) : el('p', { class: 'empty', text: T.none })
      ]),
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
