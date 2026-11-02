/* Air quality from Open-Meteo's air-quality API (no key; CAMS data, hourly). ES5.
 * Checked 2026-11-02 (tests/fixtures/air): several coordinates in ONE request answer a list in the same order (one
 * coordinate: an object); each element has current { time, european_aqi, dust (µg/m³), … }; a bad request answers 400
 * { error: true, reason }. Only what the screens show is asked: the European AQI and dust.
 *   Air.url(places, cfg)          ONE request for every place (js/openmeteo.js)
 *   Air.parse(json, cfg)          one place → { aqi, dust, time } (a missing value is null); throws when there is no
 *                                 current block or neither value
 *   Air.summary(model, cfg)       what the screens show: { aqi (rounded), level, dust (rounded), dustHigh } or null
 *   Air.createStore(places, cfg, deps)   one request per refresh (js/placestore.js), last good data kept */
var Air = (function () {
  var CURRENT = 'european_aqi,dust', num = OpenMeteo.num;
  // European AQI bands on the rounded index: at most 20 good, 40 fair, 60 moderate, 80 poor, 100 very poor, above extreme.
  var LEVELS = [[20, 'good'], [40, 'fair'], [60, 'moderate'], [80, 'poor'], [100, 'veryPoor']];

  function url(places, cfg) { return cfg.base + '?' + OpenMeteo.query(places) + '&current=' + CURRENT + '&timezone=auto'; }

  function round(v) { return v === null ? null : Math.round(v); }

  function parse(json, cfg) {
    var c = json && json.current;
    if (!c || typeof c !== 'object') throw new Error('air: no current block');
    var m = { aqi: num(c.european_aqi), dust: num(c.dust), time: c.time };
    if (m.aqi === null && m.dust === null) throw new Error('air: no values');
    return m;
  }

  // Dust is flagged from cfg.dustUgm3 (100 µg/m³: twice the EU daily PM10 limit from dust alone).
  function summary(model, cfg) {
    if (!model) return null;
    var aqi = round(model.aqi), dust = round(model.dust);
    return { aqi: aqi, level: OpenMeteo.band(aqi, LEVELS, 'extreme'), dust: dust, dustHigh: dust !== null && dust >= cfg.dustUgm3 };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional) }
  function createStore(places, cfg, deps) { return PlaceStore.create(places, { cfg: cfg, url: url, parse: parse }, deps); }

  return { url: url, parse: parse, summary: summary, createStore: createStore };
})();
