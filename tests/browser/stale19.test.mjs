// FIX-BATCH-19 item 5 (NEXT-BATCH, verify FIX-15B): the main screen with a forecast from the day before (the recording of
// 2026-10-29 20:32 shown at 09:00 the next morning: its reading is of another day, its 7 days end a day early). The 7-day list shows seven named rows — the seventh, past the data,
// says «—» for what it lacks, never an empty slot, at the same height; the big figure, the strip's «Сейчас» and the Israel clock
// card show the same hour's temperature. In ru, he and uk at 1920×1080, nothing cut. STALE_SHOTS=<dir> writes the screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, FIXED_NOW, weatherAnswer } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const NEXT_MORNING = FIXED_NOW + 12.5 * 3600000;   // 2026-10-30 09:00 in Israel
for (const lang of ['ru', 'he', 'uk']) {
  test('B19 item 5 ' + lang + ': a forecast from yesterday — seven named day rows (the last «—»), one hour for «now» everywhere', async () => {
    const app = await openApp({ lang, now: NEXT_MORNING, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForSelector('#daily .day-max', { timeout: 10000 });
      await p.evaluate(() => document.fonts.ready); await wait(500);
      const r = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#daily .days .day')];
        return { status: document.getElementById('status').className, n: rows.length, gaps: rows.filter((d) => d.classList.contains('is-gap')).length,
          names: rows.map((d) => d.querySelector('.day-name') ? d.querySelector('.day-name').textContent : ''),
          last: [...rows[6].querySelectorAll('.day-min, .day-max')].map((e) => e.textContent), heights: [...new Set(rows.map((d) => Math.round(d.getBoundingClientRect().height)))],
          big: document.querySelector('.now-temp').textContent, now: document.querySelector('.hour.is-now .hour-temp').textContent,
          clock: document.querySelector('#clock-israel .clock-temp').textContent };
      });
      assert.deepEqual([r.n, r.gaps, r.names.every(Boolean), r.last, r.heights.length], [7, 0, true, ['—', '—'], 1], lang + ': ' + JSON.stringify(r));
      assert.deepEqual([r.big, r.clock], [r.now, r.now], lang + ': the big figure, «Сейчас» and the clock card: the same hour');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      if (process.env.STALE_SHOTS) { fs.mkdirSync(process.env.STALE_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.STALE_SHOTS, 'b19-stale-' + lang + '-main.png') }); }
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

// FIX-19B C8 (Gemini LOW 1): a fresh answer read at 05:50 (night) seen at 06:05, when its forecast's 06:00 is day — the home
// clock card's night tint and its icon both follow that one hour (day): no night tint over a sun.
test('FIX-19B C8: at 06:05, a 05:50 night reading — the clock card is day by the same hour as its icon', async () => {
  const at0550 = (n, url) => {
    const list = JSON.parse(weatherAnswer(url));
    for (const w of list) if (w.current) { w.current.time = '2026-10-30T05:45'; w.current.is_day = 0; }
    return { status: 200, body: JSON.stringify(list) };
  };
  const app = await openApp({ now: Date.parse('2026-10-30T04:05:00Z'), weather: at0550, air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForSelector('#clock-israel .clock-temp', { timeout: 10000 });
    const r = await p.evaluate(() => { const c = document.getElementById('clock-israel'); return { night: c.classList.contains('is-night'), sun: !!c.querySelector('.clock-weather .ic-sun'), moon: !!c.querySelector('.clock-weather .ic-moon') }; });
    assert.deepEqual(r, { night: false, sun: true, moon: false }, JSON.stringify(r));
  } finally { await app.close(); }
});
