import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalMarkets, fitHockey, baseballMarkets } from '../public/lib/markets.mjs';
import { legResult } from '../public/lib/account.mjs';

const sum = picks => picks.reduce((s, p) => s + p.fair, 0);

test('Hockey: both teams to score, total goals, margin and odd/even count the overtime goal', () => {
  const markets = goalMarkets(fitHockey(0.55, { line: 5.5, overFair: 0.5 }), { family: 'hockey', totalLine: 5.5 });
  const kinds = new Set(markets.map(m => m.kind));
  for (const k of ['runline', 'teamtotal', 'total', 'regulation', 'btts', 'goalbands', 'margin', 'oddeven']) assert.ok(kinds.has(k), k);
  for (const k of ['btts', 'goalbands', 'margin', 'oddeven']) assert.ok(Math.abs(sum(markets.find(m => m.kind === k).picks) - 1) < 1e-6, k);
  // No final ends level.
  assert.equal(markets.filter(m => m.kind === 'oddeven').length, 1);
  assert.equal(legResult({ kind: 'btts', side: 'yes' }, { status: 'final', awayScore: 3, homeScore: 2 }), 'won');
  assert.equal(legResult({ kind: 'goalbands', lo: 5, hi: 6 }, { status: 'final', awayScore: 3, homeScore: 2 }), 'won');
});

test('Baseball: first five innings total, settled from the innings', () => {
  const markets = baseballMarkets({ homeWin: 0.55, total: { line: 8.5, overFair: 0.5 } });
  const f5 = markets.filter(m => m.kind === 'f5total');
  assert.ok(f5.length >= 2);
  const main = f5.find(m => m.posted);
  assert.ok(main.line > 3 && main.line < 6, String(main.line));
  for (const m of f5) assert.ok(Math.abs(sum(m.picks) - 1) < 1e-9);
  const outcome = { status: 'final', awayScore: 5, homeScore: 3, awayInnings: [1, 0, 2, 0, 0, 1, 1, 0, 0], homeInnings: [0, 0, 1, 1, 0, 0, 1, 0, 0] };
  assert.equal(legResult({ kind: 'f5total', side: 'over', line: 4.5 }, outcome), 'won');
  assert.equal(legResult({ kind: 'f5total', side: 'under', line: 4.5 }, outcome), 'lost');
  assert.equal(legResult({ kind: 'f5total', side: 'over', line: 4.5 }, { status: 'final', awayScore: 1, homeScore: 0, awayInnings: [1, 0, 0, 0], homeInnings: [0, 0, 0, 0] }), 'void');
});
