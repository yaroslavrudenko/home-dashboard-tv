// FIX-BATCH-18 part B (batch-17 note «Hebrew boot layout shift 0.3957»): a right-to-left page is never painted left to right
// first. Measured at boot in ru, he and uk at 1920×1080 with the browser's own layout-shift entries (CLS): the stage is not
// shown while <html> is .is-booting (FIX-18B 2–3: App.start's language apply takes the class off; index.html carries the
// default lang/dir and a 3 s reveal, so a script failing early never leaves a blank page). Before: he 0.3826–0.3957 (the two
// columns swapping sides); after: ≤ 0.001 in every language, and with Hebrew remembered on the TV.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './page.mjs';

const INIT = `window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });`;
for (const lang of ['ru', 'he', 'uk']) {
  test('B18 boot ' + lang + ': no layout shift at boot (CLS ≤ 0.01), the page laid out in its own direction from its first frame', async () => {
    const app = await openApp({ lang, init: INIT, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForSelector('#daily .day-max', { timeout: 10000 });
      await p.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 1000));
      const cls = await p.evaluate(() => window.__cls);
      assert.ok(cls <= 0.01, lang + ': CLS ' + cls.toFixed(4));
      assert.equal(await p.evaluate(() => document.documentElement.dir), lang === 'he' ? 'rtl' : 'ltr');
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

// FIX-BATCH-18 part B (batch-17 note «the hourly list +2 px on data arrival»): an hour's placeholder is as tall as the hour it
// stands for (icon 44 · 4 · rain 24 · temperature 38 = 110 with its 4 px margin), so nothing in the strip moves when the
// weather lands — its dust line included. Measured before: 164.8 → 166.8 px.
const hourGeo = () => [...document.querySelectorAll('.hour')].slice(0, 2).map((h) => { const r = h.getBoundingClientRect(), d = h.querySelector('.hour-dust').getBoundingClientRect(); return [r.height, d.top]; });
test('B18 hourly: the strip keeps its height and every dust line its place when the weather arrives', async () => {
  const opts = { air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } };
  const a = await openApp(Object.assign({ weather: { hang: true } }, opts));
  let loading;
  try { await a.page.waitForSelector('.hour.is-empty .skeleton', { timeout: 10000 }); await new Promise((r) => setTimeout(r, 400)); loading = await a.page.evaluate(hourGeo); } finally { await a.close(); }
  const b = await openApp(Object.assign({ weather: 'ok' }, opts));
  try {
    await b.page.waitForSelector('.hour .hour-temp', { timeout: 10000 }); await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(await b.page.evaluate(hourGeo), loading, 'the same heights and dust lines with data as while loading');
  } finally { await b.close(); }
});

// FIX-18B 3: Hebrew remembered on the TV (no configured language): the same — no shift at boot.
test('B18 boot, Hebrew remembered on the TV: no layout shift (CLS ≤ 0.01), right to left', async () => {
  const app = await openApp({ init: INIT + "localStorage.setItem('homedash.lang', 'he');", weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForSelector('#daily .day-max', { timeout: 10000 });
    await p.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 1000));
    assert.equal(await p.evaluate(() => document.documentElement.dir), 'rtl');
    const cls = await p.evaluate(() => window.__cls);
    assert.ok(cls <= 0.01, 'CLS ' + cls.toFixed(4));
  } finally { await app.close(); }
});
// FIX-18B 3 (native N3): should App.start never run (a script failing early), the page is not left blank — the stage shows
// after 3 s, in index.html's default language direction.
test('B18 boot: a failed start still shows the stage after 3 s (no blank page), left to right as index.html says', async () => {
  const BROKEN = "Object.defineProperty(window, 'App', { configurable: true, get: function () { return { start: function () { throw new Error('boot broken on purpose'); } }; }, set: function () {} });";
  const app = await openApp({ init: BROKEN, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt' });
  try {
    const p = app.page;
    const early = await p.evaluate(() => getComputedStyle(document.getElementById('stage')).opacity);
    await new Promise((r) => setTimeout(r, 3600));
    const later = await p.evaluate(() => [getComputedStyle(document.getElementById('stage')).opacity, document.documentElement.dir, document.documentElement.lang]);
    assert.deepEqual([early, later], ['0', ['1', 'ltr', 'ru']], 'hidden while booting, then shown');
  } finally { await app.close(); }
});
