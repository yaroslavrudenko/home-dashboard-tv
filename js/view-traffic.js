/* The Traffic screen: two columns of five widgets — the owner's ten routes from Rehovot («Города», «Рядом»; the main
 * roads are on the traffic map screen). Every widget is the same: the name and a coloured chip (the delay), the time now
 * and the length, and a time bar. Without a Mapbox token: one calm card saying how to connect it. ES5. */
var TrafficView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  var NOTABLE_DELAY = 60;                         // seconds: below this the delay is neither said nor drawn

  // "38 мин" / "1 ч 05 мин" from seconds.
  function minutes(sec) {
    var m = Math.round(sec / 60);
    return m < 60 ? I18n.t('t.min', { n: m }) : I18n.t('t.hmin', { h: Math.floor(m / 60), m: Tz.pad2(m % 60) });
  }
  // The big travel time: the figures large, the units ("мин", "ч") smaller and quieter.
  function minutesHtml(sec) { return esc(minutes(sec)).replace(/(\s*[^\d\s]+)/g, '<span class="unit">$1</span>'); }

  function init(el) {
    el.innerHTML = Html.screenHead('screen.traffic', 'traffic-status', 'traffic-note') + '<div class="screen-body traffic-body" id="traffic-body"></div>';
    els = { body: el.querySelector('#traffic-body'), status: el.querySelector('#traffic-status'), note: el.querySelector('#traffic-note') };
    drawn = '';
  }

  // The time bar: the usual part of the trip in quiet white, the delay over the usual in the level's colour (a trip
  // faster than usual is all white). The widgets of a column share one scale (its longest trip), so bars compare within
  // each column. Without data: the empty track only.
  function bar(d, level, scale) {
    if (!d) return '<div class="tbar"></div>';
    var free = (d.travel - d.delay) / scale * 100, delay = d.delay / scale * 100;
    return '<div class="tbar"><div class="tbar-free" style="width:' + free.toFixed(1) + '%"></div>' +
      (d.delay >= NOTABLE_DELAY ? '<div class="tbar-delay lv-' + level + '" style="left:' + free.toFixed(1) + '%;width:' + delay.toFixed(1) + '%"></div>' : '') + '</div>';
  }
  // The chip says the delay ("+14 мин"), or "Свободно" under a minute.
  function chipText(d) { return d.delay >= NOTABLE_DELAY ? I18n.t('t.delay', { n: Math.round(d.delay / 60) }) : I18n.t('t.level.ok'); }
  function scaleOf(items) {
    var scale = 1;
    for (var i = 0; i < items.length; i++) if (items[i].view.data) scale = Math.max(scale, items[i].view.data.travel);
    return scale;
  }

  // One widget; item: { id, view }. A widget without data on a drawn screen has failed (the batch is applied
  // whole: tests/traffic.test.js C5): a quiet dash and «Нет данных», the empty track keeps its shape.
  function widgetHtml(item, scale) {
    var v = item.view, d = v.data;
    return '<div class="card tw' + (v.kind === 'stale' ? ' is-stale' : '') + '"><div class="tw-top"><span class="tw-name">' +
        esc(I18n.t('t.route.' + item.id)) + '</span>' +
        (d ? '<span class="chip lv-' + v.level + '">' + esc(chipText(d)) + '</span>' : '') + '</div>' +
      '<div class="tw-mid">' + (d ? '<span class="tw-time">' + minutesHtml(d.travel) + '</span>' +
          (d.length !== null ? '<span class="tw-km">' + esc(I18n.t('t.km', { n: Math.round(d.length / 1000) })) + '</span>' : '')
        : '<span class="tw-time is-none">—</span><span class="tnodata">' + esc(I18n.t('t.noData')) + '</span>') + '</div>' +
      bar(d, v.level, scale) + '</div>';
  }
  // A column: its title over its widgets, which share one bar scale.
  function columnHtml(col) {
    var scale = scaleOf(col.items), out = '';
    for (var i = 0; i < col.items.length; i++) out += widgetHtml(col.items[i], scale);
    return '<section class="tcol"><div class="card-title tcol-title">' + esc(I18n.t('t.col.' + col.id)) + '</div>' + out + '</section>';
  }

  function emptyHtml(text) { return Html.emptyCard('traffic-empty', Icons.glyph('car'), text, ''); }
  // Why the data cannot be updated now, with when it may be (the judges' copy): '' when nothing stops it.
  function problemText(m) {
    return m.problem === 'storage' ? I18n.t('t.storage') : m.problem === 'cap' ? I18n.t('t.cap', { time: m.resumeAt })
      : m.problem === 'refused' ? I18n.t('t.refused', { time: m.resumeAt }) : '';
  }
  // The data-time line over the cards: updating, future-dated, out of date or updated, always with when the data is from.
  function dataLine(m) {
    if (m.updating) return I18n.t('t.updatingFrom', { time: m.updated });
    if (m.future) return I18n.t('t.future');
    return I18n.t(m.kind === 'stale' ? 't.stale' : 't.updated', { time: m.updated, n: m.ago });
  }

  // No key: the calm invitation. Drawn once.
  function renderNoKey() {
    if (drawn === 'nokey' + I18n.lang()) return;
    drawn = 'nokey' + I18n.lang();
    els.body.innerHTML = Html.emptyCard('traffic-empty', Icons.glyph('car'), I18n.t('t.noKey'), I18n.t('t.noKeySub'));
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // m: { columns: [{ id, items: [{ id, view }] }], kind ('loading' | 'failed' | 'fresh' | 'stale'), updating, future,
  //      updated ("HH:MM" or "DD.MM HH:MM": the oldest row on screen), ago (its age in minutes), problem ('storage' | 'cap'
  //      | 'refused' | null), resumeAt ("HH:MM" or "DD.MM HH:MM") }. With data the cards stay, the header says when the
  //      data is from, and a problem is a second line under it; with none, one card says what is happening.
  function render(m) {
    var hasData = m.kind === 'fresh' || m.kind === 'stale', problem = problemText(m);
    var body = hasData ? 'cards' : m.kind === 'loading' ? I18n.t('t.updating') : problem || I18n.t('t.failed');
    var key = JSON.stringify([m.columns, m.kind, body, I18n.lang()]);
    if (key !== drawn) {
      drawn = key;
      if (!hasData) els.body.innerHTML = emptyHtml(body);
      else {
        var html = '';
        for (var i = 0; i < m.columns.length; i++) html += columnHtml(m.columns[i]);
        els.body.innerHTML = html;
      }
    }
    Html.setStatus(els.status, 'status screen-status', m.kind, hasData ? dataLine(m) : '');
    var note = hasData ? problem : '', cls = note ? 'status-note is-on' : 'status-note';
    if (els.note.className !== cls) els.note.className = cls;
    if (els.note.textContent !== note) els.note.textContent = note;
  }

  return { init: init, render: render, renderNoKey: renderNoKey };
})();
