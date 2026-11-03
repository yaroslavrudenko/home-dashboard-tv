/* The toast (#toast): one short line for a moment — the language just chosen, the city saved. ES5. */
var ToastView = (function () {
  var TOAST_MS = 1600, el = null, timer = null, timers = null;
  // node: #toast; t: AppEnv.timers().
  function init(node, t) { el = node; timers = t; }
  function show(text) {
    el.textContent = text;
    el.className = 'toast is-on';
    timers.clearTimeout(timer);
    timer = timers.setTimeout(function () { el.className = 'toast'; }, TOAST_MS);
  }
  return { init: init, show: show };
})();
