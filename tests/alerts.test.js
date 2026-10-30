'use strict';
// Israel alerts (Pikud HaOref): every shape the feed answers, the area match, and the monitor's promises. The alert
// screen never shows a false all-clear: an alert stays for its instruction's minutes (10 min by default) after the
// last listing and for a grace minute of CONFIRMED absence; a failed or malformed poll never counts as absence and
// never reads as "no alert"; an end message never clears or shortens it (FB4-A7); polls never pile up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/alerts.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const MIN = 60000;
const oref = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'oref', f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const body = (o) => JSON.stringify(o);
const ROCKETS = 'ירי רקטות וטילים', SHELTER10 = 'היכנסו למרחב המוגן ושהו בו 10 דקות';

test('no alert: an empty body, the recorded BOM + CRLF, whitespace and [] all mean "no alert now"', () => {
  const ctx = load(FILES);
  assert.equal(Buffer.from(oref('empty-bom.txt'), 'utf8').length, 5, 'the 5-byte answer recorded live on 2026-10-29');
  for (const b of ['', oref('empty-bom.txt'), '\r\n', '  ', '[]', '﻿[]']) assert.deepEqual(plain(ctx.Alerts.parse(b)), { alerts: [] }, JSON.stringify(b));   // FB5-N4: no `ended` list
});

// FB5-N4: the record carries only what the monitor reads (title, desc, areas); the feed's id is never read.
test('an alert: title, instruction and every area, in the feed\'s order; nothing else is kept', () => {
  const ctx = load(FILES);
  const { alerts } = ctx.Alerts.parse(oref('rehovot.json'));
  assert.equal(alerts.length, 1);
  assert.deepEqual(Object.keys(alerts[0]).sort(), ['areas', 'desc', 'title'], 'FB5-N4');
  assert.equal(alerts[0].title, ROCKETS);
  assert.equal(alerts[0].desc, SHELTER10);
  assert.deepEqual([...alerts[0].areas], ['רחובות', 'נס ציונה', 'ראשון לציון - מזרח']);
  assert.equal(ctx.Alerts.kind(alerts[0].title), 'missiles');
  assert.equal(ctx.Alerts.instruction(alerts[0].desc).minutes, 10);
});

test('a block page, broken JSON or a foreign shape is a failed poll (throws), never "no alert"', () => {
  const ctx = load(FILES);
  for (const b of [oref('block.html'), '{"id":"1","data":', '{"id":"1","title":"x"}', '"text"', '[1]']) {
    assert.throws(() => ctx.Alerts.parse(b), undefined, b.slice(0, 30));
  }
});

// A1: the WHOLE response is validated before any state changes; a bad member is a failed poll, never "no alert".
test('a malformed member fails the whole poll: non-string or empty area, no areas, missing title, wrong desc', () => {
  const ctx = load(FILES);
  const bad = [
    { title: ROCKETS, data: [null] }, { title: ROCKETS, data: [1] }, { title: ROCKETS, data: [''] }, { title: ROCKETS, data: ['  '] },
    { title: ROCKETS, data: ['רחובות', null] }, { title: ROCKETS, data: [] }, { title: ROCKETS, data: null }, { data: ['רחובות'] },
    { title: '', data: ['רחובות'] }, { title: 5, data: ['רחובות'] }, { title: ROCKETS, data: ['רחובות'], desc: 7 }
  ];
  for (const o of bad) assert.throws(() => ctx.Alerts.parse(body(o)), /unexpected shape/, body(o));
  assert.throws(() => ctx.Alerts.parse(body([JSON.parse(oref('rehovot.json').replace(/^﻿/, '')), { title: ROCKETS, data: [null] }])), /unexpected shape/,
    'one bad record among good ones fails the whole answer');
});

// FB5-N4: end messages are dropped by parse() (nothing read them); each expectation below was [alerts, ended] and is now
// the alerts count alone: an end title gives 0, any other wording gives 1.
test('end messages ("the event has ended", "you may leave the protected space") are dropped, never returned as alerts', () => {
  const ctx = load(FILES);
  const r = ctx.Alerts.parse(oref('ended.json'));
  assert.equal(r.alerts.length, 0);
  const leave = ctx.Alerts.parse(body({ id: '9', cat: '13', title: ' ניתן לצאת מהמרחב המוגן ', data: ['רחובות'], desc: '' }));
  assert.equal(leave.alerts.length, 0, 'the exact title, trimmed');
  // FB4-A7: an end is recognised only by an EXACT (trimmed) title; other extra words make the record ACTIVE.
  // FB4-A7b: Oref's real post-event wording "… but stay near it" is one of the exact end titles ([0, 1], as before FB4-A7).
  const near = ctx.Alerts.parse(body({ id: '9', cat: '13', title: 'ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו', data: ['רחובות'], desc: '' }));
  assert.equal(near.alerts.length, 0, 'FB4-A7b: the exact "but stay near it" title is an end');
  const more = ctx.Alerts.parse(body({ id: '9', cat: '13', title: 'ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו עד להודעה חדשה', data: ['רחובות'], desc: '' }));
  assert.equal(more.alerts.length, 1, 'FB4-A7: further extra words are not an exact end title');
  const mixed = ctx.Alerts.parse(body([JSON.parse(oref('rehovot.json').replace(/^﻿/, '')), JSON.parse(oref('ended.json').replace(/^﻿/, ''))]));
  assert.deepEqual(plain(mixed.alerts.map((a) => a.title)), [ROCKETS], 'an active record and an end record in one answer: the active one kept');
  // the category is never read: the recorded active and ended fixtures share cat "1"
  assert.equal(ctx.Alerts.parse(body({ id: '9', cat: '13', title: ROCKETS, data: ['רחובות'] })).alerts.length, 1, 'cat 13 with an alert title is an alert');
});

test('area match: the exact name or a district of it ("X - east"); never another name that starts the same', () => {
  const ctx = load(FILES);
  const c = ctx.Alerts.covers;
  assert.equal(c('רחובות', 'רחובות'), true);
  assert.equal(c(' רחובות ', 'רחובות'), true, 'spaces around');
  assert.equal(c('ראשון לציון - מזרח', 'ראשון לציון'), true, 'a district');
  assert.equal(c('ראשון לציון -מערב', 'ראשון לציון'), true, 'a district without the second space');
  assert.equal(c('רחובותיים', 'רחובות'), false, 'a longer name');
  assert.equal(c('נס ציונה', 'רחובות'), false);
  assert.equal(c('רחובות', 'ראשון לציון'), false);
  assert.equal(c('תל אביב - מרכז העיר', 'תל אביב - יפו'), false);
  assert.equal(c('גן יבנה', 'יבנה'), false, 'Gan Yavne is another town than Yavne');
  assert.equal(c('קריית עקרון', 'עקרון'), false, 'the name inside a longer one');
});

// A4: tests/fixtures/oref/districts_heb.json is a copy of Pikud HaOref's area list (districts_heb.json, as fetched by
// the batch-2 code review on 2026-10-29). It is a TEST fixture only: build.sh never packages tests/.
test('every configured Hebrew area name matches at least one area on Pikud HaOref\'s official list', () => {
  const ctx = load(FILES);
  const official = JSON.parse(oref('districts_heb.json')).map((d) => d.label_he);
  assert.ok(official.length > 1000, 'the full list: ' + official.length);
  for (const p of [...ctx.Config.alerts.areas, ...ctx.Config.alerts.nearby]) {
    assert.ok(official.some((a) => ctx.Alerts.covers(a, p.he)), p.he + ' (' + p.name + ') is not an official area name');
  }
  assert.ok(ctx.Config.alerts.nearby.some((p) => p.he === 'קריית עקרון'), 'Kiryat Ekron spelled as Oref spells it');
});

test('match() names the configured places an alert covers, once each, in config order', () => {
  const ctx = load(FILES);
  const twice = body({ id: '1', title: ROCKETS, data: ['ראשון לציון - מזרח', 'נס ציונה', 'ראשון לציון - מערב', 'אשקלון - דרום'], desc: '' });
  const s = monitor(ctx, () => [null, twice]);
  assert.equal(s.m.state().active, null, 'Rehovot is not listed');
  assert.deepEqual([...s.m.state().nearby.names], ['Нес-Циона', 'Ришон-ле-Цион'], 'config order, Rishon once for two districts');
  const e = monitor(ctx, () => [null, oref('elsewhere.json')]);
  assert.equal(e.m.state().nearby, null, 'Ashkelon is not "nearby"');
});

test('unknown kinds and instructions are not invented: kind null, instruction null', () => {
  const ctx = load(FILES);
  const [a] = ctx.Alerts.parse(oref('unknown-kind.json')).alerts;
  assert.equal(ctx.Alerts.kind(a.title), null);
  assert.equal(ctx.Alerts.instruction(a.desc), null);
  assert.equal(ctx.Alerts.instruction('היכנסו למרחב המוגן').minutes, null, 'the instruction without a duration');
});

// A monitor on fake timers. `feed(t)` answers each poll at time t (ms since T0): [err] or [null, body].
function monitor(ctx, feed, cfgPatch) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const cfg = Object.assign({}, ctx.Config.alerts, cfgPatch || {});
  const m = ctx.Alerts.createMonitor(cfg, {
    getText: function (url, timeoutMs, done) {
      calls.push({ url, timeoutMs, args: arguments.length });
      const a = feed(clock.now() - T0);
      done(a[0], a[1]);
    },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => { changes++; }
  });
  m.poll();
  // the first moment (ms since T0) the alert is gone, polling until `until`
  const goneAt = (until) => { while (clock.now() - T0 < until) { clock.advance(1000); if (!m.state().active) return clock.now() - T0; } return null; };
  return { m, clock, calls, changes: () => changes, goneAt, at: (t) => clock.advance(T0 + t - clock.now()) };
}
const REHOVOT = () => oref('rehovot.json');
const EMPTY = '﻿\r\n';

// A3: a plain GET (no custom header): X-Requested-With forced a CORS preflight the feed never answers.
test('one request per 5 s with a 4 s timeout and NO custom header; the next poll is scheduled only after the answer', () => {
  const ctx = load(FILES);
  const clock = fakeTimers(T0);
  const calls = [];
  const m = ctx.Alerts.createMonitor(ctx.Config.alerts, {
    getText: function (url, ms, done) { calls.push({ url, ms, done, args: [...arguments] }); },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => {} });
  assert.equal(m.poll(), true);
  assert.equal(m.poll(), false, 'one in flight: a second poll sends nothing');
  clock.advance(60000);
  assert.equal(calls.length, 1, 'a slow answer never piles requests up');
  assert.equal(calls[0].url, 'https://www.oref.org.il/WarningMessages/alert/alerts.json');
  assert.equal(calls[0].ms, 4000);
  assert.equal(calls[0].args.length, 3, 'url, timeout, callback — no headers argument at all');
  assert.ok(!/X-Requested-With/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'alerts.js'), 'utf8')), 'the header is gone from the code');
  calls[0].done(null, '');
  assert.deepEqual(clock.pending(), [5000], 'the next poll 5 s after the answer');
  clock.advance(5000);
  assert.equal(calls.length, 2);
});

test('defaults: polls every 5 s, a grace minute of confirmed absence, 10 min hold without an instruction, offline after 3 failures', () => {
  const ctx = load(FILES);
  const a = ctx.Config.alerts;
  assert.deepEqual([a.pollMs, a.timeoutMs, a.graceMs, a.defaultHoldMs, a.failAfter], [5000, 4000, 60000, 10 * MIN, 3]);
});

test('an alert in Rehovot: up at once with its start time; an unchanged alert is not redrawn every poll', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, () => [null, REHOVOT()]);
  const st = s.m.state();
  assert.ok(st.active, 'raised');
  assert.equal(st.active.kind, 'missiles');
  assert.deepEqual([...st.active.names], ['Реховот']);
  assert.equal(st.active.startedAt, T0);
  assert.equal(st.checkedAt, T0, 'the last good answer');
  assert.equal(s.changes(), 1);
  s.at(30000);
  assert.equal(s.m.state().active.startedAt, T0, 'the start time does not move while the alert goes on');
  assert.equal(s.changes(), 1, 'an unchanged alert is not redrawn every poll');
});

// A1 (CE F1): the feed drops the area long before the instruction's 10 minutes are over.
test('A1: still up at +9 min after the last listing of a 10-minute instruction; gone after 10 min of it', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, (t) => [null, t <= 10000 ? REHOVOT() : EMPTY]);   // listed at 0, 5, 10 s
  s.at(10000 + 9 * MIN);
  assert.ok(s.m.state().active, 'up 9 min after the last listing');
  assert.equal(s.goneAt(30 * MIN), 10000 + 10 * MIN, 'the first poll at last listing + 10 min clears it');
});

test('A1: a renewed listing extends the deadline from the new listing', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, (t) => [null, t === 0 || t === 5 * MIN ? REHOVOT() : EMPTY]);
  s.at(14 * MIN);
  assert.ok(s.m.state().active, 'up 9 min after the renewed listing');
  assert.equal(s.m.state().active.startedAt, T0, 'one alert: it started at the first listing');
  assert.equal(s.goneAt(30 * MIN), 15 * MIN);
});

// A1 (Codex #2): grace counts from the first SUCCESSFUL poll without the area; an outage is never absence.
test('A1: an outage then the first empty answer keeps the alert for a full grace minute of confirmed absence', () => {
  const ctx = load(FILES);
  const noMinutes = body({ id: '134062731180000000', title: ROCKETS, data: ['רחובות'], desc: 'היכנסו למרחב המוגן' });
  const feed = (t) => (t === 0 ? [null, noMinutes] : t < 120000 ? ['network'] : t === 130000 ? ['timeout'] : [null, EMPTY]);
  const s = monitor(ctx, feed, { defaultHoldMs: 60000 });                 // hold = grace: only absence decides
  s.at(120000);
  assert.ok(s.m.state().active, 'the first good answer after a 2-minute outage does not clear it');
  assert.equal(s.m.state().offline, false, 'and the connection is back');
  s.at(125000);
  assert.ok(s.m.state().active, 'absence since 120 s, not since the last listing at 0 s');
  assert.equal(s.goneAt(10 * MIN), 135000 + 60000, 'the failed poll at 130 s restarted the count: gone at 135 s + 1 min');
});

// A1 (Codex #1): data:[null] / data:[1] used to parse as "no area listed" and cleared the alert with no marker.
test('A1: data:[null] and data:[1] keep the alert up AND count as failed polls (the offline marker shows)', () => {
  const ctx = load(FILES);
  for (const junk of [body({ title: ROCKETS, data: [null] }), body({ title: ROCKETS, data: [1] })]) {
    const s = monitor(ctx, (t) => [null, t === 0 ? REHOVOT() : junk]);
    s.at(20 * MIN);
    const st = s.m.state();
    assert.ok(st.active, junk + ': still up after 20 min of malformed answers');
    assert.equal(st.offline, true, junk + ': shown as no connection');
    assert.equal(st.checkedAt, T0, 'the last good answer is still the first one');
  }
});

// FB4-A7; CE-N2 renamed from "…, or for ours with any event id, never clears our alert before the hold" (the id era)
test('FB4-A7: an end message, for another area or for ours, never clears our alert before the hold', () => {
  const ctx = load(FILES);
  const elsewhere = body({ id: '134062731180000000', cat: '1', title: 'האירוע הסתיים', data: ['אשקלון - דרום'], desc: '' });
  const stale = body({ id: '134062731170000000', cat: '1', title: 'האירוע הסתיים', data: ['רחובות'], desc: '' });
  for (const end of [elsewhere, stale]) {
    const s = monitor(ctx, (t) => [null, t === 0 ? REHOVOT() : end]);
    s.at(9 * MIN);
    assert.ok(s.m.state().active, 'still up: ' + end.slice(0, 40));
    assert.equal(s.goneAt(30 * MIN), 10 * MIN, 'then the ordinary clear');
  }
});

// FB4-A7 (replaces batch 3's "a verified end message for our area clears the alert at once", which produced the
// negated-wording and unsafe-id regressions): an end message never clears or shortens an alert.
test('FB4-A7: an end message for our area (even a newer event id) does not clear before the hold; the ordinary clear follows', () => {
  const ctx = load(FILES);
  for (const end of [oref('ended.json'), body({ id: '134062731190000000', title: 'ניתן לצאת מהמרחב המוגן', data: ['רחובות'], desc: '' }),
    body({ title: 'האירוע הסתיים', data: ['רחובות'], desc: '' })]) {
    const s = monitor(ctx, (t) => [null, t < 10000 ? REHOVOT() : end]);   // listed at 0 and 5 s
    s.at(10000);
    assert.ok(s.m.state().active, 'not cleared on the end message: ' + end.slice(0, 50));
    s.at(5000 + 9 * MIN);
    assert.ok(s.m.state().active, 'still up 9 min after the last listing');
    assert.equal(s.goneAt(30 * MIN), 5000 + 10 * MIN, 'gone only by the ordinary rule');
  }
});

test('FB4-A7: negated or extended end wording ("you may NOT leave the protected space") is an ACTIVE alert', () => {
  const ctx = load(FILES);
  const negated = body({ id: '101', cat: '1', title: 'לא ניתן לצאת מהמרחב המוגן', data: ['רחובות'], desc: '' });
  assert.equal(ctx.Alerts.parse(negated).alerts.length, 1);   // FB5-N4: was [alerts, ended] = [1, 0]
  const s = monitor(ctx, (t) => [null, t < 5000 ? REHOVOT() : t <= 10000 ? negated : EMPTY]);
  s.at(10000);
  assert.ok(s.m.state().active, 'the negated message keeps the alert');
  assert.equal(s.goneAt(30 * MIN), 10000 + 10 * MIN, 'and renews it like any listing (10-min default hold)');
  const alone = monitor(ctx, () => [null, negated]);
  assert.ok(alone.m.state().active, 'on its own it raises the alert');
  const extended = monitor(ctx, () => [null, body({ id: '7', title: 'האירוע הסתיים באזורים מסוימים', data: ['רחובות'], desc: '' })]);
  assert.ok(extended.m.state().active, 'an end title with extra words raises the alert (when unsure, alert)');
});

test('FB4-A7: an end-only answer raises nothing, for our area or a nearby one', () => {
  const ctx = load(FILES);
  const nearEnd = body({ id: '5', title: 'האירוע הסתיים', data: ['נס ציונה'], desc: '' });
  for (const end of [oref('ended.json'), nearEnd]) {
    const s = monitor(ctx, () => [null, end]);
    s.at(3 * MIN);
    assert.deepEqual(plain(s.m.state()), { active: null, nearby: null, offline: false, checkedAt: T0 + 3 * MIN }, end.slice(0, 50));
  }
});

test('FB4-A7: unsafe numeric ids and opaque ids have no effect on the alert\'s lifetime', () => {
  const ctx = load(FILES);
  // 9007199254740993 and 9007199254740992 round to the same double; the raw JSON numbers are kept as written.
  const big = '{"id": 9007199254740993, "cat": "1", "title": "' + ROCKETS + '", "data": ["רחובות"], "desc": ""}';
  const bigEnd = '{"id": 9007199254740992, "cat": "1", "title": "האירוע הסתיים", "data": ["רחובות"], "desc": ""}';
  const s = monitor(ctx, (t) => [null, t === 0 ? big : bigEnd]);
  s.at(9 * MIN);
  assert.ok(s.m.state().active, 'unsafe numeric ids: up at +9 min');
  assert.equal(s.goneAt(30 * MIN), 10 * MIN, 'unsafe numeric ids: the ordinary clear');
  const opaque = body({ id: 'opaque-new-event', cat: '1', title: ROCKETS, data: ['רחובות'], desc: '' });
  const end100 = body({ id: '100', cat: '1', title: 'האירוע הסתיים', data: ['רחובות'], desc: '' });
  const o = monitor(ctx, (t) => [null, t === 0 ? body({ id: '100', cat: '1', title: ROCKETS, data: ['רחובות'], desc: '' }) : t === 5000 ? opaque : end100]);
  o.at(9 * MIN);
  assert.ok(o.m.state().active, 'opaque id then an end for the old id: up at +9 min');
  assert.equal(o.goneAt(30 * MIN), 5000 + 10 * MIN, 'opaque id: the ordinary clear from the last listing');
});

// FB4-A7b pin: the real "you may leave but stay near it" message alone never raises an alert (no false red alert).
test('FB4-A7b: an end-only answer "you may leave the protected space but stay near it" for our area raises nothing', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, () => [null, body({ id: '134062731190000000', cat: '13', title: ' ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו ', data: ['רחובות'], desc: '' })]);
  s.at(3 * MIN);
  assert.deepEqual(plain(s.m.state()), { active: null, nearby: null, offline: false, checkedAt: T0 + 3 * MIN });
});

// FB4-A8 (Codex #3): one answer listing our area twice; the hold is the MAXIMUM over every matching record.
test('FB4-A8: two records for Rehovot (1 min and 10 min) in either order: still up at +9 min, gone at +10 min', () => {
  const ctx = load(FILES);
  const one = { id: '100', cat: '1', title: ROCKETS, data: ['רחובות'], desc: 'היכנסו למרחב המוגן ושהו בו 1 דקות' };
  const ten = { id: '200', cat: '1', title: ROCKETS, data: ['רחובות'], desc: SHELTER10 };
  for (const pair of [[one, ten], [ten, one]]) {
    const s = monitor(ctx, (t) => [null, t === 0 ? body(pair) : EMPTY]);
    // FB4-A8 (frontend review F1): the words come from the record that sets the hold, so the screen never says
    // "1 min" while the alert stays 10 min
    assert.equal(s.m.state().active.instruction.minutes, 10, 'the 10-min instruction is shown, order ' + pair.map((r) => r.id).join(','));
    s.at(9 * MIN);
    assert.ok(s.m.state().active, 'up at +9 min, order ' + pair.map((r) => r.id).join(','));
    assert.equal(s.m.state().active.instruction.minutes, 10, 'still the 10-min words at +9 min');
    assert.equal(s.goneAt(30 * MIN), 10 * MIN, 'gone at +10 min');
  }
  // equal holds: the words stay with the first record (FB4-A8, tie rule)
  const aircraft = { id: '300', cat: '2', title: 'חדירת כלי טיס עוין', data: ['רחובות'], desc: SHELTER10 };
  const tie = monitor(ctx, () => [null, body([ten, aircraft])]);
  assert.equal(tie.m.state().active.kind, 'missiles', 'a tie keeps the first record');
});

test('A1: an active record and an end record for our area in one answer: the alert stays', () => {
  const ctx = load(FILES);
  const both = body([JSON.parse(oref('ended.json').replace(/^﻿/, '')), JSON.parse(REHOVOT().replace(/^﻿/, ''))]);
  const s = monitor(ctx, () => [null, both]);
  s.at(3 * MIN);
  assert.ok(s.m.state().active, 'the listing wins');
  const newer = body({ id: '134062731190000000', cat: '1', title: ROCKETS, data: ['רחובות'], desc: SHELTER10 });
  const t = monitor(ctx, (x) => [null, x === 0 ? REHOVOT() : x === 5000 ? newer : oref('ended.json')]);
  t.at(10000);
  assert.ok(t.m.state().active, 'an end for the older event never clears a newer one');
});

test('an ongoing alert whose text or areas change keeps its start time', () => {
  const ctx = load(FILES);
  const changed = body({ id: '2', cat: '1', title: ROCKETS, data: ['רחובות', 'גדרה'], desc: 'היכנסו למרחב המוגן ושהו בו 15 דקות' });
  const s = monitor(ctx, (t) => [null, t === 0 ? REHOVOT() : changed]);
  s.at(5000);
  const st = s.m.state();
  assert.equal(st.active.instruction.minutes, 15, 'the new instruction is shown');
  assert.equal(st.active.startedAt, T0, 'but the alert still started when it first appeared');
  assert.equal(s.changes(), 2, 'redrawn for the new text');
});

test('a failed or unreadable poll never clears a raised alert, even long after the hold', () => {
  const ctx = load(FILES);
  let i = 0;
  const s = monitor(ctx, (t) => (t === 0 ? [null, REHOVOT()] : i++ % 2 ? ['timeout'] : [null, oref('block.html')]));
  s.at(40 * MIN);
  const st = s.m.state();
  assert.ok(st.active, 'still up after 40 min of failures');
  assert.equal(st.offline, true, 'and the lost connection is shown');
});

test('feed failure: no "all clear" — the offline marker after 3 failed polls in a row, gone on the next good answer', () => {
  const ctx = load(FILES);
  const q = [['http 403'], ['network'], [null, oref('block.html')], [null, '']];
  const s = monitor(ctx, () => q.shift() || [null, '']);
  assert.equal(s.m.state().offline, false, 'one failure is not shown (a single timeout must not flicker)');
  s.at(5000);
  assert.equal(s.m.state().offline, false);
  s.at(10000);
  assert.equal(s.m.state().offline, true, 'third failure in a row');
  assert.equal(s.m.state().active, null);
  assert.equal(s.m.state().checkedAt, 0, 'never a good answer yet');
  assert.equal(s.changes(), 1, 'drawn once when the marker appears');
  s.at(15000);
  assert.equal(s.m.state().offline, false, 'a good answer removes it');
  assert.equal(s.changes(), 2);
});

test('an alert elsewhere raises nothing; nearby areas give the quiet notice only, and only without our own alert', () => {
  const ctx = load(FILES);
  const q = [oref('elsewhere.json'), oref('nearby.json'), REHOVOT()];
  const s = monitor(ctx, () => [null, q.shift() || REHOVOT()]);
  assert.deepEqual(plain(s.m.state()), { active: null, nearby: null, offline: false, checkedAt: T0 }, 'Ashkelon: nothing');
  s.at(5000);
  const st = s.m.state();
  assert.equal(st.active, null);
  assert.deepEqual([...st.nearby.names], ['Нес-Циона', 'Ришон-ле-Цион']);
  s.at(10000);
  assert.ok(s.m.state().active, 'our own alert');
  assert.equal(s.m.state().nearby, null, 'the quiet notice gives way to the alert');
});

test('stop() wins over a poll in flight: its late answer changes nothing and schedules nothing', () => {
  const ctx = load(FILES);
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const m = ctx.Alerts.createMonitor(ctx.Config.alerts, {
    getText: (url, ms, done) => calls.push(done), now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onChange: () => { changes++; } });
  m.poll();
  m.stop();
  calls[0](null, REHOVOT());
  assert.equal(m.state().active, null);
  assert.equal(changes, 0);
  assert.deepEqual(clock.pending(), []);
});
