'use strict';
// Pure formatting used by the view: temperatures and the clock difference.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load(['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js']);

test('temperatures use a typographic minus and never show "-0°"', () => {
  assert.equal(ctx.View.temp(21.4), '21°');
  assert.equal(ctx.View.temp(-0.3), '0°');
  assert.equal(ctx.View.temp(-3.6), '−4°');
  assert.equal(ctx.View.temp(null), '—');
});

test('clock difference to the home clock', () => {
  ctx.I18n.setLang('ru');
  assert.equal(ctx.View.diffText(120, 120), 'Как здесь');
  assert.equal(ctx.View.diffText(660, 120), '+9 ч');
  assert.equal(ctx.View.diffText(60, 120), '−1 ч');
  assert.equal(ctx.View.diffText(450, 120), '+5:30 ч');
  assert.equal(ctx.View.diffText(undefined, 120), '');
});

test('the home clock shows no difference to itself', () => {
  ctx.I18n.setLang('ru');
  assert.equal(ctx.View.diffText(120, undefined), '', 'App passes no home offset for the home clock');
});

test('every weather code maps to an icon', () => {
  for (const c of [0, 1, 2, 3, 45, 51, 61, 71, 80, 95, 99]) assert.match(ctx.Icons.weather(c, true), /^<svg class="icon /);
});

// ---- Batch 12: the air & UV block in the main "now" card, the air chip on the Israel cards ---------------------------
const B12 = ['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js', 'js/view-israel.js'];
function fakeDoc() {
  const nodes = {};
  const node = (id) => {
    if (nodes[id]) return nodes[id];
    let html = '';
    const n = { id, className: '', writes: 0 };
    Object.defineProperty(n, 'innerHTML', { get: () => html, set: (v) => { html = v; n.writes++; } });
    return (nodes[id] = n);
  };
  return { nodes, getElementById: node, querySelector: (sel) => node(sel.replace(/^#/, '')) };
}
// A weather view as Weather.forHour gives it (only what the now card reads).
const NOW_VIEW = { current: { temp: 22.4, feels: 22.1, code: 0, isDay: true, wind: 12, humidity: 64 },
  today: { min: 17, max: 25, pop: 0, sunrise: '06:01', sunset: '16:51' }, hourly: [], daily: [], nowShown: true };
const stripTags = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
function mainWith(lang, s) {
  const ctx = load(B12);
  ctx.I18n.setLang(lang);
  const doc = fakeDoc();
  ctx.View.init(doc, [], { hours: 12, days: 7 });
  ctx.View.renderWeather(NOW_VIEW, Object.assign({ name: 'Реховот', kind: 'fresh', retryAt: '' }, s));
  const html = doc.nodes.now.innerHTML, i = html.indexOf('<div class="now-air');
  return { html, block: i < 0 ? null : html.slice(i, html.indexOf('<div class="now-icon">')), cls: doc.nodes.now.className };
}
const FAIR = { aqi: 38, level: 'fair', dust: 25, dustHigh: false };          // Air.summary shapes: rounded by the data side
const DUSTY = { aqi: 104, level: 'extreme', dust: 240, dustHigh: true };
const DUST_NO_AQI = { aqi: null, level: null, dust: 240, dustHigh: true };

test('B12 air & UV: between the place text and the icon, no glyphs; UV and air each a label, a figure and a level word', () => {
  const r = mainWith('ru', { uv: { index: 5, level: 'moderate' }, air: FAIR, airKind: 'fresh' });
  assert.ok(r.html.indexOf('now-main') < r.html.indexOf('now-air') && r.html.indexOf('now-air') < r.html.indexOf('now-icon'), 'between the text and the icon');
  assert.ok(!/<svg/.test(r.block), 'no glyph icons in the block');
  assert.deepEqual(stripTags(r.block), ['УФ макс.', '5', 'умеренный', 'Качество воздуха', '38', 'приемлемое']);
  assert.match(r.block, /<span class="air-word lv-moderate">умеренный<\/span>/);
  assert.match(r.block, /<span class="air-word lv-fair">приемлемое<\/span>/);
  assert.match(r.html, /<div class="details">/, 'the details row is still there, unchanged');
});

test('B12 air: high dust adds the amber dust line; in every language', () => {
  for (const [lang, words] of [['ru', ['УФ макс.', '9', 'очень высокий', 'Качество воздуха', '104', 'опасное', 'Пыль · 240 мкг/м³']],
    ['he', ['מדד UV מרבי', '9', 'גבוה מאוד', 'איכות האוויר', '104', 'מסוכנת', 'אבק · 240 מק״ג/מ״ק']],
    ['uk', ['УФ макс.', '9', 'дуже високий', 'Якість повітря', '104', 'небезпечне', 'Пил · 240 мкг/м³']]]) {
    const r = mainWith(lang, { uv: { index: 9, level: 'veryHigh' }, air: DUSTY, airKind: 'fresh' });
    assert.deepEqual(stripTags(r.block), words, lang);
  }
  assert.ok(!/air-dust/.test(mainWith('ru', { uv: null, air: FAIR, airKind: 'fresh' }).block), 'ordinary dust: no dust line');
});

test('B12 air: loading keeps the slot (a placeholder bar), failed says «Нет данных», stale is dimmed, no UV reads «—»', () => {
  const loading = mainWith('ru', { uv: { index: 3, level: 'moderate' }, air: null, airKind: 'loading' });
  assert.match(loading.block, /<span class="skeleton air-skeleton"><\/span>/);
  assert.deepEqual(stripTags(loading.block), ['УФ макс.', '3', 'умеренный', 'Качество воздуха']);
  const failed = mainWith('ru', { uv: null, air: null, airKind: 'failed' });
  assert.deepEqual(stripTags(failed.block), ['УФ макс.', '—', 'Качество воздуха', 'Нет данных']);
  const noLevel = mainWith('ru', { uv: null, air: { aqi: null, level: null, dust: null, dustHigh: false }, airKind: 'fresh' });
  assert.deepEqual(stripTags(noLevel.block).slice(-1), ['Нет данных'], 'a missing level is never a made-up one');
  assert.match(mainWith('ru', { uv: null, air: FAIR, airKind: 'stale' }).block, /^<div class="now-air is-stale">/);
  assert.match(mainWith('ru', { uv: null, air: FAIR, airKind: 'fresh' }).block, /^<div class="now-air">/);
});

function israelWith(lang, air, airKind) {
  const ctx = load(B12);
  ctx.I18n.setLang(lang);
  const doc = fakeDoc();
  const regions = [{ id: 'center', place: 'telaviv' }];
  ctx.IsraelView.init(doc, regions);
  const card = { region: regions[0], view: null, kind: 'loading', retryAt: '', key: 'k1', air, airKind };
  ctx.IsraelView.render([card], 5, { kind: 'none', updated: '' });
  const html = doc.nodes['region-center'].innerHTML;
  return { ctx, doc, card, regions, head: html.slice(0, html.indexOf('</div>') + 6) };
}

test('B12 Israel chip: the air glyph and one word at the end of the region head; «пыль» when the dust is high', () => {
  const fair = israelWith('ru', FAIR, 'fresh');
  assert.match(fair.head, /<span class="region-air lv-fair"><svg class="icon g-air"[\s\S]*<\/svg><span class="region-air-word">приемлемое<\/span><\/span><\/div>$/);
  assert.match(israelWith('ru', DUSTY, 'fresh').head, /<span class="region-air lv-extreme">[\s\S]*>пыль<\/span>/, 'V3: the colour is the level\'s, the word «пыль»');
  assert.match(israelWith('he', FAIR, 'fresh').head, />סבירה</);
  assert.match(israelWith('uk', DUSTY, 'fresh').head, />пил</);
  assert.match(israelWith('ru', FAIR, 'stale').head, /region-air lv-fair is-stale/);
  assert.match(israelWith('ru', null, 'loading').head, /<span class="region-air is-reserved"><\/span>/, 'loading: an empty reserved box');
  assert.ok(!/region-air/.test(israelWith('ru', null, 'failed').head), 'no data: no chip');
});

test('B12 Israel chip: an air answer alone redraws the card (the air is in the card key)', () => {
  const r = israelWith('ru', null, 'loading');
  const el = r.doc.nodes['region-center'];
  assert.equal(el.writes, 1);
  r.ctx.IsraelView.render([r.card], 5, { kind: 'none', updated: '' });
  assert.equal(el.writes, 1, 'same card, same air: not rewritten');
  r.ctx.IsraelView.render([Object.assign({}, r.card, { air: FAIR, airKind: 'fresh' })], 5, { kind: 'none', updated: '' });
  assert.equal(el.writes, 2);
});

// ---- FIX-12B ------------------------------------------------------------------------------------------------------
test('V4: after sunset the UV level word is dimmed (the day\'s maximum is behind); by day it is not', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 12, days: 7 });
  const night = Object.assign({}, NOW_VIEW, { current: Object.assign({}, NOW_VIEW.current, { isDay: false }) });
  ctx.View.renderWeather(night, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: { index: 5, level: 'moderate' }, air: FAIR, airKind: 'fresh' });
  assert.match(doc.nodes.now.innerHTML, /<div class="air-item air-uv is-night">/);
  assert.match(mainWith('ru', { uv: { index: 5, level: 'moderate' }, air: FAIR, airKind: 'fresh' }).block, /<div class="air-item air-uv">/);
});

test('V12: high dust is said even when the AQI is missing — main line and region chip, ru/he/uk, fresh and stale', () => {
  for (const [lang, none, dust, word] of [['ru', 'Нет данных', 'Пыль · 240 мкг/м³', 'пыль'], ['he', 'אין נתונים', 'אבק · 240 מק״ג/מ״ק', 'אבק'],
    ['uk', 'Немає даних', 'Пил · 240 мкг/м³', 'пил']]) {
    for (const kind of ['fresh', 'stale']) {
      const r = mainWith(lang, { uv: null, air: DUST_NO_AQI, airKind: kind });
      assert.deepEqual(stripTags(r.block).slice(-2), [none, dust], lang + ' ' + kind + ': «no data» for the AQI, the dust line kept');
      const chip = israelWith(lang, DUST_NO_AQI, kind).head;
      assert.match(chip, new RegExp('<span class="region-air lv-dust' + (kind === 'stale' ? ' is-stale' : '') + '">[\\s\\S]*>' + word + '<\\/span>'), lang + ' ' + kind);
    }
  }
});

test('V13: the region card is keyed by what the chip shows — AQI 31 → 39 (both fair) writes nothing; fair → moderate writes once', () => {
  const r = israelWith('ru', { aqi: 31, level: 'fair', dust: 18, dustHigh: false }, 'fresh');
  const el = r.doc.nodes['region-center'];
  const again = (air, kind) => r.ctx.IsraelView.render([Object.assign({}, r.card, { air, airKind: kind || 'fresh' })], 5, { kind: 'none', updated: '' });
  again({ aqi: 39, level: 'fair', dust: 22, dustHigh: false });
  assert.equal(el.writes, 1, 'same word, same colour: not rewritten');
  again({ aqi: 120, level: 'extreme', dust: 150, dustHigh: true });
  again({ aqi: 130, level: 'extreme', dust: 210, dustHigh: true });
  assert.equal(el.writes, 2, 'dust 150 → 210: the same «пыль»');
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false });
  assert.equal(el.writes, 3);
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false }, 'stale');
  assert.equal(el.writes, 4, 'stale dims the chip: a change');
});
