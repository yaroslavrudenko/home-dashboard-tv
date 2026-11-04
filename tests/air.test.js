'use strict';
// Batch 12 (air quality, data side): ONE Open-Meteo air-quality request for the home city and the three Israel regions,
// the European AQI bands and the dust flag on rounded values, and the hourly store (the shared PlaceStore). Fixtures:
// real answers recorded on 2026-11-02 (tests/fixtures/air, copied unedited from the design captures).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/refresher.js', 'js/placestore.js', 'js/openmeteo.js', 'js/air.js'];
const air = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'air', name + '.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // G5: the index maps have no prototype
// The places the App asks for: home + the Israel regions (Config.israel.regions → Config.places), derived, never listed.
function places(ctx) {
  const byId = {};
  for (const p of ctx.Config.places) byId[p.id] = p;
  return [ctx.Config.places[0]].concat(ctx.Config.israel.regions.map((r) => byId[r.place]));
}

test('config: hourly, 15 s timeout, the weather back-off, stale after 3 h, dust flagged from 100 µg/m³', () => {
  const a = plain(load(FILES).Config.air);
  assert.deepEqual(a, { base: 'https://air-quality-api.open-meteo.com/v1/air-quality', refreshMs: 3600000, timeoutMs: 15000,
    retryMs: [60000, 120000, 240000, 480000], retryFloorMs: 30000, staleAfterMs: 3 * 3600000, keepMaxMs: 12 * 3600000, dustUgm3: 100,
    dustGradesUgm3: [121, 196, 271], forecastDays: 5, dustDayMinHours: 20 });   // FIX-18B 13: the EEA PM10 band bounds   // B13-D1 / B13-D3: the dust forecast's days and a day's minimum of hourly values
});

test('URL: ONE request for the four places, in order; only the two values the screens show (S5: AQI and dust); no key', () => {
  const ctx = load(FILES), u = new URL(ctx.Air.url(places(ctx), ctx.Config.air));
  assert.equal(u.origin + u.pathname, 'https://air-quality-api.open-meteo.com/v1/air-quality');
  assert.equal(u.searchParams.get('latitude'), '31.8928,32.794,32.0853,31.2518', 'home (Rehovot), Haifa, Tel Aviv, Beer Sheva');
  assert.equal(u.searchParams.get('longitude'), '34.8113,34.9896,34.7818,34.7913');
  assert.equal(u.searchParams.get('current'), 'european_aqi,dust');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('hourly'), 'dust', 'B13-D1: the dust forecast in the SAME request, no AQI hourly (not shown)');
  assert.equal(u.searchParams.get('forecast_days'), '5', 'B13-D1');
  assert.ok(!/key|token/i.test(u.search));
});

test('parse: the recorded answer of each place; one that carries nothing usable throws', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = air('aq-4places');
  assert.deepEqual(plain(ctx.Air.parse(list[0], cfg)), { aqi: 38, dust: 25, forecast: { byHour: {}, byDay: {} } }, 'S5: only what is shown; B13-D1: an answer with no hourly block has no forecast; X10: the index built at parse');
  assert.deepEqual(plain(list.map((p) => ctx.Air.parse(p, cfg).aqi)), [38, 31, 41, 36]);
  const someNull = JSON.parse(JSON.stringify(list[0])); someNull.current.dust = null;
  assert.deepEqual(plain(ctx.Air.parse(someNull, cfg)), { aqi: 38, dust: null, forecast: { byHour: {}, byDay: {} } });   // B13-D1, X10
  const dustOnly = JSON.parse(JSON.stringify(list[0])); dustOnly.current.european_aqi = Infinity;
  assert.deepEqual(plain(ctx.Air.parse(dustOnly, cfg)), { aqi: null, dust: 25, forecast: { byHour: {}, byDay: {} } }, 'not a finite number: no value');   // B13-D1, X10
  const allNull = JSON.parse(JSON.stringify(list[0]));
  for (const k of ['european_aqi', 'dust']) allNull.current[k] = null;
  for (const bad of [allNull, { latitude: 1 }, air('aq-error'), null]) assert.throws(() => ctx.Air.parse(bad, cfg), /air/, JSON.stringify(bad).slice(0, 60));
});

test('summary: European AQI bands on the ROUNDED value — ≤20 good, ≤40 fair, ≤60 moderate, ≤80 poor, ≤100 very poor, above extreme', () => {
  const ctx = load(FILES), cfg = ctx.Config.air;
  const level = (aqi) => { const s = ctx.Air.summary({ aqi, dust: null, time: 't' }, cfg); return [s.aqi, s.level]; };
  const vectors = [[0, 0, 'good'], [20, 20, 'good'], [20.5, 21, 'fair'], [40, 40, 'fair'], [41, 41, 'moderate'], [60, 60, 'moderate'],
    [61, 61, 'poor'], [80, 80, 'poor'], [81, 81, 'veryPoor'], [100, 100, 'veryPoor'], [101, 101, 'extreme'], [null, null, null]];
  for (const [raw, aqi, lvl] of vectors) assert.deepEqual(plain(level(raw)), [aqi, lvl], String(raw));
  assert.equal(ctx.Air.summary(null, cfg), null, 'no data: no summary');
});

test('dust: flagged when the ROUNDED value reaches 100 µg/m³ (99.4 no, 99.5 yes, 100 yes, null no); today\'s readings are ordinary haze', () => {
  const ctx = load(FILES), cfg = ctx.Config.air;
  const dust = (d) => { const s = ctx.Air.summary({ aqi: 30, dust: d, time: 't' }, cfg); return [s.dust, s.dustHigh]; };
  for (const [raw, n, high] of [[99.4, 99, false], [99.5, 100, true], [100, 100, true], [240, 240, true], [null, null, false]]) {
    assert.deepEqual(plain(dust(raw)), [n, high], String(raw));
  }
  assert.ok(air('aq-4places').every((p) => !ctx.Air.summary(ctx.Air.parse(p, cfg), cfg).dustHigh), 'recorded 10–32 µg/m³: no flag');
});

function store(ctx) {
  const t = fakeTimers(Date.parse('2026-11-02T09:00:00Z')), calls = [];
  let changes = 0;
  const s = ctx.Air.createStore(places(ctx), ctx.Config.air, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    random: () => 0.5, onChange: () => { changes++; }, getJson: (url, ms, done) => calls.push({ url, ms, done }) });
  return { t, s, calls, changes: () => changes };
}

test('store: ONE request for all four places, answer i → place i; an hour to the next one', () => {
  const ctx = load(FILES), h = store(ctx);
  assert.equal(h.s.refresh(), true);
  assert.equal(h.s.refresh(), false);
  assert.equal(h.calls.length, 1, 'one request whatever the number of places');
  assert.equal(h.calls[0].ms, 15000);
  h.calls[0].done(null, air('aq-4places'));
  assert.deepEqual(['home', 'haifa', 'telaviv', 'beersheva'].map((id) => h.s.get(id).aqi), [38, 31, 41, 36]);
  assert.deepEqual(['home', 'haifa'].map((id) => h.s.status(id).kind), ['fresh', 'fresh']);
  assert.equal(h.changes(), 1);
  assert.deepEqual(h.t.pending(), [3600000], 'hourly: the data are hourly');
});

test('store: a 400 error answer is a failure — the last good values stay (stale) and the next try is jittered within 1 min', () => {
  const ctx = load(FILES), h = store(ctx);
  h.s.refresh();
  h.calls[0].done(null, air('aq-4places'));
  h.t.advance(3600000);
  h.calls[1].done('http 400');
  assert.deepEqual([h.s.status('home').kind, h.s.get('home').aqi], ['stale', 38]);
  const wait = h.t.pending()[0];
  assert.ok(wait >= 30000 && wait <= 60000, String(wait));
  h.t.advance(wait);
  h.calls[2].done(null, air('aq-error'));
  assert.equal(h.s.status('home').kind, 'stale', 'an error body served as 200 is not data');
});

test('store: a one-place answer is an object, not a list — the store reads it the same way', () => {
  const ctx = load(FILES), t = fakeTimers(0), calls = [];
  const s = ctx.Air.createStore([ctx.Config.places[0]], ctx.Config.air, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => {}, getJson: (url, ms, done) => calls.push(done) });
  s.refresh();
  calls[0](null, air('aq-1place'));
  assert.equal(s.get('home').aqi, 38);
});

// ---- Batch 13: the dust forecast (the owner, 2026-11-02: «а есть прогноз хамсина на каждый час дня как для температуры и
// на неделю?» → «делай оба варианта»). The SAME one request also asks hourly dust for cfg.forecastDays days (B13-D1); per
// hour the rounded value (B13-D2), per day the MAXIMUM of the day's hours, only with ≥ cfg.dustDayMinHours of its 24 values
// (B13-D3); a khamsin from cfg.dustUgm3 µg/m³ on the ROUNDED value. Fixtures: the real 4-place answer of 2026-11-02 (Air.url
// exactly) and a SYNTHETIC khamsin derived from it (only dust cells raised, see the B13 report).
const hourlyFix = () => air('aq-4places-hourly-2026-11-02');
const khamsinFix = () => air('aq-4places-hourly-khamsin-synthetic-2026-11-02');
const keysOf = (date, from, n) => Array.from({ length: n }, (_, i) => date + 'T' + String(from + i).padStart(2, '0'));

test('B13 parse: the hourly dust of each place, keyed by the place\'s wall hour; current values unchanged', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = hourlyFix();
  const m = ctx.Air.parse(list[0], cfg);
  assert.deepEqual([m.aqi, m.dust, 'time' in m], [list[0].current.european_aqi, list[0].current.dust, false], 'N11: the model carries only what is read (no time)');
  // X10: the index is built once at parse — each hour's value by its key, each day's count of values and maximum
  assert.equal(Object.keys(m.forecast.byHour).length, 120, '5 days × 24 hours');
  assert.equal(m.forecast.byHour['2026-11-02T00'], list[0].hourly.dust[0]);
  assert.equal(m.forecast.byHour['2026-11-06T23'], list[0].hourly.dust[119]);
  assert.deepEqual(plain(m.forecast.byDay['2026-11-03']), { n: 24, max: Math.max(...list[0].hourly.dust.slice(24, 48)) });
  assert.deepEqual(Object.keys(m.forecast.byDay), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  const holes = JSON.parse(JSON.stringify(list[0])); holes.hourly.dust[5] = null; holes.hourly.dust[6] = 'x';
  const h = ctx.Air.parse(holes, cfg).forecast;
  assert.deepEqual([own(h.byHour, '2026-11-02T05'), own(h.byHour, '2026-11-02T06'), h.byDay['2026-11-02'].n], [false, false, 22], 'not a number: no value');
});

test('B13 parse: no hourly block is NOT an error — the current values work, the forecast is empty', () => {
  const ctx = load(FILES), cfg = ctx.Config.air;
  const noHourly = hourlyFix()[0]; delete noHourly.hourly;
  assert.deepEqual(plain(ctx.Air.parse(noHourly, cfg).forecast), { byHour: {}, byDay: {} });   // X10
  const noDust = hourlyFix()[0]; delete noDust.hourly.dust;
  assert.deepEqual(plain(ctx.Air.parse(noDust, cfg).forecast), { byHour: {}, byDay: {} }, 'times without values: no value');   // X10
});

test('B13 per hour: the rounded dust for the strip\'s hour keys, in order; null past the data, for a null key and with no model', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = hourlyFix(), m = ctx.Air.parse(list[0], cfg);
  const keys = keysOf('2026-11-02', 16, 8).concat(['2026-11-07T00', null]);
  const f = plain(ctx.Air.forecast(m, keys, [], cfg));
  const raw = (k) => list[0].hourly.dust[list[0].hourly.time.indexOf(k + ':00')];
  assert.deepEqual(f.hours.slice(0, 8), keys.slice(0, 8).map((k) => ({ dust: Math.round(raw(k)), khamsin: false })));
  assert.deepEqual(f.hours.slice(8), [null, null], 'past the horizon: null; an empty strip cell: null');
  assert.deepEqual(f.days, []);
  assert.deepEqual(plain(ctx.Air.forecast(null, ['2026-11-02T16'], ['2026-11-02'], cfg)), { hours: [null], days: [null] }, 'no air data: every cell null («—»)');
});

test('B13 khamsin per hour: from 100 µg/m³ on the ROUNDED value (99.4 no, 99.5 yes, 100 yes)', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, p = hourlyFix()[0];
  p.hourly.dust.splice(0, 4, 99.4, 99.5, 100, 240);
  const f = plain(ctx.Air.forecast(ctx.Air.parse(p, cfg), keysOf('2026-11-02', 0, 4), [], cfg));
  assert.deepEqual(f.hours, [{ dust: 99, khamsin: false }, { dust: 100, khamsin: true }, { dust: 100, khamsin: true }, { dust: 240, khamsin: true }]);
});

test('B13 per day: the day\'s MAXIMUM with at least 20 of its 24 hours; 19 → null; a partial last day → null; days past the horizon → beyond (batch 24 (в))', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = hourlyFix();
  const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  const maxOf = (p, d) => Math.round(Math.max(...list[p].hourly.time.map((t, i) => (t.slice(0, 10) === d ? list[p].hourly.dust[i] : -1))));
  const f = plain(ctx.Air.forecast(ctx.Air.parse(list[0], cfg), [], dates, cfg));
  assert.deepEqual(f.days.slice(0, 5), dates.slice(0, 5).map((d) => ({ dust: maxOf(0, d), khamsin: false })), 'real 2026-11-02: five full days');
  // owner 2026-11-04, batch 24 (в): was [null, null] — a day the answer has no value for is beyond the horizon, not «—»
  assert.deepEqual(f.days.slice(5), [{ beyond: true }, { beyond: true }], 'past the 5-day horizon');
  // Beer Sheva's real 2026-11-06: a khamsin day (its maximum 185 µg/m³)
  const south = plain(ctx.Air.forecast(ctx.Air.parse(list[3], cfg), [], ['2026-11-06'], cfg));
  assert.deepEqual(south.days, [{ dust: maxOf(3, '2026-11-06'), khamsin: true }]);
  // the 20/24 rule: 20 values shown, 19 not; the CAMS horizon's partial last day (3 values, measured 2026-11-02) not
  const cut = (n) => { const p = JSON.parse(JSON.stringify(list[0])); for (let i = 24 + n; i < 48; i++) p.hourly.dust[i] = null; return ctx.Air.parse(p, cfg); };
  assert.ok(plain(ctx.Air.forecast(cut(20), [], ['2026-11-03'], cfg)).days[0] !== null, '20 of 24: shown');
  assert.equal(plain(ctx.Air.forecast(cut(19), [], ['2026-11-03'], cfg)).days[0], null, '19 of 24: «—»');
  assert.equal(plain(ctx.Air.forecast(cut(3), [], ['2026-11-03'], cfg)).days[0], null, 'a partial day (3 values): «—»');
  assert.equal(plain(ctx.Air.forecast(cut(20), [], ['2026-11-03'], cfg)).days[0].dust,
    Math.round(Math.max(...list[0].hourly.dust.slice(24, 44))), 'the maximum of the values it has');
});

test('B13 khamsin per day: the synthetic khamsin fixture — Rehovot today and tomorrow, Tel Aviv tomorrow; the threshold on the rounded maximum', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = khamsinFix(), dates = ['2026-11-02', '2026-11-03', '2026-11-04'];
  const flags = (p) => plain(ctx.Air.forecast(ctx.Air.parse(list[p], cfg), [], dates, cfg)).days.map((d) => d.khamsin);
  assert.deepEqual(flags(0), [true, true, false]);
  assert.deepEqual(flags(2), [false, true, false]);
  assert.deepEqual(flags(1), [false, false, false]);
  const p = hourlyFix()[0]; for (let i = 24; i < 48; i++) p.hourly.dust[i] = 20; p.hourly.dust[30] = 99.5;
  assert.deepEqual(plain(ctx.Air.forecast(ctx.Air.parse(p, cfg), [], ['2026-11-03'], cfg)).days, [{ dust: 100, khamsin: true }], '99.5 rounds to 100: a khamsin');
});

test('B13 today counts the whole calendar day: the hours already past are in today\'s maximum', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, p = hourlyFix()[0];
  for (let i = 0; i < 24; i++) p.hourly.dust[i] = 10; p.hourly.dust[2] = 150;      // 02:00 — long past at 16:00
  assert.deepEqual(plain(ctx.Air.forecast(ctx.Air.parse(p, cfg), keysOf('2026-11-02', 16, 1), ['2026-11-02'], cfg)),
    { hours: [{ dust: 10, khamsin: false }], days: [{ dust: 150, khamsin: true }] });
});

// ---- Owner 2026-11-04, batch 24 (а) («для пыли а+в»; replaces FIX-13B X6, which dropped a day whose values were ALL 0 as a
// «CAMS fill»): a 0 is a reading. Haifa's 2026-11-06 in the 2026-11-02 recording (24 × 0) now reads 0, hours and day.
test('B24 (а): a day whose values are ALL exactly 0 is a clean day — its hours read 0 and its maximum 0 (no longer «—»)', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = hourlyFix();
  const haifa = list[1].hourly.dust.slice(96, 120);
  assert.deepEqual([haifa.length, haifa.every((v) => v === 0)], [24, true], 'the recording: Haifa 2026-11-06 is 24 × 0');
  const f = plain(ctx.Air.forecast(ctx.Air.parse(list[1], cfg), keysOf('2026-11-06', 10, 2).concat(['2026-11-05T10']), ['2026-11-05', '2026-11-06'], cfg));
  // owner 2026-11-04, batch 24 (а): was [null, null] and days[1] null (X6)
  assert.deepEqual(f.hours.slice(0, 2), [{ dust: 0, khamsin: false }, { dust: 0, khamsin: false }], 'an hour of 0 reads 0');
  assert.notEqual(f.hours[2], null, 'the day before is real');
  assert.deepEqual([f.days[0] !== null, f.days[1]], [true, { dust: 0, khamsin: false }], 'the clean day\'s maximum is 0');
  const one = hourlyFix()[2]; one.hourly.dust[30] = 0;                       // Tel Aviv 2026-11-03 06:00: one real 0
  const g = plain(ctx.Air.forecast(ctx.Air.parse(one, cfg), ['2026-11-03T06'], ['2026-11-03'], cfg));
  assert.deepEqual(g.hours, [{ dust: 0, khamsin: false }], 'a single 0 stays 0');
  assert.notEqual(g.days[0], null, 'its day stays');
});

// Batch 24: the real answer of 2026-11-04 (09:46 UTC, Air.url exactly: home + the three regions, forecast_days 5). Rehovot:
// Wed 17 · Thu 13 · Fri 2 · Sat 0 (24 × 0) · Sun 0 (24 × 0); the 7-day band's Mon and Tue are not in the answer at all.
const todayFix = () => air('aq-4places-hourly-2026-11-04');
const WEEK = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
test('B24 (а)+(в) the real 2026-11-04 answer: Rehovot\'s all-zero Sat and Sun read 0, Mon and Tue are beyond the horizon; the hours of 0 read 0', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = todayFix();
  const rehovot = list[0].hourly.dust.slice(72, 120);
  assert.deepEqual([rehovot.length, rehovot.every((v) => v === 0)], [48, true], 'the recording: Rehovot Sat and Sun are 48 × 0');
  const f = plain(ctx.Air.forecast(ctx.Air.parse(list[0], cfg), keysOf('2026-11-07', 12, 2), WEEK, cfg));
  assert.deepEqual(f.days, [17, 13, 2, 0, 0].map((d) => ({ dust: d, khamsin: false })).concat([{ beyond: true }, { beyond: true }]));
  assert.deepEqual(f.hours, [{ dust: 0, khamsin: false }, { dust: 0, khamsin: false }]);
  // Beer Sheva the same day: a real khamsin on Sat (337), then Sun 81 — the same rule everywhere
  assert.deepEqual(plain(ctx.Air.forecast(ctx.Air.parse(list[3], cfg), [], WEEK, cfg)).days.map((c) => (c.beyond ? 'beyond' : c.dust)), [24, 17, 4, 337, 81, 'beyond', 'beyond']);
});

test('B24 (в): a partial last day (some values, fewer than 20) is «—» (null); a day with no value at all is beyond; an empty row and no model stay null', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, p = todayFix()[0];
  for (let i = 96 + 15; i < 120; i++) p.hourly.dust[i] = null;              // Sun: 15 of 24 (as measured live on 2026-11-04)
  const f = plain(ctx.Air.forecast(ctx.Air.parse(p, cfg), [], WEEK.slice(3).concat([null]), cfg));
  assert.deepEqual(f.days, [{ dust: 0, khamsin: false }, null, { beyond: true }, { beyond: true }, null], 'Sat 0 · Sun partial «—» · Mon, Tue beyond · an empty row null');
  const none = JSON.parse(JSON.stringify(todayFix()[0])); delete none.hourly;
  assert.deepEqual(plain(ctx.Air.forecast(ctx.Air.parse(none, cfg), [], ['2026-11-04'], cfg)).days, [{ beyond: true }], 'an answer with no forecast at all: beyond');
  assert.deepEqual(plain(ctx.Air.forecast(null, [], ['2026-11-04'], cfg)).days, [null], 'no air data: «—», never «нет прогноза»');
});

// Batch 14: the air store keeps its last good answer under 'air.v1'; a restarted app shows it, stale, for up to 12 h.
test('B14: a restarted app shows the last good air quality, stale, for up to 12 h (key air.v1)', () => {
  const ctx = load(FILES), items = {}, storage = { getItem: (k) => (k in items ? items[k] : null), setItem: (k, v) => { items[k] = String(v); } };
  const T = Date.parse('2026-11-02T09:00:00Z'), calls = [];
  const deps = (at) => { const t = fakeTimers(at); return { storage, now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => {}, getJson: (url, ms, done) => calls.push(done) }; };
  const a = ctx.Air.createStore(places(ctx), ctx.Config.air, deps(T));
  a.refresh();
  calls[0](null, air('aq-4places'));
  assert.deepEqual(Object.keys(items), ['air.v1']);
  const b = ctx.Air.createStore(places(ctx), ctx.Config.air, deps(T + 12 * 3600000));
  for (const p of places(ctx)) {
    assert.deepEqual([b.status(p.id).kind, b.status(p.id).updatedAt], ['stale', T], p.id);
    assert.equal(JSON.stringify(b.get(p.id)), JSON.stringify(a.get(p.id)), p.id + ': the same model');
  }
  assert.equal(ctx.Air.createStore(places(ctx), ctx.Config.air, deps(T + 12 * 3600000 + 1)).get(places(ctx)[0].id), null, 'older than 12 h');
});

// FIX-18B 13 (the owner: «Цвет хамсина должен быть в зависимости от его опасности. Чем опаснее, тем краснее»): ONE function
// grades a reading — 0 below 100 µg/m³ (no khamsin), then by the European Air Quality Index's PM10 bands (EEA,
// https://airindex.eea.europa.eu/AQI/index.html: Moderate 46–120, Poor 121–195, Very poor 196–270, Extremely poor > 270).
test('FIX-18B 13: Air.grade — 0 under 100; 1 for 100–120; 2 from 121; 3 from 196; 4 from 271 (every boundary both sides)', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, g = (v) => ctx.Air.grade(v, cfg);
  assert.deepEqual([null, 0, 99, 100, 120, 121, 195, 196, 270, 271, 600, 1500, 3400].map(g), [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
  // the grade never contradicts the khamsin flag the data carry
  for (const v of [99, 100, 250, 3400]) assert.equal(g(v) > 0, ctx.Air.summary({ aqi: 30, dust: v }, cfg).dustHigh, String(v));
});

// G5 (5/5): the dust index is keyed by the answer's own time strings; a key named like an Object.prototype member
// («__proto__», «constructor») neither reaches the prototype (no `n` written onto every object) nor finds a value there.
test('G5: a «__proto__» or «constructor» time in the answer touches no prototype and finds nothing', () => {
  const vm = require('node:vm');
  const ctx = load(FILES), cfg = ctx.Config.air, list = air('aq-4places');
  const odd = JSON.parse(JSON.stringify(list[0]));
  odd.hourly = { time: ['__proto__', 'constructor', '2026-11-02T10:00'], dust: [50, 60, 40] };
  const m = ctx.Air.parse(odd, cfg);
  assert.equal(vm.runInContext('({}).n', ctx), undefined, 'nothing written onto Object.prototype');
  assert.equal(vm.runInContext('({}).max', ctx), undefined);
  assert.deepEqual(plain(m.forecast.byHour), JSON.parse('{"__proto__":50,"constructor":60,"2026-11-02T10":40}'), 'each its own key, as any other');
  const f = ctx.Air.forecast(m, ['toString', 'hasOwnProperty', '2026-11-02T10'], ['toString', 'valueOf', null], cfg);
  // owner 2026-11-04, batch 24 (в): was days [null, null, null] — a date the answer has no value for is beyond, never a value
  assert.deepEqual(plain(f), { hours: [null, null, { dust: 40, khamsin: false }], days: [{ beyond: true }, { beyond: true }, null] }, 'a prototype member is never a value cell');
  assert.deepEqual(plain(ctx.Air.forecast(null, ['toString'], ['constructor'], cfg)), { hours: [null], days: [null] }, 'no model: the empty index, the same');
});
