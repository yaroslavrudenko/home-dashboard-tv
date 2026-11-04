// Batch 14 (the owner, 2026-11-02: «делай хранение погоды»). On 2026-11-02 at 17:14 Open-Meteo answered 503 «The service is
// overloaded» right after an install had restarted the app, and the TV showed «Погода временно недоступна». A real restart
// here: the first run gets the recorded answers and keeps them (localStorage, written by the app itself), then the page
// reloads 20 minutes later while Open-Meteo (weather and air) answers 503 — the main card and the Israel cards show the kept
// weather with the stale line «Не обновляется · данные от …». Without storage (a TV that refuses it): today's empty card.
// B17-V1: the empty card is the one state block «Временно недоступно» (the old «Погода временно недоступна» is gone).
// B14_SHOTS=<dir> also writes keep-main-ru.png and keep-israel-ru.png (the 503-with-restored state).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, weatherAnswer, airAnswer } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
// FAILED: B17-V1's state word (the card's state block); OLD_FAILED: the pre-B17 sentence, never on screen in either case
const FAILED = 'Временно недоступно', OLD_FAILED = 'Погода временно недоступна', STALE = 'Не обновляется · данные от ';
const LATER = 20 * 60000;
// The first answer of each kind is the recording, every later one Open-Meteo's 503 of 2026-11-02.
const overloaded = { status: 503, body: JSON.stringify({ error: true, reason: 'The service is overloaded' }) };
const weather = (n, url) => (n === 1 ? { status: 200, body: weatherAnswer(url) } : overloaded);
const air = (n, url) => (n === 1 ? airAnswer(url) : Object.assign({ contentType: 'application/json' }, overloaded));
// The app's clock moved by sessionStorage 'b14.offset' (it survives the reload, the page's own clock override does not).
const CLOCK = 'try { window.__offsetMs = Number(sessionStorage.getItem("b14.offset")) || 0; } catch (e) {}';
const NO_STORAGE = CLOCK + ' Object.defineProperty(window, "localStorage", { configurable: true, get: function () { throw new Error("denied"); } });';

async function restart(app) {
  const p = app.page;
  await p.waitForFunction(() => /^Обновлено в /.test(document.getElementById('status').textContent), { timeout: 10000 });
  await p.evaluate((ms) => sessionStorage.setItem('b14.offset', String(ms)), LATER);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('#now .now-temp, #now .state'), { timeout: 10000 });   // B17-V1: .state
  await wait(1500);   // the boot request answered 503 and rendered
}
const texts = (p, sel) => p.$$eval(sel, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

test('B14: restarted while Open-Meteo answers 503 — the main card and the Israel cards show the kept weather, stale, dated', async () => {
  const app = await openApp({ lang: 'ru', weather, air, news: 'ok', alerts: 'empty-bom.txt', init: CLOCK, configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForFunction(() => /^Обновлено в /.test(document.getElementById('status').textContent), { timeout: 10000 });
    await wait(500);
    const kept = await p.evaluate(() => ({ weather: localStorage.getItem('weather.v1'), air: localStorage.getItem('air.v1') }));
    assert.ok(kept.weather && kept.air, 'both answers kept after the first run');
    // P5: the size of what is written per good refresh (UTF-16 in localStorage: twice this many bytes at most)
    if (process.env.B14_SIZES) fs.writeFileSync(process.env.B14_SIZES, JSON.stringify({ weather: kept.weather.length, air: kept.air.length }));
    const savedAt = JSON.parse(kept.weather).at;
    await restart(app);
    assert.equal(app.weatherRequests.length, 2, 'the restarted app asked at once: one weather request at boot');
    assert.equal(app.requests.air.length, 2, 'and one air request');
    const main = await p.evaluate(() => ({ status: document.getElementById('status').textContent, temp: (document.querySelector('#now .now-temp') || {}).textContent || null,
      text: document.getElementById('screen-main').textContent, hourly: document.querySelectorAll('#hourly .hour').length }));
    const hhmm = new Date(savedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    // B15 (B14-1) / OWNER-1LEG-C: the title row carries the title only (no legend), so the full line fits in Russian, 24 px clear of the title
    assert.equal(main.status, STALE + hhmm, 'the stale line with the kept time (20 minutes before the restart)');
    const gap = await p.evaluate(() => { const r = (e) => e.getBoundingClientRect(), h = document.querySelector('#hourly .card-head');
      return { legends: h.querySelectorAll('.dust-legend').length, gap: Math.round(r(document.getElementById('status')).left - r(h.querySelector('.card-title')).right) }; });
    assert.equal(gap.legends, 1, 'B22 (owner 2026-11-04, judges\' common decision, city card, fix 1): the one khamsin key on the hourly title row');
    assert.ok(gap.gap >= 24, 'the status ' + gap.gap + ' px from the title');
    assert.ok(main.temp, 'the kept temperature is on the card');
    assert.equal(main.text.indexOf(FAILED), -1, 'no «weather unavailable»');
    assert.equal(main.text.indexOf(OLD_FAILED), -1);
    if (process.env.B14_SHOTS) { fs.mkdirSync(process.env.B14_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B14_SHOTS, 'keep-main-ru.png') }); }
    await press(p, 39); await wait(900);
    const israel = await p.evaluate(() => ({ status: document.getElementById('israel-status').textContent,
      cards: [...document.querySelectorAll('#screen-israel .region')].map((c) => c.className), text: document.getElementById('screen-israel').textContent }));
    assert.equal(israel.status, STALE + hhmm);
    assert.deepEqual(israel.cards, ['card region is-stale', 'card region is-stale', 'card region is-stale'], 'every region drawn, dimmed as stale');
    assert.equal(israel.text.indexOf(FAILED), -1);
    assert.equal((await texts(p, '#screen-israel .region-air')).length, 3, 'the kept air line on every region');
    if (process.env.B14_SHOTS) await p.screenshot({ path: path.join(process.env.B14_SHOTS, 'keep-israel-ru.png') });
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B14 / B17-V1: without storage (a TV that refuses it) the same restart shows today\'s «Временно недоступно» — nothing breaks', async () => {
  const app = await openApp({ lang: 'ru', weather, air, news: 'ok', alerts: 'empty-bom.txt', init: NO_STORAGE, configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await restart(app);
    assert.equal(app.weatherRequests.length, 2);
    const main = await p.evaluate(() => ({ status: document.getElementById('status').textContent, text: document.getElementById('screen-main').textContent,
      temp: document.querySelector('#now .now-temp') }));
    assert.equal(main.status, '', 'no status line: the card says it');
    assert.equal(main.temp, null);
    assert.ok(main.text.indexOf(FAILED) >= 0, 'today\'s behaviour: weather unavailable');
    assert.equal(await p.$eval('#now .state.is-failed .state-text', (e) => e.textContent), FAILED, 'B17-V1: said by the main card\'s state block');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
