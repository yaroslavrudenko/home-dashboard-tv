'use strict';
// Batch 12: the Shabbat & holidays screen's view (js/view-shabbat.js) drawn from ShabbatSnapshots
// (tests/fixtures/shabbat-view-snapshots.json, built from the real Hebcal answers for Rehovot at fixed home instants):
// every state × ru/he/uk, the note line, the list of holidays and fasts, placeholders, the failed state, and that a card
// is rewritten only when what it shows changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const FILES = ['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/shabbat.js', 'js/html.js', 'js/icons.js', 'js/view.js', 'js/view-shabbat.js'];   // the states: js/shabbat.js
const SNAP = fixture('shabbat-view-snapshots');
const snap = (name) => JSON.parse(JSON.stringify(SNAP[name].snapshot));
const PLACE = { ru: 'Реховот', he: 'רחובות', uk: 'Реховот' };

function fakeScreen() {
  const nodes = {};
  const node = (id) => {
    if (nodes[id]) return nodes[id];
    let html = '';
    const n = { id, className: '', writes: 0 };
    Object.defineProperty(n, 'innerHTML', { get: () => html, set: (v) => { html = v; n.writes++; } });
    return (nodes[id] = n);
  };
  return { el: { innerHTML: '', querySelector: (sel) => node(sel.replace(/^#/, '')) }, nodes };
}
function setup(lang) {
  const ctx = load(FILES);
  ctx.I18n.setLang(lang);
  const scr = fakeScreen();
  ctx.ShabbatView.init(scr.el, { upcoming: 6 });
  const render = (s, extra) => ctx.ShabbatView.render(s, Object.assign({ kind: 'fresh', updated: '09:31', retryAt: '', place: PLACE[lang] }, extra));
  return { ctx, scr, render, week: () => scr.nodes['sh-week'], list: () => scr.nodes['sh-list'], status: () => scr.nodes['shabbat-status'] };
}
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '\n').replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean);
const part = (html, cls) => { const m = html.match(new RegExp('<div class="' + cls + '[^"]*">([\\s\\S]*?)</div>')); return m ? text(m[1]).join(' ') : null; };
const rowsOf = (html) => html.split(/<div class="sh-row(?=[ "])/).slice(1).map((r) => text('<div class="sh-row' + r));
// a tile's texts: [label, date, time, count]
const tile = (html, cls) => { const i = html.indexOf('<div class="sh-tile ' + cls), j = html.indexOf('<div class="sh-tile ', i + 1); return text(html.slice(i, j < 0 ? undefined : j)); };

test('Shabbat, weekday, Russian: the city, today, the Hebrew date; this week\'s candles and havdalah with the count; six holidays', () => {
  const { render, week, list, status } = setup('ru');
  render(snap('weekday'));
  const a = week().innerHTML;
  assert.equal(week().className, 'card sh-week');
  assert.equal(part(a, 'sh-place'), 'Реховот');
  assert.equal(part(a, 'sh-date'), 'Понедельник, 2 ноября');
  assert.equal(part(a, 'sh-hdate'), '22 хешвана 5787');
  assert.match(a, /<div class="sh-note"><\/div>/, 'the note slot is there, empty');
  assert.equal(part(a, 'card-title sh-title'), 'Шабат · Глава Хаей Сара');
  assert.deepEqual(tile(a, 'sh-candles'), ['Зажигание свечей', 'Пятница, 6 ноября', '16:27', 'через 4 дн.']);
  assert.deepEqual(tile(a, 'sh-havdalah'), ['Авдала', 'Суббота, 7 ноября', '17:24']);
  assert.deepEqual(rowsOf(list().innerHTML), [['Ханука', 'Пт, 4 декабря', 'через 32 дн.'], ['Пост 10 тевета', 'Вс, 20 декабря', 'через 48 дн.'],
    ['Ту би-Шват', 'Сб, 23 января', 'через 82 дн.'], ['Пост Эстер', 'Пн, 22 марта', 'через 140 дн.'], ['Пурим', 'Вт, 23 марта', 'через 141 дн.'],
    ['Песах', 'Чт, 22 апреля', 'через 171 дн.']]);
  assert.match(list().innerHTML, /^<div class="card-title">Праздники и посты<\/div>/);
  assert.match(list().innerHTML, /<div class="sh-row is-fast"><div class="sh-row-name"><svg class="icon g-fast"/, 'V7: a fast row carries the fast glyph');
  assert.ok(!/sh-row-in is-soon/.test(list().innerHTML), 'V7: 32 days and more: quiet, not amber');
  assert.match(a, /<div class="sh-tile-in is-soon">через 4 дн\.<\/div>/, 'V7: 7 days or fewer: amber');
  assert.deepEqual([status().className, text(status().innerHTML).join('')], ['status screen-status is-fresh', 'Обновлено в 09:31']);
});

test('Shabbat in Hebrew: the Hebrew date and the parasha are the source\'s own strings; names from our table', () => {
  const { render, week, list } = setup('he');
  render(snap('weekday'));
  const a = week().innerHTML;
  assert.equal(part(a, 'sh-hdate'), 'כ״ב בחשון תשפ״ז');
  assert.equal(part(a, 'card-title sh-title'), 'שבת · פרשת חיי שרה', 'parasha.he from the API, not our table');
  // the source's own spelling wins over our table (e.g. the vowelled form Hebcal can send): proven with a string we never write
  const voc = snap('weekday'); voc.window.parasha.he = 'פָּרָשַׁת חַיֵּי שָׂרָה';
  render(voc);
  assert.equal(part(week().innerHTML, 'card-title sh-title'), 'שבת · פָּרָשַׁת חַיֵּי שָׂרָה');
  assert.equal(part(a, 'sh-date'), 'יום שני, 2 בנובמבר');
  assert.deepEqual(rowsOf(list().innerHTML)[0], ['חנוכה', 'שישי, 4 בדצמבר', 'בעוד 32 ימים']);
  assert.deepEqual(tile(a, 'sh-havdalah'), ['הבדלה', 'שבת, 7 בנובמבר', '17:24']);
});

test('Shabbat in Ukrainian: Ukrainian dates, months and parasha', () => {
  const { render, week, list } = setup('uk');
  render(snap('weekday'));
  const a = week().innerHTML;
  assert.equal(part(a, 'sh-date'), 'Понеділок, 2 листопада');
  assert.equal(part(a, 'sh-hdate'), '22 хешвана 5787');
  assert.equal(part(a, 'card-title sh-title'), 'Шабат · Розділ Хаей Сара');
  assert.match(a, /за 4 дн\./);
  assert.deepEqual(rowsOf(list().innerHTML)[0], ['Ханука', 'Пт, 4 грудня', 'за 32 дн.']);
});

test('Shabbat, Friday before the candles (erev): «Сегодня, 6 ноября» (no weekday: V1) and the hours and minutes left', () => {
  const { render, week } = setup('ru');
  render(snap('erev'));
  const a = week().innerHTML;
  assert.deepEqual(tile(a, 'sh-candles'), ['Зажигание свечей', 'Сегодня, 6 ноября', '16:27', 'через 2 ч 14 мин']);
  assert.match(a, /class="sh-tile sh-candles is-erev"/);
  const late = snap('erev'); late.window.minutesToCandles = 9;
  render(late);
  assert.match(week().innerHTML, /через 9 мин/);
});

test('Shabbat is in: the calm card — «Шабат шалом», the parasha, havdalah; no tiles', () => {
  for (const [lang, greet, name, line] of [['ru', 'Шабат шалом', 'Глава Хаей Сара', 'Авдала · 17:24'],
    ['he', 'שבת שלום', 'פרשת חיי שרה', 'הבדלה · 17:24'], ['uk', 'Шабат шалом', 'Розділ Хаей Сара', 'Авдала · 17:24']]) {
    const { render, week } = setup(lang);
    render(snap('shabbat'));
    const a = week().innerHTML;
    assert.equal(week().className, 'card sh-week is-calm', lang);
    assert.deepEqual([part(a, 'sh-calm-greet'), part(a, 'sh-calm-name'), part(a, 'sh-calm-line')], [greet, name, line], lang);
    assert.ok(!a.includes('sh-tile'), lang + ': no tiles while Shabbat is in');
  }
  // Friday night (havdalah tomorrow): the day is said
  const { render, week } = setup('ru');
  const fri = snap('shabbat'); fri.today = { date: '2026-11-06', weekday: 5, day: 6, month: 10, hebrew: fri.today.hebrew };
  render(fri);
  assert.equal(part(week().innerHTML, 'sh-calm-line'), 'Авдала · Суббота, 7 ноября · 17:24');
});

test('A yom tov is in: «Хаг самеах» and the holiday, named once (V8); Yom Kippur: «Гмар хатима това»; havdalah today: the time', () => {
  const { render, week } = setup('ru');
  render(snap('yomtov'));
  assert.deepEqual([part(week().innerHTML, 'sh-calm-greet'), part(week().innerHTML, 'sh-calm-name')], ['Хаг самеах', 'Песах']);
  assert.match(week().innerHTML, /<div class="sh-note"><\/div>/, 'V8: «Сегодня: Песах» would repeat the name: the note stays empty');
  assert.equal(part(week().innerHTML, 'sh-calm-line'), 'Авдала · 19:52', 'V8: havdalah today: the time alone');
  assert.match(week().innerHTML, /<b class="sh-calm-time">19:52<\/b>/, 'the time emphasised');
  render(snap('yomkippur'));
  assert.deepEqual([part(week().innerHTML, 'sh-calm-greet'), part(week().innerHTML, 'sh-calm-name')], ['Гмар хатима това', 'Йом Кипур']);
  assert.ok(!/Сегодня: Йом Кипур/.test(week().innerHTML), 'V8: the name once');
  assert.equal(week().className, 'card sh-week is-calm');
});

test('A fast today: the note with its times, amber while it runs; the list says it is going on', () => {
  const { render, week, list } = setup('ru');
  render(snap('fast'));
  assert.match(week().innerHTML, /<div class="sh-note is-fast is-active">/);
  assert.equal(part(week().innerHTML, 'sh-note is-fast'), 'Пост 10 тевета · начало 05:18 · конец 16:55');
  const rows = rowsOf(list().innerHTML);
  assert.deepEqual(rows[0], ['Пост 10 тевета', 'Вс, 20 декабря', 'идёт']);
  assert.equal(rows.length, 6, 'six slots always');
  assert.deepEqual(rows[5], [], 'a slot the source has no holiday for stays empty (the capture ends there), never a made-up row');
  const before = snap('fast'); before.note.active = false;
  render(before);
  assert.match(week().innerHTML, /<div class="sh-note is-fast">/, 'before the fast starts: quiet');
});

test('Chanukah today: «Сегодня: Ханука» in the note slot, the list row «идёт»', () => {
  const { render, week, list } = setup('ru');
  render(snap('holidayToday'));
  assert.equal(part(week().innerHTML, 'sh-note'), 'Сегодня: Ханука');
  assert.deepEqual(rowsOf(list().innerHTML)[0], ['Ханука', 'Пт, 4 декабря', 'идёт']);
  assert.match(list().innerHTML, /sh-row-in is-ongoing/);
});

test('Before the first data every slot is there as a placeholder; no data at all: «Календарь временно недоступен» and the retry', () => {
  const { render, week, list, status } = setup('ru');
  render(null, { kind: 'loading', updated: '' });
  assert.equal(week().className, 'card sh-week is-empty');
  assert.equal(part(week().innerHTML, 'sh-place'), 'Реховот');
  assert.deepEqual(['sh-date', 'sh-hdate', 'sh-note', 'sh-tiles', 'sh-tile sh-candles', 'sh-tile sh-havdalah'].map((c) => week().innerHTML.includes('class="' + c)), [true, true, true, true, true, true]);
  assert.deepEqual(tile(week().innerHTML, 'sh-candles'), ['Зажигание свечей'], 'labels drawn, values as placeholder bars');
  assert.equal((list().innerHTML.match(/sh-row is-empty/g) || []).length, 6);
  assert.equal(text(status().innerHTML).join(''), '', 'the header says nothing while loading');
  render(null, { kind: 'failed', updated: '', retryAt: '10:12' });
  assert.deepEqual(text(week().innerHTML.slice(week().innerHTML.indexOf('<div class="empty-text">'))), ['Календарь временно недоступен', 'Повторим в 10:12']);
  assert.match(week().innerHTML, /<svg class="icon g-candles"/, 'the calm glyph over the message');
  assert.ok(!/skeleton/.test(list().innerHTML), 'failed: the list does not pretend to be loading');
  assert.equal((list().innerHTML.match(/<div class="sh-row"><\/div>/g) || []).length, 6, 'six empty slots');
  const old = snap('weekday'); old.window = null; old.upcoming = [];
  render(old, { kind: 'stale', updated: '01.11 09:31', retryAt: '10:12' });
  assert.match(week().innerHTML, /Календарь временно недоступен/, 'nothing coming in the data: the failed state, never past dates');
  assert.equal(text(status().innerHTML).join(''), 'Не обновляется · данные от 01.11 09:31');
});

test('Unchanged cards are not rewritten; the erev minute redraws card A only; a language switch redraws both', () => {
  const { ctx, render, week, list } = setup('ru');
  render(snap('erev'));
  render(snap('erev'));
  assert.deepEqual([week().writes, list().writes], [1, 1]);
  const next = snap('erev'); next.window.minutesToCandles = 133;
  render(next);
  assert.deepEqual([week().writes, list().writes], [2, 1]);
  ctx.I18n.setLang('he');
  render(next, { place: 'רחובות' });
  assert.deepEqual([week().writes, list().writes], [3, 2]);
});

test('A holiday or parasha we have no name for shows the source\'s id, never a blank or a key', () => {
  const { render, week, list } = setup('ru');
  const s = snap('weekday');
  s.window.parasha = { id: 'Vezot Haberakhah', he: 'וזאת הברכה' };
  s.upcoming[0].holiday = 'purim-katan';
  render(s);
  assert.equal(part(week().innerHTML, 'card-title sh-title'), 'Шабат · Глава Vezot Haberakhah');
  assert.equal(rowsOf(list().innerHTML)[0][0], 'purim-katan');
});

// ---- FIX-12B ------------------------------------------------------------------------------------------------------
test('V1: a Monday eve of a holiday (Erev Pesach 5788) — «Сегодня, 10 апреля», never the long weekday, in every language', () => {
  for (const [lang, date, label, until] of [['ru', 'Сегодня, 10 апреля', 'Зажигание свечей', 'через 3 ч 26 мин'],
    ['he', 'היום, 10 באפריל', 'הדלקת נרות', 'בעוד 3 שע׳ 26 דק׳'], ['uk', 'Сьогодні, 10 квітня', 'Засвічування свічок', 'за 3 год 26 хв']]) {
    const { render, week } = setup(lang);
    render(snap('erevHoliday'));
    assert.deepEqual(tile(week().innerHTML, 'sh-candles'), [label, date, '18:46', until], lang);
    assert.equal(part(week().innerHTML, 'card-title sh-title'), { ru: 'Песах', he: 'פסח', uk: 'Песах' }[lang]);
  }
});

test('V8: the eve of a fast (Tisha B\'Av begins at sunset): the list says it is going on, never «Завтра» under a running fast', () => {
  const { render, week, list } = setup('ru');
  render(snap('fastEve'));
  assert.match(week().innerHTML, /<div class="sh-note is-fast is-active">/);
  const rows = rowsOf(list().innerHTML);
  assert.deepEqual(rows[0], ['Девятое ава', 'Чт, 12 августа', 'идёт']);
  const quiet = snap('fastEve'); quiet.note.active = false;
  render(quiet);
  assert.deepEqual(rowsOf(list().innerHTML)[0], ['Девятое ава', 'Чт, 12 августа', 'Завтра'], 'before it starts: tomorrow, as it is');
});

test('V7: a countdown is quiet, amber only at 7 days or fewer; an ongoing one is green', () => {
  const { render, list } = setup('ru');
  render(snap('erevHoliday'));
  assert.match(list().innerHTML, /<span class="sh-row-in is-soon">Завтра<\/span>/);
  assert.match(list().innerHTML, /<span class="sh-row-in">через 14 дн\.<\/span>/);
  render(snap('fast'));
  assert.match(list().innerHTML, /<span class="sh-row-in is-ongoing">идёт<\/span>/);
});

test('V10: the placeholders have the shape of what they stand for', () => {
  const { render, week, list } = setup('ru');
  render(null, { kind: 'loading', updated: '' });
  for (const c of ['sh-skel-date', 'sh-skel-hdate', 'sh-skel-title', 'sh-skel-day', 'sh-skel-time']) assert.match(week().innerHTML, new RegExp('class="skeleton sh-skel ' + c + '"'), c);
  assert.equal((list().innerHTML.match(/skeleton sh-skel sh-skel-name/g) || []).length, 6);
  assert.equal((list().innerHTML.match(/skeleton sh-skel sh-skel-sub/g) || []).length, 6);
});

// ---- FIX-12B follow-up (data side S7/S8/S9) -------------------------------------------------------------------------
test('S9-2: «Шушан Пурим» (Jerusalem, instead of Purim) has its own name in every language, never the slug', () => {
  for (const [lang, name] of [['ru', 'Шушан Пурим'], ['he', 'שושן פורים'], ['uk', 'Шушан Пурім']]) {
    const { render, list } = setup(lang);
    const s = snap('weekday');
    s.upcoming[4].holiday = 'shushan-purim';
    render(s);
    assert.equal(rowsOf(list().innerHTML)[4][0], name, lang);
  }
});

test('S8: the view reads the data side\'s exported states (Shabbat.STATE) when it is there', () => {
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js'],
    { Shabbat: { STATE: { WEEKDAY: 'wd', EREV: 'ev', SHABBAT: 'sb', YOMTOV: 'yt' } } });
  require('node:vm').runInContext(require('node:fs').readFileSync(require('node:path').join(require('./harness').ROOT, 'js/view-shabbat.js'), 'utf8'), ctx);
  ctx.I18n.setLang('ru');
  const scr = fakeScreen();
  ctx.ShabbatView.init(scr.el, { upcoming: 6 });
  const s = snap('shabbat'); s.state = 'sb';
  ctx.ShabbatView.render(s, { kind: 'fresh', updated: '09:31', retryAt: '', place: 'Реховот' });
  assert.equal(scr.nodes['sh-week'].className, 'card sh-week is-calm', 'the exported SHABBAT value is the calm state');
});

test('S7/S5: the view needs no updatedAt, no range and no occurrence Hebrew date — the App\'s «updated» text is what it shows', () => {
  const { render, status } = setup('ru');
  const s = snap('weekday');
  assert.ok(!('updatedAt' in s), 'the fixture mirrors the contract: no updatedAt');
  assert.ok(s.upcoming.every((o) => !('hebrew' in o)));
  render(s, { updated: '07:15' });
  assert.equal(text(status().innerHTML).join(''), 'Обновлено в 07:15');
});
