'use strict';
// Batch 15 (the owner, 2026-11-02: «да, добавь MET Norway как запасной»; «каждый раз пытаться первый вариант - при ошибке
// второй»): MET Norway's answers mapped into the same Weather model (js/met.js), and its request round.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js', 'js/openmeteo.js', 'js/i18n.js', 'js/met.js'];
const MET = path.join(__dirname, 'fixtures', 'met');
const met = (name) => JSON.parse(fs.readFileSync(path.join(MET, name + '.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
// The fixtures were asked for at 2026-11-02 15:2x UTC (17:2x in Israel); their first step is 15:00 UTC.
const ASKED = Date.parse('2026-11-02T15:25:00Z');
function wallFor(ctx, zones) {
  const r = ctx.Tz.resolve({ zones }, ASKED, ctx.Intl);
  return (ms) => ctx.Tz.wallTime(r, ms);
}
const ISRAEL = ['Asia/Jerusalem'], KYIV = ['Europe/Kyiv', 'Europe/Kiev'];
const cfg = { days: 7 };
// A synthetic answer: steps [time, temp, { n1, n6: [symbol, min, max], n12, uv }].
function answer(steps) {
  return { properties: { timeseries: steps.map(([time, t, o = {}]) => ({ time, data: {
    instant: { details: { air_temperature: t, apparent_air_temperature: t - 1, relative_humidity: 50, wind_speed: 2, ultraviolet_index_clear_sky: o.uv } },
    next_1_hours: o.n1 ? { summary: { symbol_code: o.n1 }, details: {} } : undefined,
    next_6_hours: o.n6 ? { summary: { symbol_code: o.n6[0] }, details: { air_temperature_min: o.n6[1], air_temperature_max: o.n6[2] } } : undefined,
    next_12_hours: o.n12 ? { summary: { symbol_code: o.n12 } } : undefined } })) } };
}

test('M15: every MET symbol (tests/fixtures/met/legend.csv, MET\'s own list) and each of its variants maps to a WMO code the app names', () => {
  const ctx = load(FILES);
  const rows = fs.readFileSync(path.join(MET, 'legend.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  assert.equal(rows.length, 41, 'MET publishes 41 symbols');
  for (const [id, , , , , variants] of rows) {
    const base = id.trim(), names = variants.trim() === '1' ? ['_day', '_night', '_polartwilight'].map((v) => base + v) : [base];
    for (const s of names) {
      const wmo = ctx.Met.code(s);
      assert.equal(typeof wmo, 'number', s);
      for (const lang of ['ru', 'he', 'uk']) { ctx.I18n.setLang(lang); assert.notEqual(ctx.I18n.condition(wmo), '', s + ' ' + lang); }
    }
  }
  const spot = ['clearsky_night', 'fair_day', 'partlycloudy_day', 'cloudy', 'fog', 'lightrain', 'rain', 'heavyrain', 'rainshowers_day',
    'heavyrainshowers_night', 'lightsnow', 'sleet', 'rainandthunder', 'lightssnowshowersandthunder_day'].map((s) => ctx.Met.code(s));
  assert.deepEqual(spot, [0, 1, 2, 3, 45, 61, 63, 65, 81, 82, 71, 73, 95, 95]);
  assert.deepEqual([ctx.Met.code('volcanicash'), ctx.Met.code('')], [null, null], 'not in MET\'s list: no code');
});

test('M15: the recorded Rehovot answer → the model: current from the step at the time asked, hourly in Israel time, 7 days, no rain chance', () => {
  const ctx = load(FILES), wall = wallFor(ctx, ISRAEL);
  const m = plain(ctx.Met.parse({ fetchedAt: ASKED, forecast: met('rehovot'), sun: met('sun-rehovot') }, cfg, wall));
  const first = met('rehovot').properties.timeseries[0].data;
  assert.deepEqual(m.current, { temp: first.instant.details.air_temperature, feels: first.instant.details.apparent_air_temperature,
    code: ctx.Met.code(first.next_1_hours.summary.symbol_code), isDay: !/_night$/.test(first.next_1_hours.summary.symbol_code),
    wind: first.instant.details.wind_speed * 3.6, humidity: first.instant.details.relative_humidity, hourKey: '2026-11-02T17' });
  assert.deepEqual(m.hourly.slice(0, 3).map((h) => h.key), ['2026-11-02T17', '2026-11-02T18', '2026-11-02T19'], 'UTC 15:00 = 17:00 in Israel');
  assert.ok(m.hourly.length >= 48, 'MET\'s hourly steps: about two and a half days');
  assert.ok(m.hourly.every((h) => h.pop === null), 'no chance of rain is ever invented');
  assert.equal(m.daily.length, 7);
  assert.deepEqual(m.daily.map((d) => d.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.ok(m.daily.every((d) => d.pop === null && typeof d.code === 'number'));
  // FIX-15B Y3 (owner D-F1 «прочерк»): today «—»; every later day has its range
  assert.deepEqual([m.daily[0].min, m.daily[0].max, m.daily[0].uvMax], [null, null, null]);
  assert.ok(m.daily.slice(1).every((d) => typeof d.min === 'number' && typeof d.max === 'number' && d.min <= d.max));
  assert.deepEqual([m.daily[0].sunrise, m.daily[0].sunset, m.daily[1].sunrise], ['05:57', '16:50', null], 'the sun of its own date only');
  assert.equal(typeof m.daily[1].uvMax, 'number', 'UV max from the clear-sky index');
});

test('M15: every recorded place parses in its own wall time (Kyiv +2, Sydney +11)', () => {
  const ctx = load(FILES);
  const zones = { rehovot: ISRAEL, kyiv: KYIV, sydney: ['Australia/Sydney'], haifa: ISRAEL, telaviv: ISRAEL, beersheva: ISRAEL };
  const first = { rehovot: '2026-11-02T17', kyiv: '2026-11-02T17', sydney: '2026-11-03T02', haifa: '2026-11-02T17', telaviv: '2026-11-02T17', beersheva: '2026-11-02T17' };
  for (const id of Object.keys(zones)) {
    const m = ctx.Met.parse({ fetchedAt: ASKED, forecast: met(id), sun: met('sun-' + id) }, cfg, wallFor(ctx, zones[id]));
    assert.equal(m.current.hourKey, first[id], id);
    assert.equal(m.daily.length, 7, id);
  }
});

test('M15: UTC → wall time across midnight (the step at 22:00 UTC is tomorrow 00:00 in Israel) and across the end of DST (Kyiv repeats 03:00)', () => {
  const ctx = load(FILES);
  const mid = ctx.Met.parse({ fetchedAt: Date.parse('2026-11-02T21:00:00Z'), forecast: answer([['2026-11-02T21:00:00Z', 15, { n1: 'clearsky_night' }],
    ['2026-11-02T22:00:00Z', 14, { n1: 'clearsky_night' }], ['2026-11-02T23:00:00Z', 13, { n1: 'clearsky_night' }]]), sun: null }, cfg, wallFor(ctx, ISRAEL));
  assert.deepEqual(plain(mid.hourly.map((h) => h.key)), ['2026-11-02T23', '2026-11-03T00', '2026-11-03T01']);
  assert.deepEqual(plain(mid.daily.map((d) => [d.date, d.min, d.max])), [['2026-11-02', null, null], ['2026-11-03', 13, 14]], 'today «—» (D-F1)');
  // EU summer time ends 2026-10-25 at 01:00 UTC: Kyiv 03:59 (+3) → 03:00 (+2)
  const dst = ctx.Met.parse({ fetchedAt: Date.parse('2026-10-24T22:00:00Z'), forecast: answer(['2026-10-24T22:00:00Z', '2026-10-24T23:00:00Z',
    '2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z'].map((t) => [t, 10, { n1: 'cloudy' }])), sun: null }, cfg, wallFor(ctx, KYIV));
  assert.deepEqual(plain(dst.hourly.map((h) => h.hour)), ['01', '02', '03', '03', '04']);
});

test('M15: a day\'s min/max spans MET\'s hourly readings and, where the hourly steps end, the 6-hour ranges; the symbol is midday\'s', () => {
  const ctx = load(FILES);
  // Israel (+2): 10:00–12:00 hourly, then 6-hour steps at 14:00 and 20:00 local whose ranges reach 31° and 18°
  // FIX-15B: the day under test is tomorrow (today has no range under MET, D-F1): a step the evening before is "now"
  const m = ctx.Met.parse({ fetchedAt: Date.parse('2026-11-03T17:00:00Z'), forecast: answer([
    ['2026-11-03T17:00:00Z', 22, { n1: 'clearsky_night' }],
    ['2026-11-04T08:00:00Z', 24, { n1: 'fair_day', n6: ['fair_day', 23, 35], uv: 5 }],   // an hourly step's own 6-hour range: not counted
    ['2026-11-04T09:00:00Z', 26, { n1: 'fair_day', n6: ['fair_day', 23, 29], uv: 6.4 }],
    ['2026-11-04T10:00:00Z', 27, { n1: 'rain', n6: ['rain', 22, 28], n12: 'rainshowers_day', uv: 6 }],
    ['2026-11-04T12:00:00Z', 28, { n6: ['cloudy', 25, 31] }],
    ['2026-11-04T18:00:00Z', 20, { n6: ['clearsky_night', 18, 21] }]]), sun: null }, cfg, wallFor(ctx, ISRAEL));
  assert.deepEqual(plain(m.daily[1]), { date: '2026-11-04', weekday: 3, code: 81, min: 20, max: 31, pop: null, sunrise: null, sunset: null, uvMax: 6.4 },
    'max 31 from the 14:00–20:00 range; min 20 from the 20:00 reading — the 20:00–02:00 range (18°) crosses midnight and counts in neither day ' +
    '(FIX-15B Y4); the hourly steps\' own 6-hour ranges are not counted; 12:00 local → its 12-hour summary');
  assert.deepEqual(plain(m.hourly.map((h) => h.key)), ['2026-11-03T19', '2026-11-04T10', '2026-11-04T11', '2026-11-04T12'], 'hourly: only the 1-hour steps');
});

test('M15: day or night from the symbol, else from the sun of that date', () => {
  const ctx = load(FILES), wall = wallFor(ctx, ISRAEL);
  const sun = { properties: { sunrise: { time: '2026-11-02T05:57+02:00' }, sunset: { time: '2026-11-02T16:50+02:00' } } };
  const at = (utc, sym) => ctx.Met.parse({ fetchedAt: Date.parse(utc), forecast: answer([[utc, 20, { n1: sym }]]), sun }, cfg, wall).current.isDay;
  assert.deepEqual([at('2026-11-02T10:00:00Z', 'clearsky_night'), at('2026-11-02T10:00:00Z', 'rain'), at('2026-11-02T16:00:00Z', 'rain'),
    at('2026-11-02T03:00:00Z', 'cloudy')], [false, true, false, false], '18:00 and 05:00 local are night by the sun');
});

test('M15: no usable current step → the place fails (throws); slim keeps exactly what parse reads', () => {
  const ctx = load(FILES), wall = wallFor(ctx, ISRAEL);
  assert.throws(() => ctx.Met.parse({ fetchedAt: ASKED, forecast: null, sun: null }, cfg, wall));
  assert.throws(() => ctx.Met.parse({ fetchedAt: ASKED, forecast: answer([['2026-11-02T15:00:00Z', 20, { n1: 'volcanicash' }]]), sun: null }, cfg, wall));
  assert.throws(() => ctx.Met.parse({ fetchedAt: ASKED, forecast: answer([['2026-11-02T15:00:00Z', null, { n1: 'fair_day' }]]), sun: null }, cfg, wall));
  const raw = met('rehovot'), slim = ctx.Met.slim(raw);
  assert.deepEqual(plain(ctx.Met.parse({ fetchedAt: ASKED, forecast: slim, sun: null }, cfg, wall)),
    plain(ctx.Met.parse({ fetchedAt: ASKED, forecast: raw, sun: null }, cfg, wall)));
  const size = JSON.stringify(slim).length, full = JSON.stringify(raw).length;
  assert.ok(size < full * 0.6, 'slim ' + size + ' of ' + full + ' chars');   // measured 35,817 of 62,405 (57 %)
});

// The round: every request of the round starts before any answer comes (parallel), done once at the end.
function fetcher(ctx, opts = {}) {
  let now = ASKED;
  const calls = [];
  const deps = { now: () => now, wallOf: (p) => wallFor(ctx, p.id === 'kyiv' ? KYIV : ISRAEL),
    getJsonExpiring: (url, ms, done) => calls.push({ url, ms, done }) };
  return { f: ctx.Met.fallback(ctx.Config.weather, deps), calls, at: (t) => { now = t; } };
}
const PLACES = [{ id: 'home', lat: 31.8928, lon: 34.8113 }, { id: 'kyiv', lat: 50.4501, lon: 30.5234 }];
const EXPIRES = 'Mon, 02 Nov 2026 15:59:48 GMT';

test('M15: a MET round asks every place\'s forecast and sun at once (one request per place each), 15 s each, done once', () => {
  const ctx = load(FILES), h = fetcher(ctx), out = [];
  h.f.fetch(PLACES, (err, list) => out.push([err, list]));
  assert.deepEqual(h.calls.map((c) => [c.url, c.ms]), [
    ['https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=31.8928&lon=34.8113', 15000],
    ['https://api.met.no/weatherapi/sunrise/3.0/sun?lat=31.8928&lon=34.8113&date=2026-11-02&offset=%2B02:00', 15000],
    ['https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=50.4501&lon=30.5234', 15000],
    ['https://api.met.no/weatherapi/sunrise/3.0/sun?lat=50.4501&lon=30.5234&date=2026-11-02&offset=%2B02:00', 15000]], 'all four before any answer');
  h.calls[0].done(null, met('rehovot'), { expires: EXPIRES });
  h.calls[1].done(null, met('sun-rehovot'), { expires: EXPIRES });
  h.calls[2].done('http 503');
  assert.equal(out.length, 0, 'not before the last answer');
  h.calls[3].done('timeout');
  assert.equal(out.length, 1);
  const [err, list] = out[0];
  assert.equal(err, null);
  assert.deepEqual([list[0].fetchedAt, !!list[0].forecast, !!list[0].sun, list[1].forecast, list[1].sun], [ASKED, true, true, null, null]);
  assert.deepEqual(plain(list[0].forecast), plain(ctx.Met.slim(met('rehovot'))), 'the forecast kept slim');
});

test('M15: MET\'s terms — a forecast is not asked again before its Expires (the kept one is used); the sun once per place per date', () => {
  const ctx = load(FILES), h = fetcher(ctx), out = [];
  h.f.fetch(PLACES.slice(0, 1), (e, l) => out.push(l));
  h.calls[0].done(null, met('rehovot'), { expires: EXPIRES });
  h.calls[1].done(null, met('sun-rehovot'), {});
  h.at(Date.parse('2026-11-02T15:45:00Z'));
  h.f.fetch(PLACES.slice(0, 1), (e, l) => out.push(l));
  assert.equal(h.calls.length, 2, 'within Expires and the same date: no request');
  assert.deepEqual([out[1][0].fetchedAt, !!out[1][0].forecast, !!out[1][0].sun], [Date.parse('2026-11-02T15:45:00Z'), true, true]);
  h.at(Date.parse('2026-11-02T16:00:00Z'));
  h.f.fetch(PLACES.slice(0, 1), (e, l) => out.push(l));
  assert.deepEqual(h.calls.slice(2).map((c) => c.url.split('?')[0].split('/').pop()), ['complete'], 'past Expires: the forecast only');
  h.calls[2].done(null, met('rehovot'), { expires: '' });
  h.at(Date.parse('2026-11-02T16:00:30Z'));
  h.f.fetch(PLACES.slice(0, 1), () => {});
  assert.equal(h.calls.length, 4, 'no Expires: asked again on the next round');
  h.at(Date.parse('2026-11-02T22:30:00Z'));   // 00:30 on the 3rd in Israel: a new date
  h.f.fetch(PLACES.slice(0, 1), () => {});
  assert.ok(h.calls.slice(4).some((c) => c.url.indexOf('date=2026-11-03') > 0), 'a new date: its sun is asked');
});

test('M15: the current weather is the step at or just before the time the answer was asked for, not MET\'s first step', () => {
  const ctx = load(FILES), wall = wallFor(ctx, ISRAEL);
  const steps = ['2026-11-02T15:00:00Z', '2026-11-02T16:00:00Z', '2026-11-02T17:00:00Z', '2026-11-02T18:00:00Z'].map((t, i) => [t, 20 + i, { n1: 'cloudy' }]);
  const m = ctx.Met.parse({ fetchedAt: Date.parse('2026-11-02T17:40:00Z'), forecast: answer(steps), sun: null }, cfg, wall);
  assert.deepEqual([m.current.temp, m.current.hourKey, m.hourly[0].key], [22, '2026-11-02T19', '2026-11-02T19'], '17:00 UTC (19:00 in Israel): the step at or before 17:40');
});

// ---- FIX-15B (the 2-reviewer panel, 2026-11-02): Y1–Y9 ----
// Y7: MET's 41 symbols, each with its expected WMO code written out here (not computed from the code under test).
const EXPECTED_WMO = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightrainshowersandthunder: 95, rainshowersandthunder: 95, heavyrainshowersandthunder: 95,
  lightsleetshowers: 85, sleetshowers: 85, heavysleetshowers: 86,
  lightssleetshowersandthunder: 95, sleetshowersandthunder: 95, heavysleetshowersandthunder: 95,
  lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
  lightssnowshowersandthunder: 95, snowshowersandthunder: 95, heavysnowshowersandthunder: 95,
  lightrain: 61, rain: 63, heavyrain: 65, lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 95,
  lightsleet: 71, sleet: 73, heavysleet: 75, lightsleetandthunder: 95, sleetandthunder: 95, heavysleetandthunder: 95,
  lightsnow: 71, snow: 73, heavysnow: 75, lightsnowandthunder: 95, snowandthunder: 95, heavysnowandthunder: 95
};
test('Y7: every one of MET\'s 41 symbols and each variant maps to ITS expected WMO code', () => {
  const ctx = load(FILES);
  const rows = fs.readFileSync(path.join(MET, 'legend.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  assert.deepEqual(rows.map((r) => r[0].trim()).sort(), Object.keys(EXPECTED_WMO).sort(), 'the expected table covers MET\'s list exactly');
  for (const [id, , , , , variants] of rows) {
    const base = id.trim();
    for (const s of variants.trim() === '1' ? ['_day', '_night', '_polartwilight'].map((v) => base + v) : [base]) assert.equal(ctx.Met.code(s), EXPECTED_WMO[base], s);
  }
});

const HOUR = 3600000;
// A fallback over fake requests: answer(i, err, json, meta) answers the i-th request; places and their zones as the App's.
function round(ctx, opts = {}) {
  let now = opts.at || ASKED;
  const calls = [];
  const wallOf = (p) => wallFor(ctx, p.id === 'kyiv' ? KYIV : p.id === 'sydney' ? ['Australia/Sydney'] : ISRAEL);
  const f = ctx.Met.fallback(ctx.Config.weather, { now: () => now, wallOf, getJsonExpiring: (url, ms, done) => calls.push({ url, done }) });
  return { f, calls, wallOf, at: (t) => { now = t; }, fetch: (places) => { const out = []; f.fetch(places, (e, l) => out.push(l)); return out; } };
}
const ONE = [{ id: 'home', lat: 31.8928, lon: 34.8113 }];
const forecastCalls = (calls) => calls.filter((c) => c.url.indexOf('/complete?') > 0);

test('Y1: a MET answer that cannot be read ({}, a step without instant.details) ends the round: that place not received, the others kept', () => {
  const ctx = load(FILES), h = round(ctx);
  const broken = met('rehovot'); delete broken.properties.timeseries[3].data.instant.details;
  const places = [ONE[0], { id: 'haifa', lat: 32.794, lon: 34.9896 }, { id: 'kyiv', lat: 50.4501, lon: 30.5234 }];
  const out = h.fetch(places);
  const answers = [{}, broken, met('kyiv')];
  forecastCalls(h.calls).forEach((c, i) => assert.doesNotThrow(() => c.done(null, answers[i], { expires: EXPIRES })));
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0).forEach((c) => assert.doesNotThrow(() => c.done(null, { nonsense: true }, {})));
  assert.equal(out.length, 1, 'the round ended');
  assert.deepEqual(plain(out[0].map((e) => !!e.forecast)), [false, false, true]);
  h.at(ASKED + 60000);
  h.fetch(places);
  assert.equal(forecastCalls(h.calls).length, 3 + 2, 'what could not be read was not kept: asked again; kyiv reused');
});

test('Y2: a cancelled round\'s late answers never replace a newer round\'s kept forecast (out of order)', () => {
  const ctx = load(FILES), h = round(ctx);
  h.fetch(ONE);                                   // round A
  h.f.cancel();                                   // the store stopped
  const b = h.fetch(ONE);                         // round B
  const a = { fc: forecastCalls(h.calls)[0] }, bf = forecastCalls(h.calls)[1];
  bf.done(null, met('rehovot'), { expires: EXPIRES });
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0)[1].done(null, met('sun-rehovot'), {});
  const sentinel = met('rehovot'); sentinel.properties.timeseries.forEach((s) => { s.data.instant.details.air_temperature = 50; });
  a.fc.done(null, sentinel, { expires: EXPIRES });
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0)[0].done(null, met('sun-rehovot'), {});
  h.at(ASKED + 60000);
  const c = h.fetch(ONE);
  assert.equal(forecastCalls(h.calls).length, 2, 'B\'s forecast reused');
  assert.notEqual(c[0][0].forecast.properties.timeseries[0].data.instant.details.air_temperature, 50, 'A\'s late answer was ignored');
  assert.equal(b.length, 1);
});

test('Y3 (owner D-F1 «прочерк»): under MET today\'s max, min and UV max are «—» (null); its symbol stays; the next days have theirs', () => {
  const ctx = load(FILES), wall = wallFor(ctx, ISRAEL);
  const at = Date.parse('2026-11-02T19:00:00Z');                     // 21:00 in Israel
  const m = plain(ctx.Met.parse({ fetchedAt: at, forecast: met('rehovot'), sun: met('sun-rehovot') }, cfg, wall));
  assert.equal(m.daily[0].date, '2026-11-02');
  assert.deepEqual([m.daily[0].min, m.daily[0].max, m.daily[0].uvMax, typeof m.daily[0].code], [null, null, null, 'number']);
  assert.ok(m.daily.slice(1).every((d) => typeof d.min === 'number' && typeof d.max === 'number'));
});

test('Y4: a 6-hour range that crosses the local midnight is counted in neither day (Israel, Kyiv, Sydney)', () => {
  const ctx = load(FILES);
  // 6-hour steps only (where MET's hourly steps end); one range crosses midnight with extremes 40° / -5° that must not count
  const cases = [['Israel', ISRAEL, ['2026-11-07T12:00:00Z', '2026-11-07T18:00:00Z', '2026-11-08T00:00:00Z']],   // 14:00, 20:00 (→02:00), 02:00
    ['Kyiv', KYIV, ['2026-11-07T12:00:00Z', '2026-11-07T18:00:00Z', '2026-11-08T00:00:00Z']],                  // same offsets in November
    ['Sydney', ['Australia/Sydney'], ['2026-11-07T00:00:00Z', '2026-11-07T12:00:00Z', '2026-11-07T18:00:00Z']]]; // 11:00, 23:00 (→05:00), 05:00
  for (const [name, zones, [t1, t2, t3]] of cases) {
    const m = plain(ctx.Met.parse({ fetchedAt: Date.parse(t1), forecast: answer([[t1, 20, { n6: ['cloudy', 18, 22] }], [t2, 19, { n6: ['cloudy', -5, 40] }],
      [t3, 15, { n6: ['cloudy', 14, 17] }]]), sun: null }, cfg, wallFor(ctx, zones)));
    const later = m.daily.slice(1);
    assert.ok(later.length >= 1, name);
    for (const d of m.daily) assert.ok((d.max === null || d.max < 40) && (d.min === null || d.min > -5), name + ' ' + JSON.stringify(d));
  }
  // a range wholly inside the day counts: Israel 08:00–14:00 (06:00 UTC)
  const inside = plain(ctx.Met.parse({ fetchedAt: Date.parse('2026-11-06T06:00:00Z'), forecast: answer([['2026-11-06T06:00:00Z', 20, { n6: ['cloudy', 18, 22] }],
    ['2026-11-07T06:00:00Z', 20, { n6: ['cloudy', 11, 31] }]]), sun: null }, cfg, wallFor(ctx, ISRAEL)));
  assert.deepEqual([inside.daily[1].min, inside.daily[1].max], [11, 31]);
});

test('Y5: sunrise and sunset are instants shown on the place\'s clock — Kyiv 2026-10-25 (summer time ends at 04:00 local)', () => {
  const ctx = load(FILES), wall = wallFor(ctx, KYIV);
  // asked the day before with the summer offset +03:00: 07:40+03:00 is 04:40 UTC = 06:40 on Kyiv's winter clock
  const sun = { properties: { sunrise: { time: '2026-10-25T07:40+03:00' }, sunset: { time: '2026-10-25T17:30+03:00' } } };
  const m = ctx.Met.parse({ fetchedAt: Date.parse('2026-10-24T21:30:00Z'), forecast: answer([['2026-10-24T21:00:00Z', 9, { n1: 'cloudy' }],
    ['2026-10-25T06:00:00Z', 9, { n1: 'cloudy' }]]), sun }, cfg, wall);
  const day = m.daily.find((d) => d.date === '2026-10-25');
  assert.deepEqual([day.sunrise, day.sunset], ['06:40', '16:30']);
});

test('Y6: after a restart the kept MET answers come back with their arrival time and Expires: inside it a round asks nothing; they stay restored', () => {
  const ctx = load(FILES), h = round(ctx);
  const first = h.fetch(ONE);
  forecastCalls(h.calls)[0].done(null, met('rehovot'), { expires: EXPIRES });
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0)[0].done(null, met('sun-rehovot'), {});
  const saved = JSON.parse(JSON.stringify(first[0]));
  assert.deepEqual([saved[0].at, saved[0].until, saved[0].url], [ASKED, Date.parse(EXPIRES), ctx.Met.forecastUrl(ctx.Config.weather.met, ONE[0])]);
  const after = round(ctx, { at: ASKED + 10 * 60000 });             // a new app, 10 minutes later
  after.f.restore(saved, ONE);
  const out = after.fetch(ONE);
  assert.equal(after.calls.length, 0, 'no GET inside Expires, the sun of the same date kept');
  assert.deepEqual(plain(after.f.stamp(out[0][0])), { at: ASKED, restored: true }, 'the arrival time; restored until a live answer');
  assert.deepEqual(plain(h.f.stamp(first[0][0])), { at: ASKED, restored: false });
});

test('Y8: a forecast reused inside Expires keeps its arrival time; reuse ends at min(Expires, arrival + 60 min) — a clock behind cannot stretch it', () => {
  const ctx = load(FILES), h = round(ctx);
  h.fetch(ONE);
  forecastCalls(h.calls)[0].done(null, met('rehovot'), { expires: 'Tue, 03 Nov 2026 15:25:00 GMT' });   // a day ahead (a wrong clock)
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0)[0].done(null, met('sun-rehovot'), {});
  h.at(ASKED + 59 * 60000);
  const kept = h.fetch(ONE);
  assert.deepEqual([forecastCalls(h.calls).length, h.f.stamp(kept[0][0]).at], [1, ASKED], 'reused: its arrival time, not now');
  h.at(ASKED + 60 * 60000);
  h.fetch(ONE);
  assert.equal(forecastCalls(h.calls).length, 2, 'an hour after it arrived: asked again');
});

test('Y9: the fast wall clock (one offset per window) gives the same model as the clock per step, on all 6 recorded places', () => {
  const ctx = load(FILES);
  const zones = { rehovot: ISRAEL, kyiv: KYIV, sydney: ['Australia/Sydney'], haifa: ISRAEL, telaviv: ISRAEL, beersheva: ISRAEL };
  for (const id of Object.keys(zones)) {
    const wall = wallFor(ctx, zones[id]), el = { fetchedAt: ASKED, forecast: met(id), sun: met('sun-' + id) };
    let calls = 0;
    const counted = (ms) => { calls++; return wall(ms); };
    // the same clock, but reporting a different offset at the far end of the window: forces the per-step path
    const ts = el.forecast.properties.timeseries, last = Date.parse(ts[ts.length - 1].time);
    const perStep = (ms) => (ms >= last ? Object.assign({}, wall(ms), { offset: wall(ms).offset + 1 }) : wall(ms));
    assert.deepEqual(plain(ctx.Met.parse(el, cfg, counted)), plain(ctx.Met.parse(el, cfg, perStep)), id);
    assert.ok(calls <= 6, id + ': ' + calls + ' wall-clock lookups, not one per step');
  }
});

test('Y2: a round cancelled with no round after it writes nothing: its late answers are not kept', () => {
  const ctx = load(FILES), h = round(ctx);
  const out = h.fetch(ONE);
  h.f.cancel();
  forecastCalls(h.calls)[0].done(null, met('rehovot'), { expires: EXPIRES });
  h.calls.filter((c) => c.url.indexOf('/sun?') > 0)[0].done(null, met('sun-rehovot'), {});
  assert.equal(out.length, 0, 'the cancelled round never reports');
  h.at(ASKED + 60000);
  h.fetch(ONE);
  assert.equal(h.calls.length, 4, 'nothing was kept: the next round asks its forecast and sun again');
});

// FIX-BATCH-18 part B (register b15: MET sun times parsed with Date.parse on «…T07:40+03:00», no seconds — valid ES5.1, unproven
// on the TV's 2015 engine): the parse no longer depends on the engine's Date.parse at all — with a Date.parse that refuses
// every string the recorded answer gives the same model (Tz.instant reads the offset by hand).
test('B18: MET parses with an engine whose Date.parse reads nothing — the same model, the same sun times', () => {
  const NoParse = function () { return Reflect.construct(Date, arguments); };
  Object.setPrototypeOf(NoParse, Date); NoParse.prototype = Date.prototype; NoParse.parse = () => NaN; NoParse.UTC = Date.UTC; NoParse.now = Date.now;
  const input = () => ({ fetchedAt: ASKED, forecast: met('rehovot'), sun: met('sun-rehovot') });
  const ref = load(FILES), old = load(FILES, { Date: NoParse });
  const a = plain(ref.Met.parse(input(), cfg, wallFor(ref, ISRAEL))), b = plain(old.Met.parse(input(), cfg, wallFor(old, ISRAEL)));
  assert.deepEqual(b, a);
  assert.deepEqual([b.daily[0].sunrise, b.daily[0].sunset], ['05:57', '16:50']);
});

// FIX-BATCH-19 6 (perf B18-P2): a kept MET answer reused by the next rounds of the same hour is not parsed again — the same
// model comes back (counted: the steps' first-time read happens once); a new hour, a new answer or a new sun parses afresh.
test('B19 item 6: one parse per place and hour — a reused answer gives the same model; a new hour or answer parses again', () => {
  const ctx = load(FILES), place = { id: 'home', lat: 31.8928, lon: 34.8113 };
  let reads = 0; const inst = ctx.Tz.instant;
  ctx.Tz.instant = (s) => { if (s === '2026-11-02T15:00:00Z') reads++; return inst(s); };
  const f = ctx.Met.fallback(ctx.Config.weather, { now: () => ASKED, wallOf: () => wallFor(ctx, ISRAEL), getJsonExpiring: () => {} });
  const forecast = met('rehovot'), sun = met('sun-rehovot');
  const el = (at) => ({ fetchedAt: at, forecast, sun });
  const a = f.parse(el(ASKED), ctx.Config.weather, place), once = reads;
  const b = f.parse(el(ASKED + 20 * 60000), ctx.Config.weather, place);
  assert.equal(b, a, 'the same answer 20 minutes later, the same hour: the same model');
  assert.equal(reads, once, 'not parsed again');
  const c = f.parse(el(ASKED + 60 * 60000), ctx.Config.weather, place);
  assert.notEqual(c, a, 'the next hour: parsed again (its current step moves)');
  assert.deepEqual(plain(c.current.hourKey), '2026-11-02T18');
  const d = f.parse({ fetchedAt: ASKED + 60 * 60000, forecast: met('rehovot'), sun }, ctx.Config.weather, place);
  assert.notEqual(d, c, 'a new answer: parsed again');
});

// FIX-19B C3 (Codex P2): the parse-once cache keys on the absolute hour. Kyiv's clocks go back on 2026-10-25: 00:30Z and
// 01:15Z are both 03:xx on the wall, but two different MET steps (10° then 11°) — the second read gets the second step.
test('FIX-19B C3: the repeated DST wall hour is two hours — Kyiv 00:30Z / 01:15Z on 2026-10-25 give 10° then 11°', () => {
  const ctx = load(FILES), at = Date.parse('2026-10-25T00:30:00Z'), later = Date.parse('2026-10-25T01:15:00Z');
  const r = ctx.Tz.resolve({ zones: KYIV }, at, ctx.Intl), wall = (ms) => ctx.Tz.wallTime(r, ms);
  assert.equal(ctx.Tz.hourKey(wall(at)), ctx.Tz.hourKey(wall(later)), 'the same wall hour (the premise)');
  const forecast = { properties: { timeseries: ['00', '01', '02'].map((h, i) => ({ time: '2026-10-25T' + h + ':00:00Z',
    data: { instant: { details: { air_temperature: 10 + i } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } })) } };
  const f = ctx.Met.fallback(ctx.Config.weather, { wallOf: () => wall, now: () => at, getJsonExpiring: () => {} }), place = { id: 'kyiv' };
  assert.equal(f.parse({ fetchedAt: at, forecast, sun: null }, cfg, place).current.temp, 10);
  assert.equal(f.parse({ fetchedAt: later, forecast, sun: null }, cfg, place).current.temp, 11);
});
// FIX-19B C10 (native L2): the sun is part of the cache key — with no sun in the first round and the sun in the second round of
// the same hour, the model carries the sun times.
test('FIX-19B C10: the sun arriving later in the same hour gives a model with the sun times', () => {
  const ctx = load(FILES), place = { id: 'home', lat: 31.8928, lon: 34.8113 }, forecast = met('rehovot');
  const f = ctx.Met.fallback(ctx.Config.weather, { now: () => ASKED, wallOf: () => wallFor(ctx, ISRAEL), getJsonExpiring: () => {} });
  const a = f.parse({ fetchedAt: ASKED, forecast, sun: null }, ctx.Config.weather, place);
  assert.equal(a.daily[0].sunrise, null, 'round 1: no sun yet');
  const b = f.parse({ fetchedAt: ASKED + 10 * 60000, forecast, sun: met('sun-rehovot') }, ctx.Config.weather, place);
  assert.deepEqual([b.daily[0].sunrise, b.daily[0].sunset], ['05:57', '16:50'], 'round 2, same hour: the sun times');
});
