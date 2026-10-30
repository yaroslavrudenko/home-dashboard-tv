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
    'clock.behind', 'clock.unknown', 'w.feels', 'w.high', 'w.low', 'w.wind', 'w.humidity', 'w.rain', 'w.sunrise',
    'w.sunset', 'w.kmh', 'w.now', 'w.today', 'w.hourly', 'w.daily', 'w.updated', 'w.stale', 'w.loading', 'w.failed', 'w.retry', 'w.retrySoon'];
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
  assert.equal(ctx.I18n.t('w.updated', { time: '20:32' }), 'Обновлено в 20:32');
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
  const keys = ['screen.main', 'screen.news', 'screen.traffic', 'screen.map', 'n.justNow', 'n.minAgo', 'n.hAgo', 'n.dAgo', 'n.loading', 'n.failed', 'n.colFailed', 'n.colFailedRetry', 'n.failedRetry',
    't.min', 't.hmin', 't.delay', 't.km', 't.noData', 't.noKey', 't.noKeySub', 't.failed',
    't.updated', 't.updating', 't.updatingFrom', 't.future', 't.stale', 't.cap', 't.refused', 't.storage', 'm.loading', 'm.unavailable', 'm.staleFrom',
    'a.generic', 'a.since', 'a.shelter', 'a.shelterFor', 'a.nearby', 'a.offline',
    // batch 8: the "no connection · last answer" line, the alert preview and the Alerts screen
    'a.offlineSince', 'a.preview', 'screen.alerts', 'a.home.quiet', 'a.checked', 'a.checking', 'a.near.title', 'a.near.quiet',
    'a.recent', 'a.recent.none', 'a.recent.loading', 'a.recent.failed',
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

// FB5C-7 (the judges' COMMON DECISION, line 7): the traffic copy, exactly.
test('FB5C-7: the traffic copy — updated, updating, failed, future-dated, stale, the daily cap, a Mapbox refusal, storage', () => {
  const ctx = load(FILES);
  const t = (k, p) => ctx.I18n.t(k, p);
  assert.equal(t('t.updated', { time: '20:32', n: 3 }), 'Обновлено 20:32 · 3 мин назад');
  assert.equal(t('t.updating'), 'Обновляется…');
  assert.equal(t('t.updatingFrom', { time: '20:32' }), 'Обновляется… · данные от 20:32');
  assert.equal(t('t.failed'), 'Не удалось обновить пробки');
  assert.equal(t('t.future'), 'Данные устарели · время данных требует проверки');
  assert.equal(t('t.stale', { time: '29.10 20:32', n: 41 }), 'Данные устарели · обновлено 29.10 20:32 · 41 мин назад');
  assert.equal(t('t.cap', { time: '02:15' }), 'Дневной лимит запросов пробок исчерпан · обновление после 02:15');
  assert.equal(t('t.refused', { time: '20:57' }), 'Mapbox отклонил запрос (доступ или лимит) · автоматический повтор не раньше 20:57');
  assert.equal(t('t.storage'), 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов');
  assert.equal(t('t.noData'), 'Нет данных');
  // FB5D-R1: a news column that failed says so (never the neutral «Нет данных», now gone)
  assert.equal(t('n.colFailedRetry', { time: '20:34' }), 'Не удалось загрузить · повторим в 20:34');
  assert.equal(t('n.colFailed'), 'Не удалось загрузить');
  assert.equal(t('n.noData'), 'n.noData', 'n.noData is gone');
  for (const k of ['t.night', 't.nightFrom', 't.badKey', 't.busy', 't.loading', 't.retryAfter']) assert.equal(t(k), k, k + ' is gone');
  for (const k of ['t.updated', 't.updating', 't.updatingFrom', 't.failed', 't.future', 't.stale', 't.cap', 't.refused', 't.storage'])
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
    if (/^t\.noKeySub$/.test(k)) continue;                 // a file name and a variable: Latin by nature, Hebrew around them
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

