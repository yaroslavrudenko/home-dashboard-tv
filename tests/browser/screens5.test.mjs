// Batch 5 screens at the TV's 1920×1080 in headless Chrome: the Israel weather screen (FB5-WX) and the traffic map —
// since batch 7 one Mapbox live-traffic image (MAP-S1..S3), a fixture here: the suite never reaches the network.
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

// Batch 7 (owner, on the TV: the Waze frame opened the TV's browser): the traffic map is ONE Mapbox Static Images
// picture in the live-traffic style, with the routes' token. Here the image is a fixture (a real traffic-night-v2 image
// made smaller): the suite never reaches the network.
const TOKEN = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; };
const MAP_VIEW = () => {
  const card = document.getElementById('map-card').getBoundingClientRect(), img = document.querySelector('#map-card .map-img');
  const ib = img ? img.getBoundingClientRect() : null, home = document.getElementById('map-home').getBoundingClientRect();
  const attr = document.querySelector('.map-attribution');
  return { cls: document.getElementById('map-card').className, src: img ? img.src : '', loaded: !!img && img.naturalWidth > 0,
    fills: ib ? [ib.left - card.left, ib.top - card.top, card.right - ib.right, card.bottom - ib.bottom].map((d) => Math.round(Math.abs(d))) : null,
    card: [document.getElementById('map-card').clientWidth, document.getElementById('map-card').clientHeight], home: [home.left + home.width / 2 - card.left - 1, home.top + home.height / 2 - card.top - 1],   // from the padding box (1-px edge)
    attribution: attr.textContent, attrBox: (() => { const r = attr.getBoundingClientRect(); return [r.right <= card.right, r.bottom <= card.bottom, getComputedStyle(attr).visibility]; })(),
    note: document.getElementById('map-note').textContent, status: document.getElementById('map-status').textContent,
    title: document.querySelector('#screen-map .screen-title').textContent };
};

test('MAP-S1: the map is one Mapbox live-traffic image filling the card — not asked for until the map is shown; the dot on Rehovot; the attribution', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', map: 'ok', configure: TOKEN });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await p.$$eval('.dot', (d) => d.length), 5);
    assert.equal(app.requests.map.length, 0, 'never shown: no image asked for');
    await press(p, LEFT);                          // ◀ from the main screen: the map
    await p.waitForFunction(() => { const i = document.querySelector('.map-img'); return i && i.naturalWidth > 0; }, { timeout: 8000, polling: 50 });
    await wait(800);
    const v = await p.evaluate(MAP_VIEW);
    assert.equal(app.requests.map.length, 1);
    const u = new URL(app.requests.map[0].url), w = Math.round(v.card[0] / 2), h = Math.round(v.card[1] / 2);
    assert.equal(u.origin + u.pathname, 'https://api.mapbox.com/styles/v1/mapbox/traffic-night-v2/static/34.94,31.93,9.6,0/' + w + 'x' + h + '@2x');
    assert.deepEqual([u.searchParams.get('access_token'), u.searchParams.get('attribution'), u.searchParams.get('logo')], ['pk.FIXTURE123', 'false', 'false']);
    assert.match(u.searchParams.get('refresh'), /^\d+$/);
    assert.deepEqual([v.cls, v.loaded, v.title, v.note], ['card map-card', true, 'Карта пробок', '']);
    assert.deepEqual(v.fills, [1, 1, 1, 1], 'the image fills the card inside its 1-px glass edge');
    assert.equal(v.attribution, '© Mapbox © OpenStreetMap');
    assert.deepEqual(v.attrBox, [true, true, 'visible'], 'in the card corner');
    // Rehovot by Web Mercator: (34.8113 − 34.94) / 360 · 512 · 2^9.6 points left of the centre, the image @2x of the card
    const dx = (34.8113 - 34.94) / 360 * 512 * Math.pow(2, 9.6) * (v.card[0] / w);
    assert.ok(Math.abs(v.home[0] - (v.card[0] / 2 + dx)) < 2, 'the dot on Rehovot: ' + v.home + ' / ' + (v.card[0] / 2 + dx));
    assert.match(v.status, /^Обновлено в 20:3\d$/);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-map *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-map *')).bad, []);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('MAP-S2: every 5 min while on view (here 800 ms); a failed image keeps the last one and says «Карта недоступна · данные от HH:MM»; hidden asks nothing', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; c.map.refreshMs = 800; },
    map: (n) => (n === 1 ? null : { status: 503, body: '' }) });
  try {
    await ready(app);
    const p = app.page;
    await press(p, LEFT);
    await p.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-stale') >= 0, { timeout: 8000, polling: 50 });
    const v = await p.evaluate(MAP_VIEW);
    assert.ok(app.requests.map.length >= 2, 'refreshed while on view');
    assert.deepEqual([v.loaded, v.cls], [true, 'card map-card'], 'the last image stays');
    assert.match(v.status, /^Карта недоступна · данные от 20:3\d$/);
    assert.equal(new Set(app.requests.map.map((r) => new URL(r.url).searchParams.get('refresh'))).size, app.requests.map.length, 'a new stamp per image');
    await press(p, RIGHT); await wait(300);        // away from the map
    const n = app.requests.map.length;
    await wait(2500);
    assert.equal(app.requests.map.length, n, 'hidden: nothing');
  } finally { await app.close(); }
});

test('MAP-S3: without a token the map invites like the traffic screen and asks for nothing; the header in Hebrew and Ukrainian', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', map: 'ok' });
  try {
    await ready(app);
    await press(app.page, LEFT); await wait(800);
    assert.deepEqual(await app.page.$eval('#screen-map', (s) => [s.querySelector('.screen-title').textContent, s.querySelector('.empty-text').textContent]),
      ['Карта пробок', 'Подключите токен Mapbox, чтобы видеть пробки']);
    assert.equal(app.requests.map.length, 0);
  } finally { await app.close(); }
  for (const [lang, title, stale] of [['he', 'מפת תנועה', /^המפה אינה זמינה · נתונים מ־20:3\d$/], ['uk', 'Карта заторів', /^Карта недоступна · дані від 20:3\d$/]]) {
    const l = await openApp({ lang, news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; c.map.refreshMs = 800; }, map: (n) => (n === 1 ? null : { status: 503, body: '' }) });
    try {
      await ready(l);
      await press(l.page, LEFT);
      await l.page.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-stale') >= 0, { timeout: 8000, polling: 50 });
      const v = await l.page.evaluate(MAP_VIEW);
      assert.equal(v.title, title, lang);
      assert.match(v.status, stale, lang);
      assert.equal(v.attribution, '© Mapbox © OpenStreetMap', lang);
      assert.deepEqual(clean(await l.page.evaluate(measure, '#screen-map *')), [], lang);
    } finally { await l.close(); }
  }
});
