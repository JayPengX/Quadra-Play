// 紀錄 › 戰績: the wins. What's been won (bets paid, cashed out, lottery
// prizes) with its rhythm over time, the numbers worth bragging about,
// achievements to chase (each with its progress), the biggest moments, the
// sports that pay, and the way back to the board. A period filter on top.
import { gameName } from './lib/lottery.mjs';
import { CARDS } from './lib/scratch.mjs';

const T = {
  zh: {
    all: '全部', d30: '30 天', d7: '7 天',
    total: '累計中獎', totalSub: '中獎 {n} 次 · 最大一筆 {v}', none: '還沒有中獎紀錄，第一筆就在今天。', byWeek: '每週中獎', byDay: '每日中獎',
    month: '本月中獎', streak: '最長連中', streakN: '{n} 張', top: '最高倍數', cashed: '提前兌現', bigLotto: '彩券最大獎', winsN: '中獎次數', winsNV: '{n} 次',
    badges: '成就', badgesSub: '已解鎖 {k}/{n}', moments: '中獎時刻', momentsSub: '最大的幾筆', sports: '拿手運動', sportsSub: '依中獎金額',
    slipWin: '{n} 場', lottery: '彩券', scratch: '刮刮樂', cashTag: '提前兌現', freeTag: '免費投注',
    goBet: '看今天的比賽', goLotto: '買彩券', mixed: '混合串關',
    b_first: '首勝', b_firstD: '第一筆中獎',
    b_run3: '三連中', b_run3D: '連續 3 張投注單中獎',
    b_run5: '五連中', b_run5D: '連續 5 張投注單中獎',
    b_parlay3: '串關高手', b_parlay3D: '3 場以上串關全中',
    b_parlay5: '五串全中', b_parlay5D: '5 場以上串關全中',
    b_x10: '十倍奉還', b_x10D: '一張投注單拿回 10 倍以上',
    b_10k: '萬元大獎', b_10kD: '單筆中獎 NT$10,000 以上',
    b_lotto: '彩券得主', b_lottoD: '電腦彩券或刮刮樂中獎',
    b_cash: '見好就收', b_cashD: '用提前兌現獲利了結',
    b_100k: '十萬俱樂部', b_100kD: '累計中獎 NT$100,000',
    b_1m: '百萬贏家', b_1mD: '累計中獎 NT$1,000,000'
  },
  en: {
    all: 'All', d30: '30 days', d7: '7 days',
    total: 'Total won', totalSub: '{n} wins · biggest {v}', none: 'No wins yet: the first one could be today.', byWeek: 'Won by week', byDay: 'Won by day',
    month: 'Won this month', streak: 'Longest run', streakN: '{n} slips', top: 'Top multiple', cashed: 'Cashed out', bigLotto: 'Biggest lottery prize', winsN: 'Wins', winsNV: '{n}',
    badges: 'Achievements', badgesSub: '{k} of {n} unlocked', moments: 'Big moments', momentsSub: 'Your biggest wins', sports: 'Your best sports', sportsSub: 'By winnings',
    slipWin: '{n} picks', lottery: 'Lottery', scratch: 'Scratch card', cashTag: 'Cashed out', freeTag: 'Free bet',
    goBet: 'Today’s games', goLotto: 'Play the lottery', mixed: 'Mixed parlays',
    b_first: 'First win', b_firstD: 'Your first win',
    b_run3: 'Hat trick', b_run3D: '3 winning slips in a row',
    b_run5: 'On fire', b_run5D: '5 winning slips in a row',
    b_parlay3: 'Parlay pro', b_parlay3D: 'A 3+ pick parlay, every pick right',
    b_parlay5: 'Five for five', b_parlay5D: 'A 5+ pick parlay, every pick right',
    b_x10: 'Ten-bagger', b_x10D: 'A slip that paid 10× its stake',
    b_10k: 'Big win', b_10kD: 'A single win of NT$10,000+',
    b_lotto: 'Lucky ticket', b_lottoD: 'A lottery or scratch card prize',
    b_cash: 'Locked it in', b_cashD: 'A profit taken with cash out',
    b_100k: '100K club', b_100kD: 'NT$100,000 won in all',
    b_1m: 'Millionaire', b_1mD: 'NT$1,000,000 won in all'
  }
};
const PERIODS = { all: 0, d30: 30, d7: 7 };
const DAY = 86_400_000;
const TPE = 8 * 3_600_000;

export function mountStats(ctx) {
  const { state, el, fmtMoney, fmtTime, sportName } = ctx;
  const lang = () => (state.locale === 'en' ? 'en' : 'zh');
  const t = (key, vars = {}) => String(T[lang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const month = at => new Date(at + TPE).toISOString().slice(0, 7);
  const day = at => { const [, m, d] = new Date(at + TPE).toISOString().slice(0, 10).split('-'); return `${+m}/${+d}`; };
  const mult = x => `×${x.toFixed(x >= 10 ? 0 : 2)}`;

  // Every win from `since`: settled slips that paid (cashed out too), lottery
  // tickets and scratch cards that won.
  function wins(since = 0) {
    const account = state.account;
    const out = [];
    for (const s of account?.slips || []) {
      if (s.status !== 'settled' || !(s.payout > 0) || s.refunded) continue;
      const at = Date.parse(s.settledAt || s.t);
      if (at < since) continue;
      const legs = s.legs || [];
      const sports = [...new Set(legs.map(l => l.sport).filter(Boolean))];
      out.push({
        at,
        amount: s.payout,
        cost: s.cost,
        kind: 'slip',
        legs: legs.length,
        full: !s.cashedOut && legs.length > 1 && legs.every(l => l.result === 'won' || l.result === 'void'),
        cashed: Boolean(s.cashedOut),
        free: Boolean(s.freeBet || s.free),
        sport: sports.length === 1 ? sports[0] : 'mixed',
        title: legs.map(l => l.shortLabel || l.label).slice(0, 2).join('、') + (legs.length > 2 ? '…' : '')
      });
    }
    for (const x of account?.tickets || []) {
      if (x.status !== 'settled' || !(x.prize > 0)) continue;
      const at = Date.parse(x.settledAt || x.t);
      if (at < since) continue;
      out.push({ at, amount: x.prize, cost: x.cost, kind: 'lotto', card: Boolean(x.card), title: x.card ? CARDS[x.card]?.[lang() === 'en' ? 'en' : 'zh'] || t('scratch') : gameName(x.game, lang()) });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  // The longest run of paying slips, in the order they settled.
  function longestRun() {
    const settled = (state.account?.slips || []).filter(s => s.status === 'settled' && !s.recovered).sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)));
    let best = 0;
    let run = 0;
    for (const s of settled) {
      run = s.payout > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  // Achievements over the whole history: [key, done, progress 0-1, when].
  function achievements() {
    const all = wins();
    const slips = all.filter(w => w.kind === 'slip');
    const total = all.reduce((s, w) => s + w.amount, 0);
    const run = longestRun();
    const first = list => list.length ? list[list.length - 1].at : null;
    const topMult = Math.max(0, ...slips.filter(w => w.cost > 0).map(w => w.amount / w.cost));
    const best = Math.max(0, ...all.map(w => w.amount));
    const out = [
      ['first', all.length > 0, Math.min(1, all.length), first(all)],
      ['run3', run >= 3, Math.min(1, run / 3)],
      ['parlay3', slips.some(w => w.full && w.legs >= 3), slips.some(w => w.full) ? 0.5 : 0, first(slips.filter(w => w.full && w.legs >= 3))],
      ['x10', topMult >= 10, Math.min(1, topMult / 10), first(slips.filter(w => w.cost > 0 && w.amount / w.cost >= 10))],
      ['lotto', all.some(w => w.kind === 'lotto'), 0, first(all.filter(w => w.kind === 'lotto'))],
      ['cash', slips.some(w => w.cashed && w.amount > w.cost), 0, first(slips.filter(w => w.cashed && w.amount > w.cost))],
      ['run5', run >= 5, Math.min(1, run / 5)],
      ['parlay5', slips.some(w => w.full && w.legs >= 5), 0, first(slips.filter(w => w.full && w.legs >= 5))],
      ['10k', best >= 10_000, Math.min(1, best / 10_000), first(all.filter(w => w.amount >= 10_000))],
      ['100k', total >= 100_000, Math.min(1, total / 100_000)],
      ['1m', total >= 1_000_000, Math.min(1, total / 1_000_000)]
    ];
    return out.map(([key, done, progress, at]) => ({ key, done, progress: done ? 1 : progress, at: at ?? null }));
  }

  // Winnings over time: weeks (all), 3-day steps (30 days) or days (7 days).
  function rhythm(list, period) {
    const n = period === 'd7' ? 7 : period === 'd30' ? 10 : 8;
    const step = period === 'd7' ? DAY : period === 'd30' ? 3 * DAY : 7 * DAY;
    const end = Date.now();
    const bars = Array.from({ length: n }, (_, i) => ({ from: end - (n - i) * step, to: end - (n - 1 - i) * step, v: 0 }));
    for (const w of list) {
      const b = bars.find(x => w.at >= x.from && w.at < x.to);
      if (b) b.v += w.amount;
    }
    const max = Math.max(1, ...bars.map(b => b.v));
    return el('div', { class: 'wins-rhythm', role: 'img', 'aria-label': t(period === 'd7' ? 'byDay' : 'byWeek') }, bars.map((b, i) => el('span', { class: `wr-bar${b.v ? ' on' : ''}${i === n - 1 ? ' now' : ''}`, style: `--h:${Math.max(4, Math.round((b.v / max) * 100))}%`, title: money(b.v) })));
  }

  function render(root) {
    const period = state.statsPeriod || 'all';
    const since = PERIODS[period] ? Date.now() - PERIODS[period] * DAY : 0;
    const list = wins(since);
    const total = list.reduce((s, w) => s + w.amount, 0);
    const biggest = [...list].sort((a, b) => b.amount - a.amount);
    const rerender = () => render(root);
    const chips = el('div', { class: 'st-periods', role: 'group' }, Object.keys(PERIODS).map(key => el('button', { type: 'button', 'aria-pressed': String(period === key), text: t(key), onclick: () => ((state.statsPeriod = key), rerender()) })));
    const cta = el('div', { class: 'wins-cta' }, [
      el('button', { class: 'primary-button', type: 'button', text: t('goBet'), onclick: () => ctx.showTab('games') }),
      el('button', { class: 'ghost-button', type: 'button', text: t('goLotto'), onclick: () => ctx.showTab('lottery') })
    ]);
    const hero = el('section', { class: 'wins-hero' }, [
      el('div', { class: 'wins-hero-top' }, [el('span', { class: 'wins-label', text: t('total') }), el('span', { class: 'wins-period', text: t(period) })]),
      el('strong', { class: 'wins-total num', text: money(total) }),
      el('span', { class: 'wins-sub', text: list.length ? t('totalSub', { n: list.length, v: money(biggest[0].amount) }) : t('none') }),
      rhythm(list, period)
    ]);

    // Achievements: the whole history, whatever the period.
    const ach = achievements();
    const unlocked = ach.filter(a => a.done).length;
    const badge = a =>
      el('li', { class: `badge-card${a.done ? ' done' : ''}` }, [
        el('span', { class: 'badge-mark', 'aria-hidden': 'true', text: a.done ? '★' : '☆' }),
        el('span', { class: 'badge-text' }, [el('strong', { text: t(`b_${a.key}`) }), el('small', { text: a.done && a.at ? `${t(`b_${a.key}D`)} · ${day(a.at)}` : t(`b_${a.key}D`) })]),
        a.done ? null : el('span', { class: 'badge-progress', style: `--p:${Math.round(a.progress * 100)}%` })
      ]);
    // Unlocked first, then the nearest ones to unlock.
    const shown = [...ach].sort((x, y) => Number(y.done) - Number(x.done) || y.progress - x.progress);
    const badges = el('section', { class: 'st-card' }, [
      el('div', { class: 'st-head' }, [el('h3', { text: t('badges') }), el('p', { text: t('badgesSub', { k: unlocked, n: ach.length }) })]),
      el('ul', { class: 'badges' }, shown.map(badge))
    ]);

    if (!list.length) return root.replaceChildren(chips, hero, badges, cta);

    const thisMonth = wins(0).filter(w => month(w.at) === month(Date.now())).reduce((s, w) => s + w.amount, 0);
    const top = list.filter(w => w.kind === 'slip' && w.cost > 0).reduce((m, w) => Math.max(m, w.amount / w.cost), 0);
    const cashed = list.filter(w => w.cashed).reduce((s, w) => s + w.amount, 0);
    const lotto = list.filter(w => w.kind === 'lotto').sort((a, b) => b.amount - a.amount)[0];
    const tile = (label, value, sub = '') => el('div', { class: 'wins-tile' }, [el('small', { text: label }), el('strong', { class: 'num', text: value }), sub ? el('span', { text: sub }) : null]);
    const tiles = el('div', { class: 'wins-tiles' }, [
      tile(t('month'), money(thisMonth)),
      tile(t('winsN'), t('winsNV', { n: list.length })),
      tile(t('streak'), t('streakN', { n: longestRun() })),
      top > 1 ? tile(t('top'), mult(top)) : null,
      cashed > 0 ? tile(t('cashed'), money(cashed)) : null,
      lotto ? tile(t('bigLotto'), money(lotto.amount), lotto.title) : null
    ].filter(Boolean));

    const moment = (w, i) =>
      el('li', { class: `moment ${w.kind}` }, [
        el('span', { class: 'moment-rank num', text: String(i + 1) }),
        el('span', { class: 'moment-main' }, [
          el('strong', { text: w.title }),
          el('small', { text: [w.kind === 'lotto' ? t(w.card ? 'scratch' : 'lottery') : t('slipWin', { n: w.legs }), w.cashed ? t('cashTag') : '', w.free ? t('freeTag') : '', fmtTime(new Date(w.at).toISOString())].filter(Boolean).join(' · ') })
        ]),
        el('span', { class: 'moment-amt' }, [el('strong', { class: 'num', text: money(w.amount) }), w.cost > 0 && w.amount > w.cost ? el('small', { class: 'num', text: mult(w.amount / w.cost) }) : null])
      ]);

    const bySport = new Map();
    for (const w of list) if (w.kind === 'slip') bySport.set(w.sport, (bySport.get(w.sport) || 0) + w.amount);
    const sports = [...bySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(1, ...sports.map(s => s[1]));
    const sportTotal = sports.reduce((s, x) => s + x[1], 0) || 1;

    root.replaceChildren(
      chips,
      hero,
      tiles,
      badges,
      el('section', { class: 'st-card' }, [el('div', { class: 'st-head' }, [el('h3', { text: t('moments') }), el('p', { text: t('momentsSub') })]), el('ol', { class: 'moments' }, biggest.slice(0, 6).map(moment))]),
      sports.length
        ? el('section', { class: 'st-card' }, [
            el('div', { class: 'st-head' }, [el('h3', { text: t('sports') }), el('p', { text: t('sportsSub') })]),
            el('ul', { class: 'wins-bars' }, sports.map(([sport, v]) =>
              el('li', {}, [
                el('span', { class: 'wb-name', text: sport === 'mixed' ? t('mixed') : sportName(sport) }),
                el('span', { class: 'wb-track' }, [el('i', { style: `--w:${((v / max) * 100).toFixed(1)}%` })]),
                el('span', { class: 'wb-val' }, [el('strong', { class: 'num', text: money(v) }), el('small', { class: 'num', text: `${Math.round((v / sportTotal) * 100)}%` })])
              ])
            ))
          ])
        : null,
      cta
    );
  }

  return { render };
}
