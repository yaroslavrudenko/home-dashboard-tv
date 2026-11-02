'use strict';
// Batch 12 (the Shabbat & holidays screen, data side): ONE Hebcal request per day for the home city (by GeoNames id,
// lat/lon where the catalogue has none), parsed into language-neutral windows (each candle lighting a segment), fasts,
// occurrences and Hebrew dates, and the screen's state as a pure function of the moment and the home date. Fixtures:
// real Hebcal answers (tests/fixtures/hebcal): the 2026-11-02 design captures, copied unedited, and the fix round's
// captures (*-s9.json) made with the app's own URL (from today − 9 days).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js', 'js/refresher.js', 'js/placestore.js', 'js/shabbat.js'];
const hebcal = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hebcal', name + '.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const IL = (iso) => Date.parse(iso);                 // an instant written with its Israel offset, e.g. '2026-11-06T16:27:00+02:00'
const NOV = 'hebcal-rehovot-2026-11-02-180d', APR = 'hebcal-rehovot-2027-04-19-180d', AUG = 'hebcal-rehovot-2027-08-09-180d',
  SEP = 'hebcal-rehovot-2027-09-28-180d';
// The answer Hebcal gives a request starting at `start` (it filters its items by the range: compare the -s9 captures).
function clip(json, start) {
  const out = JSON.parse(JSON.stringify(json));
  out.range.start = start;
  out.items = out.items.filter((i) => i.date.slice(0, 10) >= start);
  return out;
}

function parsed(ctx, name) { return ctx.Shabbat.parse(hebcal(name), ctx.Config.shabbat); }
// The window whose first candles are lit on `date` (YYYY-MM-DD).
function windowOn(data, date) { const w = data.windows.find((x) => x.start.date === date); return w && plain(w); }
const segs = (w) => w.segments.map((s) => [s.start.date, s.start.time, s.kind, s.holiday, s.parasha && s.parasha.id, s.during]);
const moment = (iso, weekday) => ({ at: Date.parse(iso), date: iso.slice(0, 10), weekday, time: iso.slice(11, 16) });

test('config: the 14 holidays and 5 fasts of the design, 180 days ahead, 6 upcoming, once a day, retries capped at 60 min; the home city written in at boot', () => {
  const s = plain(load(FILES).Config.shabbat);
  assert.equal(s.base, 'https://www.hebcal.com/hebcal');
  assert.deepEqual([s.lookaheadDays, s.upcoming, s.refreshMs, s.timeoutMs, s.staleAfterMs, s.retryMaxMs],
    [180, 6, 24 * 3600000, 15000, 48 * 3600000, 3600000]);
  assert.deepEqual(s.holidays, ['rosh-hashana', 'yom-kippur', 'sukkot', 'shmini-atzeret', 'chanukah', 'tu-bishvat', 'purim', 'pesach',
    'yom-hashoah', 'yom-hazikaron', 'yom-haatzmaut', 'lag-baomer', 'yom-yerushalayim', 'shavuot']);
  assert.deepEqual(s.fasts, ['tzom-gedaliah', 'asara-btevet', 'taanit-esther', 'tzom-tammuz', 'tisha-bav']);
  assert.deepEqual(s.place, { geo: 293725, lat: 31.8928, lon: 34.8113, candleMins: null, shushanPurim: false }, 'Rehovot, by GeoNames id');
});

test('S8: the screen states are exported constants, and view() only ever answers one of them', () => {
  const ctx = load(FILES);
  assert.deepEqual(plain(ctx.Shabbat.STATE), { WEEKDAY: 'weekday', EREV: 'erev', SHABBAT: 'shabbat', YOMTOV: 'yomtov' });
  const all = Object.values(ctx.Shabbat.STATE), d = parsed(ctx, SEP);
  for (let h = 0; h < 30 * 24; h += 1) {
    const now = IL('2027-09-28T00:00:00+03:00') + h * 3600000, today = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
    assert.ok(all.includes(ctx.Shabbat.view(d, now, today, ctx.Config.shabbat).state));
  }
  assert.equal(ctx.Shabbat.view(null, 0, '2026-11-02', ctx.Config.shabbat), null);
});

test('URL (S2): ONE request from today − 9 days to today + 180 — by GeoNames id, else lat/lon in Israel\'s zone with the city\'s candle minutes', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat;
  // the readings (leyning), special Shabbatot (ss), Rosh Chodesh (nx), the Omer (o) and Shabbat Mevarchim (mvch): still ONE request
  const Q = 'https://www.hebcal.com/hebcal?v=1&cfg=json&i=on&c=on&M=on&s=on&maj=on&min=on&mod=on&mf=on&d=on&lg=s&leyning=on&ss=on&nx=on&o=on&mvch=on';
  assert.equal(ctx.Shabbat.url(cfg, { geo: 293725, lat: 31.8928, lon: 34.8113, candleMins: null }, '2026-11-02'),
    Q + '&geonameid=293725&start=2026-10-24&end=2027-05-01');
  assert.equal(ctx.Shabbat.url(cfg, { geo: null, lat: 31.7014, lon: 35.1162, candleMins: 40 }, '2026-11-02'),
    Q + '&latitude=31.7014&longitude=35.1162&tzid=Asia/Jerusalem&b=40&start=2026-10-24&end=2027-05-01');
  assert.equal(ctx.Shabbat.url(cfg, { geo: null, lat: 31.9, lon: 34.8, candleMins: null }, '2026-11-02'),
    Q + '&latitude=31.9&longitude=34.8&tzid=Asia/Jerusalem&start=2026-10-24&end=2027-05-01', 'no candle minutes: Hebcal\'s default');
  assert.equal(ctx.Shabbat.url(cfg, { geo: 281184 }, '2027-01-01'), Q + '&geonameid=281184&start=2026-12-23&end=2027-06-30', 'across a year end');
});

// Why the request starts in the past: on a Saturday a request starting that day has no Friday candles (recorded both ways).
test('a Saturday: the request from Friday holds the open Shabbat; one from Saturday would start with a havdalah and miss it', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat, sat10 = IL('2026-11-07T10:00:00+02:00');
  const fromFriday = ctx.Shabbat.view(parsed(ctx, 'hebcal-rehovot-2026-11-06-180d'), sat10, '2026-11-07', cfg);
  assert.equal(fromFriday.state, 'shabbat');
  assert.deepEqual(plain(fromFriday.window.havdalah), moment('2026-11-07T17:24:00+02:00', 6));
  const fromSaturday = ctx.Shabbat.view(parsed(ctx, 'hebcal-rehovot-2026-11-07-180d'), sat10, '2026-11-07', cfg);
  assert.notEqual(fromSaturday.state, 'shabbat', 'the recorded Saturday-start answer cannot show it');
  assert.match(ctx.Shabbat.url(cfg, cfg.place, '2026-11-07'), /&start=2026-10-29&/, 'the app\'s request starts well before the Friday');
});

test('moments: Hebcal\'s wall time with its offset (+02:00 in November, +03:00 in April) → the exact instant, the date and the weekday as written', () => {
  const ctx = load(FILES);
  const nov = windowOn(parsed(ctx, NOV), '2026-11-06');
  assert.deepEqual(nov.start, { at: Date.UTC(2026, 10, 6, 14, 27), date: '2026-11-06', weekday: 5, time: '16:27' });
  assert.deepEqual(nov.end, { at: Date.UTC(2026, 10, 7, 15, 24), date: '2026-11-07', weekday: 6, time: '17:24' });
  const apr = windowOn(parsed(ctx, APR), '2027-04-21');
  assert.deepEqual(apr.start, { at: Date.UTC(2027, 3, 21, 15, 53), date: '2027-04-21', weekday: 3, time: '18:53' });
});

test('windows: an ordinary Shabbat (one segment, with its parasha) and a Chanukah Shabbat (during: chanukah)', () => {
  const ctx = load(FILES), d = parsed(ctx, NOV);
  assert.deepEqual(segs(windowOn(d, '2026-11-06')), [['2026-11-06', '16:27', 'shabbat', null, 'Chayei Sara', null]]);
  assert.deepEqual(windowOn(d, '2026-11-06').segments[0].parasha, { id: 'Chayei Sara', he: 'פרשת חיי שרה' });
  assert.deepEqual(segs(windowOn(d, '2026-12-04')), [['2026-12-04', '16:16', 'shabbat', null, 'Vayeshev', 'chanukah']]);
  assert.ok(d.windows.every((x, i) => i === 0 || x.start.at > d.windows[i - 1].start.at), 'in time order');
});

test('windows (S1): every candle lighting is a segment; its kind comes from the day it starts — Pesach, Chol HaMoed Shabbat, Shavuot then Shabbat', () => {
  const ctx = load(FILES), d = parsed(ctx, APR);
  assert.deepEqual(segs(windowOn(d, '2027-04-21')), [['2027-04-21', '18:53', 'yomtov', 'pesach', null, 'pesach']]);
  assert.equal(windowOn(d, '2027-04-21').end.time, '19:52');
  assert.deepEqual(segs(windowOn(d, '2027-04-23')), [['2027-04-23', '18:55', 'shabbat', null, null, 'pesach']]);
  assert.deepEqual(segs(windowOn(d, '2027-04-27')), [['2027-04-27', '18:57', 'yomtov', 'pesach', null, 'pesach']]);
  const sh = windowOn(d, '2027-06-10');
  assert.deepEqual(segs(sh), [['2027-06-10', '19:26', 'yomtov', 'shavuot', null, 'shavuot'], ['2027-06-11', '19:26', 'shabbat', null, 'Nasso', null]]);
  assert.deepEqual([sh.end.date, sh.end.time], ['2027-06-12', '20:29'], 'ONE window for the times: the candles of Friday stay inside it');
  assert.equal(windowOn(d, '2027-06-11'), undefined);
});

test('windows (S1): Rosh Hashana — two lightings, both yom tov, one window; Yom Kippur; Sukkot I; Hoshana Raba → Shmini Atzeret', () => {
  const ctx = load(FILES), d = parsed(ctx, SEP);
  const rh = windowOn(d, '2027-10-01');
  assert.deepEqual(segs(rh), [['2027-10-01', '18:06', 'yomtov', 'rosh-hashana', null, 'rosh-hashana'], ['2027-10-02', '19:01', 'yomtov', 'rosh-hashana', null, 'rosh-hashana']]);
  assert.deepEqual([rh.end.date, rh.end.time], ['2027-10-03', '19:00']);
  assert.deepEqual(segs(windowOn(d, '2027-10-10')).map((s) => s.slice(2, 4)), [['yomtov', 'yom-kippur']]);
  assert.equal(windowOn(d, '2027-10-10').end.time, '18:50');
  assert.deepEqual(segs(windowOn(d, '2027-10-15')).map((s) => s.slice(2, 4)), [['yomtov', 'sukkot']]);
  assert.deepEqual(segs(windowOn(d, '2027-10-22')).map((s) => s.slice(2, 4)), [['yomtov', 'shmini-atzeret']]);
});

// S1 (code F1 + Codex B12-01): a Shabbat next to a yom tov is Shabbat, whatever day the data were fetched.
test('S1: Saturday 2029-05-19 before Shavuot is Shabbat Bamidbar; Saturday night\'s lighting starts Shavuot; havdalah on Sunday night', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat, d = parsed(ctx, 'hebcal-rehovot-2029-05-19-s9');
  const sat = ctx.Shabbat.view(d, IL('2029-05-19T10:00:00+03:00'), '2029-05-19', cfg);
  assert.deepEqual([sat.state, sat.window.kind, sat.window.holiday, sat.window.parasha.id, sat.window.candles.time, sat.window.havdalah.date],
    ['shabbat', 'shabbat', null, 'Bamidbar', '19:13', '2029-05-20']);
  const night = ctx.Shabbat.view(d, IL('2029-05-19T20:14:00+03:00'), '2029-05-19', cfg);
  assert.deepEqual([night.state, night.window.holiday, night.window.parasha, night.window.candles.time], ['yomtov', 'shavuot', null, '20:14']);
  assert.equal(ctx.Shabbat.view(d, IL('2029-05-19T20:13:00+03:00'), '2029-05-19', cfg).state, 'shabbat');
});

test('S1: Shavuot 2027 — Friday is yom tov, Saturday is Shabbat Nasso, exactly from Friday\'s 19:26 candles; the same fetched on Thursday, on Saturday, or cut at Friday', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat;
  const answers = { thursday: hebcal('hebcal-rehovot-2027-06-10-s9'), saturday: hebcal('hebcal-rehovot-2027-06-12-s9'),
    cutAtFriday: clip(hebcal(APR), '2027-06-11'), design: hebcal(APR) };
  for (const [name, json] of Object.entries(answers)) {
    const d = ctx.Shabbat.parse(json, cfg), at = (iso, today) => ctx.Shabbat.view(d, IL(iso), today, cfg);
    const fri = at('2027-06-11T10:00:00+03:00', '2027-06-11');
    if (name !== 'cutAtFriday') assert.deepEqual([fri.state, fri.window.holiday, fri.window.parasha], ['yomtov', 'shavuot', null], name + ' Friday');
    const before = at('2027-06-11T19:25:59+03:00', '2027-06-11');
    if (name !== 'cutAtFriday') assert.equal(before.state, 'yomtov', name + ' just before the Shabbat candles');
    const lit = at('2027-06-11T19:26:00+03:00', '2027-06-11');
    assert.deepEqual([lit.state, lit.window.kind, lit.window.parasha.id, lit.window.candles.date, lit.window.havdalah.time],
      ['shabbat', 'shabbat', 'Nasso', '2027-06-11', '20:29'], name + ' at the Shabbat candles');
    const sat = at('2027-06-12T10:00:00+03:00', '2027-06-12');
    assert.deepEqual([sat.state, sat.window.holiday, sat.window.parasha.id], ['shabbat', null, 'Nasso'], name + ' Saturday');
    assert.equal(at('2027-06-12T20:29:00+03:00', '2027-06-12').state, 'weekday', name + ' after havdalah');
  }
});

test('S1: both days of Rosh Hashana are yom tov — the first evening, the second day, the second evening\'s lighting; erev uses the first lighting', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat, d = parsed(ctx, SEP), at = (iso, today) => ctx.Shabbat.view(d, IL(iso), today, cfg);
  for (const [iso, today] of [['2027-10-01T18:06:00+03:00', '2027-10-01'], ['2027-10-02T10:00:00+03:00', '2027-10-02'],
    ['2027-10-02T19:01:00+03:00', '2027-10-02'], ['2027-10-03T18:59:00+03:00', '2027-10-03']]) {
    assert.deepEqual([at(iso, today).state, at(iso, today).window.holiday], ['yomtov', 'rosh-hashana'], iso);
  }
  const erev = at('2027-10-01T12:00:00+03:00', '2027-10-01');
  assert.deepEqual([erev.state, erev.window.candles.time, erev.window.minutesToCandles], ['erev', '18:06', 366]);
  assert.equal(at('2027-10-03T19:00:00+03:00', '2027-10-03').state, 'weekday');
});

test('fasts: whitelisted only, begin and end paired — Tisha B\'Av from the evening before; Ta\'anit Bechorot never shown', () => {
  const ctx = load(FILES);
  assert.deepEqual(plain(parsed(ctx, NOV).fasts[0]), { holiday: 'asara-btevet',
    begins: moment('2026-12-20T05:18:00+02:00', 0), ends: moment('2026-12-20T16:55:00+02:00', 0) });
  const tb = plain(parsed(ctx, AUG).fasts.find((f) => f.holiday === 'tisha-bav'));
  assert.deepEqual([tb.begins.date, tb.begins.time, tb.ends.date, tb.ends.time], ['2027-08-11', '19:29', '2027-08-12', '19:56']);
  assert.deepEqual(plain(parsed(ctx, SEP).fasts.find((f) => f.holiday === 'tzom-gedaliah')).begins.time, '05:24');
  const apr = parsed(ctx, APR);
  assert.ok(!apr.fasts.some((f) => /bechorot/.test(f.holiday)) && !apr.occurrences.some((o) => /bechorot/.test(o.holiday)));
});

test('the whitelist decides: a fast taken off cfg.fasts is in neither the fast times nor the occurrences (every recorded fast pair is on it)', () => {
  const ctx = load(FILES), cfg = Object.assign({}, ctx.Config.shabbat, { fasts: ['asara-btevet', 'taanit-esther', 'tzom-tammuz', 'tisha-bav'] });
  const d = ctx.Shabbat.parse(hebcal(SEP), cfg);
  assert.ok(!d.fasts.some((f) => f.holiday === 'tzom-gedaliah') && !d.occurrences.some((o) => o.holiday === 'tzom-gedaliah'));
  assert.ok(ctx.Shabbat.parse(hebcal(SEP), ctx.Config.shabbat).fasts.some((f) => f.holiday === 'tzom-gedaliah'), 'on the list: shown');
});

test('occurrences: whitelisted only, nothing but what is shown (S5); a holiday starts on its first day, never on its Erev; Chanukah on its first candle\'s evening', () => {
  const ctx = load(FILES), occ = plain(parsed(ctx, NOV).occurrences);
  assert.deepEqual(occ.map((o) => [o.holiday, o.kind, o.start, o.end]), [
    ['chanukah', 'holiday', '2026-12-04', '2026-12-12'], ['asara-btevet', 'fast', '2026-12-20', '2026-12-20'],
    ['tu-bishvat', 'holiday', '2027-01-23', '2027-01-23'], ['taanit-esther', 'fast', '2027-03-22', '2027-03-22'],
    ['purim', 'holiday', '2027-03-23', '2027-03-23'], ['pesach', 'holiday', '2027-04-22', '2027-04-28']]);
  assert.ok(occ.every((o) => Object.keys(o).sort().join() === 'end,holiday,kind,start'), 'no unread fields');
  assert.equal(plain(parsed(ctx, AUG).occurrences.find((o) => o.holiday === 'tisha-bav')).start, '2027-08-12');
});

test('S9: Jerusalem keeps Purim on the 15th — Shushan Purim instead of Purim; every other city Purim as before', () => {
  const ctx = load(FILES), jlm = Object.assign({}, ctx.Config.shabbat, { place: { geo: 281184, lat: 31.7816, lon: 35.2186, candleMins: null, shushanPurim: true } });
  const j = ctx.Shabbat.parse(hebcal('hebcal-jlm-2026-11-02-180d'), jlm).occurrences.map((o) => [o.holiday, o.start]);
  assert.deepEqual(plain(j.filter((o) => /purim/.test(o[0]))), [['shushan-purim', '2027-03-24']]);
  const r = ctx.Shabbat.parse(hebcal(NOV), ctx.Config.shabbat).occurrences.map((o) => [o.holiday, o.start]);
  assert.deepEqual(plain(r.filter((o) => /purim/.test(o[0]))), [['purim', '2027-03-23']]);
});

test('Hebrew dates: every day of the range, month as Hebcal names it (Adar I / Adar II included), the Hebrew text from its parts; the range end kept', () => {
  const ctx = load(FILES), d = parsed(ctx, NOV);
  assert.deepEqual(plain(d.range), { end: '2027-05-01' });
  assert.deepEqual(plain(d.hebDates['2026-11-02']), { day: 22, month: 'Cheshvan', year: 5787, he: 'כ״ב בחשון תשפ״ז' });
  assert.deepEqual(plain(d.hebDates['2027-02-08']), { day: 1, month: 'Adar I', year: 5787, he: 'א׳ באדר א׳ תשפ״ז' });
  assert.equal(Object.keys(d.hebDates).length, 181);
});

// The screen's state: a pure function of the moment, the home date and the held data.
function at(ctx, name, iso, today) { return ctx.Shabbat.view(parsed(ctx, name), IL(iso), today, ctx.Config.shabbat); }

test('states: weekday → erev (minutes to the candles) → shabbat from the candle minute exactly → weekday from the havdalah minute', () => {
  const ctx = load(FILES);
  const mon = at(ctx, NOV, '2026-11-02T12:00:00+02:00', '2026-11-02');
  assert.deepEqual([mon.state, mon.window.candles.date, mon.window.daysToCandles, mon.window.minutesToCandles], ['weekday', '2026-11-06', 4, null]);
  const erev = at(ctx, NOV, '2026-11-06T14:13:00+02:00', '2026-11-06');
  assert.deepEqual([erev.state, erev.window.daysToCandles, erev.window.minutesToCandles], ['erev', 0, 134]);
  assert.equal(at(ctx, NOV, '2026-11-06T14:13:00.050+02:00', '2026-11-06').window.minutesToCandles, 134, 'the minute tick lands 50 ms late');
  const lit = at(ctx, NOV, '2026-11-06T16:27:00+02:00', '2026-11-06');
  assert.deepEqual([lit.state, lit.window.parasha.id, lit.window.havdalah.time], ['shabbat', 'Chayei Sara', '17:24']);
  assert.equal(at(ctx, NOV, '2026-11-06T16:26:59+02:00', '2026-11-06').state, 'erev');
  assert.equal(at(ctx, NOV, '2026-11-07T17:23:00+02:00', '2026-11-07').state, 'shabbat');
  const out = at(ctx, NOV, '2026-11-07T17:24:00+02:00', '2026-11-07');
  assert.deepEqual([out.state, out.window.candles.date, out.window.daysToCandles], ['weekday', '2026-11-13', 6]);
});

test('S9: from candle lighting until midnight the Hebrew date is the next day\'s (the holy day has begun); after midnight the date itself', () => {
  const ctx = load(FILES), h = (v) => [v.today.date, v.today.hebrew.day, v.today.hebrew.month];
  assert.deepEqual(h(at(ctx, NOV, '2026-11-06T16:26:00+02:00', '2026-11-06')), ['2026-11-06', 26, 'Cheshvan'], 'before the candles');
  assert.deepEqual(h(at(ctx, NOV, '2026-11-06T16:27:00+02:00', '2026-11-06')), ['2026-11-06', 27, 'Cheshvan'], 'lit: Shabbat\'s date');
  assert.deepEqual(h(at(ctx, NOV, '2026-11-06T23:59:00+02:00', '2026-11-06')), ['2026-11-06', 27, 'Cheshvan']);
  assert.deepEqual(h(at(ctx, NOV, '2026-11-07T10:00:00+02:00', '2026-11-07')), ['2026-11-07', 27, 'Cheshvan'], 'Shabbat day');
  assert.deepEqual(h(at(ctx, SEP, '2027-10-10T17:54:00+03:00', '2027-10-10')), ['2027-10-10', 10, 'Tishrei'], 'Kol Nidrei: Yom Kippur\'s date');
  assert.deepEqual(h(at(ctx, SEP, '2027-10-02T19:01:00+03:00', '2027-10-02')), ['2027-10-02', 2, 'Tishrei'], 'the second evening of Rosh Hashana');
  assert.deepEqual(h(at(ctx, NOV, '2026-11-07T20:00:00+02:00', '2026-11-07')), ['2026-11-07', 27, 'Cheshvan'], 'after havdalah: no lighting tonight');
});

test('states: yom tov (Pesach I; Yom Kippur), with the holiday; the today block carries the Hebrew date', () => {
  const ctx = load(FILES);
  const p = at(ctx, APR, '2027-04-22T10:00:00+03:00', '2027-04-22');
  assert.deepEqual([p.state, p.window.holiday, p.window.havdalah.time], ['yomtov', 'pesach', '19:52']);
  const yk = at(ctx, SEP, '2027-10-11T10:00:00+03:00', '2027-10-11');
  assert.deepEqual([yk.state, yk.window.holiday], ['yomtov', 'yom-kippur']);
  assert.deepEqual(plain(yk.today), { date: '2027-10-11', weekday: 1, day: 11, month: 9, hebrew: { day: 10, month: 'Tishrei', year: 5788, he: 'י׳ בתשרי תשפ״ח' } });
  assert.ok(!('updatedAt' in yk), 'S7: the arrival time is the store\'s status, not a second copy in the snapshot');
});

test('notes: a fast on its day (quiet before it begins, active while it runs, gone once it ends); otherwise a holiday under way today', () => {
  const ctx = load(FILES);
  const early = at(ctx, NOV, '2026-12-20T05:00:00+02:00', '2026-12-20').note;
  assert.deepEqual([early.kind, early.holiday, early.active], ['fast', 'asara-btevet', false]);
  const during = at(ctx, NOV, '2026-12-20T10:00:00+02:00', '2026-12-20').note;
  assert.deepEqual([during.kind, during.active, during.begins.time, during.ends.time], ['fast', true, '05:18', '16:55']);
  assert.equal(at(ctx, NOV, '2026-12-20T17:00:00+02:00', '2026-12-20').note, null, 'the fast ended; no other holiday today');
  const eve = at(ctx, AUG, '2027-08-11T20:00:00+03:00', '2027-08-11').note;
  assert.deepEqual([eve.holiday, eve.active], ['tisha-bav', true], 'Tisha B\'Av begins the evening before');
  assert.deepEqual(plain(at(ctx, NOV, '2026-12-07T12:00:00+02:00', '2026-12-07').note), { kind: 'holiday', holiday: 'chanukah' });
});

test('upcoming: six, by start, with the day count; an ongoing one first with 0 (from its first day); a past one dropped', () => {
  const ctx = load(FILES);
  const up = plain(at(ctx, NOV, '2026-11-02T12:00:00+02:00', '2026-11-02').upcoming);
  assert.deepEqual(up.map((u) => [u.holiday, u.kind, u.start, u.daysUntil, u.ongoing]), [
    ['chanukah', 'holiday', '2026-12-04', 32, false], ['asara-btevet', 'fast', '2026-12-20', 48, false],
    ['tu-bishvat', 'holiday', '2027-01-23', 82, false], ['taanit-esther', 'fast', '2027-03-22', 140, false],
    ['purim', 'holiday', '2027-03-23', 141, false], ['pesach', 'holiday', '2027-04-22', 171, false]]);
  assert.deepEqual([up[0].startWeekday, up[0].startDay, up[0].startMonth, up[0].end], [5, 4, 11, '2026-12-12']);
  const first = plain(at(ctx, NOV, '2026-12-04T12:00:00+02:00', '2026-12-04').upcoming);
  assert.deepEqual([first[0].holiday, first[0].daysUntil, first[0].ongoing], ['chanukah', 0, true], 'its first day is already under way');
  const mid = plain(at(ctx, NOV, '2026-12-07T12:00:00+02:00', '2026-12-07').upcoming);
  assert.deepEqual([mid[0].holiday, mid[0].daysUntil, mid[0].ongoing], ['chanukah', 0, true]);
  const after = plain(at(ctx, NOV, '2026-12-21T12:00:00+02:00', '2026-12-21').upcoming);
  assert.ok(!after.some((u) => u.holiday === 'chanukah' || u.holiday === 'asara-btevet'), 'past ones are gone');
});

test('the home date drives "today": 00:30 in Israel is still the previous day in UTC, the screen shows the Israeli date', () => {
  const ctx = load(FILES);
  const v = ctx.Shabbat.view(parsed(ctx, NOV), Date.parse('2026-11-02T22:30:00Z'), '2026-11-03', ctx.Config.shabbat);
  assert.deepEqual([v.today.date, v.today.hebrew.day], ['2026-11-03', 23]);
});

test('Jerusalem by its GeoNames id keeps its 40-minute custom (16:05 vs Rehovot\'s 16:27 on 2026-11-06); the lat/lon fallback answer parses the same way', () => {
  const ctx = load(FILES);
  assert.equal(parsed(ctx, 'hebcal-jlm-2026-11-02-180d').windows[0].start.time, '16:05');
  assert.equal(parsed(ctx, NOV).windows[0].start.time, '16:27');
  const b = parsed(ctx, 'hebcal-beitarillit-latlon-2026-11-02-180d');
  assert.ok(b.windows.length > 20 && b.occurrences.length === 6);
});

test('S9: Beitar Illit by its centre carries the Jerusalem custom through b=40 — candles 16:06, not Hebcal\'s default 16:26 (both recorded)', () => {
  const ctx = load(FILES);
  const first = (name) => ctx.Shabbat.parse(hebcal(name), ctx.Config.shabbat).windows.find((w) => w.start.date === '2026-11-06').start.time;
  assert.equal(first('hebcal-beitarillit-b40-2026-11-02-s9'), '16:06');
  assert.equal(first('hebcal-beitarillit-latlon-2026-11-02-180d'), '16:26');
});

test('data older than its range (the TV off for months): no window, no note, nothing upcoming — never past dates as future', () => {
  const ctx = load(FILES);
  const v = at(ctx, NOV, '2027-06-01T12:00:00+03:00', '2027-06-01');
  assert.deepEqual([v.window, v.note, v.upcoming.length, v.today.hebrew], [null, null, 0, null]);
});

test('old data whose range ended inside a Shabbat (its last havdalah past the range) never shows that Shabbat as running', () => {
  const ctx = load(FILES), json = hebcal(NOV);
  const last = json.items.map((i) => i.category).lastIndexOf('havdalah');
  json.items.splice(last, 1);                                         // the range ends on a Friday evening
  const d = ctx.Shabbat.parse(json, ctx.Config.shabbat);
  assert.equal(d.windows[d.windows.length - 1].end, null, 'the last window is open');
  const inside = ctx.Shabbat.view(d, IL('2027-05-01T10:00:00+03:00'), '2027-05-01', ctx.Config.shabbat);
  assert.equal(inside.state, 'shabbat', 'within the range the open window is the real Shabbat');
  const months = ctx.Shabbat.view(d, IL('2027-07-03T10:00:00+03:00'), '2027-07-03', ctx.Config.shabbat);
  assert.deepEqual([months.state, months.window], ['weekday', null]);
});

test('a foreign shape throws: an error answer (unknown GeoNames id), no items, not an object', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat;
  for (const bad of [hebcal('hebcal-bad-geonameid'), {}, { items: 'x' }, null, '<html>']) assert.throws(() => ctx.Shabbat.parse(bad, cfg), /hebcal/, JSON.stringify(bad));
});

// The store: once a day (js/refresher.js), one request per hop, the URL built from today() AT the hop.
function store(today, start) {
  const ctx = load(FILES), t = fakeTimers(start || IL('2026-11-02T12:00:00+02:00')), calls = [];
  let changes = 0, day = today;
  const s = ctx.Shabbat.createStore(ctx.Config.shabbat, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, random: () => 0.5,
    today: () => day, onChange: () => { changes++; }, getJson: (url, ms, done) => calls.push({ url, ms, done }) });
  return { ctx, t, s, calls, setDay: (d) => { day = d; }, changes: () => changes };
}
const startOf = (url) => new URL(url).searchParams.get('start');

test('store: one request per refresh with the timeout; status loading → fresh with the arrival time (S7: the data carry no copy of it)', () => {
  const h = store('2026-11-02');
  assert.equal(h.s.data(), null);
  assert.equal(h.s.status().kind, 'loading');
  assert.equal(h.s.refresh(), true);
  assert.equal(h.s.refresh(), false, 'nothing more while in flight');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].ms, 15000);
  h.calls[0].done(null, hebcal(NOV));
  assert.deepEqual([h.s.status().kind, h.s.status().updatedAt, h.changes()], ['fresh', h.t.now(), 1]);
  assert.ok(!('updatedAt' in h.s.data()));
  assert.equal(h.s.data().windows[0].start.time, '16:27');
  assert.deepEqual(h.t.pending(), [24 * 3600000], 'next refresh in a day: no polling');
});

test('store: the URL\'s start follows today() at EVERY hop (a 2-day fake clock); the home date, never the UTC date', () => {
  const h = store('2026-11-03');
  h.s.refresh();
  assert.equal(startOf(h.calls[0].url), '2026-10-25', 'today() says 2026-11-03 although the UTC date is 2026-11-02');
  h.calls[0].done(null, hebcal(NOV));
  h.setDay('2026-11-04');
  h.t.advance(24 * 3600000);
  assert.equal(h.calls.length, 2);
  assert.equal(startOf(h.calls[1].url), '2026-10-26');
  assert.match(h.calls[1].url, /&geonameid=293725&/);
});

// S2 (code F2 + Codex B12-02): the daily refresh never moves an ongoing holiday's first day.
test('S2: across the 5 daily refreshes of Chanukah 2026 the shown start stays 2026-12-04 (each answer cut at its request\'s start, as Hebcal does)', () => {
  const h = store('2026-12-04', IL('2026-12-04T12:00:00+02:00')), raw = hebcal(NOV), shown = [];
  h.s.refresh();
  for (let k = 0; k < 5; k++) {
    const today = '2026-12-0' + (4 + k);
    if (k) { h.setDay(today); h.t.advance(24 * 3600000); }
    const call = h.calls[k];
    call.done(null, clip(raw, startOf(call.url)));
    const v = h.ctx.Shabbat.view(h.s.data(), h.t.now(), today, h.ctx.Config.shabbat);
    shown.push([today, v.upcoming[0].holiday, v.upcoming[0].start, v.upcoming[0].ongoing]);
  }
  assert.deepEqual(shown, [0, 1, 2, 3, 4].map((k) => ['2026-12-0' + (4 + k), 'chanukah', '2026-12-04', true]));
  const real = h.ctx.Shabbat.parse(hebcal('hebcal-rehovot-2026-12-08-s9'), h.ctx.Config.shabbat);
  assert.equal(real.occurrences.find((o) => o.holiday === 'chanukah').start, '2026-12-04', 'the real answer of the 12-08 request');
});

test('S2: Pesach 2027 fetched on 04-26 starts on 04-22 — the real answer, and the design capture cut at the request\'s start', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat;
  assert.equal(ctx.Shabbat.parse(hebcal('hebcal-rehovot-2027-04-26-s9'), cfg).occurrences.find((o) => o.holiday === 'pesach').start, '2027-04-22');
  const start = new URL(ctx.Shabbat.url(cfg, cfg.place, '2027-04-26')).searchParams.get('start');
  const v = ctx.Shabbat.view(ctx.Shabbat.parse(clip(hebcal(APR), start), cfg), IL('2027-04-26T12:00:00+03:00'), '2027-04-26', cfg);
  assert.deepEqual([v.upcoming[0].holiday, v.upcoming[0].start, v.upcoming[0].ongoing], ['pesach', '2027-04-22', true]);
});

test('store: a failure or a foreign answer keeps the last good data (stale) and backs off with jitter; nothing yet → failed', () => {
  const h = store('2026-11-02');
  h.s.refresh();
  h.calls[0].done('timeout');
  assert.equal(h.s.status().kind, 'failed');
  const wait = h.t.pending()[0];
  assert.ok(wait >= 30000 && wait <= 60000, 'retry within the first back-off ceiling: ' + wait);
  h.t.advance(wait);
  h.calls[1].done(null, hebcal(NOV));
  h.s.refresh();
  h.calls[2].done(null, hebcal('hebcal-bad-geonameid'));
  assert.equal(h.s.status().kind, 'stale');
  assert.equal(h.s.data().windows[0].start.time, '16:27', 'the last good data stay');
});

test('S3: a long outage retries at least hourly (retryMaxMs), never waiting a whole day after the fourth failure', () => {
  const h = store('2026-11-02'), waits = [];
  h.s.refresh();
  for (let k = 0; k < 8; k++) {
    h.calls[k].done('http 503');
    waits.push(h.t.pending()[0]);
    h.t.advance(waits[k]);
  }
  assert.equal(h.calls.length, 9, 'every wait ended in one more attempt');
  assert.ok(waits.every((w) => w >= 30000 && w <= 3600000), JSON.stringify(waits));
  assert.ok(waits.slice(4).every((w) => w > 8 * 60000), 'past the list: up to the hour, not the 8-min ceiling');
});

// ---- The weekly reading (the owner: «на странице празников нет инфы какую стих Торы читаем и может еще чего») -------------
// Recorded with the app's own URL and the reading parameters (*-ly.json, 2026-11-02): Hebcal's own references, as given.
const LY = (d) => 'hebcal-rehovot-' + d + '-ly';
const segOf = (data, candleDate) => { for (const w of data.windows) for (const g of w.segments) if (g.start.date === candleDate) return plain(g); return null; };

test('reading: Shabbat Chayei Sara — the Torah reading and the haftarah as Hebcal gives them; Shabbat Mevarchim Kislev with Rosh Chodesh on 11-10', () => {
  const ctx = load(FILES), d = parsed(ctx, LY('2026-11-02'));
  assert.deepEqual(segOf(d, '2026-11-06').reading, { torah: 'Genesis 23:1-25:18', haftarah: 'I Kings 1:1-31',
    special: { kind: 'mevarchim', month: 'Kislev', date: '2026-11-10' } });
  assert.deepEqual(segOf(d, '2026-11-13').reading, { torah: 'Genesis 25:19-28:9', haftarah: 'Malachi 1:1-2:7', special: null }, 'an ordinary Shabbat: no extra line');
});

test('reading: a special Shabbat (Shirah) is named; the haftarah keeps only its reference (Hebcal\'s « | Shabbat …» note cut)', () => {
  const ctx = load(FILES), d = parsed(ctx, LY('2027-01-18'));
  const r = segOf(d, '2027-01-22').reading;
  assert.deepEqual(r.special, { kind: 'shabbat', id: 'shabbat-shirah', he: 'שבת שירה' });
  assert.equal(r.torah, 'Exodus 13:17-17:16');
  const apr = parsed(ctx, LY('2027-04-19'));
  assert.equal(segOf(apr, '2027-04-16').reading.haftarah, 'Malachi 3:4-24', 'Shabbat HaGadol: « | Shabbat HaGadol» not in the reference');
  assert.equal(segOf(apr, '2027-04-16').reading.special.id, 'shabbat-hagadol');
});

test('reading: a yom tov reads its own portion (Pesach I), and Shabbat Chol HaMoed its holiday reading with its haftarah', () => {
  const ctx = load(FILES), d = parsed(ctx, LY('2027-04-19'));
  assert.deepEqual(segOf(d, '2027-04-21').reading, { torah: 'Exodus 12:21-51; Numbers 28:16-25', haftarah: 'Joshua 3:5-7, 5:2-6:1, 6:27', special: null });
  assert.equal(segOf(d, '2027-04-23').reading.haftarah, 'Ezekiel 37:1-14', 'Shabbat Chol HaMoed Pesach');
});

test('reading reaches the screen: view() hands the shown segment\'s reading, and today\'s Omer count during the Omer only', () => {
  const ctx = load(FILES), cfg = ctx.Config.shabbat, d = parsed(ctx, LY('2027-04-19'));
  const v = ctx.Shabbat.view(d, IL('2027-04-25T10:00:00+03:00'), '2027-04-25', cfg);
  assert.equal(v.omer, 3, 'the third day of the Omer');
  assert.ok(v.window.reading, 'the next window carries its reading');
  const nov = ctx.Shabbat.view(parsed(ctx, LY('2026-11-02')), IL('2026-11-02T12:00:00+02:00'), '2026-11-02', cfg);
  assert.equal(nov.omer, null, 'no Omer in November');
  assert.equal(nov.window.reading.torah, 'Genesis 23:1-25:18');
  const old = ctx.Shabbat.view(parsed(ctx, NOV), IL('2026-11-02T12:00:00+02:00'), '2026-11-02', cfg);
  assert.equal(old.window.reading, null, 'an answer without readings (leyning off): no reading, never made up');
});
