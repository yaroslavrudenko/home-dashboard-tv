/* The News screen: two columns side by side («Израиль», «Экономика»; the interface language picks the feeds, so the
 * headlines read in the page's own direction), each one feed's top stories, newest first:
 * the time and the headline. Both columns have the same five row slots, so row n on the left and row n on the right
 * share one line. A headline takes at most three lines (a fixed three-line box of 3 × 38 px, clamped with an ellipsis:
 * nothing is measured; the owner, 2026-11-02: «3 строки»), with at least 16 px under its third line (N1). Both configured columns are always drawn, and each carries its own state:
 * loading inside it; a feed that fails says so in its own column only — in its body (the one state block, js/view-state.js)
 * with when it is tried again when it has no story yet, in its head over its last stories («данные от 09:31», short: L1)
 * unless the header already says exactly that. Feed text reaches the page only through Html.esc. */
var NewsView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  function init(el) {
    el.innerHTML = Html.screenHead('screen.news', 'news-status') + '<div class="screen-body news-body" id="news-body"></div>';
    els = { body: el.querySelector('#news-body'), status: el.querySelector('#news-status') };
    drawn = '';
  }

  function rowHtml(item, now) {
    return '<div class="news-row"><div class="news-time">' + esc(I18n.ago(now - item.at)) + '</div><div class="news-title">' + esc(item.title) + '</div></div>';
  }


  // c: { id, source, items, kind, updated ("HH:MM") }; rows: the slot count, so a short column keeps the grid;
  // retryAt: "HH:MM" of the next attempt or ''; head: the header's { kind, time } — a stale column's own part word is left
  // out only when the header is stale at the same minute (L1, N11: never one time twice on one screen); under a fresh header
  // it always says it (FIX-17B 4: a stale column never hides behind a fresh minute). A column with no story holds
  // the one state block: loading, or failed with when it is tried again (B17: the header says nothing then, F17-2).
  function columnHtml(c, now, rows, retryAt, head) {
    var body = '', i;
    if (!c.items.length) body = c.kind === 'failed' ? ViewState.block('failed', { retryAt: retryAt }) : ViewState.block('loading');
    else for (i = 0; i < rows; i++) body += c.items[i] ? rowHtml(c.items[i], now) : '<div class="news-row"></div>';
    return '<section class="card news-col"><div class="news-col-head"><span class="src-dot src-' + esc(c.source) + '"></span>' +
      '<span class="news-col-title">' + esc(I18n.t('n.col.' + c.id)) + '</span><span class="src-name">' + esc(I18n.t('n.src.' + c.source)) + '</span>' +
      (c.kind === 'stale' && (head.kind !== 'stale' || head.time !== c.updated) ? '<span class="news-col-state">' + esc(ViewState.partText('stale', c.updated)) + '</span>' : '') + '</div>' +
      '<div class="news-rows">' + body + '</div></section>';
  }

  // The header speaks once for the screen: fresh while any column is current (a failed column says so itself), stale
  // when none is, and nothing when no story came at all (each column's block says loading or failed).
  function statusOf(columns, s) {
    var fresh = false, any = false;
    for (var i = 0; i < columns.length; i++) { fresh = fresh || columns[i].kind === 'fresh'; any = any || columns[i].items.length > 0; }
    if (!any) return { kind: s.kind, time: '', text: '' };
    var kind = fresh ? 'fresh' : 'stale';
    return { kind: kind, time: s.updated, text: ViewState.headText(kind, s.updated) };
  }

  // columns: [{ id, source, items (newest first, at most `rows`), kind, updated }].
  // s: { kind, updated ("HH:MM", the newest answer), retryAt ("HH:MM"|'') }.
  // Redrawn only when the stories, their "… ago" texts or a state changed.
  function render(columns, s, now, rows) {
    var key = [s.kind, s.retryAt, s.updated, I18n.lang()], i, j;
    for (i = 0; i < columns.length; i++) {
      key.push(columns[i].source, columns[i].kind, columns[i].updated);
      for (j = 0; j < columns[i].items.length; j++) key.push(columns[i].items[j].key + columns[i].items[j].title + I18n.ago(now - columns[i].items[j].at));
    }
    key = key.join('|');
    var st = statusOf(columns, s);
    if (key !== drawn) {
      drawn = key;
      var html = '';
      for (i = 0; i < columns.length; i++) html += columnHtml(columns[i], now, rows, s.retryAt, st);
      els.body.innerHTML = html;
    }
    Html.setStatus(els.status, 'status screen-status', st.kind, st.text);
  }

  return { init: init, render: render };
})();
