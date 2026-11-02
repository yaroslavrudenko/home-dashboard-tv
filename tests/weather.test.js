'use strict';
// Weather: the one Open-Meteo request, parsing of real recorded answers (tests/fixtures, 2026-10-29), the
// wall-clock window, and the refresh cycle — last good data kept on failure, the stale marker, jittered
// bounded back-off, stop().
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/tz.js', 'js/refresher.js', 'js/placestore.js', 'js/openmeteo.js', 'js/weather.js'];   // batch 12: the store body lives in PlaceStore
const T0 = Date.parse('2026-10-29T18:32:00Z');

test('one URL carries every place (comma-separated coordinates), current, hourly and daily data, with no key', () => {
  const ctx = load(FILES);
  const u = new URL(ctx.Weather.url(ctx.Config.places, ctx.Config.weather));
  assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(u.searchParams.get('latitude'), '31.8928,50.4501,-33.8688,32.794,32.0853,31.2518');   // FB5-WX: + Haifa, Tel Aviv, Beer Sheva
  assert.equal(u.searchParams.get('longitude'), '34.8113,30.5234,151.2093,34.9896,34.7818,34.7913');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('forecast_days'), '7');
  assert.equal(u.searchParams.get('forecast_hours'), '24', 'only the hourly rows the strip can use');
  for (const p of ['current', 'hourly', 'daily']) assert.ok(u.searchParams.get(p), p);
  assert.ok(!/key|token|appid/i.test(u.search), 'no API key');
});

// Batch 10: the main place is the home city's ('home'; Rehovot by default, js/homecity.js), never a region's id.
test('Rehovot is the default (main) place; Kyiv and Sydney are optional extras', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Config.places[0].id, 'home');
  assert.deepEqual([ctx.Config.places[0].lat, ctx.Config.places[0].lon], [31.8928, 34.8113]);
});

for (const id of ['rehovot', 'kyiv', 'sydney']) {
  test('parses the recorded ' + id + ' answer into the view model', () => {
    const ctx = load(FILES);
    const cfg = ctx.Config.weather;
    const json = fixture(id);
    const m = ctx.Weather.parse(json, cfg);
    assert.equal(m.current.temp, json.current.temperature_2m);
    assert.equal(m.current.feels, json.current.apparent_temperature);
    assert.equal(m.current.humidity, json.current.relative_humidity_2m);
    assert.equal(m.current.wind, json.current.wind_speed_10m);
    assert.equal(m.current.code, json.current.weather_code);
    const v = ctx.Weather.forHour(m, null, cfg);
    assert.equal(v.hourly.length, 12);
    assert.equal(v.nowShown, true);
    assert.equal(v.hourly[0].hour, json.current.time.slice(11, 13), 'the strip starts at the current local hour');
    assert.ok(v.hourly.every(Boolean), 'twelve real hours');
    assert.equal(v.daily.length, 7);
    assert.equal(v.daily[0].date, json.daily.time[0]);
    assert.equal(v.today, v.daily[0]);
    assert.equal(v.today.max, json.daily.temperature_2m_max[0]);
    assert.equal(v.today.min, json.daily.temperature_2m_min[0]);
    assert.equal(v.today.sunrise, json.daily.sunrise[0].slice(11, 16));
    assert.equal(v.today.sunset, json.daily.sunset[0].slice(11, 16));
    assert.match(v.today.sunrise, /^\d\d:\d\d$/);
  });
}

test('a malformed answer is refused (throws), never shown half-filled', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.weather;
  assert.throws(() => ctx.Weather.parse({}, cfg));
  assert.throws(() => ctx.Weather.parse(null, cfg));
  const noTemp = fixture('rehovot'); delete noTemp.current.temperature_2m;
  assert.throws(() => ctx.Weather.parse(noTemp, cfg), /temperature_2m/);
  const noCode = fixture('rehovot'); noCode.current.weather_code = 'x';
  assert.throws(() => ctx.Weather.parse(noCode, cfg), /weather_code/);
});

// Decision 4 (Codex 1, F7): a missing forecast cell or array never discards valid current weather.
test('missing forecast cells and arrays keep the current weather and become placeholders', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.weather;
  const json = fixture('rehovot');
  const start = json.hourly.time.findIndex((t) => t.slice(0, 13) === json.current.time.slice(0, 13));
  json.hourly.temperature_2m[start + 1] = null;
  json.daily.temperature_2m_min[2] = null;
  delete json.hourly.precipitation_probability;
  delete json.hourly.is_day;
  delete json.daily.precipitation_probability_max;
  const v = ctx.Weather.forHour(ctx.Weather.parse(json, cfg), null, cfg);
  assert.equal(v.current.temp, json.current.temperature_2m);
  assert.equal(v.hourly[1].temp, null);
  assert.equal(v.hourly[0].pop, null);
  assert.equal(v.daily[2].min, null);
  assert.equal(v.daily[2].max, json.daily.temperature_2m_max[2]);

  const noForecast = fixture('rehovot'); delete noForecast.hourly; delete noForecast.daily;
  const e = ctx.Weather.forHour(ctx.Weather.parse(noForecast, cfg), null, cfg);
  assert.equal(e.current.temp, noForecast.current.temperature_2m);
  assert.equal(e.hourly.length, 12);
  assert.ok(e.hourly.every((h) => h === null) && e.daily.every((d) => d === null), 'placeholders keep the layout');
  assert.equal(e.today, null);
  assert.equal(e.nowShown, false);

  const wrongHour = fixture('rehovot'); wrongHour.current.time = '1999-01-01T00:00';
  assert.equal(ctx.Weather.parse(wrongHour, cfg).current.temp, wrongHour.current.temperature_2m);
});

// Decision 17 (F8): "Now" and "Today" follow the place's wall clock, not the answer's own time.
test('the strip and the day list follow the wall clock: an old answer never labels a past hour Now', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.weather;
  const json = fixture('rehovot');
  const m = ctx.Weather.parse(json, cfg);
  const dataHour = json.current.time.slice(0, 13);              // "2026-10-29T20"
  const later = ctx.Weather.forHour(m, '2026-10-29T23', cfg);
  assert.equal(later.nowShown, true);
  assert.equal(later.hourly[0].key, '2026-10-29T23');
  assert.equal(later.today.date, '2026-10-29');
  const nextDay = ctx.Weather.forHour(m, '2026-10-30T09', cfg);
  assert.equal(nextDay.today.date, '2026-10-30', 'yesterday is no longer "Today"');
  assert.equal(nextDay.daily[0].date, '2026-10-30');
  assert.equal(nextDay.daily[6], null, 'six real days and a placeholder');
  const far = ctx.Weather.forHour(m, '2026-11-20T09', cfg);
  assert.equal(far.nowShown, false);
  assert.equal(far.today, null);
  assert.ok(dataHour < '2026-10-29T23');
});

// A store wired to fake timers and a fake network that answers only when the test says so.
function makeStore(ctx, random) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const store = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, {
    getJson: (url, timeoutMs, done) => { calls.push({ url, timeoutMs, done, lats: new URL(url).searchParams.get('latitude').split(',') }); },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random,
    onChange: () => { changes++; }
  });
  const byLat = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney', '32.794': 'haifa', '32.0853': 'telaviv', '31.2518': 'beersheva' };
  // Answers the last request: 'ok' = every place's recorded answer, or an error label for a transport failure;
  // `patch(list)` may edit the answer list first.
  const answer = (mode, patch) => {
    const c = calls[calls.length - 1];
    if (mode !== 'ok') return c.done(mode, undefined);
    const list = c.lats.map((lat) => fixture(byLat[lat]));
    if (patch) patch(list);
    c.done(null, list);
  };
  return { store, clock, calls, answer, changes: () => changes };
}

test('a refresh is ONE request for every place, with a timeout; a second refresh while it is in flight sends nothing', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.refresh(), true);
  assert.equal(s.calls.length, 1, 'one request per refresh, whatever the number of places');
  assert.deepEqual(s.calls[0].lats, ['31.8928', '50.4501', '-33.8688', '32.794', '32.0853', '31.2518'], 'FB5-WX: the Israel regions ride the same request');
  assert.equal(s.calls[0].timeoutMs, 15000, 'the request has a timeout');
  assert.equal(s.store.refresh(), false);
  assert.equal(s.calls.length, 1);
  s.answer('ok');
  for (const id of ['home', 'kyiv', 'sydney']) assert.equal(s.store.status(id).kind, 'fresh', id);
  assert.equal(s.changes(), 1, 'one render per refresh');
});

test('a failed refresh keeps the last good data and marks it stale; success clears the marker', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 0.5);
  s.store.refresh(); s.answer('ok');
  const good = s.store.get('home');
  assert.equal(s.store.status('home').kind, 'fresh');
  s.clock.advance(15 * 60000);                     // the scheduled refresh fires
  assert.equal(s.calls.length, 2);
  s.answer('timeout');
  assert.equal(s.store.get('home'), good, 'last good data kept');
  for (const id of ['home', 'kyiv', 'sydney']) assert.equal(s.store.status(id).kind, 'stale', 'a failed request marks every place stale: ' + id);
  const st = s.store.status('home');
  assert.equal(st.updatedAt, T0, 'the time of the data shown, not of the failure');
  s.clock.advance(60000);                          // the first back-off step is at most one minute
  assert.equal(s.calls.length, 3);
  s.answer('ok');
  assert.equal(s.store.status('home').kind, 'fresh');
});

test('data older than staleAfterMs is stale even without a failed request', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer('ok');
  s.store.stop();                                  // no further refreshes
  s.clock.advance(ctx.Config.weather.staleAfterMs);
  assert.equal(s.store.status('home').kind, 'fresh', 'exactly at the limit still fresh');
  s.clock.advance(1);
  assert.equal(s.store.status('home').kind, 'stale');
});

// Decision 17 (F16)
test('a device clock that went backwards past the data makes it stale, not fresh', () => {
  const ctx = load(FILES);
  const clock = fakeTimers(T0);
  let now = T0;
  const store = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, {
    getJson: (url, ms, done) => done(null, ['rehovot', 'kyiv', 'sydney'].map(fixture)),
    now: () => now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => {} });
  store.refresh();
  assert.equal(store.status('home').kind, 'fresh');
  now = T0 - 60000;
  assert.equal(store.status('home').kind, 'stale');
});

test('first start with no network: "failed", not stale and not empty forever', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.status('home').kind, 'loading');
  s.store.refresh(); s.answer('network');
  assert.equal(s.store.status('home').kind, 'failed');
  assert.equal(s.store.get('home'), null);
  assert.ok(s.store.nextAt() > T0, 'the next attempt is known (shown as "retrying at")');
});

// Decision 7 (P-9): full jitter, bounded by the same schedule ceilings 1, 2, 4, 8, 15 min.
test('back-off after failures is jittered between 30 s and 1, 2, 4, 8, then 15 min — never a tight or unbounded loop', () => {
  const ctx = load(FILES);
  const ceilings = [1, 2, 4, 8, 15, 15, 15].map((m) => m * 60000);
  for (const [r, expect] of [[() => 0, () => 30000], [() => 0.999999, (c) => c]]) {
    const s = makeStore(ctx, r);
    for (let i = 0; i < ceilings.length; i++) {
      s.store.refresh(); s.answer('http 503');
      assert.ok(Math.abs(s.clock.pending()[0] - expect(ceilings[i])) <= 1, 'step ' + i + ': ' + s.clock.pending()[0]);
      s.store.stop();
    }
    assert.equal(s.calls.length, 7, 'one request per refresh, no hidden retries');
  }
  const s = makeStore(ctx);                        // the real Math.random
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    s.store.refresh(); s.answer('http 503');
    const d = s.clock.pending()[0], c = ceilings[Math.min(i, 6)];
    assert.ok(d >= 30000 && d <= c, 'step ' + i + ' waits ' + d + ' within [30 s, ' + c + ']');
    seen.add(d);
    s.store.stop();
  }
  assert.ok(seen.size > 30, 'the waits differ (jitter), ' + seen.size + ' distinct');
  const ok = makeStore(ctx, () => 0);
  ok.store.refresh(); ok.answer('ok');
  assert.equal(ok.clock.pending()[0], 15 * 60000, 'after a success the regular 15 min, never jittered down');
});

test('one place failing marks the cycle as failed for back-off but keeps the others fresh', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 1);
  s.store.refresh();
  s.answer('ok', (list) => { list[1] = { nonsense: true }; });
  assert.equal(s.store.status('home').kind, 'fresh');
  assert.equal(s.store.status('sydney').kind, 'fresh');
  assert.equal(s.store.status('kyiv').kind, 'failed');
  assert.equal(s.store.failures(), 1);
  assert.equal(s.clock.pending()[0], 60000);
});

test('an answer that does not parse counts as a failure and keeps the previous data', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer('ok');
  const good = s.store.get('home');
  s.store.refresh();
  s.calls[1].done(null, { nonsense: true });
  assert.equal(s.store.get('home'), good);
  assert.equal(s.store.status('home').kind, 'stale');
});

// Decision 17 (Codex 5)
test('stop() wins over a request already in flight: its late answer neither renders nor reschedules', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh();
  s.store.stop();
  s.answer('ok');
  assert.equal(s.changes(), 0, 'no render');
  assert.deepEqual(s.clock.pending(), [], 'no timer');
  assert.equal(s.store.get('home'), null, 'nothing stored');
  assert.equal(s.store.refresh(), true, 'a new refresh can start after stop');
});

// FB5-WX: the Israel weather screen reads the main weather's store: no request of its own, three regions, 5 days each.
test('FB5-WX: the Israel regions (Haifa, Tel Aviv, Beer Sheva) come in the ONE weather request; each has current weather and 5 days', () => {
  const ctx = load(FILES);
  const isr = ctx.Config.israel;
  assert.deepEqual(JSON.parse(JSON.stringify(isr)), { regions: [{ id: 'north', place: 'haifa' }, { id: 'center', place: 'telaviv' }, { id: 'south', place: 'beersheva' }], days: 5 });
  const s = makeStore(ctx);
  s.store.refresh();
  assert.equal(s.calls.length, 1, 'one request for six places');
  s.answer('ok');
  for (const r of isr.regions) {
    const data = s.store.get(r.place);
    assert.ok(data && typeof data.current.temp === 'number', r.place);
    const v = ctx.Weather.forHour(data, '2026-10-29T20', ctx.Config.weather);
    assert.equal(v.daily.slice(0, isr.days).filter(Boolean).length, 5, r.place + ': five forecast days');
    assert.equal(s.store.status(r.place).kind, 'fresh');
  }
  s.clock.advance(15 * 60000);
  s.answer('timeout');
  for (const r of isr.regions) assert.equal(s.store.status(r.place).kind, 'stale', 'a failed answer keeps the last data: ' + r.place);
  assert.ok(s.store.get('haifa'), 'kept');
});

// Batch 12: today's UV maximum rides the SAME forecast request (one more daily field, no request more).
test('UV: uv_index_max is in the daily list of the one forecast URL, which still carries every place', () => {
  const ctx = load(FILES);
  const u = new URL(ctx.Weather.url(ctx.Config.places, ctx.Config.weather));
  assert.equal(u.searchParams.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max');
  assert.equal(u.searchParams.get('latitude').split(',').length, 6);
});

test('UV: each day carries its maximum from the recorded 2026-11-02 answer (Rehovot 4.9); an older answer without it gives null', () => {
  const ctx = load(FILES), cfg = ctx.Config.weather;
  const list = fixture('weather-uv-2026-11-02');
  assert.equal(list.length, 6, 'the answer of the six-place request');
  const home = ctx.Weather.parse(list[0], cfg);
  assert.deepEqual(JSON.parse(JSON.stringify(home.daily.map((d) => d.uvMax))), [4.9, 4.9, 4.7, 4.1, 4.65, 3.3, 3.75]);
  assert.equal(ctx.Weather.parse(list[2], cfg).daily[0].uvMax, 8.55, 'Sydney');
  assert.ok(ctx.Weather.parse(fixture('rehovot'), cfg).daily.every((d) => d.uvMax === null), 'the 2026-10-29 recording predates the field');
  const gap = fixture('weather-uv-2026-11-02')[0]; gap.daily.uv_index_max[1] = null;
  assert.equal(ctx.Weather.parse(gap, cfg).daily[1].uvMax, null);
});

test('UV: the level on the ROUNDED index — ≤2 low, ≤5 moderate, ≤7 high, ≤10 very high, above extreme; no value, no level', () => {
  const ctx = load(FILES);
  const vectors = [[0, 0, 'low'], [2.49, 2, 'low'], [2.5, 3, 'moderate'], [5, 5, 'moderate'], [5.5, 6, 'high'], [7, 7, 'high'],
    [7.5, 8, 'veryHigh'], [10, 10, 'veryHigh'], [10.5, 11, 'extreme']];
  for (const [raw, index, level] of vectors) assert.deepEqual(JSON.parse(JSON.stringify(ctx.Weather.uv(raw))), { index, level }, String(raw));
  for (const none of [null, undefined, NaN]) assert.equal(ctx.Weather.uv(none), null, String(none));
});

test('S4: a value that is not a finite number is no value — Infinity in a forecast cell is a placeholder, never a UV level or a temperature', () => {
  const ctx = load(FILES), cfg = ctx.Config.weather;
  assert.equal(ctx.Weather.uv(Infinity), null);
  assert.equal(ctx.Weather.uv(-Infinity), null);
  const j = fixture('weather-uv-2026-11-02')[0];
  j.daily.uv_index_max[0] = Infinity; j.daily.temperature_2m_max[1] = -Infinity;
  const m = ctx.Weather.parse(j, cfg);
  assert.deepEqual([m.daily[0].uvMax, m.daily[1].max, m.daily[2].uvMax], [null, null, 4.7]);
  const bad = fixture('rehovot'); bad.current.temperature_2m = Infinity;
  assert.throws(() => ctx.Weather.parse(bad, cfg), /temperature_2m/, 'a required value must be a real number');
});

// Batch 14 (the owner, 2026-11-02: «делай хранение погоды» — Open-Meteo answered 503 after a restart and the TV showed no
// weather): the weather store keeps its last good answer under 'weather.v1' and a restarted app shows it, stale, for 48 h.
test('B14: a restarted app shows the last good weather of every place, stale and dated, for up to 48 h (key weather.v1)', () => {
  const ctx = load(FILES), items = {}, storage = { getItem: (k) => (k in items ? items[k] : null), setItem: (k, v) => { items[k] = String(v); } };
  assert.equal(ctx.Config.weather.keepMaxMs, 48 * 3600000);
  const first = fakeTimers(T0), calls = [], deps = (clock) => ({ storage, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onChange: () => {}, getJson: (url, ms, done) => calls.push({ done, lats: new URL(url).searchParams.get('latitude').split(',') }) });
  const byLat = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney', '32.794': 'haifa', '32.0853': 'telaviv', '31.2518': 'beersheva' };
  const a = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, deps(first));
  a.refresh();
  calls[0].done(null, calls[0].lats.map((lat) => fixture(byLat[lat])));
  assert.deepEqual(Object.keys(items), ['weather.v1']);
  a.stop();
  const later = fakeTimers(T0 + 2 * 3600000), b = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, deps(later));
  for (const p of ctx.Config.places) {
    assert.equal(b.status(p.id).kind, 'stale', p.id);
    assert.equal(b.status(p.id).updatedAt, T0, p.id);
    assert.equal(b.get(p.id).current.temp, a.get(p.id).current.temp, p.id + ': the same reading');
  }
  const gone = fakeTimers(T0 + 48 * 3600000 + 1), c = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, deps(gone));
  assert.equal(c.get(ctx.Config.places[0].id), null, 'older than 48 h: not shown');
});

// Batch 15: the weather store's fallback is MET Norway (js/met.js), wired by Weather.createStore when the App gives each
// place's wall clock (deps.wallOf) and an Expires-aware getJson.
test('B15: Open-Meteo answers 503 → the same refresh asks MET for all 6 places at once (6 forecasts + 6 suns); every place shown, source met', () => {
  const ctx = load(FILES.concat(['js/met.js'])), clock = fakeTimers(Date.parse('2026-11-02T15:25:00Z')), om = [], met = [];
  const zone = (id) => ctx.Tz.resolve({ zones: id === 'kyiv' ? ['Europe/Kyiv'] : id === 'sydney' ? ['Australia/Sydney'] : ['Asia/Jerusalem'] }, clock.now(), ctx.Intl);
  const store = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onChange: () => {}, getJson: (url, ms, done) => om.push(done), getJsonExpiring: (url, ms, done) => met.push({ url, done }),
    wallOf: (p) => { const r = zone(p.id); return (ms) => ctx.Tz.wallTime(r, ms); } });
  store.refresh();
  om[0]('http 503');
  assert.equal(met.length, 12, 'one forecast and one sun request per place, all before any answer');
  const ids = ['rehovot', 'kyiv', 'sydney', 'haifa', 'telaviv', 'beersheva'];
  met.forEach((c, i) => c.done(null, require('./fixtures/met/' + (c.url.indexOf('/sun?') > 0 ? 'sun-' : '') + ids[Math.floor(i / 2)] + '.json'), { expires: '' }));
  for (const p of ctx.Config.places) {
    assert.deepEqual([store.status(p.id).kind, store.status(p.id).source], ['fresh', 'met'], p.id);
    assert.equal(typeof store.get(p.id).current.temp, 'number', p.id);
  }
  assert.equal(store.get('home').current.hourKey, '2026-11-02T17');
  assert.equal(store.get('sydney').current.hourKey, '2026-11-03T02');
  store.refresh();
  assert.equal(om.length, 2, 'the next refresh asks Open-Meteo first');
});

test('B15: without wallOf (no clock to place MET\'s UTC times) the store has no fallback: Open-Meteo alone, as before', () => {
  const ctx = load(FILES.concat(['js/met.js'])), s = makeStore(ctx);
  s.store.refresh();
  s.answer('http 503');
  assert.equal(s.store.status(ctx.Config.places[0].id).kind, 'failed');
});

// FIX-15B Y1 (the reviewers' P1, kept): MET answering 200 with a body it cannot read ({}) never wedges the weather — the
// round ends as a failure, the back-off follows and the next refresh is accepted.
test('FIX-15B Y1: MET answers {} for every place → the refresh ends, back-off pending, the next refresh asks Open-Meteo again', () => {
  const ctx = load(FILES.concat(['js/met.js'])), clock = fakeTimers(Date.parse('2026-11-02T15:25:00Z')), om = [];
  const r = ctx.Tz.resolve({ zones: ['Asia/Jerusalem'] }, clock.now(), ctx.Intl);
  const store = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    random: () => 0, onChange: () => {}, getJson: (u, ms, done) => om.push(done), getJsonExpiring: (u, ms, done) => done(null, {}, { expires: '' }),
    wallOf: () => (ms) => ctx.Tz.wallTime(r, ms) });
  store.refresh();
  assert.doesNotThrow(() => om[0]('http 503'));
  assert.deepEqual([store.status('home').kind, clock.pending()], ['failed', [30000]]);
  assert.equal(store.refresh(), true);
  assert.equal(om.length, 2);
});
