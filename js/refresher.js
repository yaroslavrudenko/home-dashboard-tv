/* The refresh cycle weather and news share. ES5.
 *   Refresher.create(cfg, deps, hop, after)
 *     cfg:   { refreshMs, retryMs: [back-off ceilings after 1, 2, … failures], retryFloorMs, retryMaxMs (optional: the
 *            ceiling past the list; default refreshMs — a once-a-day source sets an hour so an outage is retried hourly) }
 *     deps:  { now(), setTimeout, clearTimeout, random() (optional) }
 *     hop(finish):  starts ONE refresh (one parallel round of requests) and calls finish(apply) exactly once;
 *                   apply() stores the answers and returns how the round went: falsy = fine; truthy = failed (back
 *                   off). A stopped cycle never calls apply(), so a late answer changes nothing.
 *     after():      called once per finished hop (render)
 * Only one hop is ever in flight; the next one is scheduled when it ends, so requests never pile up.
 * After n failed hops in a row the wait is drawn at random between retryFloorMs and the n-th ceiling (full
 * jitter; past the list, cfg.retryMaxMs or else cfg.refreshMs). Every ceiling is capped by cfg.refreshMs: a back-off never waits
 * longer than the regular schedule would, and never loops tightly. */
var Refresher = (function () {
  function create(cfg, deps, hop, after) {
    var failures = 0, inFlight = false, timer = null, nextAt = 0, generation = 0;
    var random = deps.random || Math.random;

    function delayAfter(n) {
      var p = cfg.refreshMs;
      if (n === 0) return p;
      var ceiling = Math.min(n > cfg.retryMs.length ? cfg.retryMaxMs || p : cfg.retryMs[n - 1], p), floor = Math.min(cfg.retryFloorMs, ceiling);
      return Math.round(floor + random() * (ceiling - floor));
    }
    function schedule(ms) {
      if (timer !== null) deps.clearTimeout(timer);
      nextAt = deps.now() + ms;
      timer = deps.setTimeout(function () { timer = null; refresh(); }, ms);
    }

    function refresh() {
      if (inFlight) return false;
      inFlight = true;
      var mine = generation;
      hop(function (apply) {
        if (mine !== generation) return;           // stopped meanwhile: a late answer changes nothing
        inFlight = false;
        failures = apply() ? failures + 1 : 0;
        schedule(delayAfter(failures));
        after();
      });
      return true;
    }

    return {
      refresh: refresh,
      nextAt: function () { return timer === null ? 0 : nextAt; },
      failures: function () { return failures; },
      stop: function () {
        generation++;
        inFlight = false;
        if (timer !== null) deps.clearTimeout(timer);
        timer = null;
      }
    };
  }
  return { create: create };
})();
