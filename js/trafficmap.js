/* The traffic map: TomTom raster tiles, a night base map under the live traffic-flow overlay. ES5, no map library.
 *   TrafficMap.grid(cfg, width, height)   the tiles that cover a width × height box centred on cfg.center at cfg.zoom:
 *                                         [{ x, y, left, top }] (left / top in px from the box's corner), cfg.tileSize px each
 *   TrafficMap.baseUrl(cfg, key, tile)    the base map tile (Map Display API, raster, basic/night)
 *   TrafficMap.flowUrl(cfg, key, tile, stamp)  the traffic-flow tile (Traffic API raster flow, style relative0-dark, no
 *                                         `thickness`: TomTom answers 400 to that pair). `stamp` changes once per round: TomTom
 *                                         serves the tile no-store, but a page reuses an image it already shows under the same
 *                                         URL without asking the network (measured in Chrome, fix batch 5b), so without it
 *                                         the overlay would never change
 *   TrafficMap.createController(cfg, deps)  when tiles are loaded: ONLY while the map screen is on view (any visit,
 *                                         rotation included). The base map is loaded until one whole round succeeds,
 *                                         then kept; the flow overlay is reloaded on arrival when its next attempt is due
 *                                         and every cfg.refreshMs while on view. A failed layer waits cfg.refreshMs too,
 *                                         across leaving and coming back. Leaving cancels the rounds in flight. Nothing
 *                                         runs while the screen is hidden.
 * Budget (tiles count like requests; TomTom's free tier: 200,000 raster map tiles and 200,000 raster traffic tiles a month,
 * docs.tomtom.com/pricing, 2026-10-30, i.e. about 6,600 a day each): 12 tiles per layer (4 × 3 tiles of 512 px at zoom 10
 * over the 1792 × 912 card); parked on the map all day 288 overlays × 12 = 3,456 flow tiles; with the rotation (five
 * screens × 45 s: one visit every 225 s) the overlay is reloaded on every other visit or so: 192 × 12 = 2,304; the base
 * map 12 per start. tests/trafficmap.test.js simulates both days. */
var TrafficMap = (function () {
  // Web Mercator: the world is 2^zoom tiles wide; x and y in tile units.
  function project(lat, lon, zoom) {
    var n = Math.pow(2, zoom), s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }

  function grid(cfg, width, height) {
    var c = project(cfg.center[0], cfg.center[1], cfg.zoom), size = cfg.tileSize;
    var left = c.x * size - width / 2, top = c.y * size - height / 2, out = [];
    for (var y = Math.floor(top / size); y * size < top + height; y++) {
      for (var x = Math.floor(left / size); x * size < left + width; x++) out.push({ x: x, y: y, left: Math.round(x * size - left), top: Math.round(y * size - top) });
    }
    return out;
  }

  function path(cfg, key, tile) { return cfg.zoom + '/' + tile.x + '/' + tile.y + '.png?key=' + encodeURIComponent(key) + '&tileSize=' + cfg.tileSize; }
  function baseUrl(cfg, key, tile) { return cfg.base + path(cfg, key, tile) + '&language=' + cfg.language; }
  function flowUrl(cfg, key, tile, stamp) { return cfg.flow + path(cfg, key, tile) + '&refresh=' + stamp; }

  // deps: { now(), setTimeout, clearTimeout, loadBase(done(ok)) → cancel(), loadFlow(stamp, done(ok)) → cancel(), onChange() }
  //   A loader calls done exactly once unless cancelled (js/view-map.js); after cancel() it calls nothing.
  // state(): { kind: 'loading' | 'fresh' | 'stale' (a layer failed or the overlay is old: what loaded stays) | 'failed'
  //            (no overlay yet and the last try failed), updatedAt (the overlay on screen), base (the base map is in) }
  function createController(cfg, deps) {
    var visible = false, timer = null, baseOk = false, base = null, flow = null, flowAt = 0, flowNext = 0, failed = false;

    // The next tick `ms` from now while on view; none while hidden.
    function due(ms) {
      if (timer !== null) deps.clearTimeout(timer);
      timer = visible ? deps.setTimeout(function () { timer = null; loadBase(); refreshFlow(); }, ms) : null;
    }
    // One round of a layer: `round` is the one in flight until it ends; a cancelled round's late answer is ignored.
    function refreshFlow() {
      if (flow) return;
      var round = flow = {}, started = deps.now();
      round.cancel = deps.loadFlow(started, function (ok) {
        if (flow !== round) return;
        flow = null;
        failed = !ok;
        if (ok) flowAt = started;
        flowNext = (ok ? started : deps.now()) + cfg.refreshMs;   // a failed overlay waits too, across leave / return
        due(cfg.refreshMs);
        deps.onChange();
      });
    }
    // Until one whole round succeeds: on every arrival and every tick on view.
    function loadBase() {
      if (baseOk || base) return;
      var round = base = {};
      round.cancel = deps.loadBase(function (ok) {
        if (base !== round) return;
        base = null;
        baseOk = ok;
        deps.onChange();
      });
    }
    function cancel(round) { if (round && round.cancel) round.cancel(); }

    return {
      // The map screen came into view (any visit) or left it. Arriving: the base map if it is not there yet, and the
      // overlay when its next attempt is due (else a tick then) — at once when the remote opened it (explicit), unless a
      // round is already in flight. Leaving: no timer, and the rounds in flight are stopped.
      setVisible: function (v, explicit) {
        if (v && explicit) { visible = true; loadBase(); refreshFlow(); return; }
        if (visible === v) return;
        visible = v;
        if (!v) {
          var b = base, f = flow;
          base = flow = null;
          cancel(b);
          cancel(f);
          due(0);
          return;
        }
        loadBase();
        var wait = flowNext - deps.now();
        if (wait <= 0) refreshFlow(); else due(wait);
      },
      state: function () {
        if (!flowAt) return { kind: failed ? 'failed' : 'loading', updatedAt: 0, base: baseOk };
        return { kind: failed || deps.now() - flowAt > cfg.staleAfterMs || !baseOk ? 'stale' : 'fresh', updatedAt: flowAt, base: baseOk };
      }
    };
  }

  return { grid: grid, baseUrl: baseUrl, flowUrl: flowUrl, createController: createController };
})();
