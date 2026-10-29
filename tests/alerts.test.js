'use strict';
// Israel alerts (Pikud HaOref): every shape the feed answers, the area match, and the monitor's promises — the
// alert stays until the feed stops listing the area plus one minute, a failed poll never clears it or reads as
// "no alert", and polls never pile up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/alerts.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const oref = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'oref', f), 'utf8');

test('no alert: an empty body, the recorded BOM + CRLF, whitespace and [] all mean "no alert now"', () => {
  const ctx = load(FILES);
  assert.equal(Buffer.from(oref('empty-bom.txt'), 'utf8').length, 5, 'the 5-byte answer recorded live on 2026-10-29');
  for (const body of ['', oref('empty-bom.txt'), '\r\n', '  ', '[]', '﻿[]']) assert.deepEqual([...ctx.Alerts.parse(body)], [], JSON.stringify(body));
});

test('an alert: title, instruction and every area, in the feed\'s order', () => {
  const ctx = load(FILES);
  const list = ctx.Alerts.parse(oref('rehovot.json'));
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'ירי רקטות וטילים');
  assert.equal(list[0].desc, 'היכנסו למרחב המוגן ושהו בו 10 דקות');
  assert.deepEqual([...list[0].areas], ['רחובות', 'נס ציונה', 'ראשון לציון - מזרח']);
  assert.equal(ctx.Alerts.kind(list[0].title), 'missiles');
  assert.equal(ctx.Alerts.instruction(list[0].desc).minutes, 10);
});

test('a block page, broken JSON or a foreign shape is a failed poll (throws), never "no alert"', () => {
  const ctx = load(FILES);
  for (const body of [oref('block.html'), '{"id":"1","data":', '{"id":"1","title":"x"}', '"text"', '[1]']) {
    assert.throws(() => ctx.Alerts.parse(body), undefined, body.slice(0, 30));
  }
});

test('"the event has ended" lists the areas but is an all-clear, not an alert', () => {
  const ctx = load(FILES);
  assert.deepEqual([...ctx.Alerts.parse(oref('ended.json'))], []);
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

test('match() names the configured places an alert covers, once each, in config order', () => {
  const ctx = load(FILES);
  const alerts = ctx.Alerts.parse(oref('nearby.json'));
  assert.equal(ctx.Alerts.match(alerts, ctx.Config.alerts.areas), null, 'Rehovot is not listed');
  const near = ctx.Alerts.match(alerts, ctx.Config.alerts.nearby);
  assert.deepEqual([...near.names], ['Нес-Циона', 'Ришон-ле-Цион']);
  assert.equal(ctx.Alerts.match(ctx.Alerts.parse(oref('elsewhere.json')), ctx.Config.alerts.nearby), null, 'Ashkelon is not "nearby"');
});

test('unknown kinds and instructions are not invented: kind null, instruction null', () => {
  const ctx = load(FILES);
  const [a] = ctx.Alerts.parse(oref('unknown-kind.json'));
  assert.equal(ctx.Alerts.kind(a.title), null);
  assert.equal(ctx.Alerts.instruction(a.desc), null);
  assert.equal(ctx.Alerts.instruction('היכנסו למרחב המוגן').minutes, null, 'the instruction without a duration');
});

// A monitor on fake timers; `answers` is the queue of (err, body) the feed gives, in order.
function monitor(ctx, answers) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const m = ctx.Alerts.createMonitor(ctx.Config.alerts, {
    getText: (url, timeoutMs, done, headers) => {
      calls.push({ url, timeoutMs, headers });
      const a = answers.length ? answers.shift() : [null, ''];
      done(a[0], a[1]);
    },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => { changes++; }
  });
  return { m, clock, calls, changes: () => changes };
}

test('one request per 5 s with a 4 s timeout and X-Requested-With; the next poll is scheduled only after the answer', () => {
  const ctx = load(FILES);
  const clock = fakeTimers(T0);
  const calls = [];
  const m = ctx.Alerts.createMonitor(ctx.Config.alerts, {
    getText: (url, ms, done, headers) => calls.push({ url, ms, done, headers }),
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => {} });
  assert.equal(m.poll(), true);
  assert.equal(m.poll(), false, 'one in flight: a second poll sends nothing');
  clock.advance(60000);
  assert.equal(calls.length, 1, 'a slow answer never piles requests up');
  assert.equal(calls[0].url, 'https://www.oref.org.il/WarningMessages/alert/alerts.json');
  assert.equal(calls[0].ms, 4000);
  assert.equal(calls[0].headers['X-Requested-With'], 'XMLHttpRequest');
  calls[0].done(null, '');
  assert.deepEqual(clock.pending(), [5000], 'the next poll 5 s after the answer');
  clock.advance(5000);
  assert.equal(calls.length, 2);
});

test('an alert in Rehovot: up at once, with its start time; it stays while listed and for 1 min after, then clears', () => {
  const ctx = load(FILES);
  const alert = oref('rehovot.json');
  const q = [[null, alert], [null, alert], [null, alert], [null, ''], [null, ''], [null, '']];
  const s = monitor(ctx, q);
  s.m.poll();
  let st = s.m.state();
  assert.ok(st.active, 'raised');
  assert.equal(st.active.kind, 'missiles');
  assert.deepEqual([...st.active.names], ['Реховот']);
  assert.equal(st.active.startedAt, T0);
  assert.equal(s.changes(), 1);
  s.clock.advance(10000);                          // two more polls still list Rehovot
  assert.equal(s.m.state().active.startedAt, T0, 'the start time does not move while the alert goes on');
  assert.equal(s.changes(), 1, 'an unchanged alert is not redrawn every poll');
  const lastSeen = T0 + 10000;
  s.clock.advance(5000);                           // first poll without the area
  assert.ok(s.m.state().active, 'still up: the grace minute has just started');
  q.push(...Array(20).fill([null, '']));
  s.clock.advance(60000 - 5000 - 5000);            // 55 s after lastSeen: still inside the grace minute
  assert.ok(s.clock.now() - lastSeen < 60000 && s.m.state().active, 'up inside the grace minute');
  s.clock.advance(5000);                           // the poll at lastSeen + 60 s
  assert.equal(s.m.state().active, null, 'cleared one minute after the feed stopped listing the area');
});

test('an ongoing alert whose text or areas change keeps its start time', () => {
  const ctx = load(FILES);
  const first = oref('rehovot.json');
  const changed = JSON.stringify({ id: '2', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות', 'גדרה'], desc: 'היכנסו למרחב המוגן ושהו בו 15 דקות' });
  const s = monitor(ctx, [[null, first], [null, changed]]);
  s.m.poll();
  s.clock.advance(5000);
  const st = s.m.state();
  assert.equal(st.active.instruction.minutes, 15, 'the new instruction is shown');
  assert.equal(st.active.startedAt, T0, 'but the alert still started when it first appeared');
  assert.equal(s.changes(), 2, 'redrawn for the new text');
});

test('a failed or unreadable poll never clears a raised alert, even long after the grace minute', () => {
  const ctx = load(FILES);
  const q = [[null, oref('rehovot.json')]];
  for (let i = 0; i < 40; i++) q.push(i % 2 ? ['timeout', undefined] : [null, oref('block.html')]);
  const s = monitor(ctx, q);
  s.m.poll();
  s.clock.advance(40 * 5000);
  const st = s.m.state();
  assert.ok(st.active, 'still up after 200 s of failures');
  assert.equal(st.offline, true, 'and the lost connection is shown');
});

test('feed failure: no "all clear" — the offline marker after 3 failed polls in a row, gone on the next good answer', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, [['http 403', undefined], ['network', undefined], [null, oref('block.html')], [null, '']]);
  s.m.poll();
  assert.equal(s.m.state().offline, false, 'one failure is not shown (a single timeout must not flicker)');
  s.clock.advance(5000);
  assert.equal(s.m.state().offline, false);
  s.clock.advance(5000);
  assert.equal(s.m.state().offline, true, 'third failure in a row');
  assert.equal(s.m.state().active, null);
  assert.equal(s.changes(), 1, 'drawn once when the marker appears');
  s.clock.advance(5000);
  assert.equal(s.m.state().offline, false, 'a good answer removes it');
  assert.equal(s.changes(), 2);
});

test('an alert elsewhere raises nothing; nearby areas give the quiet notice only, and only without our own alert', () => {
  const ctx = load(FILES);
  const s = monitor(ctx, [[null, oref('elsewhere.json')], [null, oref('nearby.json')], [null, oref('rehovot.json')]]);
  s.m.poll();
  assert.deepEqual(JSON.parse(JSON.stringify(s.m.state())), { active: null, nearby: null, offline: false }, 'Ashkelon: nothing');
  s.clock.advance(5000);
  const st = s.m.state();
  assert.equal(st.active, null);
  assert.deepEqual([...st.nearby.names], ['Нес-Циона', 'Ришон-ле-Цион']);
  s.clock.advance(5000);
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
  calls[0](null, oref('rehovot.json'));
  assert.equal(m.state().active, null);
  assert.equal(changes, 0);
  assert.deepEqual(clock.pending(), []);
});
