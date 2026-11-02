'use strict';
// Batch 12: the per-place store (js/placestore.js) — the weather store's body, moved unchanged so air quality uses the
// same cycle. The whole weather store suite (tests/weather.test.js) still runs against it through Weather.createStore;
// these tests drive it with a fake source.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/refresher.js', 'js/placestore.js'];
const cfg = { refreshMs: 600000, timeoutMs: 5000, retryMs: [60000], retryFloorMs: 30000, staleAfterMs: 1200000 };
// A source whose answer per place is { v } and parses to v (a missing v throws).
const source = {
  cfg,
  url: (places) => 'https://x.test/?ids=' + places.map((p) => p.id).join(','),
  parse: (json) => { if (!json || typeof json.v !== 'number') throw new Error('fake: bad'); return json.v; }
};

function make(places) {
  const ctx = load(FILES), t = fakeTimers(1000), calls = [];
  let changes = 0;
  const s = ctx.PlaceStore.create(places, source, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0,
    onChange: (store) => { changes++; assert.equal(store, s); }, getJson: (url, ms, done) => calls.push({ url, ms, done }) });
  return { t, s, calls, changes: () => changes };
}

test('one request for every place, the source\'s URL and timeout; answer i belongs to place i; one render per refresh', () => {
  const h = make([{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual([h.s.get('a'), h.s.status('a').kind, h.s.status('zzz').kind], [null, 'loading', 'none']);
  assert.equal(h.s.refresh(), true);
  assert.equal(h.s.refresh(), false);
  assert.deepEqual(h.calls.map((c) => [c.url, c.ms]), [['https://x.test/?ids=a,b', 5000]]);
  h.calls[0].done(null, [{ v: 1 }, { v: 2 }]);
  assert.deepEqual([h.s.get('a'), h.s.get('b'), h.s.status('b').kind, h.s.status('b').updatedAt, h.changes()], [1, 2, 'fresh', 1000, 1]);
  assert.deepEqual([h.t.pending(), h.s.nextAt(), h.s.failures()], [[600000], 601000, 0]);
});

test('a place that does not parse fails alone (stale, last good kept); a transport error fails all; a single answer may be an object', () => {
  const h = make([{ id: 'a' }, { id: 'b' }]);
  h.s.refresh();
  h.calls[0].done(null, [{ v: 1 }, { v: 2 }]);
  h.s.refresh();
  h.calls[1].done(null, [{ v: 3 }, { nope: 1 }]);
  assert.deepEqual([h.s.get('a'), h.s.status('a').kind, h.s.get('b'), h.s.status('b').kind, h.s.failures()], [3, 'fresh', 2, 'stale', 1]);
  h.s.refresh();
  h.calls[2].done('timeout');
  assert.deepEqual([h.s.status('a').kind, h.s.failures()], ['stale', 2]);
  const one = make([{ id: 'only' }]);
  one.s.refresh();
  one.calls[0].done(null, { v: 9 });
  assert.equal(one.s.get('only'), 9);
});

test('stop(): a late answer neither stores, renders nor reschedules', () => {
  const h = make([{ id: 'a' }]);
  h.s.refresh();
  h.s.stop();
  h.calls[0].done(null, [{ v: 1 }]);
  assert.deepEqual([h.s.get('a'), h.changes(), h.t.pending()], [null, 0, []]);
});

test('S6: a source whose url() throws ends the hop as a failure — back-off follows, nothing sticks in flight, the next refresh asks again', () => {
  const ctx = load(FILES), t = fakeTimers(1000), calls = [];
  let fail = true, changes = 0;
  const throwing = { cfg, parse: source.parse, url: (places) => { if (fail) throw new Error('no place yet'); return source.url(places); } };
  const s = ctx.PlaceStore.create([{ id: 'a' }], throwing, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0,
    onChange: () => { changes++; }, getJson: (url, ms, done) => calls.push(done) });
  assert.doesNotThrow(() => s.refresh());
  assert.deepEqual([calls.length, s.status('a').kind, s.failures(), changes], [0, 'failed', 1, 1]);
  assert.deepEqual(t.pending(), [30000], 'the first back-off wait (floor)');
  fail = false;
  assert.equal(s.refresh(), true, 'not stuck in flight');
  calls[0](null, [{ v: 5 }]);
  assert.deepEqual([s.get('a'), s.status('a').kind, s.failures()], [5, 'fresh', 0]);
});

test('S7: the generic store knows no API — the Open-Meteo coordinate list lives on the Open-Meteo side', () => {
  const ctx = load(FILES);
  assert.deepEqual(Object.keys(ctx.PlaceStore).sort(), ['create']);
});
