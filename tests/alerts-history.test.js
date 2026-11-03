'use strict';
// Batch 8 (B1): the recent Pikud HaOref alerts in Israel for the Alerts screen (alerts-history.oref.org.il, recorded
// 2026-10-30), and the alert preview (A2) that shows the overlay on a sample record without touching the real alerts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/alerts.js', 'js/onview.js', 'js/alerts-history.js', 'js/screens.js'];   // FIX-11B A4: the gate is js/onview.js
// The history's config as js/app.js gives it (PERF-2, the owner's «б»): its cadence is the rotation cycle (Screens.cycleMs).
const historyCfg = (ctx) => Object.assign({}, ctx.Config.alerts.history, { refreshMs: ctx.Screens.cycleMs(ctx.Config.screens, ctx.Config.rotation) });
const T0 = Date.parse('2026-10-29T18:34:00Z');
const plain = (v) => JSON.parse(JSON.stringify(v));
const recorded = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'oref', 'history.json'), 'utf8'));
const rec = (o) => Object.assign({ data: 'רחובות', date: '29.10.2026', time: '20:01:12', alertDate: '2026-10-29T20:01:00', category: 1,
  category_desc: 'ירי רקטות וטילים', matrix_id: 1, rid: 1 }, o);

test('B1: the recorded answer: end messages dropped, one event per moment and title, newest first, kind from the title', () => {
  const ctx = load(FILES);
  assert.deepEqual(plain(ctx.AlertsHistory.parse(recorded(), 8)), [
    { date: '19.10.2026', time: '19:38', title: 'חדירת מחבלים', kind: 'infiltration', areas: ['אביתר'], places: [{ area: 'אביתר', place: null }] },
    { date: '10.10.2026', time: '19:57', title: 'חדירת כלי טיס עוין', kind: 'aircraft', areas: ['ערב אל עראמשה'], places: [{ area: 'ערב אל עראמשה', place: null }] }
  ]);
  assert.deepEqual(plain(ctx.AlertsHistory.parse([], 8)), [], 'a quiet week: no event');
});

test('B1: many area records of one siren are one event (areas in the feed order, each once); the list is cut at `max`', () => {
  const ctx = load(FILES);
  const list = [rec({ data: 'רחובות' }), rec({ data: 'נס ציונה' }), rec({ data: 'רחובות' }),
    rec({ data: 'יבנה', alertDate: '2026-10-29T19:40:00', time: '19:40:05' }), rec({ data: 'גדרה', alertDate: '2026-10-29T19:00:00', time: '19:00:10' })];
  const out = plain(ctx.AlertsHistory.parse(list, 2));
  assert.deepEqual(out.map((e) => [e.time, e.areas]), [['20:01', ['רחובות', 'נס ציונה']], ['19:40', ['יבנה']]]);
  // the feed's order is not trusted: newest first by alertDate
  assert.deepEqual(plain(ctx.AlertsHistory.parse(list.slice().reverse(), 3)).map((e) => e.time), ['20:01', '19:40', '19:00']);
});

test('B1: a foreign shape (a block page object, a record without area / date / title) throws: the round failed, never "no alerts"', () => {
  const ctx = load(FILES);
  for (const bad of [{}, '<html>', [{ data: '', alertDate: '2026-10-29T20:01:00', category_desc: 'x' }], [rec({ alertDate: 'x' })], [rec({ category_desc: 7 })], [null]]) {
    assert.throws(() => ctx.AlertsHistory.parse(bad, 8), /history/, JSON.stringify(bad));
  }
});

// The controller: only while the Alerts screen is on view and the TV shows the page; an explicit open (◀ ▶ or a
// language change) asks at once, a rotation arrival only when refreshMs has passed; one request at a time.
function controller(answer) {
  const ctx = load(FILES), t = fakeTimers(T0), calls = [];
  let pending = null, visible = true, changes = 0;
  const c = ctx.AlertsHistory.createController(historyCfg(ctx), { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: () => { changes++; }, places: ctx.Cities.list,
    getJson: (url, ms, done) => { calls.push(url); pending = done; } });
  const reply = (err, body) => { const d = pending; pending = null; d(err, body); };
  return { ctx, t, c, calls, reply, busy: () => pending !== null, hide: () => { visible = false; c.visibilityChanged(); }, show: () => { visible = true; c.visibilityChanged(); }, changes: () => changes };
}

test('B1: hidden screen: no request at all; an explicit open asks once; a second open while in flight asks nothing', () => {
  const h = controller();
  h.t.advance(60 * 60000);
  assert.equal(h.calls.length, 0, 'never while not on view');
  h.c.setVisible(true, true);
  h.c.setVisible(true, true);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0], /^https:\/\/alerts-history\.oref\.org\.il\/Shared\/Ajax\/GetAlarmsHistory\.aspx\?lang=he&mode=2$/);
  assert.equal(h.c.state().kind, 'loading');
  h.reply(null, recorded());
  const s = h.c.state();
  assert.deepEqual([s.kind, s.updatedAt, s.events.length], ['fresh', h.t.now(), 2]);
});

test('B1: on view it refreshes every refreshMs; leaving the screen or the TV hiding the page stops it; a rotation arrival waits for the cadence', () => {
  const h = controller(), every = historyCfg(h.ctx).refreshMs;
  h.c.setVisible(true, false);
  h.reply(null, recorded());
  h.t.advance(every);
  assert.equal(h.calls.length, 2, 'one more after refreshMs');
  h.reply(null, recorded());
  h.c.setVisible(false);
  h.t.advance(every / 2);
  h.c.setVisible(true, false);
  assert.equal(h.calls.length, 2, 'a rotation arrival before the cadence: nothing');
  h.c.setVisible(false);
  h.t.advance(10 * every);
  assert.equal(h.calls.length, 2, 'off view: nothing');
  h.c.setVisible(true, false);
  assert.equal(h.calls.length, 3, 'a rotation arrival after the cadence: at once');
  h.reply(null, recorded());
  h.hide();
  h.t.advance(10 * every);
  assert.equal(h.calls.length, 3, 'TV hid the page: nothing');
  h.show();
  assert.equal(h.calls.length, 4, 'shown again after the cadence: at once');
});

test('B1: a failed or malformed round keeps the last list and turns it stale; without a list it is "failed"', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.reply('http 503');
  assert.deepEqual([h.c.state().kind, h.c.state().events.length], ['failed', 0]);
  h.c.setVisible(true, true);
  h.reply(null, recorded());
  h.c.setVisible(true, true);
  h.reply(null, { not: 'a list' });
  const s = h.c.state();
  assert.deepEqual([s.kind, s.events.length, s.updatedAt], ['stale', 2, T0]);
  assert.ok(h.changes() >= 3);
});

// A2: the preview never touches the monitor's state and always loses to a real alert.
const SAMPLE_NOW = T0;
test('A2: the preview state: the sample Rehovot alert with preview: true over a quiet state; the input is never changed', () => {
  const ctx = load(FILES);
  const quiet = { active: null, nearby: null, around: null, offline: false, checkedAt: T0 };
  const before = JSON.stringify(quiet);
  const v = ctx.Alerts.preview(quiet, ctx.Config.alerts, SAMPLE_NOW);
  assert.equal(JSON.stringify(quiet), before, 'the monitor state object is not mutated');
  assert.notEqual(v, quiet);
  assert.equal(v.preview, true);
  assert.deepEqual([v.active.title, v.active.kind, v.active.instruction.minutes, v.active.places[0].ru, v.active.startedAt],
    ['ירי רקטות וטילים', 'missiles', 10, 'Реховот', SAMPLE_NOW]);
});

test('A2: a real alert always wins over the preview: the real state comes back unchanged, no preview flag', () => {
  const ctx = load(FILES);
  const real = { active: { title: 'חדירת מחבלים', desc: '', kind: 'infiltration', instruction: null, places: [], ids: 'רחובות', startedAt: 1 }, nearby: null, offline: false, checkedAt: T0 };
  const before = JSON.stringify(real);
  const v = ctx.Alerts.preview(real, ctx.Config.alerts, SAMPLE_NOW);
  assert.equal(v, real, 'the real state itself');
  assert.equal(JSON.stringify(real), before);
  assert.equal(v.preview, undefined);
});

// FIX-11B A4 [C4+P11] (EN-6): the recent alerts and the markets share ONE on-view gate, js/onview.js — no second copy.
test('A4: the recent alerts are asked through the shared on-view gate (OnView.create with refreshMs), not a copy of it', () => {
  const ctx = load(FILES), t = fakeTimers(T0), made = [];
  const create = ctx.OnView.create;
  ctx.OnView.create = function (refreshMs) { made.push(refreshMs); return create.apply(this, arguments); };
  ctx.AlertsHistory.createController(historyCfg(ctx), { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    getJson: () => {}, onChange: () => {} });
  assert.deepEqual(made, [historyCfg(ctx).refreshMs]);
  assert.ok(!/lastAttemptAt/.test(require('node:fs').readFileSync(require('node:path').join(require('./harness').ROOT, 'js', 'alerts-history.js'), 'utf8')), 'no gate of its own left');
});

// ---- Batch 16 ---------------------------------------------------------------------------------------------------------
// PERF-2 (the owner's «б», 2026-11-02): the 7-day list (mode=2 kept) is downloaded at most once per rotation cycle — its
// cadence IS the cycle, derived from the rotation config (SSOT), never a literal of its own.
test('PERF-2: the history cadence is the rotation cycle (405 s: seven screens × 45 s + Markets 90 s), longer than the feed\'s 2-min cache', () => {
  const ctx = load(FILES), c = ctx.Config;
  assert.equal(c.alerts.history.refreshMs, undefined, 'no cadence of its own in config.js');
  assert.equal(ctx.Screens.cycleMs(c.screens, c.rotation), 405000);
  assert.equal(historyCfg(ctx).refreshMs, c.screens.reduce((ms, id) => ms + (c.rotation.dwellMs[id] || c.rotation.intervalMs), 0));
  assert.ok(historyCfg(ctx).refreshMs >= 2 * 60000);
  assert.match(fs.readFileSync(path.join(require('./harness').ROOT, 'js', 'app.js'), 'utf8'),
    /AlertsHistory\.createController\(copyWith\(Config\.alerts\.history, \{ refreshMs: Screens\.cycleMs\(Config\.screens, Config\.rotation\) \}\)/, 'the App gives it the cycle');
});
test('PERF-2: parked on the Alerts screen, one download per cycle (213 a day), not one per 2 minutes (720)', () => {
  const h = controller();
  h.c.setVisible(true, true);
  while (h.t.now() < T0 + 86400000) { if (h.busy()) h.reply(null, recorded()); h.t.advance(60000); }
  assert.equal(h.calls.length, Math.ceil(86400 / 405), 'a day parked on the screen: 214 (one every 405 s), never 720');
});

// PERF-1: the areas of an event are de-duplicated with a seen-map (one lookup per record, never a scan of the list) — the
// same output, and a 10× event no longer costs 100× (the quadratic indexOf).
function bigEvent(n) {
  const out = [];
  for (let j = 0; j < n; j++) out.push(rec({ data: 'אזור ' + (j % (n / 2)), rid: j }));   // every area twice
  return out;
}
test('PERF-1: each area once, in the feed order, whatever the duplicates', () => {
  const ctx = load(FILES);
  const e = ctx.AlertsHistory.parse(bigEvent(2000), 7)[0];
  assert.equal(e.areas.length, 1000);
  assert.equal(new Set(e.areas).size, 1000, 'each area once');
  assert.deepEqual(plain(e.areas.slice(0, 3)), ['אזור 0', 'אזור 1', 'אזור 2'], 'the feed order');
});
// F-4 (FIX-16B): the cost pinned by an operation count, never by wall-clock time: every array scan (indexOf) during a parse
// is counted by the elements it walks. Per record only the three end messages are scanned (Alerts.isEnd); the
// de-duplication scans nothing, so the count is linear (the old indexOf walked ~n²/2: 2,000 records, ~1,000,000 elements).
test('PERF-1: the parse walks a constant per record — 3 elements (the end messages), whatever the number of areas', () => {
  const ctx = load(FILES), proto = Object.getPrototypeOf(ctx.AlertsHistory.parse([], 7)), real = proto.indexOf;   // the app's own realm
  let walked = 0;
  proto.indexOf = function (x) { walked += this.length; return real.apply(this, arguments); };
  try {
    for (const n of [2000, 20000]) { walked = 0; ctx.AlertsHistory.parse(bigEvent(n), 7); assert.equal(walked, 3 * n, n + ' records'); }
  } finally { proto.indexOf = real; }
});

// C-7 / L13: the history names its areas at parse time from the city catalogue: a catalogue city in the interface language
// (once, however many of its districts are listed), an area no city covers as the feed writes it.
test('C-7 / L13: places at parse time — a catalogue city once (its districts folded), an unknown area kept as written', () => {
  const ctx = load(FILES), placeOf = ctx.Alerts.placeLookup(ctx.Cities.list);
  const list = [rec({ data: 'תל אביב - מרכז העיר' }), rec({ data: 'תל אביב - יפו' }), rec({ data: 'רחובות' }), rec({ data: 'אביתר' })];
  const e = plain(ctx.AlertsHistory.parse(list, 7, placeOf))[0];
  assert.deepEqual(e.places.map((p) => [p.area, p.place && p.place.id]), [['תל אביב - מרכז העיר', 'tlv'], ['רחובות', 'rehovot'], ['אביתר', null]]);
  assert.deepEqual(e.areas.length, 4, 'the feed\'s own list is kept whole');
  // the index agrees with Alerts.coversPlace on every catalogue name and its districts, and never matches a mere prefix
  for (const c of ctx.Cities.list) for (const m of c.match || [c.he]) {
    assert.equal(placeOf(m), c, m);
    assert.equal(placeOf(m + ' - צפון'), c, m + ' district');
  }
  assert.equal(placeOf('רחובותיים'), null, 'a different name that starts with the same letters');
});

// C-2 (the one freshness rule): the list from the future (a clock that went back) is never fresh.
test('C-2: a clock that went back makes the recent list stale, not fresh', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.reply(null, recorded());
  assert.equal(h.c.state().kind, 'fresh');
  h.t.advance(-60 * 60000);
  assert.equal(h.c.state().kind, 'stale', 'the list is dated an hour ahead of the clock');
});

// FIX-BATCH-19 3 (P7): leaving the Alerts screen during the recent-alerts request aborts it; its late answer draws nothing.
test('B19 P7: leave during the history request → aborted, no late render; back → asked again at once', () => {
  const ctx = load(FILES), t = fakeTimers(Date.parse('2026-10-29T18:30:00Z')), calls = [];
  let changes = 0;
  const c = ctx.AlertsHistory.createController(historyCfg(ctx), { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => { changes++; }, getJson: (url, ms, done) => { const x = { done, aborted: false, abort() { this.aborted = true; } }; calls.push(x); return x; } });
  c.setVisible(true, true);
  c.setVisible(false);
  assert.deepEqual(calls.map((x) => x.aborted), [true], 'left: the request aborted');
  calls[0].done(null, []);
  assert.deepEqual([changes, c.state().kind], [0, 'loading'], 'its late answer draws nothing');
  c.setVisible(true, false);
  assert.equal(calls.length, 2, 'the aborted attempt is forgotten: asked again at once');
});
