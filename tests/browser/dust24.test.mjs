// Batch 24 (owner 2026-11-04, «для пыли а+в»): the dust band on the main screen's 7 days and on the Israel regions' bands.
// (а) a clean day — all its values exactly 0 — reads 0, not «—»; (в) a day the air answer has no value for at all is beyond
// the forecast: its cell a quiet «…» (a 70 px cell has no room for words), said once in words — «… нет прогноза» — at the
// other end of the band's head line, in ru, he (right to left), uk and en. The key fits on that one line, never overlaps the
// label, and nothing moves between the states (no air yet, the answer, the air failed). The air answer is the REAL one of
// 2026-11-04 (tests/fixtures/air/aq-4places-hourly-2026-11-04.json), moved 6 days back to the weather recordings' dates.
// B24_SHOTS=<dir> also writes the screenshots (main and Israel, ru and he).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, airForecastAnswer } from './page.mjs';

const TODAY = airForecastAnswer('aq-4places-hourly-2026-11-04', -6);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const KEY = { ru: '… нет прогноза', he: '… אין תחזית', uk: '… немає прогнозу', en: '… no forecast' };
const shot = async (p, name) => { if (process.env.B24_SHOTS) { fs.mkdirSync(process.env.B24_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B24_SHOTS, name + '.png') }); } };

// Every band on the visible screen: what it says and where its parts are.
function bands(sel) {
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  return [...document.querySelectorAll(sel)].map((band) => {
    const head = band.querySelector('.band-head'), label = head.querySelector('.band-label'), key = head.querySelector('.band-beyond');
    return { days: [...band.querySelectorAll('.day-dust')].map((e) => e.textContent), beyondMarks: band.querySelectorAll('.day-dust .dust-beyond').length,
      key: key ? key.textContent : null, keyLines: key ? key.getClientRects().length : 0, keyBox: key ? box(key) : null, labelBox: box(label),
      head: box(head), band: box(band), card: box(band.closest('.card')), cells: [...band.querySelectorAll('.band-cell')].map(box),
      slots: [...band.querySelectorAll('.day-dust')].map(box), rtl: document.documentElement.dir === 'rtl' };
  });
}
const geometry = (bs) => bs.map((b) => ({ head: b.head, band: b.band, cells: b.cells, slots: b.slots, label: b.labelBox }));

// en is the strings' fallback table, not one of the TV's languages (Config.languages: ru, he, uk): the en run adds it, so
// its key is laid out too (the configure function runs in the page, serialised: no closure). Measured 2026-11-04: an app
// started in en throws once at start (js/news.js: the news feeds have no en entry — no TV language, outside batch 24) and the
// screens' rotation by key does not run, so the en run checks the main screen's band only and allows exactly that error.
const CONFIGURE = { plain: (c) => { c.rotation.enabled = false; }, en: (c) => { c.rotation.enabled = false; c.languages = c.languages.concat(['en']); } };
async function open(lang, air) {
  const app = await openApp({ weather: 'ok', lang, air, configure: lang === 'en' ? CONFIGURE.en : CONFIGURE.plain });
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await app.page.evaluate(() => document.fonts.ready);
  return app;
}
// The main screen's band and the Israel screen's three, once the dust state `ready` holds on each.
async function both(app, ready, mainOnly) {
  const p = app.page;
  await p.waitForFunction(ready, { timeout: 10000 }, '#daily .dust-band'); await wait(300);
  const main = await p.evaluate(bands, '#daily .dust-band');
  if (mainOnly) return { main, israel: [] };
  await press(p, 39); await wait(1200);                       // the screen's fade-in done, as the other screen tests
  await p.waitForFunction((sel, n) => document.querySelectorAll(sel).length === n, { timeout: 10000 }, '#screen-israel .dust-band', 3);
  await p.waitForFunction(ready, { timeout: 10000 }, '#screen-israel .dust-band'); await wait(300);
  const israel = await p.evaluate(bands, '#screen-israel .dust-band');
  return { main, israel };
}
const filled = (sel) => [...document.querySelectorAll(sel + ' .day-dust')].every((e) => e.textContent !== '');

for (const lang of ['ru', 'he', 'uk', 'en']) {
  test('B24 ' + lang + ': a clean day reads 0, the days beyond the forecast «…» with «' + KEY[lang] + '» once on the head line — one line, apart from the label, and nothing moves between no air / the answer / air failed', async () => {
    let loading, failed;
    const mainOnly = lang === 'en';
    const l = await open(lang, () => ({ hang: true }));
    try { loading = await both(l, (sel) => document.querySelectorAll(sel + ' .day-dust').length > 0, mainOnly); } finally { await l.close(); }
    const f = await open(lang, 'fail');
    try { failed = await both(f, filled, mainOnly); } finally { await f.close(); }
    const app = await open(lang, TODAY);
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('#daily .day-dust .dust-num').length === 5, { timeout: 10000 }); await wait(300);
      await shot(p, 'b24-main-' + lang);
      const m = await p.evaluate(bands, '#daily .dust-band');
      // the real 2026-11-04 answer: Rehovot Wed 17 · Thu 13 · Fri 2 · Sat 0 · Sun 0 (24 × 0 each, (а)); Mon, Tue not in the answer ((в))
      assert.deepEqual(m.map((b) => [b.days, b.beyondMarks, b.key]), [[['17', '13', '2', '0', '0', '…', '…'], 2, KEY[lang]]], lang + ' main');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main: nothing cut or outside');
      assert.deepEqual((await p.evaluate(legibility, '#daily .dust-band *')).bad, [], lang + ' main: legible');
      let isr = [];
      if (!mainOnly) {
      await press(p, 39); await wait(1200);
      await p.waitForFunction(() => document.querySelectorAll('#screen-israel .day-dust .dust-num').length === 15, { timeout: 10000 }); await wait(300);
      await shot(p, 'b24-israel-' + lang);
      isr = await p.evaluate(bands, '#screen-israel .dust-band');
      assert.deepEqual(isr.map((b) => [b.days, b.key]), [
        [['13', '13', '0', '0', '0', '…', '…'], KEY[lang]],     // Haifa: Fri, Sat, Sun all 0
        [['15', '12', '0', '0', '0', '…', '…'], KEY[lang]],     // Tel Aviv
        [['24', '17', '4', '337', '81', '…', '…'], KEY[lang]]   // Beer Sheva: a real khamsin on Sat
      ], lang + ' israel');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel: nothing cut or outside');
      assert.deepEqual((await p.evaluate(legibility, '#screen-israel .dust-band *')).bad, [], lang + ' israel: legible');
      }
      for (const [where, fresh, ld, fl] of [['main', m, loading.main, failed.main], ['israel', isr, loading.israel, failed.israel]]) {
        fresh.forEach((b, i) => {
          const at = lang + ' ' + where + ' ' + i;
          assert.equal(b.keyLines, 1, at + ': the key on one line');
          assert.ok(Math.round(b.keyBox.b - b.keyBox.t) <= 26 && b.keyBox.t >= b.head.t - 0.5 && b.keyBox.b <= b.head.b + 0.5, at + ': inside the head line');
          assert.ok(b.keyBox.l >= b.card.l && b.keyBox.r <= b.card.r, at + ': inside the card');
          // the label at the start, the key at the end, at least 16 px apart (the owner's minimum between neighbours)
          const gap = b.rtl ? b.labelBox.l - b.keyBox.r : b.keyBox.l - b.labelBox.r;
          assert.ok(gap >= 16, at + ': ' + gap.toFixed(1) + ' px between the label and the key');
          // ... and the key ends where the line ends (right in ltr, left in rtl: the band's other end, not beside the label)
          assert.ok(Math.abs(b.rtl ? b.keyBox.l - b.head.l : b.head.r - b.keyBox.r) <= 0.5, at + ': the key at the line\'s end');
        });
        assert.deepEqual(fl.map((b) => [b.days.every((d) => d === '—'), b.key]), fresh.map(() => [true, null]), lang + ' ' + where + ': air failed — «—», never «нет прогноза»');
        assert.deepEqual(ld.map((b) => [b.days.every((d) => d === ''), b.key]), fresh.map(() => [true, null]), lang + ' ' + where + ': no air yet — empty slots, no key');
        assert.deepEqual(geometry(fresh), geometry(ld), lang + ' ' + where + ': the answer moves nothing against no air yet');
        assert.deepEqual(geometry(fresh), geometry(fl), lang + ' ' + where + ': nor against the air failed');
      }
      assert.deepEqual(app.errors.filter((e) => !(mainOnly && /reading 'url'/.test(e))), [], lang + ': no error (en: only the known news one)');
    } finally { await app.close(); }
  });
}
