// Home Dashboard (HomeDash01.Dashboard) → «Настин кинозал» (Yr0ttPlay1.OttClubPlayer): the player's music plays on behind
// the dashboard (owner, 2026-10-30: «чтобы дэшборд был поверх и не перебивал музыку»), and stops when the dashboard goes
// away to any other app («для остальных заканчивал»). ES5, Chromium 47. No privilege is needed for message ports.
// The player listens on its local port 'kinozal.control' (js/remote-control.js); a message is one pair: the field CMD and the command.
//   'play-behind': the player, suspended because the dashboard came up, resumes the same stream behind it. Paused or
//                  idle: nothing. Sent twice (now and RETRY_MS later): the dashboard's start can reach the player before
//                  the player has handled its own "hidden" event, and a too-early message is ignored. A repeat while
//                  already playing behind does nothing.
//   'stop-behind': the dashboard left the front: the player is suspended again as by any other app; if the player
//                  itself is coming to the front it is ignored there (it simply keeps playing).
//   PlayerBehind.create(deps)   deps: { send(cmd), setTimeout, clearTimeout, documentVisible() } → { start(), visibilityChanged() }:
//                               App owns the page's visibility (C-17) and calls start() once and visibilityChanged() on
//                               every change; nothing happens at load.
//   PlayerBehind.port(log)      send(cmd) through the TV's message port; the player not running (or not installed):
//                               requestRemoteMessagePort throws NotFoundError — logged, nothing else happens.
var PlayerBehind = (function () {
  var PLAYER_APP_ID = 'Yr0ttPlay1.OttClubPlayer', PLAYER_PORT = 'kinozal.control', RETRY_MS = 1500;
  var CMD = 'cmd';                       // the player's message field name

  function port(log) {
    return function (cmd) {
      try {
        if (!window.tizen || !tizen.messageport) return;
        tizen.messageport.requestRemoteMessagePort(PLAYER_APP_ID, PLAYER_PORT).sendMessage([{ key: CMD, value: cmd }]);
      } catch (e) { log('player ' + cmd + ': ' + e.message); }   // the player is not running, or the TV refused the port
    };
  }

  function create(deps) {
    var retryTimer = null;
    function cancelRetry() { if (retryTimer !== null) deps.clearTimeout(retryTimer); retryTimer = null; }
    // On start and on each return to the front.
    function playBehind() {
      deps.send('play-behind');
      cancelRetry();
      retryTimer = deps.setTimeout(function () { retryTimer = null; if (deps.documentVisible()) deps.send('play-behind'); }, RETRY_MS);
    }
    // The dashboard went to the background (another app, or the player, came to the front).
    function stopBehind() { cancelRetry(); deps.send('stop-behind'); }
    return { start: playBehind, visibilityChanged: function () { if (deps.documentVisible()) playBehind(); else stopBehind(); } };
  }

  return { create: create, port: port, RETRY_MS: RETRY_MS };
}());
