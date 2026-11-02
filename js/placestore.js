/* One request for several places, each place's last good answer kept. ES5. Weather and air quality share it.
 *   PlaceStore.create(places, source, deps)
 *     places: [{ id, … }] in the order the source's URL lists them; answer i belongs to places[i]
 *     source: { cfg: { refreshMs, timeoutMs, retryMs, retryFloorMs, staleAfterMs }, url(places, cfg), parse(json, cfg) }
 *             parse throws when a place's answer is unusable
 *     deps:   { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional) }
 *   Returns { refresh, get(id), status(id) → { kind, updatedAt }, nextAt, failures, stop }; the cycle (one request in
 *   flight, jittered back-off, stop()) is the shared Refresher. One answer of a single place may be an object, not a list.
 *   A source.url() that throws ends the hop as a failure of every place: the normal back-off follows. */
var PlaceStore = (function () {
  function create(places, source, deps) {
    var cfg = source.cfg, state = {};
    for (var i = 0; i < places.length; i++) state[places[i].id] = { data: null, updatedAt: 0, error: null };

    function parseOrNull(json) { try { return source.parse(json, cfg); } catch (e) { return null; } }

    // One answer for every place. Returns whether any place failed. A transport failure fails every place;
    // a place whose own element does not parse fails alone. The last good data always stays.
    function accept(err, json) {
      var list = err ? [] : Array.isArray(json) ? json : [json], failed = false;
      for (var i = 0; i < places.length; i++) {
        var s = state[places[i].id], model = err ? null : parseOrNull(list[i]);
        if (model) { s.data = model; s.updatedAt = deps.now(); s.error = null; } else { s.error = err || 'parse'; failed = true; }
      }
      return failed;
    }

    var cycle = Refresher.create(cfg, deps, function (finish) {
      var u;
      try { u = source.url(places, cfg); } catch (e) { finish(function () { return accept('url', null); }); return; }
      deps.getJson(u, cfg.timeoutMs, function (err, json) { finish(function () { return accept(err, json); }); });
    }, function () { deps.onChange(api); });

    var api = {
      refresh: cycle.refresh,
      get: function (id) { return state[id] ? state[id].data : null; },
      // Stale = we have data but the last attempt failed, or it is older than staleAfterMs, or the device clock
      // went backwards past it (an age below zero cannot be trusted as fresh).
      status: function (id) {
        var s = state[id];
        if (!s) return { kind: 'none' };
        if (!s.data) return { kind: s.error ? 'failed' : 'loading' };
        var age = deps.now() - s.updatedAt;
        return { kind: s.error || age < 0 || age > cfg.staleAfterMs ? 'stale' : 'fresh', updatedAt: s.updatedAt };
      },
      nextAt: cycle.nextAt,
      failures: cycle.failures,
      stop: cycle.stop
    };
    return api;
  }

  return { create: create };
})();
