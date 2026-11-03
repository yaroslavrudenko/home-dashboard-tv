// FIX-BATCH-18 item 8, owner chose option 1 («Сверху справа», 2026-11-03): the main screen's weather status is the screen
// status — the same component, size, side and box as on every other screen (the Israel screen's, y 48–96: inside the safe
// top margin, never in the outer 48 px a TV may crop), mirrored in Hebrew; the main grid moved down under it and keeps its
// budget (the hourly card 240 px ending at 1032, the 7 days and their dust band inside the daily card), nothing cut, in
// ru, he and uk at 1920×1080. The hourly title row keeps only its title and «Пыль».
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);

for (const lang of ['ru', 'he', 'uk']) {
  test('FIX-BATCH-18 item 8, owner chose option 1 — ' + lang + ': the main status in the Israel screen\'s status box, above the clocks; the grid in its budget, nothing cut', async () => {
    const app = await openApp({ lang, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForSelector('#status .status-dot', { timeout: 10000 });
      await p.evaluate(() => document.fonts.ready); await wait(300);
      const m = await p.evaluate((boxSrc) => {
        const b = eval(boxSrc), days = [...document.querySelectorAll('#daily .day')];
        return { status: b('#status'), parent: document.getElementById('status').parentNode.id, font: getComputedStyle(document.getElementById('status')).fontSize,
          clocks: b('.clocks'), hourly: b('.hourly-card'), daily: b('#daily'), band: b('#daily .dust-band'), lastDay: Math.round(days[days.length - 1].getBoundingClientRect().bottom),
          head: [...document.querySelectorAll('.hourly-card .card-head > *')].map((e) => e.className.split(' ')[0]), now: b('#now'),
          // FIX-18B 9: the room between the details' text and the current card's bottom
          nowRoom: Math.round(document.getElementById('now').getBoundingClientRect().bottom - Math.max.apply(null, [...document.querySelectorAll('#now .detail-value')].map((e) => e.getBoundingClientRect().bottom))) };
      }, box.toString());
      assert.equal(m.parent, 'screen-main', 'the screen\'s status, not a card\'s');
      assert.deepEqual(m.head, ['card-title', 'band-label'], 'the hourly title row: its title and «Пыль» only (the grades are on the current card: FIX-18B 13B)');
      assert.deepEqual([m.now[1], m.now[3]], [376, 768], 'FIX-18B 9: the current card\'s edges unchanged');
      assert.ok(m.nowRoom >= 20, lang + ': FIX-18B 9: ' + m.nowRoom + ' px under the details (was 13)');
      assert.ok(m.status[1] >= 48 && m.status[3] <= m.clocks[1], lang + ': inside the safe top margin, above the clocks: ' + JSON.stringify([m.status, m.clocks]));
      assert.equal(m.hourly[3] - m.hourly[1], 240, 'the hourly card keeps its 240 px');
      assert.equal(m.hourly[3], 1032, 'the cards end where they did (the 48 px bottom margin kept)');
      assert.ok(m.lastDay <= m.band[1] && m.band[3] <= m.daily[3] - 31, lang + ': the 7 days and the band inside the daily card');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      await press(p, 39); await p.waitForSelector('#israel-status .status-dot', { timeout: 10000 }); await wait(1200);   // past the 0.65 s cross-fade (its slide)
      const isr = await p.evaluate((boxSrc) => { const b = eval(boxSrc); return { status: b('#israel-status'), font: getComputedStyle(document.getElementById('israel-status')).fontSize }; }, box.toString());
      assert.equal(m.font, isr.font, 'the same size');
      // the same place: the same top and bottom, the same end edge (right in ru/uk, left in Hebrew), ±1 px for the text width
      const end = lang === 'he' ? 0 : 2;
      assert.deepEqual([m.status[1], m.status[3]], [isr.status[1], isr.status[3]], lang + ': the same line as the Israel screen\'s status');
      assert.ok(Math.abs(m.status[end] - isr.status[end]) <= 1, lang + ': the same end edge: ' + m.status[end] + ' vs ' + isr.status[end]);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
