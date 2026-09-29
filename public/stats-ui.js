// 紀錄 › 戰績: the wins. What's been won (bets paid, cashed out, lottery
// prizes), the biggest moments, streaks, the sports that pay, and the way
// back to the board. A period filter on top.
import { gameName } from './lib/lottery.mjs';
import { CARDS } from './lib/scratch.mjs';

const T = {
  zh: {
    all: '全部', d30: '30 天', d7: '7 天',
    total: '累計中獎', totalSub: '中獎 {n} 次 · 最大一筆 {v}', none: '還沒有中獎',
    month: '本月中獎', streak: '最長連中', streakN: '{n} 張', top: '最高倍數', cashed: '提前兌現', bigLotto: '彩券最大獎',
    moments: '中獎時刻', momentsSub: '最大的幾筆', sports: '拿手運動', sportsSub: '依中獎金額',
    slipWin: '{n} 場', lottery: '彩券', scratch: '刮刮樂', cashTag: '兌現',
    goBet: '看今天的比賽', goLotto: '買彩券'
  },
  en: {
    all: 'All', d30: '30 days', d7: '7 days',
    total: 'Total won', totalSub: '{n} wins · biggest {v}', none: 'No wins yet',
    month: 'Won this month', streak: 'Longest run', streakN: '{n} slips', top: 'Top multiple', cashed: 'Cashed out', bigLotto: 'Biggest lottery prize',
    moments: 'Big moments', momentsSub: 'Your biggest wins', sports: 'Your best sports', sportsSub: 'By winnings',
    slipWin: '{n} picks', lottery: 'Lottery', scratch: 'Scratch card', cashTag: 'Cashed out',
    goBet: 'Today’s games', goLotto: 'Play the lottery'
  }
};
const PERIODS = { all: 0, d30: 30, d7: 7 };

export function mountStats(ctx) {
  const { state, el, fmtMoney, fmtTime, sportName } = ctx;
  const lang = () => (state.locale === 'en' ? 'en' : 'zh');
  const t = (key, vars = {}) => String(T[lang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const TPE = 8 * 3_600_000;
  const month = at => new Date(at + TPE).toISOString().slice(0, 7);

  // Every win in the period: settled slips that paid, lottery tickets that won.
  function wins(since) {
    const account = state.account;
    const out = [];
    for (const s of account?.slips || []) {
      if (s.status !== 'settled' || !(s.payout > 0) || s.refunded) continue;
      const at = Date.parse(s.settledAt || s.t);
      if (at < since) continue;
      const sports = [...new Set((s.legs || []).map(l => l.sport).filter(Boolean))];
      out.push({ at, amount: s.payout, cost: s.cost, kind: 'slip', cashed: Boolean(s.cashedOut), sport: sports.length === 1 ? sports[0] : 'mixed', title: (s.legs || []).map(l => l.shortLabel || l.label).slice(0, 2).join('、') + ((s.legs || []).length > 2 ? '…' : ''), sub: t('slipWin', { n: (s.legs || []).length }) });
    }
    for (const x of account?.tickets || []) {
      if (x.status !== 'settled' || !(x.prize > 0)) continue;
      const at = Date.parse(x.settledAt || x.t);
      if (at < since) continue;
      const name = x.card ? CARDS[x.card]?.[lang() === 'en' ? 'en' : 'zh'] || t('scratch') : gameName(x.game, lang());
      out.push({ at, amount: x.prize, cost: x.cost, kind: 'lotto', title: name, sub: x.card ? t('scratch') : t('lottery') });
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

  function render(root) {
    const since = PERIODS[state.statsPeriod || 'all'] ? Date.now() - PERIODS[state.statsPeriod] * 86_400_000 : 0;
    const list = wins(since);
    const total = list.reduce((s, w) => s + w.amount, 0);
    const biggest = [...list].sort((a, b) => b.amount - a.amount);
    const rerender = () => render(root);
    const chips = el('div', { class: 'st-periods', role: 'group' }, Object.keys(PERIODS).map(key => el('button', { type: 'button', 'aria-pressed': String((state.statsPeriod || 'all') === key), text: t(key), onclick: () => ((state.statsPeriod = key), rerender()) })));
    const cta = el('div', { class: 'wins-cta' }, [
      el('button', { class: 'primary-button', type: 'button', text: t('goBet'), onclick: () => ctx.showTab('games') }),
      el('button', { class: 'ghost-button', type: 'button', text: t('goLotto'), onclick: () => ctx.showTab('lottery') })
    ]);
    const hero = el('section', { class: 'wins-hero' }, [
      el('span', { class: 'wins-label', text: t('total') }),
      el('strong', { class: 'wins-total num', text: money(total) }),
      el('span', { class: 'wins-sub', text: list.length ? t('totalSub', { n: list.length, v: money(biggest[0].amount) }) : t('none') })
    ]);
    if (!list.length) return root.replaceChildren(chips, hero, cta);

    const thisMonth = wins(0).filter(w => month(w.at) === month(Date.now())).reduce((s, w) => s + w.amount, 0);
    const top = list.filter(w => w.kind === 'slip' && w.cost > 0).reduce((m, w) => Math.max(m, w.amount / w.cost), 0);
    const cashed = list.filter(w => w.cashed).reduce((s, w) => s + w.amount, 0);
    const lotto = list.filter(w => w.kind === 'lotto').sort((a, b) => b.amount - a.amount)[0];
    const tile = (label, value, sub = '') => el('div', { class: 'wins-tile' }, [el('small', { text: label }), el('strong', { class: 'num', text: value }), sub ? el('span', { text: sub }) : null]);
    const tiles = el('div', { class: 'wins-tiles' }, [
      tile(t('month'), money(thisMonth)),
      tile(t('streak'), t('streakN', { n: longestRun() })),
      top > 1 ? tile(t('top'), `×${top.toFixed(top >= 10 ? 0 : 2)}`) : null,
      cashed > 0 ? tile(t('cashed'), money(cashed)) : null,
      lotto ? tile(t('bigLotto'), money(lotto.amount), lotto.title) : null
    ].filter(Boolean));

    const moment = w =>
      el('li', { class: 'moment' }, [
        el('span', { class: `moment-mark ${w.kind}`, 'aria-hidden': 'true', text: w.kind === 'lotto' ? '★' : '✓' }),
        el('span', { class: 'moment-main' }, [el('strong', { text: w.title }), el('small', { text: [w.sub, w.cashed ? t('cashTag') : '', fmtTime(new Date(w.at).toISOString())].filter(Boolean).join(' · ') })]),
        el('span', { class: 'moment-amt' }, [el('strong', { class: 'num', text: money(w.amount) }), w.cost > 0 && w.amount > w.cost ? el('small', { class: 'num', text: `×${(w.amount / w.cost).toFixed(2)}` }) : null])
      ]);

    const bySport = new Map();
    for (const w of list) if (w.kind === 'slip') bySport.set(w.sport, (bySport.get(w.sport) || 0) + w.amount);
    const sports = [...bySport.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(1, ...sports.map(s => s[1]));

    root.replaceChildren(
      chips,
      hero,
      tiles,
      el('section', { class: 'st-card' }, [el('div', { class: 'st-head' }, [el('h3', { text: t('moments') })]), el('ul', { class: 'moments' }, biggest.slice(0, 6).map(moment))]),
      sports.length
        ? el('section', { class: 'st-card' }, [
            el('div', { class: 'st-head' }, [el('h3', { text: t('sports') })]),
            el('ul', { class: 'wins-bars' }, sports.map(([sport, v]) => el('li', {}, [el('span', { text: sportName(sport) }), el('i', { style: `--w:${((v / max) * 100).toFixed(1)}%` }), el('strong', { class: 'num', text: money(v) })])))
          ])
        : null,
      cta
    );
  }

  return { render };
}
