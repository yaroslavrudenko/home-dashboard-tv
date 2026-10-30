/* The attention sound of an alert at home. ES5. No DOM: App plays the bundled sound.
 *   AlertSound.create(cfg, deps)   cfg: Config.alerts.sound { enabled, repeatMs, maxPlays }
 *     deps: { play(), setTimeout, clearTimeout }
 *   .start()   the alert has just come up: play at once, then every cfg.repeatMs, cfg.maxPlays times in all
 *   .stop()    the alert is gone: no more plays
 *   .once()    the owner's preview: a single play
 * Off in the config: never plays. */
var AlertSound = (function () {
  function create(cfg, deps) {
    var timer = null, left = 0;

    function stop() {
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
    }
    function ring() {
      timer = null;
      left--;
      deps.play();
      if (left > 0) timer = deps.setTimeout(ring, cfg.repeatMs);
    }

    return {
      start: function () {
        stop();
        if (!cfg.enabled) return;
        left = cfg.maxPlays;
        ring();
      },
      stop: stop,
      once: function () { if (cfg.enabled) deps.play(); }
    };
  }
  return { create: create };
})();
