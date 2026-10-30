'use strict';
// Batch 8 (B1): the recent Pikud HaOref alerts in Israel for the Alerts screen (alerts-history.oref.org.il, recorded
// 2026-10-30), and the alert preview (A2) that shows the overlay on a sample record without touching the real alerts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/alerts.js', 'js/alerts-history.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const plain = (v) => JSON.parse(JSON.stringify(v));
const recorded = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'oref', 'history.json'), 'utf8'));
const rec = (o) => Object.assign({ data: 'רחובות', date: '29.10.2026', time: '20:01:12', alertDate: '2026-10-29T20:01:00', category: 1,
  category_desc: 'ירי רקטות וטילים', matrix_id: 1, rid: 1 }, o);

test('B1: the recorded answer: end messages dropped, one event per moment and title, newest first, kind from the title', () => {
  const ctx = load(FILES);
  assert.deepEqual(plain(ctx.AlertsHistory.parse(recorded(), 8)), [
    { date: '19.10.2026', time: '19:38', title: 'חדירת מחבלים', kind: 'infiltration', areas: ['אביתר'] },
    { date: '10.10.2026', time: '19:57', title: 'חדירת כלי טיס עוין', kind: 'aircraft', areas: ['ערב אל עראמשה'] }
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
  const c = ctx.AlertsHistory.createController(ctx.Config.alerts.history, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: () => { changes++; },
    getJson: (url, ms, done) => { calls.push(url); pending = done; } });
  const reply = (err, body) => { const d = pending; pending = null; d(err, body); };
  return { ctx, t, c, calls, reply, hide: () => { visible = false; c.visibilityChanged(); }, show: () => { visible = true; c.visibilityChanged(); }, changes: () => changes };
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
  const h = controller(), every = h.ctx.Config.alerts.history.refreshMs;
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
