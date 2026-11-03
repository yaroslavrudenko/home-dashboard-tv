// Batch 17 (A0): characterisation pins written against app.js BEFORE it was split into modules (DESIGN-17 §7.1). They
// freeze what the composition does — the requests a scripted session asks, the wake matrix, what one minute tick
// rewrites, the listeners and timers — so the split (and anything after it) can be proven to change none of it.
// The golden is tests/fixtures/app17-trace.json, recorded on 64c0203 (decision B17-TRACE). Counts, never timestamps:
// the harness clock is real time plus an offset. RECORD=1 rewrites the golden (only on the pre-split tree).
// FIX-17B 13: the alerts are counted (the poll interval raised so only the boot, wakes and starts poll), an alert start and
// clear, one scripted rotation cycle, the live timeouts after boot, the minute tick on all 8 screens — re-recorded on 64c0203.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, ROOT } from './page.mjs';

const GOLDEN = path.join(ROOT, 'tests', 'fixtures', 'app17-trace.json');
const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
const recorded = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const barrier = (p) => p.evaluate(() => fetch('/__barrier').then(() => 0, () => 0));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, DOWN = 40;
const KEY = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; c.alerts.pollMs = 30 * 60000; };
const ALERT = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'oref', 'rehovot.json'), 'utf8');
let alertOn = false;
const ALL = { weather: 'ok', air: 'ok', hebcal: 'ok', news: 'ok', alerts: () => ({ status: 200, body: alertOn ? ALERT : '\ufeff\r\n' }), history: 'history.json', markets: 'ok', traffic: 'ok', map: 'ok', configure: KEY };
// Every listener and timer the page makes, counted from before the first script runs; the minute tick kept so a test
// can run it at will (it is the function named «tick»: the clock's, before and after the split).
const COUNT = `(function () {
  window.__listeners = {}; window.__intervals = 0; window.__live = {}; window.__tick = null; window.__plays = 0;
  var add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type) {
    var who = this === window ? 'window' : this === document ? 'document' : 'element';
    if (who !== 'element') window.__listeners[who + ':' + type] = (window.__listeners[who + ':' + type] || 0) + 1;
    return add.apply(this, arguments);
  };
  var st = window.setTimeout, ct = window.clearTimeout, si = window.setInterval;
  window.setTimeout = function (f, ms) {
    if (f && f.name === 'tick') window.__tick = f;
    var id = st(function () { delete window.__live[id]; f(); }, ms); window.__live[id] = ms; return id;
  };
  window.clearTimeout = function (id) { delete window.__live[id]; return ct(id); };
  window.setInterval = function () { window.__intervals++; return si.apply(window, arguments); };
  // every sound reaching the speakers (the alert's ring) is counted
  var connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (t) { if (t instanceof AudioDestinationNode) window.__plays++; return connect.apply(this, arguments); };
})();`;
const counts = (app) => {
  const out = { weather: app.weatherRequests.length };
  for (const k of ['air', 'hebcal', 'news', 'markets', 'traffic', 'map', 'history', 'alerts']) out[k] = app.requests[k].filter((r) => r.method === 'GET').length;
  return out;
};
const diff = (a, b) => { const out = {}; for (const k of Object.keys(b)) out[k] = b[k] - (a[k] || 0); return out; };
function pin(name, value) {
  recorded[name] = value;
  if (process.env.RECORD) return;
  assert.ok(name in golden, 'no golden for ' + name + ' (record it on the pre-split tree with RECORD=1)');
  assert.deepEqual(value, golden[name], name);
}
async function settle(p) { await barrier(p); await wait(900); await barrier(p); }

test.after(() => {
  if (process.env.RECORD) fs.writeFileSync(GOLDEN, JSON.stringify(Object.assign({}, golden, recorded), null, 1) + '\n');
});

// FIX-17C 13: C2 runs with the rotation ON (an interval of an hour: no arrival during the test, so the counts are the same
// as with it off) and a distinctive ring interval, so «the rotation is held / released» and «the sound rings / stopped»
// are read off the live timers: the rotation's own timer (ROTATE_MS) and the ring's repeat (SOUND_REPEAT_MS).
const ROTATE_MS = 3600137, SOUND_REPEAT_MS = 5432;
// an expression the page evaluates (a string: it may use no test-side name)
const STATE = `({ overlay: !!document.querySelector('.alert.is-on'), banner: !!document.querySelector('.banner.is-on'), plays: window.__plays,
  ringing: Object.keys(window.__live).some((id) => window.__live[id] === ${SOUND_REPEAT_MS}),
  rotating: Object.keys(window.__live).some((id) => window.__live[id] === ${ROTATE_MS}) })`;
test('T17-C2: a scripted session (boot, ◀ ▶ through every screen, a language switch, a wake, an alert start, its absence and its end) asks the frozen request counts per source and phase; the end clears the alert, stops the sound and releases the rotation', async () => {
  alertOn = false;
  // configure runs in the page: it may use no test-side name
  const app = await openApp(Object.assign({ init: COUNT }, ALL, { configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.alerts.pollMs = 30 * 60000;
    c.rotation.enabled = true; c.rotation.intervalMs = 3600137; c.rotation.dwellMs = {}; c.alerts.sound.repeatMs = 5432; } }));
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    await settle(p);
    const boot = counts(app);
    for (let i = 0; i < 8; i++) { await press(p, RIGHT); await settle(p); }
    const walk = counts(app);
    await press(p, DOWN); await wait(900); await settle(p);
    const lang = counts(app);
    await p.evaluate(() => { window.__offsetMs = 16 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const woke = counts(app);
    // an alert at home starts (the next poll: a wake a minute later): the Alerts screen opens itself once, it rings, and the
    // rotation is held
    alertOn = true;
    await p.evaluate(() => { window.__offsetMs += 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const started = counts(app), screen = await p.evaluate(() => [...document.querySelectorAll('.screen')].findIndex((e) => e.classList.contains('is-active')));
    const up = await p.evaluate(STATE);
    assert.deepEqual([up.overlay, up.ringing, up.rotating], [true, true, false], 'the alert is up, rings, and holds the rotation: ' + JSON.stringify(up));
    // FIX-17C 13: the feed drops it. A minute later it is still held (its instruction: 10 minutes, js/alerts.js holdMs; and the
    // feed must answer without it for graceMs) — said, not mistaken for its end
    alertOn = false;
    await p.evaluate(() => { window.__offsetMs += 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const absent = counts(app);
    assert.equal((await p.evaluate(STATE)).overlay, true, 'a minute after the feed dropped it the alert is still held');
    // ten minutes on (past its 10-minute hold and the confirmed absence): it clears — the alert gone, the sound stopped, the
    // rotation released
    await p.evaluate(() => { window.__offsetMs += 10 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const cleared = counts(app);
    const end = await p.evaluate(STATE);
    assert.deepEqual([end.overlay, end.banner, end.ringing, end.rotating], [false, false, false, true], 'cleared: ' + JSON.stringify(end));
    const plays = end.plays;
    await wait(SOUND_REPEAT_MS + 600);                 // past the next ring the sound would have made
    assert.equal(await p.evaluate(() => window.__plays), plays, 'no ring after the alert cleared');
    pin('session', { boot, walk: diff(boot, walk), lang: diff(walk, lang), wake: diff(lang, woke), alertStart: diff(woke, started), alertAbsent: diff(started, absent), alertEnd: diff(absent, cleared), alertScreen: screen });
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('T17-C1: wake — a minute after boot nothing refreshes; three hours later each source refreshes per the frozen matrix (the weather, the air and the news; the calendar keeps its longer cadence)', async () => {
  const app = await openApp(Object.assign({ init: COUNT }, ALL));
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    await settle(p);
    const a = counts(app);
    await p.evaluate(() => { window.__offsetMs = 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const b = counts(app);
    await p.evaluate(() => { window.__offsetMs = 3 * 3600000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    const c = counts(app);
    pin('wake', { recent: diff(a, b), old: diff(b, c) });
  } finally { await app.close(); }
});

test('T17-C3: a minute tick rewrites only the screen on view, on all 8 screens (traffic: its header\'s age, P17-2 kept on purpose): DOM mutations per screen root', async () => {
  const app = await openApp(Object.assign({ init: COUNT }, ALL));
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    await settle(p);
    const out = {};
    for (const [steps, on] of [[0, 'main'], [1, 'israel'], [1, 'news'], [1, 'markets'], [1, 'shabbat'], [1, 'traffic'], [1, 'map'], [1, 'alerts']]) {
      for (let i = 0; i < steps; i++) { await press(p, RIGHT); await settle(p); }
      out[on] = await p.evaluate(async () => {
        const ids = [...document.querySelectorAll('.screen')].map((s) => s.id), seen = {};
        const obs = ids.map((id) => { seen[id] = 0; const o = new MutationObserver((m) => { seen[id] += m.length; }); o.observe(document.getElementById(id), { childList: true, subtree: true, characterData: true, attributes: true }); return o; });
        window.__offsetMs += 60000;                  // the next minute: the clocks move
        window.__tick();
        await new Promise((r) => setTimeout(r, 50));
        obs.forEach((o) => o.disconnect());
        const touched = {};
        for (const id of ids) touched[id] = seen[id] > 0;
        return touched;
      });
    }
    pin('tick', out);
  } finally { await app.close(); }
});

test('T17-C4: after boot the listeners, the interval and the live timeouts are the frozen ones; a full walk adds no listener or interval', async () => {
  const app = await openApp(Object.assign({ init: COUNT }, ALL));
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    await settle(p);
    const read = () => p.evaluate(() => ({ listeners: window.__listeners, intervals: window.__intervals }));
    const boot = await read();
    pin('liveTimeouts', await p.evaluate(() => Object.keys(window.__live).length));
    for (let i = 0; i < 8; i++) { await press(p, RIGHT); await settle(p); }
    assert.deepEqual(await read(), boot, 'a full walk adds no listener and no interval');
    pin('listeners', boot);
  } finally { await app.close(); }
});

// FIX-17B 13: one rotation cycle (a short interval: 8 arrivals, no key pressed) asks the frozen counts — an arrival refreshes
// only what its gate allows (the markets, traffic, the map and the recent alerts on view), never the weather or the news.
test('T17-C5: one scripted rotation cycle asks the frozen request counts per source', async () => {
  alertOn = false;
  // configure runs in the page: it may use no test-side name
  const app = await openApp(Object.assign({ init: COUNT }, ALL, { configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.alerts.pollMs = 30 * 60000; c.rotation.intervalMs = 900; c.rotation.dwellMs = {}; } }));
  try {
    const p = app.page;
    await p.waitForSelector('#dots .dot', { timeout: 10000 });
    const at = () => p.evaluate(() => [...document.querySelectorAll('#dots .dot')].findIndex((d) => d.className === 'dot is-on'));
    // FIX-19C: the baseline is taken once the boot round is in — every source has asked its frozen boot count (golden
    // session.boot) — never right after the dots appear: on a slow run the boot requests landed after it (1/1/1/2/1 «rotation»)
    const bootIn = () => Object.keys(golden.session.boot).every((k) => counts(app)[k] >= golden.session.boot[k]);
    for (const end = Date.now() + 15000; !bootIn();) { assert.ok(Date.now() < end, 'the boot round never came in: ' + JSON.stringify(counts(app))); await wait(25); }
    const boot = counts(app);
    let seen = 0;
    for (const end = Date.now() + 20000; Date.now() < end;) { const i = await at(); if (i === 7) seen = 1; if (seen && i === 0) break; await wait(50); }
    assert.equal(seen, 1, 'the rotation reached the last screen');
    await settle(p);
    pin('rotation', diff(boot, counts(app)));
  } finally { await app.close(); }
});

// FIX-BATCH-18 part B (batch-17 note): the banner's own transition, not only its end state — with an alert held, a screen
// other than Alerts shows the red banner (visible), and the alert's end takes it down (hidden). Its own session, so the
// frozen counts of T17-C2 are untouched (NC-2).
test('T17-C2b: the banner — visible on another screen while the alert is held, hidden when it ends', async () => {
  alertOn = false;
  const app = await openApp(Object.assign({ init: COUNT }, ALL, { configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; c.alerts.pollMs = 30 * 60000; } }));   // configure runs in the page: no test-side name
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    await settle(p);
    alertOn = true;
    await p.evaluate(() => { window.__offsetMs = 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    assert.deepEqual(await p.evaluate(`[${STATE}.overlay, ${STATE}.banner]`), [true, false], 'the Alerts screen opened itself: the overlay, no banner over it');
    await press(p, RIGHT); await settle(p);
    assert.equal(await p.evaluate(`${STATE}.banner`), true, 'another screen while the alert is held: the banner is visible');
    alertOn = false;
    await p.evaluate(() => { window.__offsetMs += 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    assert.equal(await p.evaluate(`${STATE}.banner`), true, 'a minute after the feed dropped it: still held, still visible');
    await p.evaluate(() => { window.__offsetMs += 10 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await settle(p);
    assert.deepEqual(await p.evaluate(`[${STATE}.overlay, ${STATE}.banner]`), [false, false], 'the alert ended: the banner hidden');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// FIX-18B 6 (Codex P2): the table App.start actually hands to AppNav — captured at the call — maps every configured screen id
// to that screen's own draw from the renderers (WeatherRender's main/israel, FeedRender's others); a mis-paired id fails.
const CAPTURE = `(function () {
  window.__made = {};
  ['WeatherRender', 'FeedRender', 'AppNav'].forEach(function (name) {
    var held;
    Object.defineProperty(window, name, { configurable: true, get: function () { return held; }, set: function (v) {
      var create = v.create;
      v.create = function (a, b) { var out = create.apply(this, arguments); window.__made[name] = name === 'AppNav' ? b.render : out; return out; };
      held = v; } });
  });
})();`;
test('FIX-18B 6: the render table App.start passes to AppNav — every configured id → its own screen\'s draw', async () => {
  const app = await openApp(Object.assign({}, ALL, { init: CAPTURE }));
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day', { timeout: 10000 });
    const r = await p.evaluate(() => {
      const m = window.__made, t = m.AppNav, ids = Config.screens;
      return { ids: ids.slice(), keys: Object.keys(t).sort(),
        wrong: ids.filter((id) => typeof t[id] !== 'function' || t[id] !== (id === 'main' || id === 'israel' ? m.WeatherRender[id] : m.FeedRender[id])) };
    });
    assert.deepEqual(r.keys, [...r.ids].sort(), 'exactly the configured ids');
    assert.deepEqual(r.wrong, [], 'every id drawn by its own screen\'s function');
  } finally { await app.close(); }
});
