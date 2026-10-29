/* Which screen is on, and when to move on. ES5. No DOM: App draws the transition.
 *   Screens.create(count, cfg, deps)   cfg: { enabled, intervalMs, pauseAfterKeyMs }
 *     deps: { now(), setTimeout, clearTimeout, onShow(index, from, dir) }   dir: +1 forward, −1 back
 *   .step(dir)    the remote's ◀ ▶: show the previous / next screen and pause the rotation
 *   .touch()      any other key: pause the rotation
 *   .hold(on)     an alert is on screen: no rotation until it is gone
 * The rotation timer is the only timer: nothing runs per screen while a screen is hidden. */
var Screens = (function () {
  function create(count, cfg, deps) {
    var index = 0, pausedUntil = 0, held = false, timer = null;

    function show(dir) {
      var from = index;
      index = (index + dir + count) % count;
      deps.onShow(index, from, dir);
    }
    function schedule() {
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      if (!cfg.enabled || held || count < 2) return;
      var wait = Math.max(cfg.intervalMs, pausedUntil - deps.now());
      timer = deps.setTimeout(function () {
        timer = null;
        if (deps.now() < pausedUntil) { schedule(); return; }
        show(1);
        schedule();
      }, wait);
    }
    function touch() {
      pausedUntil = deps.now() + cfg.pauseAfterKeyMs;
      schedule();
    }

    schedule();
    return {
      current: function () { return index; },
      step: function (dir) { touch(); show(dir); },
      touch: touch,
      hold: function (on) {
        if (held === on) return;
        held = on;
        schedule();
      },
      rotating: function () { return timer !== null; }
    };
  }
  return { create: create };
})();
