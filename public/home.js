// The home tab: what to play now, for this person.
//
// For you: every pick on the board, ranked by the shared recommender
// (quadra.mjs's rank): the teams, leagues, drivers and markets the person
// bets on, opens and follows (in Fixtures too) weigh most, decaying over
// weeks; the quality of each pick comes from the board itself (its average
// back per NT$100 against the rest, the house's recommendation tag, how
// close the pick is to even money, how soon the game starts). One pick per
// game at most, and no league filling the list. A dismissed pick sinks.
//
// Then: your teams' next games, what starts soonest, the lottery jackpots
// and the slips still open.
import { rank, dismiss, affinity } from './lib/quadra.mjs';
import { GAMES, nextDraw, latestResults, gameName } from './lib/lottery.mjs';

const TXT = {
  zh: {
    forYou: '為你推薦', forYouSub: '依你下注、瀏覽和追蹤的球隊聯盟', yourTeams: '你的球隊', soon: '即將開賽', lottery: '彩券', openSlips: '進行中的投注單',
    why: { team: '你常下注的球隊', league: '你常玩的聯盟', sport: '你常玩的運動', market: '你常玩的玩法', driver: '你關注的車手', value: '划算', steady: '穩', shot: '值博', soon: '快開賽了', new: '試試看' },
    add: '加入投注單', added: '已加入', odds: '賠率', back: '每 100 平均拿回', none: '還沒有資料，先去看看賽事吧。', seeAll: '全部', jackpot: '頭獎', starts: '開賽', dismiss: '不感興趣'
  },
  en: {
    forYou: 'For you', forYouSub: 'From the teams and leagues you bet on, open and follow', yourTeams: 'Your teams', soon: 'Starting soon', lottery: 'Lottery', openSlips: 'Open slips',
    why: { team: 'A team you bet on', league: 'A league you play', sport: 'A sport you play', market: 'A play you like', driver: 'A driver you follow', value: 'Value', steady: 'Steady', shot: 'Worth a shot', soon: 'Starting soon', new: 'Something new' },
    add: 'Add to slip', added: 'On slip', odds: 'Odds', back: 'Back per 100', none: 'Nothing yet: have a look at the games first.', seeAll: 'See all', jackpot: 'Jackpot', starts: 'Starts', dismiss: 'Not interested'
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

export function renderHome(ctx) {
  const { state, el, fmtMoney, fmtOdds, fmtTime } = ctx;
  const root = document.getElementById('home-body');
  if (!root) return;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const T = TXT[lang];
  const now = Date.now();
  const bets = (state.bets || []).filter(b => !b.lock && b.estOdds > 1 && Date.parse(b.start || 0) > now);
  const aff = affinity(state.wallet, now);

  // ---- For you
  const items = bets.map(b => {
    const back = b.fairChance * b.estOdds;
    const rec = state.recs.get(b.id);
    const hours = (Date.parse(b.start) - now) / 3_600_000;
    // Close to even money reads best as a pick; value as the house sees it; soon.
    const quality = Math.max(0, Math.min(1, (back - 0.7) * 2.2)) * 0.5 + (rec ? 0.25 : 0) + (1 - Math.min(1, Math.abs(b.fairChance - 0.5) * 1.6)) * 0.15 + (hours < 12 ? 0.1 : hours < 48 ? 0.05 : 0);
    return { id: `odds:${b.id}`, bet: b, keys: ctx.betKeys(b), quality, group: b.gameId, rec };
  });
  const picked = rank(items, { wallet: state.wallet, n: 12, aff, now });
  const seen = new Set();
  const forYou = picked.filter(p => !seen.has(p.group) && seen.add(p.group)).slice(0, 10);

  const whyOf = p => {
    const k = p.why || '';
    const kind = k.split(':')[0];
    if (T.why[kind]) return T.why[kind];
    if (p.rec) return T.why[p.rec.tag];
    return (Date.parse(p.bet.start) - now) / 3_600_000 < 6 ? T.why.soon : T.why.new;
  };
  const pickCard = p => {
    const b = p.bet;
    const on = state.parlay.includes(b.id);
    const card = el('div', { class: 'q-rec home-pick', role: 'button', tabindex: '0', onclick: () => ctx.openGame(b.gameId) }, [
      el('span', { class: 'q-rec-why', text: whyOf(p) }),
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
    return card;
  };

  // ---- Your teams' next games
  const teamKeys = Object.entries(aff)
    .filter(([k]) => k.startsWith('team:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k]) => k);
  const games = (state.data?.games || []).filter(g => Date.parse(g.startUtc) > now);
  const teamOf = (g, side) => `team:${g.sport}:${String(g[side]?.en ?? g[side]).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').replace(/\b(fc|afc|cf|sc|and)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()}`;
  const mine = games.filter(g => teamKeys.includes(teamOf(g, 'away')) || teamKeys.includes(teamOf(g, 'home'))).slice(0, 10);
  const soon = games.slice(0, 10);
  const gameCard = g =>
    el('button', { class: 'q-rec home-game', type: 'button', onclick: () => ctx.openGame(g.id) }, [
      el('span', { class: 'q-rec-why', text: ctx.gameSeries(g) }),
      el('div', { class: 'home-teams' }, [
        el('span', {}, [ctx.logoImg(g.sport, g.away.en ?? g.away, g.away.zh ?? g.away, 'small'), el('span', { text: g.away[lang === 'en' ? 'en' : 'zh'] ?? g.away.en ?? g.away })]),
        el('span', {}, [ctx.logoImg(g.sport, g.home.en ?? g.home, g.home.zh ?? g.home, 'small'), el('span', { text: g.home[lang === 'en' ? 'en' : 'zh'] ?? g.home.en ?? g.home })])
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
      el('span', { class: 'q-rec-why', text: gameName(id, lang) }),
      el('p', { class: 'q-rec-big', text: jp ? compactMoney(jp, lang) : fmtMoney(GAMES[id].price, { sign: false }) }),
      el('p', { class: 'q-rec-sub', text: d ? new Date(d.at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }) : '' })
    ]);
  });

  // ---- Open slips
  const open = (state.account?.slips || []).filter(s => s.status === 'open');

  const section = (title, cards, { sub = '', tab = '' } = {}) =>
    cards.length
      ? el('section', { class: 'q-section' }, [
          el('div', { class: 'q-section-head' }, [el('h2', { text: title }), tab ? el('button', { type: 'button', text: T.seeAll, onclick: () => ctx.showTab(tab) }) : null]),
          sub ? el('p', { class: 'home-sub', text: sub }) : null,
          el('div', { class: 'q-recs' }, cards)
        ])
      : null;

  root.replaceChildren(
    ...[
      forYou.length ? section(T.forYou, forYou.map(pickCard), { sub: T.forYouSub, tab: 'games' }) : el('p', { class: 'empty', text: T.none }),
      section(T.yourTeams, mine.map(gameCard), { tab: 'games' }),
      section(T.soon, soon.map(gameCard), { tab: 'games' }),
      section(T.lottery, lottoCards, { tab: 'lottery' }),
      open.length
        ? el('section', { class: 'q-section' }, [
            el('div', { class: 'q-section-head' }, [el('h2', { text: `${T.openSlips} · ${open.length}` }), el('button', { type: 'button', text: T.seeAll, onclick: () => ctx.showTab('history') })])
          ])
        : null
    ].filter(Boolean)
  );
}
