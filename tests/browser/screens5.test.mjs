// Batch 5 screens at the TV's 1920×1080 in headless Chrome: the Israel weather screen (FB5-WX) and the traffic map —
// since batch 6 Waze's live page (MAP-W1, MAP-W2), a stub here: the suite never reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure, legibility } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, LEFT = 37;
const SCREENS = ['main', 'israel', 'news', 'traffic', 'map'];
const toScreen = async (p, id) => { for (let i = 0; i < SCREENS.indexOf(id); i++) await press(p, RIGHT); };
// configure functions run in the page (their source is sent there): no closure over this file's names.
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);

const REGIONS = () => [...document.querySelectorAll('.region')].map((c) => ({
  cls: c.className, name: c.querySelector('.region-name').textContent, city: c.querySelector('.region-city').textContent,
  temp: c.querySelector('.region-temp') ? c.querySelector('.region-temp').textContent : '', icon: !!c.querySelector('.region-now .icon'),
  sub: c.querySelector('.region-sub') ? c.querySelector('.region-sub').textContent : '',
  days: [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-name').textContent),
  bars: c.querySelectorAll('.range-fill').length, box: (() => { const b = c.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; })() }));

test('FB5-WX: «Погода в Израиле» — Север, Центр, Юг (Haifa, Tel Aviv, Beer Sheva): now and 5 days each, from the ONE weather request', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt' });
  try {
    await ready(app);
    const p = app.page;
    await toScreen(p, 'israel');
    await wait(800);
    // FB5C-OPEN: the ◀ ▶ open refreshes the ONE weather request (boot + open = 2); every one carries the regions
    assert.equal(app.weatherRequests.length, 2, 'no request of its own: the main weather request carries the regions');
    for (const u of app.weatherRequests) assert.equal(new URL(u).searchParams.get('latitude').split(',').length, 6);
    const r = await p.evaluate(REGIONS);
    assert.deepEqual(r.map((c) => [c.cls, c.name, c.city, c.icon, c.days.length, c.bars]), [
      ['card region', 'Север', 'Хайфа', true, 5, 5], ['card region', 'Центр', 'Тель-Авив', true, 5, 5], ['card region', 'Юг', 'Беэр-Шева', true, 5, 5]]);
    assert.deepEqual(r.map((c) => c.temp), ['18°', '21°', '23°']);
    assert.match(r[0].sub, /^Ощущается как 19° · Ветер 14 км\/ч$/);
    assert.equal(r[0].days[0], 'Сегодня');
    assert.deepEqual(r.map((c) => c.box[1]), [r[0].box[1], r[0].box[1], r[0].box[1]], 'one line of cards');
    assert.deepEqual(r.map((c) => c.box[3]), [r[0].box[3], r[0].box[3], r[0].box[3]]);
    const clocks = await p.$$eval('.clock', (els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    assert.deepEqual(r.map((c) => c.box[0] + 0), clocks, 'the clocks\' grid');
    assert.equal(await p.$eval('#israel-status', (e) => e.textContent), 'Обновлено в 20:32');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-israel *')).bad, []);
  } finally { await app.close(); }
});

test('FB5-WX: a failed refresh keeps the last data in every card, dimmed, and the header says it once', async () => {
  const app = await openApp({ weather: 'ok-then-fail', news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    await ready(app);
    const p = app.page;
    await toScreen(p, 'israel');
    await p.evaluate(() => { window.__offsetMs = 16 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForSelector('#israel-status.is-stale', { timeout: 10000 });
    await wait(300);
    const r = await p.evaluate(REGIONS);
    assert.deepEqual(r.map((c) => [c.cls, c.temp !== '', c.days.length]), [['card region is-stale', true, 5], ['card region is-stale', true, 5], ['card region is-stale', true, 5]]);
    assert.match(await p.$eval('#israel-status', (e) => e.textContent), /^Не обновляется · данные от 20:3\d$/);
    assert.equal(await p.$eval('.region.is-stale .region-temp', (e) => getComputedStyle(e).color), 'rgba(255, 255, 255, 0.62)');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), []);
  } finally { await app.close(); }
});

// Batch 6 (owner priority): TomTom has no live traffic for Israel (blank flow tiles, measured 2026-10-30), so the map
// screen is Waze's live map page (embed.waze.com) in the glass card — no key needed. Here the page is a stub: the suite
// never reaches the network.
const MAP_VIEW = () => {
  const f = document.querySelector('#map-card .map-frame'), card = document.getElementById('map-card').getBoundingClientRect();
  const fb = f ? f.getBoundingClientRect() : null;
  return { frames: document.querySelectorAll('#screen-map iframe').length, src: f ? f.src : '', tabindex: f ? f.getAttribute('tabindex') : null,
    pointer: f ? getComputedStyle(f).pointerEvents : '', note: document.getElementById('map-note').className,
    noteText: document.getElementById('map-note').textContent, title: document.querySelector('#screen-map .screen-title').textContent,
    fills: fb ? [fb.left - card.left, fb.top - card.top, card.right - fb.right, card.bottom - fb.bottom].map((d) => Math.round(Math.abs(d))) : null,
    focusInFrame: document.activeElement === f };
};
const WAZE_URL = 'https://embed.waze.com/iframe?zoom=11&lat=31.8928&lon=34.8113&ct=livemap';
const pages = (app) => app.requests.waze.filter((r) => r.url === WAZE_URL).length;

test('MAP-W1: the map is Waze\'s live page — not loaded until the map is first shown, then one frame filling the glass card; no key needed', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', waze: 'stub' });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await p.$$eval('.dot', (d) => d.length), 5);
    assert.deepEqual([(await p.evaluate(MAP_VIEW)).frames, pages(app)], [0, 0], 'never shown: no frame, no request');
    assert.deepEqual((await p.evaluate(MAP_VIEW)).noteText, 'Загружаем карту…');
    await press(p, LEFT);                          // ◀ from the main screen: the map
    await p.waitForFunction(() => document.getElementById('map-note').className === 'map-note', { timeout: 6000, polling: 50 });
    await wait(300);
    const v = await p.evaluate(MAP_VIEW);
    assert.deepEqual([v.frames, v.src, v.tabindex, v.pointer, v.note, v.title], [1, WAZE_URL, '-1', 'none', 'map-note', 'Карта пробок']);
    assert.deepEqual(v.fills, [1, 1, 1, 1], 'the frame fills the card inside its 1-px glass edge');
    assert.equal(pages(app), 1);
    assert.equal(v.focusInFrame, false, 'the remote stays with the app');
    assert.ok(app.requests.waze.every((r) => r.url.startsWith('https://embed.waze.com/')), 'the stub page loads nothing else');
    assert.equal(app.requests.traffic.length, 0, 'no TomTom request without a key, and no map tile ever');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('MAP-W2: a rotation arrival loads it once and never reloads; ◀ ▶ open reloads; hidden it stays loaded and asks nothing; focus pulled into it comes back', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', waze: 'stub', configure: (c) => { c.rotation.intervalMs = 500; c.screens = ['main', 'map']; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForFunction(() => document.querySelectorAll('#screen-map iframe').length === 1, { timeout: 6000, polling: 50 });
    await wait(2200);                              // main → map → main → map … by rotation
    assert.equal(pages(app), 1, 'rotation arrivals: loaded on the first, never again');
    await press(p, RIGHT);                         // ◀ ▶ (two screens: map ↔ main)
    await wait(400);
    const id = await p.evaluate(() => Config.screens[[...document.querySelectorAll('.screen')].findIndex((s) => s.className.indexOf('is-active') >= 0) === 1 ? 1 : 0]);
    if (id !== 'map') { await press(p, RIGHT); await wait(400); }
    assert.equal(pages(app), 2, 'an explicit open reloads the page');
    await press(p, RIGHT); await wait(400);        // away from the map
    const n = app.requests.waze.length;
    await wait(1500);
    assert.equal(app.requests.waze.length, n, 'hidden: no request');
    assert.equal(await p.$$eval('#screen-map iframe', (f) => f.length), 1, 'kept loaded while hidden');
    await p.evaluate(() => { const f = document.querySelector('.map-frame'); f.removeAttribute('tabindex'); f.focus(); window.dispatchEvent(new Event('blur')); });
    await wait(100);
    assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY', 'focus handed back to the app');
  } finally { await app.close(); }
});
