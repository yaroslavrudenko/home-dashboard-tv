/* MET Norway (api.met.no): the weather's fallback source (batch 15). ES5.
 * Every weather refresh asks Open-Meteo first; when that attempt fails (any HTTP error, a timeout, a transport error, or
 * an answer where no place parses) the same refresh asks MET (js/placestore.js `source.fallback`). The owner, 2026-11-02:
 * «каждый раз пытаться первый вариант - при ошибке второй».
 *   Met.code(symbol)                 MET symbol_code ('partlycloudy_night') → the WMO code the icons and I18n know; null
 *                                    for a code not in MET's list (tests/fixtures/met/legend.csv)
 *   Met.slim(answer)                 the forecast answer with only the fields parse reads (what is kept in memory and on
 *                                    the TV: 57 % of the answer, measured 35,817 of 62,405 chars)
 *   Met.parse(element, cfg, wall)    one place's { fetchedAt, forecast, sun } → the Weather model (js/weather.js), in the
 *                                    place's wall time; wall(ms) is Tz.wallTime for the place's clock. Throws when the
 *                                    current weather is unusable.
 *   Met.fallback(cfg, deps)          the PlaceStore fallback: { id: 'met', fetch(places, done), parse(json, cfg, place) }
 *     cfg:  Config.weather (cfg.met: { forecastBase, sunBase, timeoutMs })
 *     deps: { getJsonExpiring(url, timeoutMs, done(err, json, { expires })), now(), wallOf(place) → wall(ms) }
 * MET answers one place per request: a round is one forecast request per place, all started together (and one sunrise
 * request per place per day, in the same round). A place's forecast is never asked again before its Expires (MET's terms);
 * inside it the kept answer is reused. MET asks for an identifying User-Agent: a browser cannot set that header, a known
 * limit of an app that runs in a TV's browser (no header is faked).
 * MET has no chance of rain for Israel: pop is null («—»), never derived from the amount. */
var Met = (function () {
  var THUNDER = 95;
  // MET's symbols (without the _day / _night / _polartwilight variant) → WMO. Sleet (rain and snow together) has no WMO code
  // of its own in the app's tables: it is shown as snow of the same strength. Every thunder symbol is WMO 95.
  var CODES = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightsleet: 71, sleet: 73, heavysleet: 75, lightsnow: 71, snow: 73, heavysnow: 75,
    lightsleetshowers: 85, sleetshowers: 85, heavysleetshowers: 86, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
    lightrainshowersandthunder: THUNDER, rainshowersandthunder: THUNDER, heavyrainshowersandthunder: THUNDER,
    lightssleetshowersandthunder: THUNDER, sleetshowersandthunder: THUNDER, heavysleetshowersandthunder: THUNDER,
    lightssnowshowersandthunder: THUNDER, snowshowersandthunder: THUNDER, heavysnowshowersandthunder: THUNDER,
    lightrainandthunder: THUNDER, rainandthunder: THUNDER, heavyrainandthunder: THUNDER,
    lightsleetandthunder: THUNDER, sleetandthunder: THUNDER, heavysleetandthunder: THUNDER,
    lightsnowandthunder: THUNDER, snowandthunder: THUNDER, heavysnowandthunder: THUNDER
  };
  var VARIANT = /_(day|night|polartwilight)$/;
  var KEPT = ['air_temperature', 'apparent_air_temperature', 'relative_humidity', 'wind_speed', 'ultraviolet_index_clear_sky'];
  var num = OpenMeteo.num;

  function code(symbol) {
    var base = String(symbol).replace(VARIANT, '');
    return CODES.hasOwnProperty(base) ? CODES[base] : null;
  }

  // ---- what is kept of an answer ----
  function summaryOf(block, withRange) {
    if (!block || !block.summary) return undefined;
    var out = { summary: { symbol_code: block.summary.symbol_code } }, d = block.details;
    if (withRange && d) out.details = { air_temperature_min: d.air_temperature_min, air_temperature_max: d.air_temperature_max };
    return out;
  }
  function slim(answer) {
    var ts = answer.properties.timeseries, out = [];
    for (var i = 0; i < ts.length; i++) {
      var d = ts[i].data, src = d.instant.details, inst = {};
      for (var k = 0; k < KEPT.length; k++) inst[KEPT[k]] = src[KEPT[k]];
      out.push({ time: ts[i].time, data: { instant: { details: inst }, next_1_hours: summaryOf(d.next_1_hours),
        next_6_hours: summaryOf(d.next_6_hours, true), next_12_hours: summaryOf(d.next_12_hours) } });
    }
    return { properties: { timeseries: out } };
  }

  // ---- the model ----
  var HOUR = 3600000, SIX_HOURS = 6 * HOUR, REUSE_MAX = HOUR;
  function symbolOf(d, order) {
    for (var i = 0; i < order.length; i++) if (d[order[i]] && d[order[i]].summary) return d[order[i]].summary.symbol_code;
    return null;
  }
  // Day or night: the symbol's variant when it has one, else the sun of that date ('HH:MM' text compares as time).
  function isDayOf(symbol, key, sun) {
    var v = symbol ? VARIANT.exec(symbol) : null;
    if (v) return v[1] !== 'night';
    var t = key.slice(11, 13) + ':00';
    return !(sun && sun.date === key.slice(0, 10) && sun.rise && sun.set) || (t >= sun.rise && t < sun.set);
  }
  var dateOf = Tz.wallDate;
  // One sun event ("2026-10-25T07:40+03:00") as an instant on the place's clock (Y5: the offset MET wrote it in may not be
  // the place's offset at that moment, on the day the clocks change): { date, hhmm } or null.
  function eventOf(time, wall) {
    var ms = time ? Date.parse(time) : NaN, w = isNaN(ms) ? null : wall(ms);
    return w && w.ok ? { date: dateOf(w), hhmm: Tz.hhmm(w) } : null;
  }
  function sunOf(json, wall) {
    var p = json && json.properties;
    var rise = eventOf(p && p.sunrise && p.sunrise.time, wall), set = eventOf(p && p.sunset && p.sunset.time, wall);
    if (!rise && !set) return null;
    return { date: (rise || set).date, rise: rise ? rise.hhmm : null, set: set ? set.hhmm : null };
  }
  function maxOf(a, b) { return a === null ? b : b === null ? a : Math.max(a, b); }
  function minOf(a, b) { return a === null ? b : b === null ? a : Math.min(a, b); }

  // The place's wall clock over a window of instants (Y9): the clock is asked at both ends, and when its offset is the same
  // there (no change of the clocks inside: the window is ten days, a zone changes twice a year) every instant in between is
  // that offset away from UTC; otherwise the clock is asked per instant.
  function clockFor(wall, fromMs, toMs) {
    var a = wall(fromMs), b = wall(toMs);
    if (!a.ok || !b.ok || a.offset !== b.offset) return wall;
    var off = a.offset * 60000;
    return function (ms) {
      var d = new Date(ms + off);
      return { ok: true, offset: a.offset, year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
    };
  }

  // The steps from the current one (the last at or before the time the answer was asked for), each with its instant, its
  // wall-clock hour key ("2026-11-02T17", the format of Open-Meteo's local times and of Air's keys) and, for a 6-hour
  // range, whether it ends on the same date (Y4).
  function stepsOf(element, wall) {
    var ts = element && element.forecast && element.forecast.properties && element.forecast.properties.timeseries;
    if (!ts || !ts.length) throw new Error('met: no timeseries');
    var first = 0, i;
    for (i = 0; i < ts.length && Date.parse(ts[i].time) <= element.fetchedAt; i++) first = i;
    var clock = clockFor(wall, Date.parse(ts[first].time), Date.parse(ts[ts.length - 1].time) + SIX_HOURS), steps = [];
    for (i = first; i < ts.length; i++) {
      var ms = Date.parse(ts[i].time), key = Tz.hourKey(clock(ms));
      if (key === null) throw new Error('met: the place\'s time zone is unknown');
      var range = ts[i].data.next_6_hours, end = range ? dateOf(clock(ms + SIX_HOURS - 1)) : null;
      steps.push({ key: key, d: ts[i].data, rangeInside: end === key.slice(0, 10) });
    }
    return steps;
  }

  // One day of the 7: min and max of its temperatures (the hourly readings, and the 6-hour ranges where MET's hourly steps
  // end, when the range lies wholly inside the date — Y4), its symbol at midday (the step nearest 12:00: its 12-, 6- or
  // 1-hour summary), UV max (clear sky), the sun. Today (`partial`: MET starts at the current hour, the earlier part of the
  // day is missing) has no max, min or UV max — «—», the owner's D-F1 — only its symbol.
  function dayOf(date, steps, sun, partial) {
    var min = null, max = null, uv = null, mid = null, i;
    for (i = 0; i < steps.length; i++) {
      var s = steps[i], inst = s.d.instant.details, t = num(inst.air_temperature), r = s.d.next_6_hours && s.d.next_6_hours.details;
      min = minOf(min, t); max = maxOf(max, t);
      if (!s.d.next_1_hours && r && s.rangeInside) { min = minOf(min, num(r.air_temperature_min)); max = maxOf(max, num(r.air_temperature_max)); }
      uv = maxOf(uv, num(inst.ultraviolet_index_clear_sky));
      if (!mid || Math.abs(+s.key.slice(11, 13) - 12) < Math.abs(+mid.key.slice(11, 13) - 12)) mid = s;
    }
    var symbol = mid ? symbolOf(mid.d, ['next_12_hours', 'next_6_hours', 'next_1_hours']) : null, today = sun && sun.date === date;
    return { date: date, weekday: Tz.weekdayOf(date), code: symbol ? code(symbol) : null, min: partial ? null : min, max: partial ? null : max,
      pop: null, sunrise: today ? sun.rise : null, sunset: today ? sun.set : null, uvMax: partial ? null : uv };
  }

  function parse(element, cfg, wall) {
    var steps = stepsOf(element, wall), sun = sunOf(element.sun, wall), c = steps[0], inst = c.d.instant.details;
    var symbol = symbolOf(c.d, ['next_1_hours', 'next_6_hours', 'next_12_hours']), wmo = symbol ? code(symbol) : null;
    if (num(inst.air_temperature) === null || wmo === null) throw new Error('met: no current weather');
    var wind = num(inst.wind_speed), hourly = [], days = [], byDay = {}, i;
    for (i = 0; i < steps.length; i++) {
      var s = steps[i], date = s.key.slice(0, 10);
      if (s.d.next_1_hours) {
        var hs = s.d.next_1_hours.summary.symbol_code;
        hourly.push({ key: s.key, hour: s.key.slice(11, 13), temp: num(s.d.instant.details.air_temperature), code: code(hs),
          isDay: isDayOf(hs, s.key, sun), pop: null });
      }
      if (!byDay[date]) { byDay[date] = []; days.push(date); }
      byDay[date].push(s);
    }
    var daily = [];
    for (i = 0; i < days.length && i < cfg.days; i++) daily.push(dayOf(days[i], byDay[days[i]], sun, i === 0));
    return {
      current: { temp: num(inst.air_temperature), feels: num(inst.apparent_air_temperature), code: wmo, isDay: isDayOf(symbol, c.key, sun),
        wind: wind === null ? null : wind * 3.6, humidity: num(inst.relative_humidity), hourKey: c.key },
      hourly: hourly,
      daily: daily
    };
  }

  // ---- the requests ----
  function coord(v) { return Math.round(v * 10000) / 10000; }   // MET's terms: at most 4 decimals
  function forecastUrl(m, place) { return m.forecastBase + '?lat=' + coord(place.lat) + '&lon=' + coord(place.lon); }
  // The place's date and UTC offset now: "+02:00" ('+' sent as %2B: a bare '+' in a query is a space).
  function sunUrl(m, place, w) {
    var off = Math.abs(w.offset), sign = w.offset < 0 ? '-' : '%2B';
    return m.sunBase + '?lat=' + coord(place.lat) + '&lon=' + coord(place.lon) + '&date=' + dateOf(w) + '&offset=' + sign +
      Tz.pad2(Math.floor(off / 60)) + ':' + Tz.pad2(off % 60);
  }

  // A round's element per place: { fetchedAt, forecast, sun, url, at, until, restored } — the forecast's URL, the time it
  // arrived and its Expires go with it (kept on the TV with the answer, Y6); `restored`: it came back from the TV after a
  // restart, not from MET in this run.
  function fallback(cfg, deps) {
    var m = cfg.met, forecasts = {}, suns = {}, generation = 0;   // per place id: the last answer kept (one each: nothing grows)

    // Reuse a kept forecast only while now < min(its Expires, its arrival + an hour) (Y8: Expires is the server's clock).
    function reusable(f, url, now) { return f && f.url === url && now < Math.min(f.until, f.at + REUSE_MAX); }

    // One round: every place's forecast (unless reusable) and sun (unless that date's is kept), all at once; done(null, list)
    // once. An answer that cannot be read counts as not received (Y1): the round always ends. A cancelled or older round's
    // late answers change nothing (Y2).
    function fetch(places, done) {
      var now = deps.now(), mine = ++generation, list = [], left = 1, i;
      function one() { if (--left === 0 && mine === generation) done(null, list); }
      function ask(url, keep, el, field) {
        left++;
        deps.getJsonExpiring(url, m.timeoutMs, function (err, json, meta) {
          if (mine !== generation) return;
          try { if (!err && json) el[field] = keep(url, json, meta, el); } catch (e) { el[field] = null; }
          one();
        });
      }
      for (i = 0; i < places.length; i++) {
        var p = places[i], wall = deps.wallOf(p), w = wall(now), fu = forecastUrl(m, p), f = forecasts[p.id], s = suns[p.id];
        var el = { fetchedAt: now, forecast: null, sun: null };
        list.push(el);
        if (reusable(f, fu, now)) setForecast(el, f); else ask(fu, keepForecast(p.id), el, 'forecast');
        if (!w.ok) continue;
        if (s && s.date === dateOf(w)) el.sun = s.json; else ask(sunUrl(m, p, w), keepSun(p.id, wall), el, 'sun');
      }
      one();
    }
    function setForecast(el, f) { el.forecast = f.json; el.url = f.url; el.at = f.at; el.until = f.until; el.restored = f.restored; }
    function keepForecast(id) {
      return function (url, json, meta, el) {
        var until = Date.parse(meta && meta.expires), f = { url: url, json: slim(json), at: deps.now(), until: isNaN(until) ? 0 : until, restored: false };
        forecasts[id] = f;
        setForecast(el, f);
        return f.json;
      };
    }
    function keepSun(id, wall) {
      return function (url, json) {
        var sun = sunOf(json, wall);
        if (!sun) throw new Error('met: no sun');
        suns[id] = { date: sun.date, json: json };
        return json;
      };
    }
    // After a restart (Y6): the kept round's answers, with their URL, arrival and Expires, as if this run had them.
    function restore(list, places) {
      for (var i = 0; i < places.length && i < list.length; i++) {
        var el = list[i], p = places[i];
        if (el && el.forecast && el.url && typeof el.at === 'number') forecasts[p.id] = { url: el.url, json: el.forecast, at: el.at, until: el.until || 0, restored: true };
        var sun = el && el.sun ? sunOf(el.sun, deps.wallOf(p)) : null;
        if (sun) suns[p.id] = { date: sun.date, json: el.sun };
      }
    }

    return { id: 'met', fetch: fetch, restore: restore, cancel: function () { generation++; },
      // the time a place's data arrived from MET, and whether it came back from the TV (stale until a live answer)
      stamp: function (el) { return { at: el && el.at, restored: !!(el && el.restored) }; },
      parse: function (json, c, place) { return parse(json, c, deps.wallOf(place)); } };
  }

  return { code: code, slim: slim, parse: parse, fallback: fallback, forecastUrl: forecastUrl, sunUrl: sunUrl };
})();
