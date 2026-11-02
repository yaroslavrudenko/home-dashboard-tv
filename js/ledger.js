/* The request ledger every metered source shares (traffic routes, the traffic map). ES5.
 * One record per source in localStorage, { v: 1, utcDate, used, lastAttemptAt, retryNotBefore }, counted per UTC date
 * (one fixed length; home dates can be 25 h long). A source writes the record and reads it back BEFORE every request,
 * so nothing is sent that was not counted, and nothing is ever refunded.
 *   Ledger.open(storage, key)   { read(now), write(record) }: read gives the record, a fresh one when none is stored (a
 *                               first install), or null when storage is unusable or the record is corrupt (an impossible
 *                               date included); write stores it and reads it back, true only when both match
 *   Ledger.usedOn(r, now)       requests already used on now's UTC date (a strictly later date starts again at 0)
 *   Ledger.correct(r, now)      the record after a clock that went back, or null when nothing needs correcting
 *   Ledger.utcDate(ms) · Ledger.nextUtcMidnight(ms) · Ledger.validDate(d) · Ledger.copy(r) */
var Ledger = (function () {
  var VERSION = 1, DAY_MS = 86400000, utcDate = Tz.isoDate, count = Num.count;     // calendar dates: js/tz.js; counts: js/num.js

  function nextUtcMidnight(ms) { return (Math.floor(ms / DAY_MS) + 1) * DAY_MS; }
  // A real calendar date "YYYY-MM-DD": it survives the round trip through Date.UTC (2026-02-31 and 0000-00-00 do not).
  function validDate(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    var t = Tz.dateMs(d);
    return t >= 0 && utcDate(t) === d;
  }
  function validRecord(r) {
    return !!r && r.v === VERSION && validDate(r.utcDate) && count(r.used) && count(r.lastAttemptAt) && count(r.retryNotBefore);
  }
  function copy(r) { return { v: VERSION, utcDate: r.utcDate, used: r.used, lastAttemptAt: r.lastAttemptAt, retryNotBefore: r.retryNotBefore }; }
  function usedOn(r, now) { return r.utcDate < utcDate(now) ? 0 : r.used; }

  // A clock that went back: an attempt time in the future is rebased to now; an accounting date in the future becomes
  // today's UTC date with `used` kept (no correction ever grants a fresh budget).
  function correct(r, now) {
    var today = utcDate(now), out = null;
    if (r.lastAttemptAt > now) { out = copy(r); out.lastAttemptAt = now; }
    if (r.utcDate > today) { out = out || copy(r); out.utcDate = today; }
    return out;
  }

  function open(storage, key) {
    return {
      read: function (now) {
        if (!storage) return null;
        var text, r;
        try { text = storage.getItem(key); } catch (e) { return null; }
        if (text === null) return { v: VERSION, utcDate: utcDate(now), used: 0, lastAttemptAt: 0, retryNotBefore: 0 };
        try { r = JSON.parse(text); } catch (e) { return null; }
        return validRecord(r) ? r : null;
      },
      write: function (r) {
        if (!storage) return false;
        var text = JSON.stringify(copy(r));
        try { storage.setItem(key, text); return storage.getItem(key) === text; } catch (e) { return false; }
      }
    };
  }

  return { open: open, usedOn: usedOn, correct: correct, utcDate: utcDate, nextUtcMidnight: nextUtcMidnight, validDate: validDate, copy: copy };
})();
