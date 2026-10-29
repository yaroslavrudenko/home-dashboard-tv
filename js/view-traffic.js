/* The Traffic screen: the owner's routes (time now, time without traffic, a coloured delay chip and a bar) and a
 * congestion summary for the main roads. Without a TomTom key: one calm card saying how to connect it. ES5. */
var TrafficView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  // "38 мин" / "1 ч 05 мин" from seconds.
  function minutes(sec) {
    var m = Math.round(sec / 60);
    return m < 60 ? I18n.t('t.min', { n: m }) : I18n.t('t.hmin', { h: Math.floor(m / 60), m: Tz.pad2(m % 60) });
  }

  function init(el) {
    el.innerHTML = Html.screenHead(I18n.t('screen.traffic'), 'traffic-status') + '<div class="screen-body traffic-body" id="traffic-body"></div>';
    els = { body: el.querySelector('#traffic-body'), status: el.querySelector('#traffic-status') };
    drawn = '';
  }

  // The time bar: the free-flow part in quiet white, the delay in the level's colour. The whole bar is the
  // longest travel time on the screen, so bars compare across rows.
  function bar(d, level, scale) {
    var free = d.free / scale * 100, delay = d.delay / scale * 100;
    return '<div class="tbar"><div class="tbar-free" style="width:' + free.toFixed(1) + '%"></div>' +
      (delay >= 0.5 ? '<div class="tbar-delay lv-' + level + '" style="left:' + free.toFixed(1) + '%;width:' + delay.toFixed(1) + '%"></div>' : '') + '</div>';
  }
  function chip(d, level) {
    var m = Math.round(d.delay / 60);
    return '<span class="chip lv-' + level + '">' + esc(m >= 1 ? I18n.t('t.delay', { n: m }) : I18n.t('t.level.ok')) + '</span>';
  }
  // No answer for this item yet: a placeholder while loading, "Нет данных" once it failed.
  function missing(v) { return v.kind === 'failed' ? '<div class="tnodata">' + esc(I18n.t('t.noData')) + '</div>' : '<div class="skeleton tskel"></div>'; }

  function routeHtml(route, v, scale) {
    var d = v.data, stale = v.kind === 'stale';
    return '<div class="card troute' + (stale ? ' is-stale' : '') + '"><div class="troute-top"><div class="troute-place">' +
        '<div class="troute-to">' + esc(I18n.t('t.route.' + route.id)) + '</div>' +
        '<div class="troute-from">' + esc(I18n.t('t.from')) + (d && d.length !== null ? ' · ' + esc(I18n.t('t.km', { n: Math.round(d.length / 1000) })) : '') + '</div>' +
      '</div>' + (d ? '<div class="troute-time">' + esc(minutes(d.travel)) + (stale ? '<span class="stale-mark"></span>' : '') + '</div>' : '') + '</div>' +
      (d ? '<div class="troute-sub">' + chip(d, v.level) + '<span class="troute-usual">' + esc(I18n.t('t.usual', { time: minutes(d.free) })) + '</span></div>' +
        bar(d, v.level, scale) : missing(v)) + '</div>';
  }

  function roadHtml(road, v) {
    var d = v.data;
    if (!d) return '<div class="troad"><div class="troad-top"><span class="troad-name">' + esc(I18n.t('t.road.' + road.id)) + '</span></div>' + missing(v) + '</div>';
    return '<div class="troad' + (v.kind === 'stale' ? ' is-stale' : '') + '"><div class="troad-top"><span class="troad-name">' + esc(I18n.t('t.road.' + road.id)) +
      '</span><span class="troad-level lv-' + v.level + '">' + esc(I18n.t('t.level.' + v.level)) + '</span></div>' +
      '<div class="troad-sub">' + esc(minutes(d.travel)) + (d.delay >= 60 ? ' · ' + esc(I18n.t('t.delay', { n: Math.round(d.delay / 60) })) : '') + '</div>' +
      bar(d, v.level, d.travel) + '</div>';
  }

  function emptyHtml(textKey, subText) {
    return '<div class="card traffic-empty"><div class="empty-state">' + Icons.glyph('car') +
      '<div class="empty-text">' + esc(I18n.t(textKey)) + '</div>' + (subText ? '<div class="empty-sub">' + esc(subText) + '</div>' : '') + '</div></div>';
  }

  // No key: the calm invitation. Drawn once.
  function renderNoKey() {
    if (drawn === 'nokey') return;
    drawn = 'nokey';
    els.body.innerHTML = emptyHtml('t.noKey', I18n.t('t.noKeySub'));
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // m: { routes: [cfg], roads: [cfg], routeViews, roadViews, kind, updated ("HH:MM"), retryAt }
  function render(m) {
    var key = JSON.stringify([m.routeViews, m.roadViews, m.kind, m.retryAt, I18n.lang()]);
    if (key !== drawn) {
      drawn = key;
      if (m.kind === 'loading' || m.kind === 'failed') {
        els.body.innerHTML = emptyHtml(m.kind === 'failed' ? 't.failed' : 't.loading',
          m.kind === 'failed' ? (m.retryAt ? I18n.t('w.retry', { time: m.retryAt }) : I18n.t('w.retrySoon')) : '');
      } else {
        var scale = 1, i, routes = '', roads = '';
        for (i = 0; i < m.routeViews.length; i++) if (m.routeViews[i].data) scale = Math.max(scale, m.routeViews[i].data.travel);
        for (i = 0; i < m.routes.length; i++) routes += routeHtml(m.routes[i], m.routeViews[i], scale);
        for (i = 0; i < m.roads.length; i++) roads += roadHtml(m.roads[i], m.roadViews[i]);
        els.body.innerHTML = '<div class="troutes">' + routes + '</div><section class="card troads"><div class="card-title">' +
          esc(I18n.t('t.roads')) + '</div><div class="troads-list">' + roads + '</div></section>';
      }
    }
    Html.setStatus(els.status, 'status screen-status', m.kind, View.statusText(m.kind, m.updated));
  }

  return { init: init, render: render, renderNoKey: renderNoKey };
})();
