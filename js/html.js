/* Small HTML helpers every view shares. ES5. Text from the network only ever reaches the page through esc(). */
var Html = (function () {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // A fixed label: its string key rides on the element, so a language switch rewrites it in place (relabel) and the
  // rest of the screen is left alone.
  function label(key) { return ' data-i18n="' + esc(key) + '"'; }
  function relabel(root) {
    var els = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) els[i].textContent = I18n.t(els[i].getAttribute('data-i18n'));
  }

  // The calm status line: a dot and one sentence, coloured by kind ('fresh' green, 'stale' amber); no text = empty.
  // Rewritten only when what it says changes: the html last written is remembered on the element (C-21: the page's own
  // serialisation of it is never read back and compared).
  function setStatus(el, base, kind, text) {
    var cls = base + ' is-' + kind, html = text ? '<span class="status-dot"></span>' + esc(text) : '';
    if (el.className !== cls) el.className = cls;
    if (el.statusHtml !== html) { el.statusHtml = html; el.innerHTML = html; }
  }

  // A screen's header: its title (the string `titleKey`) at the start, its status line at the end (and under it, with
  // noteId, a second line that says why the data cannot be updated, never in place of the status line).
  function screenHead(titleKey, statusId, noteId) {
    var status = '<div class="status screen-status" id="' + statusId + '"></div>';
    return '<header class="screen-head"><h1 class="screen-title"' + label(titleKey) + '>' + esc(I18n.t(titleKey)) + '</h1>' +
      (noteId ? '<div class="head-side">' + status + '<div class="status-note" id="' + noteId + '"></div></div>' : status) + '</header>';
  }

  return { esc: esc, relabel: relabel, setStatus: setStatus, screenHead: screenHead };
})();
