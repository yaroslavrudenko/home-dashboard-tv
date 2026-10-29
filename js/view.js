/* Rendering: builds the dashboard's HTML from plain data. No timers, no network. ES5. */
var View = (function () {
  var doc = null, els = {};
  var lastClockText = {};              // clock id → key of what was last drawn (unchanged cards are not touched)

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function temp(t) {
    if (t === null || t === undefined) return '—';
    var r = Math.round(t);
    return (r < 0 ? '−' + (-r) : String(r === 0 ? 0 : r)) + '°';   // typographic minus, never "-0°"
  }
  function byId(id) { return doc.getElementById(id); }

  function init(document, clocks) {
    doc = document;
    els = { clocks: byId('clocks'), now: byId('now'), hourly: byId('hourly'), daily: byId('daily'), status: byId('status') };
    var html = '';
    for (var i = 0; i < clocks.length; i++) {
      html += '<div class="card clock" id="clock-' + esc(clocks[i].id) + '"></div>';
    }
    els.clocks.innerHTML = html;
    lastClockText = {};
  }

  // Difference to the first (home) clock: "Как здесь", "+9 ч", "−1 ч", "+5:30".
  function diffText(offset, homeOffset) {
    if (offset === undefined || homeOffset === undefined) return '';
    var d = offset - homeOffset;
    if (d === 0) return I18n.t('clock.same');
    var a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
    return I18n.t(d > 0 ? 'clock.ahead' : 'clock.behind', { h: m ? h + ':' + Tz.pad2(m) : h });
  }

  // c: { id, wall (Tz.wallTime), homeOffset, isNight, weather: { temp, code, isDay } | null }
  function clockHtml(c) {
    var w = c.wall, time = w.ok ? Tz.pad2(w.hours) + ':' + Tz.pad2(w.minutes) : '--:--';
    var note = !w.ok ? I18n.t('clock.unknown') : (w.approx ? '≈ ' + I18n.t('clock.approx') : '');
    var weather = c.weather ? '<span class="clock-weather">' + Icons.weather(c.weather.code, c.weather.isDay) +
      '<span class="clock-temp">' + temp(c.weather.temp) + '</span></span>' : '';
    return '<div class="clock-head"><span class="clock-city">' + esc(I18n.t('city.' + c.id)) + '</span>' +
      '<span class="clock-dn">' + Icons.glyph(c.isNight ? 'moon' : 'sun') + '</span></div>' +
      '<div class="clock-time' + (w.ok && !w.approx ? '' : ' is-approx') + '">' + (w.ok && w.approx ? '<span class="approx">≈</span>' : '') + time + '</div>' +
      '<div class="clock-date">' + (w.ok ? esc(I18n.dateLong(w.weekday, w.day, w.month)) : '&nbsp;') + '</div>' +
      '<div class="clock-meta"><span class="clock-diff">' + esc(note || diffText(w.offset, c.homeOffset)) + '</span>' + weather + '</div>';
  }

  function renderClocks(list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i], w = c.wall, cw = c.weather;
      // What the card shows, as one string: an unchanged card is not rewritten (icons carry unique mask ids,
      // so the HTML itself cannot be compared).
      var key = [w.ok, w.approx, w.hours, w.minutes, w.day, w.offset, c.homeOffset, c.isNight,
        cw ? Math.round(cw.temp) + '/' + cw.code + '/' + cw.isDay : '', I18n.lang()].join('|');
      if (lastClockText[c.id] === key) continue;
      lastClockText[c.id] = key;
      var el = byId('clock-' + c.id);
      el.innerHTML = clockHtml(c);
      el.className = 'card clock' + (list[i].isNight ? ' is-night' : '');
    }
  }

  function detail(glyph, label, value) {
    return '<div class="detail">' + Icons.glyph(glyph) + '<div class="detail-text"><span class="detail-label">' + esc(label) +
      '</span><span class="detail-value">' + esc(value) + '</span></div></div>';
  }
  function pct(v) { return v === null ? '—' : Math.round(v) + '%'; }

  // m: Weather.parse model or null; placeId for the name; message when there is no data yet.
  function renderWeather(m, placeId, message) {
    if (!m) {
      var empty = '<div class="placeholder">' + esc(message) + '</div>';
      els.now.innerHTML = '<div class="now-place">' + esc(I18n.t('place.' + placeId)) + '</div>' + empty;
      els.hourly.innerHTML = '<div class="card-title">' + esc(I18n.t('w.hourly')) + '</div>';
      els.daily.innerHTML = '<div class="card-title">' + esc(I18n.t('w.daily')) + '</div>';
      return;
    }
    var c = m.current, t = m.today;
    els.now.innerHTML =
      '<div class="now-top"><div class="now-main">' +
        '<div class="now-place">' + esc(I18n.t('place.' + placeId)) + '</div>' +
        '<div class="now-temp">' + temp(c.temp) + '</div>' +
        '<div class="now-cond">' + esc(I18n.condition(c.code)) + '</div>' +
        '<div class="now-sub">' + esc(c.feels === null ? '' : I18n.t('w.feels', { t: temp(c.feels) })) +
          '<span class="now-hl">' + esc(I18n.t('w.high')) + ' ' + temp(t.max) + '&nbsp;&nbsp;' + esc(I18n.t('w.low')) + ' ' + temp(t.min) + '</span></div>' +
      '</div><div class="now-icon">' + Icons.weather(c.code, c.isDay) + '</div></div>' +
      '<div class="details">' +
        detail('wind', I18n.t('w.wind'), c.wind === null ? '—' : Math.round(c.wind) + ' ' + I18n.t('w.kmh')) +
        detail('drop', I18n.t('w.humidity'), pct(c.humidity)) +
        detail('umbrella', I18n.t('w.rain'), pct(t.pop)) +
        detail('sunrise', I18n.t('w.sunrise'), t.sunrise || '—') +
        detail('sunset', I18n.t('w.sunset'), t.sunset || '—') +
      '</div>';

    var h = '<div class="card-title">' + esc(I18n.t('w.hourly')) + '</div><div class="hours">';
    for (var i = 0; i < m.hourly.length; i++) {
      var hr = m.hourly[i];
      h += '<div class="hour' + (hr.now ? ' is-now' : '') + '"><div class="hour-label">' + esc(hr.now ? I18n.t('w.now') : hr.hour) + '</div>' +
        Icons.weather(hr.code, hr.isDay) + '<div class="hour-pop">' + (hr.pop !== null && hr.pop >= 20 ? hr.pop + '%' : '&nbsp;') + '</div>' +
        '<div class="hour-temp">' + temp(hr.temp) + '</div></div>';
    }
    els.hourly.innerHTML = h + '</div>';

    // 7-day list with Apple-style range bars on one shared scale (the week's min … max).
    var lo = Infinity, hi = -Infinity, k;
    for (k = 0; k < m.daily.length; k++) { lo = Math.min(lo, m.daily[k].min); hi = Math.max(hi, m.daily[k].max); }
    var span = Math.max(hi - lo, 1);
    var d = '<div class="card-title">' + esc(I18n.t('w.daily')) + '</div><div class="days">';
    for (k = 0; k < m.daily.length; k++) {
      var day = m.daily[k];
      var left = ((day.min - lo) / span * 100).toFixed(1), width = Math.max((day.max - day.min) / span * 100, 4).toFixed(1);
      d += '<div class="day"><div class="day-name">' + esc(k === 0 ? I18n.t('w.today') : I18n.weekdayShort(day.weekday)) + '</div>' +
        '<div class="day-icon">' + Icons.weather(day.code, true) + '<span class="day-pop">' + (day.pop !== null && day.pop >= 20 ? day.pop + '%' : '') + '</span></div>' +
        '<div class="day-min">' + temp(day.min) + '</div>' +
        '<div class="range"><div class="range-fill" style="left:' + left + '%;width:' + width + '%"></div></div>' +
        '<div class="day-max">' + temp(day.max) + '</div></div>';
    }
    els.daily.innerHTML = d + '</div>';
  }

  // kind: 'fresh' | 'stale' | 'loading' | 'failed'; time: "HH:MM" of the last good data.
  function renderStatus(kind, time) {
    var text = kind === 'fresh' ? I18n.t('w.updated', { time: time }) : kind === 'stale' ? I18n.t('w.stale', { time: time }) :
      kind === 'failed' ? I18n.t('w.failed') : I18n.t('w.loading');
    els.status.className = 'status is-' + kind;
    els.status.innerHTML = '<span class="status-dot"></span>' + esc(text);
  }

  return { init: init, renderClocks: renderClocks, renderWeather: renderWeather, renderStatus: renderStatus, temp: temp, diffText: diffText };
})();
