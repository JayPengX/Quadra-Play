// The 彩券 tab: Taiwan Lottery's computer-drawn games (lib/lottery.mjs) and
// scratch cards (lib/scratch.mjs), bought with the Quadra balance. Tickets
// live on the account next to the slips, settle against the real draws as
// they come out, and pay into the same pool.
import { GAMES, GAME_ORDER, gameName, nextDraw, quickPick, betCount, checkSelection, buyTicket, settleTicket, dueTickets, drawFor, latestResults, choose } from './lib/lottery.mjs';
import { CARDS, CARD_ORDER, face, facePays, buyScratch, revealScratch, topPrize } from './lib/scratch.mjs';
import { balance, newSlipId } from './lib/account.mjs';
import { compactMoney } from './home.js';
import { ask, tell } from './lib/quadra.mjs';

const T = {
  zh: {
    draws: '電腦彩券', scratch: '刮刮樂', mine: '我的彩券', nextDraw: '下一期', closes: '截止', jackpot: '頭獎累積', price: '每注', buy: '購買', cancel: '取消', buyAsk: '買 {n} 注，共 {v}？', buyAskBody: '{name}，開獎後自動對獎。', scratchAsk: '買一張「{name}」？', scratchAskBody: '{v}，買了馬上刮。', cost: '共', bets: '注', multiple: '倍數',
    quick: '電腦選號', clear: '清除', pickN: '選 {n} 個號碼', zone2: '第二區', straight: '正彩', box: '組彩', pair: '對彩', size: '玩法', combos: '{n} 組',
    stars: '星數', sideTitle: '其他玩法', big: '大', small: '小', odd: '單', even: '雙', bullseye: '超級獎號', latest: '最近開獎', open: '待開獎', won: '中獎', lost: '未中獎',
    today: '今天', yesterday: '昨天', filterAll: '全部', filterWins: '只看中獎', noWins: '還沒有中獎', daySum: '花 {spent}', dayNone: '沒中', outWon: '中 {v}', outNone: '未中', dayNet: '淨 {v}', earlier: '更早的 {n} 天', groupWon: '{n} 張中 {k} 張，共 {v}', groupLost: '{n} 注都沒中', cardsLost: '{n} 張都沒中',
    drawAt: '{when} 開獎', noTickets: '還沒有彩券', buyCard: '購買 {price}', scratchAll: '一次刮開', scratchHint: '刮開銀色區域', youWon: '恭喜中獎！', noWin: '沒有中獎',
    top: '最高 {v}', winRateShort: '中獎率 {p}%', bought: '已購買', funds: '餘額不足', fundsBody: '需要 {v}', closed: '本期已截止', house: 'Quadra 開獎', perBet: '{v} / 注', how: '玩法', winNumbers: '中獎號碼', yourNumbers: '你的號碼', dealer: '莊家', you: '你', prizeCol: '獎金',
    called: '開出號碼', prizes: '獎項', unscratched: '未刮開', every5: '每 5 分鐘開獎', mult: '倍數 ×{m}', settled: '已開獎',
    quick1: '快選 1 注', quickN: '快選 {n} 注', addLine: '加入這注', lines: '已選 {n} 注', remove: '移除', buyAll: '購買 {n} 注 · {v}', boughtN: '已買 {n} 注，共 {v}', seeTickets: '看我的彩券', again: '再買', inMin: '{n} 分鐘後開獎', inHour: '{h} 小時 {m} 分後開獎', picked: '已選 {k}/{n}', starsN: '{n} 星', pickHint: '點下面的號碼，或用快選', slipN: '第 {n} 注', topPrize: '最高獎金', fillRest: '隨機補滿', addNext: '加入，選下一注', quickLines: '快選整注', clearAll: '全部清除', zone1: '第一區', bingoHint: '點 1–10 個號碼，或下面選大小單雙', lastLegend: '上期開出', anyPrize: '任一獎 1/{n}', odds: '機率', oneIn: '1/{n}', yourPick: '你的號碼', waiting: '等待開獎', drawnList: '已開獎', openSum: '{n} 張待開獎', wonSum: '累計中獎 {v}', basketHint: '可以一次買好幾注', sureTitle: '確定購買？', sureBody: '{what} · {v}', sureOk: '購買 {v}'
  },
  en: {
    draws: 'Draw games', scratch: 'Scratch cards', mine: 'My tickets', nextDraw: 'Next draw', closes: 'Closes', jackpot: 'Jackpot', price: 'A bet', buy: 'Buy', cancel: 'Cancel', buyAsk: 'Buy {n} for {v}?', buyAskBody: '{name}; checked by itself after the draw.', scratchAsk: 'Buy a {name} card?', scratchAskBody: '{v}; scratch it straight away.', cost: 'Total', bets: 'bets', multiple: 'Multiple',
    quick: 'Quick pick', clear: 'Clear', pickN: 'Pick {n} numbers', zone2: 'Zone 2', straight: 'Straight', box: 'Box', pair: 'Pair', size: 'Play', combos: '{n} combinations',
    stars: 'Stars', sideTitle: 'Other plays', big: 'Big', small: 'Small', odd: 'Odd', even: 'Even', bullseye: 'Super number', latest: 'Latest draw', open: 'Awaiting draw', won: 'Won', lost: 'No win',
    today: 'Today', yesterday: 'Yesterday', filterAll: 'All', filterWins: 'Wins only', noWins: 'No wins yet', daySum: 'Spent {spent}', dayNone: 'No wins', outWon: 'Won {v}', outNone: 'No prize', dayNet: 'Net {v}', earlier: '{n} earlier days', groupWon: '{k} of {n} won, {v}', groupLost: 'No win on {n} bets', cardsLost: 'No win on {n} cards',
    drawAt: 'Draw {when}', noTickets: 'No tickets yet', buyCard: 'Buy {price}', scratchAll: 'Scratch all', scratchHint: 'Scratch the silver', youWon: 'You won!', noWin: 'No win this time',
    top: 'Top {v}', winRateShort: 'Wins {p}%', bought: 'Bought', funds: 'Not enough money', fundsBody: 'Needs {v}', closed: 'Sales closed', house: 'Quadra draw', perBet: '{v} a bet', how: 'How to play', winNumbers: 'Winning numbers', yourNumbers: 'Your numbers', dealer: 'Dealer', you: 'You', prizeCol: 'Prize',
    called: 'Called', prizes: 'Prizes', unscratched: 'Not scratched', every5: 'A draw every 5 minutes', mult: 'Multiplier ×{m}', settled: 'Drawn',
    quick1: 'Quick pick 1', quickN: 'Quick pick {n}', addLine: 'Add this bet', lines: '{n} bets chosen', remove: 'Remove', buyAll: 'Buy {n} · {v}', boughtN: 'Bought {n} bets, {v}', seeTickets: 'My tickets', again: 'Buy more', inMin: 'Draw in {n} min', inHour: 'Draw in {h}h {m}m', picked: '{k}/{n} picked', starsN: '{n} stars', pickHint: 'Tap numbers below, or quick pick', slipN: 'Bet {n}', topPrize: 'Top prize', fillRest: 'Fill the rest', addNext: 'Add, next bet', quickLines: 'Quick-pick bets', clearAll: 'Clear all', zone1: 'Zone 1', bingoHint: 'Tap 1–10 numbers, or pick big/small/odd/even below', lastLegend: 'In the last draw', anyPrize: 'Any prize 1 in {n}', odds: 'Odds', oneIn: '1 in {n}', yourPick: 'Your numbers', waiting: 'Awaiting the draw', drawnList: 'Drawn', openSum: '{n} awaiting a draw', wonSum: 'Won so far {v}', basketHint: 'Buy several at once', sureTitle: 'Buy this?', sureBody: '{what} · {v}', sureOk: 'Buy for {v}'
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
  const confirmBuy = (icon, title, body) => ask({ lang, icon, title, body, ok: t('buy'), cancel: t('cancel') });
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
    const fill = (...kids) => dialog.replaceChildren(...kids.filter(Boolean));
    const paint = () => {
      const check = checkSelection(id, st.sel);
      const d = nextDraw(id);
      // What 購買 buys: every pick added, and the one on the slip once it's complete.
      const lines = [...st.lines, ...(check.ok ? [st.sel] : [])];
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
      // The slip being filled: its slots, what's left, and the ways to finish it.
      const complete = check.ok;
      const addNow = () => ((st.lines = [...st.lines, structuredClone(st.sel)]), (st.sel = blankSel(id)), paint());
      const status = pickStatus(id, st.sel);
      const latest = ui.latest?.[g.of || id];
      const jackpot = latest?.jackpot;
      fill(
        el('div', { class: 'q-sheet-head' }, [
          el('div', { class: 'ls-title' }, [el('span', { class: 'lotto-emblem', 'aria-hidden': 'true', text: gameName(id, lang).slice(0, 1) }), el('h2', { text: gameName(id, lang) })]),
          el('button', { class: 'q-close', type: 'button', text: '×', 'aria-label': 'close', onclick: close })
        ]),
        el('div', { class: 'ls-hero' }, [
          el('div', {}, [el('small', { text: jackpot ? t('jackpot') : t('topPrize') }), el('strong', { class: 'num', text: jackpot ? compactMoney(jackpot, lang) : topPrizeText(id) })]),
          el('div', {}, [el('small', { text: `${t('nextDraw')} · ${t('perBet', { v: money(g.price) })}` }), el('strong', { text: d ? untilText(d.at) : t('closed') })])
        ]),
        el('section', { class: `ls-slip${complete ? ' done' : ''}` }, [
          el('div', { class: 'ls-slip-head' }, [el('strong', { text: t('slipN', { n: st.lines.length + 1 }) }), el('span', { class: 'ls-status', text: status })]),
          // 3/4星彩: the steppers below are the slip's digits already.
          g.digits ? null : el('div', { class: 'ls-slots' }, slots(id, st.sel, paint)),
          el('div', { class: 'ls-actions' }, [
            el('button', { class: 'q-chip', type: 'button', text: `⚡ ${t('fillRest')}`, onclick: () => ((st.sel = fillRest(id, st.sel)), paint()) }),
            el('button', { class: 'q-chip', type: 'button', text: t('clear'), disabled: pickCount(id, st.sel) ? null : '', onclick: () => ((st.sel = blankSel(id)), paint()) }),
            complete ? el('button', { class: 'ls-add', type: 'button', text: `✓ ${t('addNext')}`, onclick: addNow }) : null
          ])
        ]),
        picker(id, st, paint),
        el('div', { class: 'ls-quick' }, [
          el('span', { text: t('quickLines') }),
          ...[1, 5, 10].map(n => el('button', { class: 'q-chip', type: 'button', text: `+${n}`, onclick: () => ((st.lines = [...st.lines, ...Array.from({ length: n }, () => randomSel(id, st.sel))]), paint()) }))
        ]),
        st.lines.length
          ? el('div', { class: 'lotto-lines' }, [
              el('div', { class: 'ls-lines-head' }, [el('p', { class: 'lotto-h', text: t('lines', { n: st.lines.length }) }), el('button', { class: 'ls-clear-all', type: 'button', text: t('clearAll'), onclick: () => ((st.lines = []), paint()) })]),
              ...st.lines.map((x, i) => el('div', { class: 'lotto-line' }, [el('span', { class: 'num line-n', text: String(i + 1) }), el('div', { class: 'balls' }, selBalls(id, x)), el('button', { class: 'icon-x', type: 'button', 'aria-label': t('remove'), text: '×', onclick: () => ((st.lines = st.lines.filter((_, j) => j !== i)), paint()) })]))
            ])
          : null,
        prizeTable(id, st.sel),
        st.msg ? el('p', { class: 'lotto-msg', role: 'status', text: st.msg }) : null,
        el('div', { class: 'lotto-buybar sticky ls-buybar' }, [
          el('div', { class: 'stepper small', 'aria-label': t('multiple') }, [
            el('button', { type: 'button', text: '−', 'aria-label': '−', onclick: () => ((st.multiple = Math.max(1, st.multiple - 1)), paint()) }),
            el('span', { class: 'ls-mult' }, [el('small', { text: t('multiple') }), el('strong', { class: 'num', text: `×${st.multiple}` })]),
            el('button', { type: 'button', text: '+', 'aria-label': '+', onclick: () => ((st.multiple = Math.min(50, st.multiple + 1)), paint()) })
          ]),
          el('div', { class: 'ls-total' }, [el('small', { text: `${bets} ${t('bets')}` }), el('strong', { class: 'num', text: money(cost) })]),
          el('button', {
            class: 'q-btn primary',
            type: 'button',
            text: t('buy'),
            disabled: bets && d ? null : '',
            onclick: async () => {
              if (!(await confirmBuy(GAMES[id].icon || '🎱', t('buyAsk', { n: bets, v: money(cost) }), t('buyAskBody', { name: GAMES[id][lang] || '' })))) return;
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

  // A game's biggest fixed prize, for the sheet's header when there's no jackpot.
  function topPrizeText(id) {
    const g = GAMES[id];
    const prizes = [...(g.tiers || []).map(x => x.prize || 0), ...Object.values(g.mirror || {}), ...Object.values(g.combo?.sizes || {}), ...Object.values(g.plays || {}).flatMap(p => (p.prize ? [p.prize] : Object.values(p.prizes || {})))];
    // BINGO pays multiples of its stake (10 stars all hit: ×200,000).
    const stars = Object.values(g.stars || {}).flatMap(s => Object.values(s)).map(x => x * g.price);
    const top = Math.max(0, ...prizes, ...stars);
    return top ? compactMoney(top, lang) : money(g.price);
  }
  // How many numbers the selection holds (every zone), and what's left.
  function pickCount(id, sel) {
    const g = GAMES[id];
    if (g.digits) return g.digits;
    if (sel.side) return 1;
    return (sel.zones ? sel.zones.flat() : sel.numbers).length;
  }
  function pickStatus(id, sel) {
    const g = GAMES[id];
    if (g.digits) return t(sel.play);
    if (g.combo) return `${COMBO_NAME[lang][sel.size]} · ${t('picked', { k: sel.numbers.length, n: `${sel.size}–12` })} · ${t('combos', { n: sel.numbers.length >= sel.size ? choose(sel.numbers.length, sel.size) : 0 })}`;
    if (id === 'bingo') return sel.side ? t(sel.side) : t('starsN', { n: sel.numbers.length });
    return g.zones.map((z, i) => `${i ? `${t('zone2')} ` : ''}${sel.zones[i].length}/${z.n}`).join(' · ');
  }
  // The rest of the selection at random, keeping what's picked.
  const topUp = (have, n, max) => {
    const out = new Set(have);
    while (out.size < n) out.add(1 + Math.floor(Math.random() * max));
    return [...out].sort((a, b) => a - b);
  };
  function fillRest(id, sel) {
    const g = GAMES[id];
    if (g.digits) return { ...sel, digits: sel.digits.map(() => Math.floor(Math.random() * 10)) };
    if (g.combo) return { ...sel, numbers: topUp(sel.numbers, Math.max(sel.size, sel.numbers.length), g.combo.max) };
    if (id === 'bingo') return { numbers: topUp(sel.side ? [] : sel.numbers, Math.max(5, sel.side ? 0 : sel.numbers.length), 80) };
    return { zones: g.zones.map((z, i) => topUp(sel.zones[i], z.n, z.max)) };
  }
  // The slip's slots: each number picked (tap to take it back) and each still
  // to pick as an empty circle; the second zone in the game's colour.
  function slots(id, sel, paint) {
    const g = GAMES[id];
    const take = (list, n) => () => (list.splice(list.indexOf(n), 1), paint());
    const filled = (n, list, cls = '') => el('button', { class: `ls-slot on ${cls}`, type: 'button', 'aria-label': `${t('remove')} ${n}`, text: String(n).padStart(2, '0'), onclick: take(list, n) });
    const empty = (cls = '') => el('span', { class: `ls-slot ${cls}`, 'aria-hidden': 'true' });
    if (g.digits) return sel.digits.map(dg => el('span', { class: 'ls-slot on digit', text: String(dg) }));
    if (sel.side) return [el('span', { class: 'ls-slot on wide', text: t(sel.side) })];
    if (g.combo) return [...sel.numbers.map(n => filled(n, sel.numbers)), ...Array.from({ length: Math.max(0, sel.size - sel.numbers.length) }, () => empty())];
    if (id === 'bingo') return sel.numbers.length ? sel.numbers.map(n => filled(n, sel.numbers)) : [el('span', { class: 'ls-hint', text: t('bingoHint') })];
    return g.zones.flatMap((z, i) => [
      ...(i ? [el('span', { class: 'ls-plus', 'aria-hidden': 'true', text: '+' })] : []),
      ...sel.zones[i].map(n => filled(n, sel.zones[i], i ? 'special' : '')),
      ...Array.from({ length: Math.max(0, z.n - sel.zones[i].length) }, () => empty(i ? 'special' : ''))
    ]);
  }

  const ball = (n, cls = '') => el('span', { class: `ball ${cls}`, text: String(n).padStart(2, '0') });

  // A slip's grid: ten numbers a row like the real slip (eight for a second
  // zone), the last draw's numbers marked with a dot. A full zone replaces
  // its oldest pick when another is tapped.
  function numberGrid(max, chosen, limit, onPick, { hits = [], last = [], cols = 10 } = {}) {
    return el(
      'div',
      { class: 'num-grid', style: `--cols:${cols}` },
      Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const on = chosen.includes(n);
        return el('button', {
          type: 'button',
          class: `num-cell${on ? ' on' : ''}${hits.includes(n) ? ' hit' : ''}${last.includes(n) ? ' last' : ''}`,
          'aria-pressed': String(on),
          text: String(n).padStart(2, '0'),
          onclick: () => {
            if (on) chosen.splice(chosen.indexOf(n), 1);
            else {
              if (chosen.length >= limit) chosen.shift();
              chosen.push(n);
            }
            chosen.sort((a, b) => a - b);
            onPick();
          }
        });
      })
    );
  }
  // The last draw's numbers (by zone, or all together), to mark on the grid.
  function lastOf(id, byZone = false) {
    const r = ui.latest?.[GAMES[id].of || id];
    if (!r?.numbers) return [];
    return byZone ? [r.numbers, r.special != null ? [r.special] : r.zone2 != null ? [r.zone2] : []] : r.numbers;
  }

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
        )
      ]);
    }
    if (g.combo) {
      const sizes = Object.keys(g.combo.sizes).map(Number);
      return el('div', { class: 'lotto-pick' }, [
        el('div', { class: 'segmented small', role: 'group' }, sizes.map(z => el('button', { type: 'button', 'aria-pressed': String(sel.size === z), text: COMBO_NAME[lang][z], onclick: () => ((sel.size = z), paint()) }))),
        numberGrid(g.combo.max, sel.numbers, 12, paint, { last: lastOf(id) })
      ]);
    }
    if (id === 'bingo') {
      const sides = [['big', 'big'], ['small', 'small'], ['odd', 'odd'], ['even', 'even']];
      return el('div', { class: 'lotto-pick' }, [
        numberGrid(80, sel.numbers, 10, () => ((sel.side = undefined), paint()), { last: lastOf(id) }),
        el('p', { class: 'lotto-h', text: t('sideTitle') }),
        el(
          'div',
          { class: 'lotto-sides' },
          sides.map(([key]) => el('button', { type: 'button', class: `q-chip${sel.side === key ? ' on' : ''}`, 'aria-pressed': String(sel.side === key), text: t(key), onclick: () => ((sel.side = sel.side === key ? undefined : key), (sel.numbers = []), paint()) }))
        )
      ]);
    }
    const last = lastOf(id, true);
    return el('div', { class: 'lotto-pick' }, [
      ...g.zones.flatMap((z, i) => [
        el('p', { class: `ls-zone${sel.zones[i].length === z.n ? ' full' : ''}` }, [el('strong', { text: i ? t('zone2') : t('zone1') }), el('span', { text: `${t('pickN', { n: z.n })} · ${sel.zones[i].length}/${z.n}` })]),
        numberGrid(z.max, sel.zones[i], z.n, paint, { last: last[i] || [], cols: z.max <= 8 ? z.max : 10 })
      ]),
      last.length ? el('p', { class: 'ls-legend' }, [el('span', { class: 'ls-dot', 'aria-hidden': 'true' }), document.createTextNode(t('lastLegend'))]) : null
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
    return el('details', { class: 'lotto-prizes' }, [
      el('summary', { text: t('prizes') }),
      el('table', {}, [el('tr', { class: 'lp-head' }, [el('th', { text: '' }), el('th', { text: '' }), el('th', { text: t('prizes') })]), ...rows.map(r => el('tr', {}, r.map(c => el('td', { text: c }))))])
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
          el('h3', { class: 'sc-shelf-head' }, [el('span', { class: 'num', text: money(price) }), el('small', { text: t('top', { v: compactMoney(topPrize(CARD_ORDER.find(id => CARDS[id].price === price)), lang) }) })]),
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
    if (!(await confirmBuy(CARDS[id].icon, t('scratchAsk', { name: CARDS[id][lang] }), t('scratchAskBody', { v: money(CARDS[id].price) })))) return;
    const r = buyScratch(ctx.getAccount(), { id: newSlipId(), card: id }, new Date(), { extra: extra() });
    if (r.error) return void tell({ lang, icon: '💸', title: t('funds'), body: t('fundsBody', { v: money(CARDS[id].price) }) });
    ctx.commitAccount(r.account);
    ctx.track(null, [`scratch:${id}`], 1);
    // Rewards' bonus mission: a scratch card bought (a draw ticket is 'lottery').
    ctx.track('scratch');
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
  // A ticket, draw or day shows what it won: the prize in green, or a quiet dash.
  const outcome = got => (got > 0 ? 'up' : 'none');
  const outcomeText = got => (got > 0 ? t('outWon', { v: money(got) }) : t('outNone'));
  const netChip = got => el('span', { class: `lt-net num out-${outcome(got)}`, text: got > 0 ? `+${money(got)}` : '—' });
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
      done.length ? el('div', { class: 'lotto-summary' }, [el('span', { text: t('wonSum', { v: '' }).trim() }), netChip(won)]) : null,
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
          netChip(got)
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
    return el('div', { class: 'lt-group', style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-title' }, [el('strong', { text: gameName(x0.game, lang) }), el('small', { class: 'num', text: hourText(x0.draw.at) })]), netChip(got)]),
      drawn ? el('div', { class: 'lt-drawn' }, [el('span', { class: 'lt-label', text: t('called') }), el('div', { class: 'balls' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim')), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean))]) : null,
      el('div', { class: 'lt-lines' }, list.map(x => el('div', { class: `lt-line${x.prize > 0 ? ` won out-up` : ''}` }, [el('div', { class: 'balls' }, picksOf(x)), el('span', { class: 'num', text: x.prize > 0 ? `+${money(x.prize)}` : x.sel.play ? t(x.sel.play) : x.sel.size ? COMBO_NAME[lang][x.sel.size] : x.multiple > 1 ? `×${x.multiple}` : '' })]))),
    ]);
  }
  // Scratch cards of one kind that day: a tile each, tap to see it again.
  function scratchGroup(list) {
    const c = CARDS[list[0].card];
    const got = list.reduce((s, x) => s + (x.prize || 0), 0);
    return el('div', { class: 'lt-group', style: `--lotto:${c.color}` }, [
      el('div', { class: 'lt-head' }, [el('div', { class: 'lt-title' }, [el('strong', { text: `${c.icon} ${c[lang]}${list.length > 1 ? ` ×${list.length}` : ''}` }), el('small', { class: 'num', text: t('scratch') })]), netChip(got)]),
      el('div', { class: 'lt-cards' }, list.map(x => el('button', { type: 'button', class: `lt-card${x.prize > 0 ? ` won out-up` : ''}`, onclick: () => openScratch(x.id), text: x.prize > 0 ? compactMoney(x.prize, lang) : '—' }))),
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
      return el('button', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0)}`}`, type: 'button', style: `--lotto:${c.color}`, onclick: () => openScratch(x.id) }, [
        el('div', { class: 'lt-head' }, [el('strong', { text: `${t('scratch')} · ${c[lang]}` }), el('span', { class: 'num', text: money(x.cost) })]),
        el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0)}`}`, text: x.status === 'open' ? t('unscratched') : outcomeText(x.prize || 0) })
      ]);
    }
    const g = GAMES[x.game];
    const drawn = x.drawn;
    const picked = x.sel.digits ? x.sel.digits.map(d => ball(d, drawn?.digits ? '' : '')) : x.sel.side ? [el('span', { class: 'q-chip', text: t(x.sel.side) })] : [...(x.sel.zones?.[0] || x.sel.numbers || []).map(n => ball(n, drawn?.numbers?.includes(n) ? 'hit' : '')), ...(x.sel.zones?.[1] || []).map(n => ball(n, drawn?.zone2 === n ? 'hit special' : 'special'))];
    return el('div', { class: `lotto-ticket${x.status === 'open' ? '' : ` out-${outcome(x.prize || 0)}`}`, style: `--lotto:${g.color}` }, [
      el('div', { class: 'lt-head' }, [el('strong', { text: `${gameName(x.game, lang)}${x.sel.play ? ` · ${t(x.sel.play)}` : x.sel.size ? ` · ${COMBO_NAME[lang][x.sel.size]}` : ''}` }), el('span', { class: 'num', text: money(x.cost) })]),
      el('div', { class: 'balls' }, picked),
      drawn ? el('div', { class: 'balls drawn' }, [...(drawn.digits || drawn.numbers || []).map(n => ball(n, 'dim')), drawn.special != null ? ball(drawn.special, 'dim special') : null, drawn.zone2 != null ? ball(drawn.zone2, 'dim special') : null].filter(Boolean)) : null,
      el('p', { class: `lt-state ${x.status === 'open' ? '' : `out-${outcome(x.prize || 0)}`}`, text: x.status === 'open' ? t('drawAt', { when: timeText(x.draw.at) }) : outcomeText(x.prize || 0) })
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
