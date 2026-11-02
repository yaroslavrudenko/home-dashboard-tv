'use strict';
// Screen switching: ◀ ▶ step through the screens (wrapping), the rotation every 45 s, paused 2 min after any key,
// held while an alert is up, and off when the config says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const T0 = Date.parse('2026-10-29T18:34:00Z');
function make(cfgPatch) {
  const ctx = load(['js/config.js', 'js/screens.js']);
  const cfg = Object.assign({}, JSON.parse(JSON.stringify(ctx.Config.rotation)), cfgPatch || {});
  const clock = fakeTimers(T0);
  const shown = [], autos = [];
  const s = ctx.Screens.create(3, cfg, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onShow: (i, from, dir, auto) => { shown.push([i, from, dir]); autos.push(auto); } });
  return { s, clock, shown, autos, ctx };
}

// FB5-WX / FB5-MAP: the Israel weather is the second screen, the traffic map the fifth. Batch 11 (M1): the Markets screen
// comes right after the news; everything after it moves on by one.
test('defaults: seven screens (main, israel, news, markets, traffic, map, alerts), rotation on, every 45 s, paused 2 min after a key', () => {
  const { ctx } = make();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.screens)), ['main', 'israel', 'news', 'markets', 'traffic', 'map', 'alerts']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.rotation)), { enabled: true, intervalMs: 45000, dwellMs: { markets: 90000 }, pauseAfterKeyMs: 120000,
    afterAlertMs: 120000 });
});

test('◀ ▶ step through the screens and wrap around in both directions', () => {
  const { s, shown } = make();
  s.step(1); s.step(1); s.step(1); s.step(-1);
  assert.deepEqual(shown, [[1, 0, 1], [2, 1, 1], [0, 2, 1], [2, 0, -1]]);
  assert.equal(s.current(), 2);
});

test('rotation: the next screen every 45 s, wrapping', () => {
  const { s, clock, shown } = make();
  clock.advance(45000 - 1);
  assert.equal(shown.length, 0);
  clock.advance(1);
  clock.advance(90000);
  assert.deepEqual(shown.map((x) => x[0]), [1, 2, 0]);
  assert.ok(shown.every((x) => x[2] === 1));
});

test('any key pauses the rotation for 2 min; then it carries on every 45 s', () => {
  const { s, clock, shown } = make();
  clock.advance(30000);
  s.touch();                                       // e.g. OK or a colour key
  clock.advance(120000 - 1);
  assert.equal(shown.length, 0, 'nothing moves for two minutes after the key');
  clock.advance(1);
  assert.equal(shown.length, 1);
  clock.advance(45000);
  assert.equal(shown.length, 2);
  s.step(1);                                       // an arrow both switches and pauses
  const n = shown.length;
  clock.advance(119999);
  assert.equal(shown.length, n);
});

test('held while an alert is up: no rotation at all; it resumes 2 min after the release', () => {
  const { s, clock, shown } = make();
  assert.equal(s.hold(true), true, 'the hold starts: the caller is told (an alert just came up)');
  assert.equal(s.hold(true), false, 'already held: nothing starts');
  clock.advance(10 * 60000);
  assert.equal(shown.length, 0);
  assert.equal(s.rotating(), false);
  assert.equal(s.hold(false), true);
  assert.equal(s.hold(false), false);
  clock.advance(120000 - 1);
  assert.equal(shown.length, 0, 'nothing moves for two minutes after the alert clears');
  clock.advance(1);
  assert.equal(shown.length, 1);
  clock.advance(45000);
  assert.equal(shown.length, 2, 'then every 45 s');
});

// Batch 9: a home alert opens the Alerts screen; open(i) shows a given screen as the remote would (auto false).
test('open(i): shows that screen (as the remote would: auto false) and says so; the screen already on view: nothing', () => {
  const { s, shown, autos } = make();
  assert.equal(s.open(2), true);
  assert.deepEqual([shown, autos], [[[2, 0, 1]], [false]]);
  assert.equal(s.current(), 2);
  assert.equal(s.open(2), false, 'already on view');
  assert.equal(shown.length, 1);
});

test('rotation can be turned off in the config: only the remote switches', () => {
  const { s, clock, shown } = make({ enabled: false });
  clock.advance(60 * 60000);
  assert.equal(shown.length, 0);
  assert.equal(s.rotating(), false);
  s.step(1);
  assert.equal(shown.length, 1);
});

// Batch 11, the owner (2026-11-02): «для рынков сделай 90 секунд» — the rotation keeps the Markets screen 90 s
// (Config.rotation.dwellMs.markets); every other screen keeps intervalMs (45 s). The real screen list and config.
function makeReal(cfgPatch) {
  const ctx = load(['js/config.js', 'js/screens.js']);
  const cfg = Object.assign({}, JSON.parse(JSON.stringify(ctx.Config.rotation)), cfgPatch || {});
  const ids = JSON.parse(JSON.stringify(ctx.Config.screens));
  const clock = fakeTimers(T0);
  const arrivals = [];
  const s = ctx.Screens.create(ids.length, cfg, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    idOf: (i) => ids[i], onShow: (i) => { arrivals.push([ids[i], clock.now() - T0]); } });
  return { s, clock, arrivals, ids };
}

test('Batch 11: the rotation keeps the Markets screen 90 s; the next screen comes 90 s after it arrived; every other screen 45 s', () => {
  const { clock, arrivals, ids } = makeReal();
  clock.advance(6 * 60000 + 1000);                 // one whole cycle: six screens × 45 s + Markets 90 s = 6 min
  assert.deepEqual(arrivals, [['israel', 45000], ['news', 90000], ['markets', 135000], ['traffic', 225000], ['map', 270000],
    ['alerts', 315000], ['main', 360000]]);
  assert.equal(ids.length * 45000 + 45000, 360000, 'the full cycle is 6 min');
});

test('Batch 11: a screen without its own dwell falls back to intervalMs; a dwell given for another screen applies there instead', () => {
  const { clock, arrivals } = makeReal({ dwellMs: { israel: 10000 } });
  clock.advance(45000 + 10000 + 45000);
  assert.deepEqual(arrivals, [['israel', 45000], ['news', 55000], ['markets', 100000]]);
  const none = makeReal({ dwellMs: undefined });
  none.clock.advance(4 * 45000);
  assert.deepEqual(none.arrivals.map((a) => a[1]), [45000, 90000, 135000, 180000], 'no dwellMs at all: 45 s everywhere');
});

test('Batch 11: the key pause, the after-alert pause and ◀ ▶ are unchanged on the Markets screen', () => {
  const { s, clock, arrivals } = makeReal();
  s.step(1); s.step(1); s.step(1);                // ◀ ▶ to the Markets screen
  assert.deepEqual(arrivals.map((a) => a[0]), ['israel', 'news', 'markets']);
  clock.advance(120000 - 1);
  assert.equal(arrivals.length, 3, 'paused 2 min after the key, as before');
  clock.advance(1);
  assert.deepEqual(arrivals[3], ['traffic', 120000]);
  const held = makeReal();
  held.clock.advance(135000);                      // the rotation brought the Markets screen
  held.s.hold(true);
  held.clock.advance(10 * 60000);
  assert.equal(held.arrivals.length, 3, 'held while the alert is up');
  held.s.hold(false);
  held.clock.advance(120000 - 1);
  assert.equal(held.arrivals.length, 3);
  held.clock.advance(1);
  assert.equal(held.arrivals[3][0], 'traffic', 'afterAlertMs (2 min) after the release, as before');
});

// FIX-11B A8 [X7+C5]: open() gives the destination its own dwell; a ◀ ▶ step pauses with the destination's dwell in view
// (show first, then the pause); the 2-min key and after-alert pauses are unchanged.
test('A8: open(markets) keeps the Markets screen its 90 s (the old screen\'s timer never moves it on early)', () => {
  const { s, clock, arrivals, ids } = makeReal();
  s.open(ids.indexOf('markets'));
  clock.advance(90000 - 1);
  assert.deepEqual(arrivals.map((a) => a[0]), ['markets'], 'still on the Markets screen after 45 s');
  clock.advance(1);
  assert.deepEqual(arrivals[1], ['traffic', 90000]);
});

test('A8: a ◀ ▶ step pauses with the destination in view: a dwell longer than the key pause is kept', () => {
  const { s, clock, arrivals } = makeReal({ dwellMs: { markets: 200000 } });
  s.step(1); s.step(1); s.step(1);
  clock.advance(200000 - 1);
  assert.deepEqual(arrivals.map((a) => a[0]), ['israel', 'news', 'markets'], 'the Markets dwell (200 s here) outlasts the 2-min pause');
  clock.advance(1);
  assert.deepEqual(arrivals[3], ['traffic', 200000]);
});

// FIX-11B P8: every rotation visit to the Markets screen refreshes it: its cadence is shorter than the rotation's cycle.
test('P8: Config.markets.refreshMs is shorter than one whole rotation cycle (Σ dwell): each rotation visit refreshes', () => {
  const ctx = load(['js/config.js']), r = ctx.Config.rotation;
  const cycle = ctx.Config.screens.reduce((sum, id) => sum + (r.dwellMs && typeof r.dwellMs[id] === 'number' ? r.dwellMs[id] : r.intervalMs), 0);
  assert.equal(cycle, 6 * 60000);
  assert.ok(ctx.Config.markets.refreshMs < cycle, ctx.Config.markets.refreshMs + ' < ' + cycle);
});
