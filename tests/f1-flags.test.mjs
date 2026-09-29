import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextKambiF1Race, parseKambiF1Race, parseF1Flags, parseOpenF1Flags, F1_FLAG_BASE } from '../public/lib/sources.mjs';
import { legResult } from '../public/lib/account.mjs';

const NOW = new Date('2026-09-29T06:00:00Z');

test("Kambi's next race: the drivers' chances from its winner prices", () => {
  const list = {
    events: [
      { event: { id: 1, name: 'Drivers Championship 2026', start: '2026-12-06T13:00:00Z', state: 'NOT_STARTED' } },
      { event: { id: 2, name: 'Race: Bahrain GP 2026', start: '2026-10-04T07:00:00Z', state: 'NOT_STARTED' } }
    ]
  };
  const race = nextKambiF1Race(list, NOW);
  assert.equal(race.id, 2);
  const names = ['Kimi Antonelli', 'George Russell', 'Lando Norris', 'Max Verstappen', 'Charles Leclerc', 'Lewis Hamilton', 'Oscar Piastri', 'Isack Hadjar', 'Pierre Gasly', 'Carlos Sainz', 'Alexander Albon'];
  const odds = [2250, 4500, 6500, 6500, 10000, 10000, 15000, 34000, 51000, 751000, 751000];
  const offers = {
    betOffers: [
      { criterion: { englishLabel: 'GP Winner' }, from: 1, to: 3, outcomes: names.map(participant => ({ participant, odds: 1500 })) },
      { criterion: { englishLabel: 'GP Winner' }, from: 1, to: 1, outcomes: names.map((participant, i) => ({ participant, odds: odds[i] })) }
    ]
  };
  const parsed = parseKambiF1Race(race, offers);
  assert.equal(parsed.title, 'Bahrain Grand Prix');
  assert.equal(parsed.startUtc, '2026-10-04T07:00:00.000Z');
  assert.equal(parsed.drivers[0].name, 'Kimi Antonelli');
  assert.ok(Math.abs(parsed.drivers.reduce((s, d) => s + d.fair, 0) - 1) < 1e-6);
  assert.equal(parseKambiF1Race(race, { betOffers: [] }), null);
});

test("Safety car and red flag: Polymarket's price when it has the race, else history", () => {
  const events = [
    { slug: 'f1-azerbaijan-grand-prix-safety-car-2026-09-26', startTime: '2026-09-26T11:00:00Z', markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0.62","0.38"]' }] },
    { slug: 'f1-azerbaijan-grand-prix-red-flag-2026-09-26', startTime: '2026-09-26T11:00:00Z', markets: [{ outcomes: '["Yes","No"]', outcomePrices: '["0.2","0.8"]' }] }
  ];
  const baku = parseF1Flags(events, '2026-09-26T11:00:00Z');
  assert.deepEqual(baku.sc, { fair: 0.62, source: 'polymarket' });
  assert.deepEqual(baku.red, { fair: 0.2, source: 'polymarket' });
  assert.deepEqual(baku.vsc, { fair: F1_FLAG_BASE.vsc, source: 'history' });
  const next = parseF1Flags(events, '2026-10-04T07:00:00Z');
  assert.equal(next.sc.source, 'history');
});

test('OpenF1 race control: settled once the race is over', () => {
  const baku = [
    { message: 'SESSION STARTED' },
    { message: 'SAFETY CAR DEPLOYED' },
    { message: 'SAFETY CAR IN THIS LAP' },
    { message: 'CHEQUERED FLAG', flag: 'CHEQUERED' }
  ];
  assert.deepEqual(parseOpenF1Flags(baku), { status: 'final', flags: { sc: true, vsc: false, red: false } });
  // 2026's wording: no RED in the flag field; "CHEQUERED FLAG" isn't a red flag.
  const monaco = [{ message: 'VSC DEPLOYED' }, { message: 'RED FLAG - RACE SUSPENDED' }, { message: 'CHEQUERED FLAG' }];
  assert.deepEqual(parseOpenF1Flags(monaco).flags, { sc: false, vsc: true, red: true });
  assert.equal(parseOpenF1Flags([{ message: 'SAFETY CAR DEPLOYED' }]).status, 'pending');
  assert.equal(parseOpenF1Flags([]).status, 'pending');

  const outcome = parseOpenF1Flags(baku);
  assert.equal(legResult({ kind: 'f1sc', pick: 'yes' }, outcome), 'won');
  assert.equal(legResult({ kind: 'f1sc', pick: 'no' }, outcome), 'lost');
  assert.equal(legResult({ kind: 'f1red', pick: 'no' }, outcome), 'won');
  assert.equal(legResult({ kind: 'f1vsc', pick: 'yes' }, outcome), 'lost');
  assert.equal(legResult({ kind: 'f1red', pick: 'yes' }, { status: 'void' }), 'void');
});

test("A head-to-head saved without its rival: the rival from the pick's id", () => {
  const outcome = { status: 'final', order: ['Kimi Antonelli', 'George Russell', 'Lando Norris', 'Oscar Piastri', 'A', 'B', 'C', 'D', 'E', 'F'] };
  assert.equal(legResult({ id: 'f1h2h|Oscar Piastri|Lando Norris', kind: 'f1h2h', driver: 'Oscar Piastri' }, outcome), 'lost');
  assert.equal(legResult({ id: 'f1h2h|Lando Norris|Oscar Piastri', kind: 'f1h2h', driver: 'Lando Norris', rival: 'Oscar Piastri' }, outcome), 'won');
});
