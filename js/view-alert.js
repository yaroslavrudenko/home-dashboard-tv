/* The Israel alert over every screen, the quiet "alert nearby" notice and the "alerts: no connection" marker. ES5.
 * Area names and texts the screen cannot translate are shown as the feed wrote them (Hebrew, right to left). */
var AlertView = (function () {
  var esc = Html.esc;
  var overlay = null, corner = null, drawnAlert = '', drawnCorner = '';

  function init(overlayEl, cornerEl) {
    overlay = overlayEl;
    corner = cornerEl;
    drawnAlert = drawnCorner = '';
  }

  function he(text) { return '<span dir="rtl" lang="he">' + esc(text) + '</span>'; }

  function alertHtml(a, since) {
    var title = a.kind ? esc(I18n.t('a.kind.' + a.kind)) : esc(I18n.t('a.generic'));
    var instr = a.instruction ? esc(a.instruction.minutes ? I18n.t('a.shelterFor', { n: a.instruction.minutes }) : I18n.t('a.shelter'))
      : a.desc ? he(a.desc) : '';
    return '<div class="alert-pulse"></div><div class="alert-body">' + Icons.glyph('warning') +
      '<div class="alert-kind">' + title + '</div>' + (a.kind ? '' : '<div class="alert-orig">' + he(a.title) + '</div>') +
      '<div class="alert-areas">' + esc(a.names.join(' · ')) + '</div>' +
      '<div class="alert-since">' + esc(I18n.t('a.since', { time: since })) + '</div>' +
      (instr ? '<div class="alert-instr">' + instr + '</div>' : '') + '</div>';
  }

  // st: Alerts monitor state { active, nearby, offline }; since: "HH:MM" of active.startedAt.
  function render(st, since) {
    var a = st.active, key = a ? [a.title, a.desc, a.names.join('|'), since, I18n.lang()].join('/') : '';
    if (key !== drawnAlert) {
      drawnAlert = key;
      if (a) overlay.innerHTML = alertHtml(a, since);   // when it ends, the last text fades out with the overlay
      overlay.className = a ? 'alert is-on' : 'alert';
    }
    var n = st.nearby, ck = [n ? n.names.join(', ') : '', st.offline, I18n.lang()].join('/');
    if (ck !== drawnCorner) {
      drawnCorner = ck;
      corner.innerHTML = (n ? '<span class="nearby"><span class="nearby-dot"></span>' + esc(I18n.t('a.nearby', { areas: n.names.join(', ') })) + '</span>' : '') +
        (st.offline ? '<span class="alerts-offline"><span class="offline-dot"></span>' + esc(I18n.t('a.offline')) + '</span>' : '');
    }
  }

  return { init: init, render: render };
})();
