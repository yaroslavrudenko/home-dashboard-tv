// Batch 10 (B) at the TV's 1920×1080 in headless Chrome. The owner approved a red line «Тревога в Реховоте» on every
// other screen while an alert at home is up: «Тревога в Реховоте · с HH:MM» / «אזעקה ברחובות · מ־HH:MM» /
// «Тривога в Реховоті · з HH:MM». Not on the Alerts screen (it is the alert), never for the preview, gone when the alert
// clears, right to left in Hebrew.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, BLUE = 406;
const QUIET_BODY = '﻿\r\n';
const HOME = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות' });
const screenOn = (p) => p.evaluate(() => document.querySelector('.screen.is-active').id);
// The line as drawn: shown (display), its text, its box, and the dot's side of the text.
const banner = (p) => p.evaluate(() => {
  const b = document.getElementById('banner'), pill = b.querySelector('.banner-pill'), shown = getComputedStyle(b).display !== 'none';
  if (!shown) return { shown, cls: b.className };
  const r = pill.getBoundingClientRect(), dot = b.querySelector('.banner-dot').getBoundingClientRect(), text = b.querySelector('.banner-text');
  return { shown, text: text.textContent, box: [r.left, r.top, r.right, r.bottom].map(Math.round), dotAfterText: dot.left > text.getBoundingClientRect().left,
    cut: text.scrollWidth > text.clientWidth + 1, onTop: pill.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)) };
});
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
function feed() { const f = { body: '' }; f.answer = () => ({ status: 200, body: f.body || QUIET_BODY }); return f; }
const FAST = (c) => { c.alerts.pollMs = 100; c.rotation.intervalMs = 400; c.rotation.pauseAfterKeyMs = 60000; };

// The alert starts (the Alerts screen opens: no line there), then ◀ leaves it for the map screen: the line is on.
async function alertThenLeave(lang, configure = FAST) {
  const f = feed();
  const app = await openApp({ lang, news: 'ok', history: 'history.json', alerts: f.answer, configure });
  const p = app.page;
  try {
    await ready(app);
    assert.deepEqual(await banner(p), { shown: false, cls: 'banner' }, 'no alert: no line');
    f.body = HOME;
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-alerts', { timeout: 3000, polling: 50 });
    await wait(300);
    assert.equal((await banner(p)).shown, false, 'the Alerts screen is the alert itself: no line on it');
    await press(p, LEFT);
    await wait(500);
    assert.equal(await screenOn(p), 'screen-map');
  } catch (e) { await app.close(); throw e; }
  return { app, f, p };
}

test('B10 (B): a home alert, the viewer on another screen — «Тревога в Реховоте · с 20:32» at the top, inside the glass, on top; on the Alerts screen none', async () => {
  const { app, p } = await alertThenLeave('ru');
  try {
    const b = await banner(p);
    assert.equal(b.text, 'Тревога в Реховоте · с 20:32');
    assert.ok(b.box[1] >= 8 && b.box[3] <= 46 && b.box[0] > 0 && b.box[2] < 1920, 'in the top margin: ' + b.box);
    assert.ok(Math.abs((b.box[0] + b.box[2]) / 2 - 960) <= 1, 'centred: ' + b.box);
    assert.deepEqual([b.cut, b.onTop, b.dotAfterText], [false, true, false]);
    await press(p, LEFT);                         // the traffic screen, then the news: the line goes along
    await wait(300);
    assert.equal((await banner(p)).text, 'Тревога в Реховоте · с 20:32');
    assert.deepEqual((await p.evaluate(measure, '#banner *')).filter((x) => x.cut || x.l < 0 || x.t < 0 || x.r > 1920 || x.b > 1080), []);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B10 (B): the line in Hebrew (right to left: the dot after the words, at the right) and in Ukrainian', async () => {
  const he = await alertThenLeave('he');
  try {
    const b = await banner(he.p);
    assert.equal(b.text, 'אזעקה ברחובות · מ־20:32');
    assert.equal(b.dotAfterText, true, 'right to left: the dot leads on the right');
    assert.equal(await he.p.evaluate(() => getComputedStyle(document.querySelector('.banner-text')).direction), 'rtl');
  } finally { await he.app.close(); }
  const uk = await alertThenLeave('uk');
  try { assert.equal((await banner(uk.p)).text, 'Тривога в Реховоті · від 20:32'); } finally { await uk.app.close(); }
});

test('B10 (B): the alert clears — the line is gone', async () => {
  // a short hold and grace (the configure function runs in the page: written out), so the alert clears in well under a second once the feed no longer lists the place
  const { app, f, p } = await alertThenLeave('ru', (c) => { c.alerts.pollMs = 100; c.rotation.intervalMs = 400; c.rotation.pauseAfterKeyMs = 60000; c.alerts.graceMs = 300; c.alerts.defaultHoldMs = 300; });
  try {
    assert.equal((await banner(p)).shown, true);
    f.body = '';
    await p.evaluate(() => { window.__offsetMs += 11 * 60000; });   // past the instruction's 10 minutes
    await p.waitForFunction(() => getComputedStyle(document.getElementById('banner')).display === 'none', { timeout: 5000, polling: 50 });
    assert.equal(await screenOn(p), 'screen-map');
  } finally { await app.close(); }
});

test('B10 (B): the preview (blue key) never shows the line; a language switch rewrites it at once', async () => {
  const f = feed();
  const app = await openApp({ news: 'ok', history: 'history.json', alerts: f.answer, configure: FAST });
  try {
    await ready(app);
    const p = app.page;
    await press(p, BLUE);
    await p.waitForSelector('#alert.is-on .alert-preview', { timeout: 2000 });
    await wait(300);
    assert.equal((await banner(p)).shown, false, 'the preview: no line');
    await press(p, BLUE);                          // any key ends the preview
    await press(p, LEFT);
    await wait(300);
    assert.equal((await banner(p)).shown, false, 'after the preview, on another screen: still none');
    f.body = HOME;
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-alerts', { timeout: 3000, polling: 50 });
    await press(p, LEFT);
    await wait(300);
    assert.equal((await banner(p)).text, 'Тревога в Реховоте · с 20:32');
    await press(p, 40);                           // ▼: the next language
    await wait(100);
    assert.equal((await banner(p)).text, 'אזעקה ברחובות · מ־20:32');
  } finally { await app.close(); }
});
