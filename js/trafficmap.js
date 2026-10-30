/* The traffic map: ONE image from the Mapbox Static Images API in the live-traffic style (traffic-night-v2), refreshed
 * while the map is on view. ES5, no map library.
 *   TrafficMap.size(cfg, width, height)       the image's size in map points for a card of width × height CSS px: half of
 *                                             it (the image is asked @2x, so it fills the card pixel for pixel), at most
 *                                             cfg.maxSide points a side (the API's limit)
 *   TrafficMap.url(cfg, token, size, stamp)   the image's address. `stamp` changes once per load: a page reuses an image it
 *                                             already shows under the same address without asking the network
 *   TrafficMap.place(cfg, size, lat, lon)     where a place lies on the image, as a fraction of its width and height
 *                                             (Web Mercator, 512-px tiles at cfg.zoom); { x, y }
 *   TrafficMap.createController(cfg, deps)    when the image is loaded (the one gate, like the traffic routes):
 *     only while the map is the screen on view AND the TV shows the page; one image at a time (cfg.timeoutMs deadline);
 *     an explicit ◀ ▶ open loads at once, every time; otherwise every cfg.refreshMs since the last ATTEMPT; never past
 *     cfg.dailyRequestCap images on a UTC date, each reserved in the ledger (js/ledger.js, `map-quota`) and read back
 *     BEFORE it is asked for, never refunded. Leaving the screen or the TV hiding the page stops the image in flight.
 *     A failed image keeps the last one on screen. A clock that went back is corrected without loading. */
var TrafficMap = (function () {
  var QUOTA = 'map-quota', TILE = 512, MINUTE = 60000;

  function size(cfg, width, height) {
    return { w: Math.min(cfg.maxSide, Math.round(width / 2)), h: Math.min(cfg.maxSide, Math.round(height / 2)) };
  }
  function url(cfg, token, sz, stamp) {
    return cfg.base + cfg.center[1] + ',' + cfg.center[0] + ',' + cfg.zoom + ',0/' + sz.w + 'x' + sz.h + '@2x?access_token=' +
      encodeURIComponent(token) + '&attribution=false&logo=false&refresh=' + stamp;
  }
  // Web Mercator in world units (0…1).
  function mercator(lat, lon) {
    var s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
  }
  function place(cfg, sz, lat, lon) {
    var c = mercator(cfg.center[0], cfg.center[1]), p = mercator(lat, lon), scale = TILE * Math.pow(2, cfg.zoom);
    return { x: 0.5 + (p.x - c.x) * scale / sz.w, y: 0.5 + (p.y - c.y) * scale / sz.h };
  }

  // deps: { now(), setTimeout, clearTimeout, storage (localStorage or null), documentVisible() (optional),
  //         load(stamp, done(ok)) → cancel(): one image (done exactly once unless cancelled), onChange() }
  // state(): { kind: 'loading' (no image yet) | 'failed' (no image, the last try failed or could not be sent) |
  //            'fresh' | 'stale' (the image on screen is older than cfg.staleAfterMs or the last try failed),
  //            updatedAt (the image on screen), problem: 'cap' | 'storage' | null }
  function createController(cfg, deps) {
    var ledger = Ledger.open(deps.storage || null, QUOTA), docVisible = deps.documentVisible || function () { return true; };
    var selected = false, current = null, timer = null, updatedAt = 0, failed = false, problem = null;

    function stopTimer() { if (timer !== null) deps.clearTimeout(timer); timer = null; }
    function later(ms) { stopTimer(); timer = deps.setTimeout(function () { timer = null; check(false); }, ms); }
    // The image in flight is `current` ({ cancel }); a stopped one's late answer changes nothing.
    function stopLoad() { var r = current; current = null; if (r && r.cancel) r.cancel(); }

    function send(at) {
      var round = current = {};
      var c = deps.load(at, function (ok) {
        if (current !== round) return;
        current = null;
        failed = !ok;
        if (ok) updatedAt = at;
        if (selected && docVisible()) later(cfg.refreshMs);
        deps.onChange();
      });
      if (current === round) round.cancel = c;
    }

    // Every path comes here: on view and shown, nothing in flight; a clock correction first (it loads nothing), the cap,
    // the cadence (an explicit open skips it), then the reservation.
    function check(explicit) {
      if (!selected || !docVisible() || current) return;
      var now = deps.now(), r = ledger.read(now), fixed = r && Ledger.correct(r, now);
      if (fixed) r = ledger.write(fixed) ? fixed : null;
      problem = !r ? 'storage' : Ledger.usedOn(r, now) + 1 > cfg.dailyRequestCap ? 'cap' : null;
      if (problem) { later(problem === 'cap' ? Ledger.nextUtcMidnight(now) - now : MINUTE); deps.onChange(); return; }
      if (fixed || (!explicit && now - r.lastAttemptAt < cfg.refreshMs)) { later(fixed ? MINUTE : r.lastAttemptAt + cfg.refreshMs - now); return; }
      if (!ledger.write({ utcDate: Ledger.utcDate(now), used: Ledger.usedOn(r, now) + 1, lastAttemptAt: now, retryNotBefore: r.retryNotBefore })) {
        problem = 'storage';
        later(MINUTE);
        deps.onChange();
        return;
      }
      send(now);
      deps.onChange();
    }
    function hide() { stopTimer(); stopLoad(); }

    return {
      // The map screen came into view (explicit: the remote opened it) or left it.
      setVisible: function (v, explicit) {
        if (!v) { selected = false; hide(); return; }
        if (selected && !explicit) return;
        selected = true;
        check(explicit);
      },
      // The TV hid or showed the page: hidden stops everything; shown asks the gate again.
      visibilityChanged: function () { if (!docVisible()) hide(); else check(false); },
      state: function () {
        var now = deps.now();
        if (!updatedAt) return { kind: failed || problem ? 'failed' : 'loading', updatedAt: 0, problem: problem };
        return { kind: failed || now - updatedAt > cfg.staleAfterMs || now < updatedAt ? 'stale' : 'fresh', updatedAt: updatedAt, problem: problem };
      }
    };
  }

  return { size: size, url: url, place: place, createController: createController };
})();
