'use strict';
// js/onview.js: the on-view refresh gate shared by the Markets screen and the Alerts screen's recent alerts. A source is
// asked only while its screen is on view and the TV shows the page; an explicit open at once; otherwise once
// refreshMs has passed since the last ATTEMPT (FIX-11B A5: a slow round never stretches the cadence); one round at a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const T0 = Date.parse('2026-11-02T09:00:00Z');
const EVERY = 5 * 60000;

function make() {
  const ctx = load(['js/onview.js']);
  const t = fakeTimers(T0), runs = [];
  let visible = true;
  const gate = ctx.OnView.create(EVERY, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, documentVisible: () => visible },
    (done) => { runs.push({ at: t.now() - T0, done }); });
  return { gate, t, runs, end: (i) => runs[i].done(), page: (v) => { visible = v; gate.visibilityChanged(); } };
}

test('A5: a round that takes 15 s does not stretch the cadence: the next one starts refreshMs after the last attempt began', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.t.advance(15000);
  m.end(0);
  assert.deepEqual(m.t.pending(), [EVERY - 15000], 'the next attempt is due 5 min after the first began');
  m.t.advance(EVERY - 15000);
  assert.deepEqual(m.runs.map((r) => r.at), [0, EVERY]);
});

test('A5: a round that ends after refreshMs (a slow source) is followed at once, never sooner than its end', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.t.advance(EVERY + 2000);
  assert.equal(m.runs.length, 1, 'one round at a time');
  m.end(0);
  assert.deepEqual(m.t.pending(), [0]);
  m.t.advance(0);
  assert.equal(m.runs.length, 2);
});

test('hidden screen: nothing, however long; an explicit open at once; a second open in flight: nothing', () => {
  const m = make();
  m.t.advance(60 * 60000);
  assert.equal(m.runs.length, 0);
  m.gate.setVisible(true, true);
  m.gate.setVisible(true, true);
  assert.equal(m.runs.length, 1);
});

test('a rotation arrival within refreshMs waits for it; after refreshMs it asks at once', () => {
  const m = make();
  m.gate.setVisible(true, false);
  m.end(0);
  m.gate.setVisible(false);
  m.t.advance(EVERY / 2);
  m.gate.setVisible(true, false);
  assert.equal(m.runs.length, 1);
  m.t.advance(EVERY / 2);
  assert.equal(m.runs.length, 2, 'asked when the last attempt turned refreshMs old');
});

test('C6: leaving the screen (or the TV hiding the page) during a round leaves no timer behind', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.gate.setVisible(false);
  m.end(0);
  assert.deepEqual(m.t.pending(), [], 'left during the round');
  m.gate.setVisible(true, true);
  m.page(false);
  m.end(1);
  assert.deepEqual(m.t.pending(), [], 'page hidden during the round');
  m.t.advance(60 * 60000);
  assert.equal(m.runs.length, 2);
  m.page(true);
  assert.equal(m.runs.length, 3, 'shown again on view, past the cadence: at once');
});

// Codex A1 / C-2 (batch 16): a clock that went back (NTP, a TV that lost its time) never freezes the cadence: an arrival
// after the jump is due at once, and no wait is ever longer than refreshMs.
test('A1: the clock goes back an hour — a rotation arrival is due at once, never an hour\'s wait', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.end(0);
  m.gate.setVisible(false);
  m.t.advance(-60 * 60000);
  m.gate.setVisible(true, false);
  assert.equal(m.runs.length, 2, 'the attempt "in the future" does not hold it back');
});
test('A1: the clock goes back during a round — the next wait is at most refreshMs', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.t.advance(-60 * 60000);
  m.end(0);
  assert.deepEqual(m.t.pending(), [EVERY], 'capped at refreshMs, never 65 min');
});
test('N1 (b11): a plain leave after a finished round leaves no timer', () => {
  const m = make();
  m.gate.setVisible(true, true);
  m.end(0);
  m.gate.setVisible(false);
  assert.deepEqual(m.t.pending(), []);
});

// N5 (FIX-BATCH-18 part B): a round that hangs until its timeout must end before the next is due — otherwise OnView (and
// every other refresher) starts the next round right after a hung one. Every Config section with both values, found by walking it.
test('N5: in every Config section timeoutMs < refreshMs (a hung round ends before the next one is due)', () => {
  const cfg = load(['js/config.js']).Config, found = [];
  (function walk(o, at) {
    if (!o || typeof o !== 'object') return;
    if ('refreshMs' in o && 'timeoutMs' in o) found.push([at, o.timeoutMs, o.refreshMs]);
    for (const k of Object.keys(o)) walk(o[k], at + '.' + k);
  })(cfg, 'Config');
  assert.ok(found.length >= 6, 'the sections are found: ' + found.map((f) => f[0]).join(', '));
  for (const [at, timeout, refresh] of found) assert.ok(timeout > 0 && timeout < refresh, at + ': timeoutMs ' + timeout + ' < refreshMs ' + refresh);
});

// FIX-19B, the P7 decision (Codex P2 + perf R19-P2). A round that cancels is forgotten by an explicit flag: after a completed
// round, an explicit new round hidden mid-way (TV off) is asked again as soon as the page shows — never 240 s later.
function makeCancel(cancelResult) {
  const ctx = load(['js/onview.js']);
  const t = fakeTimers(T0), runs = [], reasons = [];
  let visible = true;
  const gate = ctx.OnView.create(EVERY, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, documentVisible: () => visible },
    (done) => { runs.push({ at: t.now() - T0, done }); return (reason) => { reasons.push(reason); return cancelResult; }; });
  return { gate, t, runs, reasons, page: (v) => { visible = v; gate.visibilityChanged(); } };
}
test('FIX-19B P7 (Codex): completed round, explicit round hidden mid-way → the page shown again asks at once', () => {
  const m = makeCancel(undefined);
  m.gate.setVisible(true, true); m.runs[0].done();
  m.t.advance(60000);
  m.gate.setVisible(true, true);
  assert.equal(m.runs.length, 2, 'the explicit round');
  m.page(false);
  assert.deepEqual(m.reasons, ['hidden']);
  m.page(true);
  assert.equal(m.runs.length, 3, 'asked again at once (was: waited for the cadence)');
});
// FIX-19B C9 (native L1): a cancelled round whose cancel does nothing and which still ends later changes nothing — neither off
// view (no timer) nor after the screen came back and a new round runs (no timer armed under it, no second round at once).
test('FIX-19B C9: a cancelled round that still calls done() later — no timer, and the new round stays the only one', () => {
  const m = makeCancel(undefined);
  m.gate.setVisible(true, true);
  m.page(false);
  m.runs[0].done();
  assert.deepEqual(m.t.pending(), [], 'off view: no timer');
  m.page(true);
  assert.equal(m.runs.length, 2, 'back: asked again at once');
  m.runs[0].done();
  assert.deepEqual(m.t.pending(), [], 'the old round ending again arms nothing under the new one');
  m.gate.setVisible(true, true);
  assert.equal(m.runs.length, 2, 'the new round is still in flight: no second round');
});
// FIX-19B: a round that declines the leave (it already has answers) ends in the background: no timer off view; back on view
// by the rotation within refreshMs it is not asked again (its result is the one on screen).
test('FIX-19B P7: a round that declines the leave ends in the background — no timer off view, no new round on the return', () => {
  const m = makeCancel(false);
  m.gate.setVisible(true, true);
  m.gate.setVisible(false);
  assert.deepEqual(m.reasons, ['leave']);
  m.runs[0].done();
  assert.deepEqual(m.t.pending(), [], 'no timer off view');
  m.t.advance(60000);
  m.gate.setVisible(true, false);
  assert.equal(m.runs.length, 1, 'the rotation back within refreshMs asks nothing');
});
