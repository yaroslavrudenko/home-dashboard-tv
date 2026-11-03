/* One state component and one vocabulary for every screen (batch 17, D-A1 / L7). The rule, said once:
 *  1. The header line speaks for the data on screen: fresh «Обновлено в HH:MM» or stale «Не обновляется · данные от
 *     HH:MM», with details after « · » (the source, the age). With nothing on screen the header is empty.
 *  2. A container with nothing to show holds ONE block: loading «Загрузка…» (muted), or failed «Временно недоступно»
 *     (amber) with «Повторим в HH:MM» (or «Повторим позже»). A large card gives it a glyph.
 *  3. A part that differs from the header says it in one word: «данные от HH:MM» or «нет данных».
 * kind: 'fresh' | 'stale' | 'loading' | 'failed' | 'none' — the sources decide it (Freshness), never this module. ES5. */
var ViewState = (function () {
  var esc = Html.esc;
  // The one joiner of a status line's parts (SSOT: the header, the main status's short forms).
  var SEP = ' · ';
  function join(parts) { return parts.join(SEP); }
  // details: already-translated strings (the source's name, the age), joined by « · ». No time: nothing (a sentence is
  // never left without its time, FIX-17B 3).
  function headText(kind, time, details) {
    var text = !time ? '' : kind === 'fresh' ? I18n.t('st.fresh', { time: time }) : kind === 'stale' ? I18n.t('st.stale', { time: time }) : '';
    return text && details && details.length ? join([text].concat(details)) : text;
  }
  function head(el, kind, time, details) { Html.setStatus(el, 'status screen-status', kind, headText(kind, time, details)); }
  // opts: { glyph (svg html), retryAt ("HH:MM" | ''), text (a screen's own fact instead of the state word), sub (its second
  // line; '' for none) }. Failed says when it is tried again, unless its own text says so.
  function block(kind, opts) {
    var o = opts || {};
    var text = o.text || (kind === 'loading' ? I18n.t('st.loading') : kind === 'failed' ? I18n.t('st.failed') : '');
    var sub = o.sub !== undefined ? o.sub : kind === 'failed' && !o.text ? (o.retryAt ? I18n.t('st.retry', { time: o.retryAt }) : I18n.t('st.retrySoon')) : '';
    return '<div class="state is-' + kind + '">' + (o.glyph || '') + '<div class="state-text">' + esc(text) + '</div>' +
      (sub ? '<div class="state-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function partText(kind, time) { return kind === 'stale' ? I18n.t('st.partStale', { time: time }) : kind === 'none' ? I18n.t('st.noData') : ''; }
  // A screen with nothing to show: one calm card holding the block.
  function card(kind, opts) { return '<div class="card state-card">' + block(kind, opts) + '</div>'; }
  // The one Mapbox invitation, shared by the traffic and the map screens (no token: they send nothing).
  function noKeyCard() { return card('none', { glyph: Icons.glyph('car'), text: I18n.t('t.noKey'), sub: I18n.t('t.noKeySub') }); }
  return { join: join, headText: headText, head: head, block: block, partText: partText, card: card, noKeyCard: noKeyCard };
})();
