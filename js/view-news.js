/* The News screen: one lead story across the top, the next headlines below in rows of two (read left to right, newest
 * first). Headlines are never cut or ellipsised: a long lead steps its size down (at most twice) and drops its
 * summary; headlines that do not fit leave whole rows out (the count gives way, not the words). One story: the lead
 * alone; two: the second across the full width. Feed text reaches the page only through Html.esc. */
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

  function leadHtml(item, now, alone) {
    return '<article class="card lead src-' + esc(item.source) + (alone ? ' is-alone' : '') + '"><div class="lead-glow"></div>' + meta(item, now) +
      '<div class="lead-title">' + esc(item.title) + '</div>' +
      (item.summary ? '<div class="lead-summary">' + esc(item.summary) + '</div>' : '') + '</article>';
  }

  function itemHtml(item, now) { return '<div class="news-item">' + meta(item, now) + '<div class="news-title">' + esc(item.title) + '</div></div>'; }

  // Rows of two in reading order, a rule over each row; `fitting` packs the rows to the top while they are measured.
  function listHtml(items, now, fitting) {
    var rows = '';
    for (var i = 0; i < items.length; i += 2) rows += '<div class="news-row">' + itemHtml(items[i], now) + (items[i + 1] ? itemHtml(items[i + 1], now) : '') + '</div>';
    return '<section class="card news-list' + (items.length === 1 ? ' is-single' : '') + (fitting ? ' is-fitting' : '') + '">' + rows + '</section>';
  }

  function emptyHtml(kind, retryAt) {
    var failed = kind === 'failed';
    return '<div class="card news-empty"><div class="empty-state">' + Icons.glyph('news') +
      '<div class="empty-text">' + esc(I18n.t(failed ? 'n.failed' : 'n.loading')) + '</div>' +
      (failed ? '<div class="empty-sub">' + esc(retryAt ? I18n.t('w.retry', { time: retryAt }) : I18n.t('w.retrySoon')) + '</div>' : '') + '</div></div>';
  }

  function overflows(el) { return el.scrollHeight > el.clientHeight + 1; }

  // A lead headline longer than three lines steps down to 48 px, then 40 px, and gives its summary's room to the
  // title (css/app.css holds the three-line limits). Two steps at most, one height read per step.
  function fitLead(lead) {
    var title = lead.querySelector('.lead-title');
    if (!overflows(title)) return;
    lead.className += ' is-long';
    if (overflows(title)) lead.className += ' is-xlong';
  }
  // Drops the oldest whole row until the list fits (one row always stays), then lets the rows spread out.
  function fitList(shown, now) {
    var n = shown.length, list = els.body.querySelector('.news-list');
    while (n > 2 && overflows(list)) {
      n -= n % 2 ? 1 : 2;
      list.outerHTML = listHtml(shown.slice(0, n), now, true);
      list = els.body.querySelector('.news-list');
    }
    list.className = list.className.replace(' is-fitting', '');
  }

  // items: merged stories, newest first.
  // s: { kind, failedNames: [names of sources not current], feedCount, updated ("HH:MM"), retryAt ("HH:MM"|'') }.
  // Redrawn (and measured) only when the stories, their "… ago" texts or the state changed.
  function render(items, s, now, listSize) {
    var shown = items.slice(0, 1 + listSize), key = [s.kind, s.retryAt];
    for (var i = 0; i < shown.length; i++) key.push(shown[i].key + shown[i].title + I18n.ago(now - shown[i].at));
    key = key.join('|');
    if (key !== drawn) {
      drawn = key;
      if (!shown.length) els.body.innerHTML = emptyHtml(s.kind, s.retryAt);
      else {
        var rest = shown.slice(1);
        els.body.innerHTML = leadHtml(shown[0], now, !rest.length) + (rest.length ? listHtml(rest, now, true) : '');
        fitLead(els.body.querySelector('.lead'));
        if (rest.length) fitList(rest, now);
      }
    }
    // Some sources failing while others are current: say which; otherwise the same words as the weather.
    var partial = s.kind === 'stale' && s.failedNames.length && s.failedNames.length < s.feedCount;
    Html.setStatus(els.status, 'status screen-status', s.kind,
      partial ? I18n.t('n.partial', { time: s.updated, sources: s.failedNames.join(', ') }) : View.statusText(s.kind, s.updated));
  }

  return { init: init, render: render };
})();
