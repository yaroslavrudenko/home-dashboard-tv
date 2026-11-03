/* The city picker: a sheet over the dashboard, opened with the OK key, listing every catalogue city (js/cities.js) in
 * the interface language's order. ▲ ▼ move one row, ◀ ▶ jump to the first city of the previous / next letter (a letter
 * badge says which), OK chooses, Back or IDLE_MS without a key closes without a change. The focused row stays in the
 * middle (except at the list's ends). The list is drawn once per opening; a key then only moves two class names and one
 * transform (no re-render on a slow TV). ES5.
 *   CityView.init(el, cities, deps)   deps: { setTimeout, clearTimeout, choose(id) (App saves it; false: not saved) }
 *   CityView.open(currentId)  CityView.close()  CityView.isOpen()  CityView.key(keyCode) (true: the key was used) */
var CityView = (function () {
  var esc = Html.esc;
  var ROW_PX = 72, VISIBLE = 9, IDLE_MS = 30000, BADGE_MS = 700, MSG_MS = 2000;
  var KEY_OK = 13, KEY_BACK = 10009, KEY_LEFT = 37, KEY_UP = 38, KEY_RIGHT = 39, KEY_DOWN = 40;
  // G2: the remote's arrows in the hint, drawn in CSS (▲▼◀▶ are not in the TV's font subsets) and kept left to right in
  // every language («{ud}» up/down, «{lr}» left/right in city.hint): in Hebrew ◀ stays left of ▶, both pointing outward.
  var ARROWS = { ud: '<span class="city-arrows" dir="ltr"><span class="city-arrow is-up"></span><span class="city-arrow is-down"></span></span>',
    lr: '<span class="city-arrows" dir="ltr"><span class="city-arrow is-left"></span><span class="city-arrow is-right"></span></span>' };
  var el = null, list = null, rows = null, badge = null, msg = null, cities = null, deps = null;
  var order = [], focus = 0, current = -1, open = false, idleTimer = null, badgeTimer = null, msgTimer = null;

  function init(rootEl, catalogue, d) { el = rootEl; cities = catalogue; deps = d; open = false; el.className = 'city'; }

  // The row's names: the city in the interface language, and under it (quieter) its Hebrew name — or, in Hebrew, its
  // English one — which tells twins apart (Modi'in, Modi'in Illit).
  function rowHtml(c, i) {
    var lang = I18n.lang(), alt = lang === 'he' ? '<span class="city-alt" dir="ltr" lang="en">' + esc(c.en) + '</span>'
      : '<span class="city-alt" dir="rtl" lang="he">' + esc(c.he) + '</span>';
    return '<div class="city-row' + (i === current ? ' is-current' : '') + '"><span class="city-name">' + esc(HomeCity.name(c, lang)) + '</span>' +
      alt + (i === current ? '<span class="city-check"></span>' : '') + '</div>';
  }
  function draw() {
    var lang = I18n.lang(), ids = cities.order[lang] || cities.order.en, html = '', i;
    order = [];
    for (i = 0; i < ids.length; i++) order.push(HomeCity.find(cities, ids[i]));
    for (i = 0; i < order.length; i++) html += rowHtml(order[i], i);
    el.innerHTML = '<div class="city-sheet"><div class="city-title">' + esc(I18n.t('city.title')) + '</div>' +
      '<div class="city-sub">' + esc(I18n.t('city.sub')) + '</div>' +
      '<div class="city-window"><div class="city-list">' + html + '</div><div class="city-badge"></div></div>' +
      '<div class="city-msg"></div><div class="city-hint">' + esc(I18n.t('city.hint')).replace('{ud}', ARROWS.ud).replace('{lr}', ARROWS.lr) + '</div></div>';
    list = el.querySelector('.city-list');
    rows = list.children;
    badge = el.querySelector('.city-badge');
    msg = el.querySelector('.city-msg');
  }

  // The focused row in the middle of the window, clamped at the list's ends (one transform, no layout).
  function moveTo(i) {
    rows[focus].className = rows[focus].className.replace(' is-focus', '');
    focus = Math.max(0, Math.min(order.length - 1, i));
    rows[focus].className += ' is-focus';
    var top = Math.max(0, Math.min(order.length - VISIBLE, focus - Math.floor(VISIBLE / 2)));
    var t = 'translateY(' + (-top * ROW_PX) + 'px)';
    list.style.webkitTransform = t;
    list.style.transform = t;
  }

  function initial(i) { return HomeCity.name(order[i], I18n.lang()).charAt(0).toUpperCase(); }
  function groupStart(i) { while (i > 0 && initial(i - 1) === initial(i)) i--; return i; }
  // ▶: the first city of the next letter; ◀: the first of the previous one (from the middle of a letter, its first).
  function jump(dir) {
    var i;
    if (dir > 0) { i = focus; while (i < order.length - 1 && initial(i) === initial(focus)) i++; if (initial(i) === initial(focus)) return; }
    else { i = groupStart(focus); i = i === focus && i > 0 ? groupStart(i - 1) : i; }
    moveTo(i);
    badge.textContent = initial(focus);
    badge.className = 'city-badge is-on';
    deps.clearTimeout(badgeTimer);
    badgeTimer = deps.setTimeout(function () { badge.className = 'city-badge'; }, BADGE_MS);
  }

  function idle() { deps.clearTimeout(idleTimer); idleTimer = deps.setTimeout(close, IDLE_MS); }

  function openSheet(currentId) {
    current = -1;
    var ids = cities.order[I18n.lang()] || cities.order.en;
    for (var i = 0; i < ids.length; i++) if (ids[i] === currentId) current = i;
    draw();
    focus = 0;
    moveTo(current < 0 ? 0 : current);
    open = true;
    el.className = 'city is-on';
    idle();
  }
  function close() {
    if (!open) return;
    open = false;
    el.className = 'city';
    deps.clearTimeout(idleTimer);
    deps.clearTimeout(badgeTimer);
    deps.clearTimeout(msgTimer);
  }
  function failed() {
    msg.textContent = I18n.t('city.saveFailed');
    msg.className = 'city-msg is-on';
    deps.clearTimeout(msgTimer);
    msgTimer = deps.setTimeout(function () { msg.className = 'city-msg'; }, MSG_MS);
  }

  function key(code) {
    if (!open) return false;
    idle();
    if (code === KEY_UP || code === KEY_DOWN) moveTo(focus + (code === KEY_DOWN ? 1 : -1));
    else if (code === KEY_LEFT || code === KEY_RIGHT) jump(code === KEY_RIGHT ? 1 : -1);
    else if (code === KEY_BACK) close();
    else if (code === KEY_OK) {
      if (focus === current) close();
      else if (!deps.choose(order[focus].id)) failed();
    }
    return true;
  }

  return { init: init, open: openSheet, close: close, isOpen: function () { return open; }, key: key };
})();
