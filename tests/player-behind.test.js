'use strict';
// T-2 / C-17 (batch 16): js/player-behind.js — the dashboard keeps «Настин кинозал»'s music playing behind it. Nothing
// happens at load; App owns the page's visibility and calls start() once and visibilityChanged() on every change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers, ROOT } = require('./harness');

function make() {
  const ctx = load(['js/player-behind.js']), t = fakeTimers(0), sent = [];
  let visible = true;
  const p = ctx.PlayerBehind.create({ send: (cmd) => sent.push([t.now(), cmd]), setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible });
  return { ctx, p, t, sent, show: (v) => { visible = v; p.visibilityChanged(); } };
}

test('start: play-behind now and once more RETRY_MS later (a too-early message is ignored by the player)', () => {
  const h = make();
  h.p.start();
  assert.deepEqual(h.sent, [[0, 'play-behind']]);
  h.t.advance(h.ctx.PlayerBehind.RETRY_MS);
  assert.deepEqual(h.sent, [[0, 'play-behind'], [1500, 'play-behind']]);
  h.t.advance(60000);
  assert.equal(h.sent.length, 2, 'never more');
});

test('hidden: stop-behind at once and the pending retry cancelled; shown again: play-behind (and its retry)', () => {
  const h = make();
  h.p.start();
  h.show(false);
  assert.deepEqual(h.t.pending(), [], 'no retry left waiting behind another app');
  h.t.advance(5000);
  assert.deepEqual(h.sent.map((s) => s[1]), ['play-behind', 'stop-behind'], 'the retry never fires after the stop');
  h.show(true);
  h.t.advance(1500);
  assert.deepEqual(h.sent.map((s) => s[1]), ['play-behind', 'stop-behind', 'play-behind', 'play-behind']);
});

// D5 (COMMON-DECISION player-behind 2026-11-05): Back on the dashboard stops the player behind before the dashboard exits.
test('D5: stop() sends stop-behind at once and cancels the pending retry', () => {
  const h = make();
  h.p.start();
  h.p.stop();
  assert.deepEqual(h.sent.map((s) => s[1]), ['play-behind', 'stop-behind']);
  assert.deepEqual(h.t.pending(), [], 'a retry is left waiting after stop()');
  h.t.advance(5000);
  assert.equal(h.sent.length, 2, 'the retry fired after stop()');
});

// D7: the dashboard's life journal (localStorage dashLife) — launch, visible / hidden, every message sent to the player.
test('D7: the App journals launch, visibility and every message sent to the player (dashLife)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(app, /env\.life\('launch/);
  assert.match(app, /env\.life\('send ' \+ cmd\)/);
  assert.match(app, /env\.life\(env\.documentVisible\(\) \? 'visible' : 'hidden'\)/);
});

test('the retry checks the page again: hidden by then (another app came up), nothing is sent', () => {
  const ctx = load(['js/player-behind.js']), t = fakeTimers(0), sent = [];
  let visible = true;
  const p = ctx.PlayerBehind.create({ send: (cmd) => sent.push(cmd), setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, documentVisible: () => visible });
  p.start();
  visible = false;                                   // hidden without the event reaching us yet
  t.advance(1500);
  assert.deepEqual(sent, ['play-behind']);
});

test('the port: no tizen → nothing; the player not running → logged (C-19), never thrown', () => {
  const logs = [];
  const none = load(['js/player-behind.js'], { window: {} });
  none.PlayerBehind.port((m) => logs.push(m))('play-behind');
  assert.deepEqual(logs, []);
  const tizen = { messageport: { requestRemoteMessagePort: () => { throw new Error('NotFoundError'); } } };
  const ctx = load(['js/player-behind.js'], { window: { tizen }, tizen });
  ctx.PlayerBehind.port((m) => logs.push(m))('stop-behind');
  assert.deepEqual(logs, ['player stop-behind: NotFoundError']);
  const msgs = [];
  const ok = { messageport: { requestRemoteMessagePort: (app, port) => ({ sendMessage: (m) => msgs.push([app, port, m]) }) } };
  const c2 = load(['js/player-behind.js'], { window: { tizen: ok }, tizen: ok });
  c2.PlayerBehind.port(() => {})('play-behind');
  assert.deepEqual(JSON.parse(JSON.stringify(msgs)), [['Yr0ttPlay1.OttClubPlayer', 'kinozal.control', [{ key: 'cmd', value: 'play-behind' }]]]);
});

test('C-17: no side effect at load — no listener, no global wiring; the App wires it (start + visibilityChanged)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'player-behind.js'), 'utf8');
  assert.ok(!/addEventListener/.test(src), 'no listener of its own');
  // B17-A-SRC: the App's wiring spans its root (js/app.js) and the wake module that owns the visibility listener (C-1)
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'), wake = fs.readFileSync(path.join(ROOT, 'js', 'app-wake.js'), 'utf8');
  assert.match(app, /player = PlayerBehind\.create\(/);
  assert.match(app, /player\.start\(\)/);
  assert.match(wake, /player\.visibilityChanged\(\)/);
});
