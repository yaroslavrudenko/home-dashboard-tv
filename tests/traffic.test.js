'use strict';
// Traffic (TomTom Routing API, tested on the documented batch shapes in tests/fixtures/tomtom). One batch request for
// the ten routes, summaries only, levels, partial failures — and WHEN a refresh is sent (the judges' COMMON DECISION,
// fix batch 5c, with the owner's explicit-open rule): one gate (Traffic.decide) for every path — at most one attempt per
// 25 min while the screen is on view (rotation arrivals, staying open, wake), at any hour; an explicit ◀ ▶ open sends
// every time; a verified localStorage reservation before every POST, no refunds, 580 items per UTC date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js', 'js/traffic.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');     // 20:34 in Israel (winter time, UTC+2)
const NOON = Date.parse('2026-10-30T12:00:00Z');
const FUTURE = Date.parse('2099-01-01T12:00:00Z');
const MIN = 60000, DAY = 86400000;
const batch = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tomtom', 'batch.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const withKey = (ctx) => { ctx.Config.traffic.key = 'FIXTUREKEY123'; return ctx.Config.traffic; };
const NO_ROUTE = { statusCode: 400, response: { error: { description: 'Engine error while executing route request: NO_ROUTE_FOUND' } } };
const failing = (code, description) => ({ statusCode: code, response: { error: { description: description || 'Server error ' + code } } });
const withItems = (map) => { const b = batch(); for (const k of Object.keys(map)) b.batchItems[k] = map[k]; return b; };

// localStorage stand-in with an operation log. mode: 'throw' (every call throws: private mode, a TV without storage),
// 'throw-set' (writes throw), 'readback' (writes land but read back as something else).
function memoryStorage(mode) {
  const m = new Map(), log = [];
  return { map: m, log,
    getItem: (k) => { log.push('get ' + k); if (mode === 'throw') throw new Error('denied');
      return m.has(k) ? (mode === 'readback' && k === 'tt-quota' && m.get('__w') ? m.get(k) + ' ' : m.get(k)) : null; },
    setItem: (k, v) => { log.push('set ' + k); if (mode === 'throw' || mode === 'throw-set') throw new Error('denied'); m.set(k, String(v)); if (k === 'tt-quota') m.set('__w', '1'); } };
}
const rec = (storage) => JSON.parse(storage.map.get('tt-quota'));

// opts: start, storage (null: none), preset (the stored record text), documentVisible, onPost(storage) at POST time.
function makeStore(ctx, opts) {
  opts = opts || {};
  const clock = fakeTimers(opts.start || T0);
  const israel = ctx.Tz.resolve({ zones: ['Asia/Jerusalem'], rule: 'IL' }, clock.now());
  const calls = [], storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  if (opts.preset) storage.map.set('tt-quota', opts.preset);
  const store = ctx.Traffic.createStore(withKey(ctx), {
    postJson: (url, body, timeoutMs, done) => { if (storage) storage.log.push('post'); if (opts.onPost) opts.onPost(storage); calls.push({ url, body, timeoutMs, done }); },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, documentVisible: opts.documentVisible,
    wall: (ms) => ctx.Tz.wallTime(israel, ms), storage, onChange: () => {} });
  return { store, clock, calls, storage };
}
const answer = (s, x) => s.calls[s.calls.length - 1].done(typeof x === 'string' ? x : null, typeof x === 'string' ? undefined : x);

test('no key until the build injects one: the committed placeholder and anything but letters and digits are refused', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Traffic.hasKey(ctx.Config.traffic), false, 'the placeholder');
  for (const k of ['', 'abc def', 'abc&x=1', undefined]) assert.equal(ctx.Traffic.hasKey({ key: k }), false, String(k));
  assert.equal(ctx.Traffic.hasKey({ key: 'Ab12Cd34' }), true);
});

test('FB5B-T1: ONE batch request carries the ten routes (no roads), summaries only (no geometry), with live traffic', () => {
  const ctx = load(FILES);
  const cfg = withKey(ctx);
  assert.equal(cfg.roads, undefined, 'the road widgets are gone: highways are watched on the map screen');
  const r = ctx.Traffic.request(cfg);
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://api.tomtom.com/routing/1/batch/sync/json');
  assert.equal(u.searchParams.get('key'), 'FIXTUREKEY123');
  assert.equal(r.body.batchItems.length, 10);
  assert.equal(r.body.batchItems[0].query, '/calculateRoute/31.8928,34.8113:32.0853,34.7818/json?travelMode=car&routeType=fastest&traffic=true&computeTravelTimeFor=all&routeRepresentation=summaryOnly');
  for (const it of r.body.batchItems) assert.match(it.query, /routeRepresentation=summaryOnly/);
});

test('the batch answer: travel time, time without traffic, delay and length per item; a failed item is null', () => {
  const ctx = load(FILES);
  const list = plain(ctx.Traffic.parse(batch(), 10));
  assert.deepEqual(list[0], { travel: 2310, free: 1490, delay: 820, length: 27412 });
  assert.equal(plain(ctx.Traffic.parse(withItems({ 3: NO_ROUTE }), 10))[3], null, 'NO_ROUTE_FOUND');
  assert.throws(() => ctx.Traffic.parse({ error: 'Unauthorized' }, 10), /not a batch answer/);
  const noFree = { batchItems: [{ statusCode: 200, response: { routes: [{ summary: { travelTimeInSeconds: 600, trafficDelayInSeconds: 120 } }] } }] };
  assert.deepEqual(plain(ctx.Traffic.parse(noFree, 1))[0], { travel: 600, free: 480, delay: 120, length: null }, 'free flow from the delay when absent');
});

test('levels: green below ×1.15 of free flow, amber below ×1.5, red from ×1.5', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.traffic;
  const lv = (travel, free) => ctx.Traffic.level({ travel, free }, cfg);
  assert.deepEqual([lv(1000, 1000), lv(1149, 1000), lv(1150, 1000), lv(1499, 1000), lv(1500, 1000), lv(60, 0)], ['ok', 'ok', 'slow', 'slow', 'jam', 'ok']);
  assert.deepEqual(plain(ctx.Traffic.parse(batch(), 10).slice(0, 6).map((s) => ctx.Traffic.level(s, cfg))), ['jam', 'ok', 'slow', 'ok', 'ok', 'slow']);
});

// FB5C (judges' COMMON DECISION 2026-10-30 + the owner's explicit-open rule): the schedule is configuration.
test('FB5C-1: the schedule config — 25-min gate at any hour, an explicit open always, 580 items per UTC date; no window, no month cap', () => {
  const ctx = load(FILES);
  const t = ctx.Config.traffic;
  assert.deepEqual(plain(t.schedule), { minIntervalMs: 25 * MIN, openMinIntervalMs: 0, dailyItemCap: 580 });
  for (const k of ['monthlyCap', 'refreshMs', 'visibleRefreshMs', 'retryMs']) assert.equal(t[k], undefined, k + ' is gone');
  assert.equal(t.timeoutMs, 20000);
  assert.equal(t.staleAfterMs, 30 * MIN);
});

// THE gate: one function, every path asks it. A table of facts → verdict.
test('FB5C-1: Traffic.decide — the table (any hour, 24:59.999 blocked, 25:00 allowed, explicit open, the UTC-date cap, storage)', () => {
  const ctx = load(FILES);
  const cfg = plain(ctx.Config.traffic);
  const base = { selected: true, visible: true, explicitOpen: false, busy: false, storage: true, now: NOON, utcDate: '2026-10-30', used: 0,
    lastAttemptAt: 0, retryNotBefore: 0, items: 10 };
  const rows = [
    ['first install: no record, no cooldown', {}, 'due'],
    ['not the screen on view', { selected: false }, 'hidden'],
    ['the TV is off (document hidden)', { visible: false }, 'hidden'],
    ['a batch in flight', { busy: true }, 'busy'],
    ['a batch in flight, explicit open', { busy: true, explicitOpen: true }, 'busy'],
    ['storage unusable', { storage: false }, 'storage'],
    ['last attempt 24:59.999 ago', { lastAttemptAt: NOON - 25 * MIN + 1 }, 'floor'],
    ['last attempt 25:00 ago', { lastAttemptAt: NOON - 25 * MIN }, 'due'],
    ['03:00 at home (any hour)', { now: Date.parse('2026-10-30T01:00:00Z'), lastAttemptAt: 0 }, 'due'],
    ['explicit open 5 s after the last attempt', { lastAttemptAt: NOON - 5000, explicitOpen: true }, 'due'],
    ['explicit open right at the last attempt', { lastAttemptAt: NOON, explicitOpen: true }, 'due'],
    ['TomTom deadline ahead', { retryNotBefore: NOON + 1 }, 'floor'],
    ['TomTom deadline reached', { retryNotBefore: NOON }, 'due'],
    ['570 used + 10 = 580', { used: 570 }, 'due'],
    ['571 used + 10 > 580', { used: 571 }, 'cap'],
    ['571 used, explicit open: the cap binds', { used: 571, explicitOpen: true }, 'cap'],
    ['580 used on yesterday\'s UTC date', { used: 580, utcDate: '2026-10-29' }, 'due'],
    ['capped and inside the floor: the cap is said', { used: 580, lastAttemptAt: NOON - MIN }, 'cap']
  ];
  for (const [name, facts, want] of rows) assert.equal(ctx.Traffic.decide(cfg, Object.assign({}, base, facts)), want, name);
});

test('FB5C-4: Traffic.correct — a future attempt time is rebased to now, a future UTC date carried with `used` kept; else nothing', () => {
  const ctx = load(FILES);
  const rec = (o) => Object.assign({ v: 1, utcDate: '2026-10-30', used: 100, lastAttemptAt: NOON - MIN, retryNotBefore: 0 }, o);
  assert.equal(ctx.Traffic.correct(rec({}), NOON), null, 'a sane record');
  assert.deepEqual(plain(ctx.Traffic.correct(rec({ lastAttemptAt: NOON + 1 }), NOON)), rec({ lastAttemptAt: NOON }));
  assert.deepEqual(plain(ctx.Traffic.correct(rec({ utcDate: '2099-01-01', lastAttemptAt: FUTURE, retryNotBefore: NOON + DAY }), NOON)),
    rec({ utcDate: '2026-10-30', lastAttemptAt: NOON, retryNotBefore: NOON + DAY }), 'both: used and the TomTom deadline kept, no fresh budget');
  assert.deepEqual(plain(ctx.Traffic.correct(rec({ utcDate: '2026-10-31' }), NOON)), rec({}), 'a date ahead, the attempt not');
});

test('FB5C-1: hidden = 0 requests: a whole day with the screen never on view, or on view with the TV off, sends nothing', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.clock.advance(24 * 60 * MIN);
  assert.equal(s.calls.length, 0);
  const off = makeStore(ctx, { documentVisible: () => false });
  off.store.setVisible(true);
  off.store.wake();
  off.clock.advance(24 * 60 * MIN);
  assert.equal(off.calls.length, 0, 'document hidden');
});

test('FB5C-1: rotation arrivals, the tick on view and wake share the 25-min gate, at any hour; no catch-up', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, { start: Date.parse('2026-10-30T01:00:00Z') });   // 03:00 at home
  s.store.setVisible(true);
  assert.equal(s.calls.length, 1, '03:00: sent');
  assert.equal(s.calls[0].timeoutMs, 20000);
  s.clock.advance(400); answer(s, batch());
  for (let i = 0; i < 24; i++) { s.store.setVisible(false); s.clock.advance(30000); s.store.setVisible(true); s.store.wake(); s.clock.advance(30000); }
  assert.equal(s.calls.length, 1, '24 min of rotation arrivals and wakes: nothing');
  s.clock.advance(MIN);
  assert.equal(s.calls.length, 2, 'on view at 25:00: the timer');
  answer(s, batch());
  s.store.setVisible(false);
  s.clock.advance(3 * 60 * MIN);
  assert.equal(s.calls.length, 2, 'hidden: nothing');
  s.store.setVisible(true);
  assert.equal(s.calls.length, 3, 'back on view: one, not the missed ones');
  s.clock.advance(MIN);
  assert.equal(s.calls.length, 3, 'no catch-up');
});

// The owner (2026-10-30): «обновлялись на открытии экрана пробок — вне зависимости сколько прошло минут».
test('FB5C-1: an explicit ◀ ▶ open sends every time — 5 s after the last answer too; never while a batch is in flight', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true);
  s.clock.advance(400); answer(s, batch());
  s.clock.advance(5000);
  s.store.setVisible(false);
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 2, '◀ ▶ open 5 s after the last answer: sent');
  s.store.setVisible(false);
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 2, 'open while that batch is in flight: nothing');
  answer(s, batch());
  s.store.setVisible(false); s.clock.advance(1000);
  s.store.setVisible(true);
  assert.equal(s.calls.length, 2, 'a rotation arrival 1 s later: the 25-min gate');
  assert.equal(rec(s.storage).used, 20);
});

test('FB5C-2: the reservation {utcDate, used + 10, lastAttemptAt} is written and read back before every POST; completion never moves it', () => {
  const ctx = load(FILES);
  const seen = [];
  const s = makeStore(ctx, { onPost: (storage) => seen.push(rec(storage)) });
  s.store.setVisible(true);
  assert.deepEqual(seen[0], { v: 1, utcDate: '2026-10-29', used: 10, lastAttemptAt: T0, retryNotBefore: 0 }, 'stored before the POST');
  const log = s.storage.log, post = log.indexOf('post');
  assert.deepEqual(log.slice(post - 2, post + 1), ['set tt-quota', 'get tt-quota', 'post'], 'written, read back, then sent: ' + log);
  s.clock.advance(19000); answer(s, batch());
  assert.equal(rec(s.storage).lastAttemptAt, T0, 'the answer does not move lastAttemptAt');
});

test('FB5C-2: no refunds, no separate retry path — failure, timeout, malformed batch or refusal waits the same 25 min', () => {
  const ctx = load(FILES);
  for (const x of ['timeout', 'http 503', 'http 429', 'http 403', { batchItems: [] }, withItems({ 2: failing(503) })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true);
    answer(s, x);
    assert.equal(rec(s.storage).used, 10, JSON.stringify(x).slice(0, 24) + ': no refund');
    s.clock.advance(25 * MIN - 1);
    assert.equal(s.calls.length, 1, JSON.stringify(x).slice(0, 24) + ': nothing sooner');
    s.clock.advance(1);
    assert.equal(s.calls.length, 2, JSON.stringify(x).slice(0, 24) + ': at 25:00');
  }
});

test('FB5C-5: storage unusable, missing, corrupt, non-finite, or a failed read-back → no POST and the pause message', () => {
  const ctx = load(FILES);
  const cases = {
    'throws': { storage: memoryStorage('throw') },
    'none': { storage: null },
    'corrupt JSON': { preset: '{used:' },
    'non-finite used': { preset: '{"v":1,"utcDate":"2026-10-29","used":null,"lastAttemptAt":0,"retryNotBefore":0}' },
    'wrong version': { preset: '{"v":2,"utcDate":"2026-10-29","used":0,"lastAttemptAt":0,"retryNotBefore":0}' },
    'read-back differs': { storage: memoryStorage('readback') }
  };
  for (const [name, o] of Object.entries(cases)) {
    const s = makeStore(ctx, o);
    s.store.setVisible(true, true);
    s.clock.advance(2 * 60 * MIN);
    assert.equal(s.calls.length, 0, name + ': no POST');
    assert.equal(s.store.status().problem, 'storage', name);
    assert.equal(s.store.status().kind, 'failed', name);
  }
});

test('FB5C-3: 580 items per UTC date — the cap stops at 580 with no refund; the next UTC date starts again; the resume time', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-30', used: 570, lastAttemptAt: 0, retryNotBefore: 0 }));
  const s = makeStore(ctx, { start: Date.parse('2026-10-30T23:00:00Z'), storage });
  s.store.setVisible(true);
  answer(s, 'timeout');
  assert.equal(rec(storage).used, 580, 'the 58th batch: 580, failed, not refunded');
  s.store.setVisible(false); s.store.setVisible(true, true);
  assert.equal(s.calls.length, 1, 'capped: an explicit open sends nothing');
  const st = s.store.status();
  assert.equal(st.problem, 'cap');
  assert.equal(st.resumeAt, Date.parse('2026-10-31T00:00:00Z'), 'max(next 00:00 UTC, last + 25 min)');
  s.clock.advance(60 * MIN);
  assert.equal(s.calls.length, 2, 'the next UTC date');
  assert.deepEqual([rec(storage).utcDate, rec(storage).used], ['2026-10-31', 10]);
  // the resume time is the later of the two when the attempt was close to midnight
  const late = memoryStorage();
  late.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-30', used: 580, lastAttemptAt: Date.parse('2026-10-30T23:50:00Z'), retryNotBefore: 0 }));
  assert.equal(makeStore(ctx, { start: Date.parse('2026-10-30T23:55:00Z'), storage: late }).store.status().resumeAt, Date.parse('2026-10-31T00:15:00Z'));
});

test('FB5C-4: a restart at +24:59.999 is blocked, +25:00 allowed; a restart costs 0 extra items', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage });
  a.store.setVisible(true); answer(a, batch()); a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 + 25 * MIN - 1 });
  b.store.setVisible(true); b.store.wake();
  assert.equal(b.calls.length, 0, '+24:59.999');
  const c = makeStore(ctx, { storage, start: T0 + 25 * MIN });
  c.store.setVisible(true);
  assert.equal(c.calls.length, 1, '+25:00');
  assert.equal(rec(storage).used, 20);
});

test('FB5C-4: an attempt time in the future is rebased to now: nothing sent then, the next attempt 25 min later', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-29', used: 40, lastAttemptAt: T0 + 3 * DAY, retryNotBefore: 0 }));
  const s = makeStore(ctx, { storage });
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 0, 'the correction sends nothing (an explicit open too)');
  assert.deepEqual(rec(storage), { v: 1, utcDate: '2026-10-29', used: 40, lastAttemptAt: T0, retryNotBefore: 0 });
  s.clock.advance(25 * MIN - 1);
  assert.equal(s.calls.length, 0);
  s.clock.advance(1);
  assert.equal(s.calls.length, 1, '25 min after the rebase');
  assert.equal(rec(storage).used, 50);
});

test('FB5C-4: a future accounting date is carried: no immediate POST, used unchanged, no new budget', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2099-01-01', used: 580, lastAttemptAt: FUTURE, retryNotBefore: 0 }));
  const s = makeStore(ctx, { storage, start: NOON });
  s.store.setVisible(true);
  assert.equal(s.calls.length, 0);
  assert.deepEqual([rec(storage).utcDate, rec(storage).used, rec(storage).lastAttemptAt], ['2026-10-30', 580, NOON]);
  s.clock.advance(11 * 60 * MIN);                 // 23:00 UTC
  assert.equal(s.calls.length, 0, 'the carried 580 still binds today');
  assert.equal(s.store.status().problem, 'cap');
  s.clock.advance(60 * MIN + 1000);
  assert.equal(s.calls.length, 1, 'only a strictly later UTC date resets');
});

test('FB5C-4: a correction that cannot be written or read back → 0 POSTs and the pause', () => {
  const ctx = load(FILES);
  for (const mode of ['throw-set', 'readback']) {
    const storage = memoryStorage(mode);
    storage.map.set('tt-quota', JSON.stringify({ v: 1, utcDate: '2099-01-01', used: 100, lastAttemptAt: FUTURE, retryNotBefore: 0 }));
    const s = makeStore(ctx, { storage, start: NOON });
    s.store.setVisible(true, true);
    s.clock.advance(3 * 60 * MIN);
    assert.equal(s.calls.length, 0, mode);
    assert.equal(s.store.status().problem, 'storage', mode);
  }
});

test('FB5C-7: 401/403/429 (the batch or an item) → refused, retry not before last + 25 min; the cards stay; gone with a good answer', () => {
  const ctx = load(FILES);
  for (const x of ['http 429', 'http 403', 'http 401', withItems({ 1: failing(429) }), withItems({ 0: failing(403), 1: failing(503) })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true); answer(s, batch());
    s.clock.advance(26 * MIN);
    answer(s, x);
    const st = s.store.status();
    assert.equal(st.problem, 'refused', JSON.stringify(x).slice(0, 40));
    assert.equal(st.kind, 'stale', 'the last good cards stay, marked out of date');
    assert.equal(st.resumeAt, T0 + 25 * MIN + 25 * MIN, 'the 25-min gate after the attempt at +25 min');
    s.clock.advance(25 * MIN); answer(s, batch());
    assert.equal(s.store.status().problem, null);
  }
});

test('FB5C-6: cached rows show at once after a restart — their own times and failure state, the screen time the oldest row', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage });
  a.store.setVisible(true); answer(a, batch());
  a.clock.advance(26 * MIN); answer(a, withItems({ 4: failing(429) }));
  a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 + 27 * MIN });
  assert.equal(b.calls.length, 0, 'nothing sent: hidden');
  const st = b.store.status();
  assert.deepEqual([st.kind, st.updatedAt, st.problem], ['stale', T0, 'refused'], 'the refusal and the oldest row kept');
  assert.equal(b.store.routes()[0].updatedAt, T0 + 26 * MIN, 'answered at +26 min (sent at +25)');
  assert.equal(b.store.routes()[4].updatedAt, T0, 'the refused row keeps its own time');
  assert.equal(b.store.routes()[2].data.travel, 5520);
  // an attempt with no recorded answer (a crash mid-flight) is a failed attempt: the cache shows stale
  const c = makeStore(ctx, { storage, start: T0 + 51 * MIN });
  c.store.setVisible(true); c.store.stop();
  const d = makeStore(ctx, { storage, start: T0 + 52 * MIN });
  assert.equal(d.store.status().kind, 'stale');
});

test('FB5C-6: a future-dated row is stale, its time never rewritten, never a negative age', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage, start: T0 + 60 * MIN });
  a.store.setVisible(true); answer(a, batch()); a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 });            // the clock went back an hour
  const st = b.store.status();
  assert.deepEqual([st.kind, st.future, st.updatedAt], ['stale', true, T0 + 60 * MIN]);
  assert.ok(b.store.routes().every((v) => v.kind === 'stale' && v.updatedAt === T0 + 60 * MIN));
});

test('FB5C-6: stale after 30 min (30:00 fresh, 30:00.001 stale) or when the last attempt failed; with no cache a failure says failed', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, batch());
  s.store.setVisible(false);
  s.clock.advance(30 * MIN);
  assert.equal(s.store.status().kind, 'fresh', '30:00');
  s.clock.advance(1);
  assert.equal(s.store.status().kind, 'stale', '30:00.001');
  const f = makeStore(ctx);
  f.store.setVisible(true);
  assert.deepEqual([f.store.status().kind, f.store.status().updating], ['loading', true], 'in flight with no cache');
  answer(f, 'http 503');
  assert.deepEqual([f.store.status().kind, f.store.status().updating, f.store.status().problem], ['failed', false, null]);
});

// C5 (designer D13): the batch is applied whole, so before the first answer the whole screen says "updating" and after
// any answer every row has data or a failure.
test('C5: no row is ever "loading" once any answer arrived (the whole screen shows loading before that)', () => {
  const ctx = load(FILES);
  for (const x of ['timeout', 'http 429', { batchItems: [] }, withItems({ 0: failing(503) }), withItems({ 0: NO_ROUTE }), batch()]) {
    const s = makeStore(ctx);
    assert.ok(s.store.routes().every((v) => v.kind === 'loading'), 'before: all rows loading together');
    s.store.setVisible(true);
    assert.equal(s.store.status().kind, 'loading');
    answer(s, x);
    const kinds = s.store.routes().map((v) => v.kind);
    assert.ok(!kinds.includes('loading'), JSON.stringify(x).slice(0, 30) + ': ' + kinds);
  }
});

test('C1 / FB4-C7: a wrong-sized batch, any item 5xx or 400 INVALID_REQUEST is a failed round: the last good rows and times kept', () => {
  const ctx = load(FILES);
  for (const x of [{ batchItems: [] }, { batchItems: batch().batchItems.slice(0, 9) }, withItems({ 2: failing(400, 'INVALID_REQUEST: bad query') }), withItems({ 2: failing(502) })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true); answer(s, batch());
    s.clock.advance(26 * MIN);
    answer(s, x);
    assert.equal(s.store.status().kind, 'stale', JSON.stringify(x).slice(0, 30));
    assert.equal(s.store.routes()[2].data.travel, 5520, 'last good value kept');
    assert.equal(s.store.routes()[2].updatedAt, T0, 'with its time');
  }
});

test('FB5-N1: the header time is the oldest row with data', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, batch());
  s.clock.advance(25 * MIN); answer(s, batch());
  assert.deepEqual([s.store.status().kind, s.store.status().updatedAt], ['fresh', T0 + 25 * MIN], 'fresh: the round on screen');
  s.clock.advance(25 * MIN);
  answer(s, withItems({ 6: failing(400, 'INVALID_REQUEST: bad query') }));
  assert.equal(s.store.routes()[0].updatedAt, T0 + 50 * MIN, 'the good rows are current');
  assert.deepEqual([s.store.status().kind, s.store.status().updatedAt], ['stale', T0 + 25 * MIN], 'stale: the oldest row on screen');
});

test('FB5-N3: NO_ROUTE after good data shows that row as no data and leaves the screen fresh; the next good answer restores it', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, batch());
  s.clock.advance(25 * MIN);
  answer(s, withItems({ 3: NO_ROUTE }));
  assert.deepEqual(plain(s.store.routes()[3]), { kind: 'failed', data: null }, 'the unroutable row: no data, not its old value');
  assert.equal(s.store.status().kind, 'fresh', 'the screen stays fresh');
  assert.equal(s.store.status().updatedAt, T0 + 25 * MIN);
  s.clock.advance(25 * MIN);
  assert.equal(s.calls.length, 3, 'a successful round: the regular 25 min');
  answer(s, batch());
  assert.equal(s.store.routes()[3].kind, 'fresh', 'routable again: back with data');
});

test('FB5B-T1: columns «Города» and «Рядом» — five routes each, every route exactly once, all from Rehovot', () => {
  const ctx = load(FILES);
  const t = ctx.Config.traffic;
  assert.deepEqual(plain(t.columns.map((c) => [c.id, c.legs.length])), [['cities', 5], ['near', 5]]);
  assert.deepEqual(plain(t.columns[0].legs), ['tlv', 'jlm', 'haifa', 'beersheva', 'ashkelon']);
  assert.deepEqual(plain(t.columns[1].legs), ['modiin', 'rishon', 'airport', 'holon', 'glilot']);
  const all = plain(t.columns.reduce((a, c) => a.concat(c.legs), [])).sort();
  assert.deepEqual(all, plain(t.routes.map((l) => l.id)).sort(), 'each route once, none missing');
  for (const r of t.routes) assert.deepEqual(plain(r.from), [31.8928, 34.8113], r.id + ' starts in Rehovot');
});
