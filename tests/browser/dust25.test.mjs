// Batch 25 (owner 2026-11-04, «сделай хвосты одним пакетом»): the 7-day dust band's leftovers.
// T2: the air request asks 7 forecast days (js/config.js). The answer here has the shape measured live on 2026-11-04 10:31
//     UTC with forecast_days=7: the recorded 2026-11-04 answer (days 1–5, tests/fixtures/air/aq-4places-hourly-2026-11-04.json,
//     moved 6 days back to the weather recordings' dates) with day 6's first three hours as measured (Rehovot, Haifa, Tel Aviv
//     0 0 0; Beer Sheva 7 6 6) and the rest of day 6 and all of day 7 null: day 6 is partial «—», day 7 beyond «…».
// T3: the key «… нет прогноза» — its dots come BEFORE the words in the reading order of every language: left of the words in
//     ru / uk / en, right of them in he (measured on the text itself, main and Israel screens).
// T4: while the air is stale (here: restarted with the air failing, the kept answer restored), a day the OLD answer has no
//     value for reads «—» (not refreshed yet), never «…» / «нет прогноза»; the key is gone.
// B25_SHOTS=<dir> also writes the screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, airForecastAnswer } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const shot = async (p, name) => { if (process.env.B25_SHOTS) { fs.mkdirSync(process.env.B25_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B25_SHOTS, name + '.png') }); } };
const KEY = { ru: '… нет прогноза', he: '… אין תחזית', uk: '… немає прогнозу', en: '… no forecast' };

// The 7-day answer (T2 above): each place's hours extended by 48, day 6's first three as measured live, the rest null.
const DAY6 = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [7, 6, 6]];
function sevenDays() {
  const list = JSON.parse(airForecastAnswer('aq-4places-hourly-2026-11-04', -6)().body);
  list.forEach((p, i) => {
    const last = Date.parse(p.hourly.time[p.hourly.time.length - 1] + 'Z');
    for (let h = 1; h <= 48; h++) {
      p.hourly.time.push(new Date(last + h * 3600000).toISOString().slice(0, 16));
      p.hourly.dust.push(h <= 3 ? DAY6[i][h - 1] : null);
    }
  });
  return { status: 200, contentType: 'application/json', body: JSON.stringify(list) };
}
const SEVEN = () => sevenDays();

// Every band on the visible screen: its cells' text, whether its key is there, and where the key's dots and words are.
function bands(sel) {
  return [...document.querySelectorAll(sel)].map((band) => {
    const key = band.querySelector('.band-beyond'), out = { days: [...band.querySelectorAll('.day-dust')].map((e) => e.textContent),
      stale: band.querySelectorAll('.day-dust.is-stale').length, key: key ? key.textContent : null, dots: null, words: null };
    if (key) {
      const t = key.firstChild, r = document.createRange(), box = () => { const b = r.getBoundingClientRect(); return { l: b.left, r: b.right }; };
      r.setStart(t, 0); r.setEnd(t, 1); out.dots = box();
      r.setStart(t, 2); r.setEnd(t, t.length); out.words = box();
    }
    return out;
  });
}
const CONFIGURE = { plain: (c) => { c.rotation.enabled = false; }, en: (c) => { c.rotation.enabled = false; c.languages = c.languages.concat(['en']); } };
async function open(lang, air, init) {
  const app = await openApp({ weather: 'ok', lang, air, init, configure: lang === 'en' ? CONFIGURE.en : CONFIGURE.plain });
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await app.page.evaluate(() => document.fonts.ready);
  return app;
}
// The dots before the words in the language's reading order: left of them in ltr, right of them in rtl, never overlapping.
function dotsFirst(b, lang, at) {
  const gap = lang === 'he' ? b.dots.l - b.words.r : b.words.l - b.dots.r;
  assert.ok(gap >= 0, at + ': dots ' + JSON.stringify(b.dots) + ' words ' + JSON.stringify(b.words) + ' (gap ' + gap.toFixed(1) + ')');
}

for (const lang of ['ru', 'he', 'uk', 'en']) {
  test('B25 T2+T3 ' + lang + ': a 7-day answer — days 1–5 values, day 6 partial «—», day 7 beyond «…»; the key\'s dots before its words in ' + lang + '\'s reading order', async () => {
    const app = await open(lang, SEVEN);
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('#daily .day-dust .dust-num').length === 5, { timeout: 10000 }); await wait(300);
      await shot(p, 'b25-main-' + lang);
      const m = await p.evaluate(bands, '#daily .dust-band');
      assert.deepEqual(m.map((b) => [b.days, b.key]), [[['17', '13', '2', '0', '0', '—', '…'], KEY[lang]]], lang + ' main');
      dotsFirst(m[0], lang, lang + ' main');
      if (lang === 'en') return;                     // en: the main screen only (dust24.test.mjs: the app started in en)
      await press(p, 39); await wait(1200);
      await p.waitForFunction(() => document.querySelectorAll('#screen-israel .day-dust .dust-num').length === 15, { timeout: 10000 }); await wait(300);
      const isr = await p.evaluate(bands, '#screen-israel .dust-band');
      assert.deepEqual(isr.map((b) => [b.days, b.key]), [
        [['13', '13', '0', '0', '0', '—', '…'], KEY[lang]], [['15', '12', '0', '0', '0', '—', '…'], KEY[lang]], [['24', '17', '4', '337', '81', '—', '…'], KEY[lang]]
      ], lang + ' israel');
      isr.forEach((b, i) => dotsFirst(b, lang, lang + ' israel ' + i));
    } finally { await app.close(); }
  });
}

// T4: the first air answer is the 7-day one, every later one Open-Meteo's 503; the app restarts (the kept answer comes back,
// stale) — keep14.test.mjs's restart, with the app's clock moved 20 minutes by sessionStorage.
const CLOCK = 'try { window.__offsetMs = Number(sessionStorage.getItem("b25.offset")) || 0; } catch (e) {}';
const overloaded = { status: 503, contentType: 'application/json', body: JSON.stringify({ error: true, reason: 'The service is overloaded' }) };
for (const lang of ['ru', 'he']) {
  test('B25 T4 ' + lang + ': the air stale — a day the kept answer has no value for reads «—», never «…», and the band has no «нет прогноза» key', async () => {
    const app = await open(lang, (n) => (n === 1 ? sevenDays() : overloaded), CLOCK);
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('#daily .day-dust .dust-num').length === 5 && document.querySelector('#daily .band-beyond'), { timeout: 10000 });
      assert.deepEqual((await p.evaluate(bands, '#daily .dust-band')).map((b) => [b.days, b.stale, !!b.key]), [[['17', '13', '2', '0', '0', '—', '…'], 0, true]], 'fresh: day 7 «…», the key');
      await wait(500);
      assert.ok(await p.evaluate(() => !!localStorage.getItem('air.v1')), 'the air answer kept');
      await p.evaluate(() => sessionStorage.setItem('b25.offset', String(20 * 60000)));
      await p.reload({ waitUntil: 'load' });
      await p.waitForFunction(() => document.querySelectorAll('#daily .day-dust.is-stale .dust-num').length === 5, { timeout: 10000 }); await wait(1500);
      assert.equal(app.requests.air.length, 2, 'the restarted app asked again: the 503');
      await shot(p, 'b25-stale-main-' + lang);
      const m = await p.evaluate(bands, '#daily .dust-band');
      assert.deepEqual(m.map((b) => [b.days, b.stale, b.key]), [[['17', '13', '2', '0', '0', '—', '—'], 7, null]], 'stale: day 7 «—», every cell dimmed, no key');
      await press(p, 39); await wait(1200);
      await p.waitForFunction(() => document.querySelectorAll('#screen-israel .day-dust.is-stale .dust-num').length === 15, { timeout: 10000 }); await wait(300);
      const isr = await p.evaluate(bands, '#screen-israel .dust-band');
      assert.deepEqual(isr.map((b) => [b.days[6], b.key]), [['—', null], ['—', null], ['—', null]], 'the Israel bands the same');
    } finally { await app.close(); }
  });
}
