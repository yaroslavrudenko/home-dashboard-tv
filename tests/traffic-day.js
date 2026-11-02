'use strict';
// Simulated days of Mapbox Directions requests from the app's real code (config, tz, traffic, screens) on a fake clock:
// how many rounds and billable requests (one per route) they cost, on which UTC date and at what Israel time each round
// was sent. Used by the quota test (tests/build-config.test.js) and by measurement scripts.
//   trafficDays({ rotation (default true), park (true: the owner pressed ▶ to traffic and left the rotation off),
//                 visits (ms: ◀ ▶ away and back every `visits` ms, the rotation off), answer(n, now) → 'ok' | an error
//                 label ('timeout', 'http 503', 'http 429', …) for every request of the round, restart (true: the app restarts after every
//                 answer, keeping localStorage), days (1), hours (instead of days), start (ms; default 2026-10-01 00:00 in
//                 Israel), storage (default: an in-memory localStorage), configure(Config) })
//   → { batches (rounds), items (requests), hidden (rounds sent while another screen was on view), legs, minutes: [Israel
//       minute of day of every round], hours: [Israel hour of every round], perUtcDate: { 'YYYY-MM-DD': requests },
//       perHomeDate: { 'YYYY-MM-DD': requests }, cap }
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const OK = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mapbox', 'routes.json'), 'utf8'));
const OCT_1_IL = Date.parse('2026-09-30T21:00:00Z');   // 2026-10-01 00:00 in Israel (summer time, UTC+3)

function memoryStorage() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}

function trafficDays(opts) {
  const ctx = load(['js/config.js', 'js/tz.js', 'js/ledger.js', 'js/traffic.js', 'js/screens.js']);
  const C = ctx.Config;
  C.traffic.token = 'pk.SIMULATION1';
  if (opts.configure) opts.configure(C);
  if (opts.rotation === false || opts.park || opts.visits) C.rotation.enabled = false;
  const clock = fakeTimers(opts.start || OCT_1_IL);
  const israel = ctx.Tz.resolve({ zones: ['Asia/Jerusalem'], rule: 'IL' }, clock.now());
  const wall = (ms) => ctx.Tz.wallTime(israel, ms);
  const deps = { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout };
  const storage = opts.storage || memoryStorage();
  let batches = 0, items = 0, hidden = 0, onTraffic = false, traffic = null;
  const minutes = [], hours = [], perUtcDate = {}, perHomeDate = {};
  const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  const legs = C.traffic.routes.length;
  function boot() {
    let inRound = 0, answer = 'ok';
    traffic = ctx.Traffic.createStore(C.traffic, Object.assign({}, deps, { wall, storage, onChange() {},
      getJson(url, timeoutMs, done) {
        const t = clock.now(), w = wall(t), i = inRound;
        if (i === 0) {                                 // the first request of a round: the ten start together
          batches++;
          if (!onTraffic) hidden++;
          minutes.push(w.hours * 60 + w.minutes);
          hours.push(w.hours);
          answer = opts.answer ? opts.answer(batches, t) : 'ok';
        }
        inRound = (inRound + 1) % legs;
        items++;
        add(perUtcDate, new Date(t).toISOString().slice(0, 10), 1);
        add(perHomeDate, w.year + '-' + String(w.month + 1).padStart(2, '0') + '-' + String(w.day).padStart(2, '0'), 1);
        const a = answer;
        clock.setTimeout(() => {
          if (a === 'ok') done(null, JSON.parse(JSON.stringify(OK[i]))); else done(a);
          if (opts.restart && i === legs - 1) { traffic.stop(); boot(); if (onTraffic) traffic.setVisible(true); }
        }, 400 + i);
      } }));
  }
  boot();
  // the app's own wiring (js/app.js showScreen): the screen tells traffic whether it is on view, and whether the
  // remote opened it (◀ ▶) or the rotation did
  const screens = ctx.Screens.create(C.screens.length, C.rotation, Object.assign({}, deps, {
    idOf: (i) => C.screens[i],                   // Codex T1: the app's own dwell per screen (Markets 90 s), as js/app.js wires it
    onShow(i, from, dir, auto) { onTraffic = C.screens[i] === 'traffic'; traffic.setVisible(onTraffic, !auto); } }));
  const toTraffic = () => { for (let i = C.screens.indexOf('traffic'); i > 0; i--) screens.step(1); };
  if (opts.park || opts.visits) { clock.advance(1000); toTraffic(); }
  const span = opts.hours ? opts.hours * 3600e3 : (opts.days || 1) * 24 * 3600e3;
  if (opts.visits) {
    const end = clock.now() + span;
    while (clock.now() < end) { clock.advance(opts.visits / 2); screens.step(1); clock.advance(opts.visits / 2); screens.step(-1); }
  } else clock.advance(span);
  return { batches, items, hidden, legs, minutes, hours, perUtcDate, perHomeDate, cap: C.traffic.schedule.dailyRequestCap };
}

module.exports = { trafficDays, memoryStorage, OCT_1_IL };
