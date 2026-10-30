'use strict';
// The traffic map (FB5-MAP): the tile grid over the card, the tile URLs (TomTom raster map + traffic flow, the key from
// the build), and the controller's promise: tiles are requested ONLY while the map screen is on view, the base map
// once, the overlay every 5 min while on view; a simulated day stays inside TomTom's free monthly tile budget.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/screens.js', 'js/trafficmap.js'];
const plain = (v) => JSON.parse(JSON.stringify(v));
const CARD = { width: 1792, height: 912 };
const MIN = 60000;
const T0 = Date.parse('2026-10-29T18:34:00Z');

test('FB5-MAP: the grid covers the 1792 × 912 card with 512-px tiles at zoom 10, Rehovot in the middle — 15 tiles at most', () => {
  const ctx = load(FILES);
  const g = plain(ctx.TrafficMap.grid(ctx.Config.map, CARD.width, CARD.height));
  assert.ok(g.length >= 8 && g.length <= 15, g.length + ' tiles');   // 4 × 3 = 12 for this centre
  const xs = [...new Set(g.map((t) => t.x))], ys = [...new Set(g.map((t) => t.y))];
  assert.equal(g.length, xs.length * ys.length, 'a full rectangle');
  assert.ok(g.every((t) => t.left > -512 && t.left < CARD.width && t.top > -512 && t.top < CARD.height), 'every tile touches the card');
  assert.ok(Math.min(...g.map((t) => t.left)) <= 0 && Math.max(...g.map((t) => t.left)) + 512 >= CARD.width, 'no gap left or right');
  assert.ok(Math.min(...g.map((t) => t.top)) <= 0 && Math.max(...g.map((t) => t.top)) + 512 >= CARD.height, 'no gap above or below');
  // Rehovot (31.8928, 34.8113) at zoom 10 is in tile x 611, y 416 (Web Mercator: 611.02, 416.2)
  assert.ok(xs.includes(611) && ys.includes(416), JSON.stringify([xs, ys]));
});

// FB5B-M2 (Codex R1, confirmed live 2026-10-30: relative0 + thickness → HTTP 400): the flow style is relative0-dark, and
// TomTom accepts `thickness` only for absolute / relative / relative-delay / reduced-sensitivity, so it is never sent with
// relative0*. The per-round stamp stays (live: accepted, 200): in Chrome a page reuses an image it already shows under
// the same URL without asking the network, no-store or not (tests/browser/screens5.test.mjs counts the requests).
test('FB5B-M2: tile URLs — night base map and the relative0-dark flow, 512 px, the key escaped, no thickness, a stamp per round', () => {
  const ctx = load(FILES);
  const m = ctx.Config.map, t = { x: 611, y: 425 };
  assert.equal(ctx.TrafficMap.baseUrl(m, 'Ab12', t), 'https://api.tomtom.com/map/1/tile/basic/night/10/611/425.png?key=Ab12&tileSize=512&language=ru-RU');
  assert.equal(ctx.TrafficMap.flowUrl(m, 'Ab12', t, 1700), 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/10/611/425.png?key=Ab12&tileSize=512&refresh=1700');
  assert.match(ctx.TrafficMap.baseUrl(m, 'a&b', t), /key=a%26b&/);
  assert.equal(m.thickness, undefined, 'no thickness in the config');
  const style = /\/flow\/([a-z0-9-]+)\//.exec(m.flow)[1];
  assert.ok(/^relative0/.test(style) && !/thickness=/.test(ctx.TrafficMap.flowUrl(m, 'k', t, 1)), 'the documented combination: no thickness with ' + style);
  assert.equal(m.timeoutMs, 20000, 'every tile has a deadline (FB5B-M1)');
  assert.equal(ctx.Config.traffic.key, '__TOMTOM_KEY__', 'the map uses the traffic key: the same build placeholder, never a key in the repo');
});

// A controller on a fake clock. Loaders answer after 300 ms (opts.base / opts.flow: n → ok, or 'hang': never) and
// return their cancel(), as js/view-map.js does.
function controller(ctx, opts) {
  opts = opts || {};
  const clock = fakeTimers(T0), calls = { base: 0, flow: 0, cancelled: 0 }, changes = [];
  const loader = (kind) => (a, b) => {
    const done = kind === 'flow' ? b : a;
    const n = ++calls[kind], want = opts[kind] ? opts[kind](n) : true;
    const id = want === 'hang' ? null : clock.setTimeout(() => done(want), 300);
    return () => { calls.cancelled++; if (id !== null) clock.clearTimeout(id); };
  };
  const c = ctx.TrafficMap.createController(ctx.Config.map, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    loadBase: loader('base'), loadFlow: loader('flow'), onChange: () => changes.push(c.state().kind) });
  return { c, clock, calls, changes };
}

test('FB5-MAP: nothing is requested while the map is hidden; on view: the base map once and the overlay every 5 min', () => {
  const ctx = load(FILES);
  const s = controller(ctx);
  s.clock.advance(60 * MIN);
  assert.deepEqual([s.calls.base, s.calls.flow], [0, 0], 'hidden for an hour: no tile');
  assert.equal(s.c.state().kind, 'loading');
  s.c.setVisible(true);
  assert.deepEqual([s.calls.base, s.calls.flow], [1, 1], 'both layers at once on arrival');
  s.clock.advance(1000);
  assert.equal(s.c.state().kind, 'fresh');
  assert.equal(s.c.state().base, true);
  s.clock.advance(5 * MIN);
  assert.deepEqual([s.calls.base, s.calls.flow], [1, 2], 'the overlay again after 5 min on view; the base map never again');
  s.c.setVisible(false);
  s.clock.advance(60 * MIN);
  assert.deepEqual([s.calls.base, s.calls.flow], [1, 2], 'hidden: no timer runs');
  s.c.setVisible(true);
  assert.deepEqual([s.calls.base, s.calls.flow], [1, 3], 'back on view with an old overlay: refreshed at once');
  s.clock.advance(1000);
  s.c.setVisible(false); s.clock.advance(2 * MIN); s.c.setVisible(true);
  assert.equal(s.calls.flow, 3, 'a 2-minute-old overlay is not reloaded on arrival');
  s.clock.advance(3 * MIN);
  assert.equal(s.calls.flow, 4, 'it is due 5 min after the last one');
});

test('FB5-MAP: a failed overlay keeps the last one (stale) and retries on the regular 5 min, never sooner; nothing loaded = failed', () => {
  const ctx = load(FILES);
  const s = controller(ctx, { flow: (n) => n === 1 });
  s.c.setVisible(true); s.clock.advance(1000);
  assert.deepEqual(plain(s.c.state()), { kind: 'fresh', updatedAt: T0, base: true });
  s.clock.advance(5 * MIN);
  assert.equal(s.c.state().kind, 'stale', 'the last overlay stays, marked');
  assert.equal(s.c.state().updatedAt, T0, 'with its time');
  s.clock.advance(4 * MIN);
  assert.equal(s.calls.flow, 2, 'no fast retry');
  const none = controller(ctx, { flow: () => false, base: () => false });
  none.c.setVisible(true); none.clock.advance(1000);
  assert.equal(none.c.state().kind, 'failed');
  none.c.setVisible(false); none.c.setVisible(true);
  assert.equal(none.calls.base, 2, 'a base map that failed is tried again on the next visit');
});

// FB5B-M3 (Codex R3): parked on the map, a failed base layer is retried on the visible cadence until one full round
// succeeds, then kept.
test('FB5B-M3: a failed base map is retried every 5 min while on view until it loads, then never again', () => {
  const ctx = load(FILES);
  const s = controller(ctx, { base: (n) => n >= 3 });
  s.c.setVisible(true); s.clock.advance(1000);
  assert.equal(s.c.state().base, false);
  assert.equal(s.c.state().kind, 'stale', 'an overlay without its base map is not "fresh"');
  s.clock.advance(5 * MIN);
  assert.equal(s.calls.base, 2, 'the second base round on the visible cadence, without leaving the screen');
  s.clock.advance(5 * MIN);
  assert.equal(s.calls.base, 3);
  assert.equal(s.c.state().base, true);
  assert.equal(s.c.state().kind, 'fresh');
  s.clock.advance(30 * MIN);
  assert.equal(s.calls.base, 3, 'kept once it loaded');
});

// FB5B-M4 (Codex R4): a failed overlay keeps its own next-attempt time across leave / return; arrivals honour it.
test('FB5B-M4: during an outage, visits every few seconds cost one overlay round per 5 min', () => {
  const ctx = load(FILES);
  const s = controller(ctx, { flow: () => false });
  for (let i = 0; i < 60; i++) { s.c.setVisible(true); s.clock.advance(5000); s.c.setVisible(false); s.clock.advance(5000); }   // 10 min of visits
  assert.equal(s.calls.flow, 2, 'one round at once and one 5 min later: ' + s.calls.flow);
  const ok = controller(ctx, { flow: (n) => n === 1 || n >= 3 });
  ok.c.setVisible(true); ok.clock.advance(1000);
  ok.clock.advance(5 * MIN);                     // the refresh at +5 min fails
  ok.c.setVisible(false); ok.clock.advance(30000); ok.c.setVisible(true);
  assert.equal(ok.calls.flow, 2, 'a failed refresh 30 s ago: no new round on arrival');
  ok.clock.advance(5 * MIN);
  assert.equal(ok.calls.flow, 3, 'the next one 5 min after the failure');
});

// FB5B-M1: leaving the screen cancels the round in flight; a cancelled round records no failure and releases the layer.
test('FB5B-M1: leaving cancels the rounds in flight; nothing late counts; the next arrival starts afresh', () => {
  const ctx = load(FILES);
  const s = controller(ctx, { base: (n) => (n === 1 ? 'hang' : true), flow: (n) => (n === 1 ? 'hang' : true) });
  s.c.setVisible(true);
  s.c.setVisible(false);
  assert.equal(s.calls.cancelled, 2, 'both rounds stopped');
  assert.equal(s.c.state().kind, 'loading', 'a cancel is not a failure');
  s.c.setVisible(true);
  assert.deepEqual([s.calls.base, s.calls.flow], [2, 2], 'nothing is left busy: both layers start again at once');
  s.clock.advance(1000);
  assert.equal(s.c.state().kind, 'fresh');
});

// FB5B-M5 (CE F4): the overlay on screen ages into "stale" after staleAfterMs when refreshes stop.
test('FB5B-M5: an overlay with no newer one ages into stale after 15 min', () => {
  const ctx = load(FILES);
  const s = controller(ctx);
  s.c.setVisible(true); s.clock.advance(1000); s.c.setVisible(false);
  s.clock.advance(15 * MIN - 2000);
  assert.equal(s.c.state().kind, 'fresh');
  s.clock.advance(2000);
  assert.equal(s.c.state().kind, 'stale', 'older than staleAfterMs');
});

// The worst days for TomTom's free tile budget (docs.tomtom.com/pricing, 2026-10-30: 200,000 raster map tiles and
// 200,000 raster traffic tiles a month, i.e. 6,666 a day each). Tiles per layer: the grid over the card.
function mapDay(ctx, park) {
  const C = ctx.Config, clock = fakeTimers(T0), n = ctx.TrafficMap.grid(C.map, CARD.width, CARD.height).length;
  let base = 0, flow = 0;
  if (park) C.rotation.enabled = false;
  const m = ctx.TrafficMap.createController(C.map, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    loadBase: (done) => { base += n; const id = clock.setTimeout(() => done(true), 500); return () => clock.clearTimeout(id); },
    loadFlow: (stamp, done) => { flow += n; const id = clock.setTimeout(() => done(true), 500); return () => clock.clearTimeout(id); }, onChange() {} });
  const screens = ctx.Screens.create(C.screens.length, C.rotation, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onShow: (i) => m.setVisible(C.screens[i] === 'map') });
  if (park) { screens.step(-1); }                  // ◀ from the main screen: the map, then left on
  clock.advance(24 * 3600e3);
  return { base, flow, perLayer: n };
}

test('FB5-MAP: a day with the rotation and a day parked on the map stay inside the free tile budget (6,666 a day per layer)', () => {
  const rot = mapDay(load(FILES), false), park = mapDay(load(FILES), true);
  assert.ok(rot.flow > 0 && rot.flow <= 6666, 'rotation: ' + JSON.stringify(rot));
  assert.ok(park.flow <= 6666 && park.flow >= 280 * park.perLayer, 'parked: ' + JSON.stringify(park));
  assert.equal(rot.base, rot.perLayer, 'the base map is loaded once a day');
  assert.equal(park.base, park.perLayer);
  console.log('# tile days', JSON.stringify({ rotation: rot, parked: park }));
});

// FB5B-M1: MapView.load through Net.getImage on a fake clock and fake images (no browser): a round finishes exactly
// once — all loaded, the first failure, or the deadline — and cancel() stops it without a callback.
function mapView() {
  const clock = fakeTimers(T0), made = [];
  function Image() { this.src = ''; this.style = {}; made.push(this); }
  const ctx = load(['js/html.js', 'js/net.js', 'js/view-map.js'], { Image, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  return { MapView: ctx.MapView, clock, made };
}
const TILES = (n) => Array.from({ length: n }, (_, i) => ({ url: 'https://t.test/' + i + '.png', left: i * 512, top: 0 }));

test('FB5B-M1: a layer round — an empty tile list fails at once; one tile that never answers fails the round at the deadline', () => {
  const e = mapView(), calls = [];
  e.MapView.loadFlow([], 512, 20000, (ok) => calls.push(ok));
  assert.deepEqual(calls, [false], 'no tiles: a failed round at once, never an endless loading');
  const h = mapView(), c2 = [];
  h.MapView.loadFlow(TILES(12), 512, 20000, (ok) => c2.push(ok));
  for (const img of h.made) if (img.src !== 'https://t.test/3.png') img.onload();
  h.clock.advance(19999);
  assert.deepEqual(c2, [], 'eleven loaded, one pending');
  h.clock.advance(1);
  assert.deepEqual(c2, [false], 'the deadline ends the round');
  assert.equal(h.made[3].src, '', 'the hung download is stopped');
  h.clock.advance(60 * MIN);
  assert.deepEqual(c2, [false], 'exactly once');
});

test('FB5B-M1: a layer round — the first failure ends it and stops the rest; cancel() stops everything and calls nothing', () => {
  const f = mapView(), calls = [];
  f.MapView.loadFlow(TILES(4), 512, 20000, (ok) => calls.push(ok));
  f.made[1].onerror();
  assert.deepEqual(calls, [false]);
  assert.deepEqual(f.made.map((i) => i.src), ['', '', '', ''], 'the failed one and the others are stopped');
  assert.deepEqual(f.clock.pending(), [], 'no deadline left');
  const c = mapView(), c2 = [];
  const cancel = c.MapView.loadFlow(TILES(4), 512, 20000, (ok) => c2.push(ok));
  c.made[0].onload();
  cancel();
  c.clock.advance(60 * MIN);
  assert.deepEqual(c2, [], 'a cancelled round calls nothing');
  assert.deepEqual(c.made.map((i) => i.src), ['https://t.test/0.png', '', '', ''], 'the loaded tile is left alone, the rest stopped');
});

// The owner (2026-10-30): «все экраны должны обновляться на открытии мной» — a ◀ ▶ open of the map starts a new
// overlay round at once (the base map only if it is not in yet); a rotation arrival keeps the 5-min cadence; an open
// while a round is in flight starts nothing.
test('FB5C-OPEN: a ◀ ▶ open of the map starts one overlay round at once; a rotation arrival waits; an open in flight starts nothing', () => {
  const ctx = load(FILES);
  const m = controller(ctx);
  m.c.setVisible(true);
  m.clock.advance(400);
  assert.deepEqual([m.calls.base, m.calls.flow], [1, 1], 'first visit');
  m.c.setVisible(false); m.clock.advance(MIN);
  m.c.setVisible(true);
  assert.equal(m.calls.flow, 1, 'a rotation arrival 1 min later: the 5-min cadence');
  m.c.setVisible(false); m.clock.advance(MIN);
  m.c.setVisible(true, true);
  assert.deepEqual([m.calls.base, m.calls.flow], [1, 2], '◀ ▶ open: one new overlay round, the base map is in');
  m.c.setVisible(false);
  m.c.setVisible(true, true);
  m.c.setVisible(true, true);
  assert.equal(m.calls.flow, 3, 'leaving cancels the round; the next open starts one, a second open while it runs none');
  m.clock.advance(400);
  assert.equal(m.c.state().kind, 'fresh');
});
