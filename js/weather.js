/* Weather from Open-Meteo (no key). ES5.
 *   Weather.url(place, cfg)        one request carries everything the dashboard shows for a place
 *   Weather.parse(json, cfg)       → the view model, or throws on a malformed answer
 *   Weather.createStore(...)       refresh cycle: all places in parallel, last good data kept, back-off
 * Times in the answer are the place's local wall time (timezone=auto), so sunrise "06:01" and the hourly
 * labels need no time-zone arithmetic here. */
var Weather = (function () {
  var CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day';
  var HOURLY = 'temperature_2m,weather_code,precipitation_probability,is_day';
  var DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max';

  function url(place, cfg) {
    return cfg.base + '?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=' + CURRENT + '&hourly=' + HOURLY + '&daily=' + DAILY +
      '&timezone=auto&forecast_days=' + cfg.days + '&wind_speed_unit=kmh';
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
  function hhmm(iso) { return String(iso).slice(11, 16); }          // "2026-10-29T06:01" → "06:01"
  function weekdayOf(isoDate) {                                      // "2026-10-29" → 4 (Thursday)
    var p = String(isoDate).split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  }

  function parse(json, cfg) {
    var c = need(json && json.current, 'current');
    var h = need(json.hourly, 'hourly');
    var d = need(json.daily, 'daily');
    var times = need(h.time, 'hourly.time');
    var days = need(d.time, 'daily.time');
    if (!days.length) throw new Error('weather: empty daily');

    // The hourly strip starts at the current local hour.
    var nowHour = String(need(c.time, 'current.time')).slice(0, 13);   // "2026-10-29T20"
    var start = -1;
    for (var i = 0; i < times.length; i++) if (times[i].slice(0, 13) === nowHour) { start = i; break; }
    if (start < 0) throw new Error('weather: current hour not in hourly');
    var hourly = [];
    for (var j = start; j < times.length && hourly.length < cfg.hours; j++) {
      hourly.push({ hour: times[j].slice(11, 13), temp: num(h.temperature_2m[j], 'hourly.temperature_2m'),
        code: num(h.weather_code[j], 'hourly.weather_code'), isDay: h.is_day[j] === 1,
        pop: opt(h.precipitation_probability[j]), now: j === start });
    }

    var daily = [];
    for (var k = 0; k < days.length && k < cfg.days; k++) {
      daily.push({ date: days[k], weekday: weekdayOf(days[k]), code: num(d.weather_code[k], 'daily.weather_code'),
        min: num(d.temperature_2m_min[k], 'daily.min'), max: num(d.temperature_2m_max[k], 'daily.max'),
        pop: opt(d.precipitation_probability_max[k]) });
    }

    return {
      current: { temp: num(c.temperature_2m, 'temperature_2m'), feels: opt(c.apparent_temperature),
        code: num(c.weather_code, 'weather_code'), isDay: c.is_day === 1,
        wind: opt(c.wind_speed_10m), humidity: opt(c.relative_humidity_2m), time: hhmm(c.time) },
      today: { min: daily[0].min, max: daily[0].max, pop: daily[0].pop,
        sunrise: d.sunrise ? hhmm(d.sunrise[0]) : null, sunset: d.sunset ? hhmm(d.sunset[0]) : null },
      hourly: hourly,
      daily: daily
    };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store) }
  function createStore(places, cfg, deps) {
    var state = {};
    var failures = 0, inFlight = false, timer = null;
    for (var i = 0; i < places.length; i++) state[places[i].id] = { data: null, updatedAt: 0, error: null };

    function delayAfter(n) {
      return n === 0 || n > cfg.retryMs.length ? cfg.refreshMs : cfg.retryMs[n - 1];
    }
    function schedule(ms) {
      if (timer !== null) deps.clearTimeout(timer);
      timer = deps.setTimeout(function () { timer = null; refresh(); }, ms);
    }

    function refresh() {
      if (inFlight) return false;
      inFlight = true;
      var pending = places.length, failed = 0;
      // All places start at once: independent requests, no waterfall.
      for (var i = 0; i < places.length; i++) fetchPlace(places[i]);
      function fetchPlace(place) {
        deps.getJson(url(place, cfg), cfg.timeoutMs, function (err, json) {
          var s = state[place.id];
          if (!err) {
            try { s.data = parse(json, cfg); s.updatedAt = deps.now(); s.error = null; } catch (e) { err = 'parse'; }
          }
          if (err) { s.error = err; failed++; }        // the last good data stays
          pending--;
          if (pending === 0) {
            inFlight = false;
            failures = failed ? failures + 1 : 0;
            schedule(delayAfter(failures));
          }
          deps.onChange(api);
        });
      }
      return true;
    }

    var api = {
      refresh: refresh,
      get: function (id) { return state[id] ? state[id].data : null; },
      // Stale = we have data but the last attempt failed, or it is older than staleAfterMs.
      status: function (id) {
        var s = state[id];
        if (!s) return { kind: 'none' };
        if (!s.data) return { kind: s.error ? 'failed' : 'loading' };
        var old = deps.now() - s.updatedAt > cfg.staleAfterMs;
        return { kind: s.error || old ? 'stale' : 'fresh', updatedAt: s.updatedAt };
      },
      failures: function () { return failures; },
      nextDelay: function () { return delayAfter(failures); },
      stop: function () { if (timer !== null) deps.clearTimeout(timer); timer = null; }
    };
    return api;
  }

  return { url: url, parse: parse, createStore: createStore };
})();
