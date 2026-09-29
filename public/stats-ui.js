// 紀錄 › 統計分析: your betting and lottery in pictures. A period filter,
// the result up top, the balance over time, week by week, luck against the
// lottery's cut, whether the chances were right, sports, the lottery,
// where the money came from, records; the long reads (your profile, the
// crowd, fun facts, breakdowns) fold away underneath.
import { historyStats, moneySources, lotteryStats, accountSince } from './lib/history.mjs';
import { gameName } from './lib/lottery.mjs';

const T = {
  zh: {
    all: '全部', d30: '30 天', d7: '7 天', total: '總輸贏', split: '運彩 {a} · 彩券 {b}', betting: '運彩', lottoLuck: '彩券：運氣 vs 抽成', lottoLuckNote: '電腦彩券每 NT$100 平均只拿回約 50-60，刮刮樂約 63-75（越貴的越高），剩下的是彩券的抽成與稅。', items: '各項目', drawGames: '電腦彩券', bigPrize: '彩券最大獎', net: '下注淨輸贏', lede: '{n} 張 · 下注 {staked} · 拿回 {paid}', hit: '中獎率', back: '每百拿回', open: '進行中', odds: '照賠率 {v}',
    balance: '餘額走勢', balanceSub: 'Play 帳本（下注、派彩、彩券、補助）', low: '最低 {v}', high: '最高 {v}',
    weeks: '每週輸贏', weeksSub: '投注單和彩券，依開獎、結算那週', luck: '運氣 vs 抽成', luckExp: '照賠率應拿回', luckGot: '實際拿回', per100: '每 NT$100',
    luckGood: '比預期好：大約只有 {p}% 的人手氣這麼好。', luckBad: '比預期差：大約只有 {p}% 的人手氣這麼差。', luckNormal: '和預期差不多：這就是長期平均。', luckNote: '運氣會隨著張數越多越平均；抽成不會。',
    calib: '選得準不準', calibSub: '機率區間：實際中的比例（條）vs 照機率該中（線）', picks: '{n} 個選項',
    sports: '各運動', slips: '{n} 張', lottery: '彩券', tickets: '張數', spent: '花費', won: '中獎', lottoBack: '每百拿回', best: '最大一筆：{game} {v}', scratch: '刮刮樂', noLotto: '還沒買過彩券。',
    flow: '錢從哪來、到哪去', in: '進帳', out: '支出', start: '開戶金', grants: '每週補助', games: '小遊戲', payouts: '投注派彩', prizes: '彩券獎金', stakes: '下注', lotto: '買彩券',
    records: '紀錄', streakNow: '目前', winN: '連中 {n}', lossN: '連槓 {n}', bestStreak: '最長連中', worstStreak: '最長連槓', bestSlip: '賺最多的一張', worstSlip: '虧最多的一張', longest: '最高倍數', avg: '平均每張', tax: '已繳稅', none: '—',
    more: '更多分析', empty: '這段時間沒有投注或彩券。', wait: '還沒有結算的投注單，比賽結束後這裡會有完整分析。'
  },
  en: {
    all: 'All', d30: '30 days', d7: '7 days', total: 'Overall result', split: 'Betting {a} · Lottery {b}', betting: 'Betting', lottoLuck: 'Lottery: luck vs the cut', lottoLuckNote: 'Draw games pay back only about 50-60 per NT$100, scratch cards about 63-75 (dearer ones more); the rest is the lottery’s cut and tax.', items: 'By game', drawGames: 'Draw games', bigPrize: 'Biggest lottery prize', net: 'Betting result', lede: '{n} slips · staked {staked} · back {paid}', hit: 'Hit rate', back: 'Back per 100', open: 'Open', odds: 'Odds say {v}',
    balance: 'Balance', balanceSub: 'Play’s own books (bets, payouts, lottery, grants)', low: 'Low {v}', high: 'High {v}',
    weeks: 'Week by week', weeksSub: 'Slips and lottery tickets, by the week they settled', luck: 'Luck vs the cut', luckExp: 'The odds said', luckGot: 'You got back', per100: 'per NT$100',
    luckGood: 'Better than expected: only about {p}% get a run this good.', luckBad: 'Worse than expected: only about {p}% get a run this bad.', luckNormal: 'About as expected: this is the long-run average.', luckNote: 'Luck evens out over more slips; the cut doesn’t.',
    calib: 'Were the chances right?', calibSub: 'By chance: how often picks won (bar) vs the odds (line)', picks: '{n} picks',
    sports: 'By sport', slips: '{n} slips', lottery: 'Lottery', tickets: 'Tickets', spent: 'Spent', won: 'Won', lottoBack: 'Back per 100', best: 'Biggest: {game} {v}', scratch: 'Scratch cards', noLotto: 'No lottery tickets yet.',
    flow: 'Money in and out', in: 'In', out: 'Out', start: 'Opening money', grants: 'Weekly grants', games: 'Mini games', payouts: 'Slip payouts', prizes: 'Lottery prizes', stakes: 'Stakes', lotto: 'Lottery tickets',
    records: 'Records', streakNow: 'Now', winN: '{n} won in a row', lossN: '{n} lost in a row', bestStreak: 'Longest winning run', worstStreak: 'Longest losing run', bestSlip: 'Best slip', worstSlip: 'Worst slip', longest: 'Longest odds won', avg: 'Average slip', tax: 'Tax paid', none: '—',
    more: 'More', empty: 'Nothing bet or bought in this period.', wait: 'No settled slips yet: the full picture comes once games are over.'
  }
};
const PERIODS = { all: 0, d30: 30, d7: 7 };

export function mountStats(ctx) {
  const { state, el, svgEl, fmtMoney, fmtInt, fmtPctShort, fmtOdds, fmtTime } = ctx;
  const lang = () => (state.locale === 'en' ? 'en' : 'zh');
  const t = (key, vars = {}) => String(T[lang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const tone = v => (v > 0.5 ? 'up' : v < -0.5 ? 'down' : '');
  const card = (title, sub, ...kids) => el('section', { class: 'st-card' }, [el('div', { class: 'st-head' }, [el('h3', { text: title }), sub ? el('p', { text: sub }) : null]), ...kids.filter(Boolean)]);

  // ---- Pieces ------------------------------------------------------------------------
  function periodChips(rerender) {
    return el(
      'div',
      { class: 'st-periods', role: 'group' },
      Object.keys(PERIODS).map(key => el('button', { type: 'button', 'aria-pressed': String((state.statsPeriod || 'all') === key), text: t(key), onclick: () => ((state.statsPeriod = key), rerender()) }))
    );
  }

  // A ring: `value` of 1, with a tick where the odds said it should be.
  function ring(value, expected, label, text, sub) {
    const r = 26;
    const c = 2 * Math.PI * r;
    const svg = svgEl('svg', { viewBox: '0 0 64 64', class: 'st-ring', 'aria-hidden': 'true' });
    svg.append(svgEl('circle', { cx: 32, cy: 32, r, class: 'st-ring-bg' }));
    if (value != null) svg.append(svgEl('circle', { cx: 32, cy: 32, r, class: 'st-ring-fg', 'stroke-dasharray': `${Math.max(0, Math.min(1, value)) * c} ${c}`, transform: 'rotate(-90 32 32)' }));
    if (expected != null) {
      const a = Math.min(1, expected) * 2 * Math.PI - Math.PI / 2;
      svg.append(svgEl('line', { class: 'st-ring-tick', x1: 32 + 21 * Math.cos(a), y1: 32 + 21 * Math.sin(a), x2: 32 + 31 * Math.cos(a), y2: 32 + 31 * Math.sin(a) }));
    }
    return el('div', { class: 'st-metric' }, [el('div', { class: 'st-ring-box' }, [svg, el('strong', { class: 'num', text })]), el('span', { text: label }), sub ? el('small', { text: sub }) : null]);
  }

  // The top: betting and the lottery together, then each; the betting
  // rings under it when there are slips, the lottery's when there are only tickets.
  function hero(s, l) {
    const hit = s.settled ? s.paidSlips / s.settled : null;
    const expHit = s.settled ? s.expectedPaidSlips / s.settled : null;
    const total = (s.placed ? s.net : 0) + (l.n ? l.net : 0);
    const lede = s.placed && l.n ? t('split', { a: fmtMoney(s.net), b: fmtMoney(l.net) }) : s.placed ? t('lede', { n: fmtInt(s.placed), staked: money(s.staked), paid: money(s.paid) }) : `${t('lottery')} · ${t('tickets')} ${fmtInt(l.n)} · ${t('spent')} ${money(l.spent)}`;
    return el('section', { class: `st-hero ${{ up: 'pos', down: 'neg' }[tone(total)] || ''}` }, [
      el('p', { class: 'st-kicker', text: t('total') }),
      el('p', { class: 'st-big num', text: fmtMoney(total) }),
      el('p', { class: 'st-lede', text: lede }),
      !s.placed
        ? el('div', { class: 'st-metrics' }, [
            ring(l.n - l.open ? l.wins / (l.n - l.open) : null, null, t('hit'), l.n - l.open ? fmtPctShort(l.wins / (l.n - l.open)) : '–', null),
            ring(l.back == null ? null : l.back / 200, l.expectedBack == null ? null : l.expectedBack / 200, t('lottoBack'), l.back == null ? '–' : fmtInt(Math.round(l.back)), l.expectedBack == null ? null : t('odds', { v: fmtInt(Math.round(l.expectedBack)) })),
            el('div', { class: 'st-metric' }, [el('div', { class: 'st-ring-box plain' }, [el('strong', { class: 'num', text: fmtInt(l.open) })]), el('span', { text: t('open') }), el('small', { class: 'num', text: '' })])
          ])
        : null,
      !s.placed ? null : el('div', { class: 'st-metrics' }, [
        ring(hit, expHit, t('hit'), hit == null ? '–' : fmtPctShort(hit), expHit == null ? null : t('odds', { v: fmtPctShort(expHit) })),
        ring(s.settled ? s.back / 200 : null, s.settled ? s.expectedBack / 200 : null, t('back'), s.settled ? fmtInt(Math.round(s.back)) : '–', s.settled ? t('odds', { v: fmtInt(Math.round(s.expectedBack)) }) : null),
        el('div', { class: 'st-metric' }, [el('div', { class: 'st-ring-box plain' }, [el('strong', { class: 'num', text: fmtInt(s.open) })]), el('span', { text: t('open') }), el('small', { class: 'num', text: money(s.openStake) })])
      ])
    ]);
  }

  // The balance over time: an area under a step line.
  function balanceCard(timeline, since) {
    const pts = timeline.filter(p => !since || Date.parse(p.t) >= since);
    if (pts.length < 2) return null;
    const w = 340;
    const h = 150;
    const pad = { t: 14, b: 22, l: 4, r: 4 };
    const vals = pts.map(p => p.balance);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const t0 = Date.parse(pts[0].t);
    const t1 = Date.parse(pts.at(-1).t) || t0 + 1;
    const x = p => pad.l + ((Date.parse(p.t) - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r);
    const y = v => pad.t + ((hi - v) / (hi - lo || 1)) * (h - pad.t - pad.b);
    let d = `M${x(pts[0]).toFixed(1)},${y(vals[0]).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += `H${x(pts[i]).toFixed(1)}V${y(vals[i]).toFixed(1)}`;
    const up = vals.at(-1) >= vals[0];
    const svg = svgEl('svg', { class: `st-area ${up ? 'up' : 'down'}`, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': t('balance') });
    const id = `stg${Math.random().toString(36).slice(2, 7)}`;
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { offset: '0%', class: 'st-stop-a' }), svgEl('stop', { offset: '100%', class: 'st-stop-b' }));
    defs.append(grad);
    svg.append(defs, svgEl('path', { d: `${d}V${h - pad.b}H${x(pts[0]).toFixed(1)}Z`, fill: `url(#${id})`, class: 'st-fill' }), svgEl('path', { d, class: 'st-line' }));
    const last = pts.at(-1);
    svg.append(svgEl('circle', { cx: x(last), cy: y(last.balance), r: 3.5, class: 'st-dot' }));
    const day = iso => new Date(iso).toLocaleDateString(lang() === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Taipei' });
    return card(
      t('balance'),
      t('balanceSub'),
      el('p', { class: 'st-now num' }, [el('strong', { text: money(last.balance) }), el('span', { class: tone(last.balance - vals[0]), text: fmtMoney(last.balance - vals[0]) })]),
      svg,
      el('div', { class: 'st-axis' }, [el('span', { text: day(pts[0].t) }), el('span', { class: 'num', text: `${t('low', { v: money(lo) })} · ${t('high', { v: money(hi) })}` }), el('span', { text: day(last.t) })])
    );
  }

  // Week by week: a bar each, up green, down red.
  function weeksCard(s, l) {
    const byWeek = new Map();
    for (const w of [...s.weeks, ...l.weeks]) byWeek.set(w.week, { week: w.week, net: (byWeek.get(w.week)?.net || 0) + w.net });
    const weeks = [...byWeek.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 12).reverse();
    if (weeks.length < 2) return null;
    const top = Math.max(1, ...weeks.map(w => Math.abs(w.net)));
    return card(
      t('weeks'),
      t('weeksSub'),
      el(
        'div',
        { class: 'st-bars' },
        weeks.map(w => {
          const [, m, d] = w.week.split('-').map(Number);
          const hgt = Math.max(3, (Math.abs(w.net) / top) * 100);
          return el('div', { class: `st-bar ${tone(w.net)}`, title: `${m}/${d} ${fmtMoney(w.net)}` }, [
            el('div', { class: 'st-bar-half pos' }, w.net > 0 ? [el('span', { style: `height:${hgt}%` })] : []),
            el('div', { class: 'st-bar-half neg' }, w.net < 0 ? [el('span', { style: `height:${hgt}%` })] : []),
            el('small', { text: `${m}/${d}` })
          ]);
        })
      ),
      el('div', { class: 'st-bars-sum' }, [
        el('span', {}, [el('i', { class: 'up' }), document.createTextNode(`${weeks.filter(w => w.net > 0.5).length}`)]),
        el('span', {}, [el('i', { class: 'down' }), document.createTextNode(`${weeks.filter(w => w.net < -0.5).length}`)])
      ])
    );
  }

  // What the odds said a NT$100 brings back, against what it did.
  function luckCard(s) {
    if (!s.settled) return null;
    const max = Math.max(200, Math.ceil(s.back / 50) * 50);
    const pos = v => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
    const pct = Math.round(s.luckShare * 100);
    const verdict = Math.abs(s.luckZ) < 0.5 ? t('luckNormal') : s.luckZ > 0 ? t('luckGood', { p: Math.max(1, 100 - pct) }) : t('luckBad', { p: Math.max(1, pct) });
    return card(
      t('luck'),
      null,
      el('div', { class: 'st-luck' }, [
        el('div', {}, [el('small', { text: t('luckExp') }), el('strong', { class: 'num', text: fmtInt(Math.round(s.expectedBack)) }), el('small', { text: t('per100') })]),
        el('div', { class: tone(s.back - s.expectedBack) }, [el('small', { text: t('luckGot') }), el('strong', { class: 'num', text: fmtInt(Math.round(s.back)) }), el('small', { text: t('per100') })])
      ]),
      el('div', { class: 'st-meter' }, [
        el('span', { class: `st-meter-fill ${tone(s.back - s.expectedBack)}`, style: `width:${pos(s.back)}` }),
        el('span', { class: 'st-meter-mark exp', style: `left:${pos(s.expectedBack)}` }),
        el('span', { class: 'st-meter-mark even', style: `left:${pos(100)}` })
      ]),
      el('div', { class: 'st-meter-scale num' }, [el('span', { text: '0' }), el('span', { text: '100' }), el('span', { text: String(max) })]),
      el('p', { class: 'st-verdict', text: verdict }),
      el('p', { class: 'st-note', text: t('luckNote') })
    );
  }

  // The lottery's own: what the games pay back on average against what came back.
  function lottoLuckCard(l) {
    if (l.back == null || l.expectedBack == null) return null;
    const max = Math.max(200, Math.ceil(l.back / 50) * 50);
    const pos = v => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
    return card(
      t('lottoLuck'),
      null,
      el('div', { class: 'st-luck' }, [
        el('div', {}, [el('small', { text: t('luckExp') }), el('strong', { class: 'num', text: fmtInt(Math.round(l.expectedBack)) }), el('small', { text: t('per100') })]),
        el('div', { class: tone(l.back - l.expectedBack) }, [el('small', { text: t('luckGot') }), el('strong', { class: 'num', text: fmtInt(Math.round(l.back)) }), el('small', { text: t('per100') })])
      ]),
      el('div', { class: 'st-meter' }, [
        el('span', { class: `st-meter-fill ${tone(l.back - l.expectedBack)}`, style: `width:${pos(l.back)}` }),
        el('span', { class: 'st-meter-mark exp', style: `left:${pos(l.expectedBack)}` }),
        el('span', { class: 'st-meter-mark even', style: `left:${pos(100)}` })
      ]),
      el('div', { class: 'st-meter-scale num' }, [el('span', { text: '0' }), el('span', { text: '100' }), el('span', { text: String(max) })]),
      el('p', { class: 'st-note', text: t('lottoLuckNote') })
    );
  }

  function calibCard(s) {
    const bands = s.bands.filter(b => b.legs);
    if (!bands.length) return null;
    return card(
      t('calib'),
      t('calibSub'),
      el(
        'div',
        { class: 'st-rows' },
        bands.map(b =>
          el('div', { class: 'st-row' }, [
            el('div', { class: 'st-row-label' }, [el('strong', { text: `${Math.round(b.range[0] * 100)}–${Math.min(100, Math.round(b.range[1] * 100))}%` }), el('small', { text: t('picks', { n: fmtInt(b.legs) }) })]),
            el('div', { class: 'st-track' }, [el('span', { class: `st-fillbar ${b.rate >= b.expectedRate ? 'up' : 'down'}`, style: `width:${(b.rate * 100).toFixed(1)}%` }), el('span', { class: 'st-track-mark', style: `left:${(b.expectedRate * 100).toFixed(1)}%` })]),
            el('strong', { class: 'st-row-val num', text: fmtPctShort(b.rate) })
          ])
        )
      )
    );
  }

  function sportsCard(s, l) {
    const lotto = key => l.byGame.filter(g => (key === 'scratch') === (g.key === 'scratch'));
    const lottoRow = (key, name) => {
      const games = lotto(key);
      const spent = games.reduce((a, g) => a + g.spent, 0);
      return spent ? { key, name, staked: spent, net: games.reduce((a, g) => a + g.won - g.spent, 0), sub: `${fmtInt(games.reduce((a, g) => a + g.n, 0))} ${lang() === 'en' ? 'tickets' : '張'} · ${money(spent)}` } : null;
    };
    const rows = [
      ...s.bySport.filter(b => b.slips).map(b => ({ ...b, name: ctx.sportName(b.key), sub: `${t('slips', { n: fmtInt(b.slips) })} · ${money(b.staked)}` })),
      lottoRow('draw', `🎱 ${t('drawGames')}`),
      lottoRow('scratch', `🪙 ${t('scratch')}`)
    ]
      .filter(Boolean)
      .sort((a, b) => b.staked - a.staked);
    if (!rows.length) return null;
    const top = Math.max(1, ...rows.map(b => Math.abs(b.net)));
    return card(
      t('items'),
      null,
      el(
        'div',
        { class: 'st-rows' },
        rows.map(b =>
          el('div', { class: 'st-row' }, [
            el('div', { class: 'st-row-label' }, [el('strong', { text: b.name }), el('small', { text: b.sub })]),
            el('div', { class: 'st-diverge' }, [el('span', { class: `st-dv ${tone(b.net)}`, style: `width:${((Math.abs(b.net) / top) * 50).toFixed(1)}%` })]),
            el('strong', { class: `st-row-val num ${tone(b.net)}`, text: fmtMoney(b.net) })
          ])
        )
      )
    );
  }

  function lotteryCard(l) {
    if (!l.n) return card(t('lottery'), null, el('p', { class: 'st-empty', text: t('noLotto') }));
    const name = key => (key === 'scratch' ? t('scratch') : gameName(key, lang()));
    const top = Math.max(1, ...l.byGame.map(g => g.spent));
    return card(
      t('lottery'),
      null,
      el('div', { class: 'st-tiles' }, [
        tile(t('tickets'), fmtInt(l.n)),
        tile(t('spent'), money(l.spent)),
        tile(t('won'), money(l.won), l.won > 0 ? 'up' : ''),
        tile(t('lottoBack'), l.back == null ? '–' : fmtInt(Math.round(l.back)), l.back != null && l.back < 100 ? 'down' : 'up')
      ]),
      l.best ? el('p', { class: 'st-verdict', text: `🏆 ${t('best', { game: name(l.best.card ? 'scratch' : l.best.game), v: money(l.best.prize) })}` }) : null,
      el(
        'div',
        { class: 'st-rows' },
        l.byGame.map(g =>
          el('div', { class: 'st-row' }, [
            el('div', { class: 'st-row-label' }, [el('strong', { text: name(g.key) }), el('small', { text: `${fmtInt(g.n)} · ${money(g.spent)}` })]),
            el('div', { class: 'st-track' }, [el('span', { class: 'st-fillbar spent', style: `width:${((g.spent / top) * 100).toFixed(1)}%` }), g.won ? el('span', { class: 'st-fillbar won', style: `width:${Math.min(100, (g.won / top) * 100).toFixed(1)}%` }) : null]),
            el('strong', { class: `st-row-val num ${tone(g.won - g.spent)}`, text: fmtMoney(g.won - g.spent) })
          ])
        )
      )
    );
  }

  function flowCard(m, l) {
    const lottoSpent = l.spent;
    const ins = [
      ['start', m.start, 'var(--st-c1)'],
      ['grants', m.grants.sum, 'var(--st-c2)'],
      ['games', m.games.sum, 'var(--st-c3)'],
      ['payouts', m.payouts.sum, 'var(--st-c4)'],
      ['prizes', l.won, 'var(--st-c5)']
    ].filter(([, v]) => v > 0);
    const outs = [
      ['stakes', m.stakes.sum, 'var(--st-c6)'],
      ['lotto', lottoSpent, 'var(--st-c7)']
    ].filter(([, v]) => v > 0);
    const totalIn = ins.reduce((s, [, v]) => s + v, 0);
    const totalOut = outs.reduce((s, [, v]) => s + v, 0);
    if (!totalIn && !totalOut) return null;
    const scale = Math.max(totalIn, totalOut, 1);
    const bar = parts => el('div', { class: 'st-stack' }, parts.map(([key, v, c]) => el('span', { style: `width:${((v / scale) * 100).toFixed(2)}%;background:${c}`, title: `${t(key)} ${money(v)}` })));
    const legend = parts => el('ul', { class: 'st-legend' }, parts.map(([key, v, c]) => el('li', {}, [el('i', { style: `background:${c}` }), el('span', { text: t(key) }), el('strong', { class: 'num', text: money(v) })])));
    return card(
      t('flow'),
      null,
      el('p', { class: 'st-flow-h' }, [el('span', { text: t('in') }), el('strong', { class: 'num up', text: money(totalIn) })]),
      bar(ins),
      legend(ins),
      totalOut ? el('p', { class: 'st-flow-h' }, [el('span', { text: t('out') }), el('strong', { class: 'num down', text: money(totalOut) })]) : null,
      totalOut ? bar(outs) : null,
      totalOut ? legend(outs) : null
    );
  }

  const tile = (label, value, cls = '', sub = '') => el('div', { class: 'st-tile' }, [el('span', { text: label }), el('strong', { class: `num ${cls}`, text: value }), sub ? el('small', { text: sub }) : null]);

  function recordsCard(s, l) {
    if (!s.settled && !l.best) return null;
    if (!s.settled)
      return card(t('records'), null, el('div', { class: 'st-tiles' }, [tile(`🎟️ ${t('bigPrize')}`, money(l.best.prize), 'up', l.best.card ? t('scratch') : gameName(l.best.game, lang())), tile(`🏆 ${t('won')}`, `${fmtInt(l.wins)} / ${fmtInt(l.n - l.open)}`)]));
    const r = s.records;
    const when = slip => fmtTime(slip.t).split(' ')[0];
    const now = s.streak.current > 0 ? [t('winN', { n: s.streak.current }), 'up'] : s.streak.current < 0 ? [t('lossN', { n: -s.streak.current }), 'down'] : [t('none'), ''];
    return card(
      t('records'),
      null,
      el('div', { class: 'st-tiles' }, [
        tile(`🔥 ${t('streakNow')}`, now[0], now[1]),
        tile(`🏅 ${t('bestStreak')}`, fmtInt(s.streak.bestWin)),
        tile(`🧊 ${t('worstStreak')}`, fmtInt(s.streak.bestLoss)),
        tile(`💰 ${t('bestSlip')}`, r.best && r.best.profit > 0 ? fmtMoney(r.best.profit) : t('none'), 'up', r.best && r.best.profit > 0 ? when(r.best.slip) : ''),
        tile(`💸 ${t('worstSlip')}`, r.worst && r.worst.profit < 0 ? fmtMoney(r.worst.profit) : t('none'), 'down', r.worst && r.worst.profit < 0 ? when(r.worst.slip) : ''),
        tile(`🚀 ${t('longest')}`, r.longest ? `×${fmtOdds(r.longest.odds)}` : t('none'), '', r.longest ? when(r.longest.slip) : ''),
        tile(`🎟️ ${t('avg')}`, money(s.avgCost)),
        tile(`🧾 ${t('tax')}`, money(s.tax)),
        l.best ? tile(`🎟️ ${t('bigPrize')}`, money(l.best.prize), 'up', l.best.card ? t('scratch') : gameName(l.best.game, lang())) : null
      ].filter(Boolean))
    );
  }

  function more(cards) {
    const list = cards.filter(Boolean);
    if (!list.length) return null;
    return el('section', { class: 'st-more' }, [
      el('h3', { class: 'st-more-h', text: t('more') }),
      ...list.map(c => {
        const title = c.querySelector('.card-title, summary')?.textContent || '';
        c.querySelector('.card-title')?.remove();
        c.classList.remove('card', 'fold');
        return el('details', { class: 'st-fold' }, [el('summary', { text: title }), c]);
      })
    ]);
  }

  // ---- The page ----------------------------------------------------------------------
  function render(root) {
    const account = state.account;
    const since = PERIODS[state.statsPeriod || 'all'] ? Date.now() - PERIODS[state.statsPeriod] * 86_400_000 : 0;
    const part = accountSince(account, since);
    const s = historyStats(part);
    const m = moneySources(part);
    const l = lotteryStats(part);
    const full = historyStats(account);
    const rerender = () => render(root);
    const kids = [periodChips(rerender)];
    if (!s.placed && !l.n && !m.grants.n && !m.games.rounds) {
      kids.push(el('p', { class: 'st-empty', text: t('empty') }));
      return root.replaceChildren(...kids);
    }
    if (s.placed || l.n) kids.push(hero(s, l));
    kids.push(balanceCard(full.timeline, since));
    if (s.placed && !s.settled && !l.n) kids.push(el('p', { class: 'st-empty', text: t('wait') }));
    kids.push(weeksCard(s, l), sportsCard(s, l), luckCard(s), lottoLuckCard(l), lotteryCard(l), calibCard(s), flowCard(m, l), recordsCard(s, l));
    if (s.settled) kids.push(more([ctx.youCard(), ctx.crowdCard(s), ctx.funCard(), ctx.picksCard(s), ctx.breakdownCard(s)]));
    root.replaceChildren(...kids.filter(Boolean));
  }

  return { render };
}
