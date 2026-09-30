// Cash out: an open slip sold back to the house before its games are over.
//
// The price is the slip's worth now: every way its undecided picks can still
// land, each weighed by the chance the board's current odds give it (1 / odds,
// so the house's cut is in it), times what the slip would pay then (tax, the
// payout cap and its parlay boost included), less what the house keeps
// (CASHOUT_KEEP; less for Quadra Plus). A pick with no price right now (its
// game under way with no live market, or locked) suspends cash out, as does a
// slip with two undecided picks of one game (they aren't independent).
import { settleSlip } from './odds.mjs';

export const CASHOUT_KEEP = 0.05;
// More undecided picks than this: no cash out (2^n ways to weigh).
export const CASHOUT_MAX_OPEN = 8;

// `prices`: one per leg, the current decimal odds of each undecided leg
// (null when there is none). Returns whole NT$, or null when it can't be
// cashed out now.
export function cashOutValue(slip, prices, { keep = CASHOUT_KEEP } = {}) {
  if (!slip || slip.status !== 'open' || slip.recovered || !slip.legs?.length) return null;
  const open = [];
  slip.legs.forEach((leg, i) => leg.result || open.push(i));
  if (!open.length || open.length > CASHOUT_MAX_OPEN) return null;
  const games = open.map(i => slip.legs[i].gameId ?? `#${i}`);
  if (new Set(games).size < games.length) return null;
  const p = [];
  for (const i of open) {
    const odds = prices[i];
    if (!(odds > 1)) return null;
    p.push(1 / odds);
  }
  const legs = slip.legs.map(leg => ({ gameId: leg.gameId, odds: leg.odds, result: leg.result }));
  let worth = 0;
  for (let won = 0; won < 1 << open.length; won++) {
    let chance = 1;
    open.forEach((i, k) => {
      const hit = won & (1 << k);
      chance *= hit ? p[k] : 1 - p[k];
      legs[i].result = hit ? 'won' : 'lost';
    });
    if (chance > 0) worth += chance * settleSlip({ legs, sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0, lift: slip.lift ?? 0 }).net;
  }
  const value = Math.floor(worth * (1 - keep) + 1e-6);
  return value >= 1 ? value : null;
}
