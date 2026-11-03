/* The traffic map screen: one glass card holding ONE image of the live traffic (Mapbox Static Images, traffic-night-v2),
 * a small home dot on the home city with the city's name beside it, a key of the traffic colours (the same words as the
 * traffic screen's chips) and the attribution Mapbox requires («© Mapbox © OpenStreetMap»). The image is loaded by the
 * App (js/app.js createMap: Net.getImage with a deadline — this view never touches the network, A3) and handed to
 * showImage() once it has loaded, so a failed refresh keeps the last one on screen and the header says «Не обновляется
 * · данные от HH:MM». Until the first image is in, the one state block in the middle of the card says it is loading (or
 * unavailable); the dot, its name and the key wait for the image.
 * Without a Mapbox token: the same calm invitation as the traffic screen. ES5. */
var MapView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  function init(el) {
    el.innerHTML = Html.screenHead('screen.map', 'map-status') + '<div class="screen-body map-body" id="map-body"><div class="card map-card no-image" id="map-card">' +
      '<div class="map-layer" id="map-image"></div><div class="map-home" id="map-home"></div><div class="map-home-name" id="map-home-name"></div>' +
      '<div class="map-key" id="map-key"></div><div class="map-attribution">© Mapbox © OpenStreetMap</div><div class="map-state" id="map-state"></div></div></div>';
    els = { body: el.querySelector('#map-body'), card: el.querySelector('#map-card'), image: el.querySelector('#map-image'),
      home: el.querySelector('#map-home'), homeName: el.querySelector('#map-home-name'), key: el.querySelector('#map-key'),
      note: el.querySelector('#map-state'), status: el.querySelector('#map-status') };
    drawn = '';
  }

  // The card's inner size, read once (the layout never changes while the app runs).
  function size() { return { width: els.card.clientWidth, height: els.card.clientHeight }; }

  // Puts the home dot, and its name just right of it, at { x, y } (fractions of the image); both stay hidden when the point
  // falls outside the image.
  function home(at) {
    var inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
    var place = inside ? 'display:block;left:' + (at.x * 100).toFixed(2) + '%;top:' + (at.y * 100).toFixed(2) + '%' : '';
    els.home.style.cssText = place;
    els.homeName.style.cssText = place;
  }

  // A loaded image replaces the one on screen.
  function showImage(img) {
    img.className = 'map-img';
    els.image.innerHTML = '';
    els.image.appendChild(img);
    els.card.className = 'card map-card';
  }
  // The key of the traffic colours: one swatch and its word per level (the words of the traffic screen's chips, L16).
  var LEVELS = ['ok', 'slow', 'jam'];
  function keyHtml() {
    var out = '';
    for (var i = 0; i < LEVELS.length; i++) out += '<span class="map-key-item"><span class="map-key-line lv-' + LEVELS[i] + '"></span>' + esc(I18n.t('t.level.' + LEVELS[i])) + '</span>';
    return out;
  }

  // No token: the calm invitation. Drawn once per language.
  function renderNoKey() {
    if (drawn === 'nokey' + I18n.lang()) return;
    drawn = 'nokey' + I18n.lang();
    els.body.innerHTML = ViewState.noKeyCard();
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // st: TrafficMap controller state { kind, updatedAt }; updated: "HH:MM" of the image on screen; homeName: the home
  // city in the interface language (the dot's label). With no image yet the card says it is loading or unavailable; with
  // one, a failed or old refresh turns the header amber.
  function render(st, updated, homeName) {
    var note = st.kind === 'loading' || st.kind === 'failed' ? st.kind : '';
    var key = [note, homeName, I18n.lang()].join('|');
    if (key !== drawn) {
      drawn = key;
      // the one state block, over the card; failed: the car glyph like every large card (FIX-17B 8) and «Повторим позже» (the
      // map asks again on its own cadence while on view)
      els.note.innerHTML = note ? ViewState.block(note, { retryAt: '', glyph: note === 'failed' ? Icons.glyph('car') : '' }) : '';
      els.note.className = note ? 'map-state is-on' : 'map-state';
      els.homeName.textContent = homeName;
      els.key.innerHTML = keyHtml();
    }
    ViewState.head(els.status, st.kind, updated);
  }

  return { init: init, size: size, home: home, showImage: showImage, render: render, renderNoKey: renderNoKey };
})();
