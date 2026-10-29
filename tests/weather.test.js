'use strict';
// Weather: the Open-Meteo request, parsing of real recorded answers (tests/fixtures, 2026-10-29), and
// the refresh cycle — all places in parallel, last good data kept on failure, the stale marker,
// bounded back-off.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/weather.js'];
const T0 = Date.parse('2026-10-29T18:32:00Z');

test('one URL per place carries current, hourly and daily data, with no key', () => {
  const ctx = load(FILES);
  const u = new URL(ctx.Weather.url(ctx.Config.places[0], ctx.Config.weather));
  assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(u.searchParams.get('latitude'), '31.8928');
  assert.equal(u.searchParams.get('longitude'), '34.8113');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('forecast_days'), '7');
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
    const json = fixture(id);
    const m = ctx.Weather.parse(json, ctx.Config.weather);
    assert.equal(m.current.temp, json.current.temperature_2m);
    assert.equal(m.current.feels, json.current.apparent_temperature);
    assert.equal(m.current.humidity, json.current.relative_humidity_2m);
    assert.equal(m.current.wind, json.current.wind_speed_10m);
    assert.equal(m.current.code, json.current.weather_code);
    assert.equal(m.hourly.length, 12);
    assert.equal(m.hourly[0].now, true);
    assert.equal(m.hourly[0].hour, json.current.time.slice(11, 13), 'the strip starts at the current local hour');
    assert.equal(m.daily.length, 7);
    assert.equal(m.daily[0].date, json.daily.time[0]);
    assert.equal(m.today.max, json.daily.temperature_2m_max[0]);
    assert.equal(m.today.min, json.daily.temperature_2m_min[0]);
    assert.equal(m.today.sunrise, json.daily.sunrise[0].slice(11, 16));
    assert.equal(m.today.sunset, json.daily.sunset[0].slice(11, 16));
    assert.match(m.today.sunrise, /^\d\d:\d\d$/);
  });
}

test('a malformed answer is refused (throws), never shown half-filled', () => {
  const ctx = load(FILES);
  const cfg = ctx.Config.weather;
  assert.throws(() => ctx.Weather.parse({}, cfg));
  assert.throws(() => ctx.Weather.parse(null, cfg));
  const noTemp = fixture('rehovot'); delete noTemp.current.temperature_2m;
  assert.throws(() => ctx.Weather.parse(noTemp, cfg), /temperature_2m/);
  const wrongHour = fixture('rehovot'); wrongHour.current.time = '1999-01-01T00:00';
  assert.throws(() => ctx.Weather.parse(wrongHour, cfg), /current hour/);
});

// A store wired to fake timers and a fake network that answers only when the test says so.
function makeStore(ctx) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const store = ctx.Weather.createStore(ctx.Config.places, ctx.Config.weather, {
    getJson: (url, timeoutMs, done) => { calls.push({ url, timeoutMs, done, lat: new URL(url).searchParams.get('latitude') }); },
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    onChange: () => { changes++; }
  });
  const byLat = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney' };
  const answerAll = (mode, from) => {
    for (const c of calls.slice(from || 0)) mode === 'ok' ? c.done(null, fixture(byLat[c.lat])) : c.done(mode, undefined);
  };
  return { store, clock, calls, answerAll, changes: () => changes };
}

test('a refresh starts every place at once: exactly one request per place, all before any answer', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.refresh(), true);
  assert.equal(s.calls.length, ctx.Config.places.length, 'all requests issued synchronously, nothing waits for another');
  assert.deepEqual(s.calls.map((c) => c.lat).sort(), ['-33.8688', '31.8928', '50.4501']);
  assert.ok(s.calls.every((c) => c.timeoutMs === 15000), 'every request has a timeout');
  assert.equal(s.store.refresh(), false, 'a second refresh while one is in flight sends nothing');
  assert.equal(s.calls.length, 3);
  s.answerAll('ok');
  assert.equal(s.store.status('rehovot').kind, 'fresh');
  assert.equal(s.changes(), 3);
});

test('a failed refresh keeps the last good data and marks it stale; success clears the marker', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answerAll('ok');
  const good = s.store.get('rehovot');
  assert.equal(s.store.status('rehovot').kind, 'fresh');
  s.clock.advance(15 * 60000);                     // the scheduled refresh fires
  assert.equal(s.calls.length, 6);
  s.answerAll('timeout', 3);
  assert.equal(s.store.get('rehovot'), good, 'last good data kept');
  const st = s.store.status('rehovot');
  assert.equal(st.kind, 'stale');
  assert.equal(st.updatedAt, T0, 'the time of the data shown, not of the failure');
  s.clock.advance(60000);                          // first back-off step
  assert.equal(s.calls.length, 9);
  s.answerAll('ok', 6);
  assert.equal(s.store.status('rehovot').kind, 'fresh');
});

test('data older than staleAfterMs is stale even without a failed request', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answerAll('ok');
  s.store.stop();                                  // no further refreshes
  s.clock.advance(ctx.Config.weather.staleAfterMs);
  assert.equal(s.store.status('rehovot').kind, 'fresh', 'exactly at the limit still fresh');
  s.clock.advance(1);
  assert.equal(s.store.status('rehovot').kind, 'stale');
});

test('first start with no network: "failed", not stale and not empty forever', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.status('rehovot').kind, 'loading');
  s.store.refresh(); s.answerAll('network');
  assert.equal(s.store.status('rehovot').kind, 'failed');
  assert.equal(s.store.get('rehovot'), null);
});

test('back-off after failures is 1, 2, 4, 8 min, then the regular 15 min — never a tight or unbounded loop', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  const delays = [];
  for (let i = 0; i < 7; i++) {
    s.store.refresh(); s.answerAll('http 503', s.calls.length - 3);
    delays.push(s.clock.pending()[0] / 60000);
    s.store.stop();
  }
  assert.deepEqual(delays, [1, 2, 4, 8, 15, 15, 15]);
  assert.equal(s.calls.length, 21, 'one request per place per refresh, no hidden retries');
});

test('one place failing marks the cycle as failed for back-off but keeps the others fresh', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh();
  for (const c of s.calls) c.lat === '50.4501' ? c.done('timeout') : c.done(null, fixture(c.lat === '31.8928' ? 'rehovot' : 'sydney'));
  assert.equal(s.store.status('rehovot').kind, 'fresh');
  assert.equal(s.store.status('kyiv').kind, 'failed');
  assert.equal(s.store.failures(), 1);
  assert.equal(s.clock.pending()[0], 60000);
});

test('an answer that does not parse counts as a failure and keeps the previous data', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answerAll('ok');
  const good = s.store.get('rehovot');
  s.store.refresh();
  for (const c of s.calls.slice(3)) c.done(null, { nonsense: true });
  assert.equal(s.store.get('rehovot'), good);
  assert.equal(s.store.status('rehovot').kind, 'stale');
});
