// The home tab: what to play now, for this person.
//
// The header card: the Quadra balance, the money in open bets and the most
// they can pay, and the ways in (games, lottery, scratch cards, history).
//
// Your follows: the teams and leagues followed in Quadra Fixtures (the
// wallet's 'follow:match'), their games on the board, soonest first.
//
// For you: every pick on the board, ranked by the shared recommender
// (quadra.mjs's rank): what the person follows in Fixtures weighs most, then
// the teams, leagues, drivers and markets they bet on and open (decaying over
// weeks); the quality of each pick comes from the board itself (its average
// back per NT$100 against the rest, the house's recommendation tag, how
// close the pick is to even money, how soon the game starts). One pick per
// game at most, and no league filling the list. A dismissed pick sinks.
//
// Then: the open slips, the lottery jackpots and what starts soonest.
import { rank, dismiss, affinity, setting } from './lib/quadra.mjs';
import { GAMES, nextDraw, latestResults, gameName } from './lib/lottery.mjs';

const TXT = {
  zh: {
    forYou: '為你推薦', forYouSub: '依你在 Fixtures 追蹤的，以及你下注和瀏覽的球隊聯盟', follows: '你追蹤的比賽', followsSub: '來自 Quadra Fixtures 的追蹤', soon: '即將開賽', lottery: '彩券頭獎', openSlips: '進行中的投注單',
    why: { follow: '你追蹤的', team: '你常下注的球隊', league: '你常玩的聯盟', sport: '你常玩的運動', market: '你常玩的玩法', driver: '你關注的車手', value: '划算', steady: '穩', shot: '值博', soon: '快開賽了', new: '試試看' },
    add: '加入投注單', added: '已加入', none: '賽事還在載入，或暫時沒有可以下注的比賽。', seeAll: '全部', dismiss: '不感興趣',
    balance: 'Quadra 餘額', atStake: '投注中', most: '最多可拿', slipsN: '{n} 張', games: '賽事', lotto: '彩券', scratch: '刮刮樂', history: '紀錄', legs: '{n} 場', noFollows: '在 Quadra Fixtures 追蹤運動和球隊，這裡會先列出它們的比賽。', toFixtures: '到 Fixtures 追蹤', drawIn: '{when} 開獎'
  },
  en: {
    forYou: 'For you', forYouSub: 'From what you follow in Fixtures and the teams and leagues you bet on and open', follows: 'Games you follow', followsSub: 'From your follows in Quadra Fixtures', soon: 'Starting soon', lottery: 'Lottery jackpots', openSlips: 'Open slips',
    why: { follow: 'You follow this', team: 'A team you bet on', league: 'A league you play', sport: 'A sport you play', market: 'A play you like', driver: 'A driver you follow', value: 'Value', steady: 'Steady', shot: 'Worth a shot', soon: 'Starting soon', new: 'Something new' },
    add: 'Add to slip', added: 'On slip', none: 'The games are still loading, or there’s nothing to bet on right now.', seeAll: 'See all', dismiss: 'Not interested',
    balance: 'Quadra balance', atStake: 'At stake', most: 'Most to win', slipsN: '{n} slips', games: 'Games', lotto: 'Lottery', scratch: 'Scratch', history: 'History', legs: '{n} picks', noFollows: 'Follow sports and teams in Quadra Fixtures: their games show here first.', toFixtures: 'Follow in Fixtures', drawIn: 'Draw {when}'
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

const ICON = {
  games: '<path d="M4 5h16v14H4z"/><path d="M4 9h16M9 5v14"/>',
  lotto: '<circle cx="8" cy="8" r="3.5"/><circle cx="16" cy="8" r="3.5"/><circle cx="8" cy="16" r="3.5"/><circle cx="16" cy="16" r="3.5"/>',
  scratch: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 13c2-3 4 1 6-2s3 0 4-1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>'
};

export function renderHome(ctx) {
  const { state, el, fmtMoney, fmtOdds, fmtTime } = ctx;
  const root = document.getElementById('home-body');
  if (!root) return;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const T = TXT[lang];
  const f = (k, v = {}) => String(T[k]).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const now = Date.now();
  const bets = (state.bets || []).filter(b => !b.lock && b.estOdds > 1 && Date.parse(b.start || 0) > now);
  const follow = setting(state.wallet, 'follow:match', null);
  const habits = affinity(state.wallet, now);
  const top = Math.max(1, ...Object.values(habits));
  const fromFixtures = followAffinity(follow, top);
  const aff = { ...habits };
  for (const [k, v] of Object.entries(fromFixtures)) aff[k] = Math.max(aff[k] || 0, v);
  const followedKeys = new Set(Object.keys(fromFixtures).filter(k => k.startsWith('team:') || k.startsWith('league:')));

  // ---- For you
  const items = bets.map(b => {
    const back = b.fairChance * b.estOdds;
    const rec = state.recs.get(b.id);
    const hours = (Date.parse(b.start) - now) / 3_600_000;
    const quality = Math.max(0, Math.min(1, (back - 0.7) * 2.2)) * 0.5 + (rec ? 0.25 : 0) + (1 - Math.min(1, Math.abs(b.fairChance - 0.5) * 1.6)) * 0.15 + (hours < 12 ? 0.1 : hours < 48 ? 0.05 : 0);
    return { id: `odds:${b.id}`, bet: b, keys: ctx.betKeys(b), quality, group: b.gameId, rec };
  });
  const picked = rank(items, { wallet: state.wallet, n: 12, aff, now });
  const seen = new Set();
  const forYou = picked.filter(p => !seen.has(p.group) && seen.add(p.group)).slice(0, 10);

  const whyOf = p => {
    const k = p.why || '';
    if (followedKeys.has(k)) return T.why.follow;
    const kind = k.split(':')[0];
    if (T.why[kind]) return T.why[kind];
    if (p.rec) return T.why[p.rec.tag];
    return (Date.parse(p.bet.start) - now) / 3_600_000 < 6 ? T.why.soon : T.why.new;
  };
  const gameOf = id => state.data?.games.find(g => g.id === id);
  const sideName = s => (s ? s[lang === 'en' ? 'en' : 'zh'] ?? s.en ?? s : '');
  const logos = g => (g ? el('span', { class: 'pick-logos' }, [ctx.logoImg(g.sport, g.away.en ?? g.away, sideName(g.away), 'small'), ctx.logoImg(g.sport, g.home.en ?? g.home, sideName(g.home), 'small')]) : null);
  const pickCard = p => {
    const b = p.bet;
    const on = state.parlay.includes(b.id);
    return el('div', { class: 'q-rec home-pick', role: 'button', tabindex: '0', onclick: () => ctx.openGame(b.gameId) }, [
      el('div', { class: 'pick-head' }, [logos(gameOf(b.gameId)), el('span', { class: 'q-rec-why', text: whyOf(p) })]),
      el('p', { class: 'q-rec-title', text: b.shortLabel || b.label }),
      el('p', { class: 'q-rec-sub', text: `${b.matchup} · ${fmtTime(b.start)}` }),
      el('div', { class: 'q-rec-foot' }, [
        el('span', { class: 'q-rec-big', text: fmtOdds(b.estOdds) }),
        el('button', {
          class: `q-btn small${on ? '' : ' primary'}`,
          type: 'button',
          text: on ? T.added : T.add,
          onclick: e => {
            e.stopPropagation();
            ctx.toggleLeg(b);
            ctx.track(null, p.keys, 1);
            renderHome(ctx);
          }
        })
      ]),
      el('button', {
        class: 'q-rec-x',
        type: 'button',
        'aria-label': T.dismiss,
        title: T.dismiss,
        text: '×',
        onclick: e => {
          e.stopPropagation();
          dismiss(p.id);
          renderHome(ctx);
        }
      })
    ]);
  };

  // ---- Games: followed (Fixtures) first, then the soonest
  const games = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now);
  const teamKey = (g, side) => `team:${g.sport}:${norm(g[side]?.en ?? g[side])}`;
  const followedGame = g => followedKeys.has(teamKey(g, 'away')) || followedKeys.has(teamKey(g, 'home'));
  const mine = [...games.filter(followedGame), ...games.filter(g => !followedGame(g) && followedKeys.has(`league:${g.sport}`))].slice(0, 10);
  const soon = games.filter(g => !mine.includes(g)).slice(0, 10);
  const gameCard = g =>
    el('button', { class: `q-rec home-game${followedGame(g) ? ' mine' : ''}`, type: 'button', onclick: () => ctx.openGame(g.id) }, [
      el('span', { class: 'q-rec-why', text: ctx.gameSeries(g) }),
      el('div', { class: 'home-teams' }, [
        el('span', {}, [ctx.logoImg(g.sport, g.away.en ?? g.away, sideName(g.away), 'small'), el('span', { text: sideName(g.away) })]),
        el('span', {}, [ctx.logoImg(g.sport, g.home.en ?? g.home, sideName(g.home), 'small'), el('span', { text: sideName(g.home) })])
      ]),
      el('p', { class: 'q-rec-sub', text: fmtTime(g.startUtc) })
    ]);

  // ---- Lottery
  if (!latest) {
    latest = {};
    latestResults()
      .then(r => ((latest = r), document.getElementById('panel-home')?.hidden === false && renderHome(ctx)))
      .catch(() => {});
  }
  const lottoCards = ['super638', 'lotto649', 'daily539', 'bingo'].map(id => {
    const d = nextDraw(id);
    const jp = latest?.[id]?.jackpot;
    return el('button', { class: 'q-rec home-lotto', type: 'button', style: `--lotto:${GAMES[id].color}`, onclick: () => ctx.showTab('lottery') }, [
      el('div', { class: 'pick-head' }, [el('span', { class: 'lotto-emblem', 'aria-hidden': 'true', text: gameName(id, lang).slice(0, 1) }), el('span', { class: 'q-rec-why', text: gameName(id, lang) })]),
      el('p', { class: 'q-rec-big', text: jp ? compactMoney(jp, lang) : fmtMoney(GAMES[id].price, { sign: false }) }),
      el('p', { class: 'q-rec-sub', text: d ? f('drawIn', { when: new Date(d.at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }) }) : '' })
    ]);
  });

  // ---- Open slips
  const open = (state.account?.slips || []).filter(s => s.status === 'open' && !s.recovered);
  const atStake = open.reduce((s, x) => s + x.cost, 0);
  const most = open.reduce((s, x) => s + Math.max(0, x.cost + ctx.slipRange(x).most), 0);
  const slipRow = s =>
    el('button', { class: 'home-slip', type: 'button', onclick: () => ctx.showTab('history') }, [
      el('div', { class: 'hs-main' }, [el('strong', { text: s.legs.map(l => l.shortLabel || l.label).slice(0, 2).join('、') + (s.legs.length > 2 ? '…' : '') }), el('small', { text: `${f('legs', { n: s.legs.length })} · ${fmtTime(s.legs.map(l => l.start).filter(Boolean).sort()[0] || s.t)}` })]),
      el('div', { class: 'hs-money' }, [el('small', { text: fmtMoney(s.cost, { sign: false }) }), el('strong', { text: fmtMoney(Math.max(0, s.cost + ctx.slipRange(s).most), { sign: false }) })])
    ]);

  // ---- The header card
  const action = (key, tab, lotteryView) =>
    el('button', { class: 'hero-action', type: 'button', onclick: () => (lotteryView && (state.lotteryView = lotteryView), ctx.showTab(tab)) }, [icon(key), el('span', { text: T[key] })]);
  function icon(key) {
    const span = el('span', { class: 'hero-icon' });
    span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[key]}</svg>`;
    return span;
  }
  const hero = el('section', { class: 'play-hero' }, [
    el('div', { class: 'hero-brand' }, [el('img', { src: './favicon.svg', alt: '', width: '40', height: '40' }), el('div', {}, [el('p', { class: 'hero-kicker', text: 'QUADRA' }), el('h2', { text: 'Quadra Play' })])]),
    el('p', { class: 'hero-label', text: T.balance }),
    el('p', { class: 'hero-balance num', text: fmtMoney(ctx.funds(), { sign: false }) }),
    el('div', { class: 'hero-stats' }, [
      el('div', {}, [el('small', { text: T.atStake }), el('strong', { class: 'num', text: `${fmtMoney(atStake, { sign: false })} · ${f('slipsN', { n: open.length })}` })]),
      el('div', {}, [el('small', { text: T.most }), el('strong', { class: 'num', text: fmtMoney(most, { sign: false }) })])
    ]),
    el('div', { class: 'hero-actions' }, [action('games', 'games'), action('lotto', 'lottery', 'draws'), action('scratch', 'lottery', 'scratch'), action('history', 'history')])
  ]);

  const section = (title, cards, { sub = '', tab = '', cls = '' } = {}) =>
    cards.length
      ? el('section', { class: `q-section ${cls}` }, [
          el('div', { class: 'q-section-head' }, [el('h2', { text: title }), tab ? el('button', { type: 'button', text: T.seeAll, onclick: () => ctx.showTab(tab) }) : null]),
          sub ? el('p', { class: 'home-sub', text: sub }) : null,
          el('div', { class: 'q-recs' }, cards)
        ])
      : null;

  root.replaceChildren(
    ...[
      hero,
      mine.length
        ? section(T.follows, mine.map(gameCard), { sub: T.followsSub, tab: 'games' })
        : !follow
          ? el('a', { class: 'home-nudge', href: ctx.q.appUrl('match', 'following'), onclick: e => (e.preventDefault(), ctx.q.go('match', 'following')) }, [el('span', { text: T.noFollows }), el('strong', { text: `${T.toFixtures} ›` })])
          : null,
      forYou.length ? section(T.forYou, forYou.map(pickCard), { sub: T.forYouSub, tab: 'games' }) : el('p', { class: 'empty', text: T.none }),
      open.length
        ? el('section', { class: 'q-section' }, [
            el('div', { class: 'q-section-head' }, [el('h2', { text: `${T.openSlips} · ${open.length}` }), el('button', { type: 'button', text: T.seeAll, onclick: () => ctx.showTab('history') })]),
            el('div', { class: 'home-slips' }, open.slice(0, 4).map(slipRow))
          ])
        : null,
      section(T.lottery, lottoCards, { tab: 'lottery' }),
      section(T.soon, soon.map(gameCard), { tab: 'games' })
    ].filter(Boolean)
  );
}
