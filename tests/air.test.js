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
// The places the App asks for: home + the Israel regions (Config.israel.regions → Config.places), derived, never listed.
function places(ctx) {
  const byId = {};
  for (const p of ctx.Config.places) byId[p.id] = p;
  return [ctx.Config.places[0]].concat(ctx.Config.israel.regions.map((r) => byId[r.place]));
}

test('config: hourly, 15 s timeout, the weather back-off, stale after 3 h, dust flagged from 100 µg/m³', () => {
  const a = plain(load(FILES).Config.air);
  assert.deepEqual(a, { base: 'https://air-quality-api.open-meteo.com/v1/air-quality', refreshMs: 3600000, timeoutMs: 15000,
    retryMs: [60000, 120000, 240000, 480000], retryFloorMs: 30000, staleAfterMs: 3 * 3600000, dustUgm3: 100 });
});

test('URL: ONE request for the four places, in order; only the two values the screens show (S5: AQI and dust); no key', () => {
  const ctx = load(FILES), u = new URL(ctx.Air.url(places(ctx), ctx.Config.air));
  assert.equal(u.origin + u.pathname, 'https://air-quality-api.open-meteo.com/v1/air-quality');
  assert.equal(u.searchParams.get('latitude'), '31.8928,32.794,32.0853,31.2518', 'home (Rehovot), Haifa, Tel Aviv, Beer Sheva');
  assert.equal(u.searchParams.get('longitude'), '34.8113,34.9896,34.7818,34.7913');
  assert.equal(u.searchParams.get('current'), 'european_aqi,dust');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.ok(!/key|token/i.test(u.search));
});

test('parse: the recorded answer of each place; one that carries nothing usable throws', () => {
  const ctx = load(FILES), cfg = ctx.Config.air, list = air('aq-4places');
  assert.deepEqual(plain(ctx.Air.parse(list[0], cfg)), { aqi: 38, dust: 25, time: '2026-11-02T11:00' }, 'S5: only what is shown');
  assert.deepEqual(plain(list.map((p) => ctx.Air.parse(p, cfg).aqi)), [38, 31, 41, 36]);
  const someNull = JSON.parse(JSON.stringify(list[0])); someNull.current.dust = null;
  assert.deepEqual(plain(ctx.Air.parse(someNull, cfg)), { aqi: 38, dust: null, time: '2026-11-02T11:00' });
  const dustOnly = JSON.parse(JSON.stringify(list[0])); dustOnly.current.european_aqi = Infinity;
  assert.deepEqual(plain(ctx.Air.parse(dustOnly, cfg)), { aqi: null, dust: 25, time: '2026-11-02T11:00' }, 'not a finite number: no value');
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
