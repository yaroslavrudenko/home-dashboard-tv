/* The red line at the top of every other screen while an alert at home is up: «Тревога в Реховоте · с 20:32» /
 * «אזעקה ברחובות · מ־20:32» / «Тривога в Реховоті · з 20:32». The Alerts screen is the alert itself, so it never
 * carries the line; the owner's preview never shows it (it is not an alert). The place is the home area in the
 * interface language, in its "in <place>" form (ruIn / ukIn; Hebrew prefixes ב to the name itself). Rewritten only
 * when what it says changes. ES5. */
var AlertBanner = (function () {
  var esc = Html.esc;
  var el = null, drawn = '';

  function init(bannerEl) { el = bannerEl; drawn = ''; }

  // The home area ({ he, ru, uk, en, ruIn, ukIn }) as it reads after "in": the declined form where the language has one
  // (HomeCity.name, the one place-name rule).
  function placeIn(place) { return HomeCity.name(place, I18n.lang(), 'In'); }

  // on: an alert at home is up and the screen on view is not the Alerts screen; place: the home area; since: "HH:MM"
  // of its start, or '' when not known.
  function render(on, place, since) {
    var text = on ? I18n.t(since ? 'a.bannerSince' : 'a.banner', { place: placeIn(place), time: since }) : '';
    var key = on ? I18n.lang() + '|' + text : '';
    if (key === drawn) return;
    drawn = key;
    if (on) el.innerHTML = '<div class="banner-pill"><span class="banner-dot"></span><span class="banner-text">' + esc(text) + '</span></div>';
    el.className = on ? 'banner is-on' : 'banner';
  }

  return { init: init, render: render };
})();
