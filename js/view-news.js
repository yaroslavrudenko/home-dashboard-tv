/* The News screen: two columns side by side («Израиль», «Экономика»), each one feed's top stories, newest first:
 * the time and the headline. Both columns have the same five row slots, so row n on the left and row n on the right
 * share one line. A headline takes at most two lines (a fixed two-line box, clamped with an ellipsis: nothing is
 * measured). Both configured columns are always drawn, and each carries its own state: loading or "no data" inside it,
 * a feed that fails keeps its last stories and says so in its own column only. Feed text reaches the page only through
 * Html.esc. */
var NewsView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  function init(el) {
    el.innerHTML = Html.screenHead(I18n.t('screen.news'), 'news-status') + '<div class="screen-body news-body" id="news-body"></div>';
    els = { body: el.querySelector('#news-body'), status: el.querySelector('#news-status') };
    drawn = '';
  }

  // The time (and a column's own state line) is in the interface language: it keeps its own direction inside a
  // right-to-left column ("1 мин назад", "Загружаем новости…" with its ellipsis at the end).
  function rowHtml(item, now) {
    return '<div class="news-row"><div class="news-time" dir="' + I18n.dir() + '">' + esc(I18n.ago(now - item.at)) + '</div><div class="news-title">' + esc(item.title) + '</div></div>';
  }

  // c: { id, source, dir ('rtl' for Hebrew headlines), items, kind, updated ("HH:MM") }; rows: the slot count, so a
  // short column keeps the grid. The column's head stays in the interface language; only its headlines take `dir`.
  function columnHtml(c, now, rows) {
    var body = '', i;
    if (!c.items.length) body = '<div class="news-col-empty" dir="' + I18n.dir() + '">' + esc(I18n.t(c.kind === 'failed' ? 'n.noData' : 'n.loading')) + '</div>';
    else for (i = 0; i < rows; i++) body += c.items[i] ? rowHtml(c.items[i], now) : '<div class="news-row"></div>';
    return '<section class="card news-col"><div class="news-col-head"><span class="src-dot src-' + esc(c.source) + '"></span>' +
      '<span class="news-col-title">' + esc(I18n.t('n.col.' + c.id)) + '</span><span class="src-name">' + esc(I18n.t('n.src.' + c.source)) + '</span>' +
      (c.kind === 'stale' ? '<span class="news-col-state">' + esc(I18n.t('w.stale', { time: c.updated })) + '</span>' : '') + '</div>' +
      '<div class="news-rows"' + (c.dir ? ' dir="' + esc(c.dir) + '"' : '') + '>' + body + '</div></section>';
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

  // columns: [{ id, source, dir, items (newest first, at most `rows`), kind, updated }].
  // s: { kind, updated ("HH:MM", the newest answer), retryAt ("HH:MM"|'') }.
  // Redrawn only when the stories, their "… ago" texts or a state changed.
  function render(columns, s, now, rows) {
    var key = [s.kind, s.retryAt, I18n.lang()], i, j;
    for (i = 0; i < columns.length; i++) {
      key.push(columns[i].kind, columns[i].updated);
      for (j = 0; j < columns[i].items.length; j++) key.push(columns[i].items[j].key + columns[i].items[j].title + I18n.ago(now - columns[i].items[j].at));
    }
    key = key.join('|');
    if (key !== drawn) {
      drawn = key;
      var html = '';
      for (i = 0; i < columns.length; i++) html += columnHtml(columns[i], now, rows);
      els.body.innerHTML = html;
    }
    var st = statusOf(columns, s);
    Html.setStatus(els.status, 'status screen-status', st.kind, st.text);
  }

  return { init: init, render: render };
})();
