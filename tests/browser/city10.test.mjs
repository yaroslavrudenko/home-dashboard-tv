// Batch 10 (C) at the TV's 1920×1080 in headless Chrome: the home-city picker. OK opens it on the current city; ▲ ▼ move
// one row, ◀ ▶ jump by letter; Back (or 30 s without a key) closes it unchanged; OK on another city saves it and reloads
// the app once — then the weather card, the traffic routes and the toast name the new city. A real alert closes the
// sheet; the sheet never opens over an alert. Hebrew right to left. No request ever reaches Mapbox (answered here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const OK = 13, BACK = 10009, LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40;
const QUIET_BODY = '﻿\r\n';
const HOME = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות' });
// Every Directions GET answered with one plausible route (any city's destinations), never the real Mapbox.
const ANY_ROUTE = () => ({ status: 200, body: JSON.stringify({ code: 'Ok', routes: [{ duration: 1860, duration_typical: 1500, distance: 31000 }], waypoints: [] }) });
const TOKEN = (c) => { c.traffic.token = 'pk.test-token'; c.rotation.intervalMs = 400; c.rotation.pauseAfterKeyMs = 60000; c.alerts.pollMs = 100; };
const sheet = (p) => p.evaluate(() => {
  const el = document.getElementById('city'), f = el.querySelector('.city-row.is-focus');
  return { open: el.className === 'city is-on', focus: f ? f.querySelector('.city-name').textContent : null,
    current: [...el.querySelectorAll('.city-row.is-current .city-name')].map((e) => e.textContent), stored: localStorage.getItem('homedash.city') };
});
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }

test('C/T12: OK opens the picker on the current city (✓); ▲ ▼ move a row; ◀ ▶ jump to the first city of the next / previous letter; Back closes, nothing saved', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: TOKEN, traffic: ANY_ROUTE });
  try {
    await ready(app);
    const p = app.page;
    const screen0 = await p.evaluate(() => document.querySelector('.screen.is-active').id);
    assert.equal(await press(p, OK), true);
    await wait(300);
    assert.deepEqual(await sheet(p), { open: true, focus: 'Реховот', current: ['Реховот'], stored: null });
    await press(p, DOWN);
    assert.equal((await sheet(p)).focus, 'Ришон-ле-Цион');
    await press(p, UP); await press(p, UP);
    assert.equal((await sheet(p)).focus, 'Рахат');
    await press(p, RIGHT);
    assert.equal((await sheet(p)).focus, 'Сахнин', '▶: the first city of С');
    assert.equal(await p.evaluate(() => document.querySelector('.city-badge').className + ' ' + document.querySelector('.city-badge').textContent), 'city-badge is-on С');
    await press(p, LEFT);
    assert.equal((await sheet(p)).focus, 'Раанана', '◀: the first city of Р');
    await press(p, LEFT); await press(p, LEFT);
    assert.equal((await sheet(p)).focus, 'Ор-Акива', '◀ ◀: the first of О (the collator ignores the hyphen)');
    await wait(1200);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), screen0, 'the rotation waits while the sheet is open');
    await press(p, BACK);
    await wait(300);
    assert.deepEqual(await sheet(p), { open: false, focus: 'Ор-Акива', current: ['Реховот'], stored: null }, 'Back: closed, nothing saved (the app did not exit)');
    await press(p, OK);
    await wait(100);
    assert.equal((await sheet(p)).focus, 'Реховот', 'opens on the current city again');
    await press(p, OK);
    await wait(300);
    assert.deepEqual(await sheet(p), { open: false, focus: 'Реховот', current: ['Реховот'], stored: null }, 'OK on the current city: closed, no write, no reload');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('C/T12: OK on Haifa saves it and reloads once — the toast «Город: Хайфа», the weather card, the traffic routes from Haifa, the map on Haifa', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: TOKEN, traffic: ANY_ROUTE, map: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    const derive = await p.evaluate(() => { const t = performance.now(); for (let i = 0; i < 100; i++) HomeCity.derive(Cities, 'haifa'); return (performance.now() - t) / 100; });
    console.log('# HomeCity.derive(haifa): ' + derive.toFixed(3) + ' ms per call (desktop Chrome, mean of 100)');
    assert.ok(derive < 5, 'derive is cheap: ' + derive);
    await press(p, OK);
    await wait(200);
    // walk to Хайфа: ▶ by letter to Х (Хадера first), then ▼
    for (let i = 0; i < 8 && !(await sheet(p)).focus.startsWith('Х'); i++) await press(p, RIGHT);
    for (let i = 0; i < 3 && (await sheet(p)).focus !== 'Хайфа'; i++) await press(p, DOWN);
    assert.equal((await sheet(p)).focus, 'Хайфа');
    const nav = p.waitForNavigation({ waitUntil: 'load' });
    await press(p, OK);
    await nav;
    await ready(app);
    await p.waitForFunction(() => document.getElementById('toast').className === 'toast is-on', { timeout: 3000, polling: 50 });
    const v = await p.evaluate(() => ({ toast: document.getElementById('toast').textContent, place: document.querySelector('.now-place').textContent,
      stored: localStorage.getItem('homedash.city'), flag: sessionStorage.getItem('homedash.cityToast'), home: Config.home.id,
      routes: Config.traffic.routes.map((r) => r.id), from: Config.traffic.routes[0].from, map: Config.map.home, areas: Config.alerts.areas.map((a) => a.he) }));
    assert.deepEqual(v, { toast: 'Город: Хайфа', place: 'Хайфа', stored: 'haifa', flag: null, home: 'haifa',
      routes: ['tlv', 'jlm', 'beersheva', 'ashkelon', 'netanya', 'tiratcarmel', 'nesher', 'kiryatyam', 'kiryatmotzkin', 'kiryatbialik'],
      from: [32.8185, 34.9988], map: [32.8185, 34.9988], areas: ['חיפה'] });
    const lat = new URL(app.weatherRequests[app.weatherRequests.length - 1]).searchParams.get('latitude').split(',');
    assert.equal(lat[0], '32.8185', 'the weather request asks for Haifa first');
    for (let i = 0; i < 3; i++) await press(p, RIGHT);   // main → israel → news → traffic
    await p.waitForSelector('.tw-name', { timeout: 5000 });
    await wait(300);
    const names = await p.evaluate(() => [...document.querySelectorAll('.tw-name')].map((e) => e.textContent));
    assert.deepEqual(names, ['Тель-Авив', 'Иерусалим', 'Беэр-Шева', 'Ашкелон', 'Нетания', 'Тират-Кармель', 'Нешер', 'Кирьят-Ям', 'Кирьят-Моцкин', 'Кирьят-Бялик']);
    assert.ok(app.requests.traffic.every((r) => decodeURIComponent(new URL(r.url).pathname).includes('34.9988,32.8185;')), 'every route from Haifa');
    await press(p, OK);
    await wait(200);
    assert.deepEqual((await sheet(p)).current, ['Хайфа'], 'the ✓ moved');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('C/T13: Hebrew — the picker right to left: names at the right, the ✓ at the left, the English name as the second line', async () => {
  const app = await openApp({ lang: 'he', news: 'ok', alerts: 'empty-bom.txt' });
  try {
    await ready(app);
    const p = app.page;
    await press(p, OK);
    await wait(400);
    const v = await p.evaluate(() => {
      const row = document.querySelector('.city-row.is-current'), r = row.getBoundingClientRect();
      const name = row.querySelector('.city-name').getBoundingClientRect(), check = row.querySelector('.city-check').getBoundingClientRect();
      return { title: document.querySelector('.city-title').textContent, name: row.querySelector('.city-name').textContent, alt: row.querySelector('.city-alt').textContent,
        nameAtRight: r.right - name.right < 40, checkAtLeft: check.left - r.left < 48, hint: document.querySelector('.city-hint').textContent };
    });
    assert.deepEqual(v, { title: 'עיר', name: 'רחובות', alt: 'Rehovot', nameAtRight: true, checkAtLeft: true, hint: '▲▼ בחירה · ◀▶ לפי אות · OK — סיום · חזרה — ביטול' });
  } finally { await app.close(); }
});

test('C/T14: layout — the sheet inside the glass; every one of the 83 rows one height, its names whole (scrolled through, ru and uk)', async () => {
  for (const lang of ['ru', 'uk']) {
    const app = await openApp({ lang, news: 'ok', alerts: 'empty-bom.txt' });
    try {
      await ready(app);
      const p = app.page;
      await press(p, OK);
      await wait(400);
      const v = await p.evaluate(() => {
        const s = document.querySelector('.city-sheet').getBoundingClientRect(), rows = [...document.querySelectorAll('.city-row')];
        return { sheet: [s.left, s.top, s.right, s.bottom], rows: rows.length, heights: [...new Set(rows.map((r) => r.getBoundingClientRect().height))],
          over: rows.filter((r) => r.scrollWidth > r.clientWidth + 1 || r.querySelector('.city-name').getClientRects().length !== 1).map((r) => r.textContent) };
      });
      assert.ok(v.sheet[0] >= 0 && v.sheet[1] >= 0 && v.sheet[2] <= 1920 && v.sheet[3] <= 1080, lang + ' sheet ' + v.sheet);
      assert.deepEqual([v.rows, v.heights, v.over], [83, [72], []], lang);
      assert.deepEqual((await p.evaluate(measure, '.city-sheet *')).filter((b) => b.cut && b.cls !== 'city-list' && !/city-row/.test(b.cls)), [], lang + ' nothing cut');
      // the focused row stays inside the window wherever it is
      for (let i = 0; i < 90; i++) await press(p, DOWN);
      const last = await p.evaluate(() => { const w = document.querySelector('.city-window').getBoundingClientRect(), f = document.querySelector('.city-row.is-focus').getBoundingClientRect(); return [f.top >= w.top - 0.5, f.bottom <= w.bottom + 0.5]; });
      assert.deepEqual(last, [true, true], lang + ' the last row in the window');
    } finally { await app.close(); }
  }
});

test('C/T15: a real alert closes the sheet at once (nothing saved); OK never opens it over an alert; 30 s without a key closes it', async () => {
  let body = '';
  const fastIdle = 'const st = window.setTimeout; window.setTimeout = function (f, ms) { return st(f, ms === 30000 ? 400 : ms); };';
  const app = await openApp({ news: 'ok', history: 'history.json', init: fastIdle, alerts: () => ({ status: 200, body: body || QUIET_BODY }), configure: TOKEN, traffic: ANY_ROUTE });
  try {
    await ready(app);
    const p = app.page;
    await press(p, OK);
    await wait(100);
    assert.equal((await sheet(p)).open, true);
    await wait(700);
    assert.equal((await sheet(p)).open, false, 'idle: closed');
    await press(p, OK);
    await press(p, DOWN);
    body = HOME;
    await p.waitForSelector('#alert.is-on', { timeout: 3000 });
    assert.deepEqual(await sheet(p), { open: false, focus: 'Ришон-ле-Цион', current: ['Реховот'], stored: null });
    await press(p, OK);
    await wait(200);
    assert.equal((await sheet(p)).open, false, 'not over an alert');
  } finally { await app.close(); }
});

test('C/T12: a TV that refuses to save the city says so on the sheet and does not reload', async () => {
  const refuse = 'Storage.prototype.setItem = function (k) { if (k === "homedash.city") throw new Error("QuotaExceededError"); };';
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', init: refuse });
  try {
    await ready(app);
    const p = app.page;
    await p.evaluate(() => { window.__same = 1; });
    await press(p, OK);
    await press(p, DOWN);
    await press(p, OK);
    await wait(300);
    const v = await p.evaluate(() => [window.__same, document.querySelector('.city-msg').className, document.querySelector('.city-msg').textContent, document.getElementById('city').className]);
    assert.deepEqual(v, [1, 'city-msg is-on', 'Не удалось сохранить город', 'city is-on']);
  } finally { await app.close(); }
});
