'use strict';
// One simulated day of TomTom requests from the app's real code (config, refresher, traffic, screens) on a fake clock:
// how many batch requests and billable items (one per route or road) a day costs. Used by the quota test
// (tests/build-config.test.js) and by measurement scripts.
//   trafficDay({ rotation (default true), park (true: the owner pressed ▶ to traffic and left the rotation off),
//                answer(n, now) → 'ok' | an error label ('timeout', 'http 503', 'http 429', …) | a batch answer,
//                random (default () => 0: the shortest waits, the worst case), hours (24) })
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const OK = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tomtom', 'batch.json'), 'utf8'));

function trafficDay(opts) {
  const ctx = load(['js/config.js', 'js/refresher.js', 'js/traffic.js', 'js/screens.js']);
  const C = ctx.Config;
  C.traffic.key = 'SIMULATION1';
  if (opts.rotation === false || opts.park) C.rotation.enabled = false;
  const clock = fakeTimers(0);
  const deps = { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  let batches = 0, items = 0;
  const traffic = ctx.Traffic.createStore(C.traffic, Object.assign({}, deps, { random: opts.random || (() => 0), onChange() {},
    postJson(url, body, timeoutMs, done) {
      batches++;
      items += body.batchItems.length;
      const a = opts.answer ? opts.answer(batches, clock.now()) : 'ok';
      clock.setTimeout(() => (a === 'ok' ? done(null, JSON.parse(JSON.stringify(OK))) : typeof a === 'string' ? done(a) : done(null, a)), 400);
    } }));
  // the app's own wiring (js/app.js showScreen): the screen tells traffic whether it is on view and how it got there
  const screens = ctx.Screens.create(C.screens.length, C.rotation, Object.assign({}, deps, {
    onShow(i, from, dir, auto) { traffic.setVisible(C.screens[i] === 'traffic', auto); } }));
  traffic.refresh();
  if (opts.park) { clock.advance(1000); screens.step(1); screens.step(1); }
  clock.advance((opts.hours || 24) * 3600e3);
  return { batches, items, legs: C.traffic.routes.length + C.traffic.roads.length };
}

module.exports = { trafficDay };
