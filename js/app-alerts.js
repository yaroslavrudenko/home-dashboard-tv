/* The alert layer (batch 17, C-1): the real alert or the owner's preview over a quiet one, the home-alert banner on every
 * other screen, the sound, and opening the Alerts screen the moment an alert at home starts. Only the START of an alert
 * opens the screen and rings: the viewer may then move away with ◀ ▶ and a new record of the same alert never pulls him
 * back. Its end silences the sound; the rotation stays held for Config.rotation.afterAlertMs (Screens.hold). ES5. */
var AlertFlow = (function () {
  // d: { alerts (the monitor), sound, nav (AppNav), clock (HomeClock), cityView, timers }.
  function create(d) {
    var previewAt = 0, previewTimer = null;   // previewAt: when the blue key's preview started (0: off)

    // The alert layer draws the real state, or the preview's over a quiet one; a real alert ends the preview for good.
    function render() {
      var st = d.alerts.state();
      if (st.active && previewAt) endPreview(false);
      if (st.active) d.cityView.close();            // nothing stands over a real alert
      var shown = previewAt ? Alerts.preview(st, Config.alerts, previewAt) : st;
      AlertView.render(shown, shown.active ? d.clock.hhmm(shown.active.startedAt) : '', d.clock.hhmm(st.checkedAt));
      if (d.nav.hold(!!st.active)) {
        if (st.active) { d.sound.start(); d.nav.open('alerts'); banner(); return; }
        d.sound.stop();
      }
      banner();
      if (d.nav.currentIs('alerts')) d.nav.renderCurrent();
    }
    // The home-alert line: the real alert only (never the preview), on every screen but the Alerts screen.
    function banner() {
      var a = d.alerts.state().active;
      AlertBanner.render(!!a && !d.nav.currentIs('alerts'), Config.alerts.areas[0], a ? d.clock.hhmm(a.startedAt) : '');
    }
    function startPreview() {
      if (d.alerts.state().active) return;
      previewAt = d.timers.now();
      d.timers.clearTimeout(previewTimer);
      previewTimer = d.timers.setTimeout(function () { endPreview(true); }, Config.alerts.previewMs);
      render();
      d.nav.open('alerts');
      d.sound.once();
    }
    function endPreview(redraw) {
      d.timers.clearTimeout(previewTimer);
      previewTimer = null;
      previewAt = 0;
      if (redraw) render();
    }
    // The blue key: starts the preview, or (any key while it is up) ends it.
    function togglePreview() { if (previewAt) endPreview(true); else startPreview(); }

    return { render: render, banner: banner, previewing: function () { return previewAt > 0; }, togglePreview: togglePreview,
      alertUp: function () { return !!d.alerts.state().active; } };
  }
  return { create: create };
})();
