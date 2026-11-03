/* The TV platform seam (batch 17, C-1): storage, timers, visibility, the screen saver, exiting, the remote's colour keys
 * and the reload. Every try/catch around a platform API lives here, so the same files run in desktop Chrome, where there
 * is no tizen or webapis. Runs nothing at load. ES5. */
var AppEnv = (function () {
  // C-19: a failure caught is said, never swallowed.
  function log(message) { console.error(message); }
  // Every source's deps start with the clock, the timers and the log.
  function timers() {
    return { now: function () { return Date.now(); }, setTimeout: function (f, ms) { return setTimeout(f, ms); },
      clearTimeout: function (t) { clearTimeout(t); }, setInterval: function (f, ms) { return setInterval(f, ms); }, log: log };
  }
  function withTimers(extra) { return Obj.copyWith(timers(), extra); }
  // localStorage, or null where the TV refuses it (traffic then pauses: its request counter cannot be kept; the weather and
  // the air then start empty after a restart, as before batch 14).
  function storage() { try { return window.localStorage || null; } catch (e) { return null; } }
  function sessionStore() { try { return window.sessionStorage || null; } catch (e) { return null; } }
  // Whether the TV shows the page (C-10: one predicate for every source that pauses off screen).
  function documentVisible() { return !document.hidden; }

  // The screen saver is switched off while the app runs. The TV's own Eco "Auto Power Off" is a separate
  // setting the app cannot override (README).
  function keepScreenOn() {
    try {
      if (window.webapis && webapis.appcommon) {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF,
          function () { console.log('screensaver: off'); },
          function (e) { console.error('screensaver: ' + (e && (e.name + ' ' + e.message))); });
      }
    } catch (e) { console.error('screensaver: ' + e.message); }
  }
  function exit() {
    try { tizen.application.getCurrentApplication().exit(); } catch (err) { log('exit: ' + err.message); }   // desktop preview: no tizen
  }
  // The TV delivers a colour key only after the app registers it. True when it did; what: the key's role, for the log.
  function canRegisterKeys() { return !!(window.tizen && tizen.tvinputdevice); }
  function registerKey(name, what) {
    try { tizen.tvinputdevice.registerKey(name); return true; } catch (e) { log(what + ': ' + e.message); return false; }
  }
  function reload() { location.reload(); }
  // FIX-BATCH-19 7: a named moment of the boot on the page's own clock (performance.mark), read from the TV by
  // tools/tv-boot.mjs; nothing where the engine has no marks.
  function mark(name) {
    try { if (window.performance && performance.mark) performance.mark(name); } catch (e) { log('mark ' + name + ': ' + e.message); }
  }

  return { log: log, timers: timers, withTimers: withTimers, storage: storage, sessionStore: sessionStore, documentVisible: documentVisible,
    keepScreenOn: keepScreenOn, exit: exit, canRegisterKeys: canRegisterKeys, registerKey: registerKey, reload: reload, mark: mark };
})();
