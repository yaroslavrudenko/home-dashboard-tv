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
  assert.deepEqual(stripTags(r.block), ['УФ макс.', '5', 'умеренный', 'Качество воздуха', '38', 'приемлемое', 'Пыль', '25', 'мкг/м³']);
  assert.match(r.block, /<span class="air-word lv-moderate">умеренный<\/span>/);
  assert.match(r.block, /<span class="air-word lv-fair">приемлемое<\/span>/);
  assert.match(r.html, /<div class="details">/, 'the details row is still there, unchanged');
});

test('B12 air: high dust is a khamsin — the dust item «Пыль · 240 мкг/м³ хамсин», amber word; in every language', () => {
  for (const [lang, words] of [['ru', ['УФ макс.', '9', 'очень высокий', 'Качество воздуха', '104', 'опасное', 'Пыль', '240', 'мкг/м³', 'хамсин']],
    ['he', ['מדד UV מרבי', '9', 'גבוה מאוד', 'איכות האוויר', '104', 'מסוכנת', 'אבק', '240', 'מק״ג/מ״ק', 'חמסין']],
    ['uk', ['УФ макс.', '9', 'дуже високий', 'Якість повітря', '104', 'небезпечне', 'Пил', '240', 'мкг/м³', 'хамсин']]]) {
    const r = mainWith(lang, { uv: { index: 9, level: 'veryHigh' }, air: DUSTY, airKind: 'fresh' });
    assert.deepEqual(stripTags(r.block), words, lang);
  }
  assert.deepEqual(stripTags(mainWith('ru', { uv: null, air: FAIR, airKind: 'fresh' }).block).slice(-3), ['Пыль', '25', 'мкг/м³'], 'ordinary dust: its own labelled item');
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
  // head: the region head and, right under it, the air line (its own line since the owner's «должно быть понятно»)
  const line = html.match(/<div class="region-air[^"]*">.*?<\/div>/);
  return { ctx, doc, card, regions, head: html.slice(0, html.indexOf('</div>') + 6) + (line ? line[0] : '') };
}

test('B12 Israel air line: labelled «Воздух: приемлемое» on its own line under the head; «Воздух: хамсин» when the dust is high', () => {
  const fair = israelWith('ru', FAIR, 'fresh');
  assert.match(fair.head, /<\/div><div class="region-air lv-fair"><span class="region-air-label">Воздух:<\/span> <span class="region-air-word">приемлемое<\/span><\/div>$/);
  for (const [lang, label] of [['he', 'אוויר:'], ['uk', 'Повітря:']]) assert.match(israelWith(lang, FAIR, 'fresh').head, new RegExp('<span class="region-air-label">' + label + '</span>'), lang);
  assert.match(israelWith('ru', DUSTY, 'fresh').head, /<div class="region-air lv-dust"><span class="region-air-label">Воздух:<\/span> <span class="region-air-word">хамсин<\/span>/, 'a khamsin: labelled, in the dust colour');
  assert.match(israelWith('he', FAIR, 'fresh').head, />סבירה</);
  assert.match(israelWith('uk', DUSTY, 'fresh').head, />хамсин</);
  assert.match(israelWith('ru', FAIR, 'stale').head, /region-air lv-fair is-stale/);
  assert.match(israelWith('ru', null, 'loading').head, /<div class="region-air is-reserved"><\/div>$/, 'loading: the line reserved, empty');
  assert.match(israelWith('ru', null, 'failed').head, /<div class="region-air is-reserved"><\/div>$/, 'no data: no words, the line still reserved (nothing moves)');
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
  for (const [lang, none, dust, word] of [['ru', 'Нет данных', ['Пыль', '240', 'мкг/м³', 'хамсин'], 'хамсин'], ['he', 'אין נתונים', ['אבק', '240', 'מק״ג/מ״ק', 'חמסין'], 'חמסין'],
    ['uk', 'Немає даних', ['Пил', '240', 'мкг/м³', 'хамсин'], 'хамсин']]) {
    for (const kind of ['fresh', 'stale']) {
      const r = mainWith(lang, { uv: null, air: DUST_NO_AQI, airKind: kind });
      assert.deepEqual(stripTags(r.block).slice(-5), [none].concat(dust), lang + ' ' + kind + ': «no data» for the AQI, the dust item kept');
      const chip = israelWith(lang, DUST_NO_AQI, kind).head;
      assert.match(chip, new RegExp('<div class="region-air lv-dust' + (kind === 'stale' ? ' is-stale' : '') + '">[\\s\\S]*>' + word + '<\\/span>'), lang + ' ' + kind);
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
  assert.equal(el.writes, 2, 'dust 150 → 210: the same «хамсин»');
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false });
  assert.equal(el.writes, 3);
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false }, 'stale');
  assert.equal(el.writes, 4, 'stale dims the chip: a change');
});

// The owner (2026-11-02): «вижу ультрофеолет - но не вижу пыли … не вижу хамсин», «открой все-равно - я хочу видть все даже если
// мало»; then «Качество воздуха:... Пыль: ... - должно быть понятно а не вкучу слеплено». The dust is ALWAYS shown, as a THIRD
// item of its own, like «УФ макс.» and «Качество воздуха»: its label «Пыль», then «27 мкг/м³» in the value style; from
// 100 µg/m³ the amber word «хамсин» in the level-word slot; no value, no item (never made up) — its slot stays reserved.
const dustItem = (block) => { const i = block.indexOf('<div class="air-item air-dust'); return i < 0 ? null : block.slice(i); };
test('Dust: its own item with its own label, the value in the value line — ru, he, uk', () => {
  for (const [lang, label, unit] of [['ru', 'Пыль', 'мкг/м³'], ['he', 'אבק', 'מק״ג/מ״ק'], ['uk', 'Пил', 'мкг/м³']]) {
    const d = dustItem(mainWith(lang, { uv: null, air: FAIR, airKind: 'fresh' }).block);
    assert.ok(d, lang + ': a dust item');
    assert.match(d, new RegExp('^<div class="air-item air-dust"><div class="air-label">' + label + '</div><div class="air-value"><span class="air-num">25</span> <span class="air-unit">' + unit.replace(/[/]/g, '\\/') + '</span></div></div>'), lang);
    assert.ok(!/air-word/.test(d), lang + ': an ordinary day has no level word');
  }
});
test('Dust: at 100 µg/m³ and more «хамсин» sits in the value line\'s word slot, amber — like «умеренный» after «5»', () => {
  for (const [lang, word] of [['ru', 'хамсин'], ['he', 'חמסין'], ['uk', 'хамсин']]) {
    const d = dustItem(mainWith(lang, { uv: null, air: DUSTY, airKind: 'fresh' }).block);
    assert.match(d, new RegExp('<div class="air-value"><span class="air-num">240</span> <span class="air-unit">[^<]+</span> <span class="air-word lv-khamsin">' + word + '</span></div>'), lang);
  }
  assert.match(dustItem(mainWith('ru', { uv: null, air: { aqi: 41, level: 'moderate', dust: 100, dustHigh: true }, airKind: 'fresh' }).block), />100<[\s\S]*>хамсин</);
});
test('Dust: no dust value — the item is not drawn (no label, no number), its slot reserved', () => {
  const r = mainWith('ru', { uv: null, air: { aqi: 38, level: 'fair', dust: null, dustHigh: false }, airKind: 'fresh' });
  assert.match(r.block, /<div class="air-item air-dust is-none"><\/div><\/div>$/);
  assert.ok(!/мкг|Пыль/.test(r.block), 'no made-up value, no orphan label');
  const loading = mainWith('ru', { uv: null, air: null, airKind: 'loading' });
  assert.match(loading.block, /<div class="air-item air-dust is-none"><\/div>/, 'before the first air answer: the slot is there too');
});

// The owner: «должно быть понятно». The chance of rain in the day lists sat squeezed under the weather icon, over its drops,
// and read as part of the icon. It is now its own small line under the icon: an umbrella glyph and the percentage, the
// icon lifted so the two never overlap; the row keeps its height.
test('Day rows: the chance of rain carries an umbrella glyph and sits apart from the weather icon', () => {
  const ctx = load(B12);
  ctx.I18n.setLang('ru');
  const day = (pop) => ({ weekday: 4, code: 61, min: 15, max: 25, pop });
  const v = { current: { temp: 20 }, today: null, daily: [day(33), day(10), day(null)] };
  const html = ctx.View.dailyHtml(v);
  const rows = html.split('<div class="day">').slice(1);
  assert.match(rows[0], /<span class="day-pop"><svg class="icon g-umbrella"[\s\S]*?<\/svg>33%<\/span>/, 'rain chance: umbrella + percentage');
  assert.match(rows[1], /<span class="day-pop"><\/span>/, 'under 20 %: nothing said, the slot kept');
  assert.match(rows[2], /<span class="day-pop"><\/span>/);
});

// ---- Batch 13: the dust forecast on screen (the owner, 2026-11-02: «а есть прогноз хамсина на каждый час дня как для
// температуры и на неделю?» → «делай оба варианта»; and «каждое значение — со своей подписью»). Under every hour's temperature
// its dust; after every day's high its maximum dust; each card's title row carries the legend at its inline end — «Пыль,
// мкг/м³» / «Пыль макс., мкг/м³» in the dust colour and the amber pill «хамсин ≥ 100»; «—» without a value; empty slots before
// the first air answer (nothing moves when it lands); dimmed when stale (B13-D2…D5).
const hourAt = (h, temp) => ({ key: '2026-11-02T' + h, hour: h, temp, code: 0, isDay: true, pop: 0 });
const dayAt = (date, weekday, min, max) => ({ date, weekday, code: 0, min, max, pop: 0, sunrise: '06:01', sunset: '16:51', uvMax: 5 });
const STRIP = Object.assign({}, NOW_VIEW, { hourly: [hourAt('16', 24), hourAt('17', 23), hourAt('18', 22), null], nowShown: true,
  daily: [dayAt('2026-11-02', 1, 17, 25), dayAt('2026-11-03', 2, 18, 27), null] });
STRIP.today = STRIP.daily[0];
const DUST_OK = { hours: [{ dust: 27, khamsin: false }, { dust: 120, khamsin: true }, null, null],
  days: [{ dust: 38, khamsin: false }, { dust: 185, khamsin: true }, null], stale: false, limit: 100 };
function stripWith(lang, dust) {
  const ctx = load(B12); ctx.I18n.setLang(lang);
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 3 });
  ctx.View.renderWeather(STRIP, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: FAIR, airKind: 'fresh', dust });
  return { hourly: doc.nodes.hourly.innerHTML, daily: doc.nodes.daily.innerHTML };
}
const slots = (html, cls) => [...html.matchAll(new RegExp('<div class="' + cls + '( is-stale)?">(.*?)</div>', 'g'))].map((m) => m[2]);
const legendOf = (html) => stripTags(html.slice(html.indexOf('<div class="dust-legend">'), html.indexOf('<div class="hours">') >= 0 ? html.indexOf('<div class="hours">') : html.indexOf('<div class="days">')));

test('B13 hourly: the title row keeps «Почасовой прогноз» and adds the legend «Пыль, мкг/м³ · хамсин ≥ 100» right after the title — ru, he, uk', () => {
  for (const [lang, title, legend] of [['ru', 'Почасовой прогноз', ['Пыль, мкг/м³', 'хамсин ≥ 100']],
    ['he', 'תחזית שעתית', ['אבק, מק״ג/מ״ק', 'חמסין ‪≥ 100‬']], ['uk', 'Погодинний прогноз', ['Пил, мкг/м³', 'хамсин ≥ 100']]]) {
    const h = stripWith(lang, DUST_OK).hourly;
    assert.match(h, new RegExp('^<div class="card-head"><div class="card-title">' + title + '</div><div class="dust-legend"><span class="dust-legend-key">'), lang);
    assert.deepEqual(legendOf(h), legend, lang);
  }
});

test('B13 hourly: every hour has its own dust line UNDER the temperature — the figure, an amber khamsin pill from 100, «—» with no value', () => {
  const h = stripWith('ru', DUST_OK).hourly;
  const hours = h.split(/<div class="hour(?: is-now| is-empty)?">/).slice(1);
  assert.match(hours[0], /<div class="hour-temp">[^<]*<\/div><div class="hour-dust"><span class="dust-num">27<\/span><\/div><\/div>$/, 'under the temperature, last in the column');
  assert.deepEqual(slots(h, 'hour-dust'), ['<span class="dust-num">27</span>', '<span class="dust-num is-khamsin">120</span>', '<span class="dust-none">—</span>', ''],   // X5: «—» muted
    'ordinary, khamsin, no value «—», an empty weather cell: an empty slot');
  assert.match(hours[3], /^<div class="hour-label">&nbsp;<\/div><div class="skeleton"><\/div>/, 'the 4th hour is the empty placeholder');
});

test('B13 daily: the title row carries «Пыль макс., мкг/м³ · хамсин ≥ 100»; each day row a dust column after the high, «—» without a value', () => {
  const d = stripWith('ru', DUST_OK).daily;
  assert.match(d, /^<div class="card-head"><div class="card-title">Прогноз на 7 дней<\/div><div class="dust-legend">/);
  assert.deepEqual(legendOf(d), ['Пыль макс., мкг/м³', 'хамсин ≥ 100']);
  assert.deepEqual(slots(d, 'day-dust'), ['<span class="dust-num">38</span>', '<span class="dust-num is-khamsin">185</span>', '']);
  assert.match(d, /<div class="day-max">[^<]*<\/div><div class="day-dust"><span class="dust-num">38<\/span><\/div><\/div>/, 'right after the high temperature');
  const none = stripWith('ru', { hours: [null, null, null, null], days: [null, null, null], stale: false, limit: 100 });
  assert.deepEqual(slots(none.daily, 'day-dust'), ['<span class="dust-none">—</span>', '<span class="dust-none">—</span>', ''], 'air failed / no forecast: «—» per day (X5: muted)');
  assert.deepEqual(slots(none.hourly, 'hour-dust'), ['<span class="dust-none">—</span>', '<span class="dust-none">—</span>', '<span class="dust-none">—</span>', ''], '… and per hour');
  assert.deepEqual(legendOf(none.hourly), ['Пыль, мкг/м³', 'хамсин ≥ 100'], 'the legend stays');
  for (const [lang, legend] of [['he', 'אבק מרבי, מק״ג/מ״ק'], ['uk', 'Пил макс., мкг/м³']]) assert.equal(legendOf(stripWith(lang, DUST_OK).daily)[0], legend, lang);
});

test('B13 no air yet: every dust slot is there and empty (its room kept), the legend shown; stale: every slot dimmed', () => {
  const r = stripWith('ru', { loading: true, limit: 100 });
  assert.deepEqual(slots(r.hourly, 'hour-dust'), ['', '', '', '']);
  assert.deepEqual(slots(r.daily, 'day-dust'), ['', '', '']);
  assert.deepEqual(legendOf(r.daily), ['Пыль макс., мкг/м³', 'хамсин ≥ 100']);
  const stale = stripWith('ru', Object.assign({}, DUST_OK, { stale: true }));
  assert.equal((stale.hourly.match(/<div class="hour-dust is-stale">/g) || []).length, 3, 'the three drawn hours');
  assert.equal((stale.daily.match(/<div class="day-dust is-stale">/g) || []).length, 2);
  assert.equal((stripWith('ru', DUST_OK).hourly.match(/is-stale/g) || []).length, 0);
  // the weather itself not there yet: the placeholders keep an empty dust slot as well
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 2, days: 2 });
  ctx.View.renderWeather(null, { name: 'Реховот', kind: 'loading', retryAt: '', dust: { loading: true, limit: 100 } });
  assert.deepEqual(slots(doc.nodes.hourly.innerHTML, 'hour-dust'), ['', '']);
  assert.deepEqual(slots(doc.nodes.daily.innerHTML, 'day-dust'), ['', '']);
});

test('B13 Israel: each region\'s days carry their dust maximum and the same legend; a new forecast alone redraws the card, the same one does not', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(), regions = [{ id: 'south', place: 'beersheva' }];
  ctx.IsraelView.init(doc, regions);
  const v = Object.assign({}, STRIP, { daily: STRIP.daily.slice(0, 2) });
  const card = (dust) => ({ region: regions[0], view: v, kind: 'fresh', retryAt: '', key: 'k1', air: FAIR, airKind: 'fresh', dust });
  const days = (dust) => ({ hours: [], days: dust, stale: false, limit: 100 });
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 185, khamsin: true }]))], 5, { kind: 'fresh', updated: '16:00' });
  const el = doc.nodes['region-south'];
  assert.match(el.innerHTML, /<div class="card-head"><div class="card-title">Прогноз на 5 дней<\/div><div class="dust-legend">/);
  assert.deepEqual(legendOf(el.innerHTML), ['Пыль макс., мкг/м³', 'хамсин ≥ 100']);
  assert.deepEqual(slots(el.innerHTML, 'day-dust'), ['<span class="dust-num">48</span>', '<span class="dust-num is-khamsin">185</span>']);
  assert.equal(el.writes, 1);
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 185, khamsin: true }]))], 5, { kind: 'fresh', updated: '16:00' });
  assert.equal(el.writes, 1, 'the same forecast: not rewritten');
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 90, khamsin: false }]))], 5, { kind: 'fresh', updated: '16:00' });
  assert.equal(el.writes, 2, 'a new forecast alone redraws the card (B13-D7)');
});

// ---- FIX-13B (the 4-reviewer panel). X4 (designer D4): the legend's «хамсин ≥ 100» is quiet grey text by default and becomes
// the amber pill only when its card shows at least one khamsin cell (same box: nothing shifts). X9 (code F4): View.dustTitle
// takes translated text for the title and the label. X5 (designer D5): «—» is a muted «dust-none», never the dust colour.
const khamsinKey = (html) => (html.match(/<span class="dust-legend-khamsin[^"]*">/) || [''])[0];
test('X4: the legend\'s «хамсин ≥ 100» is quiet by default and the amber pill only when the card shows a khamsin cell', () => {
  const lit = stripWith('ru', DUST_OK);
  assert.equal(khamsinKey(lit.hourly), '<span class="dust-legend-khamsin is-active">', 'a khamsin hour on the strip');
  assert.equal(khamsinKey(lit.daily), '<span class="dust-legend-khamsin is-active">', 'a khamsin day in the list');
  const calm = stripWith('ru', { hours: [{ dust: 27, khamsin: false }, null, null, null], days: [{ dust: 38, khamsin: false }, null, null], stale: false, limit: 100 });
  assert.equal(khamsinKey(calm.hourly), '<span class="dust-legend-khamsin">');
  assert.equal(khamsinKey(calm.daily), '<span class="dust-legend-khamsin">');
  const mixed = stripWith('ru', { hours: [{ dust: 27, khamsin: false }, null, null, null], days: [{ dust: 185, khamsin: true }, null, null], stale: false, limit: 100 });
  assert.deepEqual([khamsinKey(mixed.hourly), khamsinKey(mixed.daily)], ['<span class="dust-legend-khamsin">', '<span class="dust-legend-khamsin is-active">'], 'each card by its own cells');
  assert.equal(khamsinKey(stripWith('ru', { loading: true, limit: 100 }).hourly), '<span class="dust-legend-khamsin">', 'no air yet: quiet');
});
test('X9: View.dustTitle takes the translated title and label; the legend states the threshold', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  assert.equal(ctx.View.dustTitle('Почасовой прогноз', 'Пыль, мкг/м³', { limit: 100, active: false }),
    '<div class="card-head"><div class="card-title">Почасовой прогноз</div><div class="dust-legend"><span class="dust-legend-key">Пыль, мкг/м³</span>' +
    '<span class="dust-legend-khamsin">хамсин ≥ 100</span></div></div>');
  assert.match(ctx.View.dustTitle('A', 'B', { limit: 100, active: true }), /<span class="dust-legend-khamsin is-active">/);
});

// Batch 15 (M4): while MET Norway's data are shown the weather status says so, in every language; Open-Meteo's says nothing more.
test('B15: the status line names MET Norway when its data are shown (fresh and stale); nothing added for Open-Meteo', () => {
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js']);
  const say = (lang, kind, source) => { ctx.I18n.setLang(lang); return ctx.View.statusText(kind, '02.11 17:30', source); };
  assert.deepEqual([say('ru', 'fresh', 'met'), say('ru', 'stale', 'met'), say('ru', 'fresh', undefined), say('ru', 'loading', 'met')],
    ['Обновлено в 02.11 17:30 · MET Norway', 'Не обновляется · данные от 02.11 17:30 · MET Norway', 'Обновлено в 02.11 17:30', '']);
  assert.equal(say('uk', 'fresh', 'met'), 'Оновлено о 02.11 17:30 · MET Norway');
  assert.equal(say('he', 'fresh', 'met'), 'עודכן ב־02.11 17:30 · MET נורווגיה');
});
