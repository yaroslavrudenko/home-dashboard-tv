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

  // Batch 12: the air chip at the end of the head — the air glyph and one word: the level's, or «пыль» when the dust is
  // high (even with no AQI: FIX-12B V12); the colour is the level's (dust alone: the dust colour). Before the first air
  // answer an empty reserved box; nothing to say: no chip; stale: dimmed. What it shows, as data: { cls, word } | null —
  // the card's key is made of this, never of the raw numbers (V13: AQI 31 → 39, both «приемлемое», redraws nothing).
  function chipOf(card) {
    var a = card.air || null;
    if (!a && (card.airKind === 'loading' || card.airKind === undefined)) return { cls: 'is-reserved', word: '' };
    if (!a || (a.level === null && !a.dustHigh)) return null;
    return { cls: 'lv-' + (a.level || 'dust') + (card.airKind === 'stale' ? ' is-stale' : ''), word: a.dustHigh ? 'w.air.dustWord' : 'w.air.' + a.level };
  }
  function airChip(chip) {
    if (!chip) return '';
    return '<span class="region-air ' + chip.cls + '">' + (chip.word ? Icons.glyph('air') + '<span class="region-air-word">' + esc(I18n.t(chip.word)) + '</span>' : '') + '</span>';
  }
  function headHtml(r, card) {
    return '<div class="region-head"><span class="region-name">' + esc(I18n.t('r.' + r.id)) + '</span><span class="region-city">' + esc(I18n.t('place.' + r.place)) + '</span>' +
      airChip(chipOf(card)) + '</div>';
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

  // card: { region, view (Weather.forHour, the days cut to the screen's count) or null, kind, retryAt, air (Air.summary or
  // null), airKind }.
  function cardHtml(card, days) {
    var v = card.view;
    if (!v) return headHtml(card.region, card) + Html.emptyState(Icons.weather(3, true), I18n.t(card.kind === 'failed' ? 'w.failed' : 'w.loading'),
      card.kind === 'failed' ? Html.retryText(card.retryAt) : '');
    return headHtml(card.region, card) + nowHtml(v.current) + '<div class="card-title region-days-title">' + esc(I18n.t('w.days', { n: days })) + '</div>' +
      '<div class="days">' + View.dailyHtml(v) + '</div>';
  }

  // cards: in screen order; key: what each card shows as a string (an unchanged card is not rewritten: icons carry
  // unique mask ids, so the HTML itself cannot be compared). status: { kind, updated ("HH:MM") } for the header.
  function render(cards, days, status) {
    for (var i = 0; i < cards.length; i++) {
      // the chip is part of what the card shows: what it shows (not the raw air numbers) is in the key
      var c = cards[i], key = c.key + '|' + JSON.stringify(chipOf(c)) + '|' + I18n.lang();
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
