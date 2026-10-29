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
  const shown = [];
  const s = ctx.Screens.create(3, cfg, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onShow: (i, from, dir) => shown.push([i, from, dir]) });
  return { s, clock, shown, ctx };
}

test('defaults: three screens (main, news, traffic), rotation on, every 45 s, paused 2 min after a key', () => {
  const { ctx } = make();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.screens)), ['main', 'news', 'traffic']);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.rotation)), { enabled: true, intervalMs: 45000, pauseAfterKeyMs: 120000 });
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

test('held while an alert is up: no rotation at all; it resumes when released', () => {
  const { s, clock, shown } = make();
  s.hold(true);
  clock.advance(10 * 60000);
  assert.equal(shown.length, 0);
  assert.equal(s.rotating(), false);
  s.hold(false);
  clock.advance(45000);
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
