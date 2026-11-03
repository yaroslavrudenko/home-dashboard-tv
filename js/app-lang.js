/* The interface language (batch 17, C-1): the language at start (remembered on the TV), applying it, and switching it
 * with ▼ / ▲ or the colour key — at once on every screen, no reload. ES5. */
var AppLang = (function () {
  var LANG_STORE = 'homedash.lang', NEWS_SETTLE_MS = 600;

  // d: { env (AppEnv: storage, log), timers (AppEnv.timers()), sources (the record, read at call time: news), ui (the record
  // { nav: AppNav, flow: AlertFlow }, read at call time: the language is applied before either exists), toast (ToastView) }.
  function create(d) {
    var newsTimer = null;
    function known(lang) { return Config.languages.indexOf(lang) >= 0; }
    // The remembered language, else Config.lang, else the first of Config.languages.
    function startLang() {
      var st = d.env.storage(), saved = null;
      try { saved = st && st.getItem(LANG_STORE); } catch (e) { saved = null; }
      return known(saved) ? saved : known(Config.lang) ? Config.lang : Config.languages[0];
    }
    function saveLang(lang) {
      var st = d.env.storage();
      try { if (st) st.setItem(LANG_STORE, lang); } catch (e) { d.env.log('language not saved: ' + e.message); }
    }
    // Strings, direction and the fixed labels; the drawn parts follow from their own keys, which carry the language.
    function apply(lang) {
      I18n.setLang(lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = I18n.dir();
      document.documentElement.className = String(document.documentElement.className || '').replace(/\bis-booting\b/, '');   // FIX-18B 3: shown now, in its direction
      Html.relabel(document);
    }
    function start() { apply(startLang()); }
    // The next (step 1: ▼ or the colour key) or previous (step −1: ▲) language. NEWS_SETTLE_MS after the last press (a held
    // key never sends a burst) the news feeds of the language the remote settles on are fetched, and the screen on view
    // refreshes as if it had just been opened (the owner's rule). The settle's order is frozen (DESIGN-17 §3.1, F17-3).
    function switchLang(step) {
      var list = Config.languages, lang = list[(list.indexOf(I18n.lang()) + step + list.length) % list.length];
      apply(lang);
      saveLang(lang);
      d.sources.news.use(lang);
      d.timers.clearTimeout(newsTimer);
      newsTimer = d.timers.setTimeout(function () {
        newsTimer = null; d.sources.news.refresh(); d.ui.nav.select(d.ui.nav.current(), true); d.ui.nav.refreshOnOpen(d.ui.nav.current());
      }, NEWS_SETTLE_MS);
      d.toast.show(I18n.t('lang.name'));
      d.ui.nav.renderCurrent();
      d.ui.flow.render();
    }
    return { start: start, switch: switchLang };
  }
  return { create: create };
})();
