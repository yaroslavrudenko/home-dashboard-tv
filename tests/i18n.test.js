'use strict';
// Interface strings: Russian by default, English complete, every weather code named in both.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const FILES = ['js/config.js', 'js/i18n.js'];
const WMO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

test('Russian is the default language; English is available', () => {
  const ctx = load(FILES);
  assert.equal(ctx.Config.lang, 'ru');
  assert.deepEqual([...ctx.I18n.languages()].sort(), ['en', 'ru']);
});

test('every string key exists in both languages and is not empty', () => {
  const ctx = load(FILES);
  const keys = ['city.israel', 'city.ukraine', 'city.sydney', 'place.rehovot', 'place.kyiv', 'place.sydney', 'clock.same', 'clock.ahead',
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
  ctx.I18n.setLang('he');
  assert.equal(ctx.I18n.lang(), 'en', 'an unknown language falls back to English');
});

test('batch 2: every screen, source, traffic and alert string exists in both languages', () => {
  const ctx = load(FILES);
  // FB5: n.more, t.roads, t.from and t.usual had no reader and are gone; the columns, the map and the refusal header added.
  // FB5B: the road widgets (t.road.*, t.col.roads), n.partial and the "today" limit (t.limit) are gone; the month cap,
  // 429, the night window and the news column/header states added.
  // FB5C: the night window, the month cap and the per-status refusal copy are gone; the judges' exact copy added.
  const keys = ['screen.main', 'screen.news', 'screen.traffic', 'screen.map', 'n.justNow', 'n.minAgo', 'n.hAgo', 'n.dAgo', 'n.loading', 'n.failed', 'n.noData', 'n.failedRetry',
    't.min', 't.hmin', 't.delay', 't.km', 't.noData', 't.noKey', 't.noKeySub', 't.failed',
    't.updated', 't.updating', 't.updatingFrom', 't.future', 't.stale', 't.cap', 't.refused', 't.storage', 't.dataFrom', 'm.loading', 'm.unavailable',
    'a.generic', 'a.since', 'a.shelter', 'a.shelterFor', 'a.nearby', 'a.offline']
    .concat(ctx.Config.news.feeds.map((f) => 'n.src.' + f.id), ctx.Config.news.columns.map((c) => 'n.col.' + c.id))
    .concat(ctx.Config.traffic.columns.map((c) => 't.col.' + c.id))
    .concat(ctx.Config.traffic.routes.map((r) => 't.route.' + r.id))
    .concat(['ok', 'slow', 'jam'].map((l) => 't.level.' + l))
    .concat(['missiles', 'aircraft', 'infiltration', 'earthquake', 'tsunami', 'hazmat', 'radiological', 'prealert'].map((k) => 'a.kind.' + k));
  for (const lang of ['ru', 'en']) {
    ctx.I18n.setLang(lang);
    for (const k of keys) assert.ok(ctx.I18n.t(k) && ctx.I18n.t(k) !== k, lang + ' ' + k);
  }
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.t('a.kind.missiles'), 'Ракетный обстрел');
  assert.equal(ctx.I18n.t('t.noKey'), 'Подключите ключ TomTom, чтобы видеть пробки');
  for (const gone of ['t.limit', 'n.partial', 't.col.roads', 't.road.ayalon']) assert.equal(ctx.I18n.t(gone), gone, gone + ' has no reader: removed');
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
test('FB5C-7: the traffic copy — updated, updating, failed, future-dated, stale, the daily cap, a TomTom refusal, storage', () => {
  const ctx = load(FILES);
  const t = (k, p) => ctx.I18n.t(k, p);
  assert.equal(t('t.updated', { time: '20:32', n: 3 }), 'Обновлено 20:32 · 3 мин назад');
  assert.equal(t('t.updating'), 'Обновляется…');
  assert.equal(t('t.updatingFrom', { time: '20:32' }), 'Обновляется… · данные от 20:32');
  assert.equal(t('t.failed'), 'Не удалось обновить пробки');
  assert.equal(t('t.future'), 'Данные устарели · время данных требует проверки');
  assert.equal(t('t.stale', { time: '29.10 20:32', n: 41 }), 'Данные устарели · обновлено 29.10 20:32 · 41 мин назад');
  assert.equal(t('t.cap', { time: '02:15' }), 'Дневной лимит запросов пробок исчерпан · обновление после 02:15');
  assert.equal(t('t.refused', { time: '20:57' }), 'TomTom отклонил запрос (доступ или лимит) · повтор не раньше 20:57');
  assert.equal(t('t.storage'), 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов');
  assert.equal(t('t.noData'), 'Нет данных');
  for (const k of ['t.night', 't.nightFrom', 't.badKey', 't.busy', 't.loading', 't.retryAfter']) assert.equal(t(k), k, k + ' is gone');
  for (const k of ['t.updated', 't.updating', 't.updatingFrom', 't.failed', 't.future', 't.stale', 't.cap', 't.refused', 't.storage'])
    assert.ok(!/1-го|05:30|06:00|месяц/.test(t(k, { time: 'X', n: 1 })), k + ': no monthly or window promise');
});
