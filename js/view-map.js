/* The traffic map screen: one glass card holding the base map tiles, the traffic-flow overlay over them, a small home
 * dot on Rehovot and a legend. Tiles are plain <img> elements on a fixed grid (js/trafficmap.js computes it), each fetched
 * through Net.getImage with a deadline. A new layer replaces the old one only when all its tiles loaded, so a failed
 * refresh keeps the last one on screen. The overlay is hidden until the base map is in; while the card says something
 * (loading, unavailable) the home dot and the legend are hidden.
 * Without a TomTom key: the same calm invitation as the traffic screen. ES5. */
var MapView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  var LEVELS = ['ok', 'slow', 'jam'];             // the overlay's colours, in the traffic screen's words

  function legendHtml() {
    var out = '';
    for (var i = 0; i < LEVELS.length; i++) out += '<span class="map-key"><span class="map-swatch lv-' + LEVELS[i] + '"></span>' + esc(I18n.t('t.level.' + LEVELS[i])) + '</span>';
    return '<div class="map-legend">' + out + '</div>';
  }

  function init(el) {
    el.innerHTML = Html.screenHead(I18n.t('screen.map'), 'map-status') + '<div class="screen-body map-body" id="map-body"><div class="card map-card" id="map-card">' +
      '<div class="map-layer" id="map-base"></div><div class="map-layer" id="map-flow"></div><div class="map-home"></div>' + legendHtml() +
      '<div class="map-note" id="map-note"></div></div></div>';
    els = { body: el.querySelector('#map-body'), card: el.querySelector('#map-card'), base: el.querySelector('#map-base'),
      flow: el.querySelector('#map-flow'), note: el.querySelector('#map-note'), status: el.querySelector('#map-status') };
    drawn = '';
  }

  // The card's inner size, read once per load (the layout never changes while the app runs).
  function size() { return { width: els.card.clientWidth, height: els.card.clientHeight }; }

  // One round of a layer. tiles: [{ url, left, top }], tileSize px, each tile given timeoutMs. done(ok) exactly once:
  // true when every tile loaded (onReady(imgs) first), false at the first tile that fails or runs out of time (the
  // others are stopped) or at once for an empty list. Returns cancel(): stops the round; done is not called after it.
  function load(tiles, tileSize, timeoutMs, onReady, done) {
    var handles = [], imgs = [], pending = tiles.length, over = false;
    function stop() { over = true; for (var i = 0; i < handles.length; i++) handles[i].cancel(); }
    function settle(err) {
      if (over) return;
      if (err) { stop(); done(false); return; }
      if (--pending) return;
      over = true;
      onReady(imgs);
      done(true);
    }
    for (var i = 0; i < tiles.length; i++) {
      var h = Net.getImage(tiles[i].url, timeoutMs, settle);
      h.img.className = 'map-tile';
      h.img.style.cssText = 'left:' + tiles[i].left + 'px;top:' + tiles[i].top + 'px;width:' + tileSize + 'px;height:' + tileSize + 'px';
      handles.push(h);
      imgs.push(h.img);
    }
    if (!tiles.length) { over = true; done(false); }
    return function () { if (!over) stop(); };
  }
  function show(layer) {
    return function (imgs) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < imgs.length; i++) frag.appendChild(imgs[i]);
      layer.innerHTML = '';
      layer.appendChild(frag);
    };
  }
  function loadBase(tiles, tileSize, timeoutMs, done) { return load(tiles, tileSize, timeoutMs, show(els.base), done); }
  function loadFlow(tiles, tileSize, timeoutMs, done) { return load(tiles, tileSize, timeoutMs, show(els.flow), done); }

  // No key: the calm invitation. Drawn once.
  function renderNoKey() {
    if (drawn === 'nokey') return;
    drawn = 'nokey';
    els.body.innerHTML = Html.emptyCard('map-empty', Icons.glyph('car'), I18n.t('t.noKey'), I18n.t('t.noKeySub'));
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // st: TrafficMap controller state { kind, updatedAt, base }; updated: "HH:MM" of the overlay on screen.
  // Loading and a map that never loaded are said once in the middle of the card; a failed refresh over a loaded map
  // turns the header amber ("Карта недоступна · данные от …") and keeps the last overlay.
  function render(st, updated) {
    var note = st.kind === 'loading' ? I18n.t('m.loading') : st.kind === 'failed' ? I18n.t('m.unavailable') : '';
    var key = [note, st.base, I18n.lang()].join('|');
    if (key !== drawn) {
      drawn = key;
      els.note.innerHTML = note ? '<span class="map-note-text">' + esc(note) + '</span>' : '';
      els.note.className = note ? 'map-note is-on' : 'map-note';
      els.card.className = 'card map-card' + (note ? ' is-note' : '') + (st.base ? '' : ' no-base');
    }
    Html.setStatus(els.status, 'status screen-status', st.kind,
      st.kind === 'stale' ? I18n.t('t.dataFrom', { text: I18n.t('m.unavailable'), time: updated }) : View.statusText(st.kind, updated));
  }

  return { init: init, size: size, loadBase: loadBase, loadFlow: loadFlow, render: render, renderNoKey: renderNoKey };
})();
