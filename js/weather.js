/* Weather from Open-Meteo (no key). ES5.
 *   Weather.url(places, cfg)           ONE request carries everything the dashboard shows for every place
 *   Weather.parse(json, cfg)           one place's answer → the model; throws only when current weather is unusable
 *   Weather.forHour(model, hourKey, cfg) the rows to show now: the hourly strip and the days from the wall clock
 *   Weather.createStore(...)           refresh cycle: one request, last good data kept, jittered back-off
 * Times in the answer are the place's local wall time (timezone=auto), so sunrise "06:01" and the hourly
 * labels need no time-zone arithmetic here. */
var Weather = (function () {
  var CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day';
  var HOURLY = 'temperature_2m,weather_code,precipitation_probability,is_day';
  var DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max';

  // Open-Meteo accepts comma-separated coordinates and answers with one element per place, in order.
  function url(places, cfg) {
    var lat = [], lon = [];
    for (var i = 0; i < places.length; i++) { lat.push(places[i].lat); lon.push(places[i].lon); }
    return cfg.base + '?latitude=' + lat.join(',') + '&longitude=' + lon.join(',') +
      '&current=' + CURRENT + '&hourly=' + HOURLY + '&daily=' + DAILY +
      '&timezone=auto&forecast_days=' + cfg.days + '&forecast_hours=' + cfg.forecastHours + '&wind_speed_unit=kmh';
  }

  function need(value, what) {
    if (value === undefined || value === null) throw new Error('weather: missing ' + what);
    return value;
  }
  function num(value, what) {
    var n = need(value, what);
    if (typeof n !== 'number' || isNaN(n)) throw new Error('weather: not a number ' + what);
    return n;
  }
  function opt(value) { return typeof value === 'number' && !isNaN(value) ? value : null; }
  function cell(arr, i) { return arr ? arr[i] : undefined; }       // a missing optional array is a missing cell
  function hhmm(iso) { return iso ? String(iso).slice(11, 16) : null; }   // "2026-10-29T06:01" → "06:01"
  function weekdayOf(isoDate) {                                      // "2026-10-29" → 4 (Thursday)
    var p = String(isoDate).split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }

  // Current weather is required; every forecast value is optional (a missing cell is shown as a placeholder).
  function parse(json, cfg) {
    var c = need(json && json.current, 'current');
    var nowHour = String(need(c.time, 'current.time')).slice(0, 13);   // "2026-10-29T20"
    var h = json.hourly || {}, d = json.daily || {};
    var times = h.time || [], days = d.time || [];

    var hourly = [];
    for (var j = 0; j < times.length; j++) {
      var key = String(times[j]).slice(0, 13);
      if (key < nowHour) continue;                                 // ISO keys compare as text
      hourly.push({ key: key, hour: key.slice(11, 13), temp: opt(cell(h.temperature_2m, j)), code: opt(cell(h.weather_code, j)),
        isDay: cell(h.is_day, j) !== 0, pop: opt(cell(h.precipitation_probability, j)) });
    }
    var daily = [];
    for (var k = 0; k < days.length && k < cfg.days; k++) {
      daily.push({ date: String(days[k]), weekday: weekdayOf(days[k]), code: opt(cell(d.weather_code, k)),
        min: opt(cell(d.temperature_2m_min, k)), max: opt(cell(d.temperature_2m_max, k)),
        pop: opt(cell(d.precipitation_probability_max, k)), sunrise: hhmm(cell(d.sunrise, k)), sunset: hhmm(cell(d.sunset, k)) });
    }
    return {
      current: { temp: num(c.temperature_2m, 'temperature_2m'), feels: opt(c.apparent_temperature),
        code: num(c.weather_code, 'weather_code'), isDay: c.is_day === 1,
        wind: opt(c.wind_speed_10m), humidity: opt(c.relative_humidity_2m), hourKey: nowHour },
      hourly: hourly,
      daily: daily
    };
  }

  // What to show at the place's wall-clock hour `hourKey` ("2026-10-29T21"; null = the data's own hour):
  // the strip starts at that hour and the list at that day, so an old answer never labels a past hour "Now"
  // or yesterday "Today". Missing rows are null (placeholders keep the layout intact).
  function forHour(model, hourKey, cfg) {
    var key = hourKey || model.current.hourKey, date = key.slice(0, 10);
    var hourly = [], daily = [], i;
    for (i = 0; i < model.hourly.length && hourly.length < cfg.hours; i++) if (model.hourly[i].key >= key) hourly.push(model.hourly[i]);
    for (i = 0; i < model.daily.length; i++) if (model.daily[i].date >= date) daily.push(model.daily[i]);
    var today = daily.length && daily[0].date === date ? daily[0] : null;
    var nowShown = hourly.length > 0 && hourly[0].key === key;
    while (hourly.length < cfg.hours) hourly.push(null);
    while (daily.length < cfg.days) daily.push(null);
    return { current: model.current, today: today, hourly: hourly, daily: daily, nowShown: nowShown };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional) }
  function createStore(places, cfg, deps) {
    var state = {};
    var failures = 0, inFlight = false, timer = null, nextAt = 0, generation = 0;
    var random = deps.random || Math.random;
    for (var i = 0; i < places.length; i++) state[places[i].id] = { data: null, updatedAt: 0, error: null };

    // After n failed refreshes in a row: full jitter between the floor and the schedule's ceiling.
    function delayAfter(n) {
      if (n === 0) return cfg.refreshMs;
      var ceiling = n > cfg.retryMs.length ? cfg.refreshMs : cfg.retryMs[n - 1];
      return Math.round(cfg.retryFloorMs + random() * (ceiling - cfg.retryFloorMs));
    }
    function schedule(ms) {
      if (timer !== null) deps.clearTimeout(timer);
      nextAt = deps.now() + ms;
      timer = deps.setTimeout(function () { timer = null; refresh(); }, ms);
    }

    function parseOrNull(json) { try { return parse(json, cfg); } catch (e) { return null; } }

    // One answer for every place. Returns whether any place failed. A transport failure fails every place;
    // a place whose own element does not parse fails alone. The last good data always stays.
    function accept(err, json) {
      var list = err ? [] : Array.isArray(json) ? json : [json], failed = false;
      for (var i = 0; i < places.length; i++) {
        var s = state[places[i].id], model = err ? null : parseOrNull(list[i]);
        if (model) { s.data = model; s.updatedAt = deps.now(); s.error = null; } else { s.error = err || 'parse'; failed = true; }
      }
      return failed;
    }

    function refresh() {
      if (inFlight) return false;
      inFlight = true;
      var mine = generation;
      deps.getJson(url(places, cfg), cfg.timeoutMs, function (err, json) {
        if (mine !== generation) return;           // stopped meanwhile: a late answer changes nothing
        inFlight = false;
        failures = accept(err, json) ? failures + 1 : 0;
        schedule(delayAfter(failures));
        deps.onChange(api);
      });
      return true;
    }

    var api = {
      refresh: refresh,
      get: function (id) { return state[id] ? state[id].data : null; },
      // Stale = we have data but the last attempt failed, or it is older than staleAfterMs, or the device clock
      // went backwards past it (an age below zero cannot be trusted as fresh).
      status: function (id) {
        var s = state[id];
        if (!s) return { kind: 'none' };
        if (!s.data) return { kind: s.error ? 'failed' : 'loading' };
        var age = deps.now() - s.updatedAt;
        return { kind: s.error || age < 0 || age > cfg.staleAfterMs ? 'stale' : 'fresh', updatedAt: s.updatedAt };
      },
      nextAt: function () { return timer === null ? 0 : nextAt; },
      failures: function () { return failures; },
      stop: function () {
        generation++;
        inFlight = false;
        if (timer !== null) deps.clearTimeout(timer);
        timer = null;
      }
    };
    return api;
  }

  return { url: url, parse: parse, forHour: forHour, createStore: createStore };
})();
