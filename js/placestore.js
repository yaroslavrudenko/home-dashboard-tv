/* One request for several places, each place's last good answer kept. ES5. Weather and air quality share it.
 *   PlaceStore.create(places, source, deps)
 *     places: [{ id, … }] in the order the source's URL lists them; answer i belongs to places[i]
 *     source: { cfg: { refreshMs, timeoutMs, retryMs, retryFloorMs, staleAfterMs, keepMaxMs }, url(places, cfg),
 *               parse(json, cfg, place), persistKey (optional), fallback (optional) }
 *             parse throws when a place's answer is unusable
 *             fallback: { id, fetch(places, done(err, list)), parse(json, cfg, place), stamp(el) → { at, restored },
 *             restore(list, places), cancel() } — batch 15 (MET Norway for the weather): asked in the SAME refresh whenever
 *             the primary attempt fails (any error, or an answer where no place parses); every refresh asks the primary
 *             first. Its data carry status(id).source = its id. stamp (optional) dates a place's data (the time it arrived,
 *             and whether it came back from the TV: stale until a live answer); restore (optional) refills the fallback after
 *             a restart; cancel (optional) is called on stop(). A fetch that throws ends the round as failed.
 *     deps:   { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(store), random() (optional),
 *               storage (optional: localStorage or null) }
 *   Returns { refresh, get(id), status(id) → { kind, updatedAt, source }, nextAt, failures, stop }; the cycle (one request in
 *   flight, jittered back-off, stop()) is the shared Refresher. One answer of a single place may be an object, not a list.
 *   A source.url() that throws ends the hop as a failure of every place: the normal back-off follows.
 *   Batch 14: with source.persistKey and deps.storage, the last good RAW answer is kept under `<persistKey>.v1` as
 *   { v: 1, at, url, src, json } (src: the fallback's id when it answered; one write per answer that gave any place data;
 *   a refused write is ignored). At boot an
 *   entry asked with today's very URL (the same places in the same order, the same parameters: a new home city is not
 *   given the old one's weather) and no older than cfg.keepMaxMs goes through source.parse again, place by place; what
 *   parses (through the parse of the source that answered) is shown as stale (`restored`) until a live answer arrives.
 *   Anything else starts empty. The first refresh
 *   runs as before. */
var PlaceStore = (function () {
  var VERSION = 1;

  // The saved entry, or null: no storage or key, a storage that throws, broken JSON, another version, no time.
  function readSaved(storage, key) {
    try {
      var e = JSON.parse(storage.getItem(key));
      return e && e.v === VERSION && typeof e.at === 'number' ? e : null;
    } catch (err) { return null; }
  }

  function create(places, source, deps) {
    var cfg = source.cfg, state = {}, storage = deps.storage || null, fallback = source.fallback || null, epoch = 0;
    var key = storage && source.persistKey ? source.persistKey + '.v' + VERSION : null;
    for (var i = 0; i < places.length; i++) state[places[i].id] = { data: null, updatedAt: 0, error: null, restored: false, source: undefined };

    function parseOrNull(src, json, place) { try { return src.parse(json, cfg, place); } catch (e) { return null; } }
    // The source an entry or an answer came from: the primary (no id), or the fallback by its id.
    function sourceOf(id) { return !id ? source : fallback && fallback.id === id ? fallback : null; }
    function listOf(json) { return Array.isArray(json) ? json : [json]; }
    function urlOrNull() { try { return source.url(places, cfg); } catch (e) { return null; } }

    // The last good answer of an earlier run, parsed by today's parse: kept no longer than keepMaxMs (a clock that went
    // back makes the age negative: kept, and stale like any restored place).
    function restore() {
      var e = key ? readSaved(storage, key) : null;
      var src = e ? sourceOf(e.src) : null;
      if (!src || !(deps.now() - e.at <= cfg.keepMaxMs) || e.url !== urlOrNull()) return;
      var models = modelsOf(src, null, e.json), list = listOf(e.json);
      if (src.restore) src.restore(list, places);
      for (var i = 0; i < places.length; i++) {
        if (models[i]) set(state[places[i].id], models[i], stampOf(src, list[i], e.at).at, src, true);
      }
    }
    // When a place's data arrived and whether they came back from the TV: the source's stamp, else `at` and live.
    function stampOf(src, el, at) {
      var st = src.stamp && el ? src.stamp(el) : null;
      return { at: st && typeof st.at === 'number' ? st.at : at, restored: !!(st && st.restored) };
    }
    function save(url, json, src) {
      try { storage.setItem(key, JSON.stringify({ v: VERSION, at: deps.now(), url: url, src: src.id, json: json })); } catch (e) { /* quota: the refresh goes on */ }
    }
    function set(s, model, at, src, restored) { s.data = model; s.updatedAt = at; s.error = null; s.source = src.id; s.restored = restored; }
    // One answer → one model per place (null: that place did not come or does not parse).
    function modelsOf(src, err, json) {
      var list = err ? [] : listOf(json), out = [];
      for (var i = 0; i < places.length; i++) out.push(err ? null : parseOrNull(src, list[i], places[i]));
      return out;
    }
    function none(models) { for (var i = 0; i < models.length; i++) if (models[i]) return false; return true; }

    // One answer for every place, from `src`. Returns whether any place failed. A transport failure fails every place;
    // a place whose own element does not parse fails alone. The last good data always stays.
    function accept(src, err, json, url, models) {
      var failed = false, good = false, list = err ? [] : listOf(json);
      for (var i = 0; i < places.length; i++) {
        var s = state[places[i].id], st = stampOf(src, list[i], deps.now());
        if (models[i]) { set(s, models[i], st.at, src, st.restored); good = true; } else { s.error = err || 'parse'; failed = true; }
      }
      if (good && key) save(url, json, src);
      return failed;
    }
    function finishWith(finish, src, err, json, url, models) { finish(function () { return accept(src, err, json, url, models); }); }

    var cycle = Refresher.create(cfg, deps, function (finish) {
      var u, mine = epoch;
      try { u = source.url(places, cfg); } catch (e) { finishWith(finish, source, 'url', null, null, []); return; }
      deps.getJson(u, cfg.timeoutMs, function (err, json) {
        var models = modelsOf(source, err, json);
        if (!fallback || mine !== epoch || !none(models)) { finishWith(finish, source, err, json, u, models); return; }
        // The primary attempt failed: the fallback, in the same refresh.
        try {
          fallback.fetch(places, function (ferr, list) { finishWith(finish, fallback, ferr, list, u, modelsOf(fallback, ferr, list)); });
        } catch (e) { finishWith(finish, fallback, 'fallback', null, u, []); }
      });
    }, function () { deps.onChange(api); });
    restore();

    var api = {
      refresh: cycle.refresh,
      get: function (id) { return state[id] ? state[id].data : null; },
      // Stale = we have data but the last attempt failed, or it came from storage (restored), or it is older than
      // staleAfterMs, or the device clock went backwards past it (an age below zero cannot be trusted as fresh).
      status: function (id) {
        var s = state[id];
        if (!s) return { kind: 'none' };
        if (!s.data) return { kind: s.error ? 'failed' : 'loading' };
        var age = deps.now() - s.updatedAt;
        return { kind: s.error || s.restored || age < 0 || age > cfg.staleAfterMs ? 'stale' : 'fresh', updatedAt: s.updatedAt, source: s.source };
      },
      nextAt: cycle.nextAt,
      failures: cycle.failures,
      stop: function () { epoch++; if (fallback && fallback.cancel) fallback.cancel(); cycle.stop(); }
    };
    return api;
  }

  return { create: create };
})();
