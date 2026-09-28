// The 彩券 tab: Taiwan Lottery's computer-drawn games (lib/lottery.mjs) and
// scratch cards (lib/scratch.mjs), bought with the Quadra balance. Tickets
// live on the account next to the slips, settle against the real draws as
// they come out, and pay into the same pool.
import { GAMES, GAME_ORDER, gameName, nextDraw, quickPick, betCount, checkSelection, buyTicket, settleTicket, dueTickets, drawFor, latestResults, choose, boxWays } from './lib/lottery.mjs';
import { CARDS, CARD_ORDER, face, facePays, buyScratch, revealScratch, topPrize } from './lib/scratch.mjs';
import { balance, newSlipId } from './lib/account.mjs';
import { compactMoney } from './home.js';
import { tell } from './lib/quadra.mjs';

const T = {
  zh: {
    draws: '電腦彩券', scratch: '刮刮樂', mine: '我的彩券', nextDraw: '下一期', closes: '截止', jackpot: '頭獎累積', price: '每注', buy: '購買', cost: '共', bets: '注', multiple: '倍數',
    quick: '電腦選號', clear: '清除', pickN: '選 {n} 個號碼', zone2: '第二區', straight: '正彩', box: '組彩', pair: '對彩', size: '玩法', combos: '{n} 組',
    stars: '星數', sideTitle: '其他玩法', big: '大', small: '小', odd: '單', even: '雙', bullseye: '超級獎號', latest: '最近開獎', open: '待開獎', won: '中獎', lost: '未中獎',
    drawAt: '{when} 開獎', noTickets: '還沒有彩券。', buyCard: '購買 {price}', scratchAll: '一次刮開', scratchHint: '用手指刮開銀色區域', youWon: '恭喜中獎！', noWin: '沒有中獎',
    top: '最高 {v}', bought: '已購買', funds: '餘額不足', fundsBody: '這張刮刮樂要 {v}。到 Rewards 賺一點，或等下次發薪再來。', closed: '本期已截止', house: 'Quadra 開獎', perBet: '{v} / 注', how: '玩法', winNumbers: '中獎號碼', yourNumbers: '你的號碼',
    called: '開出號碼', prizes: '獎項', unscratched: '未刮開', every5: '每 5 分鐘開獎', mult: '倍數 ×{m}', settled: '已開獎',
    quick1: '快選 1 注', quickN: '快選 {n} 注', addLine: '加入這注', lines: '已選 {n} 注', remove: '移除', buyAll: '購買 {n} 注 · {v}', boughtN: '已買 {n} 注，共 {v}', seeTickets: '看我的彩券', again: '再買', inMin: '{n} 分鐘後開獎', inHour: '{h} 小時 {m} 分後開獎', picked: '已選 {k}/{n}', yourPick: '你的號碼', waiting: '等待開獎', drawnList: '已開獎', openSum: '{n} 張待開獎', wonSum: '累計中獎 {v}', basketHint: '選好號碼按「加入這注」，可以一次買好幾注。'
  },
  en: {
    draws: 'Draw games', scratch: 'Scratch cards', mine: 'My tickets', nextDraw: 'Next draw', closes: 'Closes', jackpot: 'Jackpot', price: 'A bet', buy: 'Buy', cost: 'Total', bets: 'bets', multiple: 'Multiple',
    quick: 'Quick pick', clear: 'Clear', pickN: 'Pick {n} numbers', zone2: 'Zone 2', straight: 'Straight', box: 'Box', pair: 'Pair', size: 'Play', combos: '{n} combinations',
    stars: 'Stars', sideTitle: 'Other plays', big: 'Big', small: 'Small', odd: 'Odd', even: 'Even', bullseye: 'Super number', latest: 'Latest draw', open: 'Awaiting draw', won: 'Won', lost: 'No win',
    drawAt: 'Draw {when}', noTickets: 'No tickets yet.', buyCard: 'Buy {price}', scratchAll: 'Scratch all', scratchHint: 'Scratch the silver with your finger', youWon: 'You won!', noWin: 'No win this time',
    top: 'Top {v}', bought: 'Bought', funds: 'Not enough money', fundsBody: 'This card costs {v}. Earn some in Rewards, or come back after the next payday.', closed: 'Sales closed', house: 'Quadra draw', perBet: '{v} a bet', how: 'How to play', winNumbers: 'Winning numbers', yourNumbers: 'Your numbers',
    called: 'Called', prizes: 'Prizes', unscratched: 'Not scratched', every5: 'A draw every 5 minutes', mult: 'Multiplier ×{m}', settled: 'Drawn',
    quick1: 'Quick pick 1', quickN: 'Quick pick {n}', addLine: 'Add this bet', lines: '{n} bets chosen', remove: 'Remove', buyAll: 'Buy {n} · {v}', boughtN: 'Bought {n} bets, {v}', seeTickets: 'My tickets', again: 'Buy more', inMin: 'Draw in {n} min', inHour: 'Draw in {h}h {m}m', picked: '{k}/{n} picked', yourPick: 'Your numbers', waiting: 'Awaiting the draw', drawnList: 'Drawn', openSum: '{n} awaiting a draw', wonSum: 'Won so far {v}', basketHint: 'Pick your numbers and tap “Add this bet”: you can buy several at once.'
  }
};
const COMBO_NAME = { zh: { 2: '二合', 3: '三合', 4: '四合', 5: '五合' }, en: { 2: '2 numbers', 3: '3 numbers', 4: '4 numbers', 5: '5 numbers' } };

export function mountLottery(ctx) {
  const { state, el, fmtMoney } = ctx;
  const lang = state.locale === 'en' ? 'en' : 'zh';
  const t = (key, vars = {}) => String(T[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const money = v => fmtMoney(v, { sign: false });
  const ui = { view: 'draws', latest: null, settling: false };
  const box = () => document.getElementById('lottery-body');

  const extra = () => Math.max(0, ctx.funds(ctx.getAccount()) - balance(ctx.getAccount()));
  const timeText = ms => new Date(ms).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });

  // A random selection for a game (quick pick), in the picker's shape.
  function randomSel(id, like = null) {
    const g = GAMES[id];
    if (g.digits) return { digits: Array.from({ length: g.digits }, () => Math.floor(Math.random() * 10)), play: like?.play || 'straight' };
    if (g.combo) {
      const size = like?.size || 2;
      return { numbers: quickPick(size, g.combo.max), size };
    }
    if (id === 'bingo') return { numbers: quickPick(like?.numbers?.length || 5, 80) };
    return { zones: g.zones.map(z => quickPick(z.n, z.max)) };
  }
  const blankSel = id => {
    const g = GAMES[id];
    return g.digits ? { digits: Array(g.digits).fill(0), play: 'straight' } : g.combo ? { numbers: [], size: 2 } : id === 'bingo' ? { numbers: [] } : { zones: g.zones.map(() => []) };
  };
  function untilText(at) {
    const ms = at - Date.now();
    if (ms <= 0) return '';
    const mins = Math.ceil(ms / 60_000);
    if (mins < 60) return t('inMin', { n: mins });
    if (mins < 24 * 60) return t('inHour', { h: Math.floor(mins / 60), m: mins % 60 });
    return t('drawAt', { when: timeText(at) });
  }
  // The balls a selection makes.
  function selBalls(id, sel) {
    const g = GAMES[id];
    if (g.digits) return sel.digits.map(d => ball(d));
    if (sel.side) return [el('span', { class: 'q-chip small', text: t(sel.side) })];
    const main = sel.zones ? sel.zones[0] : sel.numbers;
    return [...main.map(n => ball(n)), ...(sel.zones?.[1] || []).map(n => ball(n, 'special'))];
  }
  // Buys a list of selections, one ticket each; { bought, cost } or { error }.
  function buyLines(id, lines, multiple) {
    let account = ctx.getAccount();
    let cost = 0;
    let bought = 0;
    for (const sel of lines) {
      const r = buyTicket(account, { id: newSlipId(), game: id, sel: structuredClone(sel), multiple }, new Date(), { extra: Math.max(0, ctx.funds(account) - balance(account)) });
      if (r.error) {
        if (!bought) return { error: r.error };
        break;
      }
      account = r.account;
      cost += r.ticket.cost;
      bought++;
    }
    ctx.commitAccount(account);
    ctx.track('lottery', [`lotto:${id}`], 1);
    ctx.syncNow();
    return { bought, cost };
  }

  // ---- Settling: every open ticket whose draw is out --------------------------------
  async function settleDue() {
    const account = ctx.getAccount();
    if (!account || ui.settling) return;
    const due = dueTickets(account);
    if (!due.length) return;
    ui.settling = true;
    try {
      let next = account;
      for (const ticket of due) {
        const draw = await drawFor(ticket.game, ticket.draw).catch(() => null);
        if (draw) next = settleTicket(next, ticket.id, draw);
      }
      if (next !== account) {
        ctx.commitAccount(next);
        render();
      }
    } finally {
      ui.settling = false;
    }
  }
  setInterval(() => document.visibilityState === 'visible' && settleDue(), 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && settleDue());

  // ---- The tab ---------------------------------------------------------------------
  function render() {
    const root = box();
    if (!root || !ctx.getAccount()) return;
    // Home's buttons open a view directly.
    if (state.lotteryView) {
      ui.view = state.lotteryView;
      state.lotteryView = null;
    }
    if (!ui.latest) {
      ui.latest = {};
      latestResults()
        .then(r => ((ui.latest = r), render()))
        .catch(() => {});
    }
    settleDue();
    const open = (ctx.getAccount().tickets || []).filter(x => x.status === 'open').length;
    const seg = el(
      'div',
      { class: 'segmented lotto-seg', role: 'group' },
      ['draws', 'scratch', 'mine'].map(v =>
        el('button', { type: 'button', 'aria-pressed': String(ui.view === v), onclick: () => ((ui.view = v), render()) }, [document.createTextNode(t(v)), v === 'mine' && open ? el('span', { class: 'lotto-count', text: String(open) }) : null])
      )
    );
    const body = ui.view === 'draws' ? drawGames() : ui.view === 'scratch' ? scratchCards() : myTickets();
    root.replaceChildren(seg, body);
  }

  function drawGames() {
    return el(
      'div',
      { class: 'lotto-grid' },
      GAME_ORDER.map(id => {
        const g = GAMES[id];
        const d = nextDraw(id);
        const latest = ui.latest?.[g.of || id];
        const nums = latest ? (latest.digits || latest.numbers || []).slice(0, id === 'bingo' ? 6 : 7) : [];
        return el('div', { class: 'lotto-card', style: `--lotto:${g.color}`, role: 'button', tabindex: '0', onclick: () => openGame(id) }, [
          el('div', { class: 'lotto-top' }, [el('span', { class: 'lotto-emblem', 'aria-hidden': 'true', text: gameName(id, lang).slice(0, 1) }), el('div', { class: 'lotto-id' }, [el('span', { class: 'lotto-name', text: gameName(id, lang) }), el('span', { class: 'lotto-price', text: t('perBet', { v: money(g.price) }) })])]),
          latest?.jackpot && !g.of ? el('strong', { class: 'lotto-jackpot num', text: compactMoney(latest.jackpot, lang) }) : el('strong', { class: 'lotto-jackpot small', text: id === 'bingo' ? t('every5') : g.house ? t('house') : topLine(id) }),
          nums.length ? el('div', { class: 'balls mini' }, nums.map(n => ball(n))) : null,
          el('span', { class: 'lotto-when', text: d ? untilText(d.at) : t('closed') }),
          d
            ? el('button', {
                class: 'q-btn small lotto-quick',
                type: 'button',
                text: `⚡ ${t('quick1')}`,
                onclick: e => {
                  e.stopPropagation();
                  const r = buyLines(id, [randomSel(id)], 1);
                  toastIn(r.error ? t(r.error === 'funds' ? 'funds' : 'closed') : t('boughtN', { n: 1, v: money(r.cost) }));
                  render();
                }
              })
            : null
        ]);
      })
    );
  }
  function toastIn(text) {
    const box = el('div', { class: 'lotto-toast', role: 'status', text });
    document.body.append(box);
    setTimeout(() => box.remove(), 2600);
  }
  function topLine(id) {
    const g = GAMES[id];
    const top = g.tiers?.[0]?.prize || g.plays?.straight?.prize || (g.combo ? Math.max(...Object.values(g.combo.sizes)) : 0);
    return top ? t('top', { v: compactMoney(top, lang) }) : '';
  }

  // ---- A game's sheet: pick and buy ---------------------------------------------------
  function openGame(id) {
    const g = GAMES[id];
    const st = { sel: blankSel(id), lines: [], multiple: 1, msg: '', done: null };
    const dialog = el('dialog', { class: 'q-sheet lotto-sheet', style: `--lotto:${g.color}` });
    const close = () => (dialog.close(), dialog.remove(), render());
    dialog.addEventListener('click', e => e.target === dialog && close());
    dialog.addEventListener('close', () => dialog.remove());
    const need = () => (g.digits ? g.digits : g.combo ? st.sel.size : id === 'bingo' ? 1 : g.zones.reduce((s, z) => s + z.n, 0));
    const have = () => (g.digits ? g.digits : st.sel.side ? 1 : (st.sel.zones ? st.sel.zones.flat() : st.sel.numbers).length);
    const fill = (...kids) => dialog.replaceChildren(...kids.filter(Boolean));
    const paint = () => {
      const check = checkSelection(id, st.sel);
      const d = nextDraw(id);
      const lines = st.lines.length ? st.lines : check.ok ? [st.sel] : [];
      const bets = lines.reduce((s, x) => s + betCount(id, x), 0);
      const cost = bets * g.price * st.multiple;
      if (st.done)
        return fill(
          el('div', { class: 'q-sheet-head' }, [el('h2', { text: gameName(id, lang) }), el('button', { class: 'q-close', type: 'button', text: '×', 'aria-label': 'close', onclick: close })]),
          el('div', { class: 'lotto-done' }, [
            el('div', { class: 'lotto-done-mark', text: '✓' }),
            el('strong', { text: t('boughtN', { n: st.done.bought, v: money(st.done.cost) }) }),
            el('span', { class: 'muted', text: d ? untilText(d.at) : '' }),
            el('div', { class: 'lotto-buybar' }, [
              el('button', { class: 'q-btn', type: 'button', text: t('seeTickets'), onclick: () => ((ui.view = 'mine'), close()) }),
              el('button', { class: 'q-btn primary', type: 'button', text: t('again'), onclick: () => ((st.done = null), paint()) })
            ])
          ])
        );
      fill(
        el('div', { class: 'q-sheet-head' }, [el('h2', { text: gameName(id, lang) }), el('button', { class: 'q-close', type: 'button', text: '×', 'aria-label': 'close', onclick: close })]),
        el('p', { class: 'lotto-sub', text: [t('perBet', { v: money(g.price) }), d ? untilText(d.at) : t('closed')].join(' · ') }),
        latestLine(id),
        el('div', { class: 'lotto-current' }, [
          el('div', { class: 'lc-head' }, [el('span', { text: t('yourPick') }), el('small', { class: 'num', text: st.sel.side ? '' : t('picked', { k: have(), n: need() }) })]),
          el('div', { class: 'balls' }, selBalls(id, st.sel).length ? selBalls(id, st.sel) : [el('span', { class: 'muted small', text: '—' })]),
          el('div', { class: 'lc-actions' }, [
            el('button', { class: 'q-btn small', type: 'button', text: `＋ ${t('addLine')}`, disabled: check.ok ? null : '', onclick: () => ((st.lines = [...st.lines, structuredClone(st.sel)]), (st.sel = blankSel(id)), paint()) }),
            el('button', { class: 'q-chip', type: 'button', text: `⚡ ${t('quickN', { n: 5 })}`, onclick: () => ((st.lines = [...st.lines, ...Array.from({ length: 5 }, () => randomSel(id, st.sel))]), paint()) })
          ])
        ]),
        picker(id, st, paint),
        st.lines.length
          ? el('div', { class: 'lotto-lines' }, [
              el('p', { class: 'lotto-h', text: t('lines', { n: st.lines.length }) }),
              ...st.lines.map((x, i) => el('div', { class: 'lotto-line' }, [el('span', { class: 'num line-n', text: String(i + 1) }), el('div', { class: 'balls' }, selBalls(id, x)), el('button', { class: 'icon-x', type: 'button', 'aria-label': t('remove'), text: '×', onclick: () => ((st.lines = st.lines.filter((_, j) => j !== i)), paint()) })]))
            ])
          : el('p', { class: 'muted small lotto-hint', text: t('basketHint') }),
        el('div', { class: 'lotto-mult' }, [
          el('span', { text: t('multiple') }),
          el('div', { class: 'stepper' }, [
            el('button', { type: 'button', text: '−', onclick: () => ((st.multiple = Math.max(1, st.multiple - 1)), paint()) }),
            el('strong', { class: 'num', text: `×${st.multiple}` }),
            el('button', { type: 'button', text: '+', onclick: () => ((st.multiple = Math.min(50, st.multiple + 1)), paint()) })
          ])
        ]),
        prizeTable(id, st.sel),
        st.msg ? el('p', { class: 'lotto-msg', role: 'status', text: st.msg }) : null,
        el('div', { class: 'lotto-buybar sticky' }, [
          el('div', {}, [el('span', { class: 'muted', text: `${bets} ${t('bets')}` }), el('strong', { class: 'num', text: money(cost) })]),
          el('button', {
            class: 'q-btn primary',
            type: 'button',
            text: bets ? t('buyAll', { n: bets, v: money(cost) }) : t('buy'),
            disabled: bets && d ? null : '',
            onclick: () => {
              const r = buyLines(id, lines, st.multiple);
              if (r.error) return void ((st.msg = t(r.error === 'funds' ? 'funds' : 'closed')), paint());
              st.done = r;
              st.lines = [];
              st.sel = blankSel(id);
              st.msg = '';
              paint();
            }
          })
        ])
      );
    };
    paint();
    document.body.append(dialog);
    dialog.showModal();
  }

  function latestLine(id) {
    const g = GAMES[id];
    const r = ui.latest?.[g.of || id];
    if (!r) return null;
    const balls = r.digits ? r.digits.map(n => ball(n)) : [...r.numbers.map(n => ball(n)), r.special != null ? ball(r.special, 'special') : null, r.zone2 != null ? ball(r.zone2, 'special') : null];
    return el('div', { class: 'lotto-latest' }, [el('span', { class: 'muted', text: `${t('latest')} ${r.date}` }), el('div', { class: 'balls' }, balls.filter(Boolean))]);
  }
  const ball = (n, cls = '') => el('span', { class: `ball ${cls}`, text: String(n).padStart(2, '0') });

  function numberGrid(max, chosen, limit, onPick, { hits = [] } = {}) {
    return el(
      'div',
      { class: 'num-grid' },
      Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const on = chosen.includes(n);
        return el('button', {
          type: 'button',
          class: `num-cell${on ? ' on' : ''}${hits.includes(n) ? ' hit' : ''}`,
          'aria-pressed': String(on),
          text: String(n).padStart(2, '0'),
          onclick: () => {
            if (on) chosen.splice(chosen.indexOf(n), 1);
            else if (chosen.length < limit) chosen.push(n);
            chosen.sort((a, b) => a - b);
            onPick();
          }
        });
      })
    );
  }
  const tools = (quick, clear) =>
    el('div', { class: 'lotto-tools' }, [el('button', { class: 'q-chip', type: 'button', text: t('quick'), onclick: quick }), el('button', { class: 'q-chip', type: 'button', text: t('clear'), onclick: clear })]);

  function picker(id, st, paint) {
    const g = GAMES[id];
    const sel = st.sel;
    if (g.digits) {
      const plays = Object.keys(g.plays);
      return el('div', { class: 'lotto-pick' }, [
        el('div', { class: 'segmented small', role: 'group' }, plays.map(p => el('button', { type: 'button', 'aria-pressed': String(sel.play === p), text: t(p), onclick: () => ((sel.play = p), paint()) }))),
        el(
          'div',
          { class: 'digit-row' },
          sel.digits.map((d, i) =>
            el('div', { class: 'digit' }, [
              el('button', { type: 'button', text: '▲', 'aria-label': '+', onclick: () => ((sel.digits[i] = (d + 1) % 10), paint()) }),
              el('strong', { class: 'num', text: String(d) }),
              el('button', { type: 'button', text: '▼', 'aria-label': '−', onclick: () => ((sel.digits[i] = (d + 9) % 10), paint()) })
            ])
          )
        ),
        tools(() => ((sel.digits = sel.digits.map(() => Math.floor(Math.random() * 10))), paint()), () => ((sel.digits = sel.digits.map(() => 0)), paint()))
      ]);
    }
    if (g.combo) {
      const sizes = Object.keys(g.combo.sizes).map(Number);
      return el('div', { class: 'lotto-pick' }, [
        el('div', { class: 'segmented small', role: 'group' }, sizes.map(z => el('button', { type: 'button', 'aria-pressed': String(sel.size === z), text: COMBO_NAME[lang][z], onclick: () => ((sel.size = z), paint()) }))),
        el('p', { class: 'muted', text: `${t('pickN', { n: `${sel.size}-12` })} · ${t('combos', { n: sel.numbers.length >= sel.size ? choose(sel.numbers.length, sel.size) : 0 })}` }),
        numberGrid(g.combo.max, sel.numbers, 12, paint),
        tools(() => ((sel.numbers = quickPick(sel.size, g.combo.max)), paint()), () => ((sel.numbers = []), paint()))
      ]);
    }
    if (id === 'bingo') {
      const sides = [['big', 'big'], ['small', 'small'], ['odd', 'odd'], ['even', 'even']];
      return el('div', { class: 'lotto-pick' }, [
        el('p', { class: 'muted', text: `${t('stars')}: ${sel.side ? '—' : sel.numbers.length || 0} / 10` }),
        numberGrid(80, sel.numbers, 10, () => ((sel.side = undefined), paint())),
        tools(() => ((sel.side = undefined), (sel.numbers = quickPick(Math.max(1, sel.numbers.length || 5), 80)), paint()), () => ((sel.numbers = []), (sel.side = undefined), paint())),
        el('p', { class: 'lotto-h', text: t('sideTitle') }),
        el(
          'div',
          { class: 'lotto-sides' },
          sides.map(([key]) => el('button', { type: 'button', class: `q-chip${sel.side === key ? ' on' : ''}`, 'aria-pressed': String(sel.side === key), text: t(key), onclick: () => ((sel.side = sel.side === key ? undefined : key), (sel.numbers = []), paint()) }))
        )
      ]);
    }
    return el('div', { class: 'lotto-pick' }, [
      ...g.zones.flatMap((z, i) => [
        el('p', { class: 'muted', text: `${i ? `${t('zone2')} · ` : ''}${t('pickN', { n: z.n })} (${sel.zones[i].length}/${z.n})` }),
        numberGrid(z.max, sel.zones[i], z.n, paint)
      ]),
      tools(() => ((sel.zones = g.zones.map(z => quickPick(z.n, z.max))), paint()), () => ((sel.zones = g.zones.map(() => [])), paint()))
    ]);
  }

  function prizeTable(id, sel) {
    const g = GAMES[id];
    let rows = [];
    if (g.tiers)
      rows = g.tiers.map(x => [
        x[lang === 'en' ? 'en' : 'zh'],
        x.m ? `${x.m[0]}${x.m[1] ? ' + 1' : ''}` : `${x.hits}${x.sp ? ' + ★' : ''}`,
        x.prize ? money(x.prize) : lang === 'en' ? 'Pool' : '獎金池'
      ]);
    else if (g.mirror) rows = Object.entries(g.mirror).sort((a, b) => b[0] - a[0]).map(([k, v]) => [`${k} / ${12 - k}`, '', money(v)]);
    else if (g.digits) rows = Object.entries(g.plays).map(([k, p]) => [t(k), '', p.prize ? money(p.prize) : Object.entries(p.prizes).map(([w, v]) => `${w}${lang === 'en' ? ' ways' : '組'} ${money(v)}`).join(' · ')]);
    else if (g.combo) rows = Object.entries(g.combo.sizes).map(([k, v]) => [COMBO_NAME[lang][k], '', money(v)]);
    else if (id === 'bingo') {
      const n = sel.numbers?.length || 5;
      rows = Object.entries(g.stars[n] || {}).sort((a, b) => b[0] - a[0]).map(([h, m]) => [`${n}${lang === 'en' ? ' stars' : '星'}`, `${h}`, money(m * g.price)]);
    }
    if (!rows.length) return null;
    return el('details', { class: 'lotto-prizes' }, [el('summary', { text: t('prizes') }), el('table', {}, rows.map(r => el('tr', {}, r.map(c => el('td', { text: c })))))]);
  }

  // ---- Scratch cards --------------------------------------------------------------------
  function scratchCards() {
    const open = (ctx.getAccount().tickets || []).filter(x => x.card && x.status === 'open');
    return el('div', {}, [
      open.length ? el('div', { class: 'scratch-pending' }, open.map(x => el('button', { class: 'q-chip', type: 'button', text: `${CARDS[x.card][lang]} · ${t('unscratched')}`, onclick: () => openScratch(x.id) }))) : null,
      el(
        'div',
        { class: 'lotto-grid' },
        CARD_ORDER.map(id => {
          const c = CARDS[id];
          return el('button', { class: 'lotto-card scratch-card-tile', type: 'button', style: `--lotto:${c.color}`, onclick: () => buyCard(id) }, [
            el('span', { class: 'lotto-name', text: c[lang] }),
            el('span', { class: 'lotto-price', text: money(c.price) }),
            el('strong', { class: 'lotto-jackpot', text: t('top', { v: compactMoney(topPrize(id), lang) }) }),
            el('span', { class: 'lotto-when', text: c.how[lang] })
          ]);
        })
      )
    ]);
  }
  function buyCard(id) {
    const r = buyScratch(ctx.getAccount(), { id: newSlipId(), card: id }, new Date(), { extra: extra() });
    if (r.error) return void tell({ lang, icon: '💸', title: t('funds'), body: t('fundsBody', { v: money(CARDS[id].price) }) });
    ctx.commitAccount(r.account);
    ctx.track('lottery', [`scratch:${id}`], 1);
    openScratch(r.ticket.id);
  }

  function openScratch(ticketId) {
    const ticket = ctx.getAccount().tickets.find(x => x.id === ticketId);
    if (!ticket) return;
    const c = CARDS[ticket.card];
    const f = face(ticket.card, ticket.gross ?? ticket.prize, ticket.seed);
    const dialog = el('dialog', { class: 'q-sheet lotto-sheet', style: `--lotto:${c.color}` });
    const done = () => {
      if (ctx.getAccount().tickets.find(x => x.id === ticketId)?.status === 'open') {
        ctx.commitAccount(revealScratch(ctx.getAccount(), ticketId));
        ctx.syncNow();
      }
      result.textContent = facePays(ticket.card, f) ? `${t('youWon')} ${money(facePays(ticket.card, f))}` : t('noWin');
      result.className = `scratch-result ${facePays(ticket.card, f) ? 'won' : ''}`;
    };
    const result = el('p', { class: 'scratch-result', text: t('scratchHint') });
    const cardFace = faceEl(ticket.card, f);
    const wrap = el('div', { class: 'scratch-wrap' }, [cardFace]);
    const canvas = el('canvas', { class: 'scratch-cover' });
    wrap.append(canvas);
    const close = () => {
      dialog.close();
      dialog.remove();
      render();
    };
    dialog.append(
      el('div', { class: 'q-sheet-head' }, [el('h2', { text: `${c[lang]} · ${money(c.price)}` }), el('button', { class: 'q-close', type: 'button', text: '×', onclick: close })]),
      el('p', { class: 'lotto-sub', text: c.how[lang] }),
      wrap,
      result,
      el('div', { class: 'lotto-buybar' }, [
        el('button', { class: 'q-btn', type: 'button', text: t('scratchAll'), onclick: () => (clearCover(canvas), done()) }),
        el('button', { class: 'q-btn primary', type: 'button', text: t('buyCard', { price: money(c.price) }), onclick: () => (close(), buyCard(ticket.card)) })
      ])
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    if (ticket.status !== 'open') {
      canvas.remove();
      done();
    } else requestAnimationFrame(() => scratchable(canvas, wrap, done));
  }

  function faceEl(id, f) {
    if (f.kind === 'symbol')
      return el('div', { class: 'scratch-face symbol' }, [
        f.mult ? el('div', { class: 'scratch-mult', text: t('mult', { m: f.mult }) }) : null,
        el('div', { class: 'scratch-spots' }, f.spots.map(s => el('div', { class: `spot${s.win ? ' win' : ''}` }, [el('span', { class: 'spot-sym', text: s.s }), el('small', { class: 'num', text: money(s.a) })])))
      ]);
    if (f.kind === 'match3') return el('div', { class: 'scratch-face match3' }, f.cells.map(a => el('div', { class: 'spot' }, [el('strong', { class: 'num', text: money(a) })])));
    if (f.kind === 'numbers')
      return el('div', { class: 'scratch-face numbers' }, [
        el('p', { class: 'lotto-h', text: t('winNumbers') }),
        el('div', { class: 'balls' }, f.winning.map(n => ball(n, 'special'))),
        el('p', { class: 'lotto-h', text: t('yourNumbers') }),
        el('div', { class: 'scratch-spots yours' }, f.yours.map(y => el('div', { class: `spot${f.winning.includes(y.n) ? ' win' : ''}` }, [el('strong', { text: String(y.n).padStart(2, '0') }), el('small', { class: 'num', text: money(y.a) })])))
      ]);
    if (f.kind === 'bingo') {
      const called = new Set(f.called);
      return el('div', { class: 'scratch-face bingo' }, [
        el('div', { class: 'bingo-grid' }, f.grid.flatMap(row => row.map(n => el('div', { class: `bcell${!n || called.has(n) ? ' hit' : ''}`, text: n ? String(n) : '★' })))),
        el('p', { class: 'lotto-h', text: `${t('called')} · ${money(CARDS[id].price * 2)}+` }),
        el('div', { class: 'called' }, f.called.map(n => el('span', { text: String(n) })))
      ]);
    }
    return el('div');
  }

  // The silver layer: scratched away with a finger or the mouse; mostly gone
  // (55%), it clears and the card pays.
  function scratchable(canvas, wrap, done) {
    const rect = wrap.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const g = canvas.getContext('2d');
    g.scale(ratio, ratio);
    const grad = g.createLinearGradient(0, 0, rect.width, rect.height);
    grad.addColorStop(0, '#d1d5db');
    grad.addColorStop(0.5, '#9ca3af');
    grad.addColorStop(1, '#d1d5db');
    g.fillStyle = grad;
    g.fillRect(0, 0, rect.width, rect.height);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '600 15px system-ui';
    g.textAlign = 'center';
    g.fillText(t('scratchHint'), rect.width / 2, rect.height / 2);
    g.globalCompositeOperation = 'destination-out';
    let down = false;
    let finished = false;
    const scratch = e => {
      if (!down || finished) return;
      const r = canvas.getBoundingClientRect();
      g.beginPath();
      g.arc(e.clientX - r.left, e.clientY - r.top, 20, 0, Math.PI * 2);
      g.fill();
      e.preventDefault();
    };
    const check = () => {
      if (finished) return;
      const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let n = 0;
      for (let i = 3; i < data.length; i += 4 * 97) {
        n++;
        if (data[i] === 0) clear++;
      }
      if (clear / n > 0.55) {
        finished = true;
        clearCover(canvas);
        done();
      }
    };
    canvas.addEventListener('pointerdown', e => ((down = true), canvas.setPointerCapture(e.pointerId), scratch(e)));
    canvas.addEventListener('pointermove', scratch);
    canvas.addEventListener('pointerup', () => ((down = false), check()));
    canvas.addEventListener('pointercancel', () => (down = false));
  }
  const clearCover = canvas => {
    canvas.style.transition = 'opacity .35s';
    canvas.style.opacity = '0';
    setTimeout(() => canvas.remove(), 400);
  };

  // ---- My tickets ------------------------------------------------------------------------
  function myTickets() {
    const tickets = ctx.getAccount().tickets || [];
    if (!tickets.length) return el('p', { class: 'empty', text: t('noTickets') });
    const open = tickets.filter(x => x.status === 'open');
    const done = tickets.filter(x => x.status !== 'open');
    const won = done.reduce((s, x) => s + (x.prize || 0), 0);
    return el('div', {}, [
      el('div', { class: 'lotto-summary' }, [el('span', { text: t('openSum', { n: open.length }) }), el('strong', { class: 'num', text: t('wonSum', { v: money(won) }) })]),
      open.length ? el('p', { class: 'lotto-h', text: t('waiting') }) : null,
      open.length ? el('div', { class: 'lotto-tickets' }, open.slice(0, 60).map(ticketRow)) : null,
      done.length ? el('p', { class: 'lotto-h', text: t('drawnList') }) : null,
      done.length ? el('div', { class: 'lotto-tickets' }, done.slice(0, 60).map(ticketRow)) : null
    ]);
  }
  function ticketRow(x) {
    if (x.card) {
      const c = CARDS[x.card];
      const won = x.status === 'settled' && x.prize > 0;
      return el('button', { class: `lotto-ticket${won ? ' won' : ''}`, type: 'button', style: `--lotto:${c.color}`, onclick: () => openScratch(x.id) }, [
        el('div', { class: 'lt-head' }, [el('strong', { text: `${t('scratch')} · ${c[lang]}` }), el('span', { class: 'num', text: money(x.cost) })]),
        el('p', { class: `lt-state ${x.status === 'open' ? '' : won ? 'won' : 'lost'}`, text: x.status === 'open' ? t('unscratched') : won ? `${t('won')} ${money(x.prize)}` : t('lost') })
      ]);
    }
    const g = GAMES[x.game];
    const drawn = x.drawn;
    const picked = x.sel.digits ? x.sel.digits.map(d => ball(d, drawn?.digits ? '' : '')) : x.sel.side ? [el('span', { class: 'q-chip', text: t(x.sel.side) })] : [...(x.sel.zones?.[0] || x.sel.numbers || []).map(n => ball(n, drawn?.numbers?.includes(n) ? 'hit' : '')), ...(x.sel.zones?.[1] || []).map(n => ball(n, drawn?.zone2 === n ? 'hit special' : 'special'))];
    const won = x.status === 'settled' && x.prize > 0;
    return el('div', { class: `lotto-ticket${won ? ' won' : ''}`, style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${gameName(x.game, lang)}${x.sel.play ? ` · ${t(x.sel.play)}` : x.sel.size ? ` · ${COMBO_NAME[lang][x.sel.size]}` : ''}` }), el('span', { class: 'num', text: money(x.cost) })]),
      el('div', { class: 'balls' }, picked),
      drawn ? el('div', { class: 'balls drawn' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim')), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean)) : null,
      el('p', { class: `lt-state ${x.status === 'open' ? '' : won ? 'won' : 'lost'}`, text: x.status === 'open' ? t('drawAt', { when: timeText(x.draw.at) }) : won ? `${t('won')} ${money(x.prize)}` : t('lost') })
    ]);
  }

  return { render, settleDue };
}
