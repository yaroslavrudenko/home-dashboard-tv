'use strict';
// Batch 12 (S3, the performance reviewer's F-1): past the back-off list a failing source waits at most cfg.retryMaxMs
// when it is set (the once-a-day calendar: an hour), else cfg.refreshMs as before (weather, news, air: unchanged).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

// Six failed hops in a row; returns every wait the cycle scheduled (random() = 1: each wait is its ceiling).
function waitsAfterFailures(cfg) {
  const ctx = load(['js/refresher.js']), t = fakeTimers(0), waits = [];
  const c = ctx.Refresher.create(cfg, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 1 },
    (finish) => finish(() => true), () => { waits.push(t.pending()[0]); });
  c.refresh();
  for (let i = 0; i < 5; i++) t.advance(waits[i]);
  return waits;
}
const MIN = 60000, DAY = 24 * 60 * MIN;

test('S3: with retryMaxMs, six failed hops never wait longer than it (the daily calendar retries hourly)', () => {
  const waits = waitsAfterFailures({ refreshMs: DAY, retryMs: [MIN, 2 * MIN, 4 * MIN, 8 * MIN], retryFloorMs: 30000, retryMaxMs: 60 * MIN });
  assert.deepEqual(waits, [MIN, 2 * MIN, 4 * MIN, 8 * MIN, 60 * MIN, 60 * MIN]);
});

test('S3: without retryMaxMs nothing changes — past the list the regular period (weather, news, air)', () => {
  assert.deepEqual(waitsAfterFailures({ refreshMs: 15 * MIN, retryMs: [MIN, 2 * MIN, 4 * MIN, 8 * MIN], retryFloorMs: 30000 }),
    [MIN, 2 * MIN, 4 * MIN, 8 * MIN, 15 * MIN, 15 * MIN]);
  assert.deepEqual(waitsAfterFailures({ refreshMs: 10 * MIN, retryMs: [MIN, 20 * MIN], retryFloorMs: 30000, retryMaxMs: 60 * MIN }),
    [MIN, 10 * MIN, 10 * MIN, 10 * MIN, 10 * MIN, 10 * MIN], 'a ceiling is still capped by the regular period');
});
