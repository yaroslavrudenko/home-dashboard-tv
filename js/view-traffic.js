/* The Traffic screen: the owner's routes (time now, time without traffic, a coloured delay chip and a bar) and a
 * congestion summary for the main roads. Without a TomTom key: one calm card saying how to connect it. ES5. */
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
    el.innerHTML = Html.screenHead(I18n.t('screen.traffic'), 'traffic-status') + '<div class="screen-body traffic-body" id="traffic-body"></div>';
    els = { body: el.querySelector('#traffic-body'), status: el.querySelector('#traffic-status') };
    drawn = '';
  }

  // The time bar: the free-flow part in quiet white, the delay in the level's colour. Routes share one scale (the
  // longest route) and roads share another (the longest road), so bars compare within each list. Without data: the
  // empty track only, so the row keeps its shape.
  function bar(d, level, scale) {
    if (!d) return '<div class="tbar"></div>';
    var free = d.free / scale * 100, delay = d.delay / scale * 100;
    return '<div class="tbar"><div class="tbar-free" style="width:' + free.toFixed(1) + '%"></div>' +
      (d.delay >= NOTABLE_DELAY ? '<div class="tbar-delay lv-' + level + '" style="left:' + free.toFixed(1) + '%;width:' + delay.toFixed(1) + '%"></div>' : '') + '</div>';
  }
  function chip(d, level) {
    return '<span class="chip lv-' + level + '">' + esc(d.delay >= NOTABLE_DELAY ? I18n.t('t.delay', { n: Math.round(d.delay / 60) }) : I18n.t('t.level.ok')) + '</span>';
  }
  function scaleOf(views) {
    var scale = 1;
    for (var i = 0; i < views.length; i++) if (views[i].data) scale = Math.max(scale, views[i].data.travel);
    return scale;
  }
  // A row without data on a drawn screen has failed (the batch is applied whole: tests/traffic.test.js C5).
  function noData() { return '<span class="tnodata">' + esc(I18n.t('t.noData')) + '</span>'; }

  function routeHtml(route, v, scale) {
    var d = v.data, stale = v.kind === 'stale';
    return '<div class="card troute' + (stale ? ' is-stale' : '') + '"><div class="troute-top"><div class="troute-place">' +
        '<div class="troute-to">' + esc(I18n.t('t.route.' + route.id)) + '</div>' +
        '<div class="troute-from">' + esc(I18n.t('t.from')) + (d && d.length !== null ? ' · ' + esc(I18n.t('t.km', { n: Math.round(d.length / 1000) })) : '') + '</div>' +
      '</div>' + (d ? '<div class="troute-time">' + minutesHtml(d.travel) + (stale ? '<span class="stale-mark"></span>' : '') + '</div>'
        : '<div class="troute-time is-none">—</div>') + '</div>' +
      '<div class="troute-sub">' + (d ? chip(d, v.level) + '<span class="troute-usual">' + esc(I18n.t('t.usual', { time: minutes(d.free) })) + '</span>' : noData()) + '</div>' +
      bar(d, v.level, scale) + '</div>';
  }

  function roadHtml(road, v, scale) {
    var d = v.data;
    return '<div class="troad' + (v.kind === 'stale' ? ' is-stale' : '') + '"><div class="troad-top"><span class="troad-name">' + esc(I18n.t('t.road.' + road.id)) + '</span>' +
      (d ? '<span class="troad-level lv-' + v.level + '">' + esc(I18n.t('t.level.' + v.level)) + '</span></div>' +
        '<div class="troad-sub">' + esc(minutes(d.travel)) + (d.delay >= NOTABLE_DELAY ? ' · ' + esc(I18n.t('t.delay', { n: Math.round(d.delay / 60) })) : '') + '</div>'
        : '</div><div class="troad-sub">' + noData() + '</div>') +
      bar(d, v.level, scale) + '</div>';
  }

  function emptyHtml(text, subText) {
    return '<div class="card traffic-empty"><div class="empty-state">' + Icons.glyph('car') +
      '<div class="empty-text">' + esc(text) + '</div>' + (subText ? '<div class="empty-sub">' + esc(subText) + '</div>' : '') + '</div></div>';
  }
  // Nothing to show: why, and what happens next (a refused key needs the owner; a used-up quota waits).
  function failedHtml(m) {
    var retry = m.retryAt ? I18n.t('w.retry', { time: m.retryAt }) : I18n.t('w.retrySoon');
    if (m.problem === 'key') return emptyHtml(I18n.t('t.badKey'), I18n.t('t.badKeySub'));
    if (m.problem === 'limit') return emptyHtml(I18n.t('t.limit'), retry);
    return emptyHtml(I18n.t('t.failed'), retry);
  }

  // No key: the calm invitation. Drawn once.
  function renderNoKey() {
    if (drawn === 'nokey') return;
    drawn = 'nokey';
    els.body.innerHTML = emptyHtml(I18n.t('t.noKey'), I18n.t('t.noKeySub'));
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // m: { routes: [cfg], roads: [cfg], routeViews, roadViews, kind, problem ('key' | 'limit' | null), updated ("HH:MM"),
  //      retryAt }. With last good data the cards stay and the header turns amber ("Не обновляется · данные от …").
  function render(m) {
    var key = JSON.stringify([m.routeViews, m.roadViews, m.kind, m.problem, m.retryAt, I18n.lang()]);
    if (key !== drawn) {
      drawn = key;
      if (m.kind === 'loading') els.body.innerHTML = emptyHtml(I18n.t('t.loading'), '');
      else if (m.kind === 'failed') els.body.innerHTML = failedHtml(m);
      else {
        var routeScale = scaleOf(m.routeViews), roadScale = scaleOf(m.roadViews), i, routes = '', roads = '';
        for (i = 0; i < m.routes.length; i++) routes += routeHtml(m.routes[i], m.routeViews[i], routeScale);
        for (i = 0; i < m.roads.length; i++) roads += roadHtml(m.roads[i], m.roadViews[i], roadScale);
        els.body.innerHTML = '<div class="troutes">' + routes + '</div><section class="card troads"><div class="card-title">' +
          esc(I18n.t('t.roads')) + '</div><div class="troads-list">' + roads + '</div></section>';
      }
    }
    Html.setStatus(els.status, 'status screen-status', m.kind, View.statusText(m.kind, m.updated));
  }

  return { init: init, render: render, renderNoKey: renderNoKey };
})();
