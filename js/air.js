/* Air quality from Open-Meteo's air-quality API (no key; CAMS data, hourly). ES5.
 * Checked 2026-11-02 (tests/fixtures/air): several coordinates in ONE request answer a list in the same order (one
 * coordinate: an object); each element has current { time, european_aqi, dust (µg/m³), … } and, asked for, hourly
 * { time: ['YYYY-MM-DDTHH:00' (the place's wall time, timezone=auto)], dust: [µg/m³ | null] }; a bad request answers 400
 * { error: true, reason }. Only what the screens show is asked: the European AQI and dust now, and the dust forecast
 * (batch 13: cfg.forecastDays days from today's 00:00; a day the answer has no value for is beyond its horizon).
 *   Air.url(places, cfg)          ONE request for every place (js/openmeteo.js)
 *   Air.parse(json, cfg)          one place → { aqi, dust, forecast: { byHour: { wall hour ("2026-11-02T16") → dust },
 *                                 byDay: { date → { n, max } } } } (a missing value is left out; no hourly block: empty;
 *                                 a 0 is a reading like any other — batch 24 (а)); throws when there is no current block or
 *                                 neither current value
 *   Air.summary(model, cfg)       what the screens show now: { aqi (rounded), level, dust (rounded), dustHigh } or null
 *   Air.grade(dust, cfg)          a reading's khamsin grade: 0 (none) … 4 (FIX-18B 13, the EEA PM10 bands)
 *   Air.forecast(model, hourKeys, dates, cfg)   the dust forecast for the cells on screen, built once per render:
 *                                 { hours: [cell], days: [cell] } in the order asked; cell = { dust (rounded), khamsin }, or
 *                                 { beyond: true } for a day the answer has no value for at all (beyond the source's
 *                                 horizon, batch 24 (в)), or null (no value; a null key; or a day with some values but fewer
 *                                 than cfg.dustDayMinHours); a day's dust is its HOURLY MAXIMUM; no model: every cell null
 *   Air.createStore(places, cfg, deps)   one request per refresh (js/placestore.js), last good data kept */
var Air = (function () {
  var CURRENT = 'european_aqi,dust', HOURLY = 'dust', num = OpenMeteo.num;
  // European AQI bands on the rounded index: at most 20 good, 40 fair, 60 moderate, 80 poor, 100 very poor, above extreme.
  var LEVELS = [[20, 'good'], [40, 'fair'], [60, 'moderate'], [80, 'poor'], [100, 'veryPoor']];

  function url(places, cfg) {
    return cfg.base + '?' + OpenMeteo.query(places) + '&current=' + CURRENT + '&hourly=' + HOURLY + '&timezone=auto&forecast_days=' + cfg.forecastDays;
  }

  function round(v) { return v === null ? null : Math.round(v); }

  // The dust forecast's index, built ONCE per answer (X10): each hour's value by its wall-clock key ("2026-11-02T16", as
  // Weather's hourly keys) and each day's count of values and maximum. No block: an empty forecast. Owner 2026-11-04, batch
  // 24 (а): a 0 is a reading — a day whose values are all 0 is a clean day, shown 0 (the old X6 «CAMS fill» rule is gone).
  function forecastOf(h) {
    // G5: the maps are keyed by the answer's own strings — no prototype, so no key («__proto__», «constructor») finds a stranger
    var times = h && h.time || [], dust = h && h.dust || [], byHour = Object.create(null), byDay = Object.create(null), i, v, key, d;
    for (i = 0; i < times.length; i++) {
      if ((v = num(dust[i])) === null) continue;
      key = String(times[i]).slice(0, 13);
      byHour[key] = v;
      d = byDay[key.slice(0, 10)] || (byDay[key.slice(0, 10)] = { n: 0, max: v });
      d.n++;
      if (v > d.max) d.max = v;
    }
    return { byHour: byHour, byDay: byDay };
  }

  function parse(json, cfg) {
    var c = json && json.current;
    if (!c || typeof c !== 'object') throw new Error('air: no current block');
    var m = { aqi: num(c.european_aqi), dust: num(c.dust), forecast: forecastOf(json.hourly) };   // N11: no `time` (nothing read it)
    if (m.aqi === null && m.dust === null) throw new Error('air: no values');
    return m;
  }

  // Dust is flagged from cfg.dustUgm3 (100 µg/m³: twice the EU daily PM10 limit from dust alone), on the rounded value.
  function khamsin(dust, cfg) { return dust !== null && dust >= cfg.dustUgm3; }
  // FIX-18B 13: THE one place a reading gets its khamsin grade — 0 below dustUgm3, then 1 + the number of cfg.dustGradesUgm3
  // bounds it reaches (the EEA PM10 bands, js/config.js): 1 … 4, the redder the more dangerous. Every view colours a reading
  // through it (js/view.js numClass: the current card, the hours, the 7-day band and the Israel bands).
  function grade(dust, cfg) {
    if (!khamsin(dust, cfg)) return 0;
    var g = 1;
    for (var i = 0; i < cfg.dustGradesUgm3.length; i++) if (dust >= cfg.dustGradesUgm3[i]) g = i + 2;
    return g;
  }
  function cell(dust, cfg) { return { dust: dust, khamsin: khamsin(dust, cfg) }; }

  function summary(model, cfg) {
    if (!model) return null;
    var aqi = round(model.aqi), dust = round(model.dust);
    return { aqi: aqi, level: OpenMeteo.band(aqi, LEVELS, 'extreme'), dust: dust, dustHigh: khamsin(dust, cfg) };
  }

  var NO_FORECAST = { byHour: Object.create(null), byDay: Object.create(null) };   // G5: as forecastOf's maps

  // The cells on screen (B13-D2, D3): lookups of the shown keys in the index built at parse (X10). A day counts only with
  // cfg.dustDayMinHours of its values (the CAMS horizon's last day is partial); today is the whole calendar day, its past
  // hours included. Owner 2026-11-04, batch 24 (в): a day the answer has no value for at all is beyond the source's horizon
  // ({ beyond: true }: «нет прогноза»), told apart from a day with too few values (null: «—»); decided from the data alone.
  function forecast(model, hourKeys, dates, cfg) {
    var ix = model ? model.forecast : NO_FORECAST, hours = [], days = [], i, d;
    for (i = 0; i < hourKeys.length; i++) {
      hours.push(hourKeys[i] !== null && Object.prototype.hasOwnProperty.call(ix.byHour, hourKeys[i]) ? cell(Math.round(ix.byHour[hourKeys[i]]), cfg) : null);
    }
    for (i = 0; i < dates.length; i++) {
      d = dates[i] !== null && Object.prototype.hasOwnProperty.call(ix.byDay, dates[i]) ? ix.byDay[dates[i]] : null;
      days.push(!model || dates[i] === null ? null : !d ? { beyond: true } : d.n >= cfg.dustDayMinHours ? cell(Math.round(d.max), cfg) : null);
    }
    return { hours: hours, days: days };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional),
  //         storage (optional: the last good answer is kept under 'air.v1', js/placestore.js) }
  function createStore(places, cfg, deps) { return PlaceStore.create(places, { cfg: cfg, url: url, parse: parse, persistKey: 'air' }, deps); }

  return { url: url, parse: parse, summary: summary, forecast: forecast, grade: grade, createStore: createStore };
})();
