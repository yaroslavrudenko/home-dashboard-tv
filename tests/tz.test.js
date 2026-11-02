'use strict';
// World clocks: the UTC offset of each zone, the "Europe/Kyiv" → "Europe/Kiev" fallback for old
// Chromium (Tizen 3.0 = Chromium 47, tzdata 2015), the built-in daylight-saving rules used when Intl
// cannot help, and the rule that a clock is never silently wrong (an approx marker or "zone unknown").
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js'];
const clockOf = (ctx, id) => ctx.Config.clocks.find((c) => c.id === id);
const AT = (iso) => Date.parse(iso);

// Intl whose DateTimeFormat rejects some zone names with RangeError, like Chromium 47 does for
// "Europe/Kyiv" (the name was added to tzdata in 2022).
function intlRejecting(names) {
  return {
    DateTimeFormat: function (locale, options) {
      if (names.indexOf(options.timeZone) >= 0) throw new RangeError('Invalid time zone specified: ' + options.timeZone);
      return new Intl.DateTimeFormat(locale, options);
    }
  };
}

test('the three configured clocks are Israel, Ukraine (Kyiv with the Kiev fallback) and Sydney', () => {
  const ctx = load(FILES);
  assert.deepEqual([...ctx.Config.clocks.map((c) => c.id)], ['israel', 'ukraine', 'sydney']);
  assert.deepEqual([...clockOf(ctx, 'ukraine').zones], ['Europe/Kyiv', 'Europe/Kiev']);
  assert.equal(clockOf(ctx, 'israel').zones[0], 'Asia/Jerusalem');
  assert.equal(clockOf(ctx, 'sydney').zones[0], 'Australia/Sydney');
});

test('with a modern Intl every clock resolves through Intl and shows the exact local time', () => {
  const ctx = load(FILES);
  const utc = AT('2026-10-29T18:32:00Z');
  const expect = { israel: [20, 32, 120], ukraine: [20, 32, 120], sydney: [5, 32, 660] };
  for (const id of Object.keys(expect)) {
    const r = ctx.Tz.resolve(clockOf(ctx, id), utc);
    assert.equal(r.source, 'intl', id);
    const w = ctx.Tz.wallTime(r, utc);
    assert.deepEqual([w.hours, w.minutes, w.offset, w.ok, w.approx], [...expect[id], true, false], id);
  }
  const syd = ctx.Tz.wallTime(ctx.Tz.resolve(clockOf(ctx, 'sydney'), utc), utc);
  assert.deepEqual([syd.weekday, syd.day, syd.month], [5, 30, 9], 'Sydney is already on Friday 30 October');
});

test('summer offsets: Israel and Ukraine +3, Sydney +10', () => {
  const ctx = load(FILES);
  const utc = AT('2026-07-01T12:00:00Z');
  const got = ['israel', 'ukraine', 'sydney'].map((id) => ctx.Tz.wallTime(ctx.Tz.resolve(clockOf(ctx, id), utc), utc).offset);
  assert.deepEqual(got, [180, 180, 600]);
});

test('old Chromium: "Europe/Kyiv" throws RangeError, so the clock falls back to "Europe/Kiev" and stays exact', () => {
  const ctx = load(FILES, { Intl: intlRejecting(['Europe/Kyiv']) });
  const utc = AT('2026-10-29T18:32:00Z');
  const r = ctx.Tz.resolve(clockOf(ctx, 'ukraine'), utc);
  assert.equal(r.zone, 'Europe/Kiev');
  assert.equal(r.source, 'intl');
  const w = ctx.Tz.wallTime(r, utc);
  assert.deepEqual([w.ok, w.approx, w.hours, w.minutes], [true, false, 20, 32]);
});

test('no Intl at all: built-in rules give the right time and the clock is marked approximate', () => {
  const ctx = load(FILES, { Intl: undefined });
  const utc = AT('2026-10-29T18:32:00Z');
  for (const [id, h] of [['israel', 20], ['ukraine', 20], ['sydney', 5]]) {
    const r = ctx.Tz.resolve(clockOf(ctx, id), utc);
    assert.equal(r.source, 'rules', id);
    const w = ctx.Tz.wallTime(r, utc);
    assert.deepEqual([w.ok, w.approx, w.hours], [true, true, h], id);
  }
});

test('Intl rejecting every name of a zone falls back to the rules, marked approximate', () => {
  const ctx = load(FILES, { Intl: intlRejecting(['Europe/Kyiv', 'Europe/Kiev']) });
  const utc = AT('2026-10-29T18:32:00Z');
  const w = ctx.Tz.wallTime(ctx.Tz.resolve(clockOf(ctx, 'ukraine'), utc), utc);
  assert.deepEqual([w.ok, w.approx, w.hours], [true, true, 20]);
});

test('neither Intl nor a rule: the clock says it does not know ("--:--"), never a guessed time', () => {
  const ctx = load(FILES, { Intl: undefined });
  const r = ctx.Tz.resolve({ id: 'x', zones: ['Pacific/Nowhere'], rule: 'NONE' }, Date.now());
  assert.equal(r.source, 'none');
  assert.equal(ctx.Tz.wallTime(r, Date.now()).ok, false);
});

// Decision 3 (F2): on a disagreement the rule (checked against tzdata 2025–2030) is shown, unmarked, logged once.
test('Intl and the rules disagree (an outdated TV time-zone database): the built-in rule is shown, unmarked, and logged once', () => {
  const warnings = [];
  const ctx = load(FILES, { console: { warn: (m) => warnings.push(m) } });
  const clock = { id: 'x', zones: ['Asia/Jerusalem'], rule: 'EU' };   // EU rule differs from Israel in late March
  const utc = AT('2026-03-28T12:00:00Z');                             // Israel already +3, EU still +2
  const r = ctx.Tz.resolve(clock, utc);
  const w = ctx.Tz.wallTime(r, utc);
  assert.equal(w.offset, 120, 'the rule offset is shown');
  assert.equal(w.approx, false, 'nothing is marked');
  ctx.Tz.wallTime(r, utc + 60000);
  assert.equal(warnings.length, 1, 'the disagreement is logged once: ' + warnings);
  assert.match(warnings[0], /Asia\/Jerusalem.*180.*120/);
});

test('wall-time helpers: "HH:MM" and the hour key in Open-Meteo\'s local format', () => {
  const ctx = load(FILES);
  const utc = AT('2026-10-29T18:32:00Z');
  const w = ctx.Tz.wallTime(ctx.Tz.resolve(clockOf(ctx, 'sydney'), utc), utc);
  assert.equal(ctx.Tz.hhmm(w), '05:32');
  assert.equal(ctx.Tz.hourKey(w), '2026-10-30T05');
  assert.equal(ctx.Tz.hhmm({ ok: false }), '--:--');
  assert.equal(ctx.Tz.hourKey({ ok: false }), null);
});

test('an unparsable Intl answer is rejected rather than turned into a wrong offset', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Tz.intlOffset({ format: () => 'garbage' }, Date.now()), null);
  assert.equal(ctx.Tz.intlOffset({ format: () => '10/29/2026, 20:37:00' }, AT('2026-10-29T18:30:00Z')), null, '127 min is not a quarter hour');
  assert.equal(ctx.Tz.intlOffset({ format: () => { throw new Error('x'); } }, Date.now()), null);
  assert.equal(ctx.Tz.intlOffset({ format: () => '10/30/2026, 24:00:00' }, AT('2026-10-29T22:00:00Z')), 120, 'midnight printed as 24');
});

test('the built-in rules match the real time-zone database every hour of 2025–2030', () => {
  const ctx = load(FILES);
  const pairs = [['IL', 'Asia/Jerusalem'], ['EU', 'Europe/Kyiv'], ['AU_SYD', 'Australia/Sydney']];
  for (const [rule, zone] of pairs) {
    const f = new Intl.DateTimeFormat('en-US', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: zone });
    let checked = 0;
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2031, 0, 1); t += 3600000) {
      const want = ctx.Tz.intlOffset(f, t);
      assert.equal(ctx.Tz.rules[rule](t), want, rule + ' at ' + new Date(t).toISOString());
      checked++;
    }
    assert.ok(checked > 52000, 'the sweep ran');
  }
});

test('daylight-saving edges of the rules, to the minute (2026)', () => {
  const ctx = load(FILES);
  const R = ctx.Tz.rules;
  assert.equal(R.IL(AT('2026-03-26T23:59:00Z')), 120);
  assert.equal(R.IL(AT('2026-03-27T00:00:00Z')), 180);
  assert.equal(R.IL(AT('2026-10-24T22:59:00Z')), 180);
  assert.equal(R.IL(AT('2026-10-24T23:00:00Z')), 120);
  assert.equal(R.EU(AT('2026-03-29T00:59:00Z')), 120);
  assert.equal(R.EU(AT('2026-03-29T01:00:00Z')), 180);
  assert.equal(R.EU(AT('2026-10-25T00:59:00Z')), 180);
  assert.equal(R.EU(AT('2026-10-25T01:00:00Z')), 120);
  assert.equal(R.AU_SYD(AT('2026-04-04T15:59:00Z')), 660);
  assert.equal(R.AU_SYD(AT('2026-04-04T16:00:00Z')), 600);
  assert.equal(R.AU_SYD(AT('2026-10-03T15:59:00Z')), 600);
  assert.equal(R.AU_SYD(AT('2026-10-03T16:00:00Z')), 660);
});

// Batch 12 (S4): the one home of the ISO calendar-date helpers (js/shabbat.js, js/weather.js, js/ledger.js use them).
test('calendar dates: "YYYY-MM-DD" arithmetic in whole UTC days — no time zone, DST or leap-day drift', () => {
  const { Tz } = load(FILES);
  assert.equal(Tz.dateMs('2026-11-02'), Date.UTC(2026, 10, 2));
  assert.equal(Tz.isoDate(Date.UTC(2026, 10, 2, 23, 59)), '2026-11-02');
  assert.deepEqual(['2026-11-02', '2026-12-31', '2028-02-28', '2027-03-26'].map((d) => Tz.addDays(d, 1)), ['2026-11-03', '2027-01-01', '2028-02-29', '2027-03-27']);
  assert.equal(Tz.addDays('2026-11-02', -9), '2026-10-24');
  assert.deepEqual(['2026-11-06', '2026-11-07', '2027-10-11'].map(Tz.weekdayOf), [5, 6, 1]);
  assert.deepEqual([Tz.daysBetween('2026-11-02', '2026-12-04'), Tz.daysBetween('2027-03-27', '2027-03-26')], [32, -1]);
});

