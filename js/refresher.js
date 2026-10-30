/* The refresh cycle every data set shares (weather, news, traffic). ES5.
 *   Refresher.create(cfg, deps, hop, after)
 *     cfg:   { refreshMs, retryMs: [back-off ceilings after 1, 2, … failures], retryFloorMs }
 *     deps:  { now(), setTimeout, clearTimeout, random() (optional), period() (optional: the current regular
 *              interval, e.g. shorter while a screen is visible; default cfg.refreshMs) }
 *     hop(finish):  starts ONE refresh (one parallel round of requests) and calls finish(apply) exactly once;
 *                   apply() stores the answers and returns how the round went: falsy = fine; true = failed (back
 *                   off); Refresher.WAIT = refused for now (a quota or key answer: retrying sooner cannot help, so
 *                   the next try waits the regular interval or longer, never the fast back-off). A stopped cycle
 *                   never calls apply(), so a late answer changes nothing.
 *     after():      called once per finished hop (render)
 * Only one hop is ever in flight; the next one is scheduled when it ends, so requests never pile up.
 * After n failed hops in a row the wait is drawn at random between retryFloorMs and the n-th ceiling (full
 * jitter; past the list, cfg.refreshMs). Every ceiling is capped by the current period(): a back-off never waits
 * longer than the regular schedule would, and never loops tightly. */
var Refresher = (function () {
  var WAIT = 'wait';
  function create(cfg, deps, hop, after) {
    var failures = 0, inFlight = false, timer = null, nextAt = 0, generation = 0;
    var random = deps.random || Math.random;
    function period() { return deps.period ? deps.period() : cfg.refreshMs; }

    function delayAfter(n) {
      var p = period();
      if (n === 0) return p;
      var ceiling = Math.min(n > cfg.retryMs.length ? cfg.refreshMs : cfg.retryMs[n - 1], p), floor = Math.min(cfg.retryFloorMs, ceiling);
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
        var result = apply();
        failures = result ? failures + 1 : 0;
        schedule(result === WAIT ? Math.max(period(), cfg.refreshMs) : delayAfter(failures));
        after();
      });
      return true;
    }

    // The regular interval changed (a screen became visible): with no hop in flight and no back-off running,
    // the next refresh is due at lastAt + period() — at once if that moment has passed.
    function resync(lastAt) {
      if (inFlight || failures) return;
      var wait = lastAt + period() - deps.now();
      if (wait <= 0) refresh(); else schedule(wait);
    }

    return {
      refresh: refresh,
      resync: resync,
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
  return { create: create, WAIT: WAIT };
})();
