/* What counts as a number, said once for every module (the ledger, the routes, the markets, Open-Meteo's cells). ES5.
 *   Num.finite(v)   v is a number and finite (NaN and ±Infinity are no value)
 *   Num.count(v)    v is a whole number ≥ 0 (a stored request count, a stored time in ms) */
var Num = (function () {
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function count(v) { return finite(v) && v >= 0 && Math.floor(v) === v; }
  return { finite: finite, count: count };
})();
