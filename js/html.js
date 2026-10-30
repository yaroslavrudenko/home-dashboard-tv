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

  // A screen's header: its title on the left, its status line on the right (and under it, with noteId, a second line
  // that says why the data cannot be updated, never in place of the status line).
  function screenHead(title, statusId, noteId) {
    var status = '<div class="status screen-status" id="' + statusId + '"></div>';
    return '<header class="screen-head"><h1 class="screen-title">' + esc(title) + '</h1>' +
      (noteId ? '<div class="head-side">' + status + '<div class="status-note" id="' + noteId + '"></div></div>' : status) + '</header>';
  }

  // Nothing to show: a glyph, what is wrong, and (optionally) what happens next, calm in the middle of its box.
  function emptyState(glyph, text, sub) {
    return '<div class="empty-state">' + glyph + '<div class="empty-text">' + esc(text) + '</div>' + (sub ? '<div class="empty-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  // A screen's one calm card when it has nothing to show.
  function emptyCard(cls, glyph, text, sub) { return '<div class="card ' + cls + '">' + emptyState(glyph, text, sub) + '</div>'; }
  // "Повторим в 20:33" / "Повторим позже": when a failed source is tried again.
  function retryText(retryAt) { return retryAt ? I18n.t('w.retry', { time: retryAt }) : I18n.t('w.retrySoon'); }

  return { esc: esc, setStatus: setStatus, screenHead: screenHead, emptyState: emptyState, emptyCard: emptyCard, retryText: retryText };
})();
