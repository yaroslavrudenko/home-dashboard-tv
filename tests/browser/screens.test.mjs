// Batch 2 at the TV's 1920×1080 in headless Chrome: switching screens with the remote, page dots, rotation and its
// pause, hidden screens costing nothing, the News and Traffic screens on recorded shapes, and the Israel alert over
// everything (stays until clear + grace, never dismissed by the remote, a failed feed never reads as "all clear").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, measure, legibility } from './page.mjs';

const orefFixture = (name) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'oref', name));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, RIGHT = 39, ENTER = 13, BACK = 10009;
const KEY = (c) => { c.traffic.key = 'FIXTUREKEY123'; };
const QUIET = { news: 'ok', alerts: 'empty-bom.txt' };
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
const active = (p) => p.evaluate(() => [...document.querySelectorAll('.screen')].map((s) => [s.id, s.className, getComputedStyle(s).visibility]));
const dots = (p) => p.$$eval('.dot', (d) => d.map((e) => e.className));
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);

test('◀ ▶ switch screens with page dots; the hidden screens keep their DOM and are not painted', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    assert.deepEqual(await dots(p), ['dot is-on', 'dot', 'dot']);
    assert.equal(await p.$('.lead'), null, 'a screen never shown is not even drawn');
    assert.equal(await press(p, RIGHT), true, 'the arrow is consumed');
    await wait(800);
    const lead = await p.$('.lead');
    assert.deepEqual(await active(p), [['screen-main', 'screen', 'hidden'], ['screen-news', 'screen is-active', 'visible'], ['screen-traffic', 'screen', 'hidden']]);
    assert.deepEqual(await dots(p), ['dot', 'dot is-on', 'dot']);
    await press(p, RIGHT); await wait(800);
    assert.deepEqual(await dots(p), ['dot', 'dot', 'dot is-on']);
    await press(p, RIGHT); await wait(800);
    assert.deepEqual(await dots(p), ['dot is-on', 'dot', 'dot'], 'wraps to the first screen');
    await press(p, LEFT); await press(p, LEFT); await wait(800);
    assert.deepEqual(await dots(p), ['dot', 'dot is-on', 'dot']);
    assert.equal(await lead.evaluate((e) => e.isConnected), true, 'the news DOM survived three switches (no rebuild on switch)');
    const rest = await p.$$eval('.screen', (s) => s.map((e) => getComputedStyle(e).transform));
    assert.deepEqual(rest, ['none', 'none', 'none'], 'every screen at rest in place after the slide');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// D1 / D2: a staggered cross-fade (out 0.3 s, in from 0.2 s for 0.45 s) never shows both screens at half strength;
// the page dots are 12 px and quiet but visible.
test('D1: the switch never shows two screens at half strength and settles within 700 ms; D2: 12 px page dots', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    const frames = await p.evaluate(() => new Promise((resolve) => {
      const main = document.getElementById('screen-main'), news = document.getElementById('screen-news'), out = [], t0 = performance.now();
      const e = new Event('keydown'); Object.defineProperty(e, 'keyCode', { value: 39 }); document.dispatchEvent(e);
      (function frame() {
        const t = performance.now() - t0;
        out.push([Math.round(t), +getComputedStyle(main).opacity, +getComputedStyle(news).opacity, getComputedStyle(news).visibility]);
        if (t < 900) requestAnimationFrame(frame); else resolve(out);
      })();
    }));
    const both = frames.map((f) => Math.min(f[1], f[2]));
    assert.ok(Math.max(...both) < 0.3, 'never both strong: max min-opacity ' + Math.max(...both).toFixed(2) + ' ' + JSON.stringify(frames.filter((f) => Math.min(f[1], f[2]) > 0.2)));
    const settled = frames.find((f) => f[1] === 0 && f[2] === 1);
    assert.ok(settled && settled[0] <= 700, 'settled by ' + (settled && settled[0]) + ' ms');
    assert.ok(frames.filter((f) => f[0] < 150).every((f) => f[3] === 'hidden'), 'the new screen becomes visible only when its fade starts');
    const d = await p.$$eval('.dot', (els) => els.map((e) => { const cs = getComputedStyle(e); return [cs.width, cs.height, cs.borderRadius, cs.backgroundColor]; }));
    assert.deepEqual(d[0], ['12px', '12px', '6px', 'rgba(255, 255, 255, 0.36)']);
    assert.deepEqual(d[1].slice(3), ['rgba(255, 255, 255, 0.92)']);
  } finally { await app.close(); }
});

test('rotation moves on by itself, pauses after a key press, and the pause ends', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.rotation.intervalMs = 1000; c.rotation.pauseAfterKeyMs = 2500; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForFunction(() => document.querySelectorAll('.dot')[1].className === 'dot is-on', { timeout: 3000, polling: 50 });
    assert.equal(await press(p, ENTER), false, 'OK is not consumed, it only pauses');
    await wait(1800);
    assert.deepEqual(await dots(p), ['dot', 'dot is-on', 'dot'], 'paused after a key press (would have moved at 1 s)');
    await p.waitForFunction(() => document.querySelectorAll('.dot')[2].className === 'dot is-on', { timeout: 2500, polling: 50 });
  } finally { await app.close(); }
});

test('a hidden screen costs nothing: refreshes while it is hidden never touch its DOM; it is drawn when it comes into view', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.news.refreshMs = 250; } });
  try {
    await ready(app);
    const p = app.page;
    await p.evaluate(() => {
      window.__mut = { news: 0, traffic: 0 };
      for (const id of ['news', 'traffic']) new MutationObserver((l) => { window.__mut[id] += l.length; })
        .observe(document.getElementById('screen-' + id), { childList: true, subtree: true, characterData: true, attributes: true });
    });
    const before = app.requests.news.length;
    await wait(1600);
    assert.ok(app.requests.news.length - before >= 9, 'three feeds per refresh kept refreshing: ' + (app.requests.news.length - before));
    assert.deepEqual(await p.evaluate(() => window.__mut), { news: 0, traffic: 0 }, 'not a single DOM change on the hidden screens');
    await p.evaluate(() => { window.__offsetMs = 3 * 60000; document.dispatchEvent(new Event('visibilitychange')); });   // a minute tick
    assert.deepEqual(await p.evaluate(() => window.__mut), { news: 0, traffic: 0 }, 'the minute tick redraws only the screen on view');
    await press(p, RIGHT);
    assert.equal(await p.$eval('.lead .news-time', (e) => e.textContent), '4 мин назад', 'drawn with current times the moment it shows');
  } finally { await app.close(); }
});

test('News: one parallel round of three feeds; lead + headlines, each story once, newest first, feed HTML never rendered', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    await press(p, RIGHT);
    await p.waitForSelector('.lead');
    await wait(700);
    assert.equal(app.requests.news.length, 3, 'one request per feed');
    assert.deepEqual(app.requests.news.map((r) => new URL(r.url).host).sort(), ['feeds.bbci.co.uk', 'www.newsru.co.il', 'www.pravda.com.ua']);
    const view = await p.evaluate(() => ({
      lead: [document.querySelector('.lead .src-name').textContent, document.querySelector('.lead .news-time').textContent, document.querySelector('.lead-title').textContent],
      items: [...document.querySelectorAll('.news-item')].map((e) => [e.querySelector('.src-name').textContent, e.querySelector('.news-time').textContent, e.querySelector('.news-title').textContent]),
      status: document.getElementById('news-status').textContent, statusCls: document.getElementById('news-status').className,
      injected: document.querySelectorAll('#screen-news script, #screen-news img, #screen-news a, #screen-news p').length }));
    assert.deepEqual(view.lead, ['Украинская правда', '1 мин назад', 'Зеленский провел Ставку: на повестке дня энергетика и оборона неба над Днепром']);
    assert.equal(view.items.length, 6);
    assert.deepEqual(view.items[0], ['NEWSru.co.il', '4 мин назад', 'Ракетная тревога в центре страны: перехваты над Шфелой, пострадавших нет']);
    assert.equal(view.items.filter((i) => /Ракетная тревога/.test(i[2])).length, 1, 'the story both feeds carry appears once');
    assert.equal(view.injected, 0, 'no element from a feed reached the page');
    assert.ok(view.items.every((i) => !/…$/.test(i[2])), 'no headline ellipsised');
    assert.deepEqual([view.status, view.statusCls], ['Обновлено в 20:32', 'status screen-status is-fresh']);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), [], 'nothing cut, outside its card or off screen');
    const leg = await p.evaluate(legibility, '#screen-news *');
    assert.deepEqual(leg.bad, [], 'every text ≥ 24 px and ≥ 4.5:1');
  } finally { await app.close(); }
});

// Fit by count, never by cutting words: very long headlines leave fewer stories on screen, each one whole.
test('News: long headlines are never cut; fewer stories are shown instead', async () => {
  const long = (i) => 'Очень длинный заголовок номер ' + i + ', в котором много слов о событиях дня, о погоде, о дорогах, о ценах на бензин, о выборах в Кнессет и о том, что будет дальше';
  const items = Array.from({ length: 8 }, (_, i) => '<item><title>' + long(i) + '</title><link>https://www.newsru.co.il/x/' + i + '</link><pubDate>Thu, 29 Oct 2026 20:' + String(30 - i).padStart(2, '0') + ':00 +0200</pubDate></item>').join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>' + items + '</channel></rss>';
  const app = await openApp({ news: (url) => (url.includes('newsru') ? { status: 200, body: xml } : { status: 503, body: '' }), alerts: 'empty-bom.txt' });
  try {
    await ready(app);
    const p = app.page;
    await press(p, RIGHT);
    await p.waitForSelector('.news-item');
    await wait(700);
    const r = await p.evaluate(() => {
      const list = document.querySelector('.news-list').getBoundingClientRect();
      return { n: document.querySelectorAll('.news-item').length, rows: [...document.querySelectorAll('.news-row')].map((row) => row.children.length),
        titles: [...document.querySelectorAll('.news-title')].map((t) => t.textContent),
        inside: [...document.querySelectorAll('.news-title')].every((t) => t.getBoundingClientRect().bottom <= list.bottom + 0.5) };
    });
    assert.ok(r.n >= 2 && r.n < 6, 'fewer than six stories: ' + r.n);
    assert.ok(r.rows.every((k) => k === 2), 'whole rows of two are dropped, never half a row: ' + r.rows);
    assert.ok(r.inside, 'every shown headline ends inside the list card');
    for (const t of r.titles) assert.match(t, /что будет дальше$/, 'whole headline: ' + t.slice(0, 40));
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
  } finally { await app.close(); }
});

// B4 / B5: the layout follows the number of stories and the length of the lead; the rows read left to right.
const rssOf = (titles, summary) => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>' + titles.map((t, i) =>
  '<item><title>' + t + '</title><link>https://www.newsru.co.il/x/' + i + '</link>' + (summary ? '<description>' + summary + '</description>' : '') +
  '<pubDate>Thu, 29 Oct 2026 20:' + String(30 - i).padStart(2, '0') + ':00 +0200</pubDate></item>').join('') + '</channel></rss>';
async function newsWith(xml) {
  const app = await openApp({ news: (url) => (url.includes('newsru') ? { status: 200, body: xml } : { status: 503, body: '' }), alerts: 'empty-bom.txt' });
  await ready(app);
  await press(app.page, RIGHT);
  await app.page.waitForSelector('.lead-title');
  await wait(700);
  return app;
}
const newsLayout = (p) => p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, w: r.width }; };
  const lead = document.querySelector('.lead'), title = document.querySelector('.lead-title'), list = document.querySelector('.news-list');
  return { leadCls: lead.className, lead: box(lead), title: box(title), titleSize: getComputedStyle(title).fontSize,
    lines: Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)),
    summary: document.querySelector('.lead-summary') ? getComputedStyle(document.querySelector('.lead-summary')).display : null,
    list: list ? { cls: list.className, box: box(list) } : null,
    rows: [...document.querySelectorAll('.news-row')].map((r) => [...r.children].map((c) => [c.querySelector('.news-title').textContent, Math.round(c.getBoundingClientRect().top), Math.round(c.getBoundingClientRect().width)])) };
});

test('B4: one story — the lead alone, centred in the screen; two stories — the second across the full width', async () => {
  const one = await newsWith(rssOf(['Единственная новость дня: кнессет утвердил бюджет'], 'Коротко о главном.'));
  try {
    const v = await newsLayout(one.page);
    assert.equal(v.list, null, 'no empty headline card');
    assert.match(v.leadCls, /is-alone/);
    assert.ok(v.lead.b > 1000, 'the lead fills the screen: ' + v.lead.b);
    const mid = (v.lead.t + v.lead.b) / 2, titleMid = (v.title.t + v.title.b) / 2;
    assert.ok(Math.abs(titleMid - mid) < 120, 'its words in the middle: ' + titleMid + ' vs ' + mid);
    assert.deepEqual(clean(await one.page.evaluate(measure, '#screen-news *')), []);
  } finally { await one.close(); }
  const two = await newsWith(rssOf(['Первая новость', 'Вторая новость, которая идёт строкой во всю ширину карточки']));
  try {
    const v = await newsLayout(two.page);
    assert.match(v.list.cls, /is-single/);
    assert.equal(v.rows.length, 1);
    assert.ok(v.rows[0][0][2] > v.list.box.w - 100, 'full width: ' + v.rows[0][0][2] + ' of ' + v.list.box.w);
  } finally { await two.close(); }
});

test('B4: a long lead steps down (48 px, then 40 px), hides its summary and is never cut; the rest still fits', async () => {
  const long = 'Правительство Израиля на ночном заседании утвердило пакет мер по поддержке жителей юга и центра страны, включая компенсации малому бизнесу';
  const extreme = long + ', продление льгот по налогам, новые программы переподготовки и помощь семьям резервистов на ближайшие полгода';
  for (const [lead, size, maxLines] of [[long, '48px', 3], [extreme, '40px', 5]]) {
    const app = await newsWith(rssOf([lead, 'Вторая', 'Третья', 'Четвёртая', 'Пятая'], 'Подробности будут позже.'));
    try {
      const v = await newsLayout(app.page);
      assert.match(v.leadCls, size === '40px' ? /is-long is-xlong/ : /is-long$/);
      assert.equal(v.titleSize, size, lead.length + ' characters');
      assert.ok(v.lines <= maxLines, v.lines + ' lines at ' + size);
      assert.equal(v.summary, 'none', 'the summary gives its room to the title');
      assert.ok(v.rows.length >= 1, 'headlines still under it');
      assert.deepEqual(clean(await app.page.evaluate(measure, '#screen-news *')), [], 'nothing cut');
    } finally { await app.close(); }
  }
});

test('B5: headlines in rows of two, read left to right, newest first; the rows share one rule and spread over the card', async () => {
  const app = await newsWith(rssOf(['Лид', 'Один', 'Два', 'Три', 'Четыре', 'Пять', 'Шесть']));
  try {
    const v = await newsLayout(app.page);
    assert.deepEqual(v.rows.map((r) => r.map((c) => c[0])), [['Один', 'Два'], ['Три', 'Четыре'], ['Пять', 'Шесть']]);
    for (const r of v.rows) assert.equal(r[0][1], r[1][1], 'both stories of a row start on one line');
    assert.equal(v.rows[0][0][2], v.rows[0][1][2], 'two equal columns');
    assert.doesNotMatch(v.list.cls, /is-fitting/);
    const gaps = v.rows.slice(1).map((r, i) => r[0][1] - v.rows[i][0][1]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 2, 'rows evenly spread: ' + gaps);
    assert.ok(v.rows[2][0][1] - v.list.box.t > v.list.box.h / 2, 'they use the card, not just its top: ' + JSON.stringify(v.rows.map((r) => r[0][1])));
  } finally { await app.close(); }
});

test('News stale and failed: one feed down names it in the status line; all down shows one calm message with the retry time', async () => {
  const partial = await openApp({ news: (url) => (url.includes('bbc') ? { status: 503, body: '' } : null), alerts: 'empty-bom.txt' });
  try {
    await ready(partial);
    await press(partial.page, RIGHT);
    await partial.page.waitForSelector('.lead');
    await wait(300);
    assert.deepEqual(await partial.page.$eval('#news-status', (e) => [e.className, e.textContent]),
      ['status screen-status is-stale', 'Обновлено в 20:32 · нет связи: Би-би-си']);
  } finally { await partial.close(); }
  const failed = await openApp({ news: 'fail', alerts: 'empty-bom.txt' });
  try {
    await ready(failed);
    await press(failed.page, RIGHT);
    await failed.page.waitForSelector('#screen-news .empty-text');
    await wait(700);
    assert.deepEqual(await failed.page.$eval('#screen-news', (s) => [s.querySelector('.empty-text').textContent, s.querySelector('.empty-sub').textContent, s.querySelector('#news-status').textContent]),
      ['Новости временно недоступны', 'Повторим в 20:33', '']);
    assert.deepEqual(clean(await failed.page.evaluate(measure, '#screen-news *')), []);
  } finally { await failed.close(); }
});

test('Traffic without a key: a calm invitation, and not a single request to TomTom', async () => {
  const app = await openApp({ ...QUIET, traffic: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    await press(p, RIGHT); await press(p, RIGHT);
    await wait(800);
    assert.deepEqual(await p.$eval('#screen-traffic', (s) => [s.querySelector('.screen-title').textContent, s.querySelector('.empty-text').textContent, s.querySelector('.empty-sub').textContent]),
      ['Пробки', 'Подключите ключ TomTom, чтобы видеть пробки', 'TOMTOM_KEY в build.local.env, затем пересоберите приложение']);
    assert.equal(app.requests.traffic.length, 0);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
  } finally { await app.close(); }
});

test('Traffic with a key (recorded shape): one POST for all routes and roads; times, delay chips, "no data" for the failed road', async () => {
  const app = await openApp({ ...QUIET, traffic: 'ok', configure: KEY });
  try {
    await ready(app);
    const p = app.page;
    await press(p, RIGHT); await press(p, RIGHT);
    await p.waitForSelector('.troute-time');
    await wait(700);
    const posts = app.requests.traffic.filter((r) => r.method === 'POST');
    assert.equal(posts.length, 1, 'one batch request');
    assert.equal(JSON.parse(posts[0].body).batchItems.length, 7);
    const v = await p.evaluate(() => ({
      routes: [...document.querySelectorAll('.troute')].map((r) => [r.querySelector('.troute-to').textContent, r.querySelector('.troute-time').textContent, r.querySelector('.chip').className, r.querySelector('.chip').textContent, r.querySelector('.troute-usual').textContent]),
      roads: [...document.querySelectorAll('.troad')].map((r) => [r.querySelector('.troad-name').textContent, (r.querySelector('.troad-level') || r.querySelector('.tnodata')).textContent]),
      status: document.getElementById('traffic-status').textContent }));
    assert.deepEqual(v.routes, [
      ['Тель-Авив, Азриэли', '39 мин', 'chip lv-jam', '+14 мин', 'Без пробок 25 мин'],
      ['Ришон-ле-Цион', '19 мин', 'chip lv-slow', '+3 мин', 'Без пробок 16 мин'],
      ['Иерусалим', '49 мин', 'chip lv-ok', '+2 мин', 'Без пробок 47 мин']]);
    assert.deepEqual(v.roads, [['Аялон', 'Пробка'], ['Шоссе 4', 'Затруднено'], ['Шоссе 1', 'Свободно'], ['Шоссе 6', 'Нет данных']]);
    assert.equal(v.status, 'Обновлено в 20:32');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, []);
  } finally { await app.close(); }
});

const tomtomFixture = () => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'tomtom', 'batch.json'), 'utf8'));
const NO_ROUTE = { statusCode: 400, response: { error: { description: 'Engine error while executing route request: NO_ROUTE_FOUND' } } };
const toTraffic = async (p) => { await press(p, RIGHT); await press(p, RIGHT); };

// C4 (D6, D7, D8, D12): one encoding per screen, no hairline slivers, a failed row keeps its shape, smaller units.
test('C4: road bars share one time scale; no delay sliver under a minute; a failed route keeps «—», «Нет данных» and its track', async () => {
  const b = tomtomFixture();
  b.batchItems[2] = NO_ROUTE;                       // Jerusalem cannot be routed; Route 6 (item 7) neither
  Object.assign(b.batchItems[1].response.routes[0].summary, { travelTimeInSeconds: 1000, noTrafficTravelTimeInSeconds: 960, trafficDelayInSeconds: 40 });
  const app = await openApp({ ...QUIET, configure: KEY, traffic: () => ({ status: 200, body: JSON.stringify(b) }) });
  try {
    await ready(app);
    const p = app.page;
    await toTraffic(p);
    await p.waitForSelector('.troute-time');
    await wait(800);
    const v = await p.evaluate(() => {
      const w = (e) => e ? e.getBoundingClientRect().width : 0;
      const roads = [...document.querySelectorAll('.troad')].map((r) => ({ name: r.querySelector('.troad-name').textContent, track: w(r.querySelector('.tbar')),
        free: w(r.querySelector('.tbar-free')), delay: w(r.querySelector('.tbar-delay')), sub: r.querySelector('.troad-sub').textContent }));
      const jr = document.querySelectorAll('.troute')[2];
      return { roads, jerusalem: { time: jr.querySelector('.troute-time').textContent, timeCls: jr.querySelector('.troute-time').className,
        sub: jr.querySelector('.troute-sub').textContent, bar: !!jr.querySelector('.tbar'), fill: jr.querySelectorAll('.tbar *').length,
        barTop: jr.getBoundingClientRect().bottom - jr.querySelector('.tbar').getBoundingClientRect().bottom,
        okBarTop: document.querySelector('.troute').getBoundingClientRect().bottom - document.querySelector('.troute .tbar').getBoundingClientRect().bottom },
        unit: [getComputedStyle(document.querySelector('.troute-time .unit')).fontSize, document.querySelector('.troute-time').textContent],
        rishon: [document.querySelectorAll('.troute .chip')[1].textContent, document.querySelectorAll('.troute')[1].querySelectorAll('.tbar-delay').length] };
    });
    // fixture roads: Ayalon 1260 s (free 600), Route 4 880 s, Route 1 1500 s (delay 20 s), Route 6 no route
    const [ay, r4, r1, r6] = v.roads;
    assert.ok(Math.abs((r4.free + r4.delay) / r1.track - 880 / 1500) < 0.01, 'Route 4 on the same scale: ' + JSON.stringify(r4));
    assert.ok(Math.abs((ay.free + ay.delay) / r1.track - 1260 / 1500) < 0.01, 'Ayalon drawn against the longest road: ' + JSON.stringify(ay));
    assert.ok(r1.free / r1.track > 0.98 && r1.delay === 0, 'Route 1: a 20 s delay draws no sliver (it is not said either)');
    assert.equal(r1.sub, '25 мин');
    assert.deepEqual([r6.sub, r6.track > 0, r6.free, r6.delay], ['Нет данных', true, 0, 0], 'a failed road keeps an empty track');
    assert.deepEqual([v.jerusalem.time, v.jerusalem.timeCls, v.jerusalem.sub, v.jerusalem.bar, v.jerusalem.fill], ['—', 'troute-time is-none', 'Нет данных', true, 0]);
    assert.equal(v.jerusalem.barTop, v.jerusalem.okBarTop, 'its track sits where every route\'s bar sits');
    assert.deepEqual(v.unit, ['48px', '39 мин']);
    assert.deepEqual(v.rishon, ['Свободно', 0], 'a 40 s delay: neither "+1 мин" nor a sliver (one threshold for words and bars)');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, []);
  } finally { await app.close(); }
});

// C2: TomTom refusing — the key (403) or today's limit (429): said plainly; with last good data the cards stay.
test('C2: 429 with last good data keeps the cards under an amber "not updating" header; 429 / 403 with nothing say why', async () => {
  let posts = 0;
  const kept = await openApp({ ...QUIET, configure: (c) => { c.traffic.key = 'FIXTUREKEY123'; c.traffic.visibleRefreshMs = 400; c.traffic.refreshMs = 400; },
    traffic: () => (++posts === 1 ? { status: 200, body: JSON.stringify(tomtomFixture()) } : { status: 429, body: '' }) });
  try {
    await ready(kept);
    const p = kept.page;
    await toTraffic(p);
    await p.waitForFunction(() => document.getElementById('traffic-status').className.indexOf('is-stale') >= 0, { timeout: 8000, polling: 50 });
    const v = await p.evaluate(() => ({ status: document.getElementById('traffic-status').textContent, routes: document.querySelectorAll('.troute .troute-time').length,
      color: getComputedStyle(document.getElementById('traffic-status')).color }));
    assert.equal(v.status, 'Не обновляется · данные от 20:32');
    assert.equal(v.routes, 3, 'the last good cards stay');
    assert.equal(v.color, 'rgba(255, 214, 150, 0.85)', 'amber');
  } finally { await kept.close(); }
  for (const [status, text, sub] of [[429, 'Лимит запросов TomTom на сегодня исчерпан', /^Повторим в 20:\d\d$/], [403, 'Ключ TomTom не принят', /^Проверьте TOMTOM_KEY и пересоберите приложение$/]]) {
    const app = await openApp({ ...QUIET, configure: KEY, traffic: () => ({ status, body: '' }) });
    try {
      await ready(app);
      const p = app.page;
      await toTraffic(p);
      await p.waitForSelector('#screen-traffic .empty-text');
      await wait(700);
      const v = await p.$eval('#screen-traffic', (e) => [e.querySelector('.empty-text').textContent, e.querySelector('.empty-sub').textContent]);
      assert.equal(v[0], text);
      assert.match(v[1], sub);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    } finally { await app.close(); }
  }
});

test('an alert in Rehovot: full screen over the main screen at once; the remote cannot dismiss it; rotation holds; Back still exits', async () => {
  const init = 'window.__calls = []; window.tizen = { application: { getCurrentApplication: () => ({ exit: () => window.__calls.push("exit") }) } };';
  const app = await openApp({ news: 'ok', alerts: 'rehovot.json', init, configure: (c) => { c.rotation.intervalMs = 300; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on');
    await wait(900);
    const v = await p.evaluate(() => {
      const a = document.getElementById('alert'), r = a.getBoundingClientRect(), cs = getComputedStyle(a);
      const top = document.elementFromPoint(960, 540);
      return { box: [r.left, r.top, r.width, r.height], opacity: cs.opacity, z: cs.zIndex, onTop: a.contains(top),
        text: ['.alert-kind', '.alert-areas', '.alert-since', '.alert-instr'].map((s) => a.querySelector(s).textContent),
        pulse: getComputedStyle(a.querySelector('.alert-pulse')).animationName };
    });
    assert.deepEqual(v.box, [0, 0, 1920, 1080]);
    assert.equal(v.opacity, '1');
    assert.ok(v.onTop, 'the alert is what the screen shows');
    assert.deepEqual(v.text, ['Ракетный обстрел', 'Реховот', 'С 20:32', 'Войдите в защищённое помещение и оставайтесь там 10 мин']);
    assert.equal(v.pulse, 'alert-pulse');
    assert.deepEqual(await dots(p), ['dot is-on', 'dot', 'dot'], 'rotation held while the alert is up');
    for (const k of [LEFT, RIGHT, ENTER, 13, 27, 8]) await press(p, k);
    await wait(300);
    assert.equal(await p.$eval('#alert', (e) => e.className), 'alert is-on', 'no key dismisses it');
    await press(p, BACK);
    assert.deepEqual(await p.evaluate(() => window.__calls), ['exit'], 'Back still exits the app');
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// FB4-A8 (frontend review F1): two records for Rehovot, 1 min and 10 min, in either order: the overlay says what
// the hold does — «10 мин», never «1 мин».
test('FB4-A8: two records for Rehovot (1 min and 10 min), either order: the overlay instruction says «10 мин»', async () => {
  const rec = (id, n) => ({ id, cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן ושהו בו ' + n + ' דקות' });
  for (const pair of [[rec('100', 1), rec('200', 10)], [rec('200', 10), rec('100', 1)]]) {
    const app = await openApp({ news: 'ok', alerts: () => ({ status: 200, body: JSON.stringify(pair) }) });
    try {
      await ready(app);
      await app.page.waitForSelector('#alert.is-on');
      const instr = await app.page.$eval('#alert .alert-instr', (e) => e.textContent);
      assert.equal(instr, 'Войдите в защищённое помещение и оставайтесь там 10 мин', 'order ' + pair.map((r) => r.id).join(','));
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  }
});

test('the alert stays for its hold after the last listing and a grace of confirmed absence, then fades; rotation resumes', async () => {
  const t0 = Date.now();
  let clearAt = 0;
  // no duration in the instruction: the hold is defaultHoldMs (shortened here), absence must last graceMs
  const listing = JSON.stringify({ id: '134062731180000000', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות'], desc: 'היכנסו למרחב המוגן' });
  const app = await openApp({ news: 'ok', configure: (c) => { c.alerts.pollMs = 100; c.alerts.graceMs = 500; c.alerts.defaultHoldMs = 1500; c.rotation.intervalMs = 1000; },
    alerts: () => { const listed = Date.now() - t0 < 4000; if (!listed && !clearAt) clearAt = Date.now(); return { status: 200, body: listed ? listing : '﻿\r\n' }; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on');
    await p.waitForFunction(() => document.getElementById('alert').className === 'alert', { timeout: 15000, polling: 50 });
    const gone = Date.now();
    assert.ok(clearAt > 0, 'the feed stopped listing the area');
    assert.ok(gone - clearAt >= 1300, 'stayed through the hold: ' + (gone - clearAt) + ' ms after the last listing');
    assert.ok(gone - clearAt < 3500, 'then cleared: ' + (gone - clearAt) + ' ms');
    assert.deepEqual(await dots(p), ['dot is-on', 'dot', 'dot'], 'still on the first screen: the rotation was held');
    await wait(1400);
    assert.deepEqual(await dots(p), ['dot', 'dot is-on', 'dot'], 'rotation resumed one interval after the alert');
  } finally { await app.close(); }
});

// A3: a plain GET needs no CORS preflight; the harness answers oref's OPTIONS as oref does (no Allow-Origin), so a
// custom header would turn every poll into a failed preflight and the "no connection" marker.
test('A3: the alert feed is polled with plain GETs — no preflight, no custom header, never "no connection"', async () => {
  const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.alerts.pollMs = 100; } });
  try {
    await ready(app);
    await wait(1500);
    const r = app.requests.alerts;
    assert.ok(r.filter((x) => x.method === 'GET').length >= 8, 'polled: ' + r.length);
    assert.deepEqual(r.filter((x) => x.method !== 'GET').map((x) => x.method), [], 'no OPTIONS preflight');
    assert.ok(r.every((x) => !('x-requested-with' in x.headers)), 'no X-Requested-With');
    assert.equal(await app.page.$('.alerts-offline'), null, 'the feed answers: no offline marker');
  } finally { await app.close(); }
});

// A2: the overlay covers the corner, so the lost connection is said inside the overlay.
test('A2: an alert, then the feed lost: the overlay stays and says "no connection · data from HH:MM" on screen', async () => {
  const app = await openApp({ news: 'ok', configure: (c) => { c.alerts.pollMs = 100; },
    alerts: (n) => (n <= 2 ? { status: 200, body: orefFixture('rehovot.json') } : { status: 503, body: '' }) });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on .alert-offline', { timeout: 5000 });
    const v = await p.evaluate(() => {
      const o = document.querySelector('#alert .alert-offline'), r = o.getBoundingClientRect(), cs = getComputedStyle(o);
      return { cls: document.getElementById('alert').className, text: o.textContent, box: [r.top, r.bottom, r.left, r.right], size: cs.fontSize, color: cs.color,
        visible: cs.visibility, top: document.getElementById('alert').contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)) };
    });
    assert.equal(v.cls, 'alert is-on', 'the alert stays');
    assert.equal(v.text, 'Тревоги: нет связи · данные от 20:32');
    assert.ok(v.box[0] >= 0 && v.box[1] <= 1080 && v.box[2] >= 0 && v.box[3] <= 1920, 'inside the screen: ' + v.box);
    assert.ok(v.top && v.visible === 'visible', 'seen on top, not under anything');
    assert.deepEqual([v.size, v.color], ['32px', 'rgb(255, 213, 154)']);
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    await wait(600);
    assert.equal(await p.$eval('#alert', (e) => e.className), 'alert is-on', 'failures never clear it');
  } finally { await app.close(); }
});

// A5: nine nearby places: at most three names and «и ещё N», inside the right half of the bottom margin.
const NINE = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
  data: ['נס ציונה', 'ראשון לציון - מזרח', 'יבנה', 'גדרה', 'מזכרת בתיה', 'קריית עקרון', 'באר יעקב', 'רמלה', 'לוד'] });
const cornerBoxes = (p) => p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const dotsBox = [...document.querySelectorAll('.dot')].map(box);
  return { text: document.getElementById('corner').textContent, corner: box(document.getElementById('corner')), line: box(document.querySelector('.corner-line')), dots: dotsBox };
});
test('A5: nine places nearby: three names and «и ещё 6» in the right half, clear of the page dots; with the offline marker too', async () => {
  const app = await openApp({ news: 'ok', configure: (c) => { c.alerts.pollMs = 100; }, alerts: (n) => (n <= 3 ? { status: 200, body: NINE } : { status: 503, body: '' }) });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('.nearby');
    const first = await cornerBoxes(p);
    assert.equal(first.text, 'Тревога рядом: Нес-Циона, Ришон-ле-Цион, Явне и ещё 6');
    await p.waitForSelector('.alerts-offline', { timeout: 5000 });
    const both = await cornerBoxes(p);
    assert.match(both.text, /^Тревога рядом: .+ и ещё \d+Тревоги: нет связи$/, both.text);
    for (const v of [first, both]) {
      assert.ok(v.line.l >= v.corner.l - 0.5 && v.line.r <= v.corner.r + 0.5, 'the line fits its region: ' + JSON.stringify(v.line) + ' in ' + JSON.stringify(v.corner));
      assert.ok(v.corner.l >= 1024 && v.corner.r <= 1920 - 64, 'the right half of the margin');
      assert.ok(v.dots.every((d) => d.r < v.line.l), 'clear of the page dots');
    }
    assert.deepEqual(clean(await p.evaluate(measure, '#corner *')), []);
  } finally { await app.close(); }
});

// A6: hyphenated names never break inside a name; many names step down to 48 px.
test('A6: many configured areas in one alert: every name on one line, the list at 48 px, nothing cut', async () => {
  const many = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    data: ['רחובות', 'נס ציונה', 'ראשון לציון - מזרח', 'מזכרת בתיה', 'קריית עקרון', 'באר יעקב', 'יבנה', 'גדרה'] });
  const app = await openApp({ news: 'ok', alerts: () => ({ status: 200, body: many }),
    configure: (c) => { c.alerts.areas = c.alerts.areas.concat(c.alerts.nearby.slice(0, 7)); } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on .alert-area');
    const v = await p.evaluate(() => ({ cls: document.querySelector('.alert-areas').className, size: getComputedStyle(document.querySelector('.alert-areas')).fontSize,
      names: [...document.querySelectorAll('.alert-area')].map((e) => [e.textContent, e.getClientRects().length]) }));
    assert.equal(v.cls, 'alert-areas is-many');
    assert.equal(v.size, '48px');
    assert.equal(v.names.length, 8);
    for (const [name, lines] of v.names) assert.equal(lines, 1, name + ' broke across lines');
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
  } finally { await app.close(); }
});

// B6: feed text with markup reaches the page only as text (kills "esc removed" in the news and alert views).
test('B6: a hostile news headline and alert text are shown as literal text — no element, no script run', async () => {
  const hostile = '<?xml version="1.0"?><rss version="2.0"><channel><item><title>&amp;lt;img src=x onerror="window.__pwn=1"&amp;gt; Заголовок</title>' +
    '<link>https://www.newsru.co.il/x/1</link><pubDate>Thu, 29 Oct 2026 20:30:00 +0200</pubDate><description>&amp;lt;b&amp;gt;жирный&amp;lt;/b&amp;gt;</description></item></channel></rss>';
  const alert = JSON.stringify({ id: '1', cat: '1', title: '<img src=x onerror="window.__pwn=2">התרעה', data: ['רחובות'], desc: '<b onmouseover="window.__pwn=3">הנחיה</b>' });
  const app = await openApp({ news: (url) => (url.includes('newsru') ? { status: 200, body: hostile } : { status: 503, body: '' }), alerts: () => ({ status: 200, body: alert }) });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on .alert-orig');
    await press(p, RIGHT);
    await p.waitForSelector('.lead-title');
    await wait(300);
    const v = await p.evaluate(() => ({ pwn: window.__pwn, lead: document.querySelector('.lead-title').textContent,
      summary: document.querySelector('.lead-summary').textContent, orig: document.querySelector('.alert-orig').textContent,
      instr: document.querySelector('.alert-instr').textContent,
      elements: document.querySelectorAll('#screen-news img, #screen-news b, #alert img, #alert b').length }));
    assert.equal(v.pwn, undefined, 'no script ran');
    assert.equal(v.elements, 0, 'no element from the feed reached the page');
    assert.equal(v.lead, '<img src=x onerror="window.__pwn=1"> Заголовок');
    assert.equal(v.summary, '<b>жирный</b>');
    assert.equal(v.orig, '<img src=x onerror="window.__pwn=2">התרעה');
    assert.equal(v.instr, '<b onmouseover="window.__pwn=3">הנחיה</b>');
  } finally { await app.close(); }
});

test('the alert feed failing: a small "Тревоги: нет связи" marker, no overlay, never an "all clear"', async () => {
  const app = await openApp({ news: 'ok', alerts: 'fail', configure: (c) => { c.alerts.pollMs = 100; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('.alerts-offline', { timeout: 5000 });
    const v = await p.evaluate(() => ({ corner: document.getElementById('corner').textContent, alert: document.getElementById('alert').className,
      size: getComputedStyle(document.querySelector('.alerts-offline')).fontSize, all: document.body.textContent }));
    assert.deepEqual([v.corner, v.alert, v.size], ['Тревоги: нет связи', 'alert', '24px']);
    assert.ok(!/отбой|спокойно|тревог нет|all clear/i.test(v.all), 'no all-clear wording anywhere');
    assert.deepEqual(clean(await p.evaluate(measure, '#corner *')), []);
  } finally { await app.close(); }
});

test('an alert nearby (not in Rehovot): only a quiet notice in the corner, no overlay', async () => {
  const app = await openApp({ news: 'ok', alerts: 'nearby.json' });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('.nearby');
    assert.equal(await p.$eval('#corner', (e) => e.textContent), 'Тревога рядом: Нес-Циона, Ришон-ле-Цион');
    assert.equal(await p.$eval('#alert', (e) => e.className), 'alert');
  } finally { await app.close(); }
});
