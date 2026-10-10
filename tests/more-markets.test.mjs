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

test("a preseason game's players: their regular season's numbers at a preseason's minutes (Durant isn't favoured to pass 25.5 in an exhibition)", async () => {
  const { modelProps } = await import('../public/lib/propmodel.mjs');
  const durant = { name: 'Kevin Durant', side: 'home', pos: 'F', gp: 62, totals: { pts: 62 * 26.6, reb: 62 * 6, ast: 62 * 4.2, threes: 62 * 2.2, min: 62 * 36 } };
  const pts = list => list.filter(p => p.stat === 'pts' && p.side === 'over');
  const regular = pts(modelProps('nba', [durant], null));
  const pre = pts(modelProps('nba', [durant], null, { preseason: true }));
  assert.equal(regular[0].line, 26.5);
  // About 60% of the minutes: a line in the mid-teens, and nothing at 25.5.
  assert.ok(pre[0].line <= 16.5 && pre[0].line >= 14.5, `line ${pre[0].line}`);
  assert.ok(!pre.some(p => p.line >= 25.5));
  assert.ok(pre[0].fair < 0.55);
});
