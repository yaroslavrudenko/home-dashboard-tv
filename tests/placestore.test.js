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

// Batch 14 (the owner, 2026-11-02: «делай хранение погоды»): a store with source.persistKey and deps.storage keeps the last
// good RAW answer under `<persistKey>.v1` ({ v: 1, at, url, json }), one write per good refresh; at boot, when the request
// would be the same (the same places, the same parameters), it is parsed again and shown as stale («не обновляется») until a
// live answer arrives. The first refresh still runs at once.
const HOUR = 3600000;
const kept = Object.assign({}, cfg, { keepMaxMs: 48 * HOUR });
const persisted = { cfg: kept, url: source.url, parse: source.parse, persistKey: 'wx' };
function fakeStorage(initial, opts = {}) {
  const items = Object.assign({}, initial), writes = [];
  return { items, writes,
    getItem: (k) => { if (opts.throwRead) throw new Error('denied'); return Object.prototype.hasOwnProperty.call(items, k) ? items[k] : null; },
    setItem: (k, v) => { writes.push(k); if (opts.throwWrite) throw new Error('QuotaExceededError'); items[k] = String(v); } };
}
function makeKept(places, storage, nowAt, src = persisted) {
  const ctx = load(FILES), t = fakeTimers(nowAt), calls = [];
  const s = ctx.PlaceStore.create(places, src, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0,
    onChange: () => {}, getJson: (url, ms, done) => calls.push(done), storage });
  return { t, s, calls };
}
const st2 = (st) => ({ kind: st.kind, updatedAt: st.updatedAt });   // the vm realm's object, as a plain one
const urlOf = (ids) => 'https://x.test/?ids=' + ids.join(',');
// A saved entry for the places of the request (default: one per element of json, ids a, b, c, …).
const entry = (at, json, v = 1, ids = json.map((x, i) => 'abc'[i])) => JSON.stringify({ v, at, url: urlOf(ids), json });

test('B14: a good answer is saved raw under <persistKey>.v1 with the time it came — one write per good refresh, none on a failure', () => {
  const st = fakeStorage(), h = makeKept([{ id: 'a' }, { id: 'b' }], st, 1000);
  assert.deepEqual(st.writes, [], 'nothing written at boot');
  h.s.refresh();
  h.calls[0](null, [{ v: 1, extra: 'raw' }, { v: 2 }]);
  assert.deepEqual(st.writes, ['wx.v1']);
  assert.deepEqual(JSON.parse(st.items['wx.v1']), { v: 1, at: 1000, url: urlOf(['a', 'b']), entries: [{ at: 1000, json: { v: 1, extra: 'raw' } }, { at: 1000, json: { v: 2 } }] }, 'each place\'s raw element, not the model');   // FIX-18D 1: one per-place form for every save
  h.s.refresh();
  h.calls[1]('http 503');
  assert.deepEqual(st.writes, ['wx.v1'], 'a failed refresh writes nothing');
});

test('B14: at boot the saved answer is parsed again: every place has its data, stale, dated by the saved time — the first refresh still asks', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - 3 * HOUR, [{ v: 7 }, { v: 8 }]) });
  const h = makeKept([{ id: 'a' }, { id: 'b' }], st, T);
  assert.deepEqual([h.s.get('a'), h.s.get('b')], [7, 8]);
  assert.deepEqual([st2(h.s.status('a')), st2(h.s.status('b'))], [{ kind: 'stale', updatedAt: T - 3 * HOUR }, { kind: 'stale', updatedAt: T - 3 * HOUR }]);
  assert.equal(h.s.refresh(), true, 'the first refresh runs: nothing replaces the request');
  assert.equal(h.calls.length, 1);
});

test('B14: restored data is stale even when its saved time is within staleAfterMs — never fresh from storage', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - 60000, [{ v: 7 }]) });
  const h = makeKept([{ id: 'a' }], st, T);
  assert.deepEqual(st2(h.s.status('a')), { kind: 'stale', updatedAt: T - 60000 });
});

test('B14: a live answer replaces the restored data — fresh, and saved again', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }]) });
  const h = makeKept([{ id: 'a' }], st, T);
  h.s.refresh();
  h.calls[0](null, [{ v: 9 }]);
  assert.deepEqual([h.s.get('a'), st2(h.s.status('a'))], [9, { kind: 'fresh', updatedAt: T }]);
  assert.deepEqual(JSON.parse(st.items['wx.v1']), { v: 1, at: T, url: urlOf(['a']), entries: [{ at: T, json: { v: 9 } }] });   // FIX-18D 1: one per-place form for every save
});

test('B14: a failed first refresh keeps the restored data on screen, still stale', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }]) });
  const h = makeKept([{ id: 'a' }], st, T);
  h.s.refresh();
  h.calls[0]('http 503');
  assert.deepEqual([h.s.get('a'), st2(h.s.status('a'))], [7, { kind: 'stale', updatedAt: T - HOUR }]);
});

test('B14: an entry older than keepMaxMs is not used (48 h kept, 48 h + 1 ms not)', () => {
  const T = 100 * HOUR;
  const at = makeKept([{ id: 'a' }], fakeStorage({ 'wx.v1': entry(T - 48 * HOUR, [{ v: 7 }]) }), T);
  assert.equal(at.s.get('a'), 7, 'exactly keepMaxMs old: kept');
  const past = makeKept([{ id: 'a' }], fakeStorage({ 'wx.v1': entry(T - 48 * HOUR - 1, [{ v: 7 }]) }), T);
  assert.deepEqual([past.s.get('a'), past.s.status('a').kind], [null, 'loading']);
});

test('B14: a saved time in the future (the clock went back) restores as stale, never fresh', () => {
  const T = 100 * HOUR, h = makeKept([{ id: 'a' }], fakeStorage({ 'wx.v1': entry(T + HOUR, [{ v: 7 }]) }), T);
  assert.deepEqual(st2(h.s.status('a')), { kind: 'stale', updatedAt: T + HOUR });
});

test('B14: broken JSON, another version, a malformed entry or a storage that throws → an empty start, as without storage', () => {
  const T = 100 * HOUR;
  const cases = [fakeStorage({ 'wx.v1': '{not json' }), fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }], 2) }),
    fakeStorage({ 'wx.v1': JSON.stringify({ v: 1, url: urlOf(['a']), json: [{ v: 7 }] }) }), fakeStorage({ 'wx.v1': 'null' }), fakeStorage({}),
    fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }]) }, { throwRead: true }), null];
  for (const st of cases) {
    const h = makeKept([{ id: 'a' }], st, T);
    assert.deepEqual([h.s.get('a'), h.s.status('a').kind], [null, 'loading'], JSON.stringify(st && st.items));
  }
});

test('B14: a storage that refuses the write (quota) never breaks the refresh', () => {
  const st = fakeStorage({}, { throwWrite: true }), h = makeKept([{ id: 'a' }], st, 1000);
  h.s.refresh();
  assert.doesNotThrow(() => h.calls[0](null, [{ v: 1 }]));
  assert.deepEqual([st.writes, h.s.get('a'), h.s.status('a').kind, h.s.failures(), h.t.pending()], [['wx.v1'], 1, 'fresh', 0, [600000]]);
});

test('B14: the saved answer goes through the CURRENT parse — a place it rejects gets no data, the others are restored', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }, { old: 'shape' }, { v: 9 }]) });
  const h = makeKept([{ id: 'a' }, { id: 'b' }, { id: 'c' }], st, T);
  assert.deepEqual([h.s.get('a'), h.s.get('b'), h.s.get('c')], [7, null, 9]);
  assert.deepEqual([h.s.status('a').kind, h.s.status('b').kind, h.s.status('c').kind], ['stale', 'loading', 'stale']);
});

test('B14: without persistKey, or without storage, nothing is read or written (today\'s behaviour)', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }]) });
  const noKey = makeKept([{ id: 'a' }], st, T, source);
  noKey.s.refresh();
  noKey.calls[0](null, [{ v: 1 }]);
  assert.deepEqual([st.writes, noKey.s.status('a').kind], [[], 'fresh']);
  const noStorage = makeKept([{ id: 'a' }], null, T);
  assert.equal(noStorage.s.get('a'), null);
  noStorage.s.refresh();
  assert.doesNotThrow(() => noStorage.calls[0](null, [{ v: 1 }]));
  assert.equal(noStorage.s.status('a').kind, 'fresh');
});

test('B14: an answer saved for another request (the home city changed, or the places or parameters did) is not used', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': entry(T - HOUR, [{ v: 7 }, { v: 8 }], 1, ['a', 'b']) });
  const moved = makeKept([{ id: 'a' }, { id: 'c' }], st, T);
  assert.deepEqual([moved.s.get('a'), moved.s.get('c'), moved.s.status('a').kind], [null, null, 'loading']);
  const throwing = { cfg: kept, parse: source.parse, persistKey: 'wx', url: () => { throw new Error('no place yet'); } };
  assert.equal(makeKept([{ id: 'a' }, { id: 'b' }], st, T, throwing).s.get('a'), null, 'a url() that throws restores nothing');
  assert.equal(makeKept([{ id: 'a' }, { id: 'b' }], st, T).s.get('b'), 8, 'the same request: restored');
});

// Batch 15 (the owner, 2026-11-02: «каждый раз пытаться первый вариант - при ошибке второй»): a source may carry a
// fallback { id, fetch(places, done(err, list)), parse(json, cfg, place) }. Every refresh asks the primary first; when that
// attempt fails (a transport/HTTP error, a timeout, or an answer where no place parses) the SAME refresh asks the fallback.
// Its data carry status().source = its id; the next refresh asks the primary first again.
function makeFallback(places, opts = {}) {
  const ctx = load(FILES), t = fakeTimers(opts.at || 1000), calls = [], rounds = [];
  const fb = { id: 'alt', fetch: (ps, done) => rounds.push({ ids: ps.map((p) => p.id), done }),
    parse: (json, c, place) => { if (!json || typeof json.w !== 'number') throw new Error('alt: bad'); return { w: json.w, place: place.id }; } };
  if (opts.stamp) fb.stamp = (el) => ({ at: el && el.at, restored: false });   // as MET: each element dated by its own arrival
  const src = Object.assign({}, opts.persist ? persisted : source, { fallback: fb });
  if (opts.persist) src.cfg = kept;
  let changes = 0;
  const s = ctx.PlaceStore.create(places, src, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0,
    onChange: () => { changes++; }, getJson: (url, ms, done) => calls.push(done), storage: opts.storage || null });
  return { s, t, calls, rounds, changes: () => changes };
}
const twoPlaces = () => [{ id: 'a' }, { id: 'b' }];

for (const [label, fail] of [['an HTTP 503', (d) => d('http 503')], ['a 429', (d) => d('http 429')], ['a timeout', (d) => d('timeout')],
  ['a transport error', (d) => d('network')], ['an answer where no place parses', (d) => d(null, [{ nope: 1 }, { nope: 2 }])]]) {
  test('B15: ' + label + ' from the primary → ONE fallback round for every place in the same refresh; its data shown, fresh, source "alt"', () => {
    const h = makeFallback(twoPlaces());
    h.s.refresh();
    fail(h.calls[0]);
    assert.equal(h.rounds.length, 1, 'one fallback round');
    assert.deepEqual(h.rounds[0].ids, ['a', 'b']);
    assert.equal(h.changes(), 0, 'nothing rendered before the fallback answered');
    h.rounds[0].done(null, [{ w: 5 }, { w: 6 }]);
    assert.deepEqual([h.s.get('a').w, h.s.get('a').place, h.s.get('b').w, h.s.status('a').kind, h.s.status('a').source, h.s.failures(), h.changes()],
      [5, 'a', 6, 'fresh', 'alt', 0, 1]);
    assert.deepEqual(h.t.pending(), [600000], 'the fallback worked: the regular schedule');
  });
}

test('B15: the primary answers → no fallback round at all; a place the primary could not parse alone is not a reason to ask', () => {
  const h = makeFallback(twoPlaces());
  h.s.refresh();
  h.calls[0](null, [{ v: 1 }, { v: 2 }]);
  h.s.refresh();
  h.calls[1](null, [{ v: 3 }, { nope: 1 }]);
  assert.deepEqual([h.rounds.length, h.s.get('a'), h.s.status('a').source], [0, 3, undefined]);
});

test('B15: the next refresh asks the primary first again; its good answer replaces the fallback\'s data at once', () => {
  const h = makeFallback(twoPlaces());
  h.s.refresh();
  h.calls[0]('http 503');
  h.rounds[0].done(null, [{ w: 5 }, { w: 6 }]);
  h.s.refresh();
  assert.equal(h.calls.length, 2, 'the primary is asked again');
  assert.equal(h.rounds.length, 1, 'and the fallback is not asked before it answered');
  h.calls[1](null, [{ v: 1 }, { v: 2 }]);
  assert.deepEqual([h.s.get('a'), h.s.status('a').kind, h.s.status('a').source, h.rounds.length], [1, 'fresh', undefined, 1]);
});

test('B15: both fail → the last good data stay (stale) and the normal back-off follows; a fallback place that fails alone keeps its own', () => {
  const h = makeFallback(twoPlaces());
  h.s.refresh();
  h.calls[0](null, [{ v: 1 }, { v: 2 }]);
  h.s.refresh();
  h.calls[1]('http 503');
  h.rounds[0].done(null, [null, null]);
  assert.deepEqual([h.s.get('a'), h.s.status('a').kind, h.s.failures(), h.t.pending()], [1, 'stale', 1, [30000]]);
  h.s.refresh();
  h.calls[2]('timeout');
  h.rounds[1].done(null, [{ w: 9 }, null]);
  assert.deepEqual([h.s.get('a').w, h.s.status('a').kind, h.s.get('b'), h.s.status('b').kind, h.s.failures()], [9, 'fresh', 2, 'stale', 2], 'a place still failing: a failed hop, as with the primary');
});

test('B15: stop() while the primary is in flight → no fallback round is started by its late failure', () => {
  const h = makeFallback(twoPlaces());
  h.s.refresh();
  h.s.stop();
  h.calls[0]('http 503');
  assert.equal(h.rounds.length, 0);
});

test('B15: the fallback\'s answer is kept with its source and restored through ITS parse after a restart (stale, source shown)', () => {
  const st = fakeStorage(), T = 100 * HOUR;
  const h = makeFallback(twoPlaces(), { persist: true, storage: st, at: T });
  h.s.refresh();
  h.calls[0]('http 503');
  h.rounds[0].done(null, [{ w: 5 }, { w: 6 }]);
  assert.deepEqual(JSON.parse(st.items['wx.v1']), { v: 1, at: T, url: urlOf(['a', 'b']), entries: [{ at: T, src: 'alt', json: { w: 5 } }, { at: T, src: 'alt', json: { w: 6 } }] });   // FIX-18D 1: one per-place form for every save
  const again = makeFallback(twoPlaces(), { persist: true, storage: st, at: T + HOUR });
  assert.deepEqual([again.s.get('a').w, again.s.status('a').kind, again.s.status('a').source, again.s.status('a').updatedAt], [5, 'stale', 'alt', T]);
  const noFallback = makeKept(twoPlaces(), st, T + HOUR);
  assert.equal(noFallback.s.get('a'), null, 'a store without that fallback ignores the entry');
});

// FIX-15B: the fallback's own clock and lifecycle — stamp(el) → { at, restored } dates its data (Y8: a reused answer keeps its
// arrival time; Y6: an answer that came back from the TV stays stale), restore(list, places) refills its caches after a
// restart, cancel() on stop() (Y2), and a fetch that throws never leaves the store in flight (Y1).
function makeStamped(opts = {}) {
  const ctx = load(FILES), t = fakeTimers(opts.at || 100 * HOUR), calls = [], rounds = [], log = [];
  const fb = { id: 'alt', fetch: (ps, done) => { if (opts.throwing) throw new Error('boom'); rounds.push(done); },
    parse: (json) => { if (!json || typeof json.w !== 'number') throw new Error('bad'); return json.w; },
    stamp: (el) => ({ at: el.at, restored: !!el.restored }), cancel: () => log.push('cancel'), restore: (list, ps) => log.push(['restore', list.length, ps.length]) };
  const src = Object.assign({}, persisted, { fallback: fb });
  const s = ctx.PlaceStore.create([{ id: 'a' }], src, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0,
    onChange: () => {}, getJson: (u, ms, done) => calls.push(done), storage: opts.storage || null });
  return { s, t, calls, rounds, log };
}

test('FIX-15B Y8: fallback data are dated by the fallback\'s stamp (the arrival of a reused answer), not by now', () => {
  const h = makeStamped();
  h.s.refresh();
  h.calls[0]('http 503');
  h.rounds[0](null, [{ w: 4, at: 100 * HOUR - 20 * 60000 }]);
  assert.deepEqual([h.s.get('a'), st2(h.s.status('a'))], [4, { kind: 'fresh', updatedAt: 100 * HOUR - 20 * 60000 }]);
});

test('FIX-15B Y6: an answer the fallback brought back from the TV stays stale (restored) until a live answer', () => {
  const h = makeStamped();
  h.s.refresh();
  h.calls[0]('http 503');
  h.rounds[0](null, [{ w: 4, at: 100 * HOUR - 5 * 60000, restored: true }]);
  assert.equal(h.s.status('a').kind, 'stale');
  h.s.refresh();
  h.calls[1](null, [{ v: 9 }]);
  assert.deepEqual([h.s.get('a'), h.s.status('a').kind], [9, 'fresh']);
});

test('FIX-15B Y6: at boot a kept fallback entry refills the fallback (restore) and is dated by its stamp', () => {
  const st = fakeStorage({ 'wx.v1': JSON.stringify({ v: 1, at: 100 * HOUR, url: urlOf(['a']), src: 'alt', json: [{ w: 4, at: 100 * HOUR - HOUR }] }) });
  const h = makeStamped({ storage: st, at: 100 * HOUR + 60000 });
  assert.deepEqual(h.log, [['restore', 1, 1]]);
  assert.deepEqual([h.s.get('a'), st2(h.s.status('a'))], [4, { kind: 'stale', updatedAt: 100 * HOUR - HOUR }]);
});

test('FIX-15B Y2: stop() cancels the fallback\'s round', () => {
  const h = makeStamped();
  h.s.refresh();
  h.calls[0]('http 503');
  h.s.stop();
  assert.deepEqual(h.log, ['cancel']);
});

test('FIX-15B Y1: a fallback that throws ends the round as failed — back-off, nothing stuck in flight', () => {
  const h = makeStamped({ throwing: true });
  h.s.refresh();
  assert.doesNotThrow(() => h.calls[0]('http 503'));
  assert.deepEqual([h.s.status('a').kind, h.s.failures(), h.t.pending()], ['failed', 1, [30000]]);
  assert.equal(h.s.refresh(), true, 'not stuck in flight');
});

// C-2 (batch 16): the one freshness rule (js/freshness.js) — data dated after the clock are stale, never fresh.
test('C-2: a clock that went back makes a place stale', () => {
  const h = make([{ id: 'a' }]);
  h.s.refresh();
  h.calls[0].done(null, [{ v: 1 }]);
  assert.equal(h.s.status('a').kind, 'fresh');
  h.t.advance(-60000);
  assert.equal(h.s.status('a').kind, 'stale');
});

// F-5 (FIX-18B 1, native N1 + Codex P2): what is kept on the TV is the per-place merge of what is on screen — each place's
// newest good element with its source and its own time, restored only within keepMaxMs of THAT time. A whole answer keeps
// today's form ({ src, json }); both forms restore.
const twoPlacesKept = () => [{ id: 'a' }, { id: 'b' }];
test('F-5: whole save, then only a answers for longer than keepMaxMs — after a restart a has its newest data, b (expired) none', () => {
  const st = fakeStorage(), T = 100 * HOUR, h = makeKept(twoPlacesKept(), st, T);
  h.s.refresh(); h.calls[0](null, [{ v: 1 }, { v: 2 }]);
  assert.deepEqual(JSON.parse(st.items['wx.v1']).entries.map((e) => e.json), [{ v: 1 }, { v: 2 }], 'a whole answer: every place, with its own time');   // FIX-18D 1: one per-place form for every save
  let n = 1;
  for (let t = 0; t < 49; t++) { h.t.advance(HOUR); while (h.calls.length > n) h.calls[n++](null, [{ v: 100 + t }, { nope: 1 }]); }
  const saved = JSON.parse(st.items['wx.v1']);
  assert.equal(saved.entries[1].at, T, 'b keeps its own (old) time in the merge');
  const again = makeKept(twoPlacesKept(), st, h.t.now() + 1);
  assert.equal(typeof again.s.get('a'), 'number', 'a: its newest data, kept');
  assert.equal(again.s.get('a'), saved.entries[0].json.v);
  assert.equal(again.s.get('b'), null, 'b: older than keepMaxMs by its own time — not restored');
});
test('F-5: complementary partial answers never lose a cached place — a restart restores both, each with its own time and source', () => {
  const st = fakeStorage(), T = 100 * HOUR, h = makeKept(twoPlacesKept(), st, T);
  h.s.refresh(); h.calls[0](null, [{ v: 3 }, { nope: 1 }]);
  h.t.advance(kept.refreshMs); h.calls[1](null, [{ nope: 1 }, { v: 4 }]);
  const again = makeKept(twoPlacesKept(), st, T + HOUR);
  assert.deepEqual([again.s.get('a'), again.s.get('b')], [3, 4]);
  assert.deepEqual([st2(again.s.status('a')), st2(again.s.status('b'))], [{ kind: 'stale', updatedAt: T }, { kind: 'stale', updatedAt: T + kept.refreshMs }]);
});
test('F-5: a merged entry with a fallback place goes back through ITS parse and restore; the legacy whole entry still restores', () => {
  const st = fakeStorage(), T = 100 * HOUR;
  const h = makeFallback(twoPlaces(), { persist: true, storage: st, at: T });
  h.s.refresh(); h.calls[0](null, [{ v: 7 }, { v: 8 }]);
  h.t.advance(kept.refreshMs); h.calls[1]('http 503'); h.rounds[0].done(null, [{ w: 5 }, { nope: 1 }]);
  const e = JSON.parse(st.items['wx.v1']);
  assert.deepEqual(e.entries.map((x) => x && x.src), ['alt', undefined], 'a from the fallback, b from the primary (no id)');
  const again = makeFallback(twoPlaces(), { persist: true, storage: st, at: T + HOUR });
  assert.deepEqual([again.s.get('a').w, again.s.status('a').source, again.s.get('b')], [5, 'alt', 8]);
});

// FIX-18D 1 (Codex's executed repro): a COMPLETE fallback answer in which place a's element came in an earlier round (MET reuses
// it: stamped hour 99) and b's now (hour 100), saved at hour 100. A restart at 147 h + 1 ms must not bring a back — it is
// 48 h + 1 ms old by its own time — while b (47 h + 1 ms) comes back.
test('FIX-18D 1: a whole fallback answer — each place expires on its own stamped time (a at 99 h gone at 147 h + 1 ms, b kept)', () => {
  const st = fakeStorage(), T = 100 * HOUR;
  const stamped = (opts) => makeFallback(twoPlaces(), Object.assign({ stamp: true }, opts));
  const h = stamped({ persist: true, storage: st, at: T });
  h.s.refresh(); h.calls[0]('http 503'); h.rounds[0].done(null, [{ w: 5, at: T - HOUR }, { w: 6, at: T }]);
  assert.deepEqual(JSON.parse(st.items['wx.v1']).entries.map((e) => e.at), [T - HOUR, T], 'saved with each place\'s own time');
  const again = stamped({ persist: true, storage: st, at: 147 * HOUR + 1 });
  assert.equal(again.s.get('a'), null, 'a: 48 h + 1 ms old by its own time — expired');
  assert.deepEqual([again.s.get('b') && again.s.get('b').w, again.s.status('b').updatedAt], [6, T], 'b: 47 h + 1 ms — kept, dated by its own time');
});
test('FIX-18D 1: an entry of the earlier whole-answer form (one saved time) still expires each place on its own stamped time', () => {
  const T = 100 * HOUR, st = fakeStorage({ 'wx.v1': JSON.stringify({ v: 1, at: T, url: urlOf(['a', 'b']), src: 'alt', json: [{ w: 5, at: T - HOUR }, { w: 6, at: T }] }) });
  const again = makeFallback(twoPlaces(), { persist: true, storage: st, at: 147 * HOUR + 1, stamp: true });
  assert.deepEqual([again.s.get('a'), again.s.get('b') && again.s.get('b').w], [null, 6]);
});
