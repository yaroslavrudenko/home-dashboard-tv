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
      const cols = [...document.querySelectorAll('.news-col')].map((c) => c.getBoundingClientRect());
      return { n: document.querySelectorAll('.news-item').length,
        titles: [...document.querySelectorAll('.news-title')].map((t) => t.textContent),
        inside: [...document.querySelectorAll('.news-col')].every((c, i) => [...c.querySelectorAll('.news-title')].every((t) => t.getBoundingClientRect().bottom <= cols[i].bottom + 0.5)) };
    });
    assert.ok(r.n >= 2 && r.n < 6, 'fewer than six stories: ' + r.n);
    assert.ok(r.inside, 'every shown headline ends inside its column');
    for (const t of r.titles) assert.match(t, /что будет дальше$/, 'whole headline: ' + t.slice(0, 40));
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
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

test('the alert stays while the feed lists the area and for the grace period after, then fades; rotation resumes', async () => {
  const t0 = Date.now();
  let clearAt = 0;
  const app = await openApp({ news: 'ok', configure: (c) => { c.alerts.pollMs = 100; c.alerts.graceMs = 1500; c.rotation.intervalMs = 1000; },
    alerts: () => { const listed = Date.now() - t0 < 4000; if (!listed && !clearAt) clearAt = Date.now(); return { status: 200, body: listed ? orefFixture('rehovot.json') : '﻿\r\n' }; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on');
    await p.waitForFunction(() => document.getElementById('alert').className === 'alert', { timeout: 15000, polling: 50 });
    const gone = Date.now();
    assert.ok(clearAt > 0, 'the feed stopped listing the area');
    assert.ok(gone - clearAt >= 1300, 'stayed through the grace period: ' + (gone - clearAt) + ' ms after the last listing');
    assert.ok(gone - clearAt < 3500, 'then cleared: ' + (gone - clearAt) + ' ms');
    assert.deepEqual(await dots(p), ['dot is-on', 'dot', 'dot'], 'still on the first screen: the rotation was held');
    await wait(1400);
    assert.deepEqual(await dots(p), ['dot', 'dot is-on', 'dot'], 'rotation resumed one interval after the alert');
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
