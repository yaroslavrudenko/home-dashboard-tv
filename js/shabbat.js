/* The Shabbat & holidays calendar of the home city, from Hebcal (no key). ES5. No DOM, no I18n: every name the screen
 * shows comes from the view's own tables, keyed by Hebcal's stable English ids (lg=s).
 * Checked 2026-11-02 (tests/fixtures/hebcal): ONE /hebcal request carries candle lighting and havdalah (havdalah at
 * nightfall, M=on), the parashot, the holidays, the fast times and a Hebrew date for every day (d=on) for the Israeli
 * schedule (i=on); with leyning=on the Torah reading and haftarah of every Shabbat and festival, with ss/nx/o/mvch the special
 * Shabbatot, Rosh Chodesh, the Omer count and Shabbat Mevarchim — still the same one request. A GeoNames id gives the city's own candle custom (Jerusalem 40 minutes); lat/lon is the fallback, with
 * the city's candle minutes (b=) where it keeps the Jerusalem custom. An unknown id answers 404. Times are written as wall
 * time with their offset, e.g. "2026-11-06T16:27:00+02:00".
 *   Shabbat.STATE                        the screen states: WEEKDAY, EREV, SHABBAT, YOMTOV ('weekday' … 'yomtov')
 *   Shabbat.url(cfg, place, today)       from BACK_DAYS before today (an ongoing holiday keeps its first day; a Saturday's
 *                                        request holds Friday's candles) to today + cfg.lookaheadDays
 *   Shabbat.parse(json, cfg)             → { range: { end }, hebDates: { date: HebrewDate }, windows, fasts, occurrences, omer };
 *                                        throws on anything but a Hebcal answer
 *   Shabbat.view(data, nowMs, today, cfg) → what the screen shows at that moment (null without data): { today, state,
 *                                        window (with its reading), note, upcoming, omer (today's count or null) }; the data's arrival time is the store's status()
 *   Shabbat.createStore(cfg, deps)       once a day (js/placestore.js): { refresh, data(), status(), nextAt, stop }
 * A window runs from the first candle lighting to the havdalah that ends it (a yom tov next to a Shabbat is ONE window
 * for the times); every lighting inside it starts a segment, whose kind is what that lighting begins: the yom tov of the
 * following day, else Shabbat. Moment = { at (epoch ms), date, weekday, time } with date and time as Hebcal wrote them
 * (the city's wall time). HebrewDate = { day, month (Hebcal's English name), year, he }. Dates are 'YYYY-MM-DD'; `today`
 * is the HOME date. */
var Shabbat = (function () {
  var STATE = { WEEKDAY: 'weekday', EREV: 'erev', SHABBAT: 'shabbat', YOMTOV: 'yomtov' };
  var ZONE = 'Asia/Jerusalem', CALENDAR = 'calendar';
  // The longest holiday shown runs 8 days (Chanukah): starting 9 days back keeps its first day in every answer.
  var BACK_DAYS = 9;
  var PARAMS = 'v=1&cfg=json&i=on&c=on&M=on&s=on&maj=on&min=on&mod=on&mf=on&d=on&lg=s&leyning=on&ss=on&nx=on&o=on&mvch=on';
  var STAMP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?([+-])(\d\d):(\d\d)$/;
  var HDATE = /^(\d+) (.+) (\d+)$/, LINK = /\/h\/([^?#]+)/, YEAR = /-\d+$/, EREV = /^Erev /, PARASHAT = /^Parashat /;
  var FAST_BEGINS = 'Fast begins', FAST_ENDS = 'Fast ends', PURIM = 'purim', SHUSHAN_PURIM = 'shushan-purim';
  // Hebcal's month names: "Rosh Chodesh Sh’vat" / "Mevarchim Chodesh Kislev" (a typographic apostrophe; the dates write Sh'vat).
  var ROSH_CHODESH = /^Rosh Chodesh /, MEVARCHIM = /^Mevarchim Chodesh /, NOTE = / \| .*$/, OMER = /^Omer (\d+)$/;
  function month(title, prefix) { return title.replace(prefix, '').replace(/\u2019/g, "'"); }

  function url(cfg, place, today) {
    var where = place.geo ? '&geonameid=' + place.geo : '&latitude=' + place.lat + '&longitude=' + place.lon + '&tzid=' + ZONE;
    if (place.candleMins) where += '&b=' + place.candleMins;
    return cfg.base + '?' + PARAMS + where + '&start=' + Tz.addDays(today, -BACK_DAYS) + '&end=' + Tz.addDays(today, cfg.lookaheadDays);
  }

  // "2026-11-06T16:27:00+02:00" → the instant (the offset taken off by hand: no Date.parse on a 2015 engine).
  function moment(stamp) {
    var m = STAMP.exec(stamp);
    if (!m) throw new Error('hebcal: unexpected time ' + stamp);
    var offset = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60000, date = stamp.slice(0, 10);
    return { at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offset, date: date, weekday: Tz.weekdayOf(date), time: m[4] + ':' + m[5] };
  }
  function hebrewDate(item) {
    var m = HDATE.exec(item.hdate || ''), p = item.heDateParts;
    return m && p ? { day: +m[1], month: m[2], year: +m[3], he: p.d + ' ב' + p.m + ' ' + p.y } : null;
  }
  function dateOf(item) { return item.date.slice(0, 10); }
  // The holiday's id with its year: 'pesach-2027', 'asara-btevet-20261220' (one occurrence each).
  function occurrenceId(item) { var m = LINK.exec(item.link || ''); return m ? m[1] : null; }
  function shapeError() { return new Error('hebcal: unexpected shape'); }

  // The holidays shown: Jerusalem, a walled city, keeps Purim on the 15th of Adar (Shushan Purim).
  function holidaysFor(cfg) {
    if (!cfg.place || !cfg.place.shushanPurim) return cfg.holidays;
    var out = [];
    for (var i = 0; i < cfg.holidays.length; i++) out.push(cfg.holidays[i] === PURIM ? SHUSHAN_PURIM : cfg.holidays[i]);
    return out;
  }

  // A segment: what its lighting begins on the following day (ctx: { yomtov, parashot: by date, occurrences }).
  function describe(seg, ctx) {
    var next = Tz.addDays(seg.start.date, 1), yt = ctx.yomtov[next] || null;
    seg.kind = yt ? STATE.YOMTOV : STATE.SHABBAT;
    seg.holiday = yt;
    seg.parasha = ctx.parashot[next] || null;
    seg.during = null;
    for (var i = 0; i < ctx.occurrences.length; i++) {
      var o = ctx.occurrences[i];
      if (o.kind === 'holiday' && o.start <= next && next <= o.end) { seg.during = o.holiday; break; }
    }
    seg.reading = readingOf(next, ctx);
  }
  // What is read on `day`, and the one extra line Hebcal gives for it: a special Shabbat, else Shabbat Mevarchim (with the
  // coming Rosh Chodesh), else a Rosh Chodesh on that day. Null when Hebcal gives nothing for the day (never made up).
  function readingOf(day, ctx) {
    var r = ctx.readings[day] || null, special = null, i;
    if (ctx.specials[day]) special = { kind: 'shabbat', id: ctx.specials[day].id, he: ctx.specials[day].he };
    else if (ctx.mevarchim[day]) special = { kind: 'mevarchim', month: ctx.mevarchim[day], date: roshChodeshOf(ctx.mevarchim[day], day, ctx) };
    else {
      for (i = 0; i < ctx.roshChodesh.length; i++) if (ctx.roshChodesh[i].date === day) special = { kind: 'roshchodesh', month: ctx.roshChodesh[i].month, date: day };
    }
    if (!r && !special) return null;
    return { torah: r ? r.torah : null, haftarah: r ? r.haftarah : null, special: special };
  }
  // The first day of the month's coming Rosh Chodesh, from `day` on (null when the range ends before it).
  function roshChodeshOf(name, day, ctx) {
    for (var i = 0; i < ctx.roshChodesh.length; i++) if (ctx.roshChodesh[i].month === name && ctx.roshChodesh[i].date >= day) return ctx.roshChodesh[i].date;
    return null;
  }
  // A day's Torah reading: its parasha's, else a festival day's own (one with a haftarah: a yom tov, Shabbat Chol HaMoed).
  function leyning(it) {
    var l = it.leyning;
    return l && l.torah ? { torah: l.torah, haftarah: l.haftarah ? String(l.haftarah).replace(NOTE, '') : null } : null;
  }

  function parse(json, cfg) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.items) || !json.range) throw shapeError();
    var holidays = holidaysFor(cfg), hebDates = {}, windows = [], open = null, yomtov = {}, parashot = {}, titles = {}, groups = {}, ids = [],
      begins = {}, pairs = [], readings = {}, specials = {}, mevarchim = {}, roshChodesh = [], omer = {}, m;
    for (var i = 0; i < json.items.length; i++) {
      var it = json.items[i];
      if (!it || typeof it.date !== 'string') throw shapeError();
      if (it.category === 'hebdate') { var h = hebrewDate(it); if (h) hebDates[it.date] = h; }
      else if (it.category === 'parashat') { parashot[it.date] = { id: it.title.replace(PARASHAT, ''), he: it.hebrew }; if (leyning(it)) readings[it.date] = leyning(it); }
      else if (it.category === 'mevarchim') mevarchim[dateOf(it)] = month(it.title, MEVARCHIM);
      else if (it.category === 'roshchodesh') {
        var rm = month(it.title, ROSH_CHODESH), last = roshChodesh[roshChodesh.length - 1];
        if (!last || last.month !== rm || Tz.daysBetween(last.date, dateOf(it)) > 1) roshChodesh.push({ month: rm, date: dateOf(it) });   // its first day
      } else if (it.category === 'omer') { m = OMER.exec(it.title_orig || ''); if (m) omer[dateOf(it)] = +m[1]; }
      // A candle lighting opens a window when none is open and is a segment of it either way; the next havdalah closes it.
      else if (it.category === 'candles') {
        var lit = moment(it.date);
        if (!open) { open = { start: lit, end: null, segments: [] }; windows.push(open); }
        open.segments.push({ start: lit });
      } else if (it.category === 'havdalah') { if (open) { open.end = moment(it.date); open = null; } }
      else if (it.category === 'zmanim' && it.subcat === 'fast') {
        var memo = String(it.memo).replace(EREV, '');              // Tisha B'Av begins on "Erev Tish'a B'Av"
        if (it.title === FAST_BEGINS) begins[memo] = moment(it.date);
        else if (it.title === FAST_ENDS && begins[memo]) { pairs.push({ memo: memo, begins: begins[memo], ends: moment(it.date) }); delete begins[memo]; }
      } else if (it.category === 'holiday') {
        var id = occurrenceId(it), slug = id ? id.replace(YEAR, '') : null;
        if (!slug) continue;
        if (it.subcat === 'shabbat') { specials[dateOf(it)] = { id: slug, he: it.hebrew }; continue; }
        var hl = leyning(it);
        if (hl && hl.haftarah && !readings[dateOf(it)]) readings[dateOf(it)] = hl;
        titles[it.title] = slug;
        if (it.yomtov && !yomtov[dateOf(it)]) yomtov[dateOf(it)] = slug;
        var kind = cfg.fasts.indexOf(slug) >= 0 ? 'fast' : holidays.indexOf(slug) >= 0 ? 'holiday' : null;
        if (!kind) continue;
        var g = groups[id];
        if (!g) { g = groups[id] = { holiday: slug, kind: kind, start: null, end: null }; ids.push(id); }
        // An occurrence starts at its first item that is not its Erev; it ends on its last item's date.
        if (g.start === null && !EREV.test(it.title)) g.start = dateOf(it);
        g.end = dateOf(it);
      }
    }
    var occurrences = [], fasts = [], k, j;
    for (k = 0; k < ids.length; k++) {
      var o = groups[ids[k]], start = o.start || Tz.addDays(o.end, 1);   // only its Erev inside the range: it starts the next day
      occurrences.push({ holiday: o.holiday, kind: o.kind, start: start, end: o.end < start ? start : o.end, order: k });
    }
    occurrences.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : a.order - b.order; });
    for (k = 0; k < occurrences.length; k++) delete occurrences[k].order;
    for (k = 0; k < pairs.length; k++) {
      var fast = titles[pairs[k].memo];
      if (fast && cfg.fasts.indexOf(fast) >= 0) fasts.push({ holiday: fast, begins: pairs[k].begins, ends: pairs[k].ends });
    }
    var ctx = { yomtov: yomtov, parashot: parashot, occurrences: occurrences, readings: readings, specials: specials, mevarchim: mevarchim, roshChodesh: roshChodesh };
    for (k = 0; k < windows.length; k++) for (j = 0; j < windows[k].segments.length; j++) describe(windows[k].segments[j], ctx);
    return { range: { end: json.range.end }, hebDates: hebDates, windows: windows, fasts: fasts, occurrences: occurrences, omer: omer };
  }

  // The fast of the home day: from its date (quiet before it begins, active while it runs) until it ends.
  function fastNote(fasts, nowMs, today) {
    for (var i = 0; i < fasts.length; i++) {
      var f = fasts[i], active = f.begins.at <= nowMs && nowMs < f.ends.at;
      if (nowMs < f.ends.at && (active || f.begins.date === today || f.ends.date === today)) {
        return { kind: 'fast', holiday: f.holiday, begins: f.begins, ends: f.ends, active: active };
      }
    }
    return null;
  }
  function holidayNote(occurrences, today) {
    for (var i = 0; i < occurrences.length; i++) {
      var o = occurrences[i];
      if (o.kind === 'holiday' && o.start <= today && today <= o.end) return { kind: 'holiday', holiday: o.holiday };
    }
    return null;
  }
  function upcomingOf(occurrences, today, max) {
    var out = [];
    for (var i = 0; i < occurrences.length && out.length < max; i++) {
      var o = occurrences[i];
      if (o.end < today) continue;
      out.push({ holiday: o.holiday, kind: o.kind, start: o.start, startWeekday: Tz.weekdayOf(o.start), startDay: +o.start.slice(8, 10),
        startMonth: +o.start.slice(5, 7) - 1, end: o.end, daysUntil: Math.max(0, Tz.daysBetween(today, o.start)), ongoing: o.start <= today });
    }
    return out;
  }
  // The window still to come or running at `nowMs`, and its segment already lit (null: none lit yet).
  function windowAt(windows, nowMs) {
    for (var i = 0; i < windows.length; i++) if (!windows[i].end || windows[i].end.at > nowMs) return windows[i];
    return null;
  }
  function litAt(segments, nowMs) {
    var lit = null;
    for (var i = 0; i < segments.length && segments[i].start.at <= nowMs; i++) lit = segments[i];
    return lit;
  }

  function view(data, nowMs, today, cfg) {
    if (!data) return null;
    var inRange = today <= data.range.end, w = inRange ? windowAt(data.windows, nowMs) : null;
    var lit = w && litAt(w.segments, nowMs), first = w && w.segments[0], shown = lit || first;
    var state = lit ? lit.kind : first && first.start.date === today ? STATE.EREV : STATE.WEEKDAY;
    // From candle lighting until midnight the holy day has begun: its Hebrew date is the next civil day's.
    var hebrewDay = lit && lit.start.date === today ? Tz.addDays(today, 1) : today;
    return {
      today: { date: today, weekday: Tz.weekdayOf(today), day: +today.slice(8, 10), month: +today.slice(5, 7) - 1, hebrew: data.hebDates[hebrewDay] || null },
      state: state,
      window: w && { kind: shown.kind, holiday: shown.holiday, parasha: shown.parasha, during: shown.during, reading: shown.reading || null, candles: shown.start, havdalah: w.end,
        daysToCandles: Math.max(0, Tz.daysBetween(today, first.start.date)),
        // Rounded up: the minute tick lands just after the boundary, and "in 2 h 14 min" must not read 2 h 13 min.
        minutesToCandles: state === STATE.EREV ? Math.ceil((first.start.at - nowMs) / 60000) : null },
      note: inRange ? fastNote(data.fasts, nowMs, today) || holidayNote(data.occurrences, today) : null,
      upcoming: upcomingOf(data.occurrences, today, cfg.upcoming),
      omer: inRange && data.omer && data.omer[today] || null
    };
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), today() (the home date),
  //         random() (optional) }. The URL is built at every hop, from today() then.
  function createStore(cfg, deps) {
    var source = {
      cfg: cfg,
      url: function () { return url(cfg, cfg.place, deps.today()); },
      parse: function (json) { return parse(json, cfg); }
    };
    var store = PlaceStore.create([{ id: CALENDAR }], source, deps);
    return {
      refresh: store.refresh,
      data: function () { return store.get(CALENDAR); },
      status: function () { return store.status(CALENDAR); },
      nextAt: store.nextAt,
      stop: store.stop
    };
  }

  return { STATE: STATE, url: url, parse: parse, view: view, createStore: createStore };
})();
