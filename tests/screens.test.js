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

// FB5-WX / FB5-MAP: the Israel weather is the second screen, the traffic map the fifth.
test('defaults: six screens (main, israel, news, traffic, map, alerts), rotation on, every 45 s, paused 2 min after a key', () => {
  const { ctx } = make();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.screens)), ['main', 'israel', 'news', 'traffic', 'map', 'alerts']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.rotation)), { enabled: true, intervalMs: 45000, pauseAfterKeyMs: 120000, afterAlertMs: 120000 });
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
