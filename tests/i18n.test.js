'use strict';
// Interface strings: Russian by default, English complete, every weather code named in both.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const FILES = ['js/config.js', 'js/i18n.js'];
const WMO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

test('Russian is the default language; the switch cycles Russian, Hebrew, Ukrainian; English is the fallback table', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Config.lang, 'ru');
  assert.deepEqual([...ctx.Config.languages], ['ru', 'he', 'uk']);
  assert.deepEqual([...ctx.I18n.languages()].sort(), ['en', 'he', 'ru', 'uk']);
});

test('every string key exists in both languages and is not empty', () => {
  const ctx = load(FILES);
  const keys = ['city.israel', 'city.ukraine', 'city.sydney', 'place.kyiv', 'place.sydney', 'clock.same', 'clock.ahead',
    'clock.behind', 'clock.unknown', 'w.feels', 'w.wind', 'w.humidity', 'w.sunrise',
    'w.sunset', 'w.kmh', 'w.now', 'w.today', 'w.hourly', 'w.days', 'st.fresh', 'st.stale', 'st.loading', 'st.failed', 'st.retry', 'st.retrySoon', 'st.partStale', 'st.noData'];   // B17-V6: one state vocabulary
  // B22 (owner 2026-11-04, judges' common decision, city card, fix 3): «Макс.» / «Мин.» left the city card, their only reader
  for (const k of ['w.high', 'w.low']) assert.equal(ctx.I18n.t(k), k, k + ' is gone (dead key)');
  // B22 fix 6 residue (coordinator's decision, 2026-11-04): «Осадки» left the city card, its only reader
  assert.equal(ctx.I18n.t('w.rain'), 'w.rain', 'w.rain is gone (dead key)');
  for (const lang of ['ru', 'en']) {
    ctx.I18n.setLang(lang);
    for (const k of keys) assert.ok(ctx.I18n.t(k) && ctx.I18n.t(k) !== k, lang + ' ' + k);
  }
});

test('every Open-Meteo weather code has a name in both languages', () => {
  const ctx = load(FILES);
  for (const lang of ['ru', 'en']) {
    ctx.I18n.setLang(lang);
    for (const c of WMO) assert.ok(ctx.I18n.condition(c), lang + ' ' + c);
  }
});

test('placeholders are filled; dates read naturally in each language', () => {
  const ctx = load(FILES);
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.t('st.fresh', { time: '20:32' }), 'Обновлено в 20:32');
  assert.equal(ctx.I18n.dateLong(4, 29, 9), 'Четверг, 29 октября');
  ctx.I18n.setLang('en');
  assert.equal(ctx.I18n.dateLong(4, 29, 9), 'Thursday, October 29');
  ctx.I18n.setLang('xx');
  assert.equal(ctx.I18n.lang(), 'en', 'an unknown language falls back to English');
});

test('batch 2: every screen, source, traffic and alert string exists in both languages', () => {
  const ctx = load(FILES);
  // FB5: n.more, t.roads, t.from and t.usual had no reader and are gone; the columns, the map and the refusal header added.
  // FB5B: the road widgets (t.road.*, t.col.roads), n.partial and the "today" limit (t.limit) are gone; the month cap,
  // 429, the night window and the news column/header states added.
  // FB5C: the night window, the month cap and the per-status refusal copy are gone; the judges' exact copy added.
  const keys = ['screen.main', 'screen.news', 'screen.traffic', 'screen.map', 'n.justNow', 'n.minAgo', 'n.hAgo', 'n.dAgo',
    't.min', 't.hmin', 't.delay', 't.km', 't.noKey', 't.noKeySub',
    't.futureDetail', 't.cap', 't.refused', 't.storage',
    'a.generic', 'a.since', 'a.shelter', 'a.shelterFor', 'a.nearby', 'a.offline',
    // batch 8: the "no connection · last answer" line, the alert preview and the Alerts screen
    'a.offlineSince', 'a.preview', 'screen.alerts', 'a.home.quiet', 'a.checked', 'a.checking', 'a.near.title', 'a.near.quiet',
    'a.recent', 'a.recent.none',
    // batch 10: the home-alert line and the city picker (the route and home names now come from js/cities.js)
    'a.banner', 'a.bannerSince', 'city.title', 'city.sub', 'city.hint', 'city.saveFailed', 'city.saved']
    .concat(ctx.Config.news.feeds.map((f) => 'n.src.' + f.id), ctx.Config.news.columns.map((c) => 'n.col.' + c.id))
    .concat(ctx.Config.traffic.columns.map((c) => 't.col.' + c.id))
    .concat(['ok', 'slow', 'jam'].map((l) => 't.level.' + l))
    .concat(['missiles', 'aircraft', 'infiltration', 'earthquake', 'tsunami', 'hazmat', 'radiological', 'prealert'].map((k) => 'a.kind.' + k));
  for (const lang of ['ru', 'en']) {
    ctx.I18n.setLang(lang);
    for (const k of keys) assert.ok(ctx.I18n.t(k) && ctx.I18n.t(k) !== k, lang + ' ' + k);
  }
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.t('a.kind.missiles'), 'Ракетный обстрел');
  assert.equal(ctx.I18n.t('t.noKey'), 'Подключите токен Mapbox, чтобы видеть пробки');
  // Batch 7: the Mapbox map says «Карта недоступна» again (m.unavailable, m.staleFrom); t.dataFrom stays gone.
  for (const gone of ['t.limit', 'n.partial', 't.col.roads', 't.road.ayalon', 't.dataFrom', 'place.rehovot', 't.route.tlv', 't.route.glilot']) assert.equal(ctx.I18n.t(gone), gone, gone + ' has no reader: removed');
});

test('"how long ago" for a headline: just now, minutes, hours, days; a time in the future reads "just now"', () => {
  const ctx = load(FILES);
  ctx.I18n.setLang('ru');
  const m = 60000;
  assert.deepEqual([0, 59999, m, 12 * m, 59 * m, 60 * m, 23 * 60 * m + 59 * m, 24 * 60 * m, 3 * 24 * 60 * m, -5 * m].map((d) => ctx.I18n.ago(d)),
    ['Только что', 'Только что', '1 мин назад', '12 мин назад', '59 мин назад', '1 ч назад', '23 ч назад', '1 дн. назад', '3 дн. назад', 'Только что']);
  ctx.I18n.setLang('en');
  assert.equal(ctx.I18n.ago(12 * m), '12 min ago');
});

// FB5C-7 (the judges' COMMON DECISION, line 7), B17-V3: the traffic copy, exactly — its header now in the one state
// vocabulary (js/view-state.js: «Обновлено в 20:32 · 12 мин назад» / «Не обновляется · данные от …»), the judges' notes as they were.
test('B17-V3: the traffic copy — fresh / stale with the age, future-dated, the daily cap, a Mapbox refusal, storage', () => {
  const ctx = load(FILES.concat(['js/html.js']));
  const t = (k, p) => ctx.I18n.t(k, p), head = ctx.ViewState.headText;
  assert.equal(head('fresh', '20:32', [ctx.I18n.ago(12 * 60000)]), 'Обновлено в 20:32 · 12 мин назад');
  assert.equal(head('stale', '29.10 20:32', [ctx.I18n.ago(41 * 60000)]), 'Не обновляется · данные от 29.10 20:32 · 41 мин назад');
  assert.equal(head('stale', '20:32', [t('t.futureDetail')]), 'Не обновляется · данные от 20:32 · время данных требует проверки');
  assert.equal(t('t.cap', { time: '02:15' }), 'Дневной лимит запросов пробок исчерпан · обновление после 02:15');
  assert.equal(t('t.refused', { time: '20:57' }), 'Mapbox отклонил запрос (доступ или лимит) · автоматический повтор не раньше 20:57');
  assert.equal(t('t.storage'), 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов');
  assert.equal(t('st.noData'), 'нет данных', 'F17-1: one key for «no data» (lower case: a part word)');
  for (const k of ['n.noData', 't.night', 't.nightFrom', 't.badKey', 't.busy', 't.loading', 't.retryAfter', 't.updated', 't.updating', 't.updatingFrom', 't.failed', 't.future', 't.stale', 't.noData', 'n.colFailed', 'n.colFailedRetry'])
    assert.equal(t(k), k, k + ' is gone');
  for (const k of ['t.futureDetail', 't.cap', 't.refused', 't.storage'])
    assert.ok(!/1-го|05:30|06:00|месяц/.test(t(k, { time: 'X', n: 1 })), k + ': no monthly or window promise');
});

// Batch 6 (L3): Hebrew and Ukrainian are complete — every key of the Russian table has its own string in both, every
// weather code its own name. Checked on a copy of js/i18n.js without the English fallback, so a missing key shows up as
// the key itself instead of passing as English.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./harness');
function withoutFallback() {
  const src = fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8');
  const cut = src.replace("return TABLES.en.s[key] !== undefined ? TABLES.en.s[key] : key;", 'return key;')
    .replace("(TABLES.en.wmo[code] !== undefined ? TABLES.en.wmo[code] : '')", "''");
  assert.notEqual(cut, src, 'the fallback lines were found and cut');
  assert.equal((cut.match(/TABLES\.en\./g) || []).length, 0, 'no English fallback left in the copy');
  const ctx = { String, Object, RegExp };
  vm.createContext(ctx);
  vm.runInContext(cut + ';this.I18n = I18n;', ctx);
  return { I18n: ctx.I18n, keys: [...new Set([...src.matchAll(/'([a-z]+\.[A-Za-z.]+)':/g)].map((m) => m[1]))].filter((k) => !k.startsWith('n.src.')) };
}

test('L3: every interface string exists in Hebrew and Ukrainian (own strings, no English fallback), none empty', () => {
  const { I18n, keys } = withoutFallback();
  assert.ok(keys.length >= 95, 'keys found: ' + keys.length);
  for (const lang of ['ru', 'he', 'uk']) {
    I18n.setLang(lang);
    for (const k of keys) assert.ok(I18n.t(k) && I18n.t(k) !== k, lang + ' ' + k);
  }
  I18n.setLang('he');
  for (const k of keys) {
    if (/^(t\.noKeySub|w\.thousand)$/.test(k)) continue;   // a file name and a variable: Latin by nature; «1.5K» (FIX-18B 13A, pinned below)
    assert.match(I18n.t(k, { n: 1, h: 1, m: 5, t: '1°', time: '20:32', areas: 'א', text: 'א' }), /[\u0590-\u05ff]/, 'he ' + k + ' is Hebrew');
  }
  I18n.setLang('uk');
  for (const k of keys) assert.ok(!/[ыэъё]/i.test(I18n.t(k)), 'uk ' + k + ' has a Russian-only letter: ' + I18n.t(k));
});

test('L3: every Open-Meteo weather code has its own Hebrew and Ukrainian name', () => {
  const { I18n } = withoutFallback();
  for (const lang of ['he', 'uk']) {
    I18n.setLang(lang);
    for (const c of WMO) assert.ok(I18n.condition(c), lang + ' ' + c);
  }
  I18n.setLang('uk');
  assert.equal(I18n.condition(3), 'Похмуро');
  I18n.setLang('he');
  assert.equal(I18n.condition(0), 'בהיר');
});

test('L3: Hebrew reads right to left with its own days and months; Ukrainian left to right with Ukrainian days', () => {
  const ctx = load(FILES);
  ctx.I18n.setLang('he');
  assert.equal(ctx.I18n.dir(), 'rtl');
  assert.equal(ctx.I18n.dateLong(4, 29, 9), 'יום חמישי, 29 באוקטובר');
  assert.equal(ctx.I18n.weekdayShort(6), 'שבת');
  assert.equal(ctx.I18n.t('lang.name'), 'עברית');
  ctx.I18n.setLang('uk');
  assert.equal(ctx.I18n.dir(), 'ltr');
  assert.equal(ctx.I18n.dateLong(4, 29, 9), 'Четвер, 29 жовтня');
  assert.equal(ctx.I18n.weekdayShort(1), 'Пн');
  assert.equal(ctx.I18n.t('place.kyiv'), 'Київ');
  assert.equal(ctx.I18n.t('n.col.il'), 'Україна', 'the left news column is about Ukraine');
  assert.equal(ctx.I18n.t('lang.name'), 'Українська');
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.t('lang.name'), 'Русский');
});

test('L3: in Hebrew a signed figure stays left to right (LRE … PDF); in Russian and Ukrainian nothing is added', () => {
  const ctx = load(FILES);
  const LRE = '\u202a', PDF = '\u202c';
  ctx.I18n.setLang('he');
  assert.equal(ctx.I18n.ltr('−4°'), LRE + '−4°' + PDF);
  assert.equal(ctx.I18n.t('clock.ahead', { h: 9 }), LRE + '+9' + PDF + ' שע׳');
  assert.equal(ctx.I18n.t('t.delay', { n: 14 }), LRE + '+14' + PDF + ' דק׳');
  for (const lang of ['ru', 'uk']) {
    ctx.I18n.setLang(lang);
    assert.equal(ctx.I18n.ltr('−4°'), '−4°', lang);
    assert.ok(!/[\u202a-\u202e]/.test(ctx.I18n.t('clock.ahead', { h: 9 })), lang);
  }
});

test('L2: news source names are the same in every language; each language names its own columns', () => {
  const ctx = load(FILES);
  const col = (lang) => { ctx.I18n.setLang(lang); return [ctx.I18n.t('n.col.il'), ctx.I18n.t('n.col.econ')]; };
  assert.deepEqual(col('ru'), ['Израиль', 'Экономика']);
  assert.deepEqual(col('he'), ['ישראל', 'כלכלה']);
  assert.deepEqual(col('uk'), ['Україна', 'Економіка']);
  for (const lang of ['ru', 'he', 'uk']) {
    ctx.I18n.setLang(lang);
    assert.deepEqual([...ctx.Config.news.feeds.map((f) => ctx.I18n.t('n.src.' + f.id))],
      ['NEWSru', 'NEWSru', 'Ynet', 'Globes', 'Українська правда', 'Економічна правда'], lang);
  }
});


// ---- Batch 12: the names of the data — 59 weekly parashot (every one Hebcal used over 20 Israeli years), the 19 holidays
// and fasts on the screen, the 14 Hebrew months — and the screen's own strings, in Russian, Hebrew and Ukrainian, each its
// own (checked with the English fallback cut out). Keys with a hyphen or an apostrophe escape the L3 scan above, so they
// are listed here explicitly.
const PARASHOT = Object.keys(require('./fixtures/hebcal/parashot-names.json'));
const SLUGS = ['rosh-hashana', 'yom-kippur', 'sukkot', 'shmini-atzeret', 'chanukah', 'tu-bishvat', 'purim', 'shushan-purim', 'pesach', 'yom-hashoah',
  'yom-hazikaron', 'yom-haatzmaut', 'lag-baomer', 'yom-yerushalayim', 'shavuot', 'tisha-bav', 'tzom-gedaliah', 'asara-btevet', 'taanit-esther', 'tzom-tammuz'];
const MONTHS = ['Nisan', 'Iyyar', 'Sivan', 'Tamuz', 'Av', 'Elul', 'Tishrei', 'Cheshvan', 'Kislev', 'Tevet', "Sh'vat", 'Adar', 'Adar I', 'Adar II'];
const B12_UI = ['screen.shabbat', 'sh.candles', 'sh.havdalah', 'sh.week', 'sh.shabbat', 'sh.parashaOf', 'sh.greet.shabbat',
  'sh.greet.yomtov', 'sh.greet.yomkippur', 'sh.today', 'sh.tomorrow', 'sh.inDays', 'sh.inHM', 'sh.inM', 'sh.ongoing', 'sh.todayIs', 'sh.fastTimes',
  'sh.upcoming', 'sh.hdate', 'w.uv', 'w.air', 'w.dustLabel', 'w.dustUnit', 'w.airShort', 'w.uv.low', 'w.uv.moderate', 'w.uv.high', 'w.uv.veryHigh', 'w.uv.extreme',
  'w.air.good', 'w.air.fair', 'w.air.moderate', 'w.air.poor', 'w.air.veryPoor', 'w.air.extreme', 'w.air.khamsinWord',
  'w.airShort.good', 'w.airShort.fair', 'w.airShort.moderate', 'w.airShort.poor', 'w.airShort.veryPoor', 'w.airShort.extreme'];   // G4

test('B12: 59 parashot, 20 holidays and fasts (+ Shushan Purim, S9-2), 14 months and the screen\'s strings — own words in Russian, Hebrew and Ukrainian', () => {
  const { I18n } = withoutFallback();
  assert.equal(PARASHOT.length, 59);
  const keys = B12_UI.concat(PARASHOT.map((p) => 'sh.parasha.' + p), SLUGS.map((s) => 'sh.h.' + s), MONTHS.map((m) => 'sh.month.' + m));
  const seen = {};
  for (const lang of ['ru', 'he', 'uk']) {
    I18n.setLang(lang);
    for (const k of keys) {
      const v = I18n.t(k);
      assert.ok(v && v !== k, lang + ' ' + k);
      seen[lang + ' ' + k] = v;
    }
  }
  I18n.setLang('uk');
  for (const k of keys) assert.ok(!/[ыэъё]/i.test(I18n.t(k)), 'uk ' + k + ' has a Russian-only letter: ' + I18n.t(k));
  I18n.setLang('he');
  for (const k of keys) {
    if (k === 'w.uv' || k === 'sh.hdate') continue;                       // «מדד UV», «{day} ב{month} {year}»: checked below
    if (k === 'w.thousand') { assert.equal(I18n.t(k, { n: '1.5' }), '1.5K'); continue; }   // FIX-18B 13A: «1.5K» as Israeli screens write thousands; «1.5 א׳» did not fit a band cell (12.7 px between neighbours)
    if (/^(sh\.week|sh\.parashaOf|sh\.todayIs|sh\.fastTimes)$/.test(k)) continue;   // a {name} template: Hebrew words around it
    assert.match(I18n.t(k, { n: 1, h: 1, m: 5 }), /[֐-׿]/, 'he ' + k + ' is Hebrew');
  }
  // two parashot named the same in Russian (Hebcal's «Ваера» for both): never confused
  assert.notEqual(seen['ru sh.parasha.Vayera'], seen['ru sh.parasha.Vaera']);
});

test('B12: the short date of a list: short weekday, day, month in each language', () => {
  const ctx = load(FILES);
  const d = (lang) => { ctx.I18n.setLang(lang); return ctx.I18n.dateShort(5, 4, 11); };
  assert.deepEqual(['ru', 'he', 'uk', 'en'].map(d), ['Пт, 4 декабря', 'שישי, 4 בדצמבר', 'Пт, 4 грудня', 'Fri, December 4']);
});

test('FIX-12B: «Сегодня, 10 апреля» needs a day-month form; the unused «sh.loading» is gone', () => {
  const ctx = load(FILES);
  const d = (lang) => { ctx.I18n.setLang(lang); return ctx.I18n.dayMonth(10, 3); };
  assert.deepEqual(['ru', 'he', 'uk', 'en'].map(d), ['10 апреля', '10 באפריל', '10 квітня', 'April 10']);
  for (const lang of ['ru', 'he', 'uk', 'en']) { ctx.I18n.setLang(lang); assert.equal(ctx.I18n.t('sh.loading'), 'sh.loading', lang); }
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.t('w.uv'), 'УФ макс.');
});

// ---- The weekly reading on the Shabbat screen: its labels, the nine special Shabbatot and every book of the Torah and the
// prophets — own words in Russian, Hebrew and Ukrainian. Every book the recorded Hebcal answers name has its entry.
const READ_UI = ['sh.read.parasha', 'sh.read.torah', 'sh.read.haftarah', 'sh.read.special', 'sh.read.mevarchim', 'sh.read.rc', 'sh.read.rcText',
  'sh.read.omer', 'sh.read.omerDay'];
const SPECIALS = ['shabbat-shekalim', 'shabbat-zachor', 'shabbat-parah', 'shabbat-hachodesh', 'shabbat-hagadol', 'shabbat-chazon', 'shabbat-nachamu',
  'shabbat-shuva', 'shabbat-shirah'];
const BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'I Samuel', 'II Samuel', 'I Kings', 'II Kings', 'Isaiah',
  'Jeremiah', 'Ezekiel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Ruth', 'Esther', 'Lamentations', 'Ecclesiastes', 'Song of Songs'];

test('Reading: the labels, 9 special Shabbatot and 31 books — own words in Russian, Hebrew and Ukrainian; every recorded book is covered', () => {
  const fs = require('node:fs'), path = require('node:path'), dir = path.join(__dirname, 'fixtures/hebcal');
  const named = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => /-ly\.json$/.test(n))) {
    for (const it of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).items) {
      const l = it.leyning || {};
      for (const ref of [l.torah, l.haftarah]) {
        if (ref) String(ref).replace(/ \| .*$/, '').split('; ').forEach((part) => { const m = /^(.+?) \d/.exec(part); if (m) named.add(m[1]); });
      }
    }
  }
  assert.ok(named.size >= 15, 'the recordings name books: ' + [...named]);
  for (const b of named) assert.ok(BOOKS.includes(b), 'a recorded book without an entry: ' + b);
  const { I18n } = withoutFallback();
  const keys = READ_UI.concat(SPECIALS.map((s) => 'sh.special.' + s), BOOKS.map((b) => 'sh.book.' + b));
  for (const lang of ['ru', 'he', 'uk']) {
    I18n.setLang(lang);
    for (const k of keys) { const v = I18n.t(k); assert.ok(v && v !== k, lang + ' ' + k); }
  }
  I18n.setLang('uk');
  for (const k of keys) assert.ok(!/[ыэъё]/i.test(I18n.t(k)), 'uk ' + k + ': ' + I18n.t(k));
  I18n.setLang('he');
  for (const k of keys) assert.match(I18n.t(k, { n: 3, month: 'כסלו' }), /[֐-׿]/, 'he ' + k + ' is Hebrew');
});

// F-5 (FIX-16B): «Прогноз на {n} дней» / «Прогноз на {n} днів» read right only for 5–20 days (no plural forms in the tables):
// the forecast with a title is pinned to 7, so a change is a change of this test and of the strings. Batch 18: the Israel
// screen shows 7 days too (the owner), with no title over them — so no plural to keep right there.
test('F-5: the titled forecast length stays where the ru/uk plural «дней»/«днів» is right — 7 days at home; the Israel screen 7, untitled', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Config.weather.days, 7);
  assert.equal(ctx.Config.israel.days, 7);
  assert.ok([5, 7].includes(ctx.Config.weather.days));
});

// G2 (5/5): the city picker's hint draws the remote's arrows itself (▲▼◀▶ are not in the TV's font subsets, and as text
// they turn inward in Hebrew): no arrow glyph in any table, the two places the view draws them marked once each.
test('G2: city.hint carries no arrow glyph in any language, only the {ud} and {lr} places the view draws', () => {
  const ctx = load(FILES);
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    ctx.I18n.setLang(lang);
    const h = ctx.I18n.t('city.hint');
    assert.ok(!/[\u25b2\u25b6\u25bc\u25c0]/.test(h), lang + ': ' + h);
    assert.deepEqual([h.split('{ud}').length, h.split('{lr}').length, h.indexOf('{ud}') < h.indexOf('{lr}')], [2, 2, true], lang + ': ' + h);
  }
});
