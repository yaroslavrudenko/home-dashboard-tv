// Home Dashboard (HomeDash01.Dashboard) → «Настин кинозал» (Yr0ttPlay1.OttClubPlayer): the player's music plays on behind
// the dashboard (owner, 2026-10-30: «чтобы дэшборд был поверх и не перебивал музыку»), and stops when the dashboard goes
// away to any other app («для остальных заканчивал»). ES5, Chromium 47. No privilege is needed for message ports.
// The player listens on its local port 'kinozal.control' (js/remote-control.js); a message is one pair: the field CMD and the command.
//   'play-behind': the player, suspended because the dashboard came up, resumes the same stream behind it. Paused or
//                  idle: nothing. Sent twice (now and PLAYER_BEHIND_RETRY_MS later): the dashboard's start can reach the
//                  player before the player has handled its own "hidden" event, and a too-early message is ignored.
//                  A repeat while already playing behind does nothing.
//   'stop-behind': the dashboard left the front: the player is suspended again as by any other app; if the player
//                  itself is coming to the front it is ignored there (it simply keeps playing).
// The player not running (or not installed): requestRemoteMessagePort throws NotFoundError — caught, nothing happens.
var PlayerBehind = (function () {
  var PLAYER_APP_ID = 'Yr0ttPlay1.OttClubPlayer', PLAYER_PORT = 'kinozal.control', PLAYER_BEHIND_RETRY_MS = 1500;
  var CMD = 'cmd';                       // the player's message field name
  var retryTimer = null;

  function send(cmd) {
    try {
      if (!window.tizen || !tizen.messageport) return;
      tizen.messageport.requestRemoteMessagePort(PLAYER_APP_ID, PLAYER_PORT).sendMessage([{ key: CMD, value: cmd }]);
    } catch (e) { /* the player is not running, or the TV refused the port: the dashboard carries on */ }
  }

  // Call once on app start and on each return to the front.
  function playBehind() {
    send('play-behind');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { retryTimer = null; if (!document.hidden) send('play-behind'); }, PLAYER_BEHIND_RETRY_MS);
  }

  // Call when the dashboard goes to the background (another app, or the player, comes to the front).
  function stopBehind() {
    clearTimeout(retryTimer);
    retryTimer = null;
    send('stop-behind');
  }

  return { playBehind: playBehind, stopBehind: stopBehind };
}());

// Wiring: once the app has started, and on every change of visibility.
window.addEventListener("load", function () { PlayerBehind.playBehind(); });
document.addEventListener('visibilitychange', function () {
  if (document.hidden) PlayerBehind.stopBehind(); else PlayerBehind.playBehind();
});
