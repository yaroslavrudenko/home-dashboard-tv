/* Time at home and at each configured clock (batch 17, C-1): the wall time of a clock, "HH:MM" at home, the stamp with
 * its date when another day, when a retry runs, a weather place's clock. No DOM. ES5. */
var HomeClock = (function () {
  // A moment rounded up to the next whole minute (0 stays 0): a time said «at HH:MM» is never one already shown.
  function ceilMinute(ms) { return Math.ceil(ms / 60000) * 60000; }
  // clocks: Config.clocks (the first is home); now: the moment the zones are resolved (formatters are built once).
  function create(clocks, now) {
    var resolved = [];
    for (var i = 0; i < clocks.length; i++) resolved.push(Tz.resolve(clocks[i], now));

    function wall(i) { return Tz.wallTime(resolved[i], Date.now()); }
    // "HH:MM" at home (the first clock) for a moment; '' for none.
    function hhmm(ms) { return ms ? Tz.hhmm(Tz.wallTime(resolved[0], ms)) : ''; }
    // The home date 'YYYY-MM-DD' now: what the Shabbat calendar is asked for and viewed at.
    function today() { return Tz.wallDate(wall(0)); }
    // Today at home as 'DD.MM.YYYY' ('' when the zone is unknown).
    function date() { var w = wall(0); return w.ok ? Tz.ddmmyyyy(w) : ''; }
    // When the next attempt runs, rounded up: never "retry at" the minute already shown.
    function retryAt(next) { return next ? hhmm(ceilMinute(next)) : ''; }
    // "HH:MM" at home, with "DD.MM " before it when that moment is not today at home; '' for none.
    function stamp(ms) {
      if (!ms) return '';
      var w = Tz.wallTime(resolved[0], ms), t = wall(0);
      var other = w.ok && t.ok && (w.year !== t.year || w.month !== t.month || w.day !== t.day);
      return (other ? Tz.ddmm(w) + ' ' : '') + Tz.hhmm(w);
    }
    // The index of the clock linked to a weather place, or -1.
    function clockOf(placeId) {
      for (var i = 0; i < clocks.length; i++) if (clocks[i].place === placeId) return i;
      return -1;
    }
    // A weather place's wall clock (batch 15: MET Norway's UTC times): the clock linked to the place, else the home clock
    // (the Israel regions, shown at Israel's time on their screen).
    function placeWall(place) {
      var r = resolved[Math.max(clockOf(place.id), 0)];
      return function (ms) { return Tz.wallTime(r, ms); };
    }
    // The wall-clock hour of a weather place, from the clock linked to it (null: no such clock or zone unknown).
    function placeHourKey(placeId) {
      var i = clockOf(placeId);
      return i < 0 ? null : Tz.hourKey(wall(i));
    }
    return { wall: wall, hhmm: hhmm, today: today, date: date, retryAt: retryAt, stamp: stamp, placeWall: placeWall, placeHourKey: placeHourKey };
  }
  return { create: create, ceilMinute: ceilMinute };
})();
