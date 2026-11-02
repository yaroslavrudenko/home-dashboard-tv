// The dust always shown (the owner, 2026-11-02: «вижу ультрофеолет - но не вижу пыли … не вижу хамсин», «открой все-равно - я
// хочу видть все даже если мало»): the main card's air block at an ordinary dust (25 µg/m³), a khamsin (240) and no dust value,
// in ru, he and uk at 1920×1080 — the block keeps its size in every state (nothing moves), nothing is cut, all legible; the
// Israel chips say «хамсин» in a khamsin. DUST_SHOTS=<dir> also writes main-<lang>-<dust>.png and israel-<lang>-<dust>.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility } from './page.mjs';

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
const WORD = { ru: ['Пыль · 25 мкг/м³', 'Хамсин', 'хамсин'], he: ['אבק · 25 מק״ג/מ״ק', 'חמסין', 'חמסין'], uk: ['Пил · 25 мкг/м³', 'Хамсин', 'хамсин'] };

for (const lang of ['ru', 'he', 'uk']) {
  test('Dust always, ' + lang + ': 25 µg/m³ muted, 240 a khamsin, none no line — the air block the same size in every state, nothing cut', async () => {
    const boxes = {};
    for (const dust of [25, 240, null]) {
      const app = await openApp({ lang, weather: 'ok', news: 'ok', alerts: 'empty-bom.txt', air: airWith(dust), now: NOW, configure: (c) => { c.rotation.enabled = false; } });
      try {
        const p = app.page;
        await p.waitForSelector('.now-air .air-num', { timeout: 10000 });
        await p.evaluate(() => document.fonts.ready); await wait(500);
        const v = await p.evaluate(() => { const b = document.querySelector('.now-air').getBoundingClientRect(), d = document.querySelector('.now-air .air-dust');
          return { box: [Math.round(b.width), Math.round(b.height)], dust: d.className, text: d.textContent, dustBox: Math.round(d.getBoundingClientRect().height) }; });
        boxes[dust] = v.box;
        if (dust === 25) assert.deepEqual([v.dust, v.text], ['air-dust is-normal', WORD[lang][0]]);
        if (dust === 240) assert.ok(v.dust === 'air-dust is-high' && v.text.startsWith(WORD[lang][1]), lang + ': ' + v.text);
        if (dust === null) assert.deepEqual([v.dust, v.text], ['air-dust is-none', ''], 'no value: no line');
        assert.equal(v.dustBox, 60, 'the two-line slot is reserved');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + dust + ' main');
        assert.deepEqual((await p.evaluate(legibility, '#screen-main .now-air *')).bad, [], lang + ' ' + dust + ' legible');
        if (process.env.DUST_SHOTS) { fs.mkdirSync(process.env.DUST_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.DUST_SHOTS, 'main-' + lang + '-' + dust + '.png') }); }
        await press(p, 39); await wait(900);
        const chips = await p.$$eval('#screen-israel .region-air', (c) => c.map((e) => e.textContent.trim()));
        if (dust === 240) assert.deepEqual(chips, [WORD[lang][2], WORD[lang][2], WORD[lang][2]], 'a khamsin on every region chip');
        else assert.ok(chips.every((t) => t !== WORD[lang][2]), 'no khamsin below 100 µg/m³');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' ' + dust + ' israel');
        if (process.env.DUST_SHOTS) await p.screenshot({ path: path.join(process.env.DUST_SHOTS, 'israel-' + lang + '-' + dust + '.png') });
        assert.deepEqual(app.errors, []);
      } finally { await app.close(); }
    }
    assert.deepEqual(boxes[240], boxes[25], lang + ': nothing moves between an ordinary day and a khamsin');
    assert.deepEqual(boxes[null], boxes[25], lang + ': nor without a dust value');
  });
}
