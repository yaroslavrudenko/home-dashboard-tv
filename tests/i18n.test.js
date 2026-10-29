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
    'clock.behind', 'clock.approx', 'clock.unknown', 'w.feels', 'w.high', 'w.low', 'w.wind', 'w.humidity', 'w.rain', 'w.sunrise',
    'w.sunset', 'w.kmh', 'w.now', 'w.today', 'w.hourly', 'w.daily', 'w.updated', 'w.stale', 'w.loading', 'w.failed'];
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
