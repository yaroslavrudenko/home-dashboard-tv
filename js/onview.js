/* The on-view refresh gate: a source asked only while its screen is on view AND the TV shows the page. ES5.
 *   OnView.create(refreshMs, deps, run)
 *     deps: { now(), setTimeout, clearTimeout, documentVisible() (optional) }
 *     run(done): starts ONE round and calls done() exactly once when it has ended
 *   Returns { setVisible(visible, explicit), visibilityChanged() }:
 *     an explicit open (◀ ▶, a language change on the screen) runs at once; a rotation arrival, staying on view and the
 *     TV showing the page again run only when refreshMs has passed since the last ATTEMPT; one round at a time; leaving
 *     the screen or the TV hiding the page stops the cadence (nothing is asked off view).
 * Shared by the Markets screen (js/markets.js) and the Alerts screen's recent alerts (js/alerts-history.js). */
var OnView = (function () {
  function create(refreshMs, deps, run) {
    var docVisible = deps.documentVisible || function () { return true; };
    var selected = false, inFlight = false, timer = null, lastAttemptAt = 0;

    function stopTimer() { if (timer !== null) deps.clearTimeout(timer); timer = null; }
    function later(ms) { stopTimer(); timer = deps.setTimeout(function () { timer = null; check(false); }, ms); }

    function send(now) {
      inFlight = true;
      lastAttemptAt = now;
      run(function () {
        inFlight = false;
        // the next attempt is due refreshMs after this one BEGAN: a slow round never stretches the cadence
        if (selected && docVisible()) later(Math.max(0, lastAttemptAt + refreshMs - deps.now()));
      });
    }
    function check(explicit) {
      if (!selected || !docVisible() || inFlight) return;
      var now = deps.now(), due = lastAttemptAt + refreshMs;
      if (!explicit && lastAttemptAt && now < due) { later(due - now); return; }
      send(now);
    }

    return {
      setVisible: function (v, explicit) {
        if (!v) { selected = false; stopTimer(); return; }
        if (selected && !explicit) return;
        selected = true;
        check(explicit);
      },
      visibilityChanged: function () { if (!docVisible()) stopTimer(); else check(false); }
    };
  }
  return { create: create };
})();
