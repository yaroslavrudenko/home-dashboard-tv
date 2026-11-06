/* The Traffic screen: two columns of ten widgets — the twenty routes from the home city («Города», «Рядом»; the main
 * roads are on the traffic map screen). Every widget is the same one line — the name, a coloured chip (the delay), the
 * time now and the length — over a time bar. Without a Mapbox token: one calm card saying how to connect it. ES5. */
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

  // One widget; item: { id, name (the destination in the interface language), view }: one line — the name, the chip, the
  // time, the length (the time and the length end-aligned, so they stand in columns down the screen) — over the bar. A
  // widget without data on a drawn screen has failed (the batch is applied whole: tests/traffic.test.js C5): «нет данных»
  // where the chip is, a quiet dash for the time, the empty track keeps its shape.
  function widgetHtml(item, scale) {
    var v = item.view, d = v.data;
    var km = d && d.length !== null ? esc(I18n.t('t.km', { n: Math.round(d.length / 1000) })) : '';
    return '<div class="card tw' + (v.kind === 'stale' ? ' is-stale' : '') + '"><div class="tw-row"><span class="tw-name">' + esc(item.name) + '</span>' +
      (d ? '<span class="chip lv-' + v.level + '">' + esc(chipText(d)) + '</span><span class="tw-time">' + minutesHtml(d.travel) + '</span>'
        : '<span class="tnodata">' + esc(ViewState.partText('none')) + '</span><span class="tw-time is-none">—</span>') +
      '<span class="tw-km">' + km + '</span></div>' + bar(d, v.level, scale) + '</div>';
  }
  // A column: its title over its widgets, which share one bar scale.
  function columnHtml(col) {
    var scale = scaleOf(col.items), out = '';
    for (var i = 0; i < col.items.length; i++) out += widgetHtml(col.items[i], scale);
    return '<section class="tcol"><div class="card-title tcol-title">' + esc(I18n.t('t.col.' + col.id)) + '</div>' + out + '</section>';
  }

  // Why the data cannot be updated now, with when it may be (the judges' copy): '' when nothing stops it.
  function problemText(m) {
    return m.problem === 'storage' ? I18n.t('t.storage') : m.problem === 'cap' ? I18n.t('t.cap', { time: m.resumeAt })
      : m.problem === 'refused' ? I18n.t('t.refused', { time: m.resumeAt }) : '';
  }
  // The data-time line over the cards (B17-V3): the one vocabulary — fresh or stale with when the data is from and its age
  // («Обновлено в 20:32 · 12 мин назад»); future-dated data is stale with a word on why.
  function dataLine(m) {
    if (m.future) return ViewState.headText('stale', m.updated, [I18n.t('t.futureDetail')]);
    return ViewState.headText(m.kind, m.updated, [I18n.ago(m.ageMs)]);
  }

  // No key: the calm invitation. Drawn once.
  function renderNoKey() {
    if (drawn === 'nokey' + I18n.lang()) return;
    drawn = 'nokey' + I18n.lang();
    els.body.innerHTML = ViewState.noKeyCard();
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // m: { columns: [{ id, items: [{ id, name, view }] }], kind ('loading' | 'failed' | 'fresh' | 'stale'), future,
  //      updated ("HH:MM" or "DD.MM HH:MM": the oldest row on screen), ageMs (its age), problem ('storage' | 'cap'
  //      | 'refused' | null), resumeAt ("HH:MM" or "DD.MM HH:MM") }. With data the cards stay, the header says when the
  //      data is from, and a problem is a second line under it; with none, one card says what is happening.
  function render(m) {
    var hasData = m.kind === 'fresh' || m.kind === 'stale', problem = problemText(m);
    var body = hasData ? 'cards' : m.kind === 'loading' ? 'loading' : problem || 'failed';
    var key = JSON.stringify([m.columns, m.kind, body, I18n.lang()]);
    if (key !== drawn) {
      drawn = key;
      // a problem carries its own time (when it may resume): no retry line under it
      if (!hasData) els.body.innerHTML = m.kind === 'loading' ? ViewState.card('loading') : ViewState.card('failed', { glyph: Icons.glyph('car'), text: problem });
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
