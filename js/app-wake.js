/* The app's life on the panel over time (batch 17, C-1): the minute tick (only the screen on view is redrawn), waking the
 * TV (data older than its interval refreshes, the on-view gates ask again, the screen saver stays off), and the
 * burn-in shift. ES5. */
var AppWake = (function () {
  // d: { env (AppEnv), timers (AppEnv.timers()), nav (AppNav), sources (the record: store, air, news, shabbat, markets, traffic, map, history,
  // alerts), player (PlayerBehind), doc }.
  function create(d) {
    var clockTimer = null, shiftIndex = 0, s = d.sources;

    // Clocks and "… ago" change on the minute: wake just after the next minute boundary, redraw the screen on view.
    function tick() {
      d.nav.renderCurrent();
      var now = d.timers.now();
      clockTimer = d.timers.setTimeout(tick, 60000 - now % 60000 + 50);
    }
    function shift() {
      var o = Config.burnIn.offsets[shiftIndex = (shiftIndex + 1) % Config.burnIn.offsets.length];
      var t = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
      var stage = d.doc.getElementById('stage');
      stage.style.webkitTransform = t;
      stage.style.transform = t;
    }
    function burnIn() { d.timers.setInterval(shift, Config.burnIn.shiftMs); }

    // Data older than its interval (or not fresh) is refreshed when the TV wakes.
    function refreshIfOld(st, refreshMs, refresh) { if (st.kind !== 'fresh' || d.timers.now() - st.updatedAt >= refreshMs) refresh(); }
    function onVisible() {
      d.player.visibilityChanged();                  // hidden: the player stops behind; shown: it plays behind again
      if (s.map) s.map.visibilityChanged();          // hidden: no image is loaded; shown: the map asks its gate again
      s.history.visibilityChanged();
      s.markets.visibilityChanged();
      if (!d.env.documentVisible()) return;
      d.env.keepScreenOn();
      d.timers.clearTimeout(clockTimer);
      tick();
      s.alerts.poll();
      var home = Config.places[0].id;
      refreshIfOld(s.store.status(home), Config.weather.refreshMs, s.store.refresh);
      refreshIfOld(s.news.status(), Config.news.refreshMs, s.news.refresh);
      refreshIfOld(s.air.status(home), Config.air.refreshMs, s.air.refresh);
      refreshIfOld(s.shabbat.status(), Config.shabbat.refreshMs, s.shabbat.refresh);
      if (s.traffic) s.traffic.wake();
    }
    return { tick: tick, burnIn: burnIn, onVisible: onVisible };
  }
  return { create: create };
})();
