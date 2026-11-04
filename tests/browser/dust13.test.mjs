// The dust always shown (the owner, 2026-11-02: «вижу ультрофеолет - но не вижу пыли … не вижу хамсин», «открой все-равно - я
// хочу видть все даже если мало»): the main card's air block at an ordinary dust (25 µg/m³), a khamsin (240) and no dust value,
// in ru, he and uk at 1920×1080 — the block keeps its size in every state (nothing moves), nothing is cut, all legible; the
// Israel chips say «хамсин» in a khamsin. DUST_SHOTS=<dir> also writes main-<lang>-<dust>.png and israel-<lang>-<dust>.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, rainyWeather as rainy } from './page.mjs';

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'fixtures', 'air', 'aq-4places.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const NOW = Date.parse('2026-11-02T07:31:00Z');
// The recorded air answer with every place's dust set to `dust` (null: the source gave none).
const airWith = (dust) => () => {
  const list = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const p of list) p.current.dust = dust;
  return { status: 200, contentType: 'application/json', body: JSON.stringify(list) };
};
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
// [the dust item's label, its value at 25, the khamsin word, the air line's label]
const WORD = { ru: ['Пыль', '25 мкг/м³', 'хамсин', 'Воздух:'], he: ['אבק', '25 מק״ג/מ״ק', 'חמסין', 'אוויר:'], uk: ['Пил', '25 мкг/м³', 'хамсин', 'Повітря:'] };

for (const lang of ['ru', 'he', 'uk']) {
  test('Dust always, ' + lang + ': 25 µg/m³ muted, 240 a khamsin, none no line — the air block the same size in every state, nothing cut', async () => {
    const boxes = {};
    for (const dust of [25, 240, 3400, null]) {
      const app = await openApp({ lang, weather: rainy, news: 'ok', alerts: 'empty-bom.txt', air: airWith(dust), now: NOW, configure: (c) => { c.rotation.enabled = false; } });
      try {
        const p = app.page;
        await p.waitForSelector('.now-air .air-num', { timeout: 10000 });
        await p.evaluate(() => document.fonts.ready); await wait(500);
        const v = await p.evaluate(() => {
          const q = (s) => document.querySelector(s), r = (e) => e.getBoundingClientRect();
          const b = r(q('.now-air')), top = r(q('.now-top')), d = q('.now-air .air-dust'), items = [...document.querySelectorAll('.now-air .air-item')];
          // B22 (owner 2026-11-04, judges' common decision, city card, fixes 1–2): the dust item's label is a plain «Пыль»; the one
          // key, the grades' scale, is on the hourly title row (bidi marks stripped)
          const key = d.querySelector('.air-label'), pill = document.querySelector('#hourly .card-head .dust-legend-scale'), value = d.querySelector('.air-value');
          return { box: [Math.round(b.width), Math.round(b.height)], cls: d.className, label: key ? key.textContent : null,
            pill: pill ? pill.textContent.replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, '') : null, active: pill ? pill.classList.contains('is-active') : null,
            legends: document.querySelectorAll('#screen-main .dust-legend').length,
            value: value ? value.textContent.replace(/\s+/g, ' ').trim() : null, word: d.querySelector('.air-word') ? d.querySelector('.air-word').textContent : null,
            wordInValue: !!(value && value.querySelector('.air-word')), // one line: every part of the value overlaps every other vertically (a wrapped part would sit wholly below)
            lines: value ? (Math.max.apply(null, [...value.children].map((c) => r(c).top)) < Math.min.apply(null, [...value.children].map((c) => r(c).bottom)) ? 1 : 2) : 0,
            heights: items.map((i) => Math.round(r(i).height)), gaps: items.slice(1).map((i, k) => Math.round(r(i).top - r(items[k]).bottom)),
            inside: b.bottom <= top.bottom + 0.5 };
        });
        boxes[dust] = v.box;
        assert.equal(v.heights.length, 3, 'three items: air quality, dust, UV (B22 fix 4)');
        assert.ok(v.inside, lang + ' ' + dust + ': the three items fit the card');
        assert.deepEqual(v.gaps, [20, 20], 'the same gap between the items');
        // OWNER-1LEG-C: the label is the one legend «Пыль [хамсин ≥ 100]» — the pill quiet on an ordinary day, amber in a khamsin
        // (it replaces N1's amber «Пыль · хамсин» word); one legend on the whole main screen, none in the title rows
        if (dust === 25) assert.deepEqual([v.cls, v.label, v.pill, v.active, v.value, v.word, v.legends], ['air-item air-dust', WORD[lang][0], '100121196271', false, WORD[lang][1], null, 1], lang);
        // N1 (batch 16) kept: even a 4-digit value and its unit fit the block on one line
        if (dust >= 240) assert.deepEqual([v.cls, v.label, v.pill, v.active, v.word, v.wordInValue, v.lines, v.legends], ['air-item air-dust', WORD[lang][0], '100121196271', true, null, false, 1, 1], lang + ' ' + dust + ': the key amber on the label line, the value one line');
        if (dust === null) assert.deepEqual([v.cls, v.label, v.value, v.legends], ['air-item air-dust is-none', null, null, 1], 'no value: no item drawn (B22 fix 1: the key stays on the hourly title row)');
        assert.deepEqual(v.heights, [68, 68, 68], 'every item the same height, the dust slot reserved when empty');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + dust + ' main');
        assert.deepEqual((await p.evaluate(legibility, '#screen-main .now-air *')).bad, [], lang + ' ' + dust + ' legible');
        if (process.env.DUST_SHOTS) { fs.mkdirSync(process.env.DUST_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.DUST_SHOTS, 'main-' + lang + '-' + dust + '.png') }); }
        await press(p, 39); await wait(900);
        const chips = await p.$$eval('#screen-israel .region-air', (c) => c.map((e) => e.textContent.trim()));
        assert.ok(chips.every((t) => t.indexOf(WORD[lang][3]) === 0), lang + ': every air line is labelled: ' + JSON.stringify(chips));
        if (dust >= 240) assert.deepEqual(chips, [0, 1, 2].map(() => WORD[lang][3] + ' ' + WORD[lang][2]), 'a khamsin on every region, labelled');
        else assert.ok(chips.every((t) => t.indexOf(WORD[lang][2]) < 0), 'no khamsin below 100 µg/m³');
        // the chance of rain never over the weather icon (the owner: «должно быть понятно»), here and on the main 7-day list.
        // OWNER-1LEG-C (design C): the rain now stands BESIDE the icon on the day's one line, so «over» is a 2-D overlap of the
        // two boxes (it was a vertical one while the rain sat under the icon); and beside means on the same line.
        const overlap = await p.evaluate(() => [...document.querySelectorAll('.day-icon')].filter((s) => {
          const i = s.querySelector(':scope > .icon'), t = s.querySelector('.day-pop'); if (!i || !t || !t.textContent) return false;
          const a = i.getBoundingClientRect(), b = t.getBoundingClientRect();
          const over = b.top < a.bottom - 0.5 && a.top < b.bottom - 0.5 && b.left < a.right - 0.5 && a.left < b.right - 0.5;
          const sameLine = (b.top + b.bottom) / 2 > a.top && (b.top + b.bottom) / 2 < a.bottom;
          return over || !sameLine; }).length);
        assert.equal(overlap, 0, lang + ': a rain chance overlaps its icon or left its line');
        // dust13 F1 (batch 16): «☂100%» inside its 88 px slot — the line is no wider than the slot, on both screens
        const spill = await p.evaluate(() => [...document.querySelectorAll('.day-pop')].filter((t) => t.textContent && t.scrollWidth > t.clientWidth).map((t) => t.textContent + ' ' + t.scrollWidth + '>' + t.clientWidth));
        assert.deepEqual(spill, [], lang + ': a rain chance wider than its slot');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' ' + dust + ' israel');
        if (process.env.DUST_SHOTS) await p.screenshot({ path: path.join(process.env.DUST_SHOTS, 'israel-' + lang + '-' + dust + '.png') });
        assert.deepEqual(app.errors, []);
      } finally { await app.close(); }
    }
    assert.deepEqual(boxes[240], boxes[25], lang + ': nothing moves between an ordinary day and a khamsin');
    assert.deepEqual(boxes[null], boxes[25], lang + ': nor without a dust value');
  });
}
