/* Boot and timers: six screens (clocks + weather, the weather across Israel, news, traffic, traffic map, alerts) switched
 * with ◀ ▶ and rotated every Config.rotation.intervalMs, burn-in shift, keep the screen on, Back exits, ▼ / ▲ (and the
 * yellow key) switch the interface language (Config.languages; remembered on the TV), the blue key previews the alert
 * (Config.alerts.previewMs; any key ends it; a real alert always wins).
 * An alert at home (Config.alerts.areas) opens the Alerts screen the moment it starts — that screen is then the alert,
 * red and full — holds the rotation (and Config.rotation.afterAlertMs after it clears) and rings (Config.alerts.sound).
 * While it is up, every other screen carries the red line «Тревога в <home> · с HH:MM» at the top (js/view-banner.js).
 * Nearby alerts keep their quiet corner line; alerts elsewhere in Israel are only in the Alerts screen's list.
 * A screen opened with ◀ ▶ — or on view when the language changes — refreshes its data at once.
 * Only the screen on view is redrawn per minute; a hidden screen is redrawn when it comes into view.
 * The home city (Config.homeCity, or the one chosen on the TV: OK opens the picker, js/view-city.js) is resolved and its
 * routes, map, weather place and alert areas written into Config before anything is made (js/homecity.js); a new choice
 * is saved and the app reloads once, with a toast naming the city.
 * Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  var resolved = [];          // per clock: Tz.resolve result (built once; formatters are reused)
  var store = null, news = null, traffic = null, map = null, alerts = null, history = null, screens = null, sound = null;
  var screenEls = [], dotEls = [];
  var clockTimer = null, shiftIndex = 0, weatherDrawn = '', toastTimer = null;
  var KEY_BACK = 10009, KEY_LEFT = 37, KEY_RIGHT = 39, SLIDE_PX = 48, FADE_MS = 700, TOAST_MS = 1600;
  // The language key: the first of these colour keys the TV lets the app register ('ColorF2Yellow' = 405 on Samsung).
  var LANG_KEYS = [{ name: 'ColorF2Yellow', code: 405 }, { name: 'ColorF0Red', code: 403 }], langKey = LANG_KEYS[0].code;
  var LANG_STORE = 'homedash.lang';
  // The home city: remembered on the TV; a one-shot flag (sessionStorage) asks for the toast after the reload.
  var CITY_STORE = 'homedash.city', CITY_TOAST = 'homedash.cityToast', KEY_OK = 13;
  var KEY_UP = 38, KEY_DOWN = 40, NEWS_SETTLE_MS = 600, newsTimer = null;   // ▲ ▼ switch the language too
  // The alert preview: the blue key (Samsung 'ColorF3Blue' = 406); previewAt is when it started (0: off).
  var PREVIEW_KEY = { name: 'ColorF3Blue', code: 406 }, previewAt = 0, previewTimer = null;
  // The attention sound: made with Web Audio (js/chime.js); the bundled WAV only where Web Audio is missing or fails.
  var CHIME_URL = 'sounds/alert.wav';

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
      View.renderWeather(data ? Weather.forHour(data, hour, Config.weather) : null, { name: HomeCity.name(Config.home.city, I18n.lang()), kind: s.kind,
        retryAt: retryAt(store.nextAt()) });
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
    for (i = 0; i < t.routes.length; i++) {
      var id = t.routes[i].id;
      legs[id] = { id: id, name: HomeCity.name(Config.home.names[id], I18n.lang()), view: routes[i] };
    }
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

  // The Alerts screen: the monitor's real state (never the preview), the recent alerts, today's date at home.
  function renderAlertsScreen() {
    var st = alerts.state(), h = history.state(), w = wallNow(0);
    AlertsScreenView.render(st, h, { homes: Config.alerts.areas, nearby: Config.alerts.nearby, since: st.active ? homeHhmm(st.active.startedAt) : '',
      checked: homeHhmm(st.checkedAt), today: w.ok ? Tz.pad2(w.day) + '.' + Tz.pad2(w.month + 1) + '.' + w.year : '',
      updated: homeHhmm(h.updatedAt), days: Config.alerts.history.days });
  }

  var RENDER = { main: renderMain, israel: renderIsrael, news: renderNews, traffic: renderTraffic, map: renderMap, alerts: renderAlertsScreen };
  function currentId() { return Config.screens[screens ? screens.current() : 0]; }
  function renderCurrent() { RENDER[currentId()](); }
  // A data set changed: redraw it only if one of its screens (the ids given) is on view.
  function onData() {
    var ids = Array.prototype.slice.call(arguments);
    return function () { var id = currentId(); if (ids.indexOf(id) >= 0) RENDER[id](); };
  }

  // The alert layer draws the real state, or the preview's over a quiet one; a real alert ends the preview for good.
  // Only the START of an alert at home opens the Alerts screen and rings: the viewer may then move away with ◀ ▶ and
  // a new record of the same alert never pulls him back. Its end silences the sound; the rotation stays held for
  // Config.rotation.afterAlertMs (Screens.hold).
  function renderAlerts() {
    var st = alerts.state();
    if (st.active && previewAt) endPreview(false);
    if (st.active) CityView.close();              // nothing stands over a real alert
    var shown = previewAt ? Alerts.preview(st, Config.alerts, previewAt) : st;
    AlertView.render(shown, shown.active ? homeHhmm(shown.active.startedAt) : '', homeHhmm(st.checkedAt));
    if (screens.hold(!!st.active)) {
      if (st.active) { sound.start(); openAlerts(); renderBanner(); return; }
      sound.stop();
    }
    renderBanner();
    if (currentId() === 'alerts') renderAlertsScreen();
  }
  // The home-alert line: the real alert only (never the preview), on every screen but the Alerts screen.
  function renderBanner() {
    var a = alerts.state().active;
    AlertBanner.render(!!a && currentId() !== 'alerts', Config.alerts.areas[0], a ? homeHhmm(a.startedAt) : '');
  }
  // The Alerts screen comes into view as if the remote opened it (its recent alerts refresh at once); when it is on view
  // already, its recent alerts refresh the same way.
  function openAlerts() {
    var i = Config.screens.indexOf('alerts');
    if (i < 0) return;
    if (!screens.open(i)) { select('alerts', true); renderAlertsScreen(); }
  }
  function startPreview() {
    if (alerts.state().active) return;
    previewAt = Date.now();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () { endPreview(true); }, Config.alerts.previewMs);
    renderAlerts();
    openAlerts();
    sound.once();
  }
  function endPreview(redraw) {
    clearTimeout(previewTimer);
    previewTimer = null;
    previewAt = 0;
    if (redraw) renderAlerts();
  }

  // Which screen the on-view-only sources (traffic, the map, the recent alerts) serve; explicit: the remote opened it,
  // or the language changed on it — each then refreshes through its own gate (cadence skipped, caps kept).
  function select(id, explicit) {
    if (traffic) traffic.setVisible(id === 'traffic', explicit);
    if (map) map.setVisible(id === 'map', explicit);
    history.setVisible(id === 'alerts', explicit);
  }
  // The owner's rule: a screen opened with ◀ ▶ (not a rotation arrival) — or on view when the language changes —
  // refreshes its data at once; each refresh starts nothing while a request is in flight.
  function refreshOnOpen(id) {
    if (id === 'main' || id === 'israel') store.refresh();
    else if (id === 'news') news.refresh();
  }

  // Cross-fade with a short slide (opacity and transform only). The incoming screen is drawn before it fades in, after
  // its data was told it is on view (any visit, the rotation's included: traffic, the map and the recent alerts load
  // only then) and, when the remote opened it (auto false), asked to refresh.
  function showScreen(index, from, dir, auto) {
    var id = Config.screens[index], incoming = screenEls[index], outgoing = screenEls[from];
    select(id, !auto);
    if (!auto) refreshOnOpen(id);
    RENDER[id]();
    renderBanner();
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

  // Back exits; ◀ ▶ switch screens; the language key switches the language; the blue key previews the alert (on the
  // Alerts screen); every key pauses the rotation. While the preview is up any key only ends it. Nothing dismisses a real
  // alert (◀ ▶ may leave its screen; the rotation never does while it is up).
  function onKey(e) {
    if (CityView.isOpen()) { e.preventDefault(); CityView.key(e.keyCode); screens.touch(); return; }
    if (previewAt || e.keyCode === PREVIEW_KEY.code) {
      e.preventDefault();
      if (previewAt) endPreview(true); else startPreview();
      screens.touch();
      return;
    }
    if (e.keyCode === KEY_BACK) {
      e.preventDefault();
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* desktop preview */ }
      return;
    }
    if (e.keyCode === KEY_LEFT || e.keyCode === KEY_RIGHT) { e.preventDefault(); screens.step(e.keyCode === KEY_RIGHT ? 1 : -1); return; }
    if (e.keyCode === KEY_OK) { e.preventDefault(); if (!alerts.state().active) CityView.open(Config.home.id); }
    if (e.keyCode === langKey || e.keyCode === KEY_DOWN) { e.preventDefault(); switchLang(1); }
    else if (e.keyCode === KEY_UP) { e.preventDefault(); switchLang(-1); }
    screens.touch();
  }

  // ---- language -----------------------------------------------------------------------------------------------
  // The TV delivers a colour key only after the app registers it; the first key it accepts is the language key.
  function registerKeys() {
    if (!window.tizen || !tizen.tvinputdevice) return;
    try { tizen.tvinputdevice.registerKey(PREVIEW_KEY.name); } catch (e) { console.error('alert preview button: ' + e.message); }
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
  function showToast(text) {
    var el = document.getElementById('toast');
    el.textContent = text;
    el.className = 'toast is-on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, TOAST_MS);
  }
  // The next (step 1: ▼ or the colour key) or previous (step −1: ▲) language, at once on every screen: no reload.
  // NEWS_SETTLE_MS after the last press (a held key never sends a burst) the news feeds of the language the remote
  // settles on are fetched, and the screen on view refreshes as if it had just been opened (the owner's rule).
  function switchLang(step) {
    var list = Config.languages, lang = list[(list.indexOf(I18n.lang()) + step + list.length) % list.length];
    applyLang(lang);
    saveLang(lang);
    news.use(lang);
    clearTimeout(newsTimer);
    newsTimer = setTimeout(function () { newsTimer = null; news.refresh(); select(currentId(), true); refreshOnOpen(currentId()); }, NEWS_SETTLE_MS);
    showToast(I18n.t('lang.name'));
    renderCurrent();
    renderAlerts();
  }

  // ---- home city ----------------------------------------------------------------------------------------------
  function sessionStore() { try { return window.sessionStorage || null; } catch (e) { return null; } }
  // The remembered city, else Config.homeCity, else Rehovot; its sections written into Config before anything is made.
  function startCity() {
    var st = storage(), saved = null;
    try { saved = st && st.getItem(CITY_STORE); } catch (e) { saved = null; }
    HomeCity.apply(Config, HomeCity.derive(Cities, HomeCity.resolve(Cities, saved, Config.homeCity)));
  }
  // A new city: written and read back (a TV that refuses storage keeps the city: false), then one reload — the same
  // cold start as switching the TV on, so nothing built for the old city survives.
  function chooseCity(id) {
    var st = storage(), ok = false;
    try { st.setItem(CITY_STORE, id); ok = st.getItem(CITY_STORE) === id; } catch (e) { console.error('city not saved: ' + e.message); }
    if (!ok) return false;
    try { sessionStore().setItem(CITY_TOAST, '1'); } catch (e) { /* no toast after the reload */ }
    location.reload();
    return true;
  }
  // After a reload for a new city: «Город: Хайфа», once.
  function cityToast() {
    var ss = sessionStore(), due = false;
    try { due = !!(ss && ss.getItem(CITY_TOAST)); if (due) ss.removeItem(CITY_TOAST); } catch (e) { due = false; }
    if (due) showToast(I18n.t('city.saved', { name: HomeCity.name(Config.home.city, I18n.lang()) }));
  }

  // Data older than its interval (or not fresh) is refreshed when the TV wakes.
  function refreshIfOld(s, refreshMs, refresh) { if (s.kind !== 'fresh' || Date.now() - s.updatedAt >= refreshMs) refresh(); }

  function onVisible() {
    if (map) map.visibilityChanged();              // hidden: no image is loaded; shown: the map asks its gate again
    history.visibilityChanged();
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
    startCity();
    var now = Date.now();
    for (var i = 0; i < Config.clocks.length; i++) resolved.push(Tz.resolve(Config.clocks[i], now));
    View.init(document, Config.clocks, { hours: Config.weather.hours, days: Config.weather.days });
    IsraelView.init(document.getElementById('screen-israel'), Config.israel.regions);
    NewsView.init(document.getElementById('screen-news'));
    TrafficView.init(document.getElementById('screen-traffic'));
    MapView.init(document.getElementById('screen-map'));
    AlertsScreenView.init(document.getElementById('screen-alerts'), Config.alerts);   // makes the alert layer (#alert)
    AlertView.init(document.getElementById('alert'), document.getElementById('corner'));
    AlertBanner.init(document.getElementById('banner'));
    CityView.init(document.getElementById('city'), Cities, withTimers({ choose: chooseCity }));
    buildScreens();
    screens = Screens.create(Config.screens.length, Config.rotation, withTimers({ onShow: showScreen }));

    store = Weather.createStore(Config.places, Config.weather, withTimers({ getJson: Net.getJson, onChange: onData('main', 'israel') }));
    news = News.createStore(Config.news, withTimers({ getText: Net.getText, onChange: onData('news') }), I18n.lang());
    if (Traffic.hasToken(Config.traffic)) {
      traffic = Traffic.createStore(Config.traffic, withTimers({ getJson: Net.getJson, storage: storage(),
        documentVisible: function () { return !document.hidden; }, onChange: onData('traffic') }));
      map = createMap();
    }
    var chime = Chime.create(withTimers({ AudioContext: window.AudioContext || window.webkitAudioContext,
      makeAudio: function () { return new Audio(CHIME_URL); }, log: function (m) { console.error(m); } }));
    sound = AlertSound.create(Config.alerts.sound, withTimers({ play: chime.play }));
    alerts = Alerts.createMonitor(Config.alerts, withTimers({ getText: Net.getText, onChange: renderAlerts }));
    history = AlertsHistory.createController(Config.alerts.history, withTimers({ getJson: Net.getJson,
      documentVisible: function () { return !document.hidden; }, onChange: onData('alerts') }));

    tick();
    // One parallel round at boot: every data set and the alert feed start together (traffic and the map load only while
    // their screen is on view).
    store.refresh();
    news.refresh();
    alerts.poll();
    renderAlerts();

    cityToast();
    setInterval(shift, Config.burnIn.shiftMs);
    keepScreenOn();
    registerKeys();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
  }

  return { start: start };
})();

window.addEventListener('load', App.start);
