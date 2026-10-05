// F1 pole position (排位賽第一): priced, closed at qualifying, settled from ESPN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseF1Pole, parseKambiF1Pole, parseEspnPole } from '../public/lib/sources.mjs';
import { f1PoleFromWinner } from '../public/lib/board.mjs';
import { legResult } from '../public/lib/account.mjs';

const drivers = ['George Russell', 'Max Verstappen', 'Charles Leclerc', 'Lando Norris', 'Oscar Piastri', 'Kimi Antonelli', 'Lewis Hamilton', 'Fernando Alonso', 'Carlos Sainz', 'Alexander Albon', 'Isack Hadjar'];

test('Polymarket\'s driver pole market for the weekend, not the sprint\'s', () => {
  const market = (name, p) => ({ groupItemTitle: name, outcomePrices: JSON.stringify([String(p), String(1 - p)]), closed: false });
  const events = [
    { slug: 'f1-bahrain-grand-prix-sprint-qualifying-pole-winner-2026-10-02', startTime: '2026-10-02T15:00:00Z', markets: drivers.map(d => market(d, 0.09)) },
    { slug: 'f1-bahrain-grand-prix-driver-pole-position-2026-10-03', startTime: '2026-10-03T15:00:00Z', markets: drivers.map((d, i) => market(d, i === 0 ? 0.4 : 0.06)) }
  ];
  const pole = parseF1Pole(events, '2026-10-04T15:00:00Z');
  assert.equal(pole.source, 'polymarket');
  assert.equal(pole.drivers[0].name, 'George Russell');
  assert.ok(Math.abs(pole.drivers.reduce((s, d) => s + d.fair, 0) - 1) < 1e-6);
  // Another weekend's market doesn't count.
  assert.equal(parseF1Pole(events, '2026-10-25T15:00:00Z'), null);
});

test('Kambi\'s pole offer when it lists one', () => {
  const outcomes = drivers.map((d, i) => ({ participant: d, odds: i === 0 ? 2500 : 12000 }));
  assert.equal(parseKambiF1Pole({ betOffers: [{ criterion: { englishLabel: 'GP Winner' }, outcomes }] }), null);
  const pole = parseKambiF1Pole({ betOffers: [{ criterion: { englishLabel: 'Pole Position' }, outcomes }] });
  assert.equal(pole.source, 'kambi');
  assert.equal(pole.drivers[0].name, 'George Russell');
});

test('without a market: the winner\'s chances, a little sharper', () => {
  const win = [{ name: 'A', fair: 0.5 }, { name: 'B', fair: 0.3 }, { name: 'C', fair: 0.2 }];
  const pole = f1PoleFromWinner(win);
  assert.ok(Math.abs(pole.reduce((s, d) => s + d.fair, 0) - 1) < 1e-9);
  assert.ok(pole[0].fair > 0.5 && pole[2].fair < 0.2);
});

test('settled by the qualifying session\'s first place', () => {
  const board = { events: [{ competitions: [
    { type: { abbreviation: 'Qual' }, date: '2026-09-25T12:00Z', status: { type: { name: 'STATUS_FINAL', completed: true } }, competitors: [{ order: 2, athlete: { displayName: 'Charles Leclerc' } }, { order: 1, athlete: { displayName: 'George Russell' } }] },
    { type: { abbreviation: 'Race' }, date: '2026-09-26T11:00Z', status: { type: { name: 'STATUS_SCHEDULED', completed: false } }, competitors: [] }
  ] }] };
  const result = parseEspnPole(board, '2026-09-25T12:00:00.000Z');
  assert.deepEqual(result, { status: 'final', pole: 'George Russell' });
  assert.equal(legResult({ kind: 'f1pole', driver: 'George Russell' }, result), 'won');
  assert.equal(legResult({ kind: 'f1pole', driver: 'Charles Leclerc' }, result), 'lost');
  assert.equal(legResult({ kind: 'f1pole', driver: 'Charles Leclerc' }, { status: 'pending' }), null);
});

test('pole: our own estimate from qualifying form and the winner board; a thin, flat market barely counts, a traded one does', async () => {
  const { f1PoleModel } = await import('../public/lib/board.mjs');
  const { parseF1QualiForm } = await import('../public/lib/sources.mjs');
  // ESPN's season: three qualifying sessions, newest last in the list.
  const qual = (date, order) => ({ competitions: [{ type: { abbreviation: 'Qual' }, date, status: { type: { completed: true } }, competitors: order.map((n, i) => ({ order: i + 1, athlete: { displayName: n } })) }] });
  const espn = { events: [qual('2026-09-05T14:00Z', ['Lando Norris', 'Max Verstappen', 'Oscar Piastri']), qual('2026-09-19T14:00Z', ['Max Verstappen', 'Lando Norris', 'Oscar Piastri']), qual('2026-10-03T14:00Z', ['Max Verstappen', 'Oscar Piastri', 'Lando Norris']), qual('2026-10-17T14:00Z', ['Oscar Piastri', 'Max Verstappen', 'Lando Norris'])] };
  const form = parseF1QualiForm(espn, '2026-10-10T00:00Z');
  assert.deepEqual(form.find(d => d.name === 'Max Verstappen').places, [1, 1, 2], 'newest first, nothing after the race asked for');
  // Polymarket days before: barely traded, everyone the same.
  const flat = { volume: 3_000, drivers: ['Max Verstappen', 'Lando Norris', 'Oscar Piastri', 'George Russell'].map(name => ({ name, fair: 0.25 })) };
  const own = f1PoleModel({ form, market: flat });
  assert.ok(own.marketWeight < 0.05);
  assert.equal(own.drivers[0].name, 'Max Verstappen');
  assert.ok(own.drivers[0].fair > 0.4, 'the form favourite is a favourite, not 1 in 4');
  // Kambi's names ("Verstappen, Max") are the same drivers.
  const traded = { volume: Infinity, drivers: [{ name: 'Piastri, Oscar', fair: 0.6 }, { name: 'Verstappen, Max', fair: 0.25 }, { name: 'Norris, Lando', fair: 0.15 }] };
  const mk = f1PoleModel({ form, market: traded });
  assert.ok(mk.marketWeight > 0.9);
  assert.ok(Math.abs(mk.drivers.find(d => /Piastri/.test(d.name)).fair - 0.6) < 0.05);
});
