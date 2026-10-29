/* Boot and timers: three screens (clocks + weather, news, traffic) switched with ◀ ▶ and rotated every
 * Config.rotation.intervalMs, the Israel alert over all of them, burn-in shift, keep the screen on, Back exits.
 * Only the screen on view is redrawn per minute; a hidden screen is redrawn when it comes into view.
 * Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  var resolved = [];          // per clock: Tz.resolve result (built once; formatters are reused)
  var store = null, news = null, traffic = null, alerts = null, screens = null;
  var screenEls = [], dotEls = [];
  var clockTimer = null, shiftIndex = 0, weatherDrawn = '';
  var KEY_BACK = 10009, KEY_LEFT = 37, KEY_RIGHT = 39, SLIDE_PX = 48, FADE_MS = 700;

  function mainPlace() { return Config.places[0]; }
  function wallNow(i) { return Tz.wallTime(resolved[i], Date.now()); }
  // "HH:MM" at home (the first clock) for a moment; '' for none.
  function homeHhmm(ms) { return ms ? Tz.hhmm(Tz.wallTime(resolved[0], ms)) : ''; }
  // When the next attempt runs, rounded up: never "retry at" the minute already shown.
  function retryAt(next) { return next ? homeHhmm(Math.ceil(next / 60000) * 60000) : ''; }
  function timers() {
    return { now: function () { return Date.now(); }, setTimeout: function (f, ms) { return setTimeout(f, ms); },
      clearTimeout: function (t) { clearTimeout(t); } };
  }
  function withTimers(extra) { var d = timers(); for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k]; return d; }

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

  // The main screen: the weather card (only when its hour or state changed), the status line and the clocks.
  function renderMain() {
    var id = mainPlace().id, s = store.status(id), hour = placeHourKey(id);
    var drawn = [hour, s.kind, s.updatedAt, store.nextAt()].join('|');
    if (drawn !== weatherDrawn) {
      weatherDrawn = drawn;
      var data = store.get(id);
      View.renderWeather(data ? Weather.forHour(data, hour, Config.weather) : null, { place: id, kind: s.kind, retryAt: retryAt(store.nextAt()) });
    }
    View.renderStatus(s.kind, homeHhmm(s.updatedAt));
    renderClocks();
  }

  function renderNews() {
    var st = news.status(), names = [];
    for (var i = 0; i < st.failed.length; i++) names.push(I18n.t('n.src.' + st.failed[i]));
    NewsView.render(news.items(), { kind: st.kind, failedNames: names, feedCount: Config.news.feeds.length,
      updated: homeHhmm(st.updatedAt), retryAt: retryAt(news.nextAt()) }, Date.now(), Config.news.listSize);
  }

  function renderTraffic() {
    if (!traffic) { TrafficView.renderNoKey(); return; }
    var st = traffic.status();
    TrafficView.render({ routes: Config.traffic.routes, roads: Config.traffic.roads, routeViews: traffic.routes(), roadViews: traffic.roads(),
      kind: st.kind, updated: homeHhmm(st.updatedAt), retryAt: retryAt(traffic.nextAt()) });
  }

  var RENDER = { main: renderMain, news: renderNews, traffic: renderTraffic };
  function currentId() { return Config.screens[screens ? screens.current() : 0]; }
  function renderCurrent() { RENDER[currentId()](); }
  // A data set changed: redraw it only if its screen is on view.
  function onData(id) { return function () { if (currentId() === id) RENDER[id](); }; }

  function renderAlerts() {
    var st = alerts.state();
    AlertView.render(st, st.active ? homeHhmm(st.active.startedAt) : '');
    screens.hold(!!st.active);
  }

  // Cross-fade with a short slide (opacity and transform only). The incoming screen is drawn before it fades in.
  function showScreen(index, from, dir) {
    var id = Config.screens[index], incoming = screenEls[index], outgoing = screenEls[from];
    RENDER[id]();
    if (traffic) traffic.setVisible(id === 'traffic');
    incoming.style.transition = 'none';
    incoming.style.transform = 'translateX(' + SLIDE_PX * dir + 'px)';
    void incoming.offsetWidth;                     // commit the start position before the transition
    incoming.style.transition = '';
    incoming.style.transform = '';
    incoming.className = 'screen is-active';
    outgoing.className = 'screen';
    outgoing.style.transform = 'translateX(' + (-SLIDE_PX * dir) + 'px)';
    setTimeout(function () {                       // back to rest, unseen, so it can come in from either side
      if (outgoing.className === 'screen') { outgoing.style.transition = 'none'; outgoing.style.transform = ''; }
    }, FADE_MS);
    for (var i = 0; i < dotEls.length; i++) dotEls[i].className = i === index ? 'dot is-on' : 'dot';
  }

  // Clocks and "… ago" change on the minute: wake just after the next minute boundary, redraw the screen on view.
  function tick() {
    renderCurrent();
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

  // Back exits; ◀ ▶ switch screens; every key pauses the rotation. Nothing dismisses an alert.
  function onKey(e) {
    if (e.keyCode === KEY_BACK) {
      e.preventDefault();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* desktop preview */ }
      return;
    }
    if (e.keyCode === KEY_LEFT || e.keyCode === KEY_RIGHT) { e.preventDefault(); screens.step(e.keyCode === KEY_RIGHT ? 1 : -1); }
    else screens.touch();
  }

  // Data older than its interval (or not fresh) is refreshed when the TV wakes.
  function refreshIfOld(s, refreshMs, refresh) { if (s.kind !== 'fresh' || Date.now() - s.updatedAt >= refreshMs) refresh(); }

  function onVisible() {
    if (document.hidden) return;
    keepScreenOn();
    clearTimeout(clockTimer);
    tick();
    alerts.poll();
    refreshIfOld(store.status(mainPlace().id), Config.weather.refreshMs, store.refresh);
    refreshIfOld(news.status(), Config.news.refreshMs, news.refresh);
    if (traffic) traffic.wake();
  }

  function buildScreens() {
    var dots = '';
    for (var i = 0; i < Config.screens.length; i++) {
      var el = document.getElementById('screen-' + Config.screens[i]);
      el.className = i === 0 ? 'screen is-active' : 'screen';
      screenEls.push(el);
      dots += '<span class="' + (i === 0 ? 'dot is-on' : 'dot') + '"></span>';
    }
    var box = document.getElementById('dots');
    box.innerHTML = dots;
    dotEls = box.children;
  }

  function start() {
    I18n.setLang(Config.lang);
    document.documentElement.lang = I18n.lang();
    document.documentElement.dir = I18n.dir();
    var now = Date.now();
    for (var i = 0; i < Config.clocks.length; i++) resolved.push(Tz.resolve(Config.clocks[i], now));
    View.init(document, Config.clocks, { hours: Config.weather.hours, days: Config.weather.days });
    NewsView.init(document.getElementById('screen-news'));
    TrafficView.init(document.getElementById('screen-traffic'));
    AlertView.init(document.getElementById('alert'), document.getElementById('corner'));
    buildScreens();
    screens = Screens.create(Config.screens.length, Config.rotation, withTimers({ onShow: showScreen }));

    store = Weather.createStore(Config.places, Config.weather, withTimers({ getJson: Net.getJson, onChange: onData('main') }));
    news = News.createStore(Config.news, withTimers({ getText: Net.getText, onChange: onData('news') }));
    if (Traffic.hasKey(Config.traffic)) traffic = Traffic.createStore(Config.traffic, withTimers({ postJson: Net.postJson, onChange: onData('traffic') }));
    alerts = Alerts.createMonitor(Config.alerts, withTimers({ getText: Net.getText, onChange: renderAlerts }));

    tick();
    // One parallel round at boot: every data set and the alert feed start together.
    store.refresh();
    news.refresh();
    if (traffic) traffic.refresh();
    alerts.poll();
    renderAlerts();

    setInterval(shift, Config.burnIn.shiftMs);
    keepScreenOn();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
  }

  return { start: start };
})();

window.addEventListener('load', App.start);
