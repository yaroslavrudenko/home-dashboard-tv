/* The alert at home, the quiet "alert nearby" notice and the "alerts: no connection" marker. ES5.
 * Areas are named in the interface language (Config.alerts: he / ru / uk). Texts the screen cannot translate are shown
 * as the feed wrote them (Hebrew, right to left); in Hebrew the feed's own title and instruction are the alert's words.
 * The alert is drawn into the Alerts screen's alert layer (js/view-alerts.js makes it): while one is up that screen IS
 * the alert, red and filling the screen (App opens it when the alert starts). It covers the corner, so it carries its
 * own connection line: an alert kept on screen with a lost feed must say so. The owner's preview (st.preview,
 * js/alerts.js preview()) draws the same alert under a banner that says it is not a real alert. Hebrew shown in another language is its own right-to-left block
 * (dir="rtl" lang="he"), never an inline box inside a left-to-right line: figures stay where Hebrew puts them and the
 * Hebrew font's taller boxes never stick out of the line. */
var AlertView = (function () {
  var esc = Html.esc;
  var NEARBY_NAMES = 3, MANY_AREAS = 3;
  var overlay = null, corner = null, drawnAlert = '', drawnCorner = '';

  function init(overlayEl, cornerEl) {
    overlay = overlayEl;
    corner = cornerEl;
    drawnAlert = drawnCorner = '';
  }

  // A block of the feed's Hebrew, right to left, in its own box.
  function heBlock(cls, text) { return '<div class="' + cls + '" dir="rtl" lang="he">' + esc(text) + '</div>'; }
  // A configured area in the interface language (HomeCity.name, the one place-name rule).
  function nameOf(place) { return HomeCity.name(place, I18n.lang()); }
  function namesOf(places) { var out = []; for (var i = 0; i < places.length; i++) out.push(nameOf(places[i])); return out; }
  // "Тревоги: нет связи", with "· последний ответ HH:MM" once the feed has answered well at least once.
  function offlineLine(checked) {
    return '<span class="offline-dot"></span>' + esc(checked ? I18n.t('a.offlineSince', { time: checked }) : I18n.t('a.offline'));
  }

  // Every area name whole: a name never breaks at its hyphen, the line breaks only between names.
  function areasHtml(names) {
    var parts = [];
    for (var i = 0; i < names.length; i++) parts.push('<span class="alert-area">' + esc(names[i]) + '</span>');
    return '<div class="alert-areas' + (names.length > MANY_AREAS ? ' is-many' : '') + '">' + parts.join(' · ') + '</div>';
  }

  // An alert's words in the interface language: { title, orig (the Hebrew title to show under it, or ''), instr,
  // instrHe (instr is the feed's untranslated Hebrew) }. Hebrew: the feed's own words are the title and the
  // instruction (nothing translated twice). Otherwise the category in the interface language, the original title under
  // it when the category is unknown; the shelter instruction translated, any other instruction as the feed wrote it.
  function words(a) {
    if (I18n.lang() === 'he') return { title: a.title, orig: '', instr: a.desc, instrHe: false };
    return { title: a.kind ? I18n.t('a.kind.' + a.kind) : I18n.t('a.generic'), orig: a.kind ? '' : a.title,
      instr: a.instruction ? (a.instruction.minutes ? I18n.t('a.shelterFor', { n: a.instruction.minutes }) : I18n.t('a.shelter')) : a.desc,
      instrHe: !a.instruction && !!a.desc };
  }

  function alertHtml(st, since, checked) {
    var a = st.active, w = words(a);
    return '<div class="alert-pulse"></div>' + (st.preview ? '<div class="alert-preview">' + esc(I18n.t('a.preview')) + '</div>' : '') +
      '<div class="alert-body">' + Icons.glyph('warning') +
      '<div class="alert-kind">' + esc(w.title) + '</div>' + (w.orig ? heBlock('alert-orig', w.orig) : '') +
      areasHtml(namesOf(a.places)) +
      '<div class="alert-since">' + esc(I18n.t('a.since', { time: since })) + '</div>' +
      (st.offline ? '<div class="alert-offline">' + offlineLine(checked) + '</div>' : '') +
      (!w.instr ? '' : w.instrHe ? heBlock('alert-instr', w.instr) : '<div class="alert-instr">' + esc(w.instr) + '</div>') + '</div>';
  }

  function nearbyHtml(names, shown) {
    var list = names.slice(0, shown).join(', ');
    var areas = names.length > shown ? I18n.t('a.nearbyMore', { areas: list, n: names.length - shown }) : list;
    return '<span class="nearby"><span class="nearby-dot"></span>' + esc(I18n.t('a.nearby', { areas: areas })) + '</span>';
  }
  // The corner holds at most NEARBY_NAMES names. When the line (with the offline marker) does not fit its half of the
  // bottom margin, the time of the last answer goes first (the names nearby matter more), then names down to one.
  // Measured only when its content changed.
  function drawCorner(n, offline, checked) {
    var names = n ? namesOf(n.places) : [], shown = Math.min(names.length, NEARBY_NAMES), lost = checked;
    for (;;) {
      corner.innerHTML = '<span class="corner-line">' + (n ? nearbyHtml(names, shown) : '') +
        (offline ? '<span class="alerts-offline">' + offlineLine(lost) + '</span>' : '') + '</span>';
      if (corner.firstChild.offsetWidth <= corner.clientWidth) return;
      if (lost) lost = '';
      else if (shown > 1) shown--;
      else return;
    }
  }

  // st: Alerts monitor state { active, nearby, offline, checkedAt } (or its preview, st.preview); since: "HH:MM" of
  // active.startedAt; checked: "HH:MM" of the last good answer (shown only while the feed is unreachable).
  function render(st, since, checked) {
    var a = st.active, lost = st.offline ? checked : '';
    var key = a ? [a.title, a.desc, a.ids, since, st.offline, lost, !!st.preview, I18n.lang()].join('/') : '';
    if (key !== drawnAlert) {
      drawnAlert = key;
      if (a) overlay.innerHTML = alertHtml(st, since, checked);   // when it ends, the last text fades out with the overlay
      overlay.className = !a ? 'alert' : st.preview ? 'alert is-on is-preview' : 'alert is-on';
    }
    var n = st.nearby, ck = [n ? n.ids : '', st.offline, lost, I18n.lang()].join('/');
    if (ck !== drawnCorner) {
      drawnCorner = ck;
      drawCorner(n, st.offline, lost);
    }
  }

  return { init: init, render: render, words: words, nameOf: nameOf };
})();
