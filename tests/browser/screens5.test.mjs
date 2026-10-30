// Batch 5 screens at the TV's 1920×1080 in headless Chrome: the Israel weather screen (FB5-WX) and the traffic map
// (FB5-MAP). The map's tiles are stubs (tests/fixtures/tomtom/tile-*.png): a real tile needs the TomTom key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure, legibility } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, LEFT = 37;
const SCREENS = ['main', 'israel', 'news', 'traffic', 'map'];
const toScreen = async (p, id) => { for (let i = 0; i < SCREENS.indexOf(id); i++) await press(p, RIGHT); };
// configure functions run in the page (their source is sent there): no closure over this file's names.
const KEY = (c) => { c.traffic.key = 'FIXTUREKEY123'; };
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

test('FB5-MAP: without a key the map invites like the traffic screen and requests no tile; five page dots', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', tiles: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await p.$$eval('.dot', (d) => d.length), 5);
    await press(p, LEFT);                          // ◀ from the main screen: the map
    await wait(800);
    assert.deepEqual(await p.$eval('#screen-map', (s) => [s.querySelector('.screen-title').textContent, s.querySelector('.empty-text').textContent]),
      ['Карта пробок', 'Подключите ключ TomTom, чтобы видеть пробки']);
    assert.equal(app.requests.tiles.length, 0);
  } finally { await app.close(); }
});

const FLOW_TILE = '/traffic/map/4/tile/flow/relative0-dark/10/';
const MAP_VIEW = () => {
  const card = document.getElementById('map-card'), home = document.querySelector('.map-home'), cr = card.getBoundingClientRect(), hr = home.getBoundingClientRect();
  const vis = (e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
  return { tiles: [document.querySelectorAll('#map-base .map-tile').length, document.querySelectorAll('#map-flow .map-tile').length],
    flowSrc: [...document.querySelectorAll('#map-flow .map-tile')].map((i) => i.src), flowLoaded: [...document.querySelectorAll('#map-flow .map-tile')].every((i) => i.complete && i.naturalWidth > 0),
    home: [Math.round(hr.left + hr.width / 2 - cr.left - cr.width / 2), Math.round(hr.top + hr.height / 2 - cr.top - cr.height / 2)],
    legend: [...document.querySelectorAll('.map-key')].map((k) => k.textContent), status: document.getElementById('map-status').textContent,
    statusCls: document.getElementById('map-status').className, note: document.getElementById('map-note').textContent,
    shown: { home: vis(home), legend: vis(document.querySelector('.map-legend')), flow: vis(document.getElementById('map-flow')) },
    cardBg: getComputedStyle(card).backgroundColor, baseBg: getComputedStyle(document.getElementById('map-base')).backgroundColor };
};

test('FB5-MAP: tiles are requested only while the map is on view: 12 base + 12 flow tiles, a home dot and a legend; nothing while hidden', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', tiles: 'ok', configure: (c) => { c.traffic.key = 'FIXTUREKEY123'; c.map.refreshMs = 1200; } });
  try {
    await ready(app);
    const p = app.page;
    await wait(1500);
    assert.equal(app.requests.tiles.length, 0, 'never on view: not a single tile');
    await press(p, LEFT);
    await p.waitForFunction(() => document.querySelectorAll('#map-flow .map-tile').length > 0, { timeout: 8000, polling: 50 });
    await wait(300);
    const base = app.requests.tiles.filter((r) => r.url.includes('/map/1/tile/basic/night/10/')), flow = app.requests.tiles.filter((r) => r.url.includes(FLOW_TILE));
    assert.deepEqual([base.length, flow.length], [12, 12], 'one 4 × 3 grid of 512-px tiles per layer');
    assert.ok(base.every((r) => /key=FIXTUREKEY123&tileSize=512&language=ru-RU$/.test(r.url)));
    assert.ok(flow.every((r) => /key=FIXTUREKEY123&tileSize=512&refresh=\d+$/.test(r.url)), 'FB5B-M2: no thickness; one stamp per round');
    const v = await p.evaluate(MAP_VIEW);
    assert.deepEqual(v.tiles, [12, 12]);
    assert.deepEqual(v.home, [0, 0], 'Rehovot in the middle');
    assert.deepEqual(v.legend, ['Свободно', 'Затруднено', 'Пробка']);
    assert.match(v.status, /^Обновлено в 20:3\d$/);
    assert.deepEqual(v.shown, { home: true, legend: true, flow: true });
    assert.equal(v.baseBg, 'rgb(14, 20, 36)', 'FB5B-M6: the dark ground is the base layer\'s');
    assert.notEqual(v.cardBg, 'rgb(14, 20, 36)', 'the card keeps its glass');
    await wait(1600);                              // more than one 1.2-s refresh on view
    const flowOnView = app.requests.tiles.filter((r) => r.url.includes('/flow/')).length;
    assert.ok(flowOnView >= 24, 'the overlay refreshed while on view: ' + flowOnView);
    const stamps = new Set(app.requests.tiles.filter((r) => r.url.includes('/flow/')).map((r) => new URL(r.url).searchParams.get('refresh')));
    assert.ok(stamps.size >= 2, 'each round has its own stamp (without it the page reuses the shown image and asks nothing)');
    await press(p, RIGHT);                         // away from the map
    await wait(800);
    const n = app.requests.tiles.length;
    await wait(3000);
    assert.equal(app.requests.tiles.length, n, 'hidden: no tile');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-map .map-legend, #screen-map .map-legend *, #screen-map .screen-head *')), []);
  } finally { await app.close(); }
});

// FB5B-M5 (CE F3): a failed refresh keeps the previous overlay — the same images, loaded — also when only 1 of 12 fails.
test('FB5B-M5: a failed overlay refresh keeps the last tiles (same images, loaded, also when 1 of 12 fails) and says «Карта недоступна · данные от HH:MM»', async () => {
  for (const failing of [12, 1]) {
    let flows = 0;
    const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.traffic.key = 'FIXTUREKEY123'; c.map.refreshMs = 800; },
      tiles: (url) => { if (!url.includes('/flow/')) return null; flows++; return flows > 12 && (failing === 12 || flows % 12 === 5) ? { status: 503, body: '' } : null; } });
    try {
      await ready(app);
      const p = app.page;
      await press(p, LEFT);
      await p.waitForFunction(() => document.querySelectorAll('#map-flow .map-tile').length === 12, { timeout: 8000, polling: 50 });
      await wait(200);
      const first = await p.evaluate(MAP_VIEW);
      await p.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-stale') >= 0, { timeout: 8000, polling: 50 });
      await wait(1000);                            // another failed round or two
      const v = await p.evaluate(MAP_VIEW);
      assert.match(v.status, /^Карта недоступна · данные от 20:3\d$/, failing + ' failing: ' + v.status);
      assert.equal(await p.$eval('#map-status', (e) => getComputedStyle(e).color), 'rgba(255, 214, 150, 0.85)', 'amber');
      assert.deepEqual(v.flowSrc, first.flowSrc, failing + ' failing: the same overlay stays');
      assert.equal(v.flowLoaded, true, 'every kept tile is loaded (naturalWidth > 0)');
      assert.equal(v.note, '', 'no note over a map that is there');
    } finally { await app.close(); }
  }
  const none = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: KEY, tiles: 'fail' });
  try {
    await ready(none);
    await press(none.page, LEFT);
    await none.page.waitForSelector('#map-note.is-on', { timeout: 8000 });
    await wait(300);
    const v = await none.page.evaluate(MAP_VIEW);
    assert.equal(v.note, 'Карта недоступна');
    assert.deepEqual([v.shown.home, v.shown.legend], [false, false], 'FB5B-M6: no dot or legend over the note');
  } finally { await none.close(); }
});

// FB5B-M1: one tile that never answers — on the first load and on a refresh — fails its round at the deadline; the next
// round comes refreshMs later and visits keep working; leaving the screen stops what is in flight.
test('FB5B-M1: a tile that never answers fails the round at the deadline (first load and refresh); the map keeps going; leaving aborts', async () => {
  let flows = 0;
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.traffic.key = 'FIXTUREKEY123'; c.map.refreshMs = 1500; c.map.timeoutMs = 600; c.rotation.enabled = false; },
    tiles: (url) => { if (!url.includes('/flow/')) return null; flows++; return flows === 3 || flows === 12 * 2 + 7 ? { hang: true } : null; } });
  try {
    await ready(app);
    const p = app.page;
    await press(p, LEFT);
    await p.waitForSelector('#map-note.is-on', { timeout: 8000 });
    await p.waitForFunction(() => document.getElementById('map-note').textContent === 'Карта недоступна', { timeout: 4000, polling: 50 });
    assert.equal(await p.evaluate(() => document.querySelectorAll('#map-flow .map-tile').length), 0, 'first load: one hung tile → the round failed at 600 ms');
    await p.waitForFunction(() => document.querySelectorAll('#map-flow .map-tile').length === 12, { timeout: 6000, polling: 50 });
    const ok = await p.evaluate(MAP_VIEW);
    assert.match(ok.status, /^Обновлено в 20:3\d$/, 'the next round, refreshMs later, loaded');
    await p.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-stale') >= 0, { timeout: 6000, polling: 50 });
    assert.deepEqual((await p.evaluate(MAP_VIEW)).flowSrc, ok.flowSrc, 'refresh: a hung tile fails that round, the overlay stays');
    await p.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-fresh') >= 0, { timeout: 6000, polling: 50 });
    assert.ok(flows >= 48, 'it keeps refreshing: ' + flows);
    await press(p, RIGHT);
    const before = app.requests.tiles.length;
    await wait(3000);
    assert.equal(app.requests.tiles.length, before, 'hidden: nothing more');
    await press(p, LEFT);
    await p.waitForFunction(() => document.getElementById('map-status').className.indexOf('is-fresh') >= 0, { timeout: 6000, polling: 50 });
  } finally { await app.close(); }
});
