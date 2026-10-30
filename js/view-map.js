/* The traffic map screen: Waze's live map of Israel (embed.waze.com, no key) in one glass card. TomTom has no live
 * traffic for Israel (its flow tiles are blank there, measured 2026-10-30), Waze is Israel's live traffic source.
 * The frame is created the first time the screen is shown and reloaded on every ◀ ▶ open (the owner's open-refresh
 * rule); until its page has loaded, a quiet line says so. The frame never takes the remote's keys: it cannot be
 * focused, and focus that slips into it is handed back at once. ES5. */
var MapView = (function () {
  var els = {}, frame = null;

  function init(el) {
    el.innerHTML = Html.screenHead('screen.map', 'map-status') + '<div class="screen-body map-body"><div class="card map-card" id="map-card">' +
      '<div class="map-note is-on" id="map-note"><span class="map-note-text"' + Html.label('m.loading') + '>' + Html.esc(I18n.t('m.loading')) + '</span></div></div></div>';
    els = { card: el.querySelector('#map-card'), note: el.querySelector('#map-note') };
    frame = null;
  }

  function loaded() { els.note.className = 'map-note'; }
  function loading() { els.note.className = 'map-note is-on'; }

  // The screen came into view. First time: the frame is created and loads `url`; a later ◀ ▶ open (reload) loads it
  // again; a rotation arrival leaves the loaded map as it is.
  function open(url, reload) {
    if (frame && !reload) return;
    loading();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'map-frame';
      frame.setAttribute('tabindex', '-1');
      frame.setAttribute('scrolling', 'no');
      frame.onload = loaded;
      els.card.insertBefore(frame, els.note);
    }
    frame.src = url;
  }

  // Focus that moved into the frame (its page may focus its own search box) goes back to the app, so ◀ ▶ and Back
  // keep working.
  function keepFocus() {
    window.addEventListener('blur', function () {
      setTimeout(function () { if (frame && document.activeElement === frame) frame.blur(); }, 0);
    });
  }

  return { init: init, open: open, keepFocus: keepFocus };
})();
