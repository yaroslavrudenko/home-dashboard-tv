/* The Markets screen: six glass cards on one grid, in the MarketsSnapshot's group order — currencies, US shares, Israeli
 * shares on the first line; crypto, US indices, commodities on the second. A card: its title, then one row per quote on
 * ONE numeric grid — the name; the price, right-aligned, every price of a card to the same number of places (the
 * currencies 4, everything else 2) so the decimal separators stand in one column, its currency sign right after the
 * number in a fixed box inside the same cell; the day's change (a soft green ▲ / soft red ▼ in a fixed arrow slot, a muted «—» when the source gives none).
 * A quote without a price says «нет данных» in its own row, never dropped; a card with no price at all says it once,
 * amber, in its head, and «—» in its rows. A closed market is said in the card's head, never in a row: «закрыто» when
 * every priced quote with trading hours is closed, «частично закрыто» when some are (a daily rate has no hours: it never
 * counts); each closed price is dimmed. A commodity says what its price is for as a quiet suffix of its name, on the
 * same line («Brent · баррель», N2). When no
 * card has a price at all, the screen says it once, calmly, in one card in their place (L8); a partial failure keeps the
 * per-card note. Until the first snapshot every card keeps its row slots as placeholders, so
 * nothing moves when the data arrives. A quote the last round could not refresh (row.stale) keeps its last value,
 * quietly dimmed. The sign is the row's currency (indices come with none). A card is rewritten only when what it shows
 * changed; the same snapshot again (the minute tick) is not even compared. Prices and changes stay left to right inside
 * Hebrew (I18n.ltr). The header says what the markets controller decided (kind). Never fetches. ES5. */
var MarketsView = (function () {
  var esc = Html.esc;
  var SYMBOL = { USD: '$', ILS: '₪', UAH: '₴', RUB: '₽', EUR: '€' };
  // Decimal places, and the prices that pick them: the currencies always WIDE (the source's own four digits); the indices
  // and crypto always NARROW (FIX-11B-B1a: TRX «0,32» included); a share or commodity under SMALL WIDE (two places would
  // read 0,20 for a price of 0,1987), from BIG up none, else NARROW.
  var WIDE = 4, NARROW = 2, WHOLE = 0, SMALL = 1, BIG = 10000;
  var DASH = '—';
  var EMPTY_ROW = '<div class="mk-row is-empty"><div class="skeleton"></div></div>';
  var els = {}, layout = [], drawn = {}, lastSnapshot = null, lastLang = '';

  // groups: [{ id, rows }] in screen order; rows: the card's slot count, kept by the placeholders before the first data.
  function init(el, groups) {
    var cards = '';
    for (var i = 0; i < groups.length; i++) cards += '<section class="card mk-card" id="mk-' + esc(groups[i].id) + '"></section>';
    el.innerHTML = Html.screenHead('screen.markets', 'markets-status') + '<div class="screen-body mk-body" id="mk-body">' + cards +
      '<section class="card mk-none" id="mk-none"></section></div>';
    els = { status: el.querySelector('#markets-status'), body: el.querySelector('#mk-body'), none: el.querySelector('#mk-none'), cards: {} };
    for (i = 0; i < groups.length; i++) els.cards[groups[i].id] = el.querySelector('#mk-' + groups[i].id);
    layout = groups;
    drawn = {};
    lastSnapshot = null;
  }

  function priced(row) { return Num.finite(row.price); }
  // A symbol the strings do not name yet is shown as itself, never as the raw key.
  function rowName(id) { return I18n.tOr('markets.row.' + id, id); }
  function decimals(groupId, price) {
    var a = Math.abs(price);
    if (groupId === 'indices' || groupId === 'crypto') return NARROW;
    if (groupId === 'fx') return WIDE;
    if (a < SMALL) return WIDE;
    return a < BIG ? NARROW : WHOLE;
  }
  // The currency sign, in its box right after the number (FIX-11B-B1b); none for a level in points (currency null).
  function signHtml(currency) { return SYMBOL[currency] ? '<span class="mk-sign">' + esc(SYMBOL[currency]) + '</span>' : ''; }
  // The change as shown, rounded first: −0.004 % reads 0,00 % with no arrow and no colour. The arrow slot is always there.
  function changeHtml(pct) {
    if (typeof pct !== 'number' || !isFinite(pct)) return '<span class="mk-chg is-none"><span class="mk-arrow"></span><span class="mk-pct">' + DASH + '</span></span>';
    var r = Math.round(pct * 100) / 100, dir = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
    var text = (r > 0 ? '+' : r < 0 ? '−' : '') + I18n.number(Math.abs(r), 2) + '%';
    return '<span class="mk-chg is-' + dir + '"><span class="mk-arrow"></span><span class="mk-pct">' + esc(I18n.ltr(text)) + '</span></span>';
  }
  // c: { id (group), none (no price in the whole card), sign (the card's one currency, said in its head: no sign per row) }
  function rowHtml(c, row) {
    var name = '<span class="mk-name">' + esc(rowName(row.id)) + (row.unit ? '<span class="mk-per"> · ' + esc(I18n.t('markets.unit.' + row.unit)) + '</span>' : '') + '</span>';
    if (!priced(row)) return '<div class="mk-row is-nodata">' + name + '<span class="mk-nodata">' + esc(c.none ? DASH : ViewState.partText('none')) + '</span>' +
      '<span class="mk-chg"></span></div>';
    return '<div class="mk-row' + (row.closed === true ? ' is-closed' : '') + (row.stale ? ' is-stale' : '') + '">' + name +
      '<span class="mk-price">' + esc(I18n.ltr(I18n.number(row.price, decimals(c.id, row.price)))) + (c.sign ? '' : signHtml(row.currency)) + '</span>' +
      changeHtml(row.changePct) + '</div>';
  }
  // The head's closed mark: the key of «закрыто» when every priced quote with trading hours is closed, of «частично
  // закрыто» when some are, '' else. A daily rate (closed: null) has no hours and never counts.
  function closedKey(rows) {
    var hours = 0, closed = 0;
    for (var i = 0; i < rows.length; i++) if (priced(rows[i]) && typeof rows[i].closed === 'boolean') { hours++; if (rows[i].closed) closed++; }
    return !closed ? '' : closed === hours ? 'markets.closed' : 'markets.partlyClosed';
  }
  function headHtml(id, markKey, none, sign) {
    return '<div class="mk-head"><span class="mk-title">' + esc(I18n.t('markets.group.' + id)) + '</span>' + (sign ? '<span class="mk-head-sign"> · ' + esc(sign) + '</span>' : '') +
      (none ? '<span class="mk-state">' + esc(ViewState.partText('none')) + '</span>' : markKey ? '<span class="mk-closed">' + esc(I18n.t(markKey)) + '</span>' : '') + '</div>';
  }
  // A card whose rows say what they are priced per (the commodities: «Brent · барр.») and all in one currency says that
  // currency once, in its head («Сырьё · $»), so each name has the room for its unit on one line (N2).
  function cardSign(rows) {
    var cur = null;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].unit) return '';
      if (!priced(rows[i])) continue;
      if (cur !== null && rows[i].currency !== cur) return '';
      cur = rows[i].currency;
    }
    return cur && SYMBOL[cur] ? SYMBOL[cur] : '';
  }
  function cardHtml(group) {
    var c = { id: group.id, none: true, sign: cardSign(group.rows) }, rows = '', i;
    for (i = 0; i < group.rows.length; i++) if (priced(group.rows[i])) c.none = false;
    for (i = 0; i < group.rows.length; i++) rows += rowHtml(c, group.rows[i]);
    return headHtml(group.id, closedKey(group.rows), c.none, c.sign) + '<div class="mk-rows">' + rows + '</div>';
  }
  function placeholderHtml(slot) {
    var rows = '';
    for (var i = 0; i < slot.rows; i++) rows += EMPTY_ROW;
    return headHtml(slot.id, '', false) + '<div class="mk-rows">' + rows + '</div>';
  }


  // No price in any card (L8): the one calm card instead of six that each say it.
  function nothingAt(snapshot) {
    if (!snapshot) return false;
    for (var i = 0; i < snapshot.groups.length; i++) for (var j = 0; j < snapshot.groups[i].rows.length; j++) if (priced(snapshot.groups[i].rows[j])) return false;
    return true;
  }
  // failed: nothing came and the last attempt failed — the block, never the placeholders (L5).
  function drawCards(snapshot, failed) {
    var byId = {}, i, none = nothingAt(snapshot) || (!snapshot && failed), cls = 'screen-body mk-body' + (none ? ' is-none' : '');
    if (els.body.className !== cls) els.body.className = cls;
    if (none) { els.none.innerHTML = ViewState.block('failed', { glyph: Icons.glyph('chart'), retryAt: '' }); return; }
    if (snapshot) for (i = 0; i < snapshot.groups.length; i++) byId[snapshot.groups[i].id] = snapshot.groups[i];
    for (i = 0; i < layout.length; i++) {
      var slot = layout[i], group = byId[slot.id], key = (group ? JSON.stringify(group.rows) : 'none') + '|' + I18n.lang();
      if (drawn[slot.id] === key) continue;
      drawn[slot.id] = key;
      els.cards[slot.id].innerHTML = group ? cardHtml(group) : placeholderHtml(slot);
      els.cards[slot.id].className = 'card mk-card' + (group ? '' : ' is-empty');
    }
  }

  // snapshot: MarketsSnapshot (js/markets.js) or null before the first data. s: { kind ('fresh' | 'stale' | 'loading' |
  // 'failed'), updated ("HH:MM" of the newest data shown, at home) }.
  function render(snapshot, s) {
    if (!snapshot || snapshot !== lastSnapshot || I18n.lang() !== lastLang) {
      lastSnapshot = snapshot;
      lastLang = I18n.lang();
      drawCards(snapshot, s.kind === 'failed');
    }
    // the header speaks only for the data on screen (B17, D-A1; ViewState.headText says nothing without a time); loading is
    // the slots' placeholders, a failure with nothing to show is the one calm block (L8)
    ViewState.head(els.status, s.kind, s.updated);
  }

  return { init: init, render: render };
})();
