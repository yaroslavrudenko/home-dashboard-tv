// FIX-18B 13 (the owner, 2026-11-03: «Цвет хамсина должен быть в зависимости от его опасности. Чем опаснее, тем краснее»): a
// khamsin reading's pill takes the colour of its grade (js/air.js Air.grade, the EEA PM10 bands: 100–120 amber, 121–195
// orange, 196–270 red-orange, > 270 red) — on the current card, in the hourly strip, in the 7-day band and in the Israel bands;
// a solid fill under dark ink; the main screen's one key (FIX-18B 13B) is the scale of the four grades on the current card's
// dust label, lit when a khamsin is on screen.
// At 1920×1080 in ru and he, with every place's current and forecast dust set to the reading: the computed colour per level,
// the text against its own pill ≥ 4.5:1, nothing cut. FIX-18B 7: the current card keeps the pill's colour (never the plain
// dust colour). KHAMSIN_SHOTS=<dir> writes the screens for 120, 250, 600, 1500 and 3400.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, airForecastAnswer } from './page.mjs';

const REAL = 'aq-4places-hourly-2026-11-02';
const COLOUR = { 1: 'rgb(255, 210, 122)', 2: 'rgb(255, 160, 90)', 3: 'rgb(255, 122, 89)', 4: 'rgb(242, 85, 85)' };   // the pill's fill per grade (dark ink on it)
const GRADE = { 120: 1, 150: 2, 250: 3, 600: 4, 1500: 4, 3400: 4 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const every = (v) => () => {
  const list = JSON.parse(airForecastAnswer(REAL, -4)().body);
  for (const p of list) { p.current.dust = v; p.hourly.dust = p.hourly.dust.map((d) => (d === null ? null : v)); }
  return { status: 200, contentType: 'application/json', body: JSON.stringify(list) };
};
// Runs in the page: each khamsin pill under `root` — its grade class, its text colour and the contrast of the text against
// its own pill composited over the lightest card background (the legibility rule's background).
function pills(root) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
  const card = over([255, 255, 255], 0.085, [0x1a, 0x23, 0x40]);
  return [...document.querySelectorAll(root + ' .dust-num.is-khamsin')].filter((e) => e.offsetParent).map((e) => {
    const cs = getComputedStyle(e), fg = cs.color.match(/[\d.]+/g).map(Number), b = cs.backgroundColor.match(/[\d.]+/g).map(Number);
    const bg = over(b.slice(0, 3), b.length > 3 ? b[3] : 1, card), l1 = lum(fg.slice(0, 3)), l2 = lum(bg), contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { where: e.closest('.dust-legend-scale') ? 'scale' : e.closest('.air-dust') ? 'current' : e.closest('.hour-dust') ? 'hour' : e.closest('.dust-band') ? 'band' : e.closest('.region-air') ? 'chip' : 'other',
      grade: (e.className.match(/kg-(\d)/) || [0, 0])[1] | 0, colour: cs.backgroundColor, contrast: Math.round(contrast * 100) / 100, text: e.textContent };
  });
}

for (const lang of ['ru', 'he']) {
  test('FIX-18B 13 ' + lang + ': a khamsin\'s pill is coloured by its grade everywhere (current, hours, 7-day band, Israel bands), text ≥ 4.5:1 on its pill, nothing cut', async () => {
    for (const v of Object.keys(GRADE).map(Number)) {
      const app = await openApp({ lang, weather: 'ok', air: every(v), alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
      try {
        const p = app.page, g = GRADE[v];
        await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 });
        await p.evaluate(() => document.fonts.ready); await wait(300);
        const main = await p.evaluate(pills, '#screen-main');
        const seen = new Set(main.filter((x) => x.where !== 'scale').map((x) => x.where));
        assert.deepEqual([...seen].sort(), ['band', 'current', 'hour'], lang + ' ' + v + ': the reading, the hours and the days are all pills');
        for (const x of main.filter((y) => y.where !== 'scale')) assert.deepEqual([x.grade, x.colour], [g, COLOUR[g]], lang + ' ' + v + ' ' + x.where + ' "' + x.text + '"');
        const scale = main.filter((x) => x.where === 'scale');
        assert.deepEqual(scale.map((x) => [x.text, x.grade, x.colour]), [['100', 1, COLOUR[1]], ['121', 2, COLOUR[2]], ['196', 3, COLOUR[3]], ['271', 4, COLOUR[4]]], lang + ': the scale, once');
        for (const x of main) assert.ok(x.contrast >= 4.5, lang + ' ' + v + ' ' + x.where + ' "' + x.text + '": ' + x.contrast + ':1 on its pill');
        assert.deepEqual(await p.$$eval('#screen-main .dust-legend-scale', (e) => e.map((x) => [x.className, !!x.closest('.now-air .air-dust')])), [['dust-legend-scale is-active', true]], 'FIX-18B 13B: ONE key — the scale, lit, on the current card\'s dust item');
        assert.equal(await p.$$eval('#screen-main .card-head .dust-num', (e) => e.length), 0, 'no grades in a title row');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + v + ' main');
        if (process.env.KHAMSIN_SHOTS && v !== 150) { fs.mkdirSync(process.env.KHAMSIN_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.KHAMSIN_SHOTS, 'khamsin-' + lang + '-' + v + '-main.png') }); }
        await press(p, 39); await wait(1200);
        const isr = await p.evaluate(pills, '#screen-israel');
        assert.ok(isr.length >= 3, lang + ' ' + v + ': the Israel bands carry khamsin pills');
        // FIX-18D 3 (Codex): each region's air chip «Воздух: хамсин» — its word on the same grade's pill (asserted with the rest below)
        assert.deepEqual(isr.filter((x) => x.where === 'chip').map((x) => [x.grade, x.colour]), [0, 1, 2].map(() => [g, COLOUR[g]]), lang + ' ' + v + ': the three chips in grade ' + g);
        for (const x of isr) assert.deepEqual([x.grade, x.colour, x.contrast >= 4.5], [g, COLOUR[g], true], lang + ' ' + v + ' Israel "' + x.text + '" ' + x.contrast);
        assert.equal(await p.$$eval('#screen-israel .dust-legend-scale', (e) => e.length), 0, 'the scale is the main screen\'s only');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' ' + v + ' israel');
        if (process.env.KHAMSIN_SHOTS && v !== 150) await p.screenshot({ path: path.join(process.env.KHAMSIN_SHOTS, 'khamsin-' + lang + '-' + v + '-israel.png') });
        assert.deepEqual(app.errors, []);
      } finally { await app.close(); }
    }
  });
}

// FIX-18B 13A (the coordinator: «1500» pills ran together in the Israel bands): in a 70 px band cell a value from 1000 on is
// said in thousands («1,5к», «3,4к»); neighbouring pills keep ≥ 8 px between their edges and ≥ 16 px between their text, on the
// main and every Israel band, in ru, he and uk at 1500 and 3400. Before: 5.7 px between pills, 7.7 px between text.
function bandGaps(root) {
  const out = [];
  for (const band of document.querySelectorAll(root + ' .dust-band')) {
    const ps = [...band.querySelectorAll('.dust-num')].map((e) => { const r = e.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect(); return [r.left, r.right, t.left, t.right, e.textContent]; }).sort((a, b) => a[0] - b[0]);
    let pill = Infinity, text = Infinity, inner = Infinity;
    for (let i = 1; i < ps.length; i++) { pill = Math.min(pill, ps[i][0] - ps[i - 1][1]); text = Math.min(text, ps[i][2] - ps[i - 1][3]); }
    for (const q of ps) inner = Math.min(inner, q[2] - q[0], q[1] - q[3]);   // FIX-18C K1: room between the text and its pill's edge
    out.push({ pill: Math.round(pill * 10) / 10, text: Math.round(text * 10) / 10, inner: Math.round(inner * 10) / 10, n: ps.length, first: ps[0][4] });
  }
  return out;
}
// FIX-18C K1: the hourly row's khamsin pills — the gap between neighbours and the room inside each
function hourGaps() {
  const ps = [...document.querySelectorAll('.hour-dust .dust-num.is-khamsin')].map((e) => { const r = e.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect(); return [r.left, r.right, t.left, t.right]; }).sort((a, b) => a[0] - b[0]);
  let pill = Infinity, inner = Infinity;
  for (let i = 1; i < ps.length; i++) pill = Math.min(pill, ps[i][0] - ps[i - 1][1]);
  for (const q of ps) inner = Math.min(inner, q[2] - q[0], q[1] - q[3]);
  return { n: ps.length, pill: Math.round(pill * 10) / 10, inner: Math.round(inner * 10) / 10 };
}
for (const lang of ['ru', 'he', 'uk']) {
  test('FIX-18B 13A ' + lang + ': 1500 and 3400 in the dust bands — said in thousands, pills ≥ 8 px apart, text ≥ 16 px (main and Israel)', async () => {
    const SHORT = { ru: ['1,5к', '3,4к'], uk: ['1,5к', '3,4к'], he: ['1.5K', '3.4K'] }[lang];
    for (const [k, v] of [1500, 3400].entries()) {
      const app = await openApp({ lang, weather: 'ok', air: every(v), alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
      try {
        const p = app.page;
        await p.waitForFunction(() => document.querySelectorAll('#daily .dust-band .dust-num').length >= 3, { timeout: 10000 });
        await p.evaluate(() => document.fonts.ready); await wait(300);
        const main = await p.evaluate(bandGaps, '#screen-main');
        assert.equal(await p.$eval('.hour-dust .dust-num', (e) => e.textContent), String(v), 'the hours keep the whole figure');
        const hours = await p.evaluate(hourGaps);
        assert.ok(hours.n === 12 && hours.pill >= 12 && hours.inner >= 4, lang + ' ' + v + ' FIX-18C K1 hours: ' + JSON.stringify(hours));
        await press(p, 39); await wait(1200);
        const all = main.concat(await p.evaluate(bandGaps, '#screen-israel'));
        assert.equal(all.length, 4, 'the main band and three Israel bands');
        for (const g of all) {
          assert.equal(g.first, SHORT[k], lang + ' ' + v + ': in thousands');
          assert.ok(g.n >= 3 && g.pill >= 12 && g.text >= 16 && g.inner >= 4, lang + ' ' + v + ' (FIX-18C K1: pills ≥ 12 px apart, ≥ 4 px inside): ' + JSON.stringify(g));
        }
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' ' + v + ' israel');
      } finally { await app.close(); }
    }
  });
}

// FIX-18C K2 (the designer): the one legend is ONE segmented bar «[100|121|196|271]» after «Пыль» — the four segments touch
// (0 px), square inside, rounded only at the bar's two ends (mirrored right to left); greyed with no khamsin on screen, lit with
// one; ≥ 16 px clear of the weather icon's drawing, in ru, he and uk; nothing cut.
for (const lang of ['ru', 'he', 'uk']) {
  test('FIX-18C K2 ' + lang + ': the legend is one segmented bar — contiguous segments, rounded ends only, ≥ 16 px clear of the icon', async () => {
    for (const v of [25, 250]) {
      const app = await openApp({ lang, weather: 'ok', air: every(v), alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
      try {
        const p = app.page;
        await p.waitForSelector('.now-air .dust-legend-scale', { timeout: 10000 });
        await p.evaluate(() => document.fonts.ready); await wait(300);
        const r = await p.evaluate(() => {
          const rtl = document.documentElement.dir === 'rtl', bar = document.querySelector('.now-air .dust-legend-scale');
          const segs = [...bar.querySelectorAll('.dust-num')], box = segs.map((e) => e.getBoundingClientRect());
          // the radius on the bar's start side and end side of each segment (start = left in ltr, right in rtl)
          const radii = segs.map((e) => { const cs = getComputedStyle(e), l = parseFloat(cs.borderTopLeftRadius) + parseFloat(cs.borderBottomLeftRadius), rr = parseFloat(cs.borderTopRightRadius) + parseFloat(cs.borderBottomRightRadius); return rtl ? [rr, l] : [l, rr]; });
          const ink = [...document.querySelectorAll('#now .now-icon svg *')].map((e) => e.getBoundingClientRect()).filter((x) => x.width);
          const il = Math.min(...ink.map((x) => x.left)), ir = Math.max(...ink.map((x) => x.right)), bl = Math.min(...box.map((x) => x.left)), br = Math.max(...box.map((x) => x.right));
          return { active: bar.classList.contains('is-active'), n: segs.length,
            gaps: box.slice(1).map((b, i) => Math.round((rtl ? box[i].left - b.right : b.left - box[i].right) * 10) / 10),
            ends: [radii[0][0] > 0, radii[0][1] === 0, radii[1][0] + radii[1][1] === 0, radii[2][0] + radii[2][1] === 0, radii[3][0] === 0, radii[3][1] > 0],
            clear: Math.round(rtl ? bl - ir : il - br) };
        });
        assert.deepEqual([r.n, r.gaps, r.ends, r.active], [4, [0, 0, 0], [true, true, true, true, true, true], v >= 100], lang + ' ' + v + ': ' + JSON.stringify(r));
        assert.ok(r.clear >= 16, lang + ' ' + v + ': ' + r.clear + ' px to the weather icon');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + v + ' main');
      } finally { await app.close(); }
    }
  });
}
