/* Boot and timers: clocks every minute, weather every 15 minutes, burn-in shift, keep the screen on,
 * Back exits. Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  var resolved = [];          // per clock: Tz.resolve result (built once; formatters are reused)
  var store = null;
  var clockTimer = null, shiftIndex = 0;
  var KEY_BACK = 10009;

  function mainPlace() { return Config.places[0]; }

  // "HH:MM" of a UTC moment on the home (first) clock.
  function homeTime(utc) {
    var w = Tz.wallTime(resolved[0], utc);
    return w.ok ? Tz.pad2(w.hours) + ':' + Tz.pad2(w.minutes) : '--:--';
  }

  function renderClocks() {
    var now = Date.now(), list = [], home = Tz.wallTime(resolved[0], now);
    for (var i = 0; i < Config.clocks.length; i++) {
      var c = Config.clocks[i], wall = Tz.wallTime(resolved[i], now);
      var data = store && c.place ? store.get(c.place) : null;
      list.push({ id: c.id, wall: wall, homeOffset: home.ok ? home.offset : undefined,
        isNight: wall.ok && (wall.hours < Config.dayStartsHour || wall.hours >= Config.nightStartsHour),
        weather: data ? { temp: data.current.temp, code: data.current.code, isDay: data.current.isDay } : null });
    }
    View.renderClocks(list);
  }

  function renderStatus() {
    var s = store.status(mainPlace().id);
    View.renderStatus(s.kind, s.updatedAt ? homeTime(s.updatedAt) : '');
  }

  function renderWeather() {
    var id = mainPlace().id, s = store.status(id);
    View.renderWeather(store.get(id), id, I18n.t(s.kind === 'failed' ? 'w.failed' : 'w.loading'));
    renderStatus();
    renderClocks();
  }

  // Clocks change on the minute: wake just after the next minute boundary.
  function tick() {
    renderClocks();
    if (store) renderStatus();          // "stale" can start by age alone
    var now = Date.now();
    clockTimer = setTimeout(tick, 60000 - now % 60000 + 50);
  }

  function shift() {
    var o = Config.burnIn.offsets[shiftIndex = (shiftIndex + 1) % Config.burnIn.offsets.length];
    var t = 'translate(' + o[0] + 'px,' + o[1] + 'px)';
    var stage = document.getElementById('stage');
    stage.style.webkitTransform = t;
    stage.style.transform = t;
  }

  function keepScreenOn() {
    try {
      if (window.webapis && webapis.appcommon) {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
      }
    } catch (e) { /* not on a TV, or the API is missing on this firmware */ }
  }

  function onKey(e) {
    if (e.keyCode === KEY_BACK) {
      e.preventDefault();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* desktop preview */ }
    }
  }

  function onVisible() {
    if (document.hidden) return;
    keepScreenOn();
    clearTimeout(clockTimer);
    tick();
    var s = store.status(mainPlace().id);
    if (s.kind !== 'fresh' || Date.now() - s.updatedAt >= Config.weather.refreshMs) store.refresh();
  }

  function start() {
    I18n.setLang(Config.lang);
    document.documentElement.lang = I18n.lang();
    document.documentElement.dir = I18n.dir();
    var now = Date.now();
    for (var i = 0; i < Config.clocks.length; i++) resolved.push(Tz.resolve(Config.clocks[i], now));
    View.init(document, Config.clocks);

    store = Weather.createStore(Config.places, Config.weather, {
      getJson: Net.getJson,
      now: function () { return Date.now(); },
      setTimeout: function (f, ms) { return setTimeout(f, ms); },
      clearTimeout: function (t) { clearTimeout(t); },
      onChange: renderWeather
    });
    renderWeather();
    tick();
    store.refresh();

    setInterval(shift, Config.burnIn.shiftMs);
    keepScreenOn();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
  }

  return { start: start };
})();

window.addEventListener('load', App.start);
