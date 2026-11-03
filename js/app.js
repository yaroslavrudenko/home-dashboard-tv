/* Boot and timers: eight screens (clocks + weather, the weather across Israel, news, markets, Shabbat & holidays, traffic,
 * traffic map, alerts) switched
 * with ◀ ▶ and rotated every Config.rotation.intervalMs, burn-in shift, keep the screen on, Back exits, ▼ / ▲ (and the
 * yellow key) switch the interface language (Config.languages; remembered on the TV), the blue key previews the alert
 * (Config.alerts.previewMs; any key ends it; a real alert always wins).
 * An alert at home (Config.alerts.areas) opens the Alerts screen the moment it starts — that screen is then the alert,
 * red and full — holds the rotation (and Config.rotation.afterAlertMs after it clears) and rings (Config.alerts.sound).
 * While it is up, every other screen carries the red line «Тревога в <home> · с HH:MM» at the top (js/view-banner.js).
 * Nearby alerts keep their quiet corner line; alerts elsewhere in Israel are only in the Alerts screen's list.
 * A screen opened with ◀ ▶ — or on view when the language changes — refreshes its data at once.
 * The markets (js/markets.js) are asked only while their screen is on view (js/onview.js): at once on a ◀ ▶ open,
 * on a rotation arrival when the last attempt is Config.markets.refreshMs old, then every refreshMs while it stays.
 * The air quality (js/air.js, the home city and the Israel regions in one request) and the Shabbat calendar (js/shabbat.js,
 * the home city) refresh on their own cadence like the weather, start in the boot round and refresh when their screen is
 * opened; the Shabbat screen is recomputed from the held calendar on every draw (the time of day moves its state).
 * Only the screen on view is redrawn per minute; a hidden screen is redrawn when it comes into view.
 * The home city (Config.homeCity, or the one chosen on the TV: OK opens the picker, js/view-city.js) is resolved and its
 * routes, map, weather place and alert areas written into Config before anything is made (js/homecity.js); a new choice
 * is saved and the app reloads once, with a toast naming the city.
 * Everything platform-specific is guarded so the same files run in desktop Chrome. ES5. */
var App = (function () {
  // The attention sound: made with Web Audio (js/chime.js); the bundled WAV only where Web Audio is missing or fails.
  var CHIME_URL = 'sounds/alert.wav';
  var env = AppEnv, copyWith = Obj.copyWith, keys = null, wake = null;

  // The live-traffic image, its size from the card's (read once), the home dot placed on it. The image is loaded here
  // (A3: the view only shows it): one Net.getImage with the map's deadline; done(ok) exactly once unless cancelled.
  function createMap(onChange) {
    var m = Config.map, box = MapView.size(), size = TrafficMap.size(m, box.width, box.height);
    MapView.home(TrafficMap.place(m, size, m.home[0], m.home[1]));
    function load(stamp, done) {
      return Net.getImage(TrafficMap.url(m, Config.traffic.token, size, stamp), m.timeoutMs, function (err, img) {
        if (err === 'cancelled') return;
        if (!err) MapView.showImage(img);
        done(!err);
      }).cancel;
    }
    return TrafficMap.createController(m, env.withTimers({ storage: env.storage(), documentVisible: env.documentVisible, load: load, onChange: onChange }));
  }

  // The order matters: the language and the city before anything is made; the views; the navigation (its render table and
  // sources are read at call time, so the sources may follow it); the data sets; the alert layer; the remote and the tick.
  function start() {
    // src: the data sets, ui: the navigation and the alert layer — records filled below and read at call time (late binding).
    var src = {}, ui = {}, flow = null, city;
    ToastView.init(document.getElementById('toast'), env.timers());
    var lang = AppLang.create({ env: env, timers: env.timers(), sources: src, ui: ui, toast: ToastView });
    lang.start();
    city = AppCity.create({ env: env, toast: ToastView });
    city.start();
    var clock = HomeClock.create(Config.clocks, Date.now());
    View.init(document, Config.clocks, { hours: Config.weather.hours, days: Config.weather.days });
    IsraelView.init(document.getElementById('screen-israel'), Config.israel.regions);
    NewsView.init(document.getElementById('screen-news'));
    MarketsView.init(document.getElementById('screen-markets'), FeedRender.marketsLayout(Config.markets));
    ShabbatView.init(document.getElementById('screen-shabbat'), { upcoming: Config.shabbat.upcoming });
    TrafficView.init(document.getElementById('screen-traffic'));
    MapView.init(document.getElementById('screen-map'));
    AlertsScreenView.init(document.getElementById('screen-alerts'));   // makes the alert layer (#alert)
    AlertView.init(document.getElementById('alert'), document.getElementById('corner'));
    AlertBanner.init(document.getElementById('banner'));
    CityView.init(document.getElementById('city'), Cities, env.withTimers({ choose: city.choose }));

    // The render table: one draw per configured screen, by its id from the renderer that has it — built from Config.screens, so
    // no id can be paired with another screen's draw (FIX-BATCH-18 part B; tests/app-modules.test.js: the renderers cover every id).
    var w = WeatherRender.create(src, clock), f = FeedRender.create(src, clock), ids = Config.screens, table = {};
    for (var i = 0; i < ids.length; i++) table[ids[i]] = w[ids[i]] || f[ids[i]];
    // AppNav ↔ AlertFlow is a cycle: a shown screen redraws the banner (a late-bound call to the flow made just below).
    var nav = AppNav.create(document, { ids: ids, rotation: Config.rotation, render: table, sources: src,
      onShown: function () { flow.banner(); }, timers: env.timers() });
    nav.start();

    // Batch 14: the weather and the air keep their last good answer on the TV (shown, stale, after a restart).
    // Batch 15: MET Norway in the same refresh when Open-Meteo fails, each place's UTC times on its own clock.
    src.store = Weather.createStore(Config.places, Config.weather, env.withTimers({ getJson: Net.getJson, storage: env.storage(), onChange: nav.onData('main', 'israel'),
      getJsonExpiring: Net.getJsonExpiring, wallOf: clock.placeWall }));
    src.air = Air.createStore(WeatherRender.airPlaces(Config), Config.air, env.withTimers({ getJson: Net.getJson, storage: env.storage(), onChange: nav.onData('main', 'israel') }));
    src.shabbat = Shabbat.createStore(Config.shabbat, env.withTimers({ getJson: Net.getJson, onChange: nav.onData('shabbat'), today: clock.today }));
    src.news = News.createStore(Config.news, env.withTimers({ getText: Net.getText, onChange: nav.onData('news') }), I18n.lang());
    src.markets = Markets.createController(Config.markets, env.withTimers({ getJson: Net.getJson, documentVisible: env.documentVisible, onChange: nav.onData('markets') }));
    src.traffic = null;
    src.map = null;
    if (Traffic.hasToken(Config.traffic)) {
      src.traffic = Traffic.createStore(Config.traffic, env.withTimers({ getJson: Net.getJson, storage: env.storage(), documentVisible: env.documentVisible, onChange: nav.onData('traffic') }));
      src.map = createMap(nav.onData('map'));
    }
    var chime = Chime.create(env.withTimers({ AudioContext: window.AudioContext || window.webkitAudioContext,
      makeAudio: function () { return new Audio(CHIME_URL); } }));
    var sound = AlertSound.create(Config.alerts.sound, env.withTimers({ play: chime.play }));
    // S1: the alert holds survive a restart (kept on the TV, restored before the first poll); each change redraws the alert
    // layer (a late-bound call to the flow made just below).
    src.alerts = Alerts.createMonitor(Config.alerts, env.withTimers({ getText: Net.getText, storage: env.storage(), onChange: function () { flow.render(); } }));
    flow = AlertFlow.create({ alerts: src.alerts, sound: sound, nav: nav, clock: clock, cityView: CityView, timers: env.timers() });
    // The 7-day list at most once per rotation cycle (the owner's «б»: its cadence IS the cycle, Screens.cycleMs); its
    // areas named by the city catalogue (L13).
    src.history = AlertsHistory.createController(copyWith(Config.alerts.history, { refreshMs: Screens.cycleMs(Config.screens, Config.rotation) }),
      env.withTimers({ getJson: Net.getJson, documentVisible: env.documentVisible, places: Cities.list, onChange: nav.onData('alerts') }));
    var player = PlayerBehind.create(env.withTimers({ send: PlayerBehind.port(env.log), documentVisible: env.documentVisible }));
    ui.nav = nav;
    ui.flow = flow;
    keys = AppKeys.create({ env: env, nav: nav, flow: flow, lang: lang, cityView: CityView, homeId: function () { return Config.home.id; } });
    wake = AppWake.create({ env: env, timers: env.timers(), nav: nav, sources: src, player: player, doc: document });

    wake.tick();
    // One parallel round at boot: every data set and the alert feed start together (traffic and the map load only while
    // their screen is on view).
    src.store.refresh();
    src.air.refresh();
    src.shabbat.refresh();
    src.news.refresh();
    src.alerts.poll();
    flow.render();

    city.toast();
    player.start();                                // the player's music plays on behind the dashboard
    wake.burnIn();
    env.keepScreenOn();
    keys.register();
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
  }
  function onKey(e) { keys.onKey(e); }
  function onVisible() { wake.onVisible(); }

  return { start: start, onKey: onKey, onVisible: onVisible };
})();

window.addEventListener('load', App.start);
