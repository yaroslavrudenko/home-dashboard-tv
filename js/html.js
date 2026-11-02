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

  // Nothing to show: a glyph, what is wrong, and (optionally) what happens next, calm in the middle of its box.
  function emptyState(glyph, text, sub) {
    return '<div class="empty-state">' + glyph + '<div class="empty-text">' + esc(text) + '</div>' + (sub ? '<div class="empty-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  // A screen's one calm card when it has nothing to show.
  function emptyCard(cls, glyph, text, sub) { return '<div class="card ' + cls + '">' + emptyState(glyph, text, sub) + '</div>'; }
  // Every screen's status sentence: "Обновлено в 20:32" / "Не обновляется · данные от 20:32" / nothing (loading and failure
  // are said where the data would be); with the source's name after it when the data are not the usual source's (batch 15:
  // «… · MET Norway»).
  function statusText(kind, time, source) {
    var text = kind === 'fresh' ? I18n.t('w.updated', { time: time }) : kind === 'stale' ? I18n.t('w.stale', { time: time }) : '';
    return text && source ? I18n.t('w.source', { text: text, source: I18n.t('src.' + source) }) : text;
  }
  // "Повторим в 20:33" / "Повторим позже": when a failed source is tried again.
  function retryText(retryAt) { return retryAt ? I18n.t('w.retry', { time: retryAt }) : I18n.t('w.retrySoon'); }

  return { esc: esc, relabel: relabel, setStatus: setStatus, statusText: statusText, screenHead: screenHead, emptyState: emptyState, emptyCard: emptyCard, retryText: retryText };
})();
