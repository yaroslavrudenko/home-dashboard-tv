/* The traffic map screen: one glass card holding ONE image of the live traffic (Mapbox Static Images, traffic-night-v2),
 * a small home dot on the home city and the attribution Mapbox requires («© Mapbox © OpenStreetMap»). The image is fetched
 * through Net.getImage with a deadline; a new one replaces the old one only once it has loaded, so a failed refresh keeps
 * the last one on screen and the header says «Карта недоступна · данные от HH:MM». Until the first image is in, a quiet
 * line in the middle of the card says it is loading (or unavailable); the dot waits for the image.
 * Without a Mapbox token: the same calm invitation as the traffic screen. ES5. */
var MapView = (function () {
  var esc = Html.esc;
  var els = {}, drawn = '';

  function init(el) {
    el.innerHTML = Html.screenHead('screen.map', 'map-status') + '<div class="screen-body map-body" id="map-body"><div class="card map-card no-image" id="map-card">' +
      '<div class="map-layer" id="map-image"></div><div class="map-home" id="map-home"></div>' +
      '<div class="map-attribution">© Mapbox © OpenStreetMap</div><div class="map-note" id="map-note"></div></div></div>';
    els = { body: el.querySelector('#map-body'), card: el.querySelector('#map-card'), image: el.querySelector('#map-image'),
      home: el.querySelector('#map-home'), note: el.querySelector('#map-note'), status: el.querySelector('#map-status') };
    drawn = '';
  }

  // The card's inner size, read once (the layout never changes while the app runs).
  function size() { return { width: els.card.clientWidth, height: els.card.clientHeight }; }

  // Puts the home dot at { x, y } (fractions of the image); it stays hidden when it falls outside the image.
  function home(at) {
    var inside = at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1;
    els.home.style.cssText = inside ? 'display:block;left:' + (at.x * 100).toFixed(2) + '%;top:' + (at.y * 100).toFixed(2) + '%' : '';
  }

  // One image: done(ok) exactly once unless cancelled; the loaded image replaces the one on screen. Returns cancel().
  function load(url, timeoutMs, done) {
    var h = Net.getImage(url, timeoutMs, function (err, img) {
      if (err === 'cancelled') return;
      if (!err) {
        img.className = 'map-img';
        els.image.innerHTML = '';
        els.image.appendChild(img);
        els.card.className = 'card map-card';
      }
      done(!err);
    });
    return h.cancel;
  }

  // No token: the calm invitation. Drawn once per language.
  function renderNoKey() {
    if (drawn === 'nokey' + I18n.lang()) return;
    drawn = 'nokey' + I18n.lang();
    els.body.innerHTML = Html.emptyCard('map-empty', Icons.glyph('car'), I18n.t('t.noKey'), I18n.t('t.noKeySub'));
    Html.setStatus(els.status, 'status screen-status', 'none', '');
  }

  // st: TrafficMap controller state { kind, updatedAt }; updated: "HH:MM" of the image on screen. With no image yet the
  // card says it is loading or unavailable; with one, a failed or old refresh turns the header amber.
  function render(st, updated) {
    var note = st.kind === 'loading' ? I18n.t('m.loading') : st.kind === 'failed' ? I18n.t('m.unavailable') : '';
    var key = [note, I18n.lang()].join('|');
    if (key !== drawn) {
      drawn = key;
      els.note.innerHTML = note ? '<span class="map-note-text">' + esc(note) + '</span>' : '';
      els.note.className = note ? 'map-note is-on' : 'map-note';
    }
    Html.setStatus(els.status, 'status screen-status', st.kind,
      st.kind === 'stale' ? I18n.t('m.staleFrom', { time: updated }) : View.statusText(st.kind, updated));
  }

  return { init: init, size: size, home: home, load: load, render: render, renderNoKey: renderNoKey };
})();
