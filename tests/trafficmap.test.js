'use strict';
// Batch 7: the traffic map is ONE Mapbox Static Images picture in the live-traffic style (traffic-night-v2), loaded only
// while the map is on view and the TV shows the page — at once on a ◀ ▶ open, else every 5 min — one at a time, never
// past 600 a UTC date (reserved in the ledger before each, never refunded); a failed image keeps the last one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/ledger.js', 'js/trafficmap.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const MIN = 60000;
const plain = (v) => JSON.parse(JSON.stringify(v));

function memoryStorage(mode) {
  const m = new Map();
  return { map: m, getItem: (k) => { if (mode === 'throw') throw new Error('denied'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (mode === 'throw') throw new Error('denied'); m.set(k, String(v)); } };
}
// loads: every image the controller asked for ({ stamp, done, cancelled }); answer(ok) answers the last one.
function makeMap(ctx, opts) {
  opts = opts || {};
  const clock = fakeTimers(opts.start || T0), loads = [], storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  let visible = true, changes = 0;
  const map = ctx.TrafficMap.createController(ctx.Config.map, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    storage, documentVisible: () => visible, onChange: () => { changes++; },
    load: (stamp, done) => { const l = { stamp, done, cancelled: false }; loads.push(l); return () => { l.cancelled = true; }; } });
  return { map, clock, loads, storage, setDoc: (v) => { visible = v; map.visibilityChanged(); }, changes: () => changes,
    answer: (ok) => loads[loads.length - 1].done(ok) };
}
const rec = (s) => JSON.parse(s.storage.map.get('map-quota'));

test('MAP-M1: the image address — traffic-night-v2, centre lon,lat and zoom, the size in points @2x, the token, no logo or attribution, a stamp', () => {
  const ctx = load(FILES);
  const m = ctx.Config.map;
  assert.deepEqual(plain([m.center, m.zoom, m.maxSide, m.refreshMs, m.timeoutMs, m.dailyRequestCap]), [[31.93, 34.94], 9.6, 1280, 5 * MIN, 20000, 600]);
  const size = ctx.TrafficMap.size(m, 1792, 880);
  assert.deepEqual(plain(size), { w: 896, h: 440 }, 'half the card: asked @2x it fills the card pixel for pixel');
  assert.deepEqual(plain(ctx.TrafficMap.size(m, 3000, 2600)), { w: 1280, h: 1280 }, 'at most 1280 points a side');
  assert.equal(ctx.TrafficMap.url(m, ctx.Config.traffic.token, size, 1234),
    'https://api.mapbox.com/styles/v1/mapbox/traffic-night-v2/static/34.94,31.93,9.6,0/896x440@2x?access_token=__MAPBOX_TOKEN__&attribution=false&logo=false&refresh=1234',
    'the token is the routes\' (one placeholder, put in by the build)');
  assert.match(ctx.TrafficMap.url(m, 'pk.a/b', size, 1), /access_token=pk\.a%2Fb&/, 'the token escaped');
});

test('MAP-M2: Rehovot lies on the image where Web Mercator (512-px tiles) puts it; the centre is the middle', () => {
  const ctx = load(FILES);
  const m = ctx.Config.map, size = { w: 896, h: 440 };
  assert.deepEqual(plain(ctx.TrafficMap.place(m, size, m.center[0], m.center[1])), { x: 0.5, y: 0.5 });
  const r = ctx.TrafficMap.place(m, size, 31.8928, 34.8113);
  // 512 · 2^9.6 = 397,312 points per 360° of longitude: (34.8113 − 34.94) / 360 · 397,312 = −142.0 points of 896
  assert.ok(Math.abs(r.x - (0.5 - 142.0 / 896)) < 0.002, 'x ' + r.x);
  assert.ok(r.y > 0.5 && r.y < 0.75, 'a little south of the centre: y ' + r.y);
});

test('MAP-M3: nothing while hidden — the map never on view, or on view with the TV off; leaving or the TV hiding stops the image in flight', () => {
  const ctx = load(FILES);
  const s = makeMap(ctx);
  s.clock.advance(3 * 60 * MIN);
  assert.equal(s.loads.length, 0, 'never on view');
  const off = makeMap(ctx);
  off.setDoc(false);
  off.map.setVisible(true, true);
  off.clock.advance(3 * 60 * MIN);
  assert.equal(off.loads.length, 0, 'the TV does not show the page');
  const a = makeMap(ctx);
  a.map.setVisible(true, true);
  assert.equal(a.loads.length, 1);
  a.map.setVisible(false);
  assert.equal(a.loads[0].cancelled, true, 'leaving stops it');
  a.clock.advance(60 * MIN);
  assert.equal(a.loads.length, 1, 'and nothing after');
  const b = makeMap(ctx);
  b.map.setVisible(true, true);
  b.setDoc(false);
  assert.equal(b.loads[0].cancelled, true, 'the TV hiding the page stops it');
  b.clock.advance(60 * MIN);
  assert.equal(b.loads.length, 1);
  b.setDoc(true);
  assert.equal(b.loads.length, 2, 'shown again on the map: the gate is asked again (the last attempt is over 5 min old)');
});

test('MAP-M4: an explicit ◀ ▶ open loads at once every time (one at a time); a rotation arrival and staying on view wait 5 min', () => {
  const ctx = load(FILES);
  const s = makeMap(ctx);
  s.map.setVisible(true, true);
  assert.equal(s.loads.length, 1, 'opened with ◀ ▶: at once');
  s.map.setVisible(false); s.map.setVisible(true, true);
  assert.equal(s.loads.length, 2, 'the previous one was stopped; ◀ ▶ again: at once');
  s.map.setVisible(true, true);
  assert.equal(s.loads.length, 2, 'an open while one is in flight starts nothing');
  s.answer(true);
  s.clock.advance(5 * MIN - 1);
  assert.equal(s.loads.length, 2, 'on view: nothing before 5 min');
  s.clock.advance(1);
  assert.equal(s.loads.length, 3, 'every 5 min while on view');
  s.answer(true);
  s.map.setVisible(false); s.clock.advance(MIN); s.map.setVisible(true);
  assert.equal(s.loads.length, 3, 'a rotation arrival 1 min later: nothing');
  s.map.setVisible(false); s.clock.advance(5 * MIN); s.map.setVisible(true);
  assert.equal(s.loads.length, 4, 'a rotation arrival when 5 min have passed: one');
  assert.equal(rec(s).used, 4, 'each one reserved');
});

test('MAP-M5: the reservation is written and read back before every image; a failure keeps the last image (stale) and is not refunded', () => {
  const ctx = load(FILES);
  const s = makeMap(ctx);
  s.map.setVisible(true, true);
  assert.deepEqual(rec(s), { v: 1, utcDate: '2026-10-29', used: 1, lastAttemptAt: T0, retryNotBefore: 0 }, 'stored before the image is asked for');
  assert.deepEqual(plain(s.map.state()), { kind: 'loading', updatedAt: 0, problem: null });
  s.answer(true);
  assert.deepEqual(plain(s.map.state()), { kind: 'fresh', updatedAt: T0, problem: null });
  s.clock.advance(5 * MIN);
  s.answer(false);
  assert.deepEqual(plain(s.map.state()), { kind: 'stale', updatedAt: T0, problem: null }, 'the last good image stays, marked');
  assert.equal(rec(s).used, 2, 'no refund');
  s.clock.advance(5 * MIN); s.answer(true);
  assert.equal(s.map.state().kind, 'fresh');
  const f = makeMap(ctx);
  f.map.setVisible(true, true); f.answer(false);
  assert.equal(f.map.state().kind, 'failed', 'no image at all: failed');
  const old = makeMap(ctx);
  old.map.setVisible(true, true); old.answer(true); old.map.setVisible(false);
  old.clock.advance(15 * MIN + 1);
  assert.equal(old.map.state().kind, 'stale', 'older than 15 min');
});

test('MAP-M6: 600 images per UTC date — the cap stops ◀ ▶ opens too, the next UTC date starts again; storage that fails sends nothing', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('map-quota', JSON.stringify({ v: 1, utcDate: '2026-10-29', used: 599, lastAttemptAt: 0, retryNotBefore: 0 }));
  const s = makeMap(ctx, { storage, start: Date.parse('2026-10-29T23:00:00Z') });
  s.map.setVisible(true, true);
  assert.equal(s.loads.length, 1, 'the 600th');
  s.answer(true);
  s.map.setVisible(false); s.map.setVisible(true, true);
  assert.equal(s.loads.length, 1, 'capped: an explicit open loads nothing');
  assert.equal(s.map.state().problem, 'cap');
  s.clock.advance(60 * MIN);
  assert.equal(s.loads.length, 2, 'the next UTC date');
  assert.deepEqual([rec(s).utcDate, rec(s).used], ['2026-10-30', 1]);
  for (const [name, o] of [['throws', { storage: memoryStorage('throw') }], ['none', { storage: null }]]) {
    const b = makeMap(ctx, o);
    b.map.setVisible(true, true);
    b.clock.advance(60 * MIN);
    assert.equal(b.loads.length, 0, name);
    assert.deepEqual([b.map.state().kind, b.map.state().problem], ['failed', 'storage'], name);
  }
  const bad = makeMap(ctx, { storage: (() => { const m = memoryStorage(); m.setItem('map-quota', '{"v":1,"utcDate":"2026-02-31","used":0,"lastAttemptAt":0,"retryNotBefore":0}'); return m; })() });
  bad.map.setVisible(true, true);
  assert.equal(bad.loads.length, 0, 'an impossible date is a corrupt record');
});

test('MAP-M7: a clock that went back is corrected without loading; 31 days of ◀ ▶ every minute stay ≤ 600 a UTC date (32 × 600 = 19,200 < 50,000)', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('map-quota', JSON.stringify({ v: 1, utcDate: '2026-10-29', used: 5, lastAttemptAt: T0 + 3 * 60 * MIN, retryNotBefore: 0 }));
  const s = makeMap(ctx, { storage });
  s.map.setVisible(true, true);
  assert.equal(s.loads.length, 0, 'the correction loads nothing');
  assert.equal(rec(s).lastAttemptAt, T0);
  const days = makeMap(ctx, { start: Date.parse('2026-10-01T00:00:00Z') }), per = {};
  for (let t = 0; t < 31 * 24 * 60; t++) {
    days.map.setVisible(false); days.map.setVisible(true, true);
    if (days.loads.length && !days.loads[days.loads.length - 1].answered) { const l = days.loads[days.loads.length - 1]; l.answered = true; per[new Date(days.clock.now()).toISOString().slice(0, 10)] = (per[new Date(days.clock.now()).toISOString().slice(0, 10)] || 0) + 1; l.done(true); }
    days.clock.advance(MIN);
  }
  const counts = Object.values(per);
  assert.ok(counts.every((n) => n <= 600) && counts.some((n) => n === 600), JSON.stringify(per).slice(0, 80));
  assert.ok(32 * 600 < 50000);
});
