// The 彩券 tab: Taiwan Lottery's computer-drawn games (lib/lottery.mjs) and
// scratch cards (lib/scratch.mjs), bought with the Quadra balance. Tickets
// live on the account next to the slips, settle against the real draws as
// they come out, and pay into the same pool.
import { GAMES, GAME_ORDER, gameName, nextDraw, quickPick, betCount, checkSelection, buyTicket, settleTicket, dueTickets, drawFor, latestResults, choose, boxWays, tierOdds, oneIn } from './lib/lottery.mjs';
import { CARDS, CARD_ORDER, face, facePays, buyScratch, revealScratch, topPrize } from './lib/scratch.mjs';
import { balance, newSlipId } from './lib/account.mjs';
import { compactMoney } from './home.js';
import { tell, ask } from './lib/quadra.mjs';

const T = {
  zh: {
    draws: '電腦彩券', scratch: '刮刮樂', mine: '我的彩券', nextDraw: '下一期', closes: '截止', jackpot: '頭獎累積', price: '每注', buy: '購買', cost: '共', bets: '注', multiple: '倍數',
    quick: '電腦選號', clear: '清除', pickN: '選 {n} 個號碼', zone2: '第二區', straight: '正彩', box: '組彩', pair: '對彩', size: '玩法', combos: '{n} 組',
    stars: '星數', sideTitle: '其他玩法', big: '大', small: '小', odd: '單', even: '雙', bullseye: '超級獎號', latest: '最近開獎', open: '待開獎', won: '中獎', lost: '未中獎',
    today: '今天', yesterday: '昨天', filterAll: '全部', filterWins: '只看中獎', noWins: '還沒有中獎的彩券。', daySum: '花 {spent}', dayNone: '沒中', outUp: '賺 {v}', outEven: '回本', outPart: '拿回 {got}・虧 {v}', outNone: '沒中・虧 {v}', dayNet: '淨 {v}', earlier: '更早的 {n} 天', groupWon: '{n} 張中 {k} 張，共 {v}', groupLost: '{n} 注都沒中', cardsLost: '{n} 張都沒中',
    drawAt: '{when} 開獎', noTickets: '還沒有彩券。', buyCard: '購買 {price}', scratchAll: '一次刮開', scratchHint: '用手指刮開銀色區域', youWon: '恭喜中獎！', noWin: '沒有中獎',
    top: '最高 {v}', bought: '已購買', funds: '餘額不足', fundsBody: '這張刮刮樂要 {v}。到 Rewards 賺一點，或等下次發薪再來。', closed: '本期已截止', house: 'Quadra 開獎', perBet: '{v} / 注', how: '玩法', winNumbers: '中獎號碼', yourNumbers: '你的號碼', dealer: '莊家', you: '你', prizeCol: '獎金',
    called: '開出號碼', prizes: '獎項', unscratched: '未刮開', every5: '每 5 分鐘開獎', mult: '倍數 ×{m}', settled: '已開獎',
    quick1: '快選 1 注', quickN: '快選 {n} 注', addLine: '加入這注', lines: '已選 {n} 注', remove: '移除', buyAll: '購買 {n} 注 · {v}', boughtN: '已買 {n} 注，共 {v}', seeTickets: '看我的彩券', again: '再買', inMin: '{n} 分鐘後開獎', inHour: '{h} 小時 {m} 分後開獎', picked: '已選 {k}/{n}', starsN: '{n} 星', pickHint: '點下面的號碼，或用快選', anyPrize: '任一獎 1/{n}', odds: '機率', oneIn: '1/{n}', yourPick: '你的號碼', waiting: '等待開獎', drawnList: '已開獎', openSum: '{n} 張待開獎', wonSum: '累計中獎 {v}', basketHint: '選好號碼按「加入這注」，可以一次買好幾注。', sureTitle: '確定購買？', sureBody: '{what}，共 {v}。買了之後不能退。', sureOk: '購買 {v}'
  },
  en: {
    draws: 'Draw games', scratch: 'Scratch cards', mine: 'My tickets', nextDraw: 'Next draw', closes: 'Closes', jackpot: 'Jackpot', price: 'A bet', buy: 'Buy', cost: 'Total', bets: 'bets', multiple: 'Multiple',
    quick: 'Quick pick', clear: 'Clear', pickN: 'Pick {n} numbers', zone2: 'Zone 2', straight: 'Straight', box: 'Box', pair: 'Pair', size: 'Play', combos: '{n} combinations',
    stars: 'Stars', sideTitle: 'Other plays', big: 'Big', small: 'Small', odd: 'Odd', even: 'Even', bullseye: 'Super number', latest: 'Latest draw', open: 'Awaiting draw', won: 'Won', lost: 'No win',
    today: 'Today', yesterday: 'Yesterday', filterAll: 'All', filterWins: 'Wins only', noWins: 'No winning tickets yet.', daySum: 'Spent {spent}', dayNone: 'No wins', outUp: 'Up {v}', outEven: 'Broke even', outPart: 'Got {got} back · down {v}', outNone: 'No win · down {v}', dayNet: 'Net {v}', earlier: '{n} earlier days', groupWon: '{k} of {n} won, {v}', groupLost: 'No win on {n} bets', cardsLost: 'No win on {n} cards',
    drawAt: 'Draw {when}', noTickets: 'No tickets yet.', buyCard: 'Buy {price}', scratchAll: 'Scratch all', scratchHint: 'Scratch the silver with your finger', youWon: 'You won!', noWin: 'No win this time',
    top: 'Top {v}', bought: 'Bought', funds: 'Not enough money', fundsBody: 'This card costs {v}. Earn some in Rewards, or come back after the next payday.', closed: 'Sales closed', house: 'Quadra draw', perBet: '{v} a bet', how: 'How to play', winNumbers: 'Winning numbers', yourNumbers: 'Your numbers', dealer: 'Dealer', you: 'You', prizeCol: 'Prize',
    called: 'Called', prizes: 'Prizes', unscratched: 'Not scratched', every5: 'A draw every 5 minutes', mult: 'Multiplier ×{m}', settled: 'Drawn',
    quick1: 'Quick pick 1', quickN: 'Quick pick {n}', addLine: 'Add this bet', lines: '{n} bets chosen', remove: 'Remove', buyAll: 'Buy {n} · {v}', boughtN: 'Bought {n} bets, {v}', seeTickets: 'My tickets', again: 'Buy more', inMin: 'Draw in {n} min', inHour: 'Draw in {h}h {m}m', picked: '{k}/{n} picked', starsN: '{n} stars', pickHint: 'Tap numbers below, or quick pick', anyPrize: 'Any prize 1 in {n}', odds: 'Odds', oneIn: '1 in {n}', yourPick: 'Your numbers', waiting: 'Awaiting the draw', drawnList: 'Drawn', openSum: '{n} awaiting a draw', wonSum: 'Won so far {v}', basketHint: 'Pick your numbers and tap “Add this bet”: you can buy several at once.', sureTitle: 'Buy this?', sureBody: '{what}, {v} in all. A ticket bought can’t be returned.', sureOk: 'Buy for {v}'
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

  // The rest of the pool, which is below zero when other apps have spent
  // more than they have (money moved into Securities, say): never floored at
  // zero, or Play would sell tickets the pool can't pay for.
  const extra = (account = ctx.getAccount()) => ctx.funds(account) - balance(account);
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
    // Days away: the weekday and time only ("週四 20:30 開獎"), short enough for a tile.
    const when = new Date(at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
    return t('drawAt', { when });
  }
  // The balls a selection makes.
  function selBalls(id, sel) {
    const g = GAMES[id];
    if (g.digits) return sel.digits.map(d => ball(d));
    if (sel.side) return [el('span', { class: 'q-chip small', text: t(sel.side) })];
    const main = sel.zones ? sel.zones[0] : sel.numbers;
    return [...main.map(n => ball(n)), ...(sel.zones?.[1] || []).map(n => ball(n, 'special'))];
  }
  // Every purchase asks first: a tile or button bought on one tap, and a
  // stray tap spent money.
  const sure = (what, cost) => ask({ lang, icon: '🎟️', title: t('sureTitle'), body: t('sureBody', { what, v: money(cost) }), ok: t('sureOk', { v: money(cost) }) });
  // Buys a list of selections, one ticket each; { bought, cost } or { error }.
  function buyLines(id, lines, multiple) {
    let account = ctx.getAccount();
    let cost = 0;
    let bought = 0;
    for (const sel of lines) {
      const r = buyTicket(account, { id: newSlipId(), game: id, sel: structuredClone(sel), multiple }, new Date(), { extra: extra(account) });
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
    if (ui.view === 'mine') ui.view = 'draws';
    const open = (ctx.getAccount().tickets || []).filter(x => x.status === 'open').length;
    const seg = el(
      'div',
      { class: 'segmented lotto-seg', role: 'group' },
      ['draws', 'scratch'].map(v => el('button', { type: 'button', 'aria-pressed': String(ui.view === v), onclick: () => ((ui.view = v), render()) }, [document.createTextNode(t(v))]))
    );
    // Tickets bought live in 紀錄 (next to the slips); a link to them here.
    const mine = el('button', { class: 'lotto-mine-link', type: 'button', onclick: () => ctx.showTickets() }, [el('span', { text: `🎟️ ${t('mine')}` }), open ? el('span', { class: 'lotto-count', text: String(open) }) : null, el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })]);
    const body = ui.view === 'draws' ? drawGames() : scratchCards();
    root.replaceChildren(seg, body, mine);
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
          el('span', { class: 'lotto-when', text: d ? untilText(d.at) : t('closed') })
        ]);
      })
    );
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
              el('button', { class: 'q-btn', type: 'button', text: t('seeTickets'), onclick: () => (close(), ctx.showTickets()) }),
              el('button', { class: 'q-btn primary', type: 'button', text: t('again'), onclick: () => ((st.done = null), paint()) })
            ])
          ])
        );
      fill(
        el('div', { class: 'q-sheet-head' }, [el('h2', { text: gameName(id, lang) }), el('button', { class: 'q-close', type: 'button', text: '×', 'aria-label': 'close', onclick: close })]),
        el('p', { class: 'lotto-sub', text: [t('perBet', { v: money(g.price) }), d ? untilText(d.at) : t('closed'), (() => {
          const any = tierOdds(id, st.sel).any;
          return any ? t('anyPrize', { n: fmtOdd(any) }) : null;
        })()].filter(Boolean).join(' · ') }),
        latestLine(id),
        el('div', { class: 'lotto-current' }, [
          el('div', { class: 'lc-head' }, [el('span', { text: t('yourPick') }), el('small', { class: 'num', text: st.sel.side ? '' : id === 'bingo' ? t('starsN', { n: have() }) : t('picked', { k: have(), n: need() }) })]),
          selBalls(id, st.sel).length ? el('div', { class: 'balls' }, selBalls(id, st.sel)) : el('p', { class: 'lc-hint', text: t('pickHint') }),
          el('div', { class: 'lc-actions' }, [
            el('button', { class: 'q-btn small', type: 'button', text: `＋ ${t('addLine')}`, disabled: check.ok ? null : '', onclick: () => ((st.lines = [...st.lines, structuredClone(st.sel)]), (st.sel = blankSel(id)), paint()) }),
            // Quick picks only fill the list: nothing is bought until 購買.
            ...[1, 5].map(n => el('button', { class: 'q-chip', type: 'button', text: `⚡ ${t(n === 1 ? 'quick1' : 'quickN', { n })}`, onclick: () => ((st.lines = [...st.lines, ...Array.from({ length: n }, () => randomSel(id, st.sel))]), paint()) }))
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
            onclick: async () => {
              if (!(await sure(`${gameName(id, lang)} · ${bets} ${t('bets')}`, cost))) return;
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

  const fmtOdd = p => oneIn(p).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW');
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
    // Each tier's chance for one bet, beside its prize.
    const odds = tierOdds(id, sel).rows;
    const oddsOf = i => {
      const r = g.mirror ? odds.find(o => o.key === Object.entries(g.mirror).sort((a, b) => b[0] - a[0])[i][0]) : id === 'bingo' ? odds.find(o => o.key === Object.entries(g.stars[sel.numbers?.length || 5] || {}).sort((a, b) => b[0] - a[0])[i][0]) : odds[i];
      if (g.digits && r?.key === 'box') return Object.keys(g.plays.box.prizes).map(w => `${w}${lang === 'en' ? ' ways' : '組'} ${t('oneIn', { n: fmtOdd(w / 10 ** g.digits) })}`).join(' · ');
      return r?.p ? t('oneIn', { n: fmtOdd(r.p) }) : '–';
    };
    return el('details', { class: 'lotto-prizes', open: '' }, [
      el('summary', { text: t('prizes') }),
      el('table', {}, [el('tr', { class: 'lp-head' }, [el('th', { text: '' }), el('th', { text: '' }), el('th', { text: t('prizes') }), el('th', { text: t('odds') })]), ...rows.map((r, i) => el('tr', {}, [...r.map(c => el('td', { text: c })), el('td', { class: 'num lp-odds', text: oddsOf(i) })]))])
    ]);
  }

  // ---- Scratch cards --------------------------------------------------------------------
  function scratchCards() {
    const open = (ctx.getAccount().tickets || []).filter(x => x.card && x.status === 'open');
    return el('div', {}, [
      open.length ? el('div', { class: 'scratch-pending' }, open.map(x => el('button', { class: 'q-chip', type: 'button', text: `${CARDS[x.card][lang]} · ${t('unscratched')}`, onclick: () => openScratch(x.id) }))) : null,
      // By price: a row of cards at each.
      ...[...new Set(CARD_ORDER.map(id => CARDS[id].price))].map(price =>
        el('section', { class: 'sc-shelf' }, [
          el('h3', { class: 'sc-shelf-head' }, [el('span', { class: 'num', text: money(price) }), el('small', { text: t('top', { v: compactMoney(price * 10_000, lang) }) })]),
          el(
            'div',
            { class: 'sc-shelf-row' },
            CARD_ORDER.filter(id => CARDS[id].price === price).map(id => {
              const c = CARDS[id];
              return el('button', { class: 'sc-tile', type: 'button', style: `--lotto:${c.color}`, onclick: () => buyCard(id) }, [
                el('span', { class: 'sc-tile-icon', 'aria-hidden': 'true', text: c.icon }),
                el('strong', { class: 'sc-tile-name', text: c[lang] }),
                el('span', { class: 'sc-tile-how', text: c.how[lang] })
              ]);
            })
          )
        ])
      )
    ]);
  }
  async function buyCard(id) {
    if (!(await sure(CARDS[id][lang], CARDS[id].price))) return;
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
    const pays = facePays(ticket.card, f);
    const dialog = el('dialog', { class: 'q-sheet lotto-sheet', style: `--lotto:${c.color}` });
    const result = el('div', { class: 'sc-result', role: 'status' }, [el('span', { text: t('scratchHint') })]);
    const done = () => {
      if (ctx.getAccount().tickets.find(x => x.id === ticketId)?.status === 'open') {
        ctx.commitAccount(revealScratch(ctx.getAccount(), ticketId));
        ctx.syncNow();
        if (pays) navigator.vibrate?.([30, 40, 60]);
      }
      ticketEl.classList.add('revealed');
      result.className = `sc-result ${pays ? 'won' : 'lost'}`;
      result.replaceChildren(...[pays ? el('span', { class: 'sc-result-icon', text: '🎉' }) : null, el('strong', { text: pays ? t('youWon') : t('noWin') }), pays ? el('strong', { class: 'sc-result-amount num', text: money(pays) }) : null].filter(Boolean));
    };
    const wrap = el('div', { class: 'sc-play' }, [faceEl(ticket.card, f)]);
    const canvas = el('canvas', { class: 'scratch-cover', 'aria-label': t('scratchHint') });
    wrap.append(canvas);
    // The ticket: a band in the card's colour, the play area under silver.
    const ticketEl = el('div', { class: 'sc-ticket' }, [
      el('div', { class: 'sc-band' }, [
        el('span', { class: 'sc-band-icon', 'aria-hidden': 'true', text: c.icon }),
        el('div', { class: 'sc-band-text' }, [el('small', { text: t('scratch') }), el('strong', { text: c[lang] })]),
        el('div', { class: 'sc-band-prize' }, [el('small', { text: t('top', { v: '' }).trim() }), el('strong', { class: 'num', text: compactMoney(topPrize(ticket.card), lang) })])
      ]),
      wrap,
      el('p', { class: 'sc-how', text: c.how[lang] })
    ]);
    const close = () => {
      dialog.close();
      dialog.remove();
      render();
    };
    dialog.append(
      el('div', { class: 'q-sheet-head' }, [el('h2', { text: `${c[lang]} · ${money(c.price)}` }), el('button', { class: 'q-close', type: 'button', text: '×', 'aria-label': 'close', onclick: close })]),
      ticketEl,
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
    } else scratchable(canvas, wrap, done);
  }

  // Amounts inside a card's spots: short ($2萬, $1,000).
  const spotMoney = v => (v >= 10_000_000 && lang !== 'en' ? `$${v / 10_000_000}千萬` : v >= 10_000 ? compactMoney(v, lang).replace('NT$', '$') : v >= 1_000 ? (lang === 'en' ? `$${v / 1_000}K` : `$${v / 1_000}千`) : `$${v}`);
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  function faceEl(id, f) {
    if (f.kind === 'symbol')
      return el('div', { class: 'scratch-face symbol' }, [
        f.mult ? el('div', { class: 'scratch-mult', text: t('mult', { m: f.mult }) }) : null,
        el('div', { class: 'scratch-spots' }, f.spots.map(s => el('div', { class: `spot${s.win ? ' win' : ''}` }, [el('span', { class: 'spot-sym', text: s.s }), el('small', { class: 'num', text: spotMoney(s.a) })])))
      ]);
    if (f.kind === 'match3') return el('div', { class: 'scratch-face match3' }, f.cells.map(a => el('div', { class: `spot${f.cells.filter(x => x === a).length === 3 ? ' win' : ''}` }, [el('strong', { class: 'num', text: spotMoney(a) })])));
    if (f.kind === 'numbers')
      return el('div', { class: 'scratch-face numbers' }, [
        el('p', { class: 'sc-h', text: t('winNumbers') }),
        el('div', { class: 'sc-winning' }, f.winning.map(n => el('span', { class: 'sc-win-num num', text: String(n).padStart(2, '0') }))),
        el('p', { class: 'sc-h', text: t('yourNumbers') }),
        el('div', { class: 'scratch-spots yours' }, f.yours.map(y => el('div', { class: `spot${f.winning.includes(y.n) ? ' win' : ''}` }, [el('strong', { class: 'num', text: String(y.n).padStart(2, '0') }), el('small', { class: 'num', text: spotMoney(y.a) })])))
      ]);
    if (f.kind === 'bingo') {
      const called = new Set(f.called);
      return el('div', { class: 'scratch-face bingo' }, [
        el('div', { class: 'bingo-grid' }, f.grid.flatMap(row => row.map(n => el('div', { class: `bcell${!n || called.has(n) ? ' hit' : ''}`, text: n ? String(n) : '★' })))),
        el('p', { class: 'sc-h', text: `${t('called')} · ${money(CARDS[id].price * 2)}+` }),
        el('div', { class: 'called' }, f.called.map(n => el('span', { class: 'num', text: String(n) })))
      ]);
    }
    if (f.kind === 'slots')
      return el('div', { class: 'scratch-face slots' }, f.rows.map(r => el('div', { class: `slot-row${r.s[0] === r.s[1] && r.s[1] === r.s[2] ? ' win' : ''}` }, [...r.s.map(x => el('span', { class: 'reel', text: x })), el('strong', { class: 'slot-prize num', text: spotMoney(r.a) })])));
    if (f.kind === 'beat')
      return el('div', { class: 'scratch-face beat' }, [
        el('div', { class: 'beat-dealer' }, [el('span', { text: t('dealer') }), el('strong', { class: 'num', text: String(f.dealer) })]),
        el('p', { class: 'sc-h', text: t('yourNumbers') }),
        el('div', { class: 'scratch-spots' }, f.rows.map(r => el('div', { class: `spot${r.n > f.dealer ? ' win' : ''}` }, [el('strong', { class: 'num big', text: String(r.n) }), el('small', { class: 'num', text: spotMoney(r.a) })])))
      ]);
    if (f.kind === 'treasure') {
      const counts = new Map();
      for (const x of f.cells) counts.set(x, (counts.get(x) || 0) + 1);
      return el('div', { class: 'scratch-face treasure' }, [
        el('div', { class: 'treasure-map' }, f.cells.map(x => el('div', { class: `dig${counts.get(x) >= 3 ? ' win' : ''}`, text: x }))),
        el('div', { class: 'treasure-key' }, f.key.map(k => el('span', {}, [el('b', { text: k.s }), el('small', { class: 'num', text: spotMoney(k.a) })])))
      ]);
    }
    if (f.kind === 'dice')
      return el('div', { class: 'scratch-face dice' }, [
        el('div', { class: 'dice-head' }, [el('span'), el('small', { text: t('you') }), el('small', { text: t('dealer') }), el('small', { text: t('prizeCol') })]),
        ...f.rounds.map((r, i) =>
          el('div', { class: `dice-row${r.you[0] + r.you[1] > r.them[0] + r.them[1] ? ' win' : ''}` }, [
            el('small', { class: 'num', text: String(i + 1) }),
            el('span', { class: 'die-pair' }, [el('b', { text: `${DIE[r.you[0]]}${DIE[r.you[1]]}` }), el('small', { class: 'num', text: String(r.you[0] + r.you[1]) })]),
            el('span', { class: 'die-pair them' }, [el('b', { text: `${DIE[r.them[0]]}${DIE[r.them[1]]}` }), el('small', { class: 'num', text: String(r.them[0] + r.them[1]) })]),
            el('strong', { class: 'num', text: spotMoney(r.a) })
          ])
        )
      ]);
    if (f.kind === 'wheel') {
      // The slice the pointer's on turned to the top.
      const n = f.slices.length;
      const step = 360 / n;
      const turn = -(f.at * step + step / 2);
      const stops = f.slices.map((v, i) => `${v ? (i % 2 ? 'var(--wheel-a)' : 'var(--wheel-b)') : 'var(--wheel-0)'} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
      return el('div', { class: `scratch-face wheel${f.slices[f.at] ? ' won' : ''}` }, [
        el('div', { class: 'wheel-box' }, [
          el('div', { class: 'wheel-disc', style: `background: conic-gradient(${stops}); transform: rotate(${turn}deg)` }, f.slices.map((v, i) => el('span', { class: `wheel-label${i === f.at ? ' at' : ''}${((((i + 0.5) * step + turn) % 360) + 360) % 360 > 180 ? ' flip' : ''}${v ? '' : ' zero'}`, style: `transform: rotate(${i * step + step / 2 - 90}deg)` }, [el('b', { class: 'num', text: v ? spotMoney(v) : '✕' })]))),
          el('div', { class: 'wheel-pointer', 'aria-hidden': 'true' })
        ])
      ]);
    }
    return el('div');
  }

  // The silver layer over the play area: scratched away with a finger or the
  // mouse; mostly gone (55%), it clears and the card pays. Sized to the play
  // area once it's laid out (and again if that changes before a scratch).
  function scratchable(canvas, wrap, done) {
    const ratio = window.devicePixelRatio || 1;
    let g = null;
    let touched = false;
    let finished = false;
    let down = false;
    let last = null;
    const paint = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      g = canvas.getContext('2d');
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.globalCompositeOperation = 'source-over';
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#e5e7eb');
      grad.addColorStop(0.25, '#a8adb6');
      grad.addColorStop(0.5, '#f3f4f6');
      grad.addColorStop(0.75, '#9ca3af');
      grad.addColorStop(1, '#d1d5db');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // A faint pattern and sparkle, like foil.
      g.save();
      g.globalAlpha = 0.14;
      g.fillStyle = '#374151';
      g.font = '800 12px system-ui, sans-serif';
      g.rotate(-0.35);
      for (let y = -h; y < h * 2; y += 26) for (let x = -w; x < w * 2; x += 70) g.fillText('QUADRA', x + ((y / 26) % 2) * 35, y);
      g.restore();
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      // The badge in the middle.
      const text = t('scratchHint');
      g.font = '800 15px system-ui, sans-serif';
      const tw = g.measureText(text).width + 36;
      g.fillStyle = getComputedStyle(wrap).getPropertyValue('--lotto').trim() || '#6b7280';
      g.beginPath();
      g.roundRect((w - tw) / 2, h / 2 - 20, tw, 40, 20);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`🪙 ${text}`, w / 2, h / 2 + 1);
      g.globalCompositeOperation = 'destination-out';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 42;
    };
    const ro = new ResizeObserver(() => !touched && paint());
    ro.observe(wrap);
    requestAnimationFrame(paint);
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    // Strokes, not dots, so a quick swipe leaves no gaps.
    const scratch = e => {
      if (!down || finished || !g) return;
      e.preventDefault();
      const [x, y] = point(e);
      g.beginPath();
      g.moveTo(...(last || [x, y]));
      g.lineTo(x, y);
      g.stroke();
      last = [x, y];
    };
    const check = () => {
      if (finished || !g) return;
      const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let n = 0;
      for (let i = 3; i < data.length; i += 4 * 97) {
        n++;
        if (data[i] === 0) clear++;
      }
      if (clear / n > 0.55) {
        finished = true;
        ro.disconnect();
        clearCover(canvas);
        done();
      }
    };
    canvas.addEventListener('pointerdown', e => {
      touched = true;
      down = true;
      last = null;
      canvas.setPointerCapture(e.pointerId);
      scratch(e);
    });
    canvas.addEventListener('pointermove', scratch);
    canvas.addEventListener('pointerup', () => ((down = false), (last = null), check()));
    canvas.addEventListener('pointercancel', () => ((down = false), (last = null)));
  }
  const clearCover = canvas => {
    canvas.style.transition = 'opacity .35s';
    canvas.style.opacity = '0';
    setTimeout(() => canvas.remove(), 400);
  };

  // ---- My tickets ------------------------------------------------------------------------
  // Won or lost by what came back against what was paid: green only when
  // it's more (賺), grey for exactly as much (回本), amber when some came back
  // but less (拿回・虧), red for nothing.
  const outcome = (got, cost) => (got > cost ? 'up' : got > 0 && got === cost ? 'even' : got > 0 ? 'part' : 'none');
  const outcomeText = (got, cost) => {
    const o = outcome(got, cost);
    return o === 'up' ? t('outUp', { v: `+${money(got - cost)}` }) : o === 'even' ? t('outEven') : o === 'part' ? t('outPart', { got: money(got), v: money(cost - got) }) : t('outNone', { v: money(cost) });
  };
  function myTickets() {
    const tickets = ctx.getAccount().tickets || [];
    if (!tickets.length) return el('p', { class: 'empty', text: t('noTickets') });
    const open = tickets.filter(x => x.status === 'open');
    const done = tickets.filter(x => x.status !== 'open');
    const won = done.reduce((s, x) => s + (x.prize || 0), 0);
    const drawn = el('div', { class: 'lotto-done' });
    const paint = () => drawn.replaceChildren(...drawnDays(done));
    ui.paintDone = paint;
    paint();
    return el('div', {}, [
      el('div', { class: 'lotto-summary' }, [
        el('span', { text: t('openSum', { n: open.length }) }),
        // What came back, and the net of every ticket drawn: coloured like the tickets.
        (() => {
          const spent = done.reduce((sum, x) => sum + (x.cost || 0), 0);
          const net = won - spent;
          return el('strong', { class: `num out-${outcome(won, spent)}`, text: `${t('wonSum', { v: money(won) })} · ${t('dayNet', { v: `${net > 0 ? '+' : net < 0 ? '−' : ''}${money(Math.abs(net))}` })}` });
        })()
      ]),
      open.length ? el('p', { class: 'lotto-h', text: t('waiting') }) : null,
      open.length ? el('div', { class: 'lotto-tickets' }, open.slice(0, 60).map(ticketRow)) : null,
      done.length ? el('div', { class: 'lotto-done-head' }, [el('p', { class: 'lotto-h', text: t('drawnList') }), el('div', { class: 'lotto-filter' }, ['all', 'wins'].map(k => el('button', { type: 'button', class: `q-chip${ui.doneFilter === k ? ' on' : ''}`, text: t(k === 'all' ? 'filterAll' : 'filterWins'), onclick: e => { ui.doneFilter = k; ui.doneDays = 7; e.currentTarget.parentNode.querySelectorAll('.q-chip').forEach(b => b.classList.toggle('on', b === e.currentTarget)); paint(); } }))) ]) : null,
      done.length ? drawn : null
    ]);
  }

  // 已開獎, a day at a time (newest first): the day's spend and winnings,
  // then one card per draw with every ticket on it, and scratch cards by kind.
  const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  const whenOf = x => (x.card ? Date.parse(x.t) : x.draw?.at || Date.parse(x.t));
  const hourText = ms => new Date(ms).toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
  function dayName(key) {
    const today = dayOf(Date.now());
    const yesterday = dayOf(Date.now() - 864e5);
    if (key === today) return t('today');
    if (key === yesterday) return t('yesterday');
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 4)).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' });
  }
  function drawnDays(done) {
    ui.doneFilter ||= 'all';
    ui.doneDays ||= 7;
    const list = (ui.doneFilter === 'wins' ? done.filter(x => x.prize > 0) : done).slice().sort((a, b) => whenOf(b) - whenOf(a));
    if (!list.length) return [el('p', { class: 'empty', text: t('noWins') })];
    const days = new Map();
    for (const x of list) {
      const k = dayOf(whenOf(x));
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(x);
    }
    const keys = [...days.keys()];
    const out = keys.slice(0, ui.doneDays).map(k => {
      const items = days.get(k);
      const spent = items.reduce((s, x) => s + (x.cost || 0), 0);
      const got = items.reduce((s, x) => s + (x.prize || 0), 0);
      const groups = new Map();
      for (const x of items) {
        const g = x.card ? `card:${x.card}` : `${x.game}:${x.draw?.at}`;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(x);
      }
      return el('section', { class: 'lotto-day' }, [
        el('div', { class: 'lotto-day-head' }, [
          el('strong', { text: dayName(k) }),
          el('span', { class: 'num', text: t('daySum', { spent: money(spent) }) }),
          el('span', { class: `num out-${outcome(got, spent)}`, text: t('dayNet', { v: `${got - spent > 0 ? '+' : got - spent < 0 ? '−' : ''}${money(Math.abs(got - spent))}` }) })
        ]),
        el('div', { class: 'lotto-tickets' }, [...groups.values()].map(g => (g[0].card ? scratchGroup(g) : drawGroup(g))))
      ]);
    });
    if (keys.length > ui.doneDays) out.push(el('button', { type: 'button', class: 'q-btn ghost lotto-more', text: t('earlier', { n: keys.length - ui.doneDays }), onclick: () => { ui.doneDays += 14; ui.paintDone?.(); } }));
    return out;
  }
  // One draw: its numbers once, then each ticket's picks (hits lit up).
  function drawGroup(list) {
    const x0 = list[0];
    const g = GAMES[x0.game];
    const drawn = x0.drawn;
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    const bets = list.reduce((s, x) => s + (x.bets || 1), 0);
    const cost = list.reduce((s, x) => s + (x.cost || 0), 0);
    const winners = list.filter(x => x.prize > 0).length;
    return el('div', { class: `lt-group out-${outcome(got, cost)}`, style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${gameName(x0.game, lang)} · ${hourText(x0.draw.at)}` }), el('span', { class: 'num', text: money(cost) })]),
      drawn ? el('div', { class: 'lt-drawn' }, [el('span', { class: 'lt-label', text: t('called') }), el('div', { class: 'balls' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim')), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean))]) : null,
      el('div', { class: 'lt-lines' }, list.map(x => el('div', { class: `lt-line${x.prize > 0 ? ` won out-${outcome(x.prize, x.cost)}` : ''}` }, [el('div', { class: 'balls' }, picksOf(x)), el('span', { class: 'num', text: x.prize > 0 ? `+${money(x.prize)}` : x.sel.play ? t(x.sel.play) : x.sel.size ? COMBO_NAME[lang][x.sel.size] : x.multiple > 1 ? `×${x.multiple}` : '' })]))),
      el('p', { class: `lt-state out-${outcome(got, cost)}`, text: `${got ? `${t('groupWon', { k: winners, n: list.length, v: money(got) })} · ` : `${t('groupLost', { n: bets })} · `}${outcomeText(got, cost)}` })
    ]);
  }
  // Scratch cards of one kind that day: a tile each, tap to see it again.
  function scratchGroup(list) {
    const c = CARDS[list[0].card];
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    const cost = list.reduce((s, x) => s + (x.cost || 0), 0);
    return el('div', { class: `lt-group out-${outcome(got, cost)}`, style: `--lotto:${c.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${t('scratch')} · ${c[lang]}${list.length > 1 ? ` ×${list.length}` : ''}` }), el('span', { class: 'num', text: money(cost) })]),
      el('div', { class: 'lt-cards' }, list.map(x => el('button', { type: 'button', class: `lt-card${x.prize > 0 ? ` won out-${outcome(x.prize, x.cost)}` : ''}`, onclick: () => openScratch(x.id), text: x.prize > 0 ? compactMoney(x.prize, lang) : '—' }))),
      el('p', { class: `lt-state out-${outcome(got, cost)}`, text: `${got ? t('groupWon', { k: list.filter(x => x.prize > 0).length, n: list.length, v: money(got) }) : t('cardsLost', { n: list.length })} · ${outcomeText(got, cost)}` })
    ]);
  }
  function picksOf(x) {
    const drawn = x.drawn;
    if (x.sel.digits) return x.sel.digits.map(d => ball(d));
    if (x.sel.side) return [el('span', { class: 'q-chip', text: t(x.sel.side) })];
    return [...(x.sel.zones?.[0] || x.sel.numbers || []).map(n => ball(n, drawn?.numbers?.includes(n) ? 'hit' : '')), ...(x.sel.zones?.[1] || []).map(n => ball(n, drawn?.zone2 === n ? 'hit special' : 'special'))];
  }
  function ticketRow(x) {
    if (x.card) {
      const c = CARDS[x.card];
      return el('button', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0, x.cost)}`}`, type: 'button', style: `--lotto:${c.color}`, onclick: () => openScratch(x.id) }, [
        el('div', { class: 'lt-head' }, [el('strong', { text: `${t('scratch')} · ${c[lang]}` }), el('span', { class: 'num', text: money(x.cost) })]),
        el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0, x.cost)}`}`, text: x.status === 'open' ? t('unscratched') : outcomeText(x.prize || 0, x.cost) })
      ]);
    }
    const g = GAMES[x.game];
    const drawn = x.drawn;
    const picked = x.sel.digits ? x.sel.digits.map(d => ball(d, drawn?.digits ? '' : '')) : x.sel.side ? [el('span', { class: 'q-chip', text: t(x.sel.side) })] : [...(x.sel.zones?.[0] || x.sel.numbers || []).map(n => ball(n, drawn?.numbers?.includes(n) ? 'hit' : '')), ...(x.sel.zones?.[1] || []).map(n => ball(n, drawn?.zone2 === n ? 'hit special' : 'special'))];
    return el('div', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0, x.cost)}`}`, style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${gameName(x.game, lang)}${x.sel.play ? ` · ${t(x.sel.play)}` : x.sel.size ? ` · ${COMBO_NAME[lang][x.sel.size]}` : ''}` }), el('span', { class: 'num', text: money(x.cost) })]),
      el('div', { class: 'balls' }, picked),
      drawn ? el('div', { class: 'balls drawn' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim')), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean)) : null,
      el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0, x.cost)}`}`, text: x.status === 'open' ? t('drawAt', { when: timeText(x.draw.at) }) : outcomeText(x.prize || 0, x.cost) })
    ]);
  }

  // 紀錄's 彩券 view.
  function renderTickets(root) {
    if (!root || !ctx.getAccount()) return;
    settleDue();
    root.replaceChildren(myTickets());
  }

  return { render, settleDue, renderTickets };
}
