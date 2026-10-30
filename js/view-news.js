/* The News screen: two columns side by side («Израиль», «Экономика»; the interface language picks the feeds, so the
 * headlines read in the page's own direction), each one feed's top stories, newest first:
 * the time and the headline. Both columns have the same five row slots, so row n on the left and row n on the right
 * share one line. A headline takes at most two lines (a fixed two-line box, clamped with an ellipsis: nothing is
 * measured). Both configured columns are always drawn, and each carries its own state: loading inside it; a feed that
 * fails says so in its own column only, amber — in its body with when it is tried again when it has no story yet, in
 * its head ("not updating") over its last stories. Feed text reaches the page only through
 * Html.esc. */
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

  // A column with no story: loading, or (amber, like the stale line) failed with when it is tried again.
  function emptyHtml(c, retryAt) {
    var failed = c.kind === 'failed', text = !failed ? I18n.t('n.loading') : retryAt ? I18n.t('n.colFailedRetry', { time: retryAt }) : I18n.t('n.colFailed');
    return '<div class="news-col-empty' + (failed ? ' is-failed' : '') + '">' + esc(text) + '</div>';
  }

  // c: { id, source, items, kind, updated ("HH:MM") }; rows: the slot count, so a short column keeps the grid;
  // retryAt: "HH:MM" of the next attempt or ''.
  function columnHtml(c, now, rows, retryAt) {
    var body = '', i;
    if (!c.items.length) body = emptyHtml(c, retryAt);
    else for (i = 0; i < rows; i++) body += c.items[i] ? rowHtml(c.items[i], now) : '<div class="news-row"></div>';
    return '<section class="card news-col"><div class="news-col-head"><span class="src-dot src-' + esc(c.source) + '"></span>' +
      '<span class="news-col-title">' + esc(I18n.t('n.col.' + c.id)) + '</span><span class="src-name">' + esc(I18n.t('n.src.' + c.source)) + '</span>' +
      (c.kind === 'stale' ? '<span class="news-col-state">' + esc(I18n.t('w.stale', { time: c.updated })) + '</span>' : '') + '</div>' +
      '<div class="news-rows">' + body + '</div></section>';
  }

  // The header speaks once for the screen: fresh while any column is current (a failed column says so itself), stale
  // when none is, and when nothing came at all: nothing while loading, "unavailable · retrying at" when failed.
  function statusOf(columns, s) {
    var fresh = false, any = false;
    for (var i = 0; i < columns.length; i++) { fresh = fresh || columns[i].kind === 'fresh'; any = any || columns[i].items.length > 0; }
    if (!any) return { kind: s.kind, text: s.kind === 'failed' ? (s.retryAt ? I18n.t('n.failedRetry', { time: s.retryAt }) : I18n.t('n.failed')) : '' };
    var kind = fresh ? 'fresh' : 'stale';
    return { kind: kind, text: View.statusText(kind, s.updated) };
  }

  // columns: [{ id, source, items (newest first, at most `rows`), kind, updated }].
  // s: { kind, updated ("HH:MM", the newest answer), retryAt ("HH:MM"|'') }.
  // Redrawn only when the stories, their "… ago" texts or a state changed.
  function render(columns, s, now, rows) {
    var key = [s.kind, s.retryAt, I18n.lang()], i, j;
    for (i = 0; i < columns.length; i++) {
      key.push(columns[i].source, columns[i].kind, columns[i].updated);
      for (j = 0; j < columns[i].items.length; j++) key.push(columns[i].items[j].key + columns[i].items[j].title + I18n.ago(now - columns[i].items[j].at));
    }
    key = key.join('|');
    if (key !== drawn) {
      drawn = key;
      var html = '';
      for (i = 0; i < columns.length; i++) html += columnHtml(columns[i], now, rows, s.retryAt);
      els.body.innerHTML = html;
    }
    var st = statusOf(columns, s);
    Html.setStatus(els.status, 'status screen-status', st.kind, st.text);
  }

  return { init: init, render: render };
})();
