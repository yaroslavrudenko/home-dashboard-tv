/* The Alerts screen (Pikud HaOref): at the start, the home areas — a calm «Тревог нет · Реховот» with when the feed last
 * answered, the alert itself while one is up, «нет связи» (never "no alerts") while the feed is lost; under it the
 * nearby areas; at the end, the recent alerts across Israel (js/alerts-history.js), newest first: time, kind, areas.
 * While an alert at home (or the preview) is up, the alert layer made here (#alert, drawn by js/view-alert.js) covers the
 * whole screen: the screen is the alert. Areas are named in the
 * interface language when they are configured places, otherwise as the feed writes them (Hebrew, right to left).
 * Feed text reaches the page only through Html.esc. ES5. */
var AlertsScreenView = (function () {
  var esc = Html.esc;
  var AREAS_SHOWN = 3;
  var els = {}, places = [], drawn = '';

  // cfg: Config.alerts — its configured places name the feed's areas.
  function init(el, cfg) {
    el.innerHTML = Html.screenHead('screen.alerts', 'alerts-status') + '<div class="screen-body al-body" id="al-body"></div>' +
      '<div id="alert" class="alert" role="alert"></div>';
    els = { body: el.querySelector('#al-body'), status: el.querySelector('#alerts-status') };
    places = cfg.areas.concat(cfg.nearby);
    drawn = '';
  }
  // The configured place a feed area belongs to (its name, or a district of it: "ראשון לציון - מזרח"), or null.
  function placeOf(area) {
    for (var i = 0; i < places.length; i++) if (Alerts.coversPlace(area, places[i])) return places[i];
    return null;
  }

  function block(cls, text) { return '<div class="' + cls + '">' + esc(text) + '</div>'; }
  function placeNames(list) { var out = []; for (var i = 0; i < list.length; i++) out.push(AlertView.nameOf(list[i])); return out; }
  // Names, each whole (a line never breaks at a name's hyphen), joined by `sep`.
  function namesHtml(names, sep) {
    var out = [];
    for (var i = 0; i < names.length; i++) out.push('<span class="al-name">' + esc(names[i]) + '</span>');
    return out.join(esc(sep));
  }
  // The string `key` with its {areas} filled by ready HTML (the rest escaped).
  function withAreas(key, vars, areasHtml) {
    var MARK = '\u0001', v = { areas: MARK };
    for (var k in vars) if (vars.hasOwnProperty(k)) v[k] = vars[k];
    return esc(I18n.t(key, v)).replace(MARK, areasHtml);
  }

  // The home card: the alert, the lost feed, the first answer awaited, or quiet.
  function homeHtml(st, m) {
    var home = placeNames(m.homes).join(', '), a = st.active;
    if (a) {
      var w = AlertView.words(a);
      return '<section class="card al-home is-alert">' + Icons.glyph('warning') + block('al-home-main', w.title) +
        block('al-home-place', placeNames(a.places).join(', ')) + block('al-home-sub', I18n.t('a.since', { time: m.since })) + '</section>';
    }
    if (st.offline) {
      return '<section class="card al-home is-offline">' + Icons.glyph('warning') +
        block('al-home-main', m.checked ? I18n.t('a.offlineSince', { time: m.checked }) : I18n.t('a.offline')) + block('al-home-place', home) + '</section>';
    }
    return '<section class="card al-home is-quiet">' + Icons.glyph('shield') +
      block('al-home-main', st.checkedAt ? I18n.t('a.home.quiet') : I18n.t('a.checking')) + block('al-home-place', home) +
      (st.checkedAt ? block('al-home-sub', I18n.t('a.checked', { time: m.checked })) : '') + '</section>';
  }

  function nearHtml(st, m) {
    var n = st.around, text = n ? withAreas('a.nearby', {}, namesHtml(placeNames(n.places), ', '))
      : esc(st.offline ? I18n.t('a.offline') : st.checkedAt ? I18n.t('a.near.quiet') : I18n.t('a.checking'));
    return '<section class="card al-near' + (n ? ' is-alert' : '') + '">' + block('card-title', I18n.t('a.near.title')) +
      '<div class="al-near-text">' + text + '</div>' +
      (n ? '' : '<div class="al-near-places">' + namesHtml(placeNames(m.nearby), ' · ') + '</div>') + '</section>';
  }

  // One recent alert. Hebrew left untranslated is its own right-to-left block.
  // A configured place is named once however many of its districts are listed (Tel Aviv has four).
  function areasHtml(areas) {
    var he = I18n.lang() === 'he', names = [], seen = [], foreign = 0, more = 0, i;
    for (i = 0; i < areas.length; i++) {
      var p = placeOf(areas[i]);
      if (p && seen.indexOf(p) >= 0) continue;
      if (p) seen.push(p);
      if (names.length < AREAS_SHOWN) { names.push(p && !he ? AlertView.nameOf(p) : areas[i]); if (!p) foreign++; }
      else more++;
    }
    var list = namesHtml(names, ', '), html = more ? withAreas('a.nearbyMore', { n: more }, list) : list;
    return '<div class="al-areas"' + (!he && foreign === names.length && !more ? ' dir="rtl" lang="he"' : '') + '>' + html + '</div>';
  }
  function rowHtml(e, today) {
    var when = (e.date === today ? '' : e.date.slice(0, 5) + ' ') + e.time;
    var own = I18n.lang() === 'he' || e.kind;
    return '<div class="al-row">' + block('al-time', when) +
      (own ? block('al-kind', I18n.lang() === 'he' ? e.title : I18n.t('a.kind.' + e.kind)) : '<div class="al-kind" dir="rtl" lang="he">' + esc(e.title) + '</div>') +
      areasHtml(e.areas) + '</div>';
  }
  function recentHtml(h, m) {
    var body = '', i;
    if (h.events.length) for (i = 0; i < h.events.length; i++) body += rowHtml(h.events[i], m.today);
    else {
      var text = h.kind === 'loading' ? I18n.t('a.recent.loading') : h.kind === 'failed' ? I18n.t('a.recent.failed') : I18n.t('a.recent.none', { n: m.days });
      body = '<div class="al-recent-empty' + (h.kind === 'failed' ? ' is-failed' : '') + '">' + esc(text) + '</div>';
    }
    return '<section class="card al-recent">' + block('card-title', I18n.t('a.recent')) + '<div class="al-rows">' + body + '</div></section>';
  }

  // st: the Alerts monitor state (the real one, never the preview); h: the history state { kind, events };
  // m: { homes, nearby (Config.alerts places), since, checked ("HH:MM"), today ('DD.MM.YYYY' at home), updated ("HH:MM"
  // of the list), days }. Redrawn only when what it shows changed.
  function render(st, h, m) {
    var a = st.active, n = st.around, i;
    var key = [I18n.lang(), a ? a.title + a.ids + m.since : '', n ? n.ids : '', st.offline, !!st.checkedAt, m.checked, h.kind, m.today];
    for (i = 0; i < h.events.length; i++) key.push(h.events[i].date + h.events[i].time + h.events[i].title + h.events[i].areas.join(','));
    key = key.join('|');
    if (key !== drawn) {
      drawn = key;
      els.body.innerHTML = '<div class="al-side">' + homeHtml(st, m) + nearHtml(st, m) + '</div>' + recentHtml(h, m);
    }
    Html.setStatus(els.status, 'status screen-status', h.kind, View.statusText(h.kind, m.updated));
  }

  return { init: init, render: render };
})();
