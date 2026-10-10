import test from 'node:test';
import assert from 'node:assert/strict';
import { modelMean, modelTotal, withModelLines, LEAGUE_TOTALS } from '../public/lib/lines.mjs';
import { gameOptions } from '../public/lib/board.mjs';

const game = (sport, extra = {}) => ({ id: `t-${sport}`, sport, startUtc: '2026-09-28T10:00:00Z', away: { en: 'Away' }, home: { en: 'Home' }, ...extra });

test('league totals: the average for an even game, a little more for a blowout', () => {
  assert.equal(modelMean('mlb', { home: 0.5, away: 0.5 }), LEAGUE_TOTALS.mlb);
  assert.ok(modelMean('nba', { home: 0.9, away: 0.1 }) > modelMean('nba', { home: 0.5, away: 0.5 }));
});

test('soccer: the total from the game\'s own 1X2, fewer goals when a draw is likelier', () => {
  const open = modelMean('epl', { home: 0.55, draw: 0.2, away: 0.25 });
  const tight = modelMean('epl', { home: 0.37, draw: 0.33, away: 0.3 });
  assert.ok(open > tight, `${open} > ${tight}`);
  assert.ok(open > 2.2 && open < 4 && tight > 1.8 && tight < 3.2);
});

test('a modelled total is a half line near the mean, priced like a bookmaker\'s', () => {
  const t = modelTotal(game('mlb'), { home: 0.5, away: 0.5 });
  assert.equal(t.line, 8.5);
  assert.ok(Math.abs(t.overFair - 0.5) < 0.08);
  assert.equal(t.modeled, true);
  // A posted total is kept as it is.
  const posted = { line: 7.5, overFair: 0.52 };
  assert.equal(withModelLines(game('mlb', { total: posted }), { home: 0.5, away: 0.5 }).total, posted);
});

test('a game with only a winner price gets the full board', () => {
  const kinds = g => new Set(gameOptions(g).map(o => o.kind));
  const mlb = kinds(game('mlb', { polymarket: { home: 0.56, away: 0.44 } }));
  for (const k of ['ml', 'total', 'runline', 'teamtotal', 'f5', 'margin', 'firstinning']) assert.ok(mlb.has(k), `mlb ${k}`);
  // Odd or even is no longer sold.
  assert.ok(!mlb.has('oddeven'));
  const nba = kinds(game('nba', { polymarket: { home: 0.7, away: 0.3 } }));
  for (const k of ['ml', 'runline', 'total', 'teamtotal', 'htotal', 'half', 'q1', 'margin']) assert.ok(nba.has(k), `nba ${k}`);
  const soccer = kinds(game('scotland', { draftKings: { home: 0.48, draw: 0.28, away: 0.24 } }));
  for (const k of ['ml', 'total', 'btts', 'score', 'dc', 'htft', 'goalbands']) assert.ok(soccer.has(k), `soccer ${k}`);
  // The model's lines are never shown as the lottery's own line.
  const totals = gameOptions(game('mlb', { polymarket: { home: 0.56, away: 0.44 } })).filter(o => o.kind === 'total');
  assert.ok(totals.length >= 4 && totals.every(o => !o.posted));
});
