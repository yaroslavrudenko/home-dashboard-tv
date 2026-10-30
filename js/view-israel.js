/* The Israel weather screen: one glass card per region («Север», «Центр», «Юг»), side by side on the clocks' grid. Each
 * card: the region and its city, the temperature now with its condition icon, feels-like and wind, and the next days
 * with the same range bars as the main 7-day list (View.dailyHtml). A region without data says so in its own card;
 * stale data is dimmed, and the header says it once. The data is the main weather's: the same request. ES5. */
var IsraelView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = {};

  // regions: [{ id, place }] in screen order.
  function init(el, regions) {
    var cards = '';
    for (var i = 0; i < regions.length; i++) cards += '<section class="card region" id="region-' + esc(regions[i].id) + '"></section>';
    el.innerHTML = Html.screenHead('screen.israel', 'israel-status') + '<div class="screen-body israel-body">' + cards + '</div>';
    els = { el: el, status: el.querySelector('#israel-status') };
    drawn = {};
  }

  function headHtml(r) {
    return '<div class="region-head"><span class="region-name">' + esc(I18n.t('r.' + r.id)) + '</span><span class="region-city">' + esc(I18n.t('place.' + r.place)) + '</span></div>';
  }
  // The sub line's parts never break inside ("км/год" is one word); a line too long for the card wraps between them.
  function part(text) { return '<span class="region-part">' + esc(text) + '</span>'; }
  function nowHtml(c) {
    var sub = [];
    if (c.feels !== null) sub.push(part(I18n.t('w.feels', { t: View.temp(c.feels) })));
    if (c.wind !== null) sub.push(part(I18n.t('w.wind') + ' ' + Math.round(c.wind) + ' ' + I18n.t('w.kmh')));
    return '<div class="region-now"><div class="region-temp">' + View.temp(c.temp) + '</div><div class="region-icon">' + Icons.weather(c.code, c.isDay) + '</div></div>' +
      '<div class="region-cond">' + esc(I18n.condition(c.code)) + '</div><div class="region-sub">' + sub.join(' · ') + '</div>';
  }

  // card: { region, view (Weather.forHour, the days cut to the screen's count) or null, kind, retryAt }.
  function cardHtml(card, days) {
    var v = card.view;
    if (!v) return headHtml(card.region) + Html.emptyState(Icons.weather(3, true), I18n.t(card.kind === 'failed' ? 'w.failed' : 'w.loading'),
      card.kind === 'failed' ? Html.retryText(card.retryAt) : '');
    return headHtml(card.region) + nowHtml(v.current) + '<div class="card-title region-days-title">' + esc(I18n.t('w.days', { n: days })) + '</div>' +
      '<div class="days">' + View.dailyHtml(v) + '</div>';
  }

  // cards: in screen order; key: what each card shows as a string (an unchanged card is not rewritten: icons carry
  // unique mask ids, so the HTML itself cannot be compared). status: { kind, updated ("HH:MM") } for the header.
  function render(cards, days, status) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], key = c.key + '|' + I18n.lang();
      if (drawn[c.region.id] === key) continue;
      drawn[c.region.id] = key;
      var el = els.el.querySelector('#region-' + c.region.id);
      el.innerHTML = cardHtml(c, days);
      el.className = 'card region' + (c.kind === 'stale' ? ' is-stale' : c.view ? '' : ' is-empty');
    }
    Html.setStatus(els.status, 'status screen-status', status.kind, View.statusText(status.kind, status.updated));
  }

  return { init: init, render: render };
})();
