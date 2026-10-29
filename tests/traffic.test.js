'use strict';
// Traffic (TomTom Routing API, tested on the documented batch shapes in tests/fixtures/tomtom — the client has
// never seen a live answer: there is no key yet). One batch request for every route and road, summaries only,
// levels, partial failures, and the refresh interval that follows the screen's visibility.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/refresher.js', 'js/traffic.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const batch = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tomtom', 'batch.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const withKey = (ctx) => { ctx.Config.traffic.key = 'FIXTUREKEY123'; return ctx.Config.traffic; };

test('no key until the build injects one: the committed placeholder and anything but letters and digits are refused', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Traffic.hasKey(ctx.Config.traffic), false, 'the placeholder');
  for (const k of ['', 'abc def', 'abc&x=1', undefined]) assert.equal(ctx.Traffic.hasKey({ key: k }), false, String(k));
  assert.equal(ctx.Traffic.hasKey({ key: 'Ab12Cd34' }), true);
});

test('ONE batch request carries every route and road, asking for summaries only (no geometry), with live traffic', () => {
  const ctx = load(FILES);
  const cfg = withKey(ctx);
  const r = ctx.Traffic.request(cfg);
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://api.tomtom.com/routing/1/batch/sync/json');
  assert.equal(u.searchParams.get('key'), 'FIXTUREKEY123');
  assert.equal(r.body.batchItems.length, 3 + 4);
  assert.equal(r.body.batchItems[0].query, '/calculateRoute/31.8928,34.8113:32.0741,34.7922/json?travelMode=car&routeType=fastest&traffic=true&computeTravelTimeFor=all&routeRepresentation=summaryOnly');
  for (const it of r.body.batchItems) assert.match(it.query, /routeRepresentation=summaryOnly/);
});

test('the batch answer: travel time, time without traffic, delay and length per item; a failed item is null', () => {
  const ctx = load(FILES);
  const list = plain(ctx.Traffic.parse(batch(), 7));
  assert.deepEqual(list[0], { travel: 2310, free: 1490, delay: 820, length: 27412 });
  assert.equal(list[6], null, 'Route 6: NO_ROUTE_FOUND');
  assert.throws(() => ctx.Traffic.parse({ error: 'Unauthorized' }, 7), /not a batch answer/);
  const noFree = { batchItems: [{ statusCode: 200, response: { routes: [{ summary: { travelTimeInSeconds: 600, trafficDelayInSeconds: 120 } }] } }] };
  assert.deepEqual(plain(ctx.Traffic.parse(noFree, 1))[0], { travel: 600, free: 480, delay: 120, length: null }, 'free flow from the delay when absent');
});

test('levels: green below ×1.15 of free flow, amber below ×1.5, red from ×1.5', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.traffic;
  const lv = (travel, free) => ctx.Traffic.level({ travel, free }, cfg);
  assert.deepEqual([lv(1000, 1000), lv(1149, 1000), lv(1150, 1000), lv(1499, 1000), lv(1500, 1000), lv(60, 0)], ['ok', 'ok', 'slow', 'slow', 'jam', 'ok']);
  assert.deepEqual(plain(ctx.Traffic.parse(batch(), 7).slice(0, 6).map((s) => ctx.Traffic.level(s, cfg))), ['jam', 'slow', 'ok', 'jam', 'slow', 'ok']);
});

function makeStore(ctx) {
  const clock = fakeTimers(T0);
  const calls = [];
  const store = ctx.Traffic.createStore(withKey(ctx), {
    postJson: (url, body, timeoutMs, done) => calls.push({ url, body, timeoutMs, done }),
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random: () => 0.5, onChange: () => {} });
  return { store, clock, calls };
}

test('store: one request per refresh; a failed item shows "no data" on its row without making the screen stale', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh();
  assert.equal(s.store.refresh(), false);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].timeoutMs, 20000);
  s.calls[0].done(null, batch());
  assert.equal(s.store.status().kind, 'fresh', 'six good items: the screen is current');
  assert.deepEqual(plain(s.store.routes().map((r) => r.level)), ['jam', 'slow', 'ok']);
  assert.equal(s.store.roads()[3].kind, 'failed');
  assert.equal(s.store.roads()[3].data, null);
  assert.deepEqual(s.clock.pending(), [15 * 60000], 'no back-off for one unroutable item: it would only burn quota');
});

test('store: a transport failure keeps every last good value and marks the screen stale', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.calls[0].done(null, batch());
  s.clock.advance(15 * 60000);
  s.calls[1].done('timeout');
  assert.equal(s.store.status().kind, 'stale');
  assert.equal(s.store.routes()[0].data.travel, 2310, 'last good travel time kept');
  assert.equal(s.store.routes()[0].kind, 'stale');
});

test('every 15 min while the screen is hidden, every 5 min while it is on view; coming into view refreshes data older than 5 min', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.calls[0].done(null, batch());
  assert.deepEqual(s.clock.pending(), [15 * 60000], 'hidden: 15 min');
  s.clock.advance(3 * 60000);
  s.store.setVisible(true);
  assert.equal(s.calls.length, 1, '3-minute-old data: no request');
  assert.deepEqual(s.clock.pending(), [2 * 60000], 'the next one 5 min after the last answer');
  s.store.setVisible(false);
  assert.deepEqual(s.clock.pending(), [12 * 60000], 'hidden again: back to 15 min after the last answer');
  s.clock.advance(4 * 60000);
  s.store.setVisible(true);
  assert.equal(s.calls.length, 2, '7-minute-old data is refreshed the moment the screen shows');
});
