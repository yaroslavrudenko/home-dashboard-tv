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

// C1: what each failure costs. `answer(s, x)` answers the open request: an error label or a batch answer.
const items = (codes) => {
  const b = batch();
  b.batchItems = b.batchItems.map((it, i) => (codes[i] === undefined || codes[i] === 200 ? it : { statusCode: codes[i], response: { error: { description: 'Server error ' + codes[i] } } }));
  return b;
};
const answer = (s, x) => s.calls[s.calls.length - 1].done(typeof x === 'string' ? x : null, typeof x === 'string' ? undefined : x);
const BACKOFF = [270000, 300000];                  // 4.5 min floor, 5 min first ceiling (random 0.5 → 285 s)

test('C1: a batch with the wrong number of items is a failed round: back-off, the last good rows and times kept', () => {
  const ctx = load(FILES);
  assert.throws(() => ctx.Traffic.parse({ batchItems: [] }, 7), /not a batch answer/);
  assert.throws(() => ctx.Traffic.parse({ batchItems: batch().batchItems.slice(0, 6) }, 7), /not a batch answer/);
  const s = makeStore(ctx);
  s.store.refresh(); answer(s, batch());
  s.clock.advance(15 * 60000);
  answer(s, { batchItems: [] });
  const wait = s.clock.pending()[0];
  assert.ok(wait >= BACKOFF[0] && wait <= BACKOFF[1], 'back-off, not the regular 15 min: ' + wait);
  assert.equal(s.store.status().kind, 'stale');
  assert.equal(s.store.routes()[0].data.travel, 2310, 'last good value kept');
  assert.equal(s.store.routes()[0].updatedAt, T0, 'with its time');
});

test('C1: any item 5xx, or every item failed, is a failed round (back-off); one unroutable item alone is not', () => {
  const ctx = load(FILES);
  for (const codes of [[503], [200, 200, 200, 200, 200, 502], [503, 503, 503, 503, 503, 503, 503], [400, 400, 400, 400, 400, 400, 400]]) {
    const s = makeStore(ctx);
    s.store.refresh(); answer(s, items(codes));
    const wait = s.clock.pending()[0];
    assert.ok(wait >= BACKOFF[0] && wait <= BACKOFF[1], JSON.stringify(codes) + ' backs off: ' + wait);
  }
  const ok = makeStore(ctx);
  ok.store.refresh(); answer(ok, batch());         // item 7: 400 NO_ROUTE_FOUND
  assert.deepEqual(ok.clock.pending(), [15 * 60000], 'NO_ROUTE_FOUND keeps the regular interval');
  assert.equal(ok.store.roads()[3].kind, 'failed', '"no data" on its row');
});

test('C1: 403 and 429 (batch or item) wait the regular interval or longer — never the fast back-off, even on view', () => {
  const ctx = load(FILES);
  for (const [x, problem] of [['http 429', 'limit'], ['http 403', 'key'], ['http 401', 'key'], [items([200, 429]), 'limit']]) {
    const s = makeStore(ctx);
    s.store.refresh(); answer(s, batch());
    s.store.setVisible(true);                      // on view: the regular interval is 5 min
    s.clock.advance(5 * 60000);
    answer(s, x);
    assert.deepEqual(s.clock.pending(), [15 * 60000], String(x).slice(0, 20) + ': waits 15 min');
    assert.equal(s.store.status().problem, problem);
    assert.equal(s.store.status().kind, 'stale', 'the last good cards stay, marked not current');
    for (let i = 0; i < 4; i++) { s.clock.advance(15 * 60000); answer(s, x); }
    assert.deepEqual(s.clock.pending(), [15 * 60000], 'and stays at 15 min while refused');
    s.clock.advance(15 * 60000); answer(s, batch());
    assert.equal(s.store.status().problem, null, 'gone with the first good answer');
    assert.equal(s.store.status().kind, 'fresh');
  }
});

test('C1 / D4: the back-off is jittered between 4.5 min and its ceiling and never longer than the current period', () => {
  const ctx = load(FILES);
  for (const [r, pick] of [[() => 0, () => 270000], [() => 0.999999, (c) => c]]) {
    for (const [onView, ceilings] of [[false, [5, 10, 15, 15, 15]], [true, [5, 5, 5, 5, 5]]]) {
      const clock = fakeTimers(T0), calls = [];
      const store = ctx.Traffic.createStore(withKey(ctx), { postJson: (u, b, t, done) => calls.push(done), now: clock.now,
        setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random: r, onChange: () => {} });
      store.refresh(); calls.pop()(null, batch());
      store.setVisible(onView);                    // on view: every ceiling is capped at the 5-min period
      for (const c of ceilings.map((m) => m * 60000)) {
        clock.advance(clock.pending()[0]);
        calls.pop()('timeout');
        assert.ok(Math.abs(clock.pending()[0] - pick(c)) <= 1, (onView ? 'on view' : 'hidden') + ': ' + clock.pending()[0] + ' for ceiling ' + c);
      }
    }
  }
});

// C3 (quota, variant A): the rotation shows traffic for 45 s every 2¼ min; refreshing on each such arrival cost ~72 %
// of the free daily quota. Only a ◀ ▶ visit refreshes (data older than 5 min) and shortens the interval.
test('C3: a rotation arrival neither refreshes nor shortens the interval; a ◀ ▶ visit refreshes data older than 5 min', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); answer(s, batch());
  s.clock.advance(7 * 60000);
  s.store.setVisible(true, true);
  assert.equal(s.calls.length, 1, 'a rotation visit to 7-minute-old data sends nothing');
  assert.deepEqual(s.clock.pending(), [8 * 60000], 'and keeps the 15-min schedule');
  s.store.setVisible(false, true);
  s.store.setVisible(true, false);
  assert.equal(s.calls.length, 2, 'a ◀ ▶ visit refreshes it at once');
  answer(s, batch());
  assert.deepEqual(s.clock.pending(), [5 * 60000], 'then every 5 min while on view');
  s.store.setVisible(false, true);
  assert.deepEqual(s.clock.pending(), [15 * 60000], 'the rotation moving on: back to 15 min');
});

// C5 (designer D13): a per-row loading skeleton is unreachable — the batch is applied whole, so before the first
// answer the whole screen says "loading" and after any answer every row has data or a failure.
test('C5: no row is ever "loading" once any answer arrived (the whole screen shows loading before that)', () => {
  const ctx = load(FILES);
  for (const x of ['timeout', 'http 429', { batchItems: [] }, items([503]), items([400, 200, 200, 200, 200, 200, 200]), batch()]) {
    const s = makeStore(ctx);
    assert.equal(s.store.status().kind, 'loading');
    assert.ok([...s.store.routes(), ...s.store.roads()].every((v) => v.kind === 'loading'), 'before: all rows loading together');
    s.store.refresh(); answer(s, x);
    const kinds = [...s.store.routes(), ...s.store.roads()].map((v) => v.kind);
    assert.ok(!kinds.includes('loading'), JSON.stringify(x).slice(0, 30) + ': ' + kinds);
  }
});

// FB4-C6 (Codex #4): a refusal wins over a 5xx in the same batch — retrying sooner cannot lift a key or quota refusal.
test('FB4-C6: 403+503 and 429+503 in one batch wait the regular interval (15 min), never the fast back-off', () => {
  const ctx = load(FILES);
  for (const [codes, problem] of [[[403, 503], 'key'], [[429, 503], 'limit'], [[503, 200, 429], 'limit']]) {
    const s = makeStore(ctx);
    s.store.refresh(); answer(s, items(codes));
    assert.deepEqual(s.clock.pending(), [15 * 60000], JSON.stringify(codes) + ': waits 900,000 ms');
    assert.equal(s.store.status().problem, problem);
  }
});

// FB4-C7 (Codex #5): only a recognised permanent routing outcome (NO_ROUTE_FOUND-type) leaves a round successful;
// any other item error is a failed round: back-off, the last good rows and times kept (lastAt is not moved: the
// round returns before it is set, so a later visit still refreshes on the last SUCCESSFUL round's time).
test('FB4-C7: a partial 400 INVALID_REQUEST is a failed round (back-off), the last good rows kept', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); answer(s, batch());
  s.clock.advance(15 * 60000);
  const b = batch();
  b.batchItems[5] = { statusCode: 400, response: { error: { description: 'INVALID_REQUEST: bad query' } } };
  answer(s, b);
  const wait = s.clock.pending()[0];
  assert.ok(wait >= BACKOFF[0] && wait <= BACKOFF[1], 'back-off, not the regular 15 min: ' + wait);
  assert.equal(s.store.roads()[2].data.travel, plain(ctx.Traffic.parse(batch(), 7))[5].travel, 'the last good row is kept');
  assert.equal(s.store.roads()[2].updatedAt, T0, 'with its time');
  assert.equal(s.store.roads()[2].kind, 'stale');
  assert.equal(s.store.status().kind, 'stale', 'the screen is not current');
});
