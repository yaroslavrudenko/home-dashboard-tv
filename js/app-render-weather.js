/* What the weather data looks like on the clocks, the main screen and the Israel screen (batch 17, C-1): the air and the
 * dust forecast joined in. Reads held state only — never requests anything. ES5. */
var WeatherRender = (function () {
  // The air quality's places: the home city's and the Israel regions', in one request.
  function airPlaces(cfg) {
    var out = [cfg.places[0]], regions = cfg.israel.regions, i, j;
    for (i = 0; i < regions.length; i++) for (j = 0; j < cfg.places.length; j++) if (cfg.places[j].id === regions[i].place) out.push(cfg.places[j]);
    return out;
  }
  // The keys of a forecast view's rows (an empty row: null): its hours' keys, its days' dates.
  function keysOf(rows, field) { var out = []; for (var i = 0; i < rows.length; i++) out.push(rows[i] ? rows[i][field] : null); return out; }
  // The «Сейчас» hour's dust: the CURRENT reading (Air.summary), the same value and khamsin flag as the current card (X2).
  function nowDust(summary) { return summary && summary.dust !== null ? { dust: summary.dust, khamsin: summary.dustHigh } : null; }

  // src: { store (the weather), air }; clock: HomeClock.
  // mark (optional): AppEnv.mark — the first main screen drawn with its weather is named (FIX-BATCH-19 7)
  function create(src, clock, mark) {
    var weatherDrawn = '', fullMarked = false;
    function mainPlace() { return Config.places[0]; }
    // What a place's air shows (Air.summary) and the state of its data.
    function airOf(placeId) { return { air: Air.summary(src.air.get(placeId), Config.air), airKind: src.air.status(placeId).kind }; }
    // Batch 13: the dust forecast for the cells on screen (Air.forecast, once per render): { loading } before the first air
    // answer, else the cells and whether the data are stale; the khamsin threshold for the legend either way.
    function dustOf(placeId, hourKeys, dates) {
      var model = src.air.get(placeId), kind = src.air.status(placeId).kind, cfg = Config.air;
      if (!model && kind === 'loading') return { loading: true, limit: cfg.dustUgm3 };
      var f = Air.forecast(model, hourKeys, dates, cfg);
      return { hours: f.hours, days: f.days, stale: kind === 'stale', limit: cfg.dustUgm3 };
    }

    function clockWeather(cur, fresh) { return { temp: cur.temp, code: cur.code, isDay: cur.isDay, stale: !fresh }; }
    function clocks() {
      var list = [], home = clock.wall(0), store = src.store;
      for (var i = 0; i < Config.clocks.length; i++) {
        var c = Config.clocks[i], wall = clock.wall(i);
        var data = store && c.place ? store.get(c.place) : null;
        var fresh = data !== null && store.status(c.place).kind === 'fresh';
        // FIX-BATCH-19 5: the same hour as the main card; FIX-19B C8: that one hour also decides the night tint
        var cur = data ? Weather.currentAt(data, clock.placeHourKey(c.place)) : null;
        list.push({ id: c.id, wall: wall, homeOffset: i > 0 && home.ok ? home.offset : undefined,
          // Night tint: the place's own sunrise/sunset when the weather is fresh, otherwise fixed local hours.
          isNight: fresh ? !cur.isDay : wall.ok && (wall.hours < Config.dayStartsHour || wall.hours >= Config.nightStartsHour),
          weather: cur ? clockWeather(cur, fresh) : null });
      }
      View.renderClocks(list);
    }

    // The main screen: the weather card (only when its hour or state changed), the status line and the clocks.
    // The dust forecast on screen is part of what is drawn (B13-D7): a new forecast redraws, an unchanged one does not.
    function main() {
      var store = src.store, id = mainPlace().id, s = store.status(id), hour = clock.placeHourKey(id), a = airOf(id);
      var data = store.get(id), v = data ? Weather.forHour(data, hour, Config.weather) : null;
      var dust = dustOf(id, v ? keysOf(v.hourly, 'key') : [], v ? keysOf(v.daily, 'date') : []);
      if (v && v.nowShown && dust.hours) dust.hours[0] = nowDust(a.air);   // X2: «Сейчас» is the reading the current card shows
      var drawn = [hour, s.kind, s.updatedAt, store.nextAt(), I18n.lang(), JSON.stringify(a), JSON.stringify(dust)].join('|');
      if (drawn !== weatherDrawn) {
        weatherDrawn = drawn;
        View.renderWeather(v, { name: HomeCity.homeName(Config, I18n.lang()), kind: s.kind, retryAt: clock.retryAt(store.nextAt()),
          uv: v && v.today ? Weather.uv(v.today.uvMax) : null, air: a.air, airKind: a.airKind, dust: dust });
      }
      View.renderStatus(s.kind, clock.stamp(s.updatedAt), s.source);   // B14-3: a time of another day carries its date
      clocks();
      // FIX-BATCH-19 7 / FIX-19B C5: the first COMPLETE main screen with its weather (the card, its status and the clocks all
      // drawn — from data kept on the TV when there are some), for tools/tv-boot.mjs
      if (v && !fullMarked && mark) { fullMarked = true; mark('dash:main-full'); }
    }

    // The Israel weather screen: each region's card from the main weather's data at Israel's wall-clock hour; the header
    // speaks once for the data on screen (stale if any card is, with the oldest time).
    function israel() {
      var store = src.store, cfg = Config.israel, hour = Tz.hourKey(clock.wall(0)), next = store.nextAt(), cards = [], kind = '', oldest = 0, source, i;
      for (i = 0; i < cfg.regions.length; i++) {
        var r = cfg.regions[i], s = store.status(r.place), data = store.get(r.place), v = null;
        if (data) {
          v = Weather.forHour(data, hour, Config.weather);
          v.daily = v.daily.slice(0, cfg.days);
          kind = kind === 'stale' || s.kind === 'stale' ? 'stale' : 'fresh';
          oldest = oldest ? Math.min(oldest, s.updatedAt) : s.updatedAt;
          source = source || s.source;   // batch 15: the header names MET Norway when any card shows its data
        }
        var ra = airOf(r.place);   // the view keys the card on the air chip it draws (FIX-12B V13), never on the raw numbers
        // ... and on the days' dust it draws (B13-D7)
        cards.push({ region: r, view: v, kind: s.kind, retryAt: clock.retryAt(next), key: [hour, s.kind, s.updatedAt, next].join('|'), air: ra.air, airKind: ra.airKind,
          dust: dustOf(r.place, [], v ? keysOf(v.daily, 'date') : []) });
      }
      IsraelView.render(cards, { kind: kind || 'none', updated: clock.stamp(oldest), source: source });
    }

    return { clocks: clocks, main: main, israel: israel };
  }
  return { create: create, airPlaces: airPlaces };
})();
