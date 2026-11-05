/* Time in another time zone, without trusting the TV's own zone setting. ES5.
 *
 * The device clock gives UTC (Date.now()). For each clock the UTC offset of its zone is found:
 *   1. Intl.DateTimeFormat with `timeZone` (Chromium 47 supports IANA names, tzdata of 2015): the first
 *      candidate name the TV accepts wins ("Europe/Kyiv" throws RangeError there, "Europe/Kiev" works).
 *      The formatted wall time is parsed back into digits (formatToParts does not exist before Chrome 57)
 *      and the offset is sanity-checked: a whole number of quarter hours within ±14 h.
 *   2. Built-in daylight-saving rules (IL / EU / AU_SYD) when Intl is missing or rejects every name.
 *      The result is marked `source: 'rules'` and the card shows "≈", so it is never silently wrong.
 *   3. Nothing works: `source: 'none'`, the card says the zone is unknown instead of a time.
 * When both 1 and 2 are available and disagree, the built-in rule wins: it is checked against real tzdata for
 * every hour of 2025–2030, while the TV's Intl data is frozen in 2015 or may ignore `timeZone` altogether.
 * The disagreement is logged once per clock and not marked on screen.
 *
 * Calendar dates "YYYY-MM-DD" (the one home of this arithmetic: weather, the Shabbat calendar, the request ledger) are
 * whole UTC days, so no zone, DST or leap second ever enters it:
 *   Tz.dateMs(date) · Tz.isoDate(ms) · Tz.addDays(date, n) · Tz.weekdayOf(date) (0 = Sunday) · Tz.daysBetween(from, to)
 * and a wall time's own date: Tz.wallDate(w) ("2026-10-29") · Tz.ddmm(w) ("29.10") · Tz.ddmmyyyy(w) ("29.10.2026").
 */
var Tz = (function () {
  var HOUR = 3600000, DAY = 24 * HOUR;

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
    try { return new intl.DateTimeFormat('en-US', Obj.copyWith(OPTIONS, { timeZone: zone })); } catch (e) { return null; }
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
    var offset = resolved.formatter ? intlOffset(resolved.formatter, utc) : null;
    var approx = offset === null;                 // no exact Intl answer: the rule's time is approximate
    if (resolved.rule) {
      var ruled = resolved.rule(utc);
      if (offset !== null && ruled !== offset && !resolved.warned) {
        resolved.warned = true;
        if (typeof console !== 'undefined') console.warn('tz: ' + resolved.zone + ' Intl says ' + offset + ' min, the built-in rule ' + ruled + ' min; showing the rule');
      }
      offset = ruled;
    }
    if (offset === null) return { ok: false, approx: true };
    var w = new Date(utc + offset * 60000);
    return { ok: true, approx: approx, offset: offset, hours: w.getUTCHours(), minutes: w.getUTCMinutes(),
      weekday: w.getUTCDay(), day: w.getUTCDate(), month: w.getUTCMonth(), year: w.getUTCFullYear() };
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  // "20:32" of a wall time, "--:--" when the zone is unknown.
  function hhmm(w) { return w.ok ? pad2(w.hours) + ':' + pad2(w.minutes) : '--:--'; }
  // A wall time's calendar date (C-8, one home for these strings): "2026-10-29" (Open-Meteo's and Hebcal's dates), "29.10"
  // and "29.10.2026" (on screen).
  function wallDate(w) { return w.year + '-' + pad2(w.month + 1) + '-' + pad2(w.day); }
  function ddmm(w) { return pad2(w.day) + '.' + pad2(w.month + 1); }
  function ddmmyyyy(w) { return ddmm(w) + '.' + w.year; }
  // "2026-10-29T20": the wall time's hour in the format of Open-Meteo's local times, null when unknown.
  function hourKey(w) { return w.ok ? wallDate(w) + 'T' + pad2(w.hours) : null; }

  // ---- instants written with their offset ---------------------------------------------------------
  // "2026-11-06T16:27:00+02:00" (Hebcal), "2026-10-25T07:40+03:00" (MET's sun times, no seconds), "2026-11-02T12:00:00Z" (MET's
  // steps) → the instant in ms (a fraction of a second dropped); NaN for anything else. By hand — the offset taken off with Date.UTC, never Date.parse on the
  // TV's 2015 engine (FIX-BATCH-18 part B: one parser for Hebcal and MET Norway).
  // FIX-18B 5: what Date.parse refuses is NaN here too — a month, day, hour, minute, second or offset out of range (24:00 only
  // as 24:00:00 with no fraction); a year 0000–0099 stays that year (Date.UTC alone would read it as 1900–1999).
  var ISO = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(?:(Z)|([+-])(\d\d):(\d\d))$/;
  var MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function isLeap(y) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
  function instant(stamp) {
    var m = ISO.exec(stamp);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0), frac = +(m[7] || 0);
    if (mo < 1 || mo > 12 || d < 1 || d > MONTH_DAYS[mo - 1] || (mo === 2 && d === 29 && !isLeap(y)) ||
      mi > 59 || s > 59 || h > 24 || (h === 24 && (mi || s || frac)) || (!m[8] && (+m[10] > 23 || +m[11] > 59))) return NaN;
    var at = new Date(0);
    at.setUTCFullYear(y, mo - 1, d);
    at.setUTCHours(h, mi, s, 0);
    return at.getTime() - (m[8] ? 0 : (m[9] === '-' ? -1 : 1) * (+m[10] * 60 + +m[11]) * 60000);
  }

  // ---- calendar dates ----------------------------------------------------------------------------
  function dateMs(date) { return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)); }
  function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(date, n) { return isoDate(dateMs(date) + n * DAY); }
  function weekdayOf(date) { return new Date(dateMs(date)).getUTCDay(); }
  function daysBetween(from, to) { return Math.round((dateMs(to) - dateMs(from)) / DAY); }
  // A real calendar date "YYYY-MM-DD": it survives the round trip through Date.UTC (2026-02-31 and 0000-00-00 do not).
  // (Batch 26: moved here from js/ledger.js, which keeps Ledger.validDate as its alias.)
  function validDate(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    var t = dateMs(d);
    return t >= 0 && isoDate(t) === d;
  }

  return { resolve: resolve, wallTime: wallTime, intlOffset: intlOffset, rules: RULES, pad2: pad2, hhmm: hhmm, hourKey: hourKey,
    wallDate: wallDate, ddmm: ddmm, ddmmyyyy: ddmmyyyy, instant: instant,
    dateMs: dateMs, isoDate: isoDate, addDays: addDays, weekdayOf: weekdayOf, daysBetween: daysBetween, validDate: validDate };
})();
