// Batch 9 at the TV's 1920×1080 in headless Chrome. The owner: «В случае тревоги в Реховоте — открывать экран тревог и
// может звуком привлечь внимание»; alerts elsewhere in Israel are only shown (the Alerts screen's list), nearby ones keep
// their quiet line. A home alert's START opens the Alerts screen, which then IS the alert (red, filling the screen), holds
// the rotation (and for afterAlertMs after it clears) and plays the attention sound (once, then every repeatMs, maxPlays
// at most). The preview (blue key) shows the same screen under its banner and plays the sound once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, RIGHT = 39, BLUE = 406;
const QUIET_BODY = '﻿\r\n';
const HOME = (title) => JSON.stringify({ id: '1', cat: '1', title: title || 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות' });
// Every play() of an audio element is counted (and resolves: headless Chrome would refuse autoplay).
const SOUND_SPY = 'window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src.replace(/^.*\\//, "")); return Promise.resolve(); };';
const plays = (p) => p.evaluate(() => window.__plays.slice());
const screenOn = (p) => p.evaluate(() => document.querySelector('.screen.is-active').id);
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const gets = (list) => list.filter((r) => r.method === 'GET').length;
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
// A feed the test switches: '' quiet, otherwise the body to answer.
function feed() { const f = { body: '' }; f.answer = () => ({ status: 200, body: f.body || QUIET_BODY }); return f; }
const FAST = (c) => { c.alerts.pollMs = 100; c.rotation.intervalMs = 400; c.rotation.pauseAfterKeyMs = 400; };

test('B9: a Rehovot alert starting on another screen opens the Alerts screen at once — red, filling the screen; rotation held; sound once, then every repeatMs, maxPlays at most', async () => {
  const f = feed();
  const app = await openApp({ news: 'ok', history: 'history.json', init: SOUND_SPY, alerts: f.answer,
    configure: (c) => { c.alerts.pollMs = 100; c.rotation.intervalMs = 400; c.rotation.pauseAfterKeyMs = 1500; c.alerts.sound.repeatMs = 500; c.alerts.sound.maxPlays = 3; } });
  try {
    await ready(app);
    const p = app.page;
    await press(p, RIGHT); await press(p, RIGHT);
    await wait(100);
    assert.equal(await screenOn(p), 'screen-news');
    const h0 = gets(app.requests.history);
    f.body = HOME();
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-alerts', { timeout: 3000, polling: 50 });
    await p.waitForSelector('#alert.is-on');
    await wait(900);
    const v = await p.evaluate(() => {
      const a = document.getElementById('alert'), r = a.getBoundingClientRect(), s = a.closest('.screen').getBoundingClientRect();
      return { inScreen: a.closest('.screen').id, box: [r.left, r.top, r.width, r.height], screen: [s.left, s.top, s.width, s.height],
        onTop: a.contains(document.elementFromPoint(960, 540)), bg: getComputedStyle(a).backgroundImage,
        text: ['.alert-kind', '.alert-areas', '.alert-since', '.alert-instr'].map((q) => a.querySelector(q).textContent) };
    });
    assert.equal(v.inScreen, 'screen-alerts', 'the alert is the Alerts screen itself (no layer over every screen)');
    assert.deepEqual(v.box, v.screen, 'it fills the screen');
    assert.ok(v.onTop, 'the alert is what the screen shows');
    assert.match(v.bg, /linear-gradient\(rgb\(90, 17, 27\)/, 'deep red');
    assert.deepEqual(v.text, ['Ракетный обстрел', 'Реховот', 'С 20:32', 'Войдите в защищённое помещение и оставайтесь там 10 мин']);
    assert.equal(gets(app.requests.history), h0 + 1, 'the recent alerts refreshed as on an explicit open');
    assert.equal(await screenOn(p), 'screen-alerts', 'still there');
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    await wait(1600);
    assert.deepEqual(await plays(p), ['alert.wav', 'alert.wav', 'alert.wav'], 'once at the start, then every 500 ms, three at most');
    assert.equal(await screenOn(p), 'screen-alerts', 'rotation held: 2.5 s after the last key it would have moved every 400 ms');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B9: an alert nearby — the quiet corner line only: no switch, no sound, no red screen', async () => {
  const app = await openApp({ news: 'ok', alerts: 'nearby.json', init: SOUND_SPY, configure: (c) => { c.alerts.pollMs = 100; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('.nearby');
    await wait(800);
    assert.deepEqual([await screenOn(p), await plays(p), await p.$eval('#alert', (e) => e.className)], ['screen-main', [], 'alert']);
    assert.equal(await p.$eval('#corner', (e) => e.textContent), 'Тревога рядом: Нес-Циона, Ришон-ле-Цион');
  } finally { await app.close(); }
});

test('B9: an alert elsewhere in Israel — nothing on screen but the Alerts screen\'s list: no switch, no sound, no corner line', async () => {
  const app = await openApp({ news: 'ok', history: 'history.json', alerts: 'elsewhere.json', init: SOUND_SPY, configure: (c) => { c.alerts.pollMs = 100; } });
  try {
    await ready(app);
    const p = app.page;
    await wait(1200);
    assert.ok(gets(app.requests.alerts) >= 5, 'the feed was read');
    assert.deepEqual([await screenOn(p), await plays(p), await p.$eval('#alert', (e) => e.className), await p.$eval('#corner', (e) => e.textContent)],
      ['screen-main', [], 'alert', '']);
  } finally { await app.close(); }
});

test('B9: only the START of a home alert switches: the viewer moves away with ◀ and a new record for the same alert does not pull him back (nor ring again)', async () => {
  const f = feed();
  const app = await openApp({ news: 'ok', history: 'history.json', init: SOUND_SPY, alerts: f.answer, configure: FAST });
  try {
    await ready(app);
    const p = app.page;
    f.body = HOME();
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-alerts', { timeout: 3000, polling: 50 });
    await press(p, LEFT);
    await wait(100);
    assert.equal(await screenOn(p), 'screen-map');
    f.body = HOME('חדירת מחבלים');                // the same alert, another record (new words on the alert)
    await p.waitForFunction(() => document.querySelector('#alert .alert-kind').textContent === 'Проникновение террористов', { timeout: 3000, polling: 50 });
    await wait(500);
    assert.equal(await screenOn(p), 'screen-map', 'no second switch while the same alert is up');
    assert.deepEqual(await plays(p), ['alert.wav'], 'no second start of the sound');
  } finally { await app.close(); }
});

test('B9: the preview opens the Alerts screen under its banner and plays the sound once; a real alert then takes over there (and rings)', async () => {
  let real = false;
  const app = await openApp({ news: 'ok', history: 'history.json', init: SOUND_SPY, configure: (c) => { c.alerts.pollMs = 100; c.alerts.previewMs = 3000; },
    alerts: () => ({ status: 200, body: real ? HOME('חדירת מחבלים') : QUIET_BODY }) });
  try {
    await ready(app);
    const p = app.page;
    await press(p, BLUE);
    await p.waitForSelector('#alert.is-on .alert-preview', { timeout: 2000 });
    await wait(800);
    assert.deepEqual([await screenOn(p), await plays(p)], ['screen-alerts', ['alert.wav']]);
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    await wait(1000);
    assert.equal((await plays(p)).length, 1, 'the preview rings once');
    real = true;
    await p.waitForFunction(() => document.querySelector('#alert .alert-kind').textContent === 'Проникновение террористов', { timeout: 3000, polling: 50 });
    assert.deepEqual([await p.$('.alert-preview'), await screenOn(p), (await plays(p)).length], [null, 'screen-alerts', 2], 'the real alert, on the Alerts screen, rings');
  } finally { await app.close(); }
});

test('B9: the alert clears: no more sound; the rotation stays on the Alerts screen for afterAlertMs, then resumes', async () => {
  const t0 = Date.now();
  let clearedAt = 0;
  const app = await openApp({ news: 'ok', history: 'history.json', init: SOUND_SPY,
    configure: (c) => { c.alerts.pollMs = 100; c.alerts.graceMs = 300; c.alerts.defaultHoldMs = 300; c.rotation.intervalMs = 300; c.rotation.afterAlertMs = 1500;
      c.alerts.sound.repeatMs = 300; c.alerts.sound.maxPlays = 50; },
    alerts: () => { const on = Date.now() - t0 < 3500; if (!on && !clearedAt) clearedAt = Date.now();
      return { status: 200, body: on ? JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן' }) : QUIET_BODY }; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on');
    await p.waitForFunction(() => document.getElementById('alert').className === 'alert', { timeout: 15000, polling: 50 });
    const n = (await plays(p)).length;
    assert.ok(n >= 2, 'it rang while up: ' + n);
    assert.equal(await screenOn(p), 'screen-alerts');
    await wait(1000);
    assert.equal(await screenOn(p), 'screen-alerts', 'held after the alert cleared');
    assert.equal((await plays(p)).length, n, 'silent once cleared');
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-main', { timeout: 3000, polling: 50 });
  } finally { await app.close(); }
});
