// OWNER-1LEG-C (owner 2026-11-02, one legend + design C), batch 17. At the TV's 1920×1080, in ru, he and uk, on the main
// screen's 7 days and on each Israel region's 7 days (batch 18; were 5), with the khamsin air (the 2026-11-02 SYNTHETIC khamsin moved to the
// weather recordings' dates, as tests/browser/dustforecast13.test.mjs) and real rain chances (33 … 100 %, the widest «☂100%»):
//   - every day row is ONE line: day · icon + rain · min ─bar─ max — every item overlaps every other vertically;
//   - between the row's neighbouring items at least 14 px of INK (text measured with a Range over its text nodes, the icon by
//     its svg, the bar by its box — never a fixed box that is wider than what stands in it);
//   - the dust band under the list: between neighbouring band cells' text (the day's short name over its dust, the khamsin
//     pill included) at least 16 px;
//   - nothing cut (no text wider than its box, nothing outside its card or the screen).
// Measured minimum gaps on the FINAL tree (FIX-17B, 2026-11-03, headless Chrome at 1920×1080) — band cells (khamsin pill
// included) / row items, px; Israel = north, center, south:
//   ru: main 24.8 / 14   Israel 46.3, 37.5, 42.0 / 14
//   he: main 22.0 / 14   Israel 46.5, 37.7, 45.7 / 14
//   uk: main 18.0 / 14   Israel 42.8, 34.0, 42.8 / 14
// FIX-17C (owner, 2026-11-03: design C, row gap 16 px): the bar's margins 14 → 16 px; row items now ≥ 16 px in ru, he
// and uk on both screens (worst row «☂100%» · «45°»: rain → low 19.3, low → bar 16, bar → high 22.9), the bar 67 → 63 px,
// nothing cut; the band and the row and card boxes unchanged.
// History: on the first batch-17 tree the row minimum was 9.8 px (day 2's «☂100%» → its low) and the uk band minimum 14.5 px
// («Сьог.»/197 → «Пт»/240); fixed by the 138 px icon slot (D2), today's 1.1 share of the band and its 1 px pills (D3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure, airForecastAnswer, rainyWeather as rainy } from './page.mjs';

const KHAMSIN = 'aq-4places-hourly-khamsin-synthetic-2026-11-02';
const BAND_GAP = 16, ROW_GAP = 16;   // the row gap: 16 px (owner, 2026-11-03: design C; was 14)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);

// Runs in the page: the gaps of the day rows and of the dust band under `root` (a card), in the reading direction.
function gapsOf(root) {
  const card = document.querySelector(root), rtl = document.documentElement.dir === 'rtl';
  // the ink of an element: the union of its text nodes' boxes (Range) and its svg icons' boxes; null when nothing is drawn
  const ink = (el) => {
    const rects = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width && r.height) rects.push(r);
    }
    for (const s of el.querySelectorAll('svg')) { const r = s.getBoundingClientRect(); if (r.width && r.height) rects.push(r); }
    // a khamsin pill: its own painted box (padding and background), not only its digits
    for (const s of el.querySelectorAll('.is-khamsin')) { const r = s.getBoundingClientRect(); if (r.width && r.height) rects.push(r); }
    if (!rects.length) return null;
    return { l: Math.min(...rects.map((r) => r.left)), r: Math.max(...rects.map((r) => r.right)), t: Math.min(...rects.map((r) => r.top)), b: Math.max(...rects.map((r) => r.bottom)) };
  };
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const gap = (a, b) => (rtl ? a.l - b.r : b.l - a.r);
  const rows = [...card.querySelectorAll('.days .day')].filter((d) => !d.classList.contains('is-gap') && !d.classList.contains('is-empty'));
  let rowMin = Infinity, rowWorst = '';
  const lines = [], cut = [];
  rows.forEach((d, i) => {
    const items = [['name', ink(d.querySelector('.day-name'))], ['icon+rain', ink(d.querySelector('.day-icon'))], ['min', ink(d.querySelector('.day-min'))],
      ['bar', box(d.querySelector('.range'))], ['max', ink(d.querySelector('.day-max'))]].filter((x) => x[1]);
    for (let k = 1; k < items.length; k++) {
      const g = gap(items[k - 1][1], items[k][1]);
      if (g < rowMin) { rowMin = g; rowWorst = 'row ' + i + ' ' + items[k - 1][0] + '|' + items[k][0]; }
    }
    // one line: every item overlaps every other vertically
    lines.push(Math.max(...items.map((x) => x[1].t)) < Math.min(...items.map((x) => x[1].b)));
    for (const el of d.querySelectorAll('.day-name, .day-pop, .day-min, .day-max')) if (el.scrollWidth > el.clientWidth + 1) cut.push(i + ':' + el.className + ':' + el.textContent);
  });
  const cells = [...card.querySelectorAll('.dust-band .band-cell')];
  const inks = cells.map((c) => ink(c));
  let bandMin = Infinity, bandWorst = '';
  for (let k = 1; k < inks.length; k++) {
    if (!inks[k - 1] || !inks[k]) continue;
    const g = gap(inks[k - 1], inks[k]);
    if (g < bandMin) { bandMin = g; bandWorst = 'cells ' + (k - 1) + '|' + k; }
  }
  for (const [k, c] of cells.entries()) {
    const cb = box(c);
    if (inks[k] && (inks[k].l < cb.l - 0.5 || inks[k].r > cb.r + 0.5)) cut.push('band cell ' + k + ' wider than its cell');
    for (const el of c.querySelectorAll('.band-day, .day-dust')) if (el.scrollWidth > el.clientWidth + 1) cut.push('band ' + k + ':' + el.className + ':' + el.textContent);
  }
  return { rows: rows.length, cells: cells.length, filled: inks.filter(Boolean).length, oneLine: lines.every(Boolean), rowMin: Math.round(rowMin * 10) / 10, rowWorst,
    bandMin: Math.round(bandMin * 10) / 10, bandWorst, khamsin: card.querySelectorAll('.dust-band .is-khamsin').length, cut,
    rain: [...card.querySelectorAll('.days .day-pop')].map((e) => e.textContent).filter(Boolean) };
}

for (const lang of ['ru', 'he', 'uk']) {
  test('OWNER-1LEG-C ' + lang + ': the 7-day row is one line (day · icon + rain · min ─bar─ max) and the dust band\'s values stand apart — every gap between neighbouring band cells\' text ≥ 16 px, between the row\'s items ≥ 16 px, nothing cut', async () => {
    const app = await openApp({ weather: rainy, lang, air: airForecastAnswer(KHAMSIN, -4), alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('#daily .dust-band .day-dust .dust-num').length >= 5, { timeout: 10000 });
      await p.evaluate(() => document.fonts.ready); await wait(500);
      const seen = {};
      const check = (name, g, rows) => {
        seen[name] = g.bandMin + ' / ' + g.rowMin;
        assert.equal(g.rows, rows, name + ': the day rows');
        assert.deepEqual([g.cells, g.filled], [rows, rows], name + ': a band cell per day, each with its text');
        assert.ok(g.rain.length > 0, name + ': the rain chances are on screen (an empty list proves nothing)');
        assert.ok(g.oneLine, name + ': every day row on one line');
        assert.ok(g.rowMin >= ROW_GAP, name + ': ' + g.rowMin + ' px between the row\'s items (' + g.rowWorst + ')');
        assert.ok(g.bandMin >= BAND_GAP, name + ': ' + g.bandMin + ' px between the band cells\' text (' + g.bandWorst + ')');
        assert.deepEqual(g.cut, [], name + ': nothing cut');
      };
      const main = await p.evaluate(gapsOf, '#daily');
      check('main', main, 7);
      assert.ok(main.khamsin >= 1, 'the khamsin pills are measured too: ' + main.khamsin);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      await press(p, 39); await wait(1200);
      await p.waitForSelector('.region .dust-band .day-dust', { timeout: 10000 });
      for (const id of ['north', 'center', 'south']) check('israel-' + id, await p.evaluate(gapsOf, '#region-' + id), 7);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel');
      console.log('# OWNER-1LEG-C ' + lang + ' band / row min gaps px: ' + JSON.stringify(seen));
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
