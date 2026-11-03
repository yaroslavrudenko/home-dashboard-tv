/* Weather from Open-Meteo (no key). ES5.
 *   Weather.url(places, cfg)           ONE request carries everything the dashboard shows for every place
 *   Weather.parse(json, cfg)           one place's answer → the model; throws only when current weather is unusable
 *   Weather.forHour(model, hourKey, cfg) the rows to show now: the hourly strip and the days from the wall clock
 *   Weather.uv(raw)                    a day's UV maximum → { index (rounded), level } or null
 *   Weather.createStore(...)           one request per refresh (js/placestore.js), last good data kept; MET Norway
 *                                      (js/met.js) in the same refresh when the Open-Meteo attempt fails
 * Times in the answer are the place's local wall time (timezone=auto), so sunrise "06:01" and the hourly
 * labels need no time-zone arithmetic here. */
var Weather = (function () {
  var CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day';
  var HOURLY = 'temperature_2m,weather_code,precipitation_probability,is_day';
  var DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max';
  // The UV levels on the rounded index (WHO): at most 2 low, 5 moderate, 7 high, 10 very high, above that extreme.
  var UV_LEVELS = [[2, 'low'], [5, 'moderate'], [7, 'high'], [10, 'veryHigh']], opt = OpenMeteo.num;

  // Open-Meteo accepts comma-separated coordinates and answers with one element per place, in order.
  function url(places, cfg) {
    return cfg.base + '?' + OpenMeteo.query(places) +
      '&current=' + CURRENT + '&hourly=' + HOURLY + '&daily=' + DAILY +
      '&timezone=auto&forecast_days=' + cfg.days + '&forecast_hours=' + cfg.forecastHours + '&wind_speed_unit=kmh';
  }

  function need(value, what) {
    if (value === undefined || value === null) throw new Error('weather: missing ' + what);
    return value;
  }
  function num(value, what) {
    if (opt(need(value, what)) === null) throw new Error('weather: not a number ' + what);
    return value;
  }
  function cell(arr, i) { return arr ? arr[i] : undefined; }       // a missing optional array is a missing cell
  function hhmm(iso) { return iso ? String(iso).slice(11, 16) : null; }   // "2026-10-29T06:01" → "06:01"

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
      daily.push({ date: String(days[k]), weekday: Tz.weekdayOf(String(days[k])), code: opt(cell(d.weather_code, k)),
        min: opt(cell(d.temperature_2m_min, k)), max: opt(cell(d.temperature_2m_max, k)),
        pop: opt(cell(d.precipitation_probability_max, k)), sunrise: hhmm(cell(d.sunrise, k)), sunset: hhmm(cell(d.sunset, k)),
        uvMax: opt(cell(d.uv_index_max, k)) });
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
  // or yesterday "Today". Missing hours are null (placeholders keep the layout intact); missing days are named rows.
  function forHour(model, hourKey, cfg) {
    var key = hourKey || model.current.hourKey, date = key.slice(0, 10);
    var hourly = [], daily = [], i;
    for (i = 0; i < model.hourly.length && hourly.length < cfg.hours; i++) if (model.hourly[i].key >= key) hourly.push(model.hourly[i]);
    for (i = 0; i < model.daily.length; i++) if (model.daily[i].date >= date) daily.push(model.daily[i]);
    var today = daily.length && daily[0].date === date ? daily[0] : null;
    var nowShown = hourly.length > 0 && hourly[0].key === key;
    while (hourly.length < cfg.hours) hourly.push(null);
    // FIX-BATCH-19 5 / FIX-19B C2: data from an earlier day end before the list does — each missing day is still its own row,
    // named, with «—» for what it lacks: never an empty slot, also when every stored day has passed (counted from the date asked)
    for (var next = daily.length ? Tz.addDays(daily[daily.length - 1].date, 1) : date; daily.length < cfg.days; next = Tz.addDays(next, 1)) daily.push(missingDay(next));
    return { current: currentAt(model, key), today: today, hourly: hourly, daily: daily, nowShown: nowShown };
  }
  function missingDay(d) { return { date: d, weekday: Tz.weekdayOf(d), code: null, min: null, max: null, pop: null, sunrise: null, sunset: null, uvMax: null }; }
  // FIX-BATCH-19 5: what «now» shows at the wall-clock hour `hourKey`. The reading when it is of that hour; when it is older
  // (stale data, another hour or day) and the forecast has that hour, that hour's temperature, sky and day/night — so the big
  // figure, the strip's «Сейчас» and the clock cards all show the same hour (the reading's feels-like, wind and humidity stay,
  // dimmed with the rest of the stale data).
  function currentAt(model, hourKey) {
    var c = model.current;
    if (!hourKey || c.hourKey === hourKey) return c;
    for (var i = 0; i < model.hourly.length; i++) {
      var h = model.hourly[i];
      // FIX-19B C1: that hour is chosen by its key and temperature only; a sky it lacks is shown as lacking (code null: no icon,
      // «—»), never another hour's
      if (h.key === hourKey && h.temp !== null) return Obj.copyWith(c, { temp: h.temp, code: h.code, isDay: h.isDay, hourKey: hourKey });
    }
    return c;
  }

  function uv(raw) {
    if (opt(raw) === null) return null;
    var index = Math.round(raw);
    return { index: index, level: OpenMeteo.band(index, UV_LEVELS, 'extreme') };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional),
  //         storage (optional: the last good answer is kept under 'weather.v1', js/placestore.js),
  //         wallOf(place) → wall(ms) and getJsonExpiring (both optional: batch 15, MET Norway as the fallback, js/met.js) }
  function createStore(places, cfg, deps) {
    var fallback = deps.wallOf && cfg.met ? Met.fallback(cfg, deps) : null;
    return PlaceStore.create(places, { cfg: cfg, url: url, parse: parse, persistKey: 'weather', fallback: fallback }, deps);
  }

  return { url: url, parse: parse, forHour: forHour, currentAt: currentAt, uv: uv, createStore: createStore };
})();
