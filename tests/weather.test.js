'use strict';
// Weather: the one Open-Meteo request, parsing of real recorded answers (tests/fixtures, 2026-10-29), the
// wall-clock window, and the refresh cycle — last good data kept on failure, the stale marker, jittered
// bounded back-off, stop().
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/weather.js'];
const T0 = Date.parse('2026-10-29T18:32:00Z');

test('one URL carries every place (comma-separated coordinates), current, hourly and daily data, with no key', () => {
  const ctx = load(FILES);
  const u = new URL(ctx.Weather.url(ctx.Config.places, ctx.Config.weather));
  assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(u.searchParams.get('latitude'), '31.8928,50.4501,-33.8688');
  assert.equal(u.searchParams.get('longitude'), '34.8113,30.5234,151.2093');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('forecast_days'), '7');
  assert.equal(u.searchParams.get('forecast_hours'), '24', 'only the hourly rows the strip can use');
  for (const p of ['current', 'hourly', 'daily']) assert.ok(u.searchParams.get(p), p);
  assert.ok(!/key|token|appid/i.test(u.search), 'no API key');
});

test('Rehovot is the default (main) place; Kyiv and Sydney are optional extras', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Config.places[0].id, 'rehovot');
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
  const byLat = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney' };
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
  assert.deepEqual(s.calls[0].lats, ['31.8928', '50.4501', '-33.8688']);
  assert.equal(s.calls[0].timeoutMs, 15000, 'the request has a timeout');
  assert.equal(s.store.refresh(), false);
  assert.equal(s.calls.length, 1);
  s.answer('ok');
  for (const id of ['rehovot', 'kyiv', 'sydney']) assert.equal(s.store.status(id).kind, 'fresh', id);
  assert.equal(s.changes(), 1, 'one render per refresh');
});

test('a failed refresh keeps the last good data and marks it stale; success clears the marker', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 0.5);
  s.store.refresh(); s.answer('ok');
  const good = s.store.get('rehovot');
  assert.equal(s.store.status('rehovot').kind, 'fresh');
  s.clock.advance(15 * 60000);                     // the scheduled refresh fires
  assert.equal(s.calls.length, 2);
  s.answer('timeout');
  assert.equal(s.store.get('rehovot'), good, 'last good data kept');
  for (const id of ['rehovot', 'kyiv', 'sydney']) assert.equal(s.store.status(id).kind, 'stale', 'a failed request marks every place stale: ' + id);
  const st = s.store.status('rehovot');
  assert.equal(st.updatedAt, T0, 'the time of the data shown, not of the failure');
  s.clock.advance(60000);                          // the first back-off step is at most one minute
  assert.equal(s.calls.length, 3);
  s.answer('ok');
  assert.equal(s.store.status('rehovot').kind, 'fresh');
});

test('data older than staleAfterMs is stale even without a failed request', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer('ok');
  s.store.stop();                                  // no further refreshes
  s.clock.advance(ctx.Config.weather.staleAfterMs);
  assert.equal(s.store.status('rehovot').kind, 'fresh', 'exactly at the limit still fresh');
  s.clock.advance(1);
  assert.equal(s.store.status('rehovot').kind, 'stale');
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
  assert.equal(store.status('rehovot').kind, 'fresh');
  now = T0 - 60000;
  assert.equal(store.status('rehovot').kind, 'stale');
});

test('first start with no network: "failed", not stale and not empty forever', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.status('rehovot').kind, 'loading');
  s.store.refresh(); s.answer('network');
  assert.equal(s.store.status('rehovot').kind, 'failed');
  assert.equal(s.store.get('rehovot'), null);
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
  assert.equal(s.store.status('rehovot').kind, 'fresh');
  assert.equal(s.store.status('sydney').kind, 'fresh');
  assert.equal(s.store.status('kyiv').kind, 'failed');
  assert.equal(s.store.failures(), 1);
  assert.equal(s.clock.pending()[0], 60000);
});

test('an answer that does not parse counts as a failure and keeps the previous data', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer('ok');
  const good = s.store.get('rehovot');
  s.store.refresh();
  s.calls[1].done(null, { nonsense: true });
  assert.equal(s.store.get('rehovot'), good);
  assert.equal(s.store.status('rehovot').kind, 'stale');
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
  assert.equal(s.store.get('rehovot'), null, 'nothing stored');
  assert.equal(s.store.refresh(), true, 'a new refresh can start after stop');
});
