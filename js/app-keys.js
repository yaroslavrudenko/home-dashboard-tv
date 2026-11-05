/* The remote (batch 17, C-1): Back stops the player playing behind (D5) and exits; ◀ ▶ switch screens; ▼ / ▲ and the language key switch the language; OK opens
 * the city picker (never over an alert); the blue key previews the alert. Every key pauses the rotation but Back and
 * ◀ ▶ (they move it themselves). While the city picker is open it takes every key; while the preview is up any key only
 * ends it. Nothing dismisses a real alert (◀ ▶ may leave its screen; the rotation never does while it is up). ES5. */
var AppKeys = (function () {
  var KEY_BACK = 10009, KEY_LEFT = 37, KEY_RIGHT = 39, KEY_OK = 13, KEY_UP = 38, KEY_DOWN = 40;
  // The language key: the first of these colour keys the TV lets the app register ('ColorF2Yellow' = 405 on Samsung).
  var LANG_KEYS = [{ name: 'ColorF2Yellow', code: 405 }, { name: 'ColorF0Red', code: 403 }];
  // The alert preview: the blue key (Samsung 'ColorF3Blue' = 406).
  var PREVIEW_KEY = { name: 'ColorF3Blue', code: 406 };

  // d: { env (AppEnv), player (PlayerBehind), nav (AppNav), flow (AlertFlow), lang (AppLang), cityView, homeId () → the home city's id }.
  function create(d) {
    var langKey = LANG_KEYS[0].code;
    // The TV delivers a colour key only after the app registers it; the first key it accepts is the language key.
    function register() {
      if (!d.env.canRegisterKeys()) return;
      d.env.registerKey(PREVIEW_KEY.name, 'alert preview button');
      for (var i = 0; i < LANG_KEYS.length; i++) {
        if (d.env.registerKey(LANG_KEYS[i].name, 'language key ' + LANG_KEYS[i].name)) { langKey = LANG_KEYS[i].code; return; }
      }
    }
    function onKey(e) {
      if (d.cityView.isOpen()) { e.preventDefault(); d.cityView.key(e.keyCode); d.nav.touch(); return; }
      if (d.flow.previewing() || e.keyCode === PREVIEW_KEY.code) {
        e.preventDefault();
        d.flow.togglePreview();
        d.nav.touch();
        return;
      }
      if (e.keyCode === KEY_BACK) { e.preventDefault(); d.player.stop(); d.env.exit(); return; }
      if (e.keyCode === KEY_LEFT || e.keyCode === KEY_RIGHT) { e.preventDefault(); d.nav.step(e.keyCode === KEY_RIGHT ? 1 : -1); return; }
      if (e.keyCode === KEY_OK) { e.preventDefault(); if (!d.flow.alertUp()) d.cityView.open(d.homeId()); }
      if (e.keyCode === langKey || e.keyCode === KEY_DOWN) { e.preventDefault(); d.lang.switch(1); }
      else if (e.keyCode === KEY_UP) { e.preventDefault(); d.lang.switch(-1); }
      d.nav.touch();
    }
    return { register: register, onKey: onKey };
  }
  return { create: create };
})();
