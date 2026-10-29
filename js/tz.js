/* Time in another time zone, without trusting the TV's own zone setting. ES5.
 *
 * The device clock gives UTC (Date.now()). For each clock the UTC offset of its zone is found:
 *   1. Intl.DateTimeFormat with `timeZone` (Chromium 47 supports IANA names, tzdata of 2015): the first
 *      candidate name the TV accepts wins ("Europe/Kyiv" throws RangeError there, "Europe/Kiev" works).
 *      The formatted wall time is parsed back into digits (formatToParts does not exist before Chrome 57)
 *      and the offset is sanity-checked: a whole number of quarter hours within ±14 h.
 *   2. Built-in daylight-saving rules (IL / EU / AU_SYD) when Intl is missing or rejects every name.
 *      The result is marked `source: 'rules'` and the card shows "≈", so it is never silently wrong.
 *   3. Nothing works: `source: 'none'`, the card shows "--:--" and says the zone is unknown.
 * When both 1 and 2 are available they are compared; a disagreement sets `mismatch` (shown as "≈" too).
 */
var Tz = (function () {
  var HOUR = 3600000;

  // ---- built-in rules (valid as of 2026; used only when the TV cannot resolve the zone) ----------
  function lastSunday(year, month) {           // month 0-based; returns the day of month
    var lastDay = new Date(Date.UTC(year, month + 1, 0));
    return lastDay.getUTCDate() - lastDay.getUTCDay();
  }
  function firstSunday(year, month) {
    var first = new Date(Date.UTC(year, month, 1));
    return 1 + (7 - first.getUTCDay()) % 7;
  }
  var RULES = {
    // European Union rule (Ukraine follows it): +2, summer +3; switches at 01:00 UTC on the last Sundays
    // of March and October.
    EU: function (utc) {
      var y = new Date(utc).getUTCFullYear();
      var start = Date.UTC(y, 2, lastSunday(y, 2), 1);
      var end = Date.UTC(y, 9, lastSunday(y, 9), 1);
      return utc >= start && utc < end ? 180 : 120;
    },
    // Israel: +2, summer +3 from the Friday before the last Sunday of March 02:00 local (00:00 UTC) to the
    // last Sunday of October 02:00 summer time (23:00 UTC the day before).
    IL: function (utc) {
      var y = new Date(utc).getUTCFullYear();
      var start = Date.UTC(y, 2, lastSunday(y, 2) - 2, 0);
      var end = Date.UTC(y, 9, lastSunday(y, 9), 0) - HOUR;
      return utc >= start && utc < end ? 180 : 120;
    },
    // Sydney: +10, summer +11 from the first Sunday of October 02:00 standard (16:00 UTC the day before)
    // to the first Sunday of April 03:00 summer time (16:00 UTC the day before).
    AU_SYD: function (utc) {
      var y = new Date(utc).getUTCFullYear();
      var start = Date.UTC(y, 9, firstSunday(y, 9), 16) - 24 * HOUR;
      var end = Date.UTC(y, 3, firstSunday(y, 3), 16) - 24 * HOUR;
      return utc >= start || utc < end ? 660 : 600;
    }
  };

  // ---- Intl ---------------------------------------------------------------------------------------
  var OPTIONS = { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };

  function makeFormatter(intl, zone) {
    var o = {};
    for (var k in OPTIONS) if (OPTIONS.hasOwnProperty(k)) o[k] = OPTIONS[k];
    o.timeZone = zone;
    try { return new intl.DateTimeFormat('en-US', o); } catch (e) { return null; }
  }

  // Offset in minutes for `utc` read through an en-US formatter ("10/29/2026, 20:30:05"), or null.
  function intlOffset(formatter, utc) {
    var text;
    try { text = formatter.format(new Date(utc)); } catch (e) { return null; }
    var d = String(text).match(/\d+/g);
    if (!d || d.length < 6) return null;
    var hour = +d[3] === 24 ? 0 : +d[3];        // some engines print midnight as 24:00
    var wall = Date.UTC(+d[2], +d[0] - 1, +d[1], hour, +d[4], +d[5]);
    var offset = Math.round((wall - Math.floor(utc / 1000) * 1000) / 60000);
    if (isNaN(offset) || Math.abs(offset) > 14 * 60 || offset % 15 !== 0) return null;
    return offset;
  }

  // Picks how a clock's time is computed. Returns { zone, source, formatter, rule } — cached by the caller
  // (formatters are expensive to build; one per clock for the app's lifetime).
  function resolve(clock, utc, intl) {
    if (intl === undefined) intl = typeof Intl !== 'undefined' ? Intl : null;
    var rule = RULES[clock.rule] || null;
    if (intl && intl.DateTimeFormat) {
      for (var i = 0; i < clock.zones.length; i++) {
        var f = makeFormatter(intl, clock.zones[i]);
        if (f && intlOffset(f, utc) !== null) return { zone: clock.zones[i], source: 'intl', formatter: f, rule: rule };
      }
    }
    if (rule) return { zone: clock.zones[0], source: 'rules', formatter: null, rule: rule };
    return { zone: clock.zones[0], source: 'none', formatter: null, rule: null };
  }

  // Wall time of a resolved clock at `utc`: { ok, approx, hours, minutes, weekday, day, month, offset }.
  function wallTime(resolved, utc) {
    var offset = null, approx = resolved.source !== 'intl';
    if (resolved.formatter) offset = intlOffset(resolved.formatter, utc);
    if (offset === null && resolved.rule) { offset = resolved.rule(utc); approx = true; }
    else if (offset !== null && resolved.rule && resolved.rule(utc) !== offset) approx = true;   // mismatch
    if (offset === null) return { ok: false, approx: true };
    var w = new Date(utc + offset * 60000);
    return { ok: true, approx: approx, offset: offset, hours: w.getUTCHours(), minutes: w.getUTCMinutes(),
      weekday: w.getUTCDay(), day: w.getUTCDate(), month: w.getUTCMonth(), year: w.getUTCFullYear() };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  return { resolve: resolve, wallTime: wallTime, intlOffset: intlOffset, rules: RULES, pad2: pad2 };
})();
