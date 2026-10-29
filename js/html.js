/* Small HTML helpers every view shares. ES5. Text from the network only ever reaches the page through esc(). */
var Html = (function () {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The calm status line: a dot and one sentence, coloured by kind ('fresh' green, 'stale' amber); no text = empty.
  // Rewritten only when what it says changes.
  function setStatus(el, base, kind, text) {
    var cls = base + ' is-' + kind, html = text ? '<span class="status-dot"></span>' + esc(text) : '';
    if (el.className !== cls) el.className = cls;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // A screen's header: its title on the left, its status line on the right.
  function screenHead(title, statusId) {
    return '<header class="screen-head"><h1 class="screen-title">' + esc(title) + '</h1>' +
      '<div class="status screen-status" id="' + statusId + '"></div></header>';
  }

  return { esc: esc, setStatus: setStatus, screenHead: screenHead };
})();
