/* Rendering: builds the dashboard's HTML from plain data. No timers, no network. ES5. */
var View = (function () {
  var doc = null, els = {}, sizes = { hours: 0, days: 0 };
  var lastClockText = {};              // clock id → key of what was last drawn (unchanged cards are not touched)

  var esc = Html.esc;
  function temp(t) {
    if (t === null || t === undefined) return '—';
    var r = Math.round(t);
    // typographic minus, never "-0°"; sign and degree stay with the figure in right-to-left text
    return I18n.ltr((r < 0 ? '−' + (-r) : String(r === 0 ? 0 : r)) + '°');
  }
  function byId(id) { return doc.getElementById(id); }
  function repeat(html, n) { var out = ''; for (var i = 0; i < n; i++) out += html; return out; }

  // size: { hours, days } — the strip and list lengths, so the empty states keep the same rows.
  function init(document, clocks, size) {
    doc = document;
    sizes = size;
    els = { clocks: byId('clocks'), now: byId('now'), hourly: byId('hourly'), daily: byId('daily'), status: byId('status') };
    var html = '';
    for (var i = 0; i < clocks.length; i++) {
      html += '<div class="card clock" id="clock-' + esc(clocks[i].id) + '"></div>';
    }
    els.clocks.innerHTML = html;
    lastClockText = {};
  }

  // Difference to the first (home) clock: "Как здесь", "+9 ч", "−1 ч", "+5:30". Empty on the home clock.
  function diffText(offset, homeOffset) {
    if (offset === undefined || homeOffset === undefined) return '';
    var d = offset - homeOffset;
    if (d === 0) return I18n.t('clock.same');
    var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    return I18n.t(d > 0 ? 'clock.ahead' : 'clock.behind', { h: m ? h + ':' + Tz.pad2(m) : h });
  }

  // c: { id, wall (Tz.wallTime), homeOffset (undefined on the home clock), isNight,
  //      weather: { temp, code, isDay, stale } | null }
  function clockHtml(c) {
    var w = c.wall, cw = c.weather;
    var time = !w.ok ? '<div class="clock-time is-unknown">' + esc(I18n.t('clock.unknown')) + '</div>'
      : '<div class="clock-time">' + (w.approx ? '<span class="approx">≈</span>' : '') + Tz.hhmm(w) + '</div>';
    var weather = cw ? '<span class="clock-weather' + (cw.stale ? ' is-stale' : '') + '">' + Icons.weather(cw.code, cw.isDay) +
      '<span class="clock-temp">' + temp(cw.temp) + '</span></span>' : '';
    return '<div class="clock-head"><span class="clock-city">' + esc(I18n.t('city.' + c.id)) + '</span></div>' + time +
      '<div class="clock-date">' + (w.ok ? esc(I18n.dateLong(w.weekday, w.day, w.month)) : '&nbsp;') + '</div>' +
      '<div class="clock-meta"><span class="clock-diff">' + esc(diffText(w.offset, c.homeOffset)) + '</span>' + weather + '</div>';
  }

  function renderClocks(list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i], w = c.wall, cw = c.weather;
      // What the card shows, as one string: an unchanged card is not rewritten (icons carry unique mask ids,
      // so the HTML itself cannot be compared).
      var key = [w.ok, w.approx, w.hours, w.minutes, w.day, w.offset, c.homeOffset, c.isNight,
        cw ? Math.round(cw.temp) + '/' + cw.code + '/' + cw.isDay + '/' + cw.stale : '', I18n.lang()].join('|');
      if (lastClockText[c.id] === key) continue;
      lastClockText[c.id] = key;
      var el = byId('clock-' + c.id);
      el.innerHTML = clockHtml(c);
      el.className = 'card clock' + (c.isNight ? ' is-night' : '');
    }
  }

  function detail(glyph, label, value) {
    return '<div class="detail">' + Icons.glyph(glyph) + '<div class="detail-text"><span class="detail-label">' + esc(label) +
      '</span><span class="detail-value">' + esc(value) + '</span></div></div>';
  }
  function pct(v) { return v === null ? '—' : Math.round(v) + '%'; }
  function popText(pop) { return pop !== null && pop >= 20 ? pop + '%' : ''; }
  function title(key) { return '<div class="card-title">' + esc(I18n.t(key)) + '</div>'; }

  var EMPTY_HOUR = '<div class="hour is-empty"><div class="hour-label">&nbsp;</div><div class="skeleton"></div></div>';
  var EMPTY_DAY = '<div class="day is-empty"><div class="skeleton"></div></div>';

  // The air & UV block (batch 12), between the place's text and the big icon, without glyphs. UV comes with the weather
  // (s.uv: { index, level } or null, shown «—»); the air with its own request (s.air: { aqi, level, dust, dustHigh } or
  // null; s.airKind 'fresh' | 'stale' | 'loading' | 'failed'). An item: its label, then the figure and the level word —
  // atomic parts, so a line wraps only between them. The dust is always said (the owner, 2026-11-02): a muted line on an
  // ordinary day; from cfg.dustUgm3 (a khamsin) the amber «Хамсин» with the dust under it, even with no AQI (FIX-12B V12);
  // no dust value, no line — and the two-line slot is reserved in every state, so nothing moves. Before the first air answer the slot holds a placeholder bar; no AQI says «Нет данных» (never a made-up level).
  // The values come rounded (Air.summary, Weather.uv). After sunset the UV level word is dimmed: the day's peak is past.
  function figure(num, wordKey, level) {
    return '<span class="air-num">' + esc(num) + '</span> <span class="air-word lv-' + level + '">' + esc(I18n.t(wordKey)) + '</span>';
  }
  function airItem(cls, labelKey, value, extra) {
    return '<div class="air-item ' + cls + '"><div class="air-label">' + esc(I18n.t(labelKey)) + '</div><div class="air-value">' + value + '</div>' +
      extra + '</div>';
  }
  // The dust: a third item of its own (the owner, 2026-11-02: «должно быть понятно а не вкучу слеплено») — its label «Пыль»,
  // then «27 мкг/м³» in the value style; a khamsin (≥ 100 µg/m³) adds the amber word «хамсин» in the level-word slot, as
  // «умеренный» after «5». No value: the item is not drawn, its slot stays (nothing moves).
  function dustHtml(a) {
    if (!a || typeof a.dust !== 'number') return '<div class="air-item air-dust is-none"></div>';
    var value = '<span class="air-num">' + esc(String(a.dust)) + '</span> <span class="air-unit">' + esc(I18n.t('w.dustUnit')) + '</span>' +
      (a.dustHigh ? ' <span class="air-word lv-khamsin">' + esc(I18n.t('w.air.khamsinWord')) + '</span>' : '');
    return airItem('air-dust', 'w.dustLabel', value, '');
  }
  function airBlock(s, isDay) {
    var a = s.air || null, loading = !a && (s.airKind === 'loading' || s.airKind === undefined);
    var uv = s.uv ? figure(String(s.uv.index), 'w.uv.' + s.uv.level, s.uv.level) : '<span class="air-num">—</span>';
    var air = loading ? '<span class="skeleton air-skeleton"></span>'
      : !a || a.level === null ? '<span class="air-none">' + esc(I18n.t('w.noData')) + '</span>'
      : figure(String(a.aqi), 'w.air.' + a.level, a.level);
    var dust = dustHtml(a);
    return '<div class="now-air' + (a && s.airKind === 'stale' ? ' is-stale' : '') + '">' + airItem('air-uv' + (isDay ? '' : ' is-night'), 'w.uv', uv, '') +
      airItem('air-aq', 'w.air', air, '') + dust + '</div>';
  }

  function nowHtml(v, s) {
    var c = v.current, t = v.today || { min: null, max: null, pop: null, sunrise: null, sunset: null }, placeName = s.name;
    return '<div class="now-top"><div class="now-main">' +
        '<div class="now-place">' + esc(placeName) + '</div>' +
        '<div class="now-temp">' + temp(c.temp) + '</div>' +
        '<div class="now-cond">' + esc(I18n.condition(c.code)) + '</div>' +
        '<div class="now-sub">' + (c.feels === null ? '' : '<span>' + esc(I18n.t('w.feels', { t: temp(c.feels) })) + '</span>') +
          '<span>' + esc(I18n.t('w.high')) + ' ' + temp(t.max) + '</span><span>' + esc(I18n.t('w.low')) + ' ' + temp(t.min) + '</span></div>' +
      '</div>' + airBlock(s, c.isDay) + '<div class="now-icon">' + Icons.weather(c.code, c.isDay) + '</div></div>' +
      '<div class="details">' +
        detail('wind', I18n.t('w.wind'), c.wind === null ? '—' : Math.round(c.wind) + ' ' + I18n.t('w.kmh')) +
        detail('drop', I18n.t('w.humidity'), pct(c.humidity)) +
        detail('umbrella', I18n.t('w.rain'), pct(t.pop)) +
        detail('sunrise', I18n.t('w.sunrise'), t.sunrise || '—') +
        detail('sunset', I18n.t('w.sunset'), t.sunset || '—') +
      '</div>';
  }

  function hourHtml(hr, isNow) {
    if (!hr) return EMPTY_HOUR;
    return '<div class="hour' + (isNow ? ' is-now' : '') + '"><div class="hour-label">' + esc(isNow ? I18n.t('w.now') : hr.hour) + '</div>' +
      (hr.code === null ? '<div class="icon"></div>' : Icons.weather(hr.code, hr.isDay)) +
      '<div class="hour-pop">' + (popText(hr.pop) || '&nbsp;') + '</div><div class="hour-temp">' + temp(hr.temp) + '</div></div>';
  }

  // The day list (7 days on the main card, 5 on the Israel weather screen) with Apple-style range bars: every bar is a window onto ONE cold→warm gradient spanning the
  // week's min…max, so a bar's colour means its temperature. Today carries a dot at the current temperature.
  function dailyHtml(v) {
    var lo = Infinity, hi = -Infinity, k, day;
    for (k = 0; k < v.daily.length; k++) {
      day = v.daily[k];
      if (day && day.min !== null && day.max !== null) { lo = Math.min(lo, day.min); hi = Math.max(hi, day.max); }
    }
    var span = Math.max(hi - lo, 1), out = '';
    for (k = 0; k < v.daily.length; k++) {
      day = v.daily[k];
      if (!day) { out += EMPTY_DAY; continue; }
      var isToday = day === v.today, bar = '';
      if (day.min !== null && day.max !== null) {
        var left = (day.min - lo) / span * 100, width = Math.max((day.max - day.min) / span * 100, 4);
        left = Math.min(left, 100 - width);
        var size = (100 / width * 100).toFixed(1), pos = width >= 100 ? 0 : (left / (100 - width) * 100).toFixed(1);
        bar = '<div class="range-fill" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%;background-size:' + size +
          '% 100%;background-position:' + pos + '% 0"></div>';
        // the dot's centre runs from 8 px to (width − 8 px): it never leaves the track
        if (isToday) bar += '<div class="range-dot" style="left:calc((100% - 16px) * ' + Math.max(0, Math.min(1, (v.current.temp - lo) / span)).toFixed(3) + ')"></div>';
      }
      out += '<div class="day"><div class="day-name">' + esc(isToday ? I18n.t('w.today') : I18n.weekdayShort(day.weekday)) + '</div>' +
        '<div class="day-icon">' + (day.code === null ? '' : Icons.weather(day.code, true)) + '<span class="day-pop">' + (popText(day.pop) ? Icons.glyph('umbrella') + popText(day.pop) : '') + '</span></div>' +
        '<div class="day-min">' + temp(day.min) + '</div><div class="range">' + bar + '</div>' +
        '<div class="day-max">' + temp(day.max) + '</div></div>';
    }
    return out;
  }

  // v: Weather.forHour view or null (no data yet). s: { name (the home city in the interface language), kind ('fresh' |
  // 'stale' | 'loading' | 'failed'), retryAt ("HH:MM" | ''), uv, air, airKind (batch 12, airBlock above) }.
  function renderWeather(v, s) {
    var placeName = s.name;
    var hours = '', days = '', i;
    if (!v) {
      var failed = s.kind === 'failed';
      els.now.className = 'card now is-empty';
      els.now.innerHTML = '<div class="now-place">' + esc(placeName) + '</div>' + Html.emptyState(Icons.weather(3, true),
        I18n.t(failed ? 'w.failed' : 'w.loading'), failed ? Html.retryText(s.retryAt) : '');
      hours = repeat(EMPTY_HOUR, sizes.hours);
      days = repeat(EMPTY_DAY, sizes.days);
    } else {
      els.now.className = 'card now' + (s.kind === 'stale' ? ' is-stale' : '');
      els.now.innerHTML = nowHtml(v, s);
      for (i = 0; i < v.hourly.length; i++) hours += hourHtml(v.hourly[i], i === 0 && v.nowShown);
      days = dailyHtml(v);
    }
    els.hourly.innerHTML = title('w.hourly') + '<div class="hours">' + hours + '</div>';
    els.daily.innerHTML = title('w.daily') + '<div class="days">' + days + '</div>';
  }

  // The status line speaks only about data on screen: "updated at" or "not updating · data from". Loading
  // and failure are said once, in the weather card itself.
  function renderStatus(kind, time) {
    Html.setStatus(els.status, 'status', kind, statusText(kind, time));
  }
  // "Обновлено в 20:32" / "Не обновляется · данные от 20:32" / nothing (loading and failure are said in the card)
  function statusText(kind, time) {
    return kind === 'fresh' ? I18n.t('w.updated', { time: time }) : kind === 'stale' ? I18n.t('w.stale', { time: time }) : '';
  }

  return { init: init, renderClocks: renderClocks, renderWeather: renderWeather, renderStatus: renderStatus, statusText: statusText, temp: temp, diffText: diffText,
    dailyHtml: dailyHtml };
})();
