/* Which screen is on, and when to move on. ES5. No DOM: App draws the transition.
 *   Screens.create(count, cfg, deps)   cfg: { enabled, intervalMs, dwellMs ({ screenId: ms }, optional), pauseAfterKeyMs,
 *                                        afterAlertMs }
 *     deps: { now(), setTimeout, clearTimeout, onShow(index, from, dir, auto), idOf(index) (optional: the screen's id,
 *           for dwellMs) }   dir: +1 forward, −1 back; auto: true when the rotation moved on, false for the remote
 * The rotation leaves a screen after its own cfg.dwellMs[id] when it has one, else after cfg.intervalMs.
 *   .step(dir)    the remote's ◀ ▶: show the previous / next screen and pause the rotation
 *   .touch()      any other key: pause the rotation
 *   .hold(on)     an alert at home is up: no rotation until it is gone and cfg.afterAlertMs more; returns whether the
 *                 hold changed (true with on: the alert has just come up)
 *   .open(i)      show screen i as the remote would (auto false), with its own dwell (pauses and holds still count);
 *                 false when it is already on view
 *   Screens.dwellMs(cfg, id)          how long the rotation keeps screen `id` on view (null id: the common interval)
 *   Screens.cycleMs(ids, cfg)         one full turn of the rotation through the screens `ids` (the sum of their dwells)
 * The rotation timer is the only timer: nothing runs per screen while a screen is hidden. */
var Screens = (function () {
  function dwellMs(cfg, id) {
    var own = cfg.dwellMs && id !== null ? cfg.dwellMs[id] : undefined;
    return typeof own === 'number' ? own : cfg.intervalMs;
  }
  function cycleMs(ids, cfg) { var ms = 0; for (var i = 0; i < ids.length; i++) ms += dwellMs(cfg, ids[i]); return ms; }

  function create(count, cfg, deps) {
    var index = 0, pausedUntil = 0, held = false, timer = null;

    function go(to, dir, auto) {
      var from = index;
      index = to;
      deps.onShow(index, from, dir, auto);
    }
    function show(dir, auto) { go((index + dir + count) % count, dir, auto); }
    // How long the rotation keeps the screen on view: its own dwell, else the common interval.
    function dwell() { return dwellMs(cfg, deps.idOf ? deps.idOf(index) : null); }
    function pauseFor(ms) {
      pausedUntil = Math.max(pausedUntil, deps.now() + ms);
      schedule();
    }
    function schedule() {
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      if (!cfg.enabled || held || count < 2) return;
      var wait = Math.max(dwell(), pausedUntil - deps.now());
      timer = deps.setTimeout(function () {
        timer = null;
        if (deps.now() < pausedUntil) { schedule(); return; }
        show(1, true);
        schedule();
      }, wait);
    }
    function touch() { pauseFor(cfg.pauseAfterKeyMs); }

    schedule();
    return {
      current: function () { return index; },
      step: function (dir) { show(dir, false); touch(); },   // the pause is timed with the new screen in view (its dwell)
      touch: touch,
      open: function (i) {
        if (i === index) return false;
        go(i, 1, false);
        schedule();
        return true;
      },
      hold: function (on) {
        if (held === on) return false;
        held = on;
        if (on) schedule(); else pauseFor(cfg.afterAlertMs);
        return true;
      },
      rotating: function () { return timer !== null; }
    };
  }
  return { create: create, dwellMs: dwellMs, cycleMs: cycleMs };
})();
