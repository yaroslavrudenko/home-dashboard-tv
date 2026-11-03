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

  // Before the first answer each cell is a placeholder bar (it keeps its dust slot too, empty: batch 13), so the strip and
  // the rows keep their size. L5: placeholders only while loading — a cell beyond the data on screen is an empty slot, and a
  // failure with no data says so once, quietly, in each card (the current card says when it is tried again).
  var LOADING_HOUR = '<div class="hour is-empty"><div class="hour-label">&nbsp;</div><div class="skeleton"></div><div class="hour-dust"></div></div>';
  var LOADING_DAY = '<div class="day is-empty"><div class="skeleton"></div></div>';   // the days' dust: the band's placeholder (dustBand)
  var GAP_HOUR = '<div class="hour is-gap"></div>', GAP_DAY = '<div class="day is-gap"></div>';
  function noData() { return '<div class="wx-none">' + esc(ViewState.partText('none')) + '</div>'; }

  // Batch 13: the dust forecast (the owner: «прогноз хамсина на каждый час дня как для температуры и на неделю»). dust (from the
  // App, Air.forecast): { loading } before the first air answer, else { hours: [cell], days: [cell], stale } — cell { dust
  // (rounded), khamsin } or null; always { limit } (cfg.dustUgm3). A slot is empty while loading (its room kept), «—» without a
  // value (muted, X5: never the dust colour), the figure in the dust colour, on an amber pill on a khamsin; dimmed when the
  // air is stale. No dust object (a caller without it) reads as loading.
  var DUST_NONE = '<span class="dust-none">—</span>';
  // FIX-18B 13: a khamsin value's pill is coloured by its grade (Air.grade: 1 amber … 4 red — the redder, the more dangerous);
  // an ordinary value (grade 0) keeps the dust colour. One class name for every place a reading is shown.
  function gradeOf(value) { return typeof value === 'number' ? Air.grade(value, Config.air) : 0; }
  function numClass(base, value) { var g = gradeOf(value); return base + (g ? ' is-khamsin kg-' + g : ''); }
  // FIX-18B 13A: a band cell (70 px, seven to a card) cannot hold «1500» on its pill with room to the next one at 24 px; there
  // a value from 1000 on is said in thousands, one decimal — «1,5к», «3,4к» (the hours keep the whole figure: 88 px columns).
  function shortDust(v) { return v >= 1000 ? I18n.t('w.thousand', { n: I18n.number(Math.round(v / 100) / 10, 1) }) : String(v); }
  function dustSlot(cls, dust, c, short) {
    var body = !dust || dust.loading ? '' : !c ? DUST_NONE : '<span class="' + numClass('dust-num', c.dust) + '">' + esc(short ? shortDust(c.dust) : String(c.dust)) + '</span>';
    return '<div class="' + cls + (dust && dust.stale ? ' is-stale' : '') + '">' + body + '</div>';
  }
  function cellOf(list, i) { return list ? list[i] : null; }
  // What the legend's «хамсин ≥ 100» says for a card showing `cells`: the threshold, and whether any cell is a khamsin
  // (X4: only then is it the amber pill). null without a threshold.
  // FIX-18B 13: top — the highest grade on screen (the lit key takes its colour).
  function dustLegend(dust, cells) {
    if (!dust || !dust.limit) return null;
    var top = 0;
    for (var i = 0; cells && i < cells.length; i++) if (cells[i]) top = Math.max(top, gradeOf(cells[i].dust));
    return { limit: dust.limit, active: top > 0, top: top };
  }
  // FIX-18B 13B (the owner: the khamsin is explained ONCE on the main screen, in one place): the current card's dust label
  // carries the grades — each grade's lower bound on its own pill in its colour (100 · 121 · 196 · 271, js/config.js: the EEA
  // PM10 bands) in place of the old «хамсин ≥ 100» pill; quiet grey until a khamsin is on screen (X4), then lit.
  function dustScale(dust, top) {
    var bounds = [dust.limit].concat(Config.air.dustGradesUgm3), out = '';
    for (var i = 0; i < bounds.length; i++) out += '<span class="' + numClass('dust-num', bounds[i]) + '">' + bounds[i] + '</span>';
    return '<span class="dust-legend-scale' + (top ? ' is-active' : '') + '">' + out + '</span>';
  }
  // A card's title row; label: a value's own label after the title (the hourly card's «Пыль», FIX-17B 1: every value has
  // its label) or none. The khamsin key is never here: it is said once, on the current card (dustHtml).
  function cardHead(title, label) {
    return '<div class="card-head"><div class="card-title">' + esc(title) + '</div>' + (label ? '<div class="band-label">' + esc(label) + '</div>' : '') + '</div>';
  }

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
  function airItem(cls, labelKey, value) {   // N10: three parameters (the unused `extra` gone: the dust is its own item)
    return '<div class="air-item ' + cls + '"><div class="air-label">' + esc(I18n.t(labelKey)) + '</div><div class="air-value">' + value + '</div></div>';
  }
  // The dust: a third item of its own (the owner, 2026-11-02: «должно быть понятно а не вкучу слеплено»). Its label line
  // carries the screen's ONE khamsin key (design C, owner 2026-11-02): «Пыль», then the pill «хамсин ≥ 100», amber when the
  // reading or any forecast cell on screen is a khamsin; then «27 мкг/м³» in the value style. The item is drawn whenever any
  // dust is on screen — the reading or a forecast cell (FIX-17B 2): with no reading its value line says «—». Nothing at all:
  // the item is not drawn, its slot stays (nothing moves). d: dustSlot's data; the threshold comes from it, never a literal.
  // A khamsin reading sits on the same pill as a khamsin hour or day, coloured by its grade (FIX-BATCH-18 part B, FIX-18B 13).
  function hasValue(cells) { for (var i = 0; cells && i < cells.length; i++) if (cells[i]) return true; return false; }
  function cellsOf(d) { return (d && d.hours || []).concat(d && d.days || []); }
  // The highest khamsin grade on the main screen: the current reading's and every cell's (FIX-18B 13).
  function topGrade(a, d) {
    var lg = dustLegend(d, cellsOf(d));
    return Math.max(a ? gradeOf(a.dust) : 0, lg ? lg.top : 0);
  }
  function dustHtml(a, d) {
    var now = a && typeof a.dust === 'number', cells = cellsOf(d);
    if (!now && !hasValue(cells)) return '<div class="air-item air-dust is-none"></div>';
    var lg = dustLegend(d, cells), top = topGrade(a, d);
    var label = '<span class="dust-legend-key">' + esc(I18n.t('w.dustLabel')) + '</span>' + (lg ? dustScale(d, top) : '');
    return '<div class="air-item air-dust"><div class="air-label dust-legend">' + label + '</div><div class="air-value">' + (now ? '<span class="' + numClass('air-num' + (gradeOf(a.dust) ? ' dust-num' : ''), a.dust) + '">' + esc(String(a.dust)) +
      '</span> <span class="air-unit">' + esc(I18n.t('w.dustUnit')) + '</span>' : '<span class="air-num">—</span>') + '</div></div>';
  }
  function airBlock(s, isDay) {
    var a = s.air || null, loading = !a && (s.airKind === 'loading' || s.airKind === undefined);
    var uv = s.uv ? figure(String(s.uv.index), 'w.uv.' + s.uv.level, s.uv.level) : '<span class="air-num">—</span>';
    var air = loading ? '<span class="skeleton air-skeleton"></span>'
      : !a || a.level === null ? '<span class="air-none">' + esc(ViewState.partText('none')) + '</span>'
      : figure(String(a.aqi), 'w.air.' + a.level, a.level);
    var dust = dustHtml(a, s.dust);
    return '<div class="now-air' + (a && s.airKind === 'stale' ? ' is-stale' : '') + '">' + airItem('air-uv' + (isDay ? '' : ' is-night'), 'w.uv', uv) +
      airItem('air-aq', 'w.air', air) + dust + '</div>';
  }

  function nowHtml(v, s) {
    var c = v.current, t = v.today || { min: null, max: null, pop: null, sunrise: null, sunset: null }, placeName = s.name;
    return '<div class="now-top"><div class="now-main">' +
        '<div class="now-place">' + esc(placeName) + '</div>' +
        '<div class="now-temp">' + temp(c.temp) + '</div>' +
        '<div class="now-cond">' + esc(c.code === null ? '—' : I18n.condition(c.code)) + '</div>' +   // FIX-19B C1: a lacking sky says so
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

  // dustCellHtml: the hour's dust slot (dustSlot), under the temperature.
  function hourHtml(hr, isNow, dustCellHtml) {
    if (!hr) return GAP_HOUR;
    return '<div class="hour' + (isNow ? ' is-now' : '') + '"><div class="hour-label">' + esc(isNow ? I18n.t('w.now') : hr.hour) + '</div>' +
      (hr.code === null ? '<div class="icon"></div>' : Icons.weather(hr.code, hr.isDay)) +
      '<div class="hour-pop">' + (popText(hr.pop) || '&nbsp;') + '</div><div class="hour-temp">' + temp(hr.temp) + '</div>' + dustCellHtml + '</div>';
  }

  // The day list (7 days on the main card and on each Israel region card since batch 18) with Apple-style range bars: every bar is a window onto ONE cold→warm gradient spanning the
  // week's min…max, so a bar's colour means its temperature. Today carries a dot at the current temperature. The days'
  // dust is the band's (dustBand), never the rows'.
  function dailyHtml(v) {
    var lo = Infinity, hi = -Infinity, k, day;
    for (k = 0; k < v.daily.length; k++) {
      day = v.daily[k];
      if (day && day.min !== null && day.max !== null) { lo = Math.min(lo, day.min); hi = Math.max(hi, day.max); }
    }
    var span = Math.max(hi - lo, 1), out = '';
    for (k = 0; k < v.daily.length; k++) {
      day = v.daily[k];
      if (!day) { out += GAP_DAY; continue; }
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
        '<div class="day-icon' + (popText(day.pop) ? '' : ' is-dry') + '">' + (day.code === null ? '' : Icons.weather(day.code, true)) +
        '<span class="day-pop">' + (popText(day.pop) ? Icons.glyph('umbrella') + popText(day.pop) : '') + '</span></div>' +
        '<div class="day-min">' + temp(day.min) + '</div><div class="range">' + bar + '</div>' +
        '<div class="day-max">' + temp(day.max) + '</div></div>';
    }
    return out;
  }
  // Design C: the dust leaves the rows — one band under the list: its own label «Пыль», then one cell per day (the day's
  // short name over its maximum; the khamsin pill when ≥ 100). Before the first weather answer (n: the slots) the band is
  // there with empty cells of the same size (FIX-17B 5: nothing moves when the data lands); no data and no n: no band.
  function dustBand(v, dust, n) {
    var cells = '', k;
    if (!v) {
      if (!n) return '';
      for (k = 0; k < n; k++) cells += '<div class="band-cell"><div class="band-day"></div><div class="day-dust"></div></div>';
      return '<div class="dust-band is-empty"><div class="band-label">' + esc(I18n.t('w.dustLabel')) + '</div><div class="band-cells">' + cells + '</div></div>';
    }
    for (k = 0; k < v.daily.length; k++) {
      var day = v.daily[k];
      if (!day) { cells += '<div class="band-cell"></div>'; continue; }
      cells += '<div class="band-cell"><div class="band-day">' + esc(day === v.today ? I18n.t('w.todayShort') : I18n.weekdayBand(day.weekday)) + '</div>' +
        dustSlot('day-dust', dust, cellOf(dust && dust.days, k), true) + '</div>';
    }
    return '<div class="dust-band"><div class="band-label">' + esc(I18n.t('w.dustLabel')) + '</div><div class="band-cells">' + cells + '</div></div>';
  }

  // v: Weather.forHour view or null (no data yet). s: { name (the home city in the interface language), kind ('fresh' |
  // 'stale' | 'loading' | 'failed'), retryAt ("HH:MM" | ''), uv, air, airKind (batch 12, airBlock above), dust (batch 13,
  // dustSlot above) }.
  function renderWeather(v, s) {
    var placeName = s.name;
    var hours = '', days = '', i;
    if (!v) {
      var failed = s.kind === 'failed';
      els.now.className = 'card now is-empty';
      els.now.innerHTML = '<div class="now-place">' + esc(placeName) + '</div>' +
        (failed ? ViewState.block('failed', { glyph: Icons.weather(3, true), retryAt: s.retryAt }) : ViewState.block('loading'));
      hours = failed ? noData() : repeat(LOADING_HOUR, sizes.hours);
      days = failed ? noData() : repeat(LOADING_DAY, sizes.days);
    } else {
      els.now.className = 'card now' + (s.kind === 'stale' ? ' is-stale' : '');
      els.now.innerHTML = nowHtml(v, s);
      for (i = 0; i < v.hourly.length; i++) hours += hourHtml(v.hourly[i], i === 0 && v.nowShown, dustSlot('hour-dust', s.dust, cellOf(s.dust && s.dust.hours, i)));
      days = dailyHtml(v);
    }
    var rows = !!v || s.kind !== 'failed';   // failed with no data: no rows, so no dust label and no band (N8)
    els.hourly.innerHTML = cardHead(I18n.t('w.hourly'), rows ? I18n.t('w.dustLabel') : '') + '<div class="hours' + (rows ? '' : ' is-none') + '">' + hours + '</div>';
    els.daily.innerHTML = cardHead(I18n.t('w.days', { n: sizes.days })) + '<div class="days">' + days + '</div>' + dustBand(v, s.dust, rows ? sizes.days : 0);
  }

  // The status line speaks only about data on screen: "updated at" or "not updating · data from". Loading
  // and failure are said once, in the weather card itself. Batch 18 (the owner: «надо сделать так же, как и везде»): it is
  // the screen's status, as on every other screen (the same component, size and side), in the strip above the clocks — the
  // whole sentence always fits there, so the hourly card's title row keeps only its title and «Пыль» (no fitting, B14-1).
  var statusDrawn = '';
  function renderStatus(kind, time, source) {
    var key = [kind, time, source, I18n.lang()].join('|');
    if (key === statusDrawn) return;
    statusDrawn = key;
    Html.setStatus(els.status, 'status screen-status main-status', kind, ViewState.headText(kind, time, source ? [I18n.t('src.' + source)] : []));
  }

  return { init: init, renderClocks: renderClocks, renderWeather: renderWeather, renderStatus: renderStatus, temp: temp, diffText: diffText,
    dailyHtml: dailyHtml, dustBand: dustBand, cardHead: cardHead, numClass: numClass };
})();
