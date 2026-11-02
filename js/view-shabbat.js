/* The Shabbat & holidays screen (batch 12): two cards on the main screen's grid. Card A (two columns wide): the home
 * city, today's date and its Hebrew date, a note line (a fast's times, or the holiday today), then this week's window —
 * candle lighting and havdalah, each with its day and time, and how long until the candles. While Shabbat or a yom tov
 * is in, card A turns calm: «Шабат шалом» (or «Хаг самеах», «Гмар хатима това»), the week's name — said once — and
 * havdalah (its time alone when it is today). Card C: the next holidays and fasts with a day count (quiet; amber at a week
 * or less), in fixed row slots; a fast carries the fast glyph. Every name is ours (js/i18n.js, by Hebcal's id; a missing
 * one shows the id) except the Hebrew date and the parasha in Hebrew, which are the source's own strings. Before the first
 * data every slot holds a placeholder shaped like its content, so nothing moves when it arrives; with no data at all,
 * card A says so with when it is tried again. A card is rewritten only when what it shows changed. Never fetches. ES5. */
var ShabbatView = (function () {
  var esc = Html.esc;
  // FIX-12B V17 / S8: the snapshot's states are the data side's Shabbat.STATE (js/shabbat.js loads before this view)
  var STATE = Shabbat.STATE;
  // (window.kind, 'shabbat' | 'yomtov', is a different field: the contract's literal, not a state)
  var SOON_DAYS = 7;                                 // a countdown turns amber at a week or less
  var els = {}, rows = 0, drawn = {};

  // slots: { upcoming: the number of rows in card C }.
  function init(el, slots) {
    el.innerHTML = Html.screenHead('screen.shabbat', 'shabbat-status') + '<div class="screen-body sh-body">' +
      '<section class="card sh-week" id="sh-week"></section><section class="card sh-list" id="sh-list"></section></div>';
    els = { status: el.querySelector('#shabbat-status'), week: el.querySelector('#sh-week'), list: el.querySelector('#sh-list') };
    rows = slots.upcoming;
    drawn = {};
  }

  // A name from our tables by the source's id; the id itself when we have none (never a blank).
  function named(prefix, id) { return I18n.tOr(prefix + id, id); }
  function holiday(slug) { return named('sh.h.', slug); }
  function isCalm(state) { return state === STATE.SHABBAT || state === STATE.YOMTOV; }
  // m: a Moment-like { date: 'YYYY-MM-DD', weekday } → "Пятница, 6 ноября"
  function dayOf(m) { return Number(m.date.slice(8, 10)); }
  function monthOf(m) { return Number(m.date.slice(5, 7)) - 1; }
  function longDate(m) { return I18n.dateLong(m.weekday, dayOf(m), monthOf(m)); }
  // o: an upcoming occurrence → "Пт, 4 декабря"
  function shortDate(o) { return I18n.dateShort(o.startWeekday, o.startDay, o.startMonth); }
  // "Сегодня, 10 апреля": no weekday on the day itself (V1: a long weekday never fits the tile).
  function todayDate(m) { return I18n.t('sh.today') + ', ' + I18n.dayMonth(dayOf(m), monthOf(m)); }
  // The Hebrew date: in Hebrew the source's own string, elsewhere "22 хешвана 5787" from our month names.
  function hebDate(h) {
    if (!h) return '';
    return I18n.lang() === 'he' && h.he ? h.he : I18n.t('sh.hdate', { day: h.day, month: named('sh.month.', h.month), year: h.year });
  }
  // The parasha: in Hebrew the source's «פרשת חיי שרה», elsewhere «Глава Хаей Сара» from our table.
  function parasha(p) { return I18n.lang() === 'he' && p.he ? p.he : I18n.t('sh.parashaOf', { name: named('sh.parasha.', p.id) }); }
  // What the window is called: the yom tov's name, else the parasha, else the festival it falls in, else «Шабат».
  function windowName(w) {
    if (w.kind === 'yomtov' && w.holiday) return holiday(w.holiday);
    return w.parasha ? parasha(w.parasha) : w.during ? holiday(w.during) : I18n.t('sh.shabbat');
  }
  function weekTitle(w) {
    if (w.kind === 'yomtov' && w.holiday) return holiday(w.holiday);
    if (w.reading) return I18n.t('sh.shabbat');                          // the reading block names the parasha
    return w.parasha || w.during ? I18n.t('sh.week', { name: windowName(w) }) : I18n.t('sh.shabbat');
  }

  // ---- The weekly reading (the owner: «нет инфы какую стих Торы читаем и может еще чего»): every value under its label.
  // A reference as Hebcal writes it ("Genesis 23:1-25:18; Numbers 28:9-15"), as its parts: each part's book from our table (an unknown
  // one as written), the verses with an en dash and left to right inside Hebrew.
  var BOOK_REF = /^(.+?) (\d[\s\S]*)$/;
  function refText(ref) {
    var parts = String(ref).split('; '), out = [];
    for (var i = 0; i < parts.length; i++) {
      var m = BOOK_REF.exec(parts[i]);
      out.push(m ? named('sh.book.', m[1]) + ' ' + I18n.ltr(m[2].replace(/-/g, '\u2013')) : parts[i]);
    }
    return out;
  }
  // Each part of a reference stays on one line (verse numbers never split); a long reference breaks between its parts.
  function refHtml(ref) {
    var parts = refText(ref), html = [];
    for (var i = 0; i < parts.length; i++) html.push('<span class="sh-ref-part">' + esc(parts[i] + (i < parts.length - 1 ? ';' : '')) + '</span>');
    return html.join(' ');
  }
  // The portion's name: the parasha (the label says «weekly portion»), else the festival read.
  function portionName(w) {
    if (w.kind === 'yomtov' && w.holiday) return holiday(w.holiday);
    if (w.parasha) return named('sh.parasha.', w.parasha.id);
    return w.during ? holiday(w.during) : '';
  }
  function readItem(cls, labelKey, valueHtml) {
    return '<div class="sh-read-item ' + cls + '"><div class="sh-read-label">' + esc(I18n.t(labelKey)) + '</div>' + valueHtml + '</div>';
  }
  function rcText(monthId, date) {
    var line = I18n.t('sh.read.rcText', { month: named('sh.month.', monthId) });
    return date ? line + ' · ' + I18n.dateShort(Tz.weekdayOf(date), +date.slice(8, 10), +date.slice(5, 7) - 1) : line;
  }
  // The one extra line: a special Shabbat, Shabbat Mevarchim, Rosh Chodesh on Shabbat — else today's Omer count.
  function extraItem(special, omer) {
    var v = function (t) { return '<div class="sh-read-value">' + esc(t) + '</div>'; };
    if (special && special.kind === 'shabbat') return readItem('sh-read-extra', 'sh.read.special', v(I18n.lang() === 'he' && special.he ? special.he : named('sh.special.', special.id)));
    if (special && special.kind === 'mevarchim') return readItem('sh-read-extra', 'sh.read.mevarchim', v(rcText(special.month, special.date)));
    if (special && special.kind === 'roshchodesh') return readItem('sh-read-extra', 'sh.read.rc', v(rcText(special.month, special.date)));
    if (omer) return readItem('sh-read-extra', 'sh.read.omer', v(I18n.t('sh.read.omerDay', { n: omer })));
    return '';
  }
  function readingHtml(snap) {
    var w = snap.window, r = w && w.reading;
    if (!r) return '';
    var torah = r.torah ? readItem('sh-read-torah', w.parasha && w.kind !== 'yomtov' ? 'sh.read.parasha' : 'sh.read.torah',
      '<div class="sh-read-name">' + esc(portionName(w)) + '</div><div class="sh-read-ref">' + refHtml(r.torah) + '</div>') : '';
    var haftarah = r.haftarah ? readItem('sh-read-haftarah', 'sh.read.haftarah', '<div class="sh-read-ref">' + refHtml(r.haftarah) + '</div>') : '';
    // two columns: the portion | the haftarah over the extra line — the band holds them without reaching the rule
    return '<div class="sh-read"><div class="sh-read-row">' + torah + '<div class="sh-read-col">' + haftarah + extraItem(r.special, snap.omer) +
      '</div></div><div class="sh-read-end"></div></div>';
  }
  function countDays(n) { return n === 0 ? I18n.t('sh.today') : n === 1 ? I18n.t('sh.tomorrow') : I18n.t('sh.inDays', { n: n }); }
  // How long until the candles: minutes on the day itself (erev), else days.
  function untilCandles(w, state) {
    if (state !== STATE.EREV) return countDays(w.daysToCandles);
    var m = w.minutesToCandles;
    return m < 60 ? I18n.t('sh.inM', { m: m }) : I18n.t('sh.inHM', { h: Math.floor(m / 60), m: m % 60 });
  }

  function todayHtml(today, place) {
    return '<div class="sh-place">' + esc(place) + '</div><div class="sh-date">' + esc(longDate(today)) + '</div>' +
      '<div class="sh-hdate">' + esc(hebDate(today.hebrew)) + '</div>';
  }
  // The note slot is always there (36 px): a fast (amber while it runs), the holiday today, or empty.
  function noteHtml(note) {
    if (!note) return '<div class="sh-note"></div>';
    if (note.kind === 'fast') {
      return '<div class="sh-note is-fast' + (note.active ? ' is-active' : '') + '">' + Icons.glyph('fast') + '<span>' +
        esc(I18n.t('sh.fastTimes', { name: holiday(note.holiday), begins: note.begins.time, ends: note.ends.time })) + '</span></div>';
    }
    return '<div class="sh-note"><span>' + esc(I18n.t('sh.todayIs', { name: holiday(note.holiday) })) + '</span></div>';
  }
  // t: { cls, glyph, label (key), date, time, sub, soon } — date / time / sub are HTML (escaped by the caller).
  function tileHtml(t) {
    return '<div class="sh-tile ' + t.cls + '"><div class="sh-tile-head">' + Icons.glyph(t.glyph) + '<span>' + esc(I18n.t(t.label)) + '</span></div>' +
      '<div class="sh-tile-date">' + t.date + '</div><div class="sh-tile-time">' + t.time + '</div>' +
      '<div class="sh-tile-in' + (t.soon ? ' is-soon' : '') + '">' + t.sub + '</div></div>';
  }
  function tilesHtml(snap) {
    var w = snap.window, erev = snap.state === STATE.EREV, h = w.havdalah;
    return '<div class="card-title sh-title">' + esc(weekTitle(w)) + '</div><div class="sh-tiles">' +
      tileHtml({ cls: 'sh-candles' + (erev ? ' is-erev' : ''), glyph: 'candles', label: 'sh.candles', date: esc(erev ? todayDate(w.candles) : longDate(w.candles)),
        time: esc(w.candles.time), sub: esc(untilCandles(w, snap.state)), soon: erev || w.daysToCandles <= SOON_DAYS }) +
      tileHtml({ cls: 'sh-havdalah', glyph: 'havdalah', label: 'sh.havdalah', date: h ? esc(longDate(h)) : '', time: h ? esc(h.time) : '—', sub: '' }) + '</div>';
  }
  // Shabbat or a yom tov is in: the greeting, the week's name, havdalah — its time alone, emphasised, when it is today.
  function calmHtml(snap) {
    var w = snap.window, h = w.havdalah;
    var greet = snap.state === STATE.YOMTOV ? (w.holiday === 'yom-kippur' ? 'sh.greet.yomkippur' : 'sh.greet.yomtov') : 'sh.greet.shabbat';
    var when = !h ? '' : ' · ' + (h.date === snap.today.date ? '<b class="sh-calm-time">' + esc(h.time) + '</b>' : esc(longDate(h) + ' · ' + h.time));
    // with the reading block above, the name is said there: not twice
    return '<div class="sh-calm"><div class="sh-calm-greet">' + esc(I18n.t(greet)) + '</div>' + (w.reading ? '' : '<div class="sh-calm-name">' + esc(windowName(w)) + '</div>') +
      '<div class="sh-calm-line">' + Icons.glyph('havdalah') + '<span>' + esc(I18n.t('sh.havdalah')) + when + '</span></div></div>';
  }
  // With no data the header says when it is tried again (L6), so the card says the short statement only (N5); the window
  // past its data (stale, the header shows its time) still says when.
  function failedHtml(s, withRetry) { return Html.emptyState(Icons.glyph('candles'), I18n.t('sh.failed'), withRetry ? Html.retryText(s.retryAt) : ''); }

  // Before the first data: the same slots, each a placeholder bar the size of what will stand there (V10).
  function bar(kind) { return '<span class="skeleton sh-skel sh-skel-' + kind + '"></span>'; }
  function placeholderWeek(place) {
    var tile = function (cls, glyph, label) { return tileHtml({ cls: cls, glyph: glyph, label: label, date: bar('day'), time: bar('time'), sub: '' }); };
    return '<div class="sh-place">' + esc(place) + '</div><div class="sh-date">' + bar('date') + '</div><div class="sh-hdate">' + bar('hdate') + '</div>' +
      noteHtml(null) + '<div class="sh-rule"></div><div class="card-title sh-title">' + bar('title') + '</div><div class="sh-tiles">' +
      tile('sh-candles', 'candles', 'sh.candles') + tile('sh-havdalah', 'havdalah', 'sh.havdalah') + '</div>';
  }
  function weekHtml(snap, s) {
    if (!snap) return s.kind === 'failed' ? '<div class="sh-place">' + esc(s.place) + '</div>' + failedHtml(s, false) : placeholderWeek(s.place);
    var calm = isCalm(snap.state);
    // the calm card names the holiday itself: «Сегодня: Песах» under «Хаг самеах · Песах» would say it twice (V8)
    var top = todayHtml(snap.today, s.place) + noteHtml(calm && snap.note && snap.note.kind === 'holiday' ? null : snap.note);
    if (!snap.window) return top + failedHtml(s, true);                         // data older than its range: nothing to show as coming
    return top + readingHtml(snap) + (calm ? calmHtml(snap) : '<div class="sh-rule"></div>' + tilesHtml(snap));
  }

  // runningFast: the slug of a fast already running (the note says so) — its row says «идёт», never «Завтра» (V8).
  function rowHtml(o, runningFast) {
    if (!o) return '<div class="sh-row"></div>';
    var ongoing = o.ongoing || o.holiday === runningFast, fast = o.kind === 'fast';
    var cls = ongoing ? ' is-ongoing' : o.daysUntil <= SOON_DAYS ? ' is-soon' : '';
    return '<div class="sh-row' + (fast ? ' is-fast' : '') + '"><div class="sh-row-name">' + (fast ? Icons.glyph('fast') : '') + esc(holiday(o.holiday)) + '</div>' +
      '<div class="sh-row-sub"><span class="sh-row-date">' + esc(shortDate(o)) + '</span>' +
      '<span class="sh-row-in' + cls + '">' + esc(ongoing ? I18n.t('sh.ongoing') : countDays(o.daysUntil)) + '</span></div></div>';
  }
  // No data yet: placeholder bars; failed with no data: one quiet amber line instead of the rows (L6: a failure never looks
  // like loading, nor like a blank card).
  function listHtml(snap, failed) {
    var out = '', i, list = snap ? snap.upcoming : [], note = snap && snap.note;
    var runningFast = note && note.kind === 'fast' && note.active ? note.holiday : null;
    if (failed) out = '<div class="sh-list-failed">' + esc(I18n.t('sh.failed')) + '</div>';
    else for (i = 0; i < rows; i++) out += snap ? rowHtml(list[i], runningFast) : '<div class="sh-row is-empty">' + bar('name') + bar('sub') + '</div>';
    return '<div class="card-title">' + esc(I18n.t('sh.upcoming')) + '</div><div class="sh-rows">' + out + '</div>';
  }

  // d: { name, el, key, build, cls } — build() makes the card's HTML only when its key changed (an unchanged minute
  // builds nothing).
  function draw(d) {
    if (drawn[d.name] === d.key) return;
    drawn[d.name] = d.key;
    d.el.innerHTML = d.build();
    d.el.className = d.cls;
  }

  // snapshot: Shabbat.view(…) or null before the first data. s: { kind ('fresh' | 'stale' | 'loading' | 'failed'),
  // updated (the App's "HH:MM" / "DD.MM HH:MM" of when the data arrived; the snapshot carries no time of its own), retryAt ("HH:MM" | ''), place (the home city's name) }.
  function render(snapshot, s) {
    var lang = I18n.lang(), calm = !!snapshot && isCalm(snapshot.state), failed = !snapshot && s.kind === 'failed';
    draw({ name: 'week', el: els.week, build: function () { return weekHtml(snapshot, s); },
      key: JSON.stringify([snapshot && [snapshot.state, snapshot.window, snapshot.note, snapshot.today, snapshot.omer || null], snapshot ? '' : s.kind, s.retryAt, s.place, lang]),
      cls: 'card sh-week' + (calm ? ' is-calm' : '') + (snapshot ? '' : ' is-empty') });
    draw({ name: 'list', el: els.list, build: function () { return listHtml(snapshot, failed); },
      key: JSON.stringify([snapshot && snapshot.upcoming, snapshot && snapshot.note, failed, lang]), cls: 'card sh-list' + (snapshot ? '' : ' is-empty') });
    // the header: the data's time; with no data at all, failed says when it is tried again (L6), loading says nothing
    var kind = !snapshot ? '' : s.kind === 'fresh' ? 'fresh' : 'stale';
    Html.setStatus(els.status, 'status screen-status', kind || s.kind, kind ? Html.statusText(kind, s.updated) : failed ? Html.retryText(s.retryAt) : '');
  }

  return { init: init, render: render };
})();
