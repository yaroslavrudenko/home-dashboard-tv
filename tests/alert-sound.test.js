'use strict';
// Batch 9: the attention sound of a home alert (js/alert-sound.js): once at the start, again every repeatMs while the
// alert is up, maxPlays at most; stop() silences the rest; once() (the preview) plays it a single time; off in the config:
// never. And the bundled sound itself: a short PCM WAV (what Chromium 47 on the 2017 TVs plays).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const T0 = Date.parse('2026-10-30T18:00:00Z');
function make(patch) {
  const ctx = load(['js/config.js', 'js/alert-sound.js']);
  const cfg = Object.assign({}, JSON.parse(JSON.stringify(ctx.Config.alerts.sound)), patch || {});
  const clock = fakeTimers(T0);
  const plays = [];
  const s = ctx.AlertSound.create(cfg, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, play: () => plays.push(clock.now() - T0) });
  return { s, clock, plays, ctx };
}

test('defaults: Config.alerts.sound = { enabled: true, repeatMs: 30000, maxPlays: 5 }', () => {
  const { ctx } = make();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Config.alerts.sound)), { enabled: true, repeatMs: 30000, maxPlays: 5 });
});

test('start(): once at once, then every 30 s while the alert is up — five plays at most', () => {
  const { s, clock, plays } = make();
  s.start();
  assert.deepEqual(plays, [0]);
  clock.advance(30000 - 1);
  assert.equal(plays.length, 1);
  clock.advance(1);
  assert.deepEqual(plays, [0, 30000]);
  clock.advance(10 * 60000);
  assert.deepEqual(plays, [0, 30000, 60000, 90000, 120000], 'five, never a sixth');
  assert.deepEqual(clock.pending(), [], 'no timer left');
});

test('stop(): the alert cleared — no more plays; a new alert starts the count again', () => {
  const { s, clock, plays } = make();
  s.start();
  clock.advance(30000);
  s.stop();
  clock.advance(10 * 60000);
  assert.deepEqual(plays, [0, 30000]);
  s.start();
  clock.advance(10 * 60000);
  assert.equal(plays.length, 2 + 5, 'the next alert: five again');
});

test('once(): the preview plays it a single time; turned off in the config: nothing at all', () => {
  const a = make();
  a.s.once();
  a.clock.advance(10 * 60000);
  assert.deepEqual(a.plays, [0]);
  const off = make({ enabled: false });
  off.s.start();
  off.s.once();
  off.clock.advance(10 * 60000);
  assert.deepEqual(off.plays, []);
});

test('the bundled sound: a mono 16-bit PCM WAV of about 2 s, small, and packaged by build.sh', () => {
  const root = path.join(__dirname, '..');
  const b = fs.readFileSync(path.join(root, 'sounds', 'alert.wav'));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  assert.equal(b.toString('ascii', 12, 16), 'fmt ');
  const fmt = { format: b.readUInt16LE(20), channels: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits: b.readUInt16LE(34) };
  assert.deepEqual(fmt, { format: 1, channels: 1, rate: 22050, bits: 16 });
  assert.equal(b.toString('ascii', 36, 40), 'data');
  const seconds = b.readUInt32LE(40) / (fmt.rate * 2);
  assert.ok(seconds >= 1.5 && seconds <= 2.5, 'about 2 s: ' + seconds);
  assert.ok(b.length < 128 * 1024, 'small: ' + b.length);
  assert.match(fs.readFileSync(path.join(root, 'build.sh'), 'utf8'), /cp -R config\.xml index\.html css js img fonts sounds \.buildResult\//);
});
