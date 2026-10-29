/* Boot and timers: clocks every minute, weather every 15 minutes, burn-in shift, keep the screen on,
 * Back exits. Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  var resolved = [];          // per clock: Tz.resolve result (built once; formatters are reused)
  var store = null;
  var clockTimer = null, shiftIndex = 0, weatherDrawn = '';
  var KEY_BACK = 10009;

  function mainPlace() { return Config.places[0]; }
  function wallNow(i) { return Tz.wallTime(resolved[i], Date.now()); }

  // The wall-clock hour of a weather place, from the clock linked to it (null: no such clock or zone unknown).
  function placeHourKey(placeId) {
    for (var i = 0; i < Config.clocks.length; i++) if (Config.clocks[i].place === placeId) return Tz.hourKey(wallNow(i));
    return null;
  }

  function renderClocks() {
    var list = [], home = wallNow(0);
    for (var i = 0; i < Config.clocks.length; i++) {
      var c = Config.clocks[i], wall = wallNow(i);
      var data = store && c.place ? store.get(c.place) : null;
      var fresh = data !== null && store.status(c.place).kind === 'fresh';
      list.push({ id: c.id, wall: wall, homeOffset: i > 0 && home.ok ? home.offset : undefined,
        // Night tint: the place's own sunrise/sunset when the weather is fresh, otherwise fixed local hours.
        isNight: fresh ? !data.current.isDay : wall.ok && (wall.hours < Config.dayStartsHour || wall.hours >= Config.nightStartsHour),
        weather: data ? { temp: data.current.temp, code: data.current.code, isDay: data.current.isDay, stale: !fresh } : null });
    }
    View.renderClocks(list);
  }

  // The main weather card, the status line and the clocks; the card itself only when its hour or state changed.
  function render() {
    var id = mainPlace().id, s = store.status(id), hour = placeHourKey(id);
    var drawn = [hour, s.kind, s.updatedAt, store.nextAt()].join('|');
    if (drawn !== weatherDrawn) {
      weatherDrawn = drawn;
      var data = store.get(id), next = store.nextAt();
      View.renderWeather(data ? Weather.forHour(data, hour, Config.weather) : null,
        { place: id, kind: s.kind, retryAt: next ? Tz.hhmm(Tz.wallTime(resolved[0], Math.ceil(next / 60000) * 60000)) : '' });   // never "retry at" the minute already shown
    }
    View.renderStatus(s.kind, s.updatedAt ? Tz.hhmm(Tz.wallTime(resolved[0], s.updatedAt)) : '');
    renderClocks();
  }

  // Clocks change on the minute: wake just after the next minute boundary.
  function tick() {
    if (store) render(); else renderClocks();
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

  // The screen saver is switched off while the app runs. The TV's own Eco "Auto Power Off" is a separate
  // setting the app cannot override (README).
  function keepScreenOn() {
    try {
      if (window.webapis && webapis.appcommon) {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF,
          function () { console.log('screensaver: off'); },
          function (e) { console.error('screensaver: ' + (e && (e.name + ' ' + e.message))); });
      }
    } catch (e) { console.error('screensaver: ' + e.message); }
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
    View.init(document, Config.clocks, { hours: Config.weather.hours, days: Config.weather.days });

    store = Weather.createStore(Config.places, Config.weather, {
      getJson: Net.getJson,
      now: function () { return Date.now(); },
      setTimeout: function (f, ms) { return setTimeout(f, ms); },
      clearTimeout: function (t) { clearTimeout(t); },
      onChange: render
    });
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
