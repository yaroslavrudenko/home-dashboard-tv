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
const B12 = ['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/openmeteo.js', 'js/air.js', 'js/view.js', 'js/view-israel.js'];   // air.js: Air.grade (FIX-18B 13)
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
  // the App always passes the dust forecast (its threshold with it: FIX-17B 15); before the first air answer it is { loading }
  ctx.View.renderWeather(NOW_VIEW, Object.assign({ name: 'Реховот', kind: 'fresh', retryAt: '', dust: { loading: true, limit: 100 } }, s));
  const html = doc.nodes.now.innerHTML, i = html.indexOf('<div class="now-air');
  return { html, block: i < 0 ? null : html.slice(i, html.indexOf('<div class="now-icon">')), cls: doc.nodes.now.className };
}
// FIX-18B 13B (the owner: one explanation, in one place): the one khamsin key is the grades' scale on the current card's dust label
const GRADES = ['100', '121', '196', '271'];   // the scale's text, each on its own pill
// B22 (owner 2026-11-04, judges' common decision, city card, fix 1): only the top grade on screen is lit (is-top); 0: none
const scaleWith = (top) => GRADES.map((g, i) => '<span class="dust-num' + (top === i + 1 ? ' is-top' : '') + ' is-khamsin kg-' + (i + 1) + '">' + g + '</span>').join('');
const FAIR = { aqi: 38, level: 'fair', dust: 25, dustHigh: false };          // Air.summary shapes: rounded by the data side
const DUSTY = { aqi: 104, level: 'extreme', dust: 240, dustHigh: true };
const DUST_NO_AQI = { aqi: null, level: null, dust: 240, dustHigh: true };

test('B12 air & UV: between the place text and the icon, no glyphs; UV and air each a label, a figure and a level word', () => {
  const r = mainWith('ru', { uv: { index: 5, level: 'moderate' }, air: FAIR, airKind: 'fresh' });
  assert.ok(r.html.indexOf('now-main') < r.html.indexOf('now-air') && r.html.indexOf('now-air') < r.html.indexOf('now-icon'), 'between the text and the icon');
  assert.ok(!/<svg/.test(r.block), 'no glyph icons in the block');
  // B22 (owner 2026-11-04, judges' common decision, city card): fix 4 — the order AQ → dust → UV; fix 1 — no grades' scale here
  assert.deepEqual(stripTags(r.block), ['Качество воздуха', '38', 'приемлемое', 'Пыль', '25', 'мкг/м³', 'УФ макс.', '5', 'умеренный']);
  assert.match(r.block, /<span class="air-word lv-moderate">умеренный<\/span>/);
  assert.match(r.block, /<span class="air-word lv-fair">приемлемое<\/span>/);
  assert.match(r.html, /<div class="details">/, 'the details row is still there, unchanged');
});

// N1 (batch 16): the khamsin word on the dust item's label line («Пыль · хамсин»), the value line «240 мкг/м³».
test('B12 air: high dust is a khamsin — the dust item «Пыль [хамсин ≥ 100] / 240 мкг/м³», the key amber (OWNER-1LEG-C); in every language', () => {
  // B22 (owner 2026-11-04, judges' common decision, city card): fix 4 — AQ → dust → UV; fix 1 — the key is the hourly title row's
  for (const [lang, words] of [['ru', ['Качество воздуха', '104', 'опасное', 'Пыль', '240', 'мкг/м³', 'УФ макс.', '9', 'очень высокий']],
    ['he', ['איכות האוויר', '104', 'מסוכנת', 'אבק', '240', 'מק״ג/מ״ק', 'מדד UV מרבי', '9', 'גבוה מאוד']],
    ['uk', ['Якість повітря', '104', 'небезпечна', 'Пил', '240', 'мкг/м³', 'УФ макс.', '9', 'дуже високий']]]) {
    const r = mainWith(lang, { uv: { index: 9, level: 'veryHigh' }, air: DUSTY, airKind: 'fresh' });
    assert.deepEqual(stripTags(r.block), words, lang);
    assert.ok(!/dust-legend/.test(r.block), lang + ': no khamsin key in the city card (B22 fix 1)');
    assert.match(r.block, /<span class="air-num dust-num is-khamsin kg-3">240<\/span>/, lang + ': the reading on its grade\'s pill');
  }
  assert.deepEqual(stripTags(mainWith('ru', { uv: null, air: FAIR, airKind: 'fresh' }).block).slice(3, 6), ['Пыль', '25', 'мкг/м³'], 'ordinary dust: its own labelled item');
});

test('B12 air: loading keeps the slot (a placeholder bar), failed says «нет данных» (B17-V5: st.noData), stale is dimmed, no UV reads «—»', () => {
  const loading = mainWith('ru', { uv: { index: 3, level: 'moderate' }, air: null, airKind: 'loading' });
  assert.match(loading.block, /<span class="skeleton air-skeleton"><\/span>/);
  // B22 (owner 2026-11-04, judges' common decision, city card, fix 4): AQ → dust → UV
  assert.deepEqual(stripTags(loading.block), ['Качество воздуха', 'УФ макс.', '3', 'умеренный']);
  const failed = mainWith('ru', { uv: null, air: null, airKind: 'failed' });
  assert.deepEqual(stripTags(failed.block), ['Качество воздуха', 'нет данных', 'УФ макс.', '—']);
  const noLevel = mainWith('ru', { uv: null, air: { aqi: null, level: null, dust: null, dustHigh: false }, airKind: 'fresh' });
  assert.deepEqual(stripTags(noLevel.block).slice(0, 2), ['Качество воздуха', 'нет данных'], 'a missing level is never a made-up one');
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
  ctx.IsraelView.render([card], { kind: 'none', updated: '' });
  const html = doc.nodes['region-center'].innerHTML;
  // head: the region head and, right under it, the air line (its own line since the owner's «должно быть понятно»)
  const line = html.match(/<div class="region-air[^"]*">.*?<\/div>/);
  return { ctx, doc, card, regions, head: html.slice(0, html.indexOf('</div>') + 6) + (line ? line[0] : '') };
}

test('B12 Israel air line: labelled «Воздух: приемлемое» on its own line under the head; «Воздух: хамсин» when the dust is high', () => {
  const fair = israelWith('ru', FAIR, 'fresh');
  assert.match(fair.head, /<\/div><div class="region-air lv-fair"><span class="region-air-label">Воздух:<\/span> <span class="region-air-word">приемлемый<\/span><\/div>$/);
  for (const [lang, label] of [['he', 'אוויר:'], ['uk', 'Повітря:']]) assert.match(israelWith(lang, FAIR, 'fresh').head, new RegExp('<span class="region-air-label">' + label + '</span>'), lang);
  assert.match(israelWith('ru', DUSTY, 'fresh').head, /<div class="region-air lv-dust"><span class="region-air-label">Воздух:<\/span> <span class="region-air-word dust-num is-khamsin kg-3">хамсин<\/span>/, 'FIX-18D 3: a khamsin on its grade\'s pill (240: 3); labelled, in the dust colour');
  assert.match(israelWith('he', FAIR, 'fresh').head, />סביר</);   // G4: masculine, as its label «אוויר:»
  assert.match(israelWith('uk', DUSTY, 'fresh').head, />хамсин</);
  assert.match(israelWith('ru', FAIR, 'stale').head, /region-air lv-fair is-stale/);
  assert.match(israelWith('ru', null, 'loading').head, /<div class="region-air is-reserved"><\/div>$/, 'loading: the line reserved, empty');
  assert.match(israelWith('ru', null, 'failed').head, /<div class="region-air is-reserved"><\/div>$/, 'no data: no words, the line still reserved (nothing moves)');
});

// G4 (5/5): the level word agrees with the label it stands under — the main screen's «Качество воздуха / איכות האוויר /
// Якість повітря» (neuter / feminine / feminine), the Israel card's «Воздух: / אוויר: / Повітря:» (masculine / masculine / neuter).
const LEVELS = ['good', 'fair', 'moderate', 'poor', 'veryPoor', 'extreme'];
const AIR_WORDS = {
  main: { ru: ['хорошее', 'приемлемое', 'умеренное', 'плохое', 'очень плохое', 'опасное'],
    he: ['טובה', 'סבירה', 'בינונית', 'ירודה', 'ירודה מאוד', 'מסוכנת'],
    uk: ['добра', 'прийнятна', 'помірна', 'погана', 'дуже погана', 'небезпечна'] },
  israel: { ru: ['хороший', 'приемлемый', 'умеренный', 'плохой', 'очень плохой', 'опасный'],
    he: ['טוב', 'סביר', 'בינוני', 'ירוד', 'ירוד מאוד', 'מסוכן'],
    uk: ['добре', 'прийнятне', 'помірне', 'погане', 'дуже погане', 'небезпечне'] } };
for (const lang of ['ru', 'he', 'uk']) {
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i], air = { aqi: 40 + i * 20, level, dust: 25, dustHigh: false };
    test('G4 air level word agrees with its label: ' + lang + ' ' + level + ' — main «' + AIR_WORDS.main[lang][i] + '», Israel card «' + AIR_WORDS.israel[lang][i] + '»', () => {
      const main = mainWith(lang, { uv: null, air, airKind: 'fresh' });
      assert.match(main.block, new RegExp('<span class="air-word lv-' + level + '">' + AIR_WORDS.main[lang][i] + '</span>'), 'main screen');
      const card = israelWith(lang, air, 'fresh');
      assert.match(card.head, new RegExp('<span class="region-air-word">' + AIR_WORDS.israel[lang][i] + '</span></div>$'), 'Israel card');
    });
  }
}

test('B12 Israel chip: an air answer alone redraws the card (the air is in the card key)', () => {
  const r = israelWith('ru', null, 'loading');
  const el = r.doc.nodes['region-center'];
  assert.equal(el.writes, 1);
  r.ctx.IsraelView.render([r.card], { kind: 'none', updated: '' });
  assert.equal(el.writes, 1, 'same card, same air: not rewritten');
  r.ctx.IsraelView.render([Object.assign({}, r.card, { air: FAIR, airKind: 'fresh' })], { kind: 'none', updated: '' });
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
  // B22 (owner 2026-11-04, judges' common decision, city card): fix 1 — no grades in the card; fix 4 — AQ, dust, then UV
  for (const [lang, none, dust, word] of [['ru', 'нет данных', ['Пыль', '240', 'мкг/м³'], 'хамсин'], ['he', 'אין נתונים', ['אבק', '240', 'מק״ג/מ״ק'], 'חמסין'],
    ['uk', 'немає даних', ['Пил', '240', 'мкг/м³'], 'хамсин']]) {
    for (const kind of ['fresh', 'stale']) {
      const r = mainWith(lang, { uv: null, air: DUST_NO_AQI, airKind: kind });
      assert.deepEqual(stripTags(r.block).slice(1, 5), [none].concat(dust), lang + ' ' + kind + ': «no data» for the AQI, the dust item kept');
      const chip = israelWith(lang, DUST_NO_AQI, kind).head;
      assert.match(chip, new RegExp('<div class="region-air lv-dust' + (kind === 'stale' ? ' is-stale' : '') + '">[\\s\\S]*>' + word + '<\\/span>'), lang + ' ' + kind);
    }
  }
});

test('V13: the region card is keyed by what the chip shows — AQI 31 → 39 (both fair) writes nothing; fair → moderate writes once', () => {
  const r = israelWith('ru', { aqi: 31, level: 'fair', dust: 18, dustHigh: false }, 'fresh');
  const el = r.doc.nodes['region-center'];
  const again = (air, kind) => r.ctx.IsraelView.render([Object.assign({}, r.card, { air, airKind: kind || 'fresh' })], { kind: 'none', updated: '' });
  again({ aqi: 39, level: 'fair', dust: 22, dustHigh: false });
  assert.equal(el.writes, 1, 'same word, same colour: not rewritten');
  again({ aqi: 120, level: 'extreme', dust: 150, dustHigh: true });
  again({ aqi: 125, level: 'extreme', dust: 160, dustHigh: true });
  assert.equal(el.writes, 2, 'dust 150 → 160: the same «хамсин», the same grade (2): not rewritten');
  again({ aqi: 130, level: 'extreme', dust: 210, dustHigh: true });
  assert.equal(el.writes, 3, 'FIX-18D 3: dust 160 → 210 — grade 2 → 3, only the grade changed: rewritten');
  assert.match(el.innerHTML, /region-air-word dust-num is-khamsin kg-3/);
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false });
  assert.equal(el.writes, 4);
  again({ aqi: 45, level: 'moderate', dust: 20, dustHigh: false }, 'stale');
  assert.equal(el.writes, 5, 'stale dims the chip: a change');
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
    // B22 (owner 2026-11-04, judges' common decision, city card): fix 2 — a plain grey label; fix 1 — no grades' scale on it
    assert.match(d, new RegExp('^<div class="air-item air-dust"><div class="air-label">' + label + '</div><div class="air-value"><span class="air-num">25</span> <span class="air-unit">' +
      unit.replace(/[/]/g, '\\/') + '</span></div></div>'), lang);
    assert.ok(!/air-word/.test(d), lang + ': an ordinary day has no level word');
  }
});
// N1 (batch 16): a 4-digit khamsin («3400 мкг/м³ хамсин») overflowed the 256 px block, so the amber word moved to the label's
// line («Пыль · хамсин»); the value line keeps the figure and its unit.
test('Dust: at 100 µg/m³ and more the key «хамсин ≥ 100» on the label\'s line is the amber pill (OWNER-1LEG-C), the value line the figure and its unit', () => {
  for (const [lang, label] of [['ru', 'Пыль'], ['he', 'אבק'], ['uk', 'Пил']]) {
    const d = dustItem(mainWith(lang, { uv: null, air: DUSTY, airKind: 'fresh' }).block);
    // B22 (owner 2026-11-04, judges' common decision, city card, fixes 1–2): the label plain, the scale on the hourly title row
    assert.match(d, new RegExp('<div class="air-label">' + label + '</div><div class="air-value"><span class="air-num dust-num is-khamsin kg-3">240</span> <span class="air-unit">[^<]+</span></div>'), lang);   // FIX-BATCH-18 part B: the reading on the khamsin pill
  }
  assert.match(dustItem(mainWith('ru', { uv: null, air: { aqi: 41, level: 'moderate', dust: 100, dustHigh: true }, airKind: 'fresh' }).block), /air-num dust-num is-khamsin kg-1">100</);   // FIX-18B 13: 100 is grade 1
});
test('Dust: no dust value — the item is not drawn (no label, no number), its slot reserved', () => {
  const r = mainWith('ru', { uv: null, air: { aqi: 38, level: 'fair', dust: null, dustHigh: false }, airKind: 'fresh' });
  assert.match(r.block, /<div class="air-item air-dust is-none"><\/div><div class="air-item air-uv/);   // B22 fix 4: UV after the dust
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
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 7 });
  ctx.View.renderWeather(STRIP, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: FAIR, airKind: 'fresh', dust });
  return { hourly: doc.nodes.hourly.innerHTML, daily: doc.nodes.daily.innerHTML };
}
const slots = (html, cls) => [...html.matchAll(new RegExp('<div class="' + cls + '( is-stale)?">(.*?)</div>', 'g'))].map((m) => m[2]);
const bandOf = (html) => { const i = html.indexOf('<div class="dust-band">'); return i < 0 ? null : html.slice(i); };

// OWNER-1LEG-C (owner 2026-11-02, one legend + design C): the title rows carry their title only; the khamsin key is said once,
// on the current card's dust item (Dust tests above); the day rows carry the weather only and the dust has its own band.
test('B22 fix 1 / FIX-17B 1: the hourly title row carries its title, the dust row\'s own «Пыль» label and the one khamsin key (the grades, then the unit); the daily one its title only', () => {
  for (const [lang, hourly, daily, label, unit] of [['ru', 'Почасовой прогноз', 'Прогноз на 7 дней', 'Пыль', 'мкг/м³'], ['he', 'תחזית שעתית', 'תחזית ל־7 ימים', 'אבק', 'מק״ג/מ״ק'], ['uk', 'Погодинний прогноз', 'Прогноз на 7 днів', 'Пил', 'мкг/м³']]) {
    const r = stripWith(lang, DUST_OK);
    // B22 (owner 2026-11-04, judges' common decision, city card, fix 1): the grades are said once, on the hourly title row after
    // «Пыль», then the unit; DUST_OK's top grade is 2 (185), so only «121» is lit
    assert.match(r.hourly, new RegExp('^<div class="card-head"><div class="card-title">' + hourly + '</div><div class="band-label">' + label + '</div><div class="dust-legend">' +
      '<span class="dust-legend-scale is-active">' + scaleWith(2) + '</span><span class="air-unit">' + unit.replace(/[/]/g, '\\/') + '</span></div></div><div class="hours">'), lang);
    assert.match(r.daily, new RegExp('^<div class="card-head"><div class="card-title">' + daily + '</div></div><div class="days">'), lang);
    assert.ok(!/dust-legend/.test(r.daily), lang + ': no key on the daily title row');
  }
});

test('B13 hourly: every hour has its own dust line UNDER the temperature — the figure, an amber khamsin pill from 100, «—» with no value', () => {
  const h = stripWith('ru', DUST_OK).hourly;
  const hours = h.split(/<div class="hour(?: is-now| is-empty| is-gap)?">/).slice(1);
  assert.match(hours[0], /<div class="hour-temp">[^<]*<\/div><div class="hour-dust"><span class="dust-num">27<\/span><\/div><\/div>$/, 'under the temperature, last in the column');
  assert.deepEqual(slots(h, 'hour-dust'), ['<span class="dust-num">27</span>', '<span class="dust-num is-khamsin kg-1">120</span>', '<span class="dust-none">—</span>'],   // FIX-18B 13: the pill carries its grade   // X5: «—» muted
    'ordinary, khamsin, no value «—»');
  // L5 (batch 16): an hour beyond the data is an empty slot of its own size — no placeholder bar (those are for loading only)
  assert.match(h, /<div class="hour is-gap"><\/div><\/div>$/, 'the 4th hour: an empty gap, no skeleton');
  assert.ok(!/skeleton/.test(h), 'no placeholder with data on screen');
});

test('OWNER-1LEG-C: a day row is the weather only (day · icon · min ─bar─ max); the dust band under the list — «Пыль», then each day\'s short name over its maximum, the khamsin pill, «—» without a value', () => {
  const d = stripWith('ru', DUST_OK).daily;
  assert.ok(!/<div class="day">[\s\S]*?day-dust[\s\S]*?<\/div><\/div><div class="day/.test(d.slice(0, d.indexOf('<div class="dust-band">'))), 'no dust inside a day row');
  assert.match(d, /<div class="day-max">[^<]*<\/div><\/div>/, 'the high temperature ends the row');
  const band = bandOf(d);
  // batch 24 (в): the label sits in the band's head line (no day beyond the forecast here: no key)
  assert.match(band, /^<div class="dust-band"><div class="band-head"><div class="band-label">Пыль<\/div><\/div><div class="band-cells">/);
  assert.deepEqual(slots(band, 'day-dust'), ['<span class="dust-num">38</span>', '<span class="dust-num is-khamsin kg-2">185</span>']);   // FIX-18B 13: the pill carries its grade
  assert.deepEqual([...band.matchAll(/<div class="band-day">([^<]*)<\/div>/g)].map((m) => m[1]).slice(0, 1), ['Сег.'], 'today, short');
  assert.match(band, /<div class="band-cell"><\/div><\/div><\/div>$/, 'L5: the day beyond the data an empty cell');
  const none = stripWith('ru', { hours: [null, null, null, null], days: [null, null, null], stale: false, limit: 100 });
  assert.deepEqual(slots(bandOf(none.daily), 'day-dust'), ['<span class="dust-none">—</span>', '<span class="dust-none">—</span>'], 'air failed / no forecast: «—» per day (X5: muted)');
  assert.deepEqual(slots(none.hourly, 'hour-dust'), ['<span class="dust-none">—</span>', '<span class="dust-none">—</span>', '<span class="dust-none">—</span>'], '… and per hour');
  for (const [lang, label, today] of [['he', 'אבק', 'היום'], ['uk', 'Пил', 'Сьог.']]) {
    const b = bandOf(stripWith(lang, DUST_OK).daily);
    assert.match(b, new RegExp('<div class="band-label">' + label + '</div>'), lang);
    assert.match(b, new RegExp('<div class="band-day">' + today + '</div>'), lang);
  }
});

// Owner 2026-11-04, batch 24 (в): a day beyond the source's horizon (Air.forecast { beyond }) reads a quiet «…» in its cell —
// never the «—» of a day with too few values — and the band's head line says once, at its other end, «… нет прогноза».
test('B24 (в): a day beyond the forecast is a muted «…», distinct from «—»; the head line carries «… нет прогноза» in every language, only when such a day is on the band', () => {
  const DUST_BEYOND = Object.assign({}, DUST_OK, { days: [{ dust: 0, khamsin: false }, { beyond: true }, null] });
  for (const [lang, label, words] of [['ru', 'Пыль', 'нет прогноза'], ['he', 'אבק', 'אין תחזית'], ['uk', 'Пил', 'немає прогнозу'], ['en', 'Dust', 'no forecast']]) {
    const band = bandOf(stripWith(lang, DUST_BEYOND).daily);
    assert.match(band, new RegExp('^<div class="dust-band"><div class="band-head"><div class="band-label">' + label + '</div><div class="band-beyond">… ' + words + '</div></div>'), lang);
    assert.deepEqual(slots(band, 'day-dust'), ['<span class="dust-num">0</span>', '<span class="dust-beyond">…</span>'], lang + ': a clean day 0 (а), the day beyond «…» (в)');
  }
  const partial = bandOf(stripWith('ru', Object.assign({}, DUST_OK, { days: [{ dust: 3, khamsin: false }, null, null] })).daily);
  assert.deepEqual([slots(partial, 'day-dust')[1], /band-beyond/.test(partial)], ['<span class="dust-none">—</span>', false], 'too few values: «—», and no key');
  const stale = bandOf(stripWith('ru', Object.assign({}, DUST_BEYOND, { stale: true })).daily);
  assert.match(stale, /<div class="band-beyond">… нет прогноза<\/div>/, 'stale data keep the key');
  // the current card's dust item: a forecast of beyond days only is no value (the item stays empty, as with no forecast)
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 7 });
  ctx.View.renderWeather(STRIP, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: null, airKind: 'failed', dust: { hours: [null, null, null, null], days: [{ beyond: true }, { beyond: true }, null], stale: false, limit: 100 } });
  assert.match(doc.nodes.now.innerHTML, /<div class="air-item air-dust is-none"><\/div>/, 'beyond is not a value');
});

test('B13 no air yet: every dust slot is there and empty (its room kept); stale: every slot dimmed; no weather yet: the band\'s placeholder (FIX-17B 5)', () => {
  const r = stripWith('ru', { loading: true, limit: 100 });
  assert.deepEqual(slots(r.hourly, 'hour-dust'), ['', '', '']);
  assert.deepEqual(slots(bandOf(r.daily), 'day-dust'), ['', '']);
  const stale = stripWith('ru', Object.assign({}, DUST_OK, { stale: true }));
  assert.equal((stale.hourly.match(/<div class="hour-dust is-stale">/g) || []).length, 3, 'the three drawn hours');
  assert.equal((stale.daily.match(/<div class="day-dust is-stale">/g) || []).length, 2);
  assert.equal((stripWith('ru', DUST_OK).hourly.match(/is-stale/g) || []).length, 0);
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 2, days: 2 });
  ctx.View.renderWeather(null, { name: 'Реховот', kind: 'loading', retryAt: '', dust: { loading: true, limit: 100 } });
  assert.deepEqual(slots(doc.nodes.hourly.innerHTML, 'hour-dust'), ['', ''], 'the placeholders keep an empty dust slot');
  // FIX-17B 5: the band is there before the first weather answer — its label and one empty cell per day, the same boxes as
  // with data (nothing moves when the data lands); the loading day rows carry no dust slot of their own
  const daily = doc.nodes.daily.innerHTML, band = daily.slice(daily.indexOf('<div class="dust-band is-empty">'));
  assert.ok(daily.indexOf('<div class="dust-band is-empty">') > 0, 'the placeholder band is there');
  assert.equal((band.match(/<div class="band-cell"><div class="band-day"><\/div><div class="day-dust"><\/div><\/div>/g) || []).length, 2, 'one empty cell per day');
  assert.ok(!/<div class="day is-empty">[^]*?day-dust[^]*?<\/div><\/div><div class="dust-band/.test(daily), 'no dust slot in the loading rows');
});

// Codex CC1 (batch 16): the forecast's title says the configured number of days (w.days {n}), never a fixed «7».
test('CC1: the daily card\'s title follows Config.weather.days — 5 days read «5» in ru, he, uk', () => {
  for (const [lang, title] of [['ru', 'Прогноз на 5 дней'], ['he', 'תחזית ל־5 ימים'], ['uk', 'Прогноз на 5 днів']]) {
    const ctx = load(B12); ctx.I18n.setLang(lang);
    const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 5 });
    ctx.View.renderWeather(STRIP, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: FAIR, airKind: 'fresh', dust: DUST_OK });
    assert.match(doc.nodes.daily.innerHTML, new RegExp('^<div class="card-head"><div class="card-title">' + title + '</div>'), lang);
  }
});

// Batch 18 (the owner: «убрать фразу "ощущается" и "ветер" — их две сделать компактными и на одной строке»): feels-like and
// the wind on ONE line, no words: a thermometer and the wind glyph for labels, the units kept; in every language.
test('B18 Israel: feels-like and wind on one line, each with its icon for a label and no words; no condition line, no title', () => {
  for (const [lang, kmh, words] of [['ru', 'км/ч', /Ощущается|Ветер|Ясно/], ['he', 'קמ״ש', /מרגיש|רוח|בהיר/], ['uk', 'км/год', /Відчувається|Вітер|Ясно/]]) {
    const ctx = load(B12); ctx.I18n.setLang(lang);
    const doc = fakeDoc(), regions = [{ id: 'center', place: 'telaviv' }];
    ctx.IsraelView.init(doc, regions);
    ctx.IsraelView.render([{ region: regions[0], view: Object.assign({}, NOW_VIEW, { daily: [] }), kind: 'fresh', retryAt: '', key: 'k', air: FAIR, airKind: 'fresh' }], { kind: 'fresh', updated: '16:00' });
    const html = doc.nodes['region-center'].innerHTML, sub = html.match(/<div class="region-sub">([\s\S]*?)<\/div><div class="days">/);
    assert.ok(sub, lang + ': the line before the days');
    const parts = sub[1].split('<span class="region-part">').slice(1);
    assert.equal(parts.length, 2, lang + ': two values on the one line');
    assert.match(parts[0], /g-feels/, lang + ': feels-like labelled by its own glyph — a thermometer with a person (FIX-18B 12)');
    assert.match(parts[1], /g-wind/, lang + ': the wind labelled by its glyph');
    assert.deepEqual(stripTags(sub[1]).map((x) => x.replace(/[\u202a\u202c]/g, '')), ['22°', '12 ' + kmh], lang);
    assert.ok(!words.test(html.replace(/<div class="region-air[\s\S]*?<\/div>/, '')), lang + ': no words for the two values, no condition words');
  }
});
test('OWNER-1LEG-C Israel: each region\'s days carry their dust maximum in the band, no legend; a new forecast alone redraws the card, the same one does not', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(), regions = [{ id: 'south', place: 'beersheva' }];
  ctx.IsraelView.init(doc, regions);
  const v = Object.assign({}, STRIP, { daily: STRIP.daily.slice(0, 2) });
  const card = (dust) => ({ region: regions[0], view: v, kind: 'fresh', retryAt: '', key: 'k1', air: FAIR, airKind: 'fresh', dust });
  const days = (dust) => ({ hours: [], days: dust, stale: false, limit: 100 });
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 185, khamsin: true }]))], { kind: 'fresh', updated: '16:00' });
  const el = doc.nodes['region-south'];
  // batch 18: no title over the days (the owner: «и так понятно что это за прогноз») and no condition words
  assert.ok(!/card-head|card-title|Прогноз на/.test(el.innerHTML), 'no title over the days');
  assert.ok(!/region-cond/.test(el.innerHTML), 'no condition line');
  assert.match(el.innerHTML, /<div class="region-sub">[\s\S]*?<\/span><\/div><div class="days">/, 'the days follow the compact line');
  assert.ok(!/dust-legend/.test(el.innerHTML), 'no legend on the Israel cards');
  assert.deepEqual(slots(bandOf(el.innerHTML), 'day-dust'), ['<span class="dust-num">48</span>', '<span class="dust-num is-khamsin kg-2">185</span>']);   // FIX-18B 13: the pill carries its grade
  assert.equal(el.writes, 1);
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 185, khamsin: true }]))], { kind: 'fresh', updated: '16:00' });
  assert.equal(el.writes, 1, 'the same forecast: not rewritten');
  ctx.IsraelView.render([card(days([{ dust: 48, khamsin: false }, { dust: 90, khamsin: false }]))], { kind: 'fresh', updated: '16:00' });
  assert.equal(el.writes, 2, 'a new forecast alone redraws the card (B13-D7)');
});

// X4 → OWNER-1LEG-C: the one key «хамсин ≥ 100» (on the current card) is quiet by default and the amber pill when the reading
// or any cell the screen shows — an hour or a day — is a khamsin. X5: «—» is a muted «dust-none», never the dust colour.
const khamsinKey = (html) => (html.match(/<span class="dust-legend-scale[^"]*">/) || [''])[0];   // FIX-18B 13B: the key is the scale
function drawWith(dust, air) {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 7 });
  ctx.View.renderWeather(STRIP, { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: air || FAIR, airKind: 'fresh', dust });
  return { now: doc.nodes.now.innerHTML, hourly: doc.nodes.hourly.innerHTML };
}
const nowWith = (dust, air) => drawWith(dust, air).now;
// B22 (owner 2026-11-04, judges' common decision, city card, fix 1): the key is on the hourly title row
const keyWith = (dust, air) => drawWith(dust, air).hourly;
test('X4 / OWNER-1LEG-C: the one key is quiet by default and the amber pill when the reading, an hour or a day on screen is a khamsin', () => {
  assert.equal(khamsinKey(keyWith(DUST_OK)), '<span class="dust-legend-scale is-active">', 'a khamsin hour and day on screen');
  assert.equal(khamsinKey(keyWith({ hours: [{ dust: 27, khamsin: false }, null, null, null], days: [{ dust: 38, khamsin: false }, null, null], stale: false, limit: 100 })), '<span class="dust-legend-scale">');
  assert.equal(khamsinKey(keyWith({ hours: [{ dust: 27, khamsin: false }, null, null, null], days: [{ dust: 185, khamsin: true }, null, null], stale: false, limit: 100 })), '<span class="dust-legend-scale is-active">', 'a khamsin day alone');
  assert.equal(khamsinKey(keyWith({ loading: true, limit: 100 })), '<span class="dust-legend-scale">', 'no forecast yet: quiet (B22 fix 1: the key is there whenever the rows are)');
  assert.equal(khamsinKey(keyWith({ loading: true, limit: 100 }, DUSTY)), '<span class="dust-legend-scale is-active">', 'the reading itself');
  assert.ok(!/dust-legend/.test(nowWith(DUST_OK)), 'B22 fix 1: never in the city card');
});
// FIX-17B 2: the one key is on screen whenever ANY dust is — a forecast with no current reading draws it, active on a khamsin
// day, with «—» for the reading; FIX-17B 15: no dust object (no threshold), no pill — never a made-up 100.
test('FIX-17B 2 / 15: no current dust but a khamsin day — the key is drawn and amber, the value «—»; no forecast at all: no item; no dust object: no pill', () => {
  const d = { hours: [null, null, null, null], days: [null, { dust: 185, khamsin: true }, null], stale: false, limit: 100 };
  const drawn = drawWith(d, { aqi: 40, level: 'fair', dust: null, dustHigh: false }), html = drawn.now;
  assert.equal(khamsinKey(drawn.hourly), '<span class="dust-legend-scale is-active">');   // B22 fix 1: the key on the hourly title row
  assert.match(html, /<div class="air-value"><span class="air-num">—<\/span><\/div>/);
  const none = nowWith({ hours: [null, null, null, null], days: [null, null, null], stale: false, limit: 100 }, { aqi: 40, level: 'fair', dust: null, dustHigh: false });
  assert.match(none, /<div class="air-item air-dust is-none"><\/div>/, 'nothing to say: the slot only');
  const noObj = drawWith(undefined, { aqi: 40, level: 'fair', dust: 25, dustHigh: false });
  assert.ok(!/dust-legend-scale/.test(noObj.now + noObj.hourly), 'no threshold, no scale');
  assert.match(noObj.now, /<div class="air-label">Пыль<\/div>/);   // B22 fix 2: the plain grey label
});
test('X9: View.cardHead takes the translated title', () => {
  const ctx = load(B12);
  assert.equal(ctx.View.cardHead('Почасовой прогноз <b>'), '<div class="card-head"><div class="card-title">Почасовой прогноз &lt;b&gt;</div></div>');
});

// Batch 15 (M4): while MET Norway's data are shown the weather status says so, in every language; Open-Meteo's says nothing more.
test('B15: the status line names MET Norway when its data are shown (fresh and stale); nothing added for Open-Meteo', () => {
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js']);
  const say = (lang, kind, source) => { ctx.I18n.setLang(lang); return ctx.ViewState.headText(kind, '02.11 17:30', source ? [ctx.I18n.t('src.' + source)] : []); };
  assert.deepEqual([say('ru', 'fresh', 'met'), say('ru', 'stale', 'met'), say('ru', 'fresh', undefined), say('ru', 'loading', 'met')],
    ['Обновлено в 02.11 17:30 · MET Norway', 'Не обновляется · данные от 02.11 17:30 · MET Norway', 'Обновлено в 02.11 17:30', '']);
  assert.equal(say('uk', 'fresh', 'met'), 'Оновлено о 02.11 17:30 · MET Norway');
  assert.equal(say('he', 'fresh', 'met'), 'עודכן ב־02.11 17:30 · MET נורווגיה');
});

// N8 (FIX-16B) → OWNER-1LEG-C: with no weather the cards keep their titles and say «нет данных»; no legend, no band.
test('N8: failed with no data — the hourly and daily cards keep their titles, no dust legend, no band', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 7 });
  ctx.View.renderWeather(null, { name: 'Реховот', kind: 'failed', retryAt: '20:40', dust: { hours: [], days: [], stale: false, limit: 100 } });
  for (const id of ['hourly', 'daily']) {
    assert.ok(!/dust-legend/.test(doc.nodes[id].innerHTML), id + ': no legend');
    assert.match(doc.nodes[id].innerHTML, /<div class="wx-none">нет данных<\/div>/);
  }
  assert.ok(!/dust-band/.test(doc.nodes.daily.innerHTML), 'no band');
});

// Khamsin pill unification (FIX-BATCH-18 part B, register b13): a khamsin READING sits on the same amber pill as a khamsin hour
// or day (.dust-num.is-khamsin); an ordinary reading stays plain.
test('B18 khamsin pill: the current reading ≥ the threshold is on the amber pill, an ordinary one is plain', () => {
  const quiet = { loading: true, limit: 100 };
  const num = (html) => (html.match(/<span class="air-num[^"]*">\d+<\/span> <span class="air-unit">/) || [''])[0];
  assert.match(num(nowWith(quiet, DUSTY)), /^<span class="air-num dust-num is-khamsin kg-3">\d+</, 'a khamsin reading: the pill in its grade (240: 3)');
  assert.match(num(nowWith(quiet, FAIR)), /^<span class="air-num">\d+</, 'an ordinary reading: plain');
});

// FIX-19B C1 (Codex P2): the hour shown has no sky in the forecast — the current card says «—» for the condition and draws an
// empty icon box of the same size, never a guessed cloud nor another hour's sky.
test('FIX-19B C1: a current hour with no sky — «—» condition and an empty icon box (no guessed cloud)', () => {
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 4, days: 7 });
  const v = Object.assign({}, STRIP, { current: Object.assign({}, STRIP.current, { code: null }) });
  ctx.View.renderWeather(v, { name: 'Реховот', kind: 'stale', retryAt: '', uv: null, air: FAIR, airKind: 'fresh', dust: { loading: true, limit: 100 } });
  const html = doc.nodes.now.innerHTML;
  assert.match(html, /<div class="now-cond">—<\/div>/);
  assert.match(html, /<div class="now-icon"><svg class="icon w-none"[^>]*><\/svg><\/div>/);
  assert.ok(!/w-cloudy/.test(html.slice(html.indexOf('now-icon'))), 'no guessed cloud');
});

// ---- B22 (owner 2026-11-04, judges' common decision, city card): the city card unloaded -----------------------------------
// Fix 1: the one khamsin key on the hourly title row lights only the top grade on screen; the boundaries 99/100/120/121/195/196/
// 270/271 (Air.grade: 1 from 100, 2 from 121, 3 from 196, 4 from 271). Here the current reading alone sets the top grade.
test('B22 fix 1: the key lights exactly one grade — the top one on screen — and none below 100 (boundaries 99 … 271)', () => {
  const lit = (html) => [...html.matchAll(/<span class="dust-num is-top is-khamsin kg-(\d)">(\d+)<\/span>/g)].map((m) => +m[1]);
  for (const [dust, top] of [[99, 0], [100, 1], [120, 1], [121, 2], [195, 2], [196, 3], [270, 3], [271, 4]]) {
    const key = keyWith({ loading: true, limit: 100 }, { aqi: 60, level: 'moderate', dust, dustHigh: dust >= 100 });
    assert.deepEqual(lit(key), top ? [top] : [], dust + ' µg/m³: ' + (top ? 'only grade ' + top + ' lit' : 'nothing lit'));
    assert.equal((key.match(/is-top/g) || []).length, top ? 1 : 0, dust + ': one lit pill at most');
    assert.equal(khamsinKey(key), '<span class="dust-legend-scale' + (top ? ' is-active' : '') + '">', dust + ': the scale quiet below 100');
  }
  // a forecast day higher than the reading: the day's grade is the top one (topGrade: the highest on the main screen)
  assert.deepEqual(lit(keyWith({ hours: [null, null, null, null], days: [null, { dust: 290, khamsin: true }, null], stale: false, limit: 100 }, DUSTY)), [4]);
});

// Fix 3: the line under the condition says only «Ощущается как», one 34 px line (a no-break space without a value: nothing moves).
test('B22 fix 3: the line under the condition holds only «Ощущается как» — no «Макс.» / «Мин.»; with no feels-like a no-break space', () => {
  for (const [lang, feels] of [['ru', 'Ощущается как'], ['he', 'מרגיש כמו'], ['uk', 'Відчувається як'], ['en', 'Feels like']]) {
    const html = mainWith(lang, { uv: null, air: FAIR, airKind: 'fresh' }).html;
    assert.match(html, new RegExp('<div class="now-sub"><span>' + feels + ' [^<]*22°[^<]*</span></div>'), lang);   // he: the figure in LTR marks
  }
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 12, days: 7 });
  ctx.View.renderWeather(Object.assign({}, NOW_VIEW, { current: Object.assign({}, NOW_VIEW.current, { feels: null }) }),
    { name: 'Реховот', kind: 'fresh', retryAt: '', uv: null, air: FAIR, airKind: 'fresh', dust: { loading: true, limit: 100 } });
  assert.match(doc.nodes.now.innerHTML, /<div class="now-sub">&nbsp;<\/div>/, 'no value: the line kept, empty');
  assert.ok(!/Макс|Мин/.test(doc.nodes.now.innerHTML), 'the day\'s range is the 7-day list\'s');
});

// Fix 6: «Осадки» left the details — four columns: wind, humidity, sunrise, sunset.
test('B22 fix 6: the details row is four — wind, humidity, sunrise, sunset; no «Осадки», no umbrella', () => {
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    const html = mainWith(lang, { uv: null, air: FAIR, airKind: 'fresh' }).html, details = html.slice(html.indexOf('<div class="details">'));
    assert.deepEqual([...details.matchAll(/<svg class="icon g-(\w+)"/g)].map((m) => m[1]), ['wind', 'drop', 'sunrise', 'sunset'], lang);
  }
  assert.ok(!/Осадки/.test(mainWith('ru', { uv: null, air: FAIR, airKind: 'fresh' }).html));
});

// Fix 4: AQ → dust → UV, in every state the block draws.
test('B22 fix 4: the air column reads air quality, dust, UV — fresh, khamsin, no dust, loading, stale; UV marked at night', () => {
  const order = (block) => [...block.matchAll(/<div class="air-item (air-\w+)/g)].map((m) => m[1]);
  for (const s of [{ air: FAIR, airKind: 'fresh' }, { air: DUSTY, airKind: 'fresh' }, { air: { aqi: 38, level: 'fair', dust: null, dustHigh: false }, airKind: 'fresh' },
    { air: null, airKind: 'loading' }, { air: FAIR, airKind: 'stale' }]) {
    assert.deepEqual(order(mainWith('ru', Object.assign({ uv: { index: 4, level: 'moderate' } }, s)).block), ['air-aq', 'air-dust', 'air-uv'], s.airKind);
  }
  const ctx = load(B12); ctx.I18n.setLang('ru');
  const doc = fakeDoc(); ctx.View.init(doc, [], { hours: 12, days: 7 });
  ctx.View.renderWeather(Object.assign({}, NOW_VIEW, { current: Object.assign({}, NOW_VIEW.current, { isDay: false }) }),
    { name: 'Реховот', kind: 'fresh', retryAt: '', uv: { index: 6, level: 'high' }, air: FAIR, airKind: 'fresh', dust: { loading: true, limit: 100 } });
  assert.match(doc.nodes.now.innerHTML, /<div class="air-item air-uv is-night"><div class="air-label">УФ макс\.<\/div><div class="air-value"><span class="air-num">6<\/span>/);
});
