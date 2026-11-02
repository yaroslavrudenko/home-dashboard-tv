'use strict';
// Traffic (Mapbox Directions API, profile driving-traffic; tested on the documented answer shape in
// tests/fixtures/mapbox/routes.json — built from Mapbox's Directions reference with the coordinator's live figures of
// 2026-10-30 16:28 for Tel Aviv, Jerusalem, Haifa, the airport and Holon; the suite never reaches the network). One GET
// per route, the ten in parallel, levels, partial failures — and WHEN a round is sent (the judges' COMMON DECISION, fix
// batch 5c, with the owner's explicit-open rule; batch 6: Mapbox's numbers): one gate (Traffic.decide) for every path —
// at most one attempt per 10 min while the screen is on view (rotation arrivals, staying open, wake), at any hour; an
// explicit ◀ ▶ open sends every time; a verified localStorage reservation before every round, no refunds, 3,000
// requests per UTC date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js', 'js/ledger.js', 'js/traffic.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');     // 20:34 in Israel (winter time, UTC+2)
const NOON = Date.parse('2026-10-30T12:00:00Z');
const FUTURE = Date.parse('2099-01-01T12:00:00Z');
const MIN = 60000, DAY = 86400000;
const TOKEN = 'pk.eyJ1IjoiZml4dHVyZSJ9.fixture_token-1';
// The ten answers of one round, in route order: a Directions answer (JSON) or a transport error ('timeout', 'http 503').
const ok = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mapbox', 'routes.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const withToken = (ctx) => { ctx.Config.traffic.token = TOKEN; return ctx.Config.traffic; };
const NO_ROUTE = { code: 'NoRoute', message: 'No route found', routes: [] };
const MALFORMED = Array.from({ length: 10 }, () => ({ message: 'Not Found' }));
const withItems = (map) => { const b = ok(); for (const k of Object.keys(map)) b[k] = map[k]; return b; };

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

// opts: start, storage (null: none), preset (the stored record text), documentVisible, onPost(storage) when a round starts.
// calls: one entry per ROUND (the ten GETs the store starts together): { urls, dones, timeoutMs }.
function makeStore(ctx, opts) {
  opts = opts || {};
  const clock = fakeTimers(opts.start || T0);
  const calls = [], storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  if (opts.preset) storage.map.set('tt-quota', opts.preset);
  const store = ctx.Traffic.createStore(withToken(ctx), {
    getJson: (url, timeoutMs, done) => {
      let round = calls[calls.length - 1];
      if (!round || round.urls.length === 10) {
        if (storage) storage.log.push('post');
        if (opts.onPost) opts.onPost(storage);
        calls.push(round = { urls: [], dones: [], timeoutMs });
      }
      round.urls.push(url); round.dones.push(done);
    },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, documentVisible: opts.documentVisible,
    storage, onChange: () => {} });
  return { store, clock, calls, storage };
}
// Answers the last round: x a transport error for all ten ('timeout', 'http 429') or the ten answers (ok(), withItems()).
const answer = (s, x) => {
  const r = s.calls[s.calls.length - 1];
  r.dones.forEach((done, i) => { const v = typeof x === 'string' ? x : x[i]; if (typeof v === 'string') done(v); else done(null, v); });
};

test('no token until the build injects one: the committed placeholder and anything but a public token are refused', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Traffic.hasToken(ctx.Config.traffic), false, 'the placeholder');
  for (const k of ['', 'pk.', 'sk.eyJabc.def', 'pk.abc def', 'pk.abc&x=1', 'abc', undefined]) assert.equal(ctx.Traffic.hasToken({ token: k }), false, String(k));
  assert.equal(ctx.Traffic.hasToken({ token: TOKEN }), true);
});

test('Mapbox: one GET per route, the ten routes (no roads), driving-traffic, no geometry, lon,lat order, the token encoded', () => {
  const ctx = load(FILES);
  const cfg = withToken(ctx);
  assert.equal(cfg.roads, undefined, 'the road widgets are gone: the live picture is on the map screen');
  const u = ctx.Traffic.urls(cfg);
  assert.equal(u.length, 10);
  assert.equal(u[0], 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/34.8113,31.8928;34.7818,32.0853?overview=false&access_token=' + encodeURIComponent(TOKEN));
  for (const x of u) assert.match(x, /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/driving-traffic\/34\.8113,31\.8928;[\d.]+,[\d.]+\?overview=false&access_token=/);
});

test('an answer: travel time now, the usual time at this hour, the delay over it and the length; anything but a route is null', () => {
  const ctx = load(FILES);
  assert.deepEqual(plain(ctx.Traffic.summary(ok()[0])), { travel: 1920.4, free: 2358.1, delay: 0, length: 27412.3 }, 'faster than usual: no delay');
  const r = plain(ctx.Traffic.summary(ok()[6]));
  assert.deepEqual([r.travel, r.free, r.delay.toFixed(1), r.length], [1262.9, 781.5, '481.4', 11804.1]);
  for (const bad of [NO_ROUTE, { message: 'Not Found' }, null, { code: 'Ok', routes: [] }, { code: 'Ok', routes: [{ duration: -1 }] }]) assert.equal(ctx.Traffic.summary(bad), null, JSON.stringify(bad));
  const noTypical = { code: 'Ok', routes: [{ duration: 600, distance: 5000 }] };
  assert.deepEqual(plain(ctx.Traffic.summary(noTypical)), { travel: 600, free: 600, delay: 0, length: 5000 }, 'no typical time: no delay claimed');
});

test('levels: green below ×1.15 of the usual time, amber below ×1.5, red from ×1.5', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.traffic;
  const lv = (travel, free) => ctx.Traffic.level({ travel, free }, cfg);
  assert.deepEqual([lv(1000, 1000), lv(1149, 1000), lv(1150, 1000), lv(1499, 1000), lv(1500, 1000), lv(60, 0)], ['ok', 'ok', 'slow', 'slow', 'jam', 'ok']);
  assert.deepEqual(plain(ok().map((a) => ctx.Traffic.level(ctx.Traffic.summary(a), cfg))), ['ok', 'ok', 'ok', 'slow', 'ok', 'ok', 'jam', 'ok', 'ok', 'ok']);
});

// FB5C (judges' COMMON DECISION 2026-10-30 + the owner's explicit-open rule): the schedule is configuration.
test('FB5C-1: the schedule config — 10-min gate at any hour, an explicit open always, 3,000 requests per UTC date; no window, no month cap', () => {
  const ctx = load(FILES);
  const t = ctx.Config.traffic;
  assert.deepEqual(plain(t.schedule), { minIntervalMs: 10 * MIN, openMinIntervalMs: 0, dailyRequestCap: 3000 });
  for (const k of ['monthlyCap', 'refreshMs', 'visibleRefreshMs', 'retryMs', 'key']) assert.equal(t[k], undefined, k + ' is gone');
  assert.equal(t.timeoutMs, 20000);
  assert.equal(t.staleAfterMs, 30 * MIN);
});

// THE gate: one function, every path asks it. A table of facts → verdict.
test('FB5C-1: Traffic.decide — the table (any hour, 9:59.999 blocked, 10:00 allowed, explicit open, the UTC-date cap, storage)', () => {
  const ctx = load(FILES);
  const cfg = plain(ctx.Config.traffic);
  const base = { selected: true, visible: true, explicitOpen: false, busy: false, storage: true, now: NOON, utcDate: '2026-10-30', used: 0,
    lastAttemptAt: 0, retryNotBefore: 0, requests: 10 };
  const rows = [
    ['first install: no record, no cooldown', {}, 'due'],
    ['not the screen on view', { selected: false }, 'hidden'],
    ['the TV is off (document hidden)', { visible: false }, 'hidden'],
    ['a batch in flight', { busy: true }, 'busy'],
    ['a batch in flight, explicit open', { busy: true, explicitOpen: true }, 'busy'],
    ['storage unusable', { storage: false }, 'storage'],
    ['last attempt 9:59.999 ago', { lastAttemptAt: NOON - 10 * MIN + 1 }, 'floor'],
    ['last attempt 10:00 ago', { lastAttemptAt: NOON - 10 * MIN }, 'due'],
    ['03:00 at home (any hour)', { now: Date.parse('2026-10-30T01:00:00Z'), lastAttemptAt: 0 }, 'due'],
    ['explicit open 5 s after the last attempt', { lastAttemptAt: NOON - 5000, explicitOpen: true }, 'due'],
    ['explicit open right at the last attempt', { lastAttemptAt: NOON, explicitOpen: true }, 'due'],
    ['refusal deadline ahead', { retryNotBefore: NOON + 1 }, 'floor'],
    ['refusal deadline reached', { retryNotBefore: NOON }, 'due'],
    ['2,990 used + 10 = 3,000', { used: 2990 }, 'due'],
    ['2,991 used + 10 > 3,000', { used: 2991 }, 'cap'],
    ['2,991 used, explicit open: the cap binds', { used: 2991, explicitOpen: true }, 'cap'],
    ['3,000 used on yesterday\'s UTC date', { used: 3000, utcDate: '2026-10-29' }, 'due'],
    ['capped and inside the floor: the cap is said', { used: 3000, lastAttemptAt: NOON - MIN }, 'cap']
  ];
  for (const [name, facts, want] of rows) assert.equal(ctx.Traffic.decide(cfg, Object.assign({}, base, facts)), want, name);
});

test('FB5C-4: Traffic.correct — a future attempt time is rebased to now, a future UTC date carried with `used` kept; else nothing', () => {
  const ctx = load(FILES);
  const rec = (o) => Object.assign({ v: 1, utcDate: '2026-10-30', used: 100, lastAttemptAt: NOON - MIN, retryNotBefore: 0 }, o);
  assert.equal(ctx.Traffic.correct(rec({}), NOON), null, 'a sane record');
  assert.deepEqual(plain(ctx.Traffic.correct(rec({ lastAttemptAt: NOON + 1 }), NOON)), rec({ lastAttemptAt: NOON }));
  assert.deepEqual(plain(ctx.Traffic.correct(rec({ utcDate: '2099-01-01', lastAttemptAt: FUTURE, retryNotBefore: NOON + DAY }), NOON)),
    rec({ utcDate: '2026-10-30', lastAttemptAt: NOON, retryNotBefore: NOON + DAY }), 'both: used and the refusal deadline kept, no fresh budget');
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

test('FB5C-1: rotation arrivals, the tick on view and wake share the 10-min gate, at any hour; no catch-up', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, { start: Date.parse('2026-10-30T01:00:00Z') });   // 03:00 at home
  s.store.setVisible(true);
  assert.equal(s.calls.length, 1, '03:00: sent');
  assert.equal(s.calls[0].timeoutMs, 20000);
  s.clock.advance(400); answer(s, ok());
  for (let i = 0; i < 9; i++) { s.store.setVisible(false); s.clock.advance(30000); s.store.setVisible(true); s.store.wake(); s.clock.advance(30000); }
  assert.equal(s.calls.length, 1, '9 min of rotation arrivals and wakes: nothing');
  s.clock.advance(MIN);
  assert.equal(s.calls.length, 2, 'on view at 10:00: the timer');
  answer(s, ok());
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
  s.clock.advance(400); answer(s, ok());
  s.clock.advance(5000);
  s.store.setVisible(false);
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 2, '◀ ▶ open 5 s after the last answer: sent');
  s.store.setVisible(false);
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 2, 'open while that batch is in flight: nothing');
  answer(s, ok());
  s.store.setVisible(false); s.clock.advance(1000);
  s.store.setVisible(true);
  assert.equal(s.calls.length, 2, 'a rotation arrival 1 s later: the 10-min gate');
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
  s.clock.advance(19000); answer(s, ok());
  assert.equal(rec(s.storage).lastAttemptAt, T0, 'the answer does not move lastAttemptAt');
});

test('FB5C-2: no refunds, no separate retry path — failure, timeout, malformed answer or refusal waits the same 10 min', () => {
  const ctx = load(FILES);
  for (const x of ['timeout', 'http 503', 'http 429', 'http 403', MALFORMED, withItems({ 2: 'http 503' })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true);
    answer(s, x);
    assert.equal(rec(s.storage).used, 10, JSON.stringify(x).slice(0, 24) + ': no refund');
    s.clock.advance(10 * MIN - 1);
    assert.equal(s.calls.length, 1, JSON.stringify(x).slice(0, 24) + ': nothing sooner');
    s.clock.advance(1);
    assert.equal(s.calls.length, 2, JSON.stringify(x).slice(0, 24) + ': at 10:00');
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

test('FB5C-3: 3,000 requests per UTC date — the cap stops at 3,000 with no refund; the next UTC date starts again; the resume time', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-30', used: 2990, lastAttemptAt: 0, retryNotBefore: 0 }));
  const s = makeStore(ctx, { start: Date.parse('2026-10-30T23:00:00Z'), storage });
  s.store.setVisible(true);
  answer(s, 'timeout');
  assert.equal(rec(storage).used, 3000, 'the 300th round: 3,000, failed, not refunded');
  s.store.setVisible(false); s.store.setVisible(true, true);
  assert.equal(s.calls.length, 1, 'capped: an explicit open sends nothing');
  const st = s.store.status();
  assert.equal(st.problem, 'cap');
  assert.equal(st.resumeAt, Date.parse('2026-10-31T00:00:00Z'), 'max(next 00:00 UTC, last + 10 min)');
  s.clock.advance(60 * MIN);
  assert.equal(s.calls.length, 2, 'the next UTC date');
  assert.deepEqual([rec(storage).utcDate, rec(storage).used], ['2026-10-31', 10]);
  // the resume time is the later of the two when the attempt was close to midnight
  const late = memoryStorage();
  late.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-30', used: 3000, lastAttemptAt: Date.parse('2026-10-30T23:55:00Z'), retryNotBefore: 0 }));
  assert.equal(makeStore(ctx, { start: Date.parse('2026-10-30T23:57:00Z'), storage: late }).store.status().resumeAt, Date.parse('2026-10-31T00:05:00Z'));
});

test('FB5C-4: a restart at +9:59.999 is blocked, +10:00 allowed; a restart costs 0 extra requests', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage });
  a.store.setVisible(true); answer(a, ok()); a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 + 10 * MIN - 1 });
  b.store.setVisible(true); b.store.wake();
  assert.equal(b.calls.length, 0, '+9:59.999');
  const c = makeStore(ctx, { storage, start: T0 + 10 * MIN });
  c.store.setVisible(true);
  assert.equal(c.calls.length, 1, '+10:00');
  assert.equal(rec(storage).used, 20);
});

test('FB5C-4: an attempt time in the future is rebased to now: nothing sent then, the next attempt 10 min later', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-29', used: 40, lastAttemptAt: T0 + 3 * DAY, retryNotBefore: 0 }));
  const s = makeStore(ctx, { storage });
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 0, 'the correction sends nothing (an explicit open too)');
  assert.deepEqual(rec(storage), { v: 1, utcDate: '2026-10-29', used: 40, lastAttemptAt: T0, retryNotBefore: 0 });
  s.clock.advance(10 * MIN - 1);
  assert.equal(s.calls.length, 0);
  s.clock.advance(1);
  assert.equal(s.calls.length, 1, '10 min after the rebase');
  assert.equal(rec(storage).used, 50);
});

test('FB5C-4: a future accounting date is carried: no immediate POST, used unchanged, no new budget', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  storage.setItem('tt-quota', JSON.stringify({ v: 1, utcDate: '2099-01-01', used: 3000, lastAttemptAt: FUTURE, retryNotBefore: 0 }));
  const s = makeStore(ctx, { storage, start: NOON });
  s.store.setVisible(true);
  assert.equal(s.calls.length, 0);
  assert.deepEqual([rec(storage).utcDate, rec(storage).used, rec(storage).lastAttemptAt], ['2026-10-30', 3000, NOON]);
  s.clock.advance(11 * 60 * MIN);                 // 23:00 UTC
  assert.equal(s.calls.length, 0, 'the carried 3,000 still binds today');
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

test('FB5C-7: 401/403/429 (every request or one) → refused, retry not before last + 10 min; the cards stay; gone with a good answer', () => {
  const ctx = load(FILES);
  for (const x of ['http 429', 'http 403', 'http 401', withItems({ 1: 'http 429' }), withItems({ 0: 'http 403', 1: 'http 503' })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true); answer(s, ok());
    s.clock.advance(11 * MIN);
    answer(s, x);
    const st = s.store.status();
    assert.equal(st.problem, 'refused', JSON.stringify(x).slice(0, 40));
    assert.equal(st.kind, 'stale', 'the last good cards stay, marked out of date');
    assert.equal(st.resumeAt, T0 + 10 * MIN + 10 * MIN, 'the 10-min gate after the attempt at +10 min');
    s.clock.advance(10 * MIN); answer(s, ok());
    assert.equal(s.store.status().problem, null);
  }
});

test('FB5C-6: cached rows show at once after a restart — their own times and failure state, the screen time the oldest row', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage });
  a.store.setVisible(true); answer(a, ok());
  a.clock.advance(11 * MIN); answer(a, withItems({ 4: 'http 429' }));
  a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 + 12 * MIN });
  assert.equal(b.calls.length, 0, 'nothing sent: hidden');
  const st = b.store.status();
  assert.deepEqual([st.kind, st.updatedAt, st.problem], ['stale', T0, 'refused'], 'the refusal and the oldest row kept');
  assert.equal(b.store.status().routes[0].updatedAt, T0 + 11 * MIN, 'answered at +11 min (sent at +10)');
  assert.equal(b.store.status().routes[4].updatedAt, T0, 'the refused row keeps its own time');
  assert.equal(b.store.status().routes[2].data.travel, 5922.3);
});

// FB5D-CE-V1: an attempt with no recorded answer (a crash mid-flight) is a failed attempt — pinned where nothing else
// would make the screen stale: every row is minutes old and was answered well.
test('FB5D-CE-V1: good answer at T0, an explicit open at +5 min that crashes before its answer, restart at +6 min → stale', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage });
  a.store.setVisible(true); answer(a, ok()); a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 + 5 * MIN });
  b.store.setVisible(true, true);
  assert.equal(b.calls.length, 1, 'the explicit open sent');
  b.store.stop();                                   // the app dies with the round in flight: no answer is ever recorded
  const c = makeStore(ctx, { storage, start: T0 + 6 * MIN });
  const st = c.store.status();
  assert.deepEqual([st.kind, st.updatedAt], ['stale', T0], 'rows 6 min old, otherwise fresh: stale only because the last attempt failed');
  const control = makeStore(ctx, { storage: (() => { const m = memoryStorage(); m.map.set('tt-cache', storage.map.get('tt-cache')); m.map.set('tt-quota', JSON.stringify({ v: 1, utcDate: '2026-10-29', used: 10, lastAttemptAt: T0, retryNotBefore: 0 })); return m; })(), start: T0 + 6 * MIN });
  assert.equal(control.store.status().kind, 'fresh', 'control: the same rows with an answered last attempt are fresh');
});

test('FB5C-6: a future-dated row is stale, its time never rewritten, never a negative age', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const a = makeStore(ctx, { storage, start: T0 + 60 * MIN });
  a.store.setVisible(true); answer(a, ok()); a.store.stop();
  const b = makeStore(ctx, { storage, start: T0 });            // the clock went back an hour
  const st = b.store.status();
  assert.deepEqual([st.kind, st.future, st.updatedAt], ['stale', true, T0 + 60 * MIN]);
  assert.ok(b.store.status().routes.every((v) => v.kind === 'stale' && v.updatedAt === T0 + 60 * MIN));
});

test('FB5C-6: stale after 30 min (30:00 fresh, 30:00.001 stale) or when the last attempt failed; with no cache a failure says failed', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, ok());
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
  for (const x of ['timeout', 'http 429', MALFORMED, withItems({ 0: 'http 503' }), withItems({ 0: NO_ROUTE }), ok()]) {
    const s = makeStore(ctx);
    assert.ok(s.store.status().routes.every((v) => v.kind === 'loading'), 'before: all rows loading together');
    s.store.setVisible(true);
    assert.equal(s.store.status().kind, 'loading');
    answer(s, x);
    const kinds = s.store.status().routes.map((v) => v.kind);
    assert.ok(!kinds.includes('loading'), JSON.stringify(x).slice(0, 30) + ': ' + kinds);
  }
});

test('C1 / FB4-C7: a malformed answer, any request 5xx or 422 InvalidInput is a failed round: the last good rows and times kept', () => {
  const ctx = load(FILES);
  for (const x of [MALFORMED, withItems({ 2: { code: 'Ok', routes: [] } }), withItems({ 2: 'http 422' }), withItems({ 2: 'http 502' })]) {
    const s = makeStore(ctx);
    s.store.setVisible(true); answer(s, ok());
    s.clock.advance(11 * MIN);
    answer(s, x);
    assert.equal(s.store.status().kind, 'stale', JSON.stringify(x).slice(0, 30));
    assert.equal(s.store.status().routes[2].data.travel, 5922.3, 'last good value kept');
    assert.equal(s.store.status().routes[2].updatedAt, T0, 'with its time');
  }
});

test('FB5-N1: the header time is the oldest row with data', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, ok());
  s.clock.advance(10 * MIN); answer(s, ok());
  assert.deepEqual([s.store.status().kind, s.store.status().updatedAt], ['fresh', T0 + 10 * MIN], 'fresh: the round on screen');
  s.clock.advance(10 * MIN);
  answer(s, withItems({ 6: 'http 422' }));
  assert.equal(s.store.status().routes[0].updatedAt, T0 + 20 * MIN, 'the good rows are current');
  assert.deepEqual([s.store.status().kind, s.store.status().updatedAt], ['stale', T0 + 10 * MIN], 'stale: the oldest row on screen');
});

test('FB5-N3: NO_ROUTE after good data shows that row as no data and leaves the screen fresh; the next good answer restores it', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.setVisible(true); answer(s, ok());
  s.clock.advance(10 * MIN);
  answer(s, withItems({ 3: NO_ROUTE }));
  assert.deepEqual(plain(s.store.status().routes[3]), { kind: 'failed', data: null }, 'the unroutable row: no data, not its old value');
  assert.equal(s.store.status().kind, 'fresh', 'the screen stays fresh');
  assert.equal(s.store.status().updatedAt, T0 + 10 * MIN);
  s.clock.advance(10 * MIN);
  assert.equal(s.calls.length, 3, 'a successful round: the regular 10 min');
  answer(s, ok());
  assert.equal(s.store.status().routes[3].kind, 'fresh', 'routable again: back with data');
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

// FB5D-V2 (Codex V2): an impossible accounting date is a corrupt record — no POST and the pause, never a fresh budget.
test('FB5D-V2: impossible accounting dates (2026-00-00, 2026-02-31, 0000-00-00) → no POST, the pause; a real date still works', () => {
  const ctx = load(FILES);
  for (const date of ['2026-00-00', '2026-02-31', '0000-00-00', '2026-13-01', '2026-10-32']) {
    const s = makeStore(ctx, { preset: JSON.stringify({ v: 1, utcDate: date, used: 580, lastAttemptAt: 0, retryNotBefore: 0 }) });
    s.store.setVisible(true, true);
    s.clock.advance(2 * 60 * MIN);
    assert.equal(s.calls.length, 0, date + ': no POST');
    assert.equal(s.store.status().problem, 'storage', date + ': the pause');
    assert.equal(rec(s.storage).used, 580, date + ': nothing rewritten');
  }
  const ok = makeStore(ctx, { preset: JSON.stringify({ v: 1, utcDate: '2026-10-28', used: 580, lastAttemptAt: 0, retryNotBefore: 0 }) });
  ok.store.setVisible(true, true);
  assert.equal(ok.calls.length, 1, 'a real earlier date: a new UTC date, sent');
  assert.equal(ctx.Ledger.validDate('2028-02-29'), true, 'a leap day is real');
  assert.equal(ctx.Ledger.validDate('2026-02-29'), false);
});

// FB5D-V1 (Codex V1), batch 6 (Mapbox): a Retry-After on 429 / 403 / 503 (seconds or an HTTP date) is read through Net,
// recorded in the accounting record (written and read back), and enforced through the one gate — explicit opens
// included, and across a restart. The refusal copy shows max(last attempt + 10 min, that deadline).
// answers: one per ROUND, given to all ten GETs of that round ({ status, retryAfter, body }); posts: one XHR per round
// (its first), so posts.length counts rounds.
function retryAfterStore(ctx, storage, start, answers) {
  const clock = fakeTimers(start), posts = [], routes = ok();
  let sent = 0;
  function XMLHttpRequest() {
    const x = this; x.readyState = 0; x.status = 0; x.responseText = ''; x.reads = [];
    x.open = () => {}; x.setRequestHeader = () => {};
    x.getResponseHeader = (h) => { x.reads.push(h); return /^retry-after$/i.test(h) ? x.retryAfter : null; };
    x.send = () => { const i = sent++, a = answers[Math.floor(i / 10)] || { status: 200 }; if (i % 10 === 0) posts.push(x);
      x.readyState = 4; x.status = a.status; x.responseText = a.body || (a.status === 200 ? JSON.stringify(routes[i % 10]) : '');
      x.retryAfter = a.retryAfter === undefined ? null : a.retryAfter; x.onreadystatechange(); };
  }
  const net = load(['js/net.js'], { XMLHttpRequest });
  const store = ctx.Traffic.createStore(withToken(ctx), { getJson: net.Net.getJson, now: clock.now, setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout, storage, onChange: () => {} });
  return { store, clock, posts };
}
const reopen = (s) => { s.store.setVisible(false); s.store.setVisible(true, true); };

test('FB5D-V1: Retry-After 7200 on a 429 → recorded and read back; no POST before +2 h, explicit opens and a restart included', () => {
  const ctx = load(FILES);
  const storage = memoryStorage();
  const s = retryAfterStore(ctx, storage, T0, [{ status: 429, retryAfter: '7200' }]);
  s.store.setVisible(true, true);
  assert.equal(s.posts.length, 1);
  assert.ok(s.posts[0].reads.some((h) => /^retry-after$/i.test(h)), 'the header was read');
  assert.equal(rec(storage).retryNotBefore, T0 + 2 * 60 * MIN, 'persisted');
  assert.equal(JSON.parse(storage.getItem('tt-quota')).retryNotBefore, T0 + 2 * 60 * MIN, 'read back');
  assert.equal(s.store.status().problem, 'refused');
  assert.equal(s.store.status().resumeAt, T0 + 2 * 60 * MIN, 'the copy shows Mapbox\'s deadline, later than +10 min');
  for (let t = 0; t < 119; t++) { s.clock.advance(MIN); reopen(s); }
  assert.equal(s.posts.length, 1, 'no explicit open passes the deadline');
  s.store.stop();
  const again = retryAfterStore(ctx, storage, T0 + 119 * MIN, []);
  again.store.setVisible(true, true);
  assert.equal(again.posts.length, 0, 'a restart still honours it');
  again.clock.advance(MIN);
  assert.equal(again.posts.length, 1, 'at +2 h the gate opens (the screen stayed on view)');
});

test('FB5D-V1: Retry-After as an HTTP date on 403 and as seconds on 503; a short one never shortens the 10-min gate; none = 10 min; 200 ignores it', () => {
  const ctx = load(FILES);
  const date = new Date(T0 + 3 * 60 * MIN).toUTCString();
  const st = memoryStorage(), a = retryAfterStore(ctx, st, T0, [{ status: 403, retryAfter: date }]);
  a.store.setVisible(true, true);
  assert.equal(rec(st).retryNotBefore, T0 + 3 * 60 * MIN, 'an HTTP date');
  const s5 = memoryStorage(), b = retryAfterStore(ctx, s5, T0, [{ status: 503, retryAfter: '300' }]);
  b.store.setVisible(true, true);
  assert.equal(rec(s5).retryNotBefore, T0 + 5 * MIN, '503 seconds');
  assert.equal(b.store.status().resumeAt, 0, 'a 503 is not a refusal: no refusal copy');
  b.clock.advance(5 * MIN);
  assert.equal(b.posts.length, 1, 'automatic: still the 10-min gate');
  b.clock.advance(5 * MIN);
  assert.equal(b.posts.length, 2, 'at 10:00');
  for (const [name, h] of [['none', null], ['garbage', 'soon'], ['negative', '-5'], ['past date', new Date(T0 - MIN).toUTCString()]]) {
    const m = memoryStorage(), c = retryAfterStore(ctx, m, T0, [{ status: 429, retryAfter: h }]);
    c.store.setVisible(true, true);
    assert.equal(rec(m).retryNotBefore, 0, name + ': nothing recorded');
    assert.equal(c.store.status().resumeAt, T0 + 10 * MIN, name);
  }
  const m = memoryStorage(), good = retryAfterStore(ctx, m, T0, [{ status: 200, retryAfter: '7200' }]);
  good.store.setVisible(true, true);
  assert.equal(rec(m).retryNotBefore, 0, 'a good answer sets no deadline');
});

// ---- Batch 16 ---------------------------------------------------------------------------------------------------------
// C-2: one freshness rule — a row dated after the clock (it went back) is stale (and says it is future-dated), never fresh.
test('C-2: a clock that went back makes every row stale and future-dated', () => {
  const ctx = load(FILES), s = makeStore(ctx);
  s.store.setVisible(true, true);
  answer(s, ok());
  assert.equal(s.store.status().kind, 'fresh');
  s.clock.advance(-60 * 60000);
  const st = s.store.status();
  assert.deepEqual([st.kind, st.future, st.routes.every((v) => v.kind === 'stale' && v.future)], ['stale', true, true]);
});
// PERF-4: the screen's state comes from ONE read of the accounting record per render (status() carries the routes).
test('PERF-4: one status() reads the ledger once and carries every route\'s view', () => {
  const ctx = load(FILES), s = makeStore(ctx);
  s.store.setVisible(true, true);
  answer(s, ok());
  s.storage.log.length = 0;
  const st = s.store.status();
  assert.equal(s.storage.log.filter((l) => l === 'get tt-quota').length, 1, 'one read');
  assert.equal(st.routes.length, 10);
  assert.equal(st.routes[2].data.travel, 5922.3);
  assert.equal(s.store.routes, undefined, 'no second way to read the rows');
  assert.equal(ctx.Traffic.validDate, undefined, 'C-14: the re-export is gone (Ledger.validDate is the one)');
});
// C-19: a cache write that fails is said through deps.log.
test('C-19: the row cache not written is logged, the rows stay for this run', () => {
  const ctx = load(FILES), logs = [], storage = memoryStorage();
  storage.setItem = (k, v) => { if (k === 'tt-cache') throw new Error('quota'); storage.map.set(k, String(v)); };
  const clock = fakeTimers(T0), calls = [];
  const store = ctx.Traffic.createStore(withToken(ctx), { getJson: (u, ms, done) => calls.push(done), now: clock.now, setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout, storage, onChange: () => {}, log: (m) => logs.push(m) });
  store.setVisible(true, true);
  ok().forEach((a, i) => calls[i](null, a));
  assert.deepEqual(logs, ['traffic: rows not cached: quota']);
  assert.equal(store.status().kind, 'fresh');
});
