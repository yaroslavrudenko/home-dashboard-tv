/* The on-view refresh gate: a source asked only while its screen is on view AND the TV shows the page. ES5.
 *   OnView.create(refreshMs, deps, run)
 *     deps: { now(), setTimeout, clearTimeout, documentVisible() (optional) }
 *     run(done): starts ONE round and calls done() exactly once when it has ended; it may return cancel(reason) (FIX-BATCH-19 3,
 *     P7; FIX-19B decision): called with 'leave' when the screen is left and 'hidden' when the TV hides the page during the
 *     round. A round that cancels (returns anything but false) stops its requests and draws nothing, and the gate marks the next
 *     arrival to ask at once; a round may decline a 'leave' (return false: it already has answers) — it then ends in the
 *     background, its result kept for the return, and arms no timer while off view
 *   Returns { setVisible(visible, explicit), visibilityChanged() }:
 *     an explicit open (◀ ▶, a language change on the screen) runs at once; a rotation arrival, staying on view and the
 *     TV showing the page again run only when refreshMs has passed since the last ATTEMPT; one round at a time; leaving
 *     the screen or the TV hiding the page stops the cadence (nothing is asked off view). A clock that went back (now
 *     before the last attempt) never makes it wait: the attempt is due at once, and no wait is ever longer than refreshMs.
 * Shared by the Markets screen (js/markets.js) and the Alerts screen's recent alerts (js/alerts-history.js). */
var OnView = (function () {
  function create(refreshMs, deps, run) {
    var docVisible = deps.documentVisible || function () { return true; };
    var selected = false, inFlight = false, timer = null, lastAttemptAt = 0, cancelRound = null, attempt = 0, retryOnArrival = false;

    function stopTimer() { if (timer !== null) deps.clearTimeout(timer); timer = null; }
    function later(ms) { stopTimer(); timer = deps.setTimeout(function () { timer = null; check(false); }, ms); }

    function send(now) {
      var mine = ++attempt;
      inFlight = true;
      retryOnArrival = false;
      lastAttemptAt = now;
      cancelRound = run(function () {
        if (mine !== attempt) return;   // a cancelled round's late end changes nothing
        inFlight = false; cancelRound = null;
        // the next attempt is due refreshMs after this one BEGAN: a slow round never stretches the cadence
        if (selected && docVisible()) later(Math.max(0, Math.min(refreshMs, lastAttemptAt + refreshMs - deps.now())));
      });
    }
    function check(explicit) {
      if (!selected || !docVisible() || inFlight) return;
      var now = deps.now(), due = lastAttemptAt + refreshMs;
      if (!explicit && !retryOnArrival && lastAttemptAt && now >= lastAttemptAt && now < due) { later(due - now); return; }
      send(now);
    }
    // Leaving (or the TV hiding the page) during a round: the round decides (see run); a cancelled one is forgotten — the
    // next arrival asks at once (FIX-19B: an explicit flag, so a recent completed round never makes it wait).
    function cancelInFlight(reason) {
      if (!inFlight || typeof cancelRound !== 'function') return;
      if (cancelRound(reason) === false) return;   // it goes on to its end in the background
      attempt++; inFlight = false; cancelRound = null; retryOnArrival = true;
    }

    return {
      setVisible: function (v, explicit) {
        if (!v) { selected = false; stopTimer(); cancelInFlight('leave'); return; }
        if (selected && !explicit) return;
        selected = true;
        check(explicit);
      },
      visibilityChanged: function () { if (!docVisible()) { stopTimer(); cancelInFlight('hidden'); } else check(false); }
    };
  }
  return { create: create };
})();
