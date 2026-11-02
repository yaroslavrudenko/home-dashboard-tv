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

  // Batch 12: the air chip at the end of the head — the air glyph and one word: the level's, or «хамсин» when the dust is
  // high (even with no AQI: FIX-12B V12) in the dust colour; otherwise the level's colour. Before the first air
  // answer an empty reserved box; nothing to say: no chip; stale: dimmed. What it shows, as data: { cls, word } | null —
  // the card's key is made of this, never of the raw numbers (V13: AQI 31 → 39, both «приемлемое», redraws nothing).
  function chipOf(card) {
    var a = card.air || null;
    if (!a && (card.airKind === 'loading' || card.airKind === undefined)) return { cls: 'is-reserved', word: '' };
    if (!a || (a.level === null && !a.dustHigh)) return null;
    return { cls: 'lv-' + (a.dustHigh || !a.level ? 'dust' : a.level) + (card.airKind === 'stale' ? ' is-stale' : ''), word: a.dustHigh ? 'w.air.khamsinWord' : 'w.air.' + a.level };
  }
  // The air, labelled on its own line under the head («Воздух: приемлемое» — the owner: «должно быть понятно»); the line is
  // there in every state (empty while there is nothing to say), so nothing below it moves when the air arrives.
  function airLine(chip) {
    if (!chip || !chip.word) return '<div class="region-air is-reserved"></div>';
    return '<div class="region-air ' + chip.cls + '"><span class="region-air-label">' + esc(I18n.t('w.airShort')) + '</span> <span class="region-air-word">' +
      esc(I18n.t(chip.word)) + '</span></div>';
  }
  function headHtml(r, card) {
    return '<div class="region-head"><span class="region-name">' + esc(I18n.t('r.' + r.id)) + '</span><span class="region-city">' + esc(I18n.t('place.' + r.place)) + '</span>' +
      '</div>' + airLine(chipOf(card));
  }
  // The sub lines (L10): feels-like and the wind, each on its own line in every language (a two-line box of fixed height,
  // so the days below start on one line across the cards, and no «·» is left hanging at a line's end); a part never breaks
  // inside ("км/год" is one word).
  function part(text) { return '<div class="region-part">' + esc(text) + '</div>'; }
  function nowHtml(c) {
    var sub = [];
    if (c.feels !== null) sub.push(part(I18n.t('w.feels', { t: View.temp(c.feels) })));
    if (c.wind !== null) sub.push(part(I18n.t('w.wind') + ' ' + Math.round(c.wind) + ' ' + I18n.t('w.kmh')));
    return '<div class="region-now"><div class="region-temp">' + View.temp(c.temp) + '</div><div class="region-icon">' + Icons.weather(c.code, c.isDay) + '</div></div>' +
      '<div class="region-cond">' + esc(I18n.condition(c.code)) + '</div><div class="region-sub">' + sub.join('') + '</div>';
  }

  // card: { region, view (Weather.forHour, the days cut to the screen's count) or null, kind, retryAt, air (Air.summary or
  // null), airKind, dust (batch 13: the days' dust forecast, View.dailyHtml) }.
  function cardHtml(card, days) {
    var v = card.view;
    if (!v) return headHtml(card.region, card) + Html.emptyState(Icons.weather(3, true), I18n.t(card.kind === 'failed' ? 'w.failed' : 'w.loading'),
      card.kind === 'failed' ? Html.retryText(card.retryAt) : '');
    return headHtml(card.region, card) + nowHtml(v.current) + View.dustTitle(I18n.t('w.days', { n: days }), View.dustLabel('w.dustMax'), View.dustLegend(card.dust, card.dust && card.dust.days)) +
      '<div class="days">' + View.dailyHtml(v, card.dust) + '</div>';
  }

  // cards: in screen order; key: what each card shows as a string (an unchanged card is not rewritten: icons carry
  // unique mask ids, so the HTML itself cannot be compared). status: { kind, updated ("HH:MM", "DD.MM HH:MM" on another day),
  // source (batch 15: 'met' when MET Norway's data are shown) } for the header.
  function render(cards, days, status) {
    for (var i = 0; i < cards.length; i++) {
      // the chip and the days' dust are part of what the card shows: what they show (not the raw air numbers) is in the key
      var c = cards[i], key = c.key + '|' + JSON.stringify(chipOf(c)) + '|' + JSON.stringify(c.dust) + '|' + I18n.lang();
      if (drawn[c.region.id] === key) continue;
      drawn[c.region.id] = key;
      var el = els.el.querySelector('#region-' + c.region.id);
      el.innerHTML = cardHtml(c, days);
      el.className = 'card region' + (c.kind === 'stale' ? ' is-stale' : c.view ? '' : ' is-empty');
    }
    Html.setStatus(els.status, 'status screen-status', status.kind, Html.statusText(status.kind, status.updated, status.source));
  }

  return { init: init, render: render };
})();
