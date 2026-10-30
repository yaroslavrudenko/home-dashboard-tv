/* The Israel alert over every screen, the quiet "alert nearby" notice and the "alerts: no connection" marker. ES5.
 * Areas are named in the interface language (Config.alerts: he / ru / uk). Texts the screen cannot translate are shown
 * as the feed wrote them (Hebrew, right to left); in Hebrew the feed's own title and instruction are the alert's words.
 * While an alert is up the overlay covers everything, so it carries its own connection line: an alert kept on
 * screen with a lost feed must say so. */
var AlertView = (function () {
  var esc = Html.esc;
  var NEARBY_NAMES = 3, MANY_AREAS = 3;
  var overlay = null, corner = null, drawnAlert = '', drawnCorner = '';

  function init(overlayEl, cornerEl) {
    overlay = overlayEl;
    corner = cornerEl;
    drawnAlert = drawnCorner = '';
  }

  function he(text) { return '<span dir="rtl" lang="he">' + esc(text) + '</span>'; }
  // A configured area in the interface language ({ he, ru, uk }; Russian for a language it has no name in).
  function nameOf(place) { return place[I18n.lang()] || place.ru; }
  function namesOf(places) { var out = []; for (var i = 0; i < places.length; i++) out.push(nameOf(places[i])); return out; }
  function offlineLine(checked) {
    return '<span class="offline-dot"></span>' + esc(checked ? I18n.t('a.offlineSince', { time: checked }) : I18n.t('a.offline'));
  }

  // Every area name whole: a name never breaks at its hyphen, the line breaks only between names.
  function areasHtml(names) {
    var parts = [];
    for (var i = 0; i < names.length; i++) parts.push('<span class="alert-area">' + esc(names[i]) + '</span>');
    return '<div class="alert-areas' + (names.length > MANY_AREAS ? ' is-many' : '') + '">' + parts.join(' · ') + '</div>';
  }

  // Hebrew: the feed's own words are the main line and the instruction (nothing translated twice). Otherwise the
  // category in the interface language, the original title under it when the category is unknown.
  function alertHtml(a, since, offline, checked) {
    var own = I18n.lang() === 'he';
    var title = own ? esc(a.title) : a.kind ? esc(I18n.t('a.kind.' + a.kind)) : esc(I18n.t('a.generic'));
    var instr = own ? esc(a.desc)
      : a.instruction ? esc(a.instruction.minutes ? I18n.t('a.shelterFor', { n: a.instruction.minutes }) : I18n.t('a.shelter'))
      : a.desc ? he(a.desc) : '';
    return '<div class="alert-pulse"></div><div class="alert-body">' + Icons.glyph('warning') +
      '<div class="alert-kind">' + title + '</div>' + (own || a.kind ? '' : '<div class="alert-orig">' + he(a.title) + '</div>') +
      areasHtml(namesOf(a.places)) +
      '<div class="alert-since">' + esc(I18n.t('a.since', { time: since })) + '</div>' +
      (offline ? '<div class="alert-offline">' + offlineLine(checked) + '</div>' : '') +
      (instr ? '<div class="alert-instr">' + instr + '</div>' : '') + '</div>';
  }

  function nearbyHtml(names, shown) {
    var list = names.slice(0, shown).join(', ');
    var areas = names.length > shown ? I18n.t('a.nearbyMore', { areas: list, n: names.length - shown }) : list;
    return '<span class="nearby"><span class="nearby-dot"></span>' + esc(I18n.t('a.nearby', { areas: areas })) + '</span>';
  }
  // The corner holds at most NEARBY_NAMES names; fewer when the line (with the offline marker) does not fit its
  // half of the bottom margin. Measured only when its content changed.
  function drawCorner(n, offline) {
    var names = n ? namesOf(n.places) : [], shown = Math.min(names.length, NEARBY_NAMES);
    for (;;) {
      corner.innerHTML = '<span class="corner-line">' + (n ? nearbyHtml(names, shown) : '') +
        (offline ? '<span class="alerts-offline">' + offlineLine('') + '</span>' : '') + '</span>';
      if (shown <= 1 || corner.firstChild.offsetWidth <= corner.clientWidth) return;
      shown--;
    }
  }

  // st: Alerts monitor state { active, nearby, offline, checkedAt }; since: "HH:MM" of active.startedAt;
  // checked: "HH:MM" of the last good answer (shown only while the feed is unreachable).
  function render(st, since, checked) {
    var a = st.active, key = a ? [a.title, a.desc, a.ids, since, st.offline, st.offline ? checked : '', I18n.lang()].join('/') : '';
    if (key !== drawnAlert) {
      drawnAlert = key;
      if (a) overlay.innerHTML = alertHtml(a, since, st.offline, checked);   // when it ends, the last text fades out with the overlay
      overlay.className = a ? 'alert is-on' : 'alert';
    }
    var n = st.nearby, ck = [n ? n.ids : '', st.offline, I18n.lang()].join('/');
    if (ck !== drawnCorner) {
      drawnCorner = ck;
      drawCorner(n, st.offline);
    }
  }

  return { init: init, render: render };
})();
