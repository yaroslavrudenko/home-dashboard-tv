/* Boot and timers: five screens (clocks + weather, the weather across Israel, news, traffic, traffic map) switched with ◀ ▶ and rotated every
 * Config.rotation.intervalMs, the Israel alert over all of them, burn-in shift, keep the screen on, Back exits, ▼ / ▲
 * (and the yellow key) switch the interface language (Config.languages; remembered on the TV).
 * Only the screen on view is redrawn per minute; a hidden screen is redrawn when it comes into view.
 * Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  var resolved = [];          // per clock: Tz.resolve result (built once; formatters are reused)
  var store = null, news = null, traffic = null, map = null, alerts = null, screens = null;
  var screenEls = [], dotEls = [];
  var clockTimer = null, shiftIndex = 0, weatherDrawn = '', toastTimer = null;
  var KEY_BACK = 10009, KEY_LEFT = 37, KEY_RIGHT = 39, SLIDE_PX = 48, FADE_MS = 700, TOAST_MS = 1600;
  // The language key: the first of these colour keys the TV lets the app register ('ColorF2Yellow' = 405 on Samsung).
  var LANG_KEYS = [{ name: 'ColorF2Yellow', code: 405 }, { name: 'ColorF0Red', code: 403 }], langKey = LANG_KEYS[0].code;
  var LANG_STORE = 'homedash.lang';
  var KEY_UP = 38, KEY_DOWN = 40, NEWS_SETTLE_MS = 600, newsTimer = null;   // ▲ ▼ switch the language too

  function mainPlace() { return Config.places[0]; }
  function wallNow(i) { return Tz.wallTime(resolved[i], Date.now()); }
  // "HH:MM" at home (the first clock) for a moment; '' for none.
  function homeHhmm(ms) { return ms ? Tz.hhmm(Tz.wallTime(resolved[0], ms)) : ''; }
  // When the next attempt runs, rounded up: never "retry at" the minute already shown.
  function retryAt(next) { return next ? homeHhmm(Math.ceil(next / 60000) * 60000) : ''; }
  // "HH:MM" at home, with "DD.MM " before it when that moment is not today at home; '' for none.
  function homeStamp(ms) {
    if (!ms) return '';
    var w = Tz.wallTime(resolved[0], ms), today = wallNow(0);
    var other = w.ok && today.ok && (w.year !== today.year || w.month !== today.month || w.day !== today.day);
    return (other ? Tz.pad2(w.day) + '.' + Tz.pad2(w.month + 1) + ' ' : '') + Tz.hhmm(w);
  }
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
    var drawn = [hour, s.kind, s.updatedAt, store.nextAt(), I18n.lang()].join('|');
    if (drawn !== weatherDrawn) {
      weatherDrawn = drawn;
      var data = store.get(id);
      View.renderWeather(data ? Weather.forHour(data, hour, Config.weather) : null, { place: id, kind: s.kind, retryAt: retryAt(store.nextAt()) });
    }
    View.renderStatus(s.kind, homeHhmm(s.updatedAt));
    renderClocks();
  }

  // The Israel weather screen: each region's card from the main weather's data at Israel's wall-clock hour; the header
  // speaks once for the data on screen (stale if any card is, with the oldest time).
  function renderIsrael() {
    var cfg = Config.israel, hour = Tz.hourKey(wallNow(0)), next = store.nextAt(), cards = [], kind = '', oldest = 0, i;
    for (i = 0; i < cfg.regions.length; i++) {
      var r = cfg.regions[i], s = store.status(r.place), data = store.get(r.place), v = null;
      if (data) {
        v = Weather.forHour(data, hour, Config.weather);
        v.daily = v.daily.slice(0, cfg.days);
        kind = kind === 'stale' || s.kind === 'stale' ? 'stale' : 'fresh';
        oldest = oldest ? Math.min(oldest, s.updatedAt) : s.updatedAt;
      }
      cards.push({ region: r, view: v, kind: s.kind, retryAt: retryAt(next), key: [hour, s.kind, s.updatedAt, next].join('|') });
    }
    IsraelView.render(cards, cfg.days, { kind: kind || 'none', updated: homeHhmm(oldest) });
  }

  // The header speaks for the columns that are current (fresh: the newest answer); a failed feed says so in its own
  // column only. Nothing current at all: "loading" says nothing, "failed" says when it is tried again.
  function renderNews() {
    var st = news.status(), cols = [], i;
    for (i = 0; i < Config.news.columns.length; i++) {
      var id = Config.news.columns[i].id, v = news.column(id);
      cols.push({ id: id, source: v.source, items: v.items, kind: v.kind, updated: homeHhmm(v.updatedAt) });
    }
    NewsView.render(cols, { kind: st.kind, updated: homeHhmm(st.updatedAt), retryAt: retryAt(news.nextAt()) }, Date.now(), Config.news.perColumn);
  }

  // The traffic screen's columns (Config.traffic.columns) filled with each route's current view.
  function trafficColumns() {
    var t = Config.traffic, legs = {}, routes = traffic.routes(), cols = [], i, j;
    for (i = 0; i < t.routes.length; i++) legs[t.routes[i].id] = { id: t.routes[i].id, view: routes[i] };
    for (i = 0; i < t.columns.length; i++) {
      var items = [];
      for (j = 0; j < t.columns[i].legs.length; j++) items.push(legs[t.columns[i].legs[j]]);
      cols.push({ id: t.columns[i].id, items: items });
    }
    return cols;
  }

  function renderTraffic() {
    if (!traffic) { TrafficView.renderNoKey(); return; }
    var st = traffic.status();
    TrafficView.render({ columns: trafficColumns(), kind: st.kind, updating: st.updating, future: st.future, problem: st.problem,
      updated: homeStamp(st.updatedAt), ago: Math.floor((Date.now() - st.updatedAt) / 60000),
      resumeAt: homeStamp(st.resumeAt ? Math.ceil(st.resumeAt / 60000) * 60000 : 0) });
  }

  // localStorage, or null where the TV refuses it (traffic then pauses: its request counter cannot be kept).
  function storage() { try { return window.localStorage || null; } catch (e) { return null; } }

  function renderMap() {
    if (!map) { MapView.renderNoKey(); return; }
    var st = map.state();
    MapView.render(st, homeHhmm(st.updatedAt));
  }
  // The live-traffic image, its size from the card's (read once), the home dot placed on it.
  function createMap() {
    var m = Config.map, box = MapView.size(), size = TrafficMap.size(m, box.width, box.height);
    MapView.home(TrafficMap.place(m, size, m.home[0], m.home[1]));
    return TrafficMap.createController(m, withTimers({ storage: storage(), documentVisible: function () { return !document.hidden; },
      load: function (stamp, done) { return MapView.load(TrafficMap.url(m, Config.traffic.token, size, stamp), m.timeoutMs, done); },
      onChange: onData('map') }));
  }

  var RENDER = { main: renderMain, israel: renderIsrael, news: renderNews, traffic: renderTraffic, map: renderMap };
  function currentId() { return Config.screens[screens ? screens.current() : 0]; }
  function renderCurrent() { RENDER[currentId()](); }
  // A data set changed: redraw it only if one of its screens (the ids given) is on view.
  function onData() {
    var ids = Array.prototype.slice.call(arguments);
    return function () { var id = currentId(); if (ids.indexOf(id) >= 0) RENDER[id](); };
  }

  function renderAlerts() {
    var st = alerts.state();
    AlertView.render(st, st.active ? homeHhmm(st.active.startedAt) : '', homeHhmm(st.checkedAt));
    screens.hold(!!st.active);
  }

  // The owner's rule: a screen opened with ◀ ▶ (not a rotation arrival) refreshes its data at once — through each
  // source's own refresh, which starts nothing while a request is in flight (traffic and the map: their setVisible).
  function refreshOnOpen(id) {
    if (id === 'main' || id === 'israel') store.refresh();
    else if (id === 'news') news.refresh();
  }

  // Cross-fade with a short slide (opacity and transform only). The incoming screen is drawn before it fades in, after
  // its data was told it is on view (any visit, the rotation's included: traffic and the map load only then) and, when
  // the remote opened it (auto false), asked to refresh.
  function showScreen(index, from, dir, auto) {
    var id = Config.screens[index], incoming = screenEls[index], outgoing = screenEls[from];
    if (traffic) traffic.setVisible(id === 'traffic', !auto);
    if (map) map.setVisible(id === 'map', !auto);
    if (!auto) refreshOnOpen(id);
    RENDER[id]();
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

  // Back exits; ◀ ▶ switch screens; the language key switches the language; every key pauses the rotation. Nothing
  // dismisses an alert.
  function onKey(e) {
    if (e.keyCode === KEY_BACK) {
      e.preventDefault();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* desktop preview */ }
      return;
    }
    if (e.keyCode === KEY_LEFT || e.keyCode === KEY_RIGHT) { e.preventDefault(); screens.step(e.keyCode === KEY_RIGHT ? 1 : -1); return; }
    if (e.keyCode === langKey || e.keyCode === KEY_DOWN) { e.preventDefault(); switchLang(1); }
    else if (e.keyCode === KEY_UP) { e.preventDefault(); switchLang(-1); }
    screens.touch();
  }

  // ---- language -----------------------------------------------------------------------------------------------
  // The TV delivers a colour key only after the app registers it; the first key it accepts is the language key.
  function registerLangKey() {
    if (!window.tizen || !tizen.tvinputdevice) return;
    for (var i = 0; i < LANG_KEYS.length; i++) {
      try { tizen.tvinputdevice.registerKey(LANG_KEYS[i].name); langKey = LANG_KEYS[i].code; return; }
      catch (e) { console.error('language key ' + LANG_KEYS[i].name + ': ' + e.message); }
    }
  }
  function known(lang) { return Config.languages.indexOf(lang) >= 0; }
  // The remembered language, else Config.lang, else the first of Config.languages.
  function startLang() {
    var st = storage(), saved = null;
    try { saved = st && st.getItem(LANG_STORE); } catch (e) { saved = null; }
    return known(saved) ? saved : known(Config.lang) ? Config.lang : Config.languages[0];
  }
  function saveLang(lang) {
    var st = storage();
    try { if (st) st.setItem(LANG_STORE, lang); } catch (e) { console.error('language not saved: ' + e.message); }
  }
  // Strings, direction and the fixed labels; the drawn parts follow from their own keys, which carry the language.
  function applyLang(lang) {
    I18n.setLang(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = I18n.dir();
    Html.relabel(document);
  }
  function showToast() {
    var el = document.getElementById('toast');
    el.textContent = I18n.t('lang.name');
    el.className = 'toast is-on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, TOAST_MS);
  }
  // The next (step 1: ▼ or the colour key) or previous (step −1: ▲) language, at once on every screen: no reload. The
  // only requests are the news feeds of the language the remote settles on: fetched NEWS_SETTLE_MS after the last
  // press, so a held key never sends a burst.
  function switchLang(step) {
    var list = Config.languages, lang = list[(list.indexOf(I18n.lang()) + step + list.length) % list.length];
    applyLang(lang);
    saveLang(lang);
    news.use(lang);
    clearTimeout(newsTimer);
    newsTimer = setTimeout(function () { newsTimer = null; news.refresh(); }, NEWS_SETTLE_MS);
    showToast();
    renderCurrent();
    renderAlerts();
  }

  // Data older than its interval (or not fresh) is refreshed when the TV wakes.
  function refreshIfOld(s, refreshMs, refresh) { if (s.kind !== 'fresh' || Date.now() - s.updatedAt >= refreshMs) refresh(); }

  function onVisible() {
    if (map) map.visibilityChanged();              // hidden: no image is loaded; shown: the map asks its gate again
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
    applyLang(startLang());
    var now = Date.now();
    for (var i = 0; i < Config.clocks.length; i++) resolved.push(Tz.resolve(Config.clocks[i], now));
    View.init(document, Config.clocks, { hours: Config.weather.hours, days: Config.weather.days });
    IsraelView.init(document.getElementById('screen-israel'), Config.israel.regions);
    NewsView.init(document.getElementById('screen-news'));
    TrafficView.init(document.getElementById('screen-traffic'));
    MapView.init(document.getElementById('screen-map'));
    AlertView.init(document.getElementById('alert'), document.getElementById('corner'));
    buildScreens();
    screens = Screens.create(Config.screens.length, Config.rotation, withTimers({ onShow: showScreen }));

    store = Weather.createStore(Config.places, Config.weather, withTimers({ getJson: Net.getJson, onChange: onData('main', 'israel') }));
    news = News.createStore(Config.news, withTimers({ getText: Net.getText, onChange: onData('news') }), I18n.lang());
    if (Traffic.hasToken(Config.traffic)) {
      traffic = Traffic.createStore(Config.traffic, withTimers({ getJson: Net.getJson, storage: storage(),
        documentVisible: function () { return !document.hidden; }, onChange: onData('traffic') }));
      map = createMap();
    }
    alerts = Alerts.createMonitor(Config.alerts, withTimers({ getText: Net.getText, onChange: renderAlerts }));

    tick();
    // One parallel round at boot: every data set and the alert feed start together (traffic and the map load only while
    // their screen is on view).
    store.refresh();
    news.refresh();
    alerts.poll();
    renderAlerts();

    setInterval(shift, Config.burnIn.shiftMs);
    keepScreenOn();
    registerLangKey();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
  }

  return { start: start };
})();

window.addEventListener('load', App.start);
