/* What Open-Meteo's forecast and air-quality APIs share (js/weather.js, js/air.js). ES5.
 *   OpenMeteo.query(places)          'latitude=a,b&longitude=c,d': several places in ONE request; the answer lists them in
 *                                    this order (one place: an object, not a list)
 *   OpenMeteo.num(v)                 v when it is a finite number, else null (a missing, NaN or infinite cell is no value)
 *   OpenMeteo.band(value, ceilings, top)   the level of a value: the name of the first [ceiling, name] it does not exceed,
 *                                    else `top`; null for no value (the UV index and the European AQI) */
var OpenMeteo = (function () {
  function query(places) {
    var lat = [], lon = [];
    for (var i = 0; i < places.length; i++) { lat.push(places[i].lat); lon.push(places[i].lon); }
    return 'latitude=' + lat.join(',') + '&longitude=' + lon.join(',');
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function band(value, ceilings, top) {
    if (value === null) return null;
    for (var i = 0; i < ceilings.length; i++) if (value <= ceilings[i][0]) return ceilings[i][1];
    return top;
  }
  return { query: query, num: num, band: band };
})();
