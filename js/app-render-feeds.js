/* What the other sources look like on their screens (batch 17, C-1): news, markets, Shabbat, traffic, the map and the
 * Alerts screen. Reads held state only — never requests anything. ES5. */
var FeedRender = (function () {
  // The Markets screen's cards: one per configured group, with its row count (the view keeps the slots before the data).
  function marketsLayout(cfg) {
    var out = [], g = cfg.groups;
    for (var i = 0; i < g.length; i++) out.push({ id: g[i].id, rows: g[i].rows.length });
    return out;
  }

  // src: { news, markets, shabbat, traffic (null without a token), map (idem), alerts, history }; clock: HomeClock.
  function create(src, clock) {
    // The header speaks for the columns that are current (fresh: the newest answer); a failed feed says so in its own
    // column only. Nothing came at all: the header says nothing, each column's block says loading or failed with when it is
    // tried again (B17-V1, F17-2).
    function news() {
      var st = src.news.status(), cols = [], i;
      for (i = 0; i < Config.news.columns.length; i++) {
        var id = Config.news.columns[i].id, v = src.news.column(id);
        cols.push({ id: id, source: v.source, items: v.items, kind: v.kind, updated: clock.hhmm(v.updatedAt) });
      }
      NewsView.render(cols, { kind: st.kind, updated: clock.hhmm(st.updatedAt), retryAt: clock.retryAt(src.news.nextAt()) }, Date.now(), Config.news.perColumn);
    }

    // The traffic screen's columns (Config.traffic.columns) filled with each route's current view (routes: status().routes).
    function trafficColumns(routes) {
      var t = Config.traffic, legs = {}, cols = [], i, j;
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
    function traffic() {
      if (!src.traffic) { TrafficView.renderNoKey(); return; }
      var st = src.traffic.status();
      // the age only with data (F17-6): nothing is said of an «updatedAt» of 0
      TrafficView.render({ columns: trafficColumns(st.routes), kind: st.kind, future: st.future, problem: st.problem,
        updated: clock.stamp(st.updatedAt), ageMs: st.updatedAt ? Date.now() - st.updatedAt : 0,
        resumeAt: clock.stamp(HomeClock.ceilMinute(st.resumeAt || 0)) });
    }

    function map() {
      if (!src.map) { MapView.renderNoKey(); return; }
      var st = src.map.state();
      MapView.render(st, clock.hhmm(st.updatedAt), HomeCity.homeName(Config, I18n.lang()));
    }

    // The Alerts screen: the monitor's real state (never the preview), the recent alerts, today's date at home.
    function alerts() {
      var st = src.alerts.state(), h = src.history.state();
      AlertsScreenView.render(st, h, { homes: Config.alerts.areas, nearby: Config.alerts.nearby, since: st.active ? clock.hhmm(st.active.startedAt) : '',
        checked: clock.hhmm(st.checkedAt), today: clock.date(),
        updated: clock.hhmm(h.updatedAt), days: Config.alerts.history.days });
    }

    // The Markets screen: the last snapshot (none yet: the view's placeholders) and what its header says (the markets
    // controller decides: js/markets.js state()), its time at home («обновлено 14:32»).
    function markets() {
      var st = src.markets.state();
      MarketsView.render(st.snapshot, { kind: st.kind, updated: clock.stamp(st.updatedAt) });   // B25 T5 (B14-3): a kept row's time of another day carries its date
    }

    // The Shabbat & holidays screen: the calendar held (null before it came) viewed at this moment on the home date, the
    // time it arrived at home («обновлено 09:31», a date before it when not today), the home city's name.
    function shabbat() {
      var st = src.shabbat.status(), data = src.shabbat.data();
      ShabbatView.render(data ? Shabbat.view(data, Date.now(), clock.today(), Config.shabbat) : null, { kind: st.kind, updated: clock.stamp(st.updatedAt),
        retryAt: clock.retryAt(src.shabbat.nextAt()), place: HomeCity.homeName(Config, I18n.lang()) });
    }

    return { news: news, markets: markets, shabbat: shabbat, traffic: traffic, map: map, alerts: alerts };
  }
  return { create: create, marketsLayout: marketsLayout };
})();
