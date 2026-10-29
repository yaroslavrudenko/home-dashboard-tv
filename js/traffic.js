/* Traffic from the TomTom Routing API. ES5.
 * Every route and every main-road stretch is one item of ONE synchronous batch request
 * (POST /routing/1/batch/sync/json), asked for its summary only (no geometry): travel time with live traffic,
 * travel time without traffic, the delay and the length.
 *   Traffic.hasKey(cfg)            false while config.js still holds the build placeholder
 *   Traffic.request(cfg)           { url, body } of the batch request (routes first, then roads)
 *   Traffic.parse(json, n)         n summaries (null where an item failed) from the batch answer
 *   Traffic.level(summary, cfg)    'ok' | 'slow' | 'jam': travel time against free flow
 *   Traffic.createStore(cfg, deps) the refresh cycle: shorter while the screen is visible */
var Traffic = (function () {
  var QUERY = '/json?travelMode=car&routeType=fastest&traffic=true&computeTravelTimeFor=all&routeRepresentation=summaryOnly';

  function hasKey(cfg) { return typeof cfg.key === 'string' && /^[A-Za-z0-9]+$/.test(cfg.key); }
  function point(p) { return p[0] + ',' + p[1]; }
  function legs(cfg) { return cfg.routes.concat(cfg.roads); }

  function request(cfg) {
    var all = legs(cfg), items = [];
    for (var i = 0; i < all.length; i++) items.push({ query: '/calculateRoute/' + point(all[i].from) + ':' + point(all[i].to) + QUERY });
    return { url: cfg.base + '?key=' + encodeURIComponent(cfg.key), body: { batchItems: items } };
  }

  function seconds(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; }

  function summaryOf(item) {
    var r = item && item.statusCode === 200 && item.response && item.response.routes;
    var s = r && r[0] && r[0].summary;
    if (!s) return null;
    var travel = seconds(s.travelTimeInSeconds), delay = seconds(s.trafficDelayInSeconds);
    if (travel === null) return null;
    var free = seconds(s.noTrafficTravelTimeInSeconds);
    if (free === null) free = delay === null ? travel : Math.max(travel - delay, 0);
    return { travel: travel, free: free, delay: Math.max(travel - free, 0), length: seconds(s.lengthInMeters) };
  }

  // Throws when the answer is not a batch answer at all; a single failed item is null.
  function parse(json, n) {
    if (!json || !Array.isArray(json.batchItems)) throw new Error('traffic: not a batch answer');
    var out = [];
    for (var i = 0; i < n; i++) out.push(summaryOf(json.batchItems[i]));
    return out;
  }

  function level(s, cfg) {
    var ratio = s.free > 0 ? s.travel / s.free : 1;
    return ratio >= cfg.redRatio ? 'jam' : ratio >= cfg.amberRatio ? 'slow' : 'ok';
  }

  // deps: { postJson(url, body, timeoutMs, done), now(), setTimeout, clearTimeout, random() (optional), onChange(store) }
  function createStore(cfg, deps) {
    var n = legs(cfg).length, state = [], visible = false, lastAt = 0;
    for (var i = 0; i < n; i++) state.push({ data: null, updatedAt: 0, error: null });

    // Returns whether the hop failed: only a transport or shape failure backs off. An item TomTom answers without
    // a route stays "no data" on its row until the next regular refresh (retrying it sooner cannot help and costs quota).
    function accept(err, json) {
      var list = null;
      if (!err) { try { list = parse(json, n); } catch (e) { list = null; } }
      for (var i = 0; i < n; i++) {
        var s = state[i], d = list ? list[i] : null;
        if (d) { s.data = d; s.updatedAt = deps.now(); s.error = null; } else s.error = err || 'item';
      }
      if (list) lastAt = deps.now();
      return !list;
    }

    var req = request(cfg);                        // the same request every time: built once
    var cycle = Refresher.create(cfg, {
      now: deps.now, setTimeout: deps.setTimeout, clearTimeout: deps.clearTimeout, random: deps.random,
      period: function () { return visible ? cfg.visibleRefreshMs : cfg.refreshMs; }
    }, function (finish) {
      deps.postJson(req.url, req.body, cfg.timeoutMs, function (err, json) { finish(function () { return accept(err, json); }); });
    }, function () { deps.onChange(api); });

    function view(i) {
      var s = state[i], age = deps.now() - s.updatedAt;
      if (!s.data) return { kind: s.error ? 'failed' : 'loading', data: null };
      return { kind: s.error || age < 0 || age > cfg.staleAfterMs ? 'stale' : 'fresh', data: s.data, level: level(s.data, cfg), updatedAt: s.updatedAt };
    }

    var api = {
      refresh: cycle.refresh,
      // The screen came into view (or left it): the regular interval follows, and data older than the visible
      // interval is refreshed at once.
      setVisible: function (v) {
        if (visible === v) return;
        visible = v;
        if (lastAt) cycle.resync(lastAt);
      },
      // The TV woke up: data older than the current interval is refreshed at once.
      wake: function () { if (lastAt) cycle.resync(lastAt); },
      routes: function () { var out = []; for (var i = 0; i < cfg.routes.length; i++) out.push(view(i)); return out; },
      roads: function () { var out = []; for (var i = 0; i < cfg.roads.length; i++) out.push(view(cfg.routes.length + i)); return out; },
      // The whole screen: 'loading' | 'failed' (nothing yet) | 'fresh' | 'stale' (data on screen is not current).
      // An item TomTom cannot answer (no route) is shown as "no data" on its own row, never as a stale screen.
      status: function () {
        var any = false, stale = false, failed = 0, latest = 0;
        for (var i = 0; i < n; i++) {
          var v = view(i);
          if (v.kind === 'failed') failed++;
          if (!v.data) continue;
          any = true;
          latest = Math.max(latest, v.updatedAt);
          if (v.kind !== 'fresh') stale = true;
        }
        if (!any) return { kind: failed ? 'failed' : 'loading' };
        return { kind: stale ? 'stale' : 'fresh', updatedAt: latest };
      },
      nextAt: cycle.nextAt,
      stop: cycle.stop
    };
    return api;
  }

  return { hasKey: hasKey, request: request, parse: parse, level: level, createStore: createStore };
})();
