/* The News screen: one lead story across the top, the next headlines in two columns below. ES5.
 * Headlines are never cut or ellipsised: when they do not fit, fewer stories are shown (the count gives way, not
 * the words). Feed text reaches the page only through Html.esc. */
var NewsView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  function init(el) {
    el.innerHTML = Html.screenHead(I18n.t('screen.news'), 'news-status') + '<div class="screen-body news-body" id="news-body"></div>';
    els = { body: el.querySelector('#news-body'), status: el.querySelector('#news-status') };
    drawn = '';
  }

  function meta(item, now) {
    return '<div class="news-meta"><span class="src-dot src-' + esc(item.source) + '"></span><span class="src-name">' +
      esc(I18n.t('n.src.' + item.source)) + '</span><span class="news-time">' + esc(I18n.ago(now - item.at)) + '</span></div>';
  }

  function leadHtml(item, now) {
    return '<article class="card lead src-' + esc(item.source) + '"><div class="lead-glow"></div>' + meta(item, now) +
      '<div class="lead-title">' + esc(item.title) + '</div>' +
      (item.summary ? '<div class="lead-summary">' + esc(item.summary) + '</div>' : '') + '</article>';
  }

  function itemHtml(item, now) { return '<div class="news-item">' + meta(item, now) + '<div class="news-title">' + esc(item.title) + '</div></div>'; }

  // Two columns, filled top to bottom: the first holds the newer half.
  function listHtml(items, now) {
    var half = Math.ceil(items.length / 2), cols = ['', ''];
    for (var i = 0; i < items.length; i++) cols[i < half ? 0 : 1] += itemHtml(items[i], now);
    return '<section class="card news-list"><div class="news-col">' + cols[0] + '</div><div class="news-col">' + cols[1] + '</div></section>';
  }

  function emptyHtml(kind, retryAt) {
    var failed = kind === 'failed';
    return '<div class="card news-empty"><div class="empty-state">' + Icons.glyph('news') +
      '<div class="empty-text">' + esc(I18n.t(failed ? 'n.failed' : 'n.loading')) + '</div>' +
      (failed ? '<div class="empty-sub">' + esc(retryAt ? I18n.t('w.retry', { time: retryAt }) : I18n.t('w.retrySoon')) + '</div>' : '') + '</div></div>';
  }

  function overflows(el) { return el.scrollHeight > el.clientHeight + 1; }

  // items: merged stories, newest first.
  // s: { kind, failedNames: [names of sources not current], feedCount, updated ("HH:MM"), retryAt ("HH:MM"|'') }.
  // Redrawn only when the stories, their "… ago" texts or the state changed.
  function render(items, s, now, listSize) {
    var shown = items.slice(0, 1 + listSize), key = [s.kind, s.retryAt];
    for (var i = 0; i < shown.length; i++) key.push(shown[i].key + shown[i].title + I18n.ago(now - shown[i].at));
    key = key.join('|');
    if (key !== drawn) {
      drawn = key;
      if (!shown.length) els.body.innerHTML = emptyHtml(s.kind, s.retryAt);
      else {
        var n = shown.length - 1;
        els.body.innerHTML = leadHtml(shown[0], now) + listHtml(shown.slice(1), now);
        // Fit by count: drop the oldest headline until both columns fit (at least two stay).
        var list = els.body.querySelector('.news-list');
        while (n > 2 && (overflows(list.children[0]) || overflows(list.children[1]))) {
          n--;
          list.outerHTML = listHtml(shown.slice(1, 1 + n), now);
          list = els.body.querySelector('.news-list');
        }
      }
    }
    // Some sources failing while others are current: say which; otherwise the same words as the weather.
    var partial = s.kind === 'stale' && s.failedNames.length && s.failedNames.length < s.feedCount;
    Html.setStatus(els.status, 'status screen-status', s.kind,
      partial ? I18n.t('n.partial', { time: s.updated, sources: s.failedNames.join(', ') }) : View.statusText(s.kind, s.updated));
  }

  return { init: init, render: render };
})();
