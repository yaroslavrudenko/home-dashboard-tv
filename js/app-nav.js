/* Which screen is on view (batch 17, C-1): the rotation and ◀ ▶ (js/screens.js), the cross-fade, the dots, which
 * on-view-only sources serve the screen, the refresh on a ◀ ▶ open, and the redraw when a data set changes. ES5. */
var AppNav = (function () {
  var SLIDE_PX = 48, FADE_MS = 700;

  // d: { ids (Config.screens), rotation (Config.rotation), render ({ id: draw() } for every id), sources (the record of the
  // data sets, read at call time: store, air, news, shabbat, markets, traffic, map, history), onShown (after a screen is
  // drawn: the banner), timers (AppEnv.timers()) }.
  function create(doc, d) {
    var screens = null, screenEls = [], dotEls = [];

    function current() { return d.ids[screens ? screens.current() : 0]; }
    function currentIs(id) { return current() === id; }
    function renderCurrent() { d.render[current()](); }
    // A data set changed: redraw it only if one of its screens (the ids given) is on view.
    function onData() {
      var ids = Array.prototype.slice.call(arguments);
      return function () { var id = current(); if (ids.indexOf(id) >= 0) d.render[id](); };
    }

    // Which screen the on-view-only sources (traffic, the map, the recent alerts, the markets) serve; explicit: the remote
    // opened it, or the language changed on it — each then refreshes through its own gate (cadence skipped, caps kept).
    function select(id, explicit) {
      var s = d.sources;
      s.markets.setVisible(id === 'markets', explicit);
      if (s.traffic) s.traffic.setVisible(id === 'traffic', explicit);
      if (s.map) s.map.setVisible(id === 'map', explicit);
      s.history.setVisible(id === 'alerts', explicit);
    }
    // The owner's rule: a screen opened with ◀ ▶ (not a rotation arrival) — or on view when the language changes —
    // refreshes its data at once; each refresh starts nothing while a request is in flight.
    function refreshOnOpen(id) {
      var s = d.sources;
      if (id === 'main' || id === 'israel') { s.store.refresh(); s.air.refresh(); }
      else if (id === 'news') s.news.refresh();
      else if (id === 'shabbat') s.shabbat.refresh();
    }

    // Cross-fade with a short slide (opacity and transform only). The incoming screen is drawn before it fades in, after
    // its data was told it is on view (any visit, the rotation's included: traffic, the map and the recent alerts load
    // only then) and, when the remote opened it (auto false), asked to refresh. The order is frozen (DESIGN-17 §3.1).
    function show(index, from, dir, auto) {
      var id = d.ids[index], incoming = screenEls[index], outgoing = screenEls[from];
      select(id, !auto);
      if (!auto) refreshOnOpen(id);
      d.render[id]();
      d.onShown();
      incoming.style.transition = 'none';
      incoming.style.transform = 'translateX(' + SLIDE_PX * dir + 'px)';
      void incoming.offsetWidth;                     // commit the start position before the transition
      incoming.style.transition = '';
      incoming.style.transform = '';
      incoming.className = 'screen is-active';
      outgoing.className = 'screen';
      outgoing.style.transform = 'translateX(' + (-SLIDE_PX * dir) + 'px)';
      d.timers.setTimeout(function () {              // back to rest, unseen, so it can come in from either side
        if (outgoing.className === 'screen') { outgoing.style.transition = 'none'; outgoing.style.transform = ''; }
      }, FADE_MS);
      for (var i = 0; i < dotEls.length; i++) dotEls[i].className = i === index ? 'dot is-on' : 'dot';
    }

    // The screens and their dots, then the rotation.
    function start() {
      var dots = '';
      for (var i = 0; i < d.ids.length; i++) {
        var el = doc.getElementById('screen-' + d.ids[i]);
        el.className = i === 0 ? 'screen is-active' : 'screen';
        screenEls.push(el);
        dots += '<span class="' + (i === 0 ? 'dot is-on' : 'dot') + '"></span>';
      }
      var box = doc.getElementById('dots');
      box.innerHTML = dots;
      dotEls = box.children;
      screens = Screens.create(d.ids.length, d.rotation, Obj.copyWith(d.timers, { onShow: show, idOf: function (i) { return d.ids[i]; } }));
    }

    // A screen comes into view as if the remote opened it; when it is on view already, it is told so again and redrawn
    // (its on-view sources refresh the same way). False when there is no such screen.
    function open(id) {
      var i = d.ids.indexOf(id);
      if (i < 0) return false;
      if (!screens.open(i)) { select(id, true); d.render[id](); }
      return true;
    }

    return { start: start, current: current, currentIs: currentIs, renderCurrent: renderCurrent, onData: onData, select: select,
      refreshOnOpen: refreshOnOpen, open: open, step: function (dir) { screens.step(dir); }, touch: function () { screens.touch(); },
      hold: function (on) { return screens.hold(on); } };
  }
  return { create: create };
})();
