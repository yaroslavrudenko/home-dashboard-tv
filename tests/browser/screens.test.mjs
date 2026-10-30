// Batch 2 at the TV's 1920×1080 in headless Chrome: switching screens with the remote, page dots, rotation and its
// pause, hidden screens costing nothing, the News and Traffic screens on recorded shapes, and the Israel alert over
// everything (stays until clear + grace, never dismissed by the remote, a failed feed never reads as "all clear").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, measure, legibility, FIXED_NOW, trafficFixture, routeIndexOf } from './page.mjs';

const orefFixture = (name) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'oref', name));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, RIGHT = 39, ENTER = 13, BACK = 10009;
const KEY = (c) => { c.traffic.token = 'pk.FIXTURE123'; };
const QUIET = { news: 'ok', alerts: 'empty-bom.txt' };
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
const active = (p) => p.evaluate(() => [...document.querySelectorAll('.screen')].map((s) => [s.id, s.className, getComputedStyle(s).visibility]));
const dots = (p) => p.$$eval('.dot', (d) => d.map((e) => e.className));
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
// FB5: the screens in Config.screens order; a screen is reached with ▶ pressed its index times.
const SCREENS = ['main', 'israel', 'news', 'traffic', 'map'];
const dotsAt = (i) => SCREENS.map((_, k) => (k === i ? 'dot is-on' : 'dot'));
const toScreen = async (p, id) => { for (let i = 0; i < SCREENS.indexOf(id); i++) await press(p, RIGHT); };

test('◀ ▶ switch screens with page dots; the hidden screens keep their DOM and are not painted', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    assert.deepEqual(await dots(p), dotsAt(0), 'FB5: five page dots');
    // Ynet's times carry seconds: put the clock at :20 past 18:40, so no "… ago" text changes for the next 19 s (boundaries at :40).
    await p.evaluate(() => { window.__offsetMs += Date.parse('2026-10-29T18:40:20Z') - Date.now(); });
    assert.equal(await p.$('.news-col'), null, 'a screen never shown is not even drawn');
    assert.equal(await press(p, RIGHT), true, 'the arrow is consumed');
    await press(p, RIGHT);
    await wait(800);
    const col = await p.$('.news-col');
    assert.deepEqual(await active(p), SCREENS.map((id, k) => ['screen-' + id, k === 2 ? 'screen is-active' : 'screen', k === 2 ? 'visible' : 'hidden']));
    assert.deepEqual(await dots(p), dotsAt(2));
    for (const k of [3, 4]) { await press(p, RIGHT); await wait(800); assert.deepEqual(await dots(p), dotsAt(k)); }
    await press(p, RIGHT); await wait(800);
    assert.deepEqual(await dots(p), dotsAt(0), 'wraps to the first screen');
    await press(p, LEFT); await press(p, LEFT); await press(p, LEFT); await wait(800);
    assert.deepEqual(await dots(p), dotsAt(2));
    assert.equal(await col.evaluate((e) => e.isConnected), true, 'the news DOM survived the switches (no rebuild on switch)');
    const rest = await p.$$eval('.screen', (s) => s.map((e) => getComputedStyle(e).transform));
    assert.deepEqual(rest, SCREENS.map(() => 'none'), 'every screen at rest in place after the slide');
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
      const main = document.getElementById('screen-main'), news = document.getElementById('screen-israel'), out = [], t0 = performance.now();   // FB5-WX: ▶ from main
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
    assert.deepEqual(await dots(p), dotsAt(1), 'paused after a key press (would have moved at 1 s)');
    await p.waitForFunction(() => document.querySelectorAll('.dot')[2].className === 'dot is-on', { timeout: 2500, polling: 50 });
  } finally { await app.close(); }
});

test('a hidden screen costs nothing: refreshes while it is hidden never touch its DOM; it is drawn when it comes into view', async () => {
  const app = await openApp({ ...QUIET, lang: 'he', configure: (c) => { c.news.refreshMs = 250; } });
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
    assert.ok(app.requests.news.length - before >= 6, 'two feeds per refresh kept refreshing: ' + (app.requests.news.length - before));
    assert.deepEqual(await p.evaluate(() => window.__mut), { news: 0, traffic: 0 }, 'not a single DOM change on the hidden screens');
    await p.evaluate(() => { window.__offsetMs = 3 * 60000; document.dispatchEvent(new Event('visibilitychange')); });   // a minute tick
    assert.deepEqual(await p.evaluate(() => window.__mut), { news: 0, traffic: 0 }, 'the minute tick redraws only the screen on view');
    await toScreen(p, 'news');
    const [shown, expected] = await p.evaluate(() => [document.querySelectorAll('.news-col')[1].querySelector('.news-time').textContent,
      I18n.ago(Date.now() - Date.parse('2026-10-29T18:31:00Z'))]);   // Globes' newest story
    assert.equal(shown, expected, 'drawn with current times the moment it shows');
    assert.match(shown, /^לפני [4-9] דק׳$/);
  } finally { await app.close(); }
});

// FB5-NS: two columns of Israeli news in Hebrew — «ישראל» (Ynet) and «כלכלה» (Globes) — five stories each; since batch 6
// the Hebrew interface shows them (L2), the Russian one NEWSru.
const NEWS_COLS = () => [...document.querySelectorAll('.news-col')].map((c) => ({
  title: c.querySelector('.news-col-title').textContent, src: c.querySelector('.src-name').textContent,
  state: c.querySelector('.news-col-state') ? c.querySelector('.news-col-state').textContent : '',
  empty: c.querySelector('.news-col-empty') ? c.querySelector('.news-col-empty').textContent : '',
  dir: getComputedStyle(c.querySelector('.news-rows')).direction, align: getComputedStyle(c.querySelector('.news-rows')).textAlign,
  rows: [...c.querySelectorAll('.news-row')].map((r) => ({ time: r.querySelector('.news-time') ? r.querySelector('.news-time').textContent : '',
    title: r.querySelector('.news-title') ? r.querySelector('.news-title').textContent : '', top: Math.round(r.getBoundingClientRect().top),
    titleH: r.querySelector('.news-title') ? r.querySelector('.news-title').getBoundingClientRect().height : 0,
    clamp: r.querySelector('.news-title') ? (() => { const cs = getComputedStyle(r.querySelector('.news-title')); return [cs.display, cs.webkitBoxOrient, cs.webkitLineClamp]; })() : null })),
  box: (() => { const b = c.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; })() }));

test('FB5-NS: News — one parallel round of two feeds; «Израиль» (Ynet) and «Экономика» (Globes), five stories each, newest first, Hebrew right to left', async () => {
  const app = await openApp({ ...QUIET, lang: 'he' });
  try {
    await ready(app);
    const p = app.page;
    await toScreen(p, 'news');
    await p.waitForSelector('.news-col');
    await wait(700);
    // FB5C-OPEN: the boot round and the round the ◀ ▶ open asks for — each one request per feed (was three)
    assert.equal(app.requests.news.length, 4, 'two rounds of one request per feed');
    for (const round of [app.requests.news.slice(0, 2), app.requests.news.slice(2)])
      assert.deepEqual(round.map((r) => new URL(r.url).host).sort(), ['www.globes.co.il', 'www.ynet.co.il']);
    const cols = await p.evaluate(NEWS_COLS);
    assert.deepEqual(cols.map((c) => [c.title, c.src, c.state, c.dir, c.align, c.rows.length]),
      [['ישראל', 'Ynet', '', 'rtl', 'start', 5], ['כלכלה', 'Globes', '', 'rtl', 'start', 5]]);
    assert.ok(cols[0].box[0] > cols[1].box[0], 'L3: right to left — «ישראל» is the right column');
    assert.match(cols[0].rows[0].title, /^הממשלה אישרה הלילה/, 'Ynet newest first');
    assert.equal(cols[0].rows.filter((r) => /^רעידת אדמה/.test(r.title)).length, 1, 'the story Ynet repeats appears once');
    assert.match(cols[1].rows[0].title, /^הבורסה בתל אביב/, 'Globes newest first, though its feed lists it second');
    assert.equal(cols[1].rows[0].time, 'לפני 1 דק׳');
    for (let k = 0; k < 5; k++) assert.ok(Math.abs(cols[0].rows[k].top - cols[1].rows[k].top) <= 1, 'row ' + k + ' on one line across the columns');
    const view = await p.evaluate(() => ({ status: document.getElementById('news-status').textContent, statusCls: document.getElementById('news-status').className,
      injected: document.querySelectorAll('#screen-news script, #screen-news img, #screen-news a, #screen-news p').length }));
    assert.equal(view.injected, 0, 'no element from a feed reached the page');
    assert.deepEqual([view.status, view.statusCls], ['עודכן ב־20:32', 'status screen-status is-fresh']);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), [], 'nothing cut, outside its card or off screen');
    assert.deepEqual((await p.evaluate(legibility, '#screen-news *')).bad, [], 'every text ≥ 24 px and ≥ 4.5:1');
  } finally { await app.close(); }
});

const rssOf = (titles, host) => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>' + titles.map((t, i) =>
  '<item><title>' + t + '</title><link>https://' + host + '/x/' + i + '</link>' +
  '<pubDate>Thu, 29 Oct 2026 20:' + String(30 - i).padStart(2, '0') + ':00 +0200</pubDate></item>').join('') + '</channel></rss>';

// Five two-line headlines per column fit the 1080-px screen: a headline is a fixed two-line box, rows on one grid.
test('FB5-NS: long Hebrew and Hebrew/Latin headlines: two lines each, five per column, rows on one grid, nothing off screen', async () => {
  const long = (i) => 'ראש הממשלה הודיע הערב על תוכנית כלכלית חדשה לחיזוק הצפון והדרום, הכוללת מענקים לעסקים קטנים, הקלות במס והשקעה בתשתיות ' + i;
  const mixed = (i) => 'Nvidia ו-Intel מרחיבות את פעילותן בישראל: 2,000 משרות חדשות בחיפה ובקריית גת עד 2028, כך הודיעו החברות ' + i;
  const app = await openApp({ alerts: 'empty-bom.txt', lang: 'he', news: (url) => (url.includes('ynet') ? { status: 200, body: rssOf([0, 1, 2, 3, 4, 5].map(long), 'www.ynet.co.il') }
    : { status: 200, body: rssOf([0, 1, 2, 3, 4, 5].map(mixed), 'www.globes.co.il') }) });
  try {
    await ready(app);
    const p = app.page;
    await toScreen(p, 'news');
    await p.waitForSelector('.news-title');
    await wait(700);
    const cols = await p.evaluate(NEWS_COLS);
    for (const c of cols) {
      assert.equal(c.rows.length, 5, c.title + ': five, never more');
      for (const r of c.rows) assert.equal(r.titleH, 80, c.title + ': two lines of 40 px');
      // Chromium 47 computes display -webkit-box; current Chrome reports the clamped box as flow-root
      for (const r of c.rows) assert.ok(['-webkit-box', 'flow-root'].includes(r.clamp[0]) && r.clamp[1] === 'vertical' && r.clamp[2] === '2', c.title + ': FB5B-N8 — a two-line clamp with an ellipsis ' + r.clamp);
      assert.ok(c.box[3] <= 1080 - 48 && c.box[1] >= 0, c.title + ' inside the screen: ' + c.box);
    }
    for (let k = 0; k < 5; k++) assert.equal(cols[0].rows[k].top, cols[1].rows[k].top, 'row ' + k + ' on one grid');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
  } finally { await app.close(); }
});

// FB5-NS / FB5B-N7 / N9: per-column state — a feed that fails affects only its own column; both configured columns are
// always drawn (loading or failed inside each), and a partial failure is said once: in the failed column only.
test('FB5B-N9: one feed down — only its column says so and keeps its stories, the header stays fresh; a feed with nothing yet says so in its column', async () => {
  let econ = 0;
  const later = await openApp({ alerts: 'empty-bom.txt', configure: (c) => { c.news.refreshMs = 400; },
    news: (url) => (url.includes('section/finance') && ++econ > 1 ? { status: 503, body: '' } : null) });
  try {
    await ready(later);
    const p = later.page;
    await toScreen(p, 'news');
    await p.waitForSelector('.news-col-state', { timeout: 8000 });
    await wait(300);
    const cols = await p.evaluate(NEWS_COLS);
    assert.deepEqual(cols.map((c) => [c.title, c.state, c.rows.length]), [['Израиль', '', 5], ['Экономика', 'Не обновляется · данные от 20:32', 5]],
      'the economy feed keeps its last five stories and says it is not updating; the Israel feed is unaffected');
    assert.match(await p.$eval('#news-status', (e) => e.className + ' | ' + e.textContent), /is-fresh \| Обновлено в 20:3\d$/, 'said once: the header stays fresh');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
  } finally { await later.close(); }
  const never = await openApp({ alerts: 'empty-bom.txt', news: (url) => (url.includes('section/finance') ? { status: 503, body: '' } : null) });
  try {
    await ready(never);
    await toScreen(never.page, 'news');
    await never.page.waitForSelector('.news-col-empty');
    await wait(300);
    const cols = await never.page.evaluate(NEWS_COLS);
    // FB5D-R1: a feed that failed from the first load says so in its own column, amber, with when it is tried again —
    // never the neutral «Нет данных»
    assert.deepEqual(cols.map((c) => [c.title, c.state, c.rows.length]), [['Израиль', '', 5], ['Экономика', '', 0]]);
    assert.equal(cols[0].empty, '');
    assert.match(cols[1].empty, /^Не удалось загрузить · повторим в 20:3\d$/);
    assert.equal(await never.page.$eval('.news-col-empty', (e) => getComputedStyle(e).color), 'rgba(255, 214, 150, 0.85)', 'amber like .news-col-state');
    assert.match(await never.page.$eval('#news-status', (e) => e.className + ' | ' + e.textContent), /is-fresh \| Обновлено в 20:3\d$/, 'the header stays fresh');
    await wait(700);                               // the screen's fade-in is over: legibility is measured on the final opacity
    assert.deepEqual(clean(await never.page.evaluate(measure, '#screen-news *')), []);
    assert.deepEqual((await never.page.evaluate(legibility, '#screen-news *')).bad, []);
  } finally { await never.close(); }
});

test('FB5B-N7: both feeds pending, then both failed: both configured columns stay, each saying it in its own place', async () => {
  const pending = await openApp({ alerts: 'empty-bom.txt', news: () => ({ hang: true }) });
  try {
    await ready(pending);
    await toScreen(pending.page, 'news');
    await pending.page.waitForSelector('.news-col');
    await wait(700);
    const cols = await pending.page.evaluate(NEWS_COLS);
    assert.deepEqual(cols.map((c) => [c.title, c.src, c.empty, c.rows.length]), [['Израиль', 'NEWSru', 'Загружаем новости…', 0], ['Экономика', 'NEWSru', 'Загружаем новости…', 0]]);
    assert.deepEqual(cols.map((c) => c.dir), ['ltr', 'ltr'], 'Russian: the page\'s own direction, the ellipsis at the end');
    assert.equal(await pending.page.$eval('#news-status', (e) => e.textContent), '');
    assert.equal(await pending.page.$$eval('#screen-news .empty-state', (e) => e.length), 0, 'no whole-screen message');
  } finally { await pending.close(); }
  const failed = await openApp({ news: 'fail', alerts: 'empty-bom.txt' });
  try {
    await ready(failed);
    await toScreen(failed.page, 'news');
    await failed.page.waitForSelector('.news-col-empty.is-failed');
    await wait(700);
    const cols = await failed.page.evaluate(NEWS_COLS);
    // FB5D-R2: failure wording in both columns (not «Нет данных») and an amber header (not the fresh green dot)
    assert.deepEqual(cols.map((c) => [c.title, c.state, c.rows.length]), [['Израиль', '', 0], ['Экономика', '', 0]]);
    for (const c of cols) assert.match(c.empty, /^Не удалось загрузить · повторим в 20:3[3-5]$/, c.title);
    assert.deepEqual(await failed.page.$$eval('.news-col-empty', (els) => els.map((e) => getComputedStyle(e).color)), ['rgba(255, 214, 150, 0.85)', 'rgba(255, 214, 150, 0.85)']);
    assert.deepEqual(await failed.page.$eval('#news-status', (e) => [getComputedStyle(e).color, getComputedStyle(e.querySelector('.status-dot')).backgroundColor]),
      ['rgba(255, 214, 150, 0.85)', 'rgb(255, 207, 138)'], 'the failed header is amber like stale');
    // FB5C-OPEN: the ◀ ▶ open adds a second failed round, so the jittered back-off is drawn up to the 2-min ceiling
    assert.match(await failed.page.$eval('#news-status', (e) => e.className + ' | ' + e.textContent), /is-failed \| Новости временно недоступны · повторим в 20:3[3-5]$/, 'said once, in the header, with when it is tried again');
    assert.deepEqual(clean(await failed.page.evaluate(measure, '#screen-news *')), []);
    assert.deepEqual((await failed.page.evaluate(legibility, '#screen-news *')).bad, []);
  } finally { await failed.close(); }
});

test('Traffic without a key: a calm invitation, and not a single request to TomTom', async () => {
  const app = await openApp({ ...QUIET, traffic: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    await toScreen(p, 'traffic');
    await wait(800);
    assert.deepEqual(await p.$eval('#screen-traffic', (s) => [s.querySelector('.screen-title').textContent, s.querySelector('.empty-text').textContent, s.querySelector('.empty-sub').textContent]),
      ['Пробки', 'Подключите токен Mapbox, чтобы видеть пробки', 'MAPBOX_TOKEN в build.local.env, затем пересоберите приложение']);
    assert.equal(app.requests.traffic.length, 0);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
  } finally { await app.close(); }
});

// FB5B-T1: the ten routes in two columns of five — «Города», «Рядом» — on one grid (highways are on the map screen).
const WIDGETS = () => [...document.querySelectorAll('.tcol')].map((c) => ({ title: c.querySelector('.tcol-title').textContent,
  items: [...c.querySelectorAll('.tw')].map((w) => [w.querySelector('.tw-name').textContent, w.querySelector('.tw-time').textContent,
    w.querySelector('.chip') ? w.querySelector('.chip').className + ' ' + w.querySelector('.chip').textContent : (w.querySelector('.tnodata') || {}).textContent,
    w.querySelector('.tw-km') ? w.querySelector('.tw-km').textContent : '', Math.round(w.getBoundingClientRect().top), Math.round(w.getBoundingClientRect().bottom)]) }));
// A fast gate for tests that need a second round while the screen stays open.
const FAST = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.traffic.schedule.minIntervalMs = 400; };

test('FB5B-T1: Traffic with a token (Mapbox): ten GETs started together, one per route; two columns of five widgets on one grid', async () => {
  const app = await openApp({ ...QUIET, traffic: 'ok', configure: KEY });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(app.requests.traffic.length, 0, 'FB5B-T2: nothing at boot while the screen is hidden');
    await toScreen(p, 'traffic');
    await p.waitForSelector('.tw-time');
    await wait(700);
    const gets = app.requests.traffic.filter((r) => r.method === 'GET');
    assert.equal(gets.length, 10, 'one round: a GET per route');
    assert.ok(gets.every((r) => /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/driving-traffic\/34\.8113,31\.8928;[\d.]+,[\d.]+\?overview=false&access_token=pk\.FIXTURE123$/.test(r.url)), gets[0].url);
    assert.equal(new Set(gets.map((r) => r.url)).size, 10, 'ten different routes');
    const cols = await p.evaluate(WIDGETS);
    assert.deepEqual(cols.map((c) => c.title), ['Города', 'Рядом']);
    assert.deepEqual(cols[0].items.map((w) => w.slice(0, 4)), [
      ['Тель-Авив', '32 мин', 'chip lv-ok Свободно', '27 км'], ['Иерусалим', '45 мин', 'chip lv-ok Свободно', '60 км'],
      ['Хайфа', '1 ч 39 мин', 'chip lv-ok Свободно', '119 км'], ['Беэр-Шева', '1 ч 10 мин', 'chip lv-slow +10 мин', '88 км'],
      ['Ашкелон', '45 мин', 'chip lv-ok +3 мин', '37 км']]);
    assert.deepEqual(cols[1].items.map((w) => w.slice(0, 4)), [
      ['Модиин', '25 мин', 'chip lv-ok Свободно', '30 км'], ['Ришон-ле-Цион', '21 мин', 'chip lv-jam +8 мин', '12 км'],
      ['Аэропорт', '32 мин', 'chip lv-ok Свободно', '25 км'], ['Холон', '32 мин', 'chip lv-ok Свободно', '22 км'],
      ['Глилот', '43 мин', 'chip lv-ok +3 мин', '38 км']]);
    for (let k = 0; k < 5; k++) assert.equal(new Set(cols.map((c) => c.items[k][4] + '/' + c.items[k][5])).size, 1, 'row ' + k + ' on one grid: ' + cols.map((c) => c.items[k][4]));
    // FB5B-T5 (FE F10): one rhythm — the gap between widgets equals the gap between the columns
    const gaps = await p.evaluate(() => { const tw = [...document.querySelectorAll('.tw')], col = [...document.querySelectorAll('.tcol')];
      return [Math.round(tw[1].getBoundingClientRect().top - tw[0].getBoundingClientRect().bottom), Math.round(col[1].getBoundingClientRect().left - col[0].getBoundingClientRect().right)]; });
    assert.equal(gaps[0], gaps[1], 'one rhythm: ' + gaps);
    assert.ok(cols.every((c) => c.items[4][5] <= 1080 - 48), 'the last row inside the screen');
    assert.equal(await p.$eval('#traffic-status', (e) => e.textContent), 'Обновлено 20:32 · 0 мин назад');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, []);
  } finally { await app.close(); }
});

const NO_ROUTE = { code: 'NoRoute', message: 'No route found', routes: [] };
const toTraffic = (p) => toScreen(p, 'traffic');

// C4 (D6, D7, D8, D12): one encoding per screen, no hairline slivers, a failed row keeps its shape, smaller units.
// A column's bars share its scale («Города»: its longest, Haifa, 5922 s).
test('C4: route bars share one time scale per column; no delay sliver under a minute; a failed route keeps «—», «Нет данных» and its track', async () => {
  const b = trafficFixture();
  b[1] = NO_ROUTE;                                  // Jerusalem cannot be routed
  Object.assign(b[6].routes[0], { duration: 1000, duration_typical: 960 });   // Rishon: 40 s over the usual
  const app = await openApp({ ...QUIET, configure: KEY, traffic: (round, url) => ({ status: 200, body: JSON.stringify(b[routeIndexOf(url)]) }) });
  try {
    await ready(app);
    const p = app.page;
    await toTraffic(p);
    await p.waitForSelector('.tw-time');
    await wait(800);
    const v = await p.evaluate(() => {
      const w = (e) => e ? e.getBoundingClientRect().width : 0;
      const tws = [...document.querySelectorAll('.tw')];
      const bar = (t) => ({ name: t.querySelector('.tw-name').textContent, track: w(t.querySelector('.tbar')),
        free: w(t.querySelector('.tbar-free')), delay: w(t.querySelector('.tbar-delay')) });
      const jr = tws[1];
      return { cities: tws.slice(0, 5).map(bar), jerusalem: { time: jr.querySelector('.tw-time').textContent, timeCls: jr.querySelector('.tw-time').className,
        nodata: jr.querySelector('.tnodata').textContent, bar: !!jr.querySelector('.tbar'), fill: jr.querySelectorAll('.tbar *').length,
        barGap: jr.getBoundingClientRect().bottom - jr.querySelector('.tbar').getBoundingClientRect().bottom,
        okBarGap: tws[0].getBoundingClientRect().bottom - tws[0].querySelector('.tbar').getBoundingClientRect().bottom },
        unit: [getComputedStyle(document.querySelector('.tw-time .unit')).fontSize, tws[0].querySelector('.tw-time').textContent],
        rishon: [tws[6].querySelector('.chip').textContent, tws[6].querySelectorAll('.tbar-delay').length] };
    });
    const [tlv, , haifa, beersheva] = v.cities;
    assert.ok(Math.abs(haifa.free + haifa.delay - haifa.track) < 1, 'Haifa, the longest, fills its track');
    assert.ok(Math.abs((tlv.free + tlv.delay) / haifa.track - 1920.4 / 5922.3) < 0.01, 'Tel Aviv on the same scale: ' + JSON.stringify(tlv));
    assert.ok(Math.abs((beersheva.free + beersheva.delay) / haifa.track - 4210.5 / 5922.3) < 0.01, 'Beer Sheva: ' + JSON.stringify(beersheva));
    assert.deepEqual([v.jerusalem.time, v.jerusalem.timeCls, v.jerusalem.nodata, v.jerusalem.bar, v.jerusalem.fill], ['—', 'tw-time is-none', 'Нет данных', true, 0]);
    assert.equal(v.jerusalem.barGap, v.jerusalem.okBarGap, 'its track sits where every widget\'s bar sits');
    assert.deepEqual(v.unit, ['30px', '32 мин']);
    assert.deepEqual(v.rishon, ['Свободно', 0], 'a 40 s delay: neither "+1 мин" nor a sliver (one threshold for words and bars)');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, []);
  } finally { await app.close(); }
});

// FB5C-7: Mapbox refusing (401/403/429) — said plainly with when it is tried again; with last good data the cards stay
// under the amber data-time line and the refusal is a second line that never replaces it; stale chips stay legible.
test('FB5C-7: last good data, then 403 / 429: the cards stay, the data-time line stays, the refusal below it; stale chips stay legible', async () => {
  for (const status of [403, 429]) {
    const app = await openApp({ ...QUIET, configure: FAST, traffic: (round) => (round === 1 ? null : { status, body: '' }) });
    try {
      await ready(app);
      const p = app.page;
      await toTraffic(p);
      await p.waitForFunction(() => document.getElementById('traffic-note').textContent !== '', { timeout: 8000, polling: 50 });
      await wait(300);
      const v = await p.evaluate(() => { const st = document.getElementById('traffic-status'), note = document.getElementById('traffic-note'), chip = document.querySelector('.tw.is-stale .chip');
        const box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; };
        return { text: st.textContent, note: note.textContent, color: getComputedStyle(st).color, noteColor: getComputedStyle(note).color,
          box: box(st), noteBox: box(note), cut: st.scrollWidth > st.clientWidth + 1 || note.scrollWidth > note.clientWidth + 1,
          widgets: document.querySelectorAll('.tw .tw-time:not(.is-none)').length, chip: [getComputedStyle(chip).color, getComputedStyle(chip).opacity],
          title: document.querySelector('.tcol-title').getBoundingClientRect().top };
      });
      assert.equal(v.text, 'Данные устарели · обновлено 20:32 · 0 мин назад', status + ': the data-time line');
      assert.match(v.note, /^Mapbox отклонил запрос \(доступ или лимит\) · автоматический повтор не раньше 20:3\d$/, status + ': ' + v.note);
      assert.equal(v.color, 'rgba(255, 214, 150, 0.85)', status + ': amber');
      assert.equal(v.noteColor, 'rgba(255, 214, 150, 0.85)');
      for (const bx of [v.box, v.noteBox]) assert.ok(bx[0] >= 0 && bx[1] <= 1920 && bx[2] >= 0 && bx[3] <= 1080, status + ': inside the screen ' + bx);
      assert.ok(!v.cut, 'not cut');
      assert.ok(v.noteBox[2] >= v.box[3] - 0.5 && v.noteBox[3] <= v.title, 'the note under the line, above the columns: ' + v.noteBox + ' / ' + v.title);
      assert.equal(v.widgets, 10, status + ': the last good widgets stay');
      assert.deepEqual(v.chip, ['rgba(255, 255, 255, 0.62)', '1'], 'a stale chip is quiet white, not faded');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
      assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, [], 'every text legible, opacity included');
    } finally { await app.close(); }
  }
  for (const status of [429, 403]) {
    const app = await openApp({ ...QUIET, configure: KEY, traffic: () => ({ status, body: '' }) });
    try {
      await ready(app);
      const p = app.page;
      await toTraffic(p);
      await p.waitForSelector('#screen-traffic .empty-text');
      await wait(700);
      const v = await p.$eval('#screen-traffic', (e) => [e.querySelector('.empty-text').textContent, !!e.querySelector('.empty-sub'), e.querySelector('#traffic-note').textContent]);
      assert.match(v[0], /^Mapbox отклонил запрос \(доступ или лимит\) · автоматический повтор не раньше 20:4\d$/, status + ': ' + v[0] + ' (the attempt + 10 min)');
      assert.deepEqual(v.slice(1), [false, ''], 'one message, in the card');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    } finally { await app.close(); }
  }
});

// Stored state for the screens below: the accounting record and the row cache as js/traffic.js keeps them.
const UTC_DAY = new Date(FIXED_NOW).toISOString().slice(0, 10);
const quota = (o) => JSON.stringify(Object.assign({ v: 1, utcDate: UTC_DAY, used: 10, lastAttemptAt: FIXED_NOW - 41 * 60000, retryNotBefore: 0 }, o));
const cache = (at) => JSON.stringify({ v: 1, rows: trafficFixture().map((a) => { const r = a.routes[0];
  return { data: { travel: r.duration, free: r.duration_typical, delay: Math.max(r.duration - r.duration_typical, 0), length: r.distance }, updatedAt: at, error: null }; }),
  failed: false, problem: null, attemptAt: at });
const stored = (q, c) => 'localStorage.setItem("tt-quota", ' + JSON.stringify(q) + ');' + (c ? 'localStorage.setItem("tt-cache", ' + JSON.stringify(c) + ');' : '');
const head = (p) => p.evaluate(() => [document.getElementById('traffic-status').textContent, document.getElementById('traffic-note').textContent,
  (document.querySelector('#screen-traffic .empty-text') || {}).textContent || '', document.querySelectorAll('.tw .tw-time:not(.is-none)').length]);

test('FB5C-7: the header copy — updating, stale with its age, future-dated data, the daily cap, storage paused', async () => {
  const cases = [
    ['cached rows show at once; ◀ ▶ open sends; while in flight «Обновляется… · данные от»', { traffic: () => ({ hang: true }), init: stored(quota({}), cache(FIXED_NOW - 41 * 60000)) },
      1, ['Обновляется… · данные от 19:51', '', '', 10]],
    ['the update fails: stale with the time and the age', { traffic: () => ({ status: 503, body: '' }), init: stored(quota({}), cache(FIXED_NOW - 41 * 60000)) },
      1, ['Данные устарели · обновлено 19:51 · 41 мин назад', '', '', 10]],
    ['future-dated data: no negative age; the attempt time rebased, nothing sent', { traffic: 'ok', init: stored(quota({ lastAttemptAt: FIXED_NOW + 3600000 }), cache(FIXED_NOW + 3600000)) },
      0, ['Данные устарели · время данных требует проверки', '', '', 10]],
    ['the daily cap: nothing sent; the data line stays, the cap below it', { traffic: 'ok', init: stored(quota({ used: 3000 }), cache(FIXED_NOW - 41 * 60000)) },
      0, ['Данные устарели · обновлено 19:51 · 41 мин назад', 'Дневной лимит запросов пробок исчерпан · обновление после 30.10 02:00', '', 10]],
    ['the daily cap with no cache: the card says it', { traffic: 'ok', init: stored(quota({ used: 3000 })) },
      0, ['', '', 'Дневной лимит запросов пробок исчерпан · обновление после 30.10 02:00', 0]],
    ['a corrupt counter: paused, nothing sent', { traffic: 'ok', init: 'localStorage.setItem("tt-quota", "{used:");' },
      0, ['', '', 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов', 0]],
    ['a corrupt counter over cached rows: the data line stays, the pause below it', { traffic: 'ok', init: 'localStorage.setItem("tt-quota", "{used:");localStorage.setItem("tt-cache", ' + JSON.stringify(cache(FIXED_NOW - 41 * 60000)) + ');' },
      0, ['Данные устарели · обновлено 19:51 · 41 мин назад', 'Обновления пробок приостановлены: не удалось проверить или сохранить счётчик запросов', '', 10]]
  ];
  for (const [name, o, rounds, want] of cases) {
    const app = await openApp({ ...QUIET, configure: KEY, ...o });
    try {
      await ready(app);
      const p = app.page;
      await toTraffic(p);
      await wait(900);
      assert.equal(app.requests.traffic.filter((r) => r.method === 'GET').length, rounds * 10, name + ': rounds of ten GETs');
      assert.deepEqual(await head(p), want, name);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), [], name);
      assert.deepEqual((await p.evaluate(legibility, '#screen-traffic *')).bad, [], name);
    } finally { await app.close(); }
  }
});

// FB5D-R4: the header reserves its two lines — the status line stays on the title's line whether or not a note is
// under it (no jump), and the status line and its note stay inside the header's own box (no overflow).
test('FB5D-R4: the traffic header — the status line on the title line with and without the note, both inside the header', async () => {
  const geo = (p) => p.evaluate(() => { const b = (s) => { const r = document.querySelector('#screen-traffic ' + s).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
    return { head: b('.screen-head'), title: b('.screen-title'), side: b('.head-side'), status: b('.screen-status'), note: b('.status-note'),
      noteText: document.getElementById('traffic-note').textContent, col: b('.tcol-title') }; });
  const seen = {};
  for (const [name, init] of [['fresh', ''], ['paused', 'localStorage.setItem("tt-quota", "{used:");localStorage.setItem("tt-cache", ' + JSON.stringify(cache(FIXED_NOW - 41 * 60000)) + ');']]) {
    const app = await openApp({ ...QUIET, configure: KEY, traffic: 'ok', init });
    try {
      await ready(app);
      await toTraffic(app.page);
      await wait(900);
      seen[name] = await geo(app.page);
      assert.deepEqual(clean(await app.page.evaluate(measure, '#screen-traffic *')), [], name);
    } finally { await app.close(); }
  }
  const { fresh, paused } = seen;
  assert.equal(fresh.noteText, '');
  assert.ok(paused.noteText.length > 0, 'the pause note is on');
  assert.deepEqual([paused.status[1], paused.status[3]], [fresh.status[1], fresh.status[3]], 'no jump when the note appears');
  const mid = (b) => (b[1] + b[3]) / 2;
  assert.ok(Math.abs(mid(fresh.status) - mid(fresh.title)) <= 1, 'the status line centred on the title line: ' + fresh.status + ' / ' + fresh.title);
  for (const [n, box] of [['side', paused.side], ['status', paused.status], ['note', paused.note]])
    assert.ok(box[1] >= paused.head[1] - 0.5 && box[3] <= paused.head[3] + 0.5, n + ' inside the header ' + box + ' / ' + paused.head);
  assert.ok(paused.note[1] >= paused.status[3] - 0.5 && paused.note[3] <= paused.col[1] + 0.5, 'the note under the status line, above the columns');
  assert.deepEqual([paused.col[1], paused.title[1]], [fresh.col[1], fresh.title[1]], 'the columns and the title do not move');
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
    assert.deepEqual(await dots(p), dotsAt(0), 'rotation held while the alert is up');
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
    assert.deepEqual(await dots(p), dotsAt(0), 'still on the first screen: the rotation was held');
    await wait(1400);
    assert.deepEqual(await dots(p), dotsAt(1), 'rotation resumed one interval after the alert');
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
  const hostile = '<?xml version="1.0"?><rss version="2.0"><channel><item><title>&amp;lt;img src=x onerror="window.__pwn=1"&amp;gt; כותרת</title>' +
    '<link>https://www.newsru.co.il/x/1</link><pubDate>Thu, 29 Oct 2026 20:30:00 +0200</pubDate><description>&amp;lt;b&amp;gt;מודגש&amp;lt;/b&amp;gt;</description></item></channel></rss>';
  const alert = JSON.stringify({ id: '1', cat: '1', title: '<img src=x onerror="window.__pwn=2">התרעה', data: ['רחובות'], desc: '<b onmouseover="window.__pwn=3">הנחיה</b>' });
  const app = await openApp({ news: (url) => (url.includes('section/israel') ? { status: 200, body: hostile } : { status: 503, body: '' }), alerts: () => ({ status: 200, body: alert }) });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on .alert-orig');
    await toScreen(p, 'news');
    await p.waitForSelector('.news-title');
    await wait(300);
    // FB5-NS: the two-column layout shows headlines only (no summary): the headline is the feed text that reaches the page.
    const v = await p.evaluate(() => ({ pwn: window.__pwn, title: document.querySelector('.news-title').textContent,
      orig: document.querySelector('.alert-orig').textContent, instr: document.querySelector('.alert-instr').textContent,
      elements: document.querySelectorAll('#screen-news img, #screen-news b, #alert img, #alert b').length }));
    assert.equal(v.pwn, undefined, 'no script ran');
    assert.equal(v.elements, 0, 'no element from the feed reached the page');
    assert.equal(v.title, '<img src=x onerror="window.__pwn=1"> כותרת');
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

// The owner (2026-10-30): «все экраны должны обновляться на открытии мной». A ◀ ▶ open of a screen refreshes its source
// once at once (weather for the main and Israel screens, both news feeds, the traffic batch, a new map overlay round);
// a rotation arrival does not; an open while that source's request is in flight starts nothing.
test('FB5C-OPEN: ◀ ▶ open of every screen refreshes its source once; a rotation arrival does not; in flight, nothing', async () => {
  const app = await openApp({ ...QUIET, configure: KEY, traffic: 'ok', waze: 'stub' });
  try {
    await ready(app);
    const p = app.page;
    await wait(500);
    const count = () => ({ weather: app.weatherRequests.length, news: app.requests.news.filter((r) => r.method === 'GET').length,
      traffic: app.requests.traffic.filter((r) => r.method === 'GET').length / 10,
      map: app.requests.waze.filter((r) => r.url.startsWith('https://embed.waze.com/iframe?')).length });
    const boot = count();
    assert.deepEqual([boot.weather, boot.news, boot.traffic, boot.map], [1, 2, 0, 0], 'boot: the map page is not loaded');
    const step = async (code) => { await press(p, code); await wait(800); return count(); };
    let c = await step(RIGHT);                                         // Israel
    assert.deepEqual([c.weather, c.news], [2, 2], '◀ ▶ to the Israel weather: one weather request');
    c = await step(RIGHT);                                             // news
    assert.deepEqual([c.weather, c.news], [2, 4], '◀ ▶ to the news: both feeds once');
    c = await step(RIGHT);                                             // traffic
    assert.equal(c.traffic, 1, '◀ ▶ to traffic: one batch');
    c = await step(RIGHT);                                             // map
    assert.equal(c.map, 1, 'first map visit: the Waze page, once');
    c = await step(LEFT);                                              // traffic again, seconds later
    assert.equal(c.traffic, 2, '◀ ▶ back to traffic: one more batch, whatever its age');
    c = await step(RIGHT);                                             // map again
    assert.equal(c.map, 2, '◀ ▶ back to the map: the page reloaded once');
    c = await step(RIGHT);                                             // main
    assert.deepEqual([c.weather, c.news, c.traffic, c.map], [3, 4, 2, 2], '◀ ▶ to the main screen: one weather request; the map left loaded, not reloaded');
  } finally { await app.close(); }
  // the rotation moves on by itself: no refresh on arrival
  const rot = await openApp({ ...QUIET, configure: (c) => { c.rotation.intervalMs = 700; } });
  try {
    await ready(rot);
    await wait(2600);                                                  // main → Israel → news (→ traffic)
    assert.deepEqual([rot.weatherRequests.length, rot.requests.news.filter((r) => r.method === 'GET').length], [1, 2], 'rotation arrivals: nothing');
  } finally { await rot.close(); }
  // an open while the feeds are still loading starts nothing
  const busy = await openApp({ alerts: 'empty-bom.txt', news: () => ({ hang: true }) });
  try {
    await ready(busy);
    const p = busy.page;
    await press(p, RIGHT); await press(p, RIGHT); await wait(500);
    assert.equal(busy.requests.news.filter((r) => r.method === 'GET').length, 2, 'news in flight: no second round');
  } finally { await busy.close(); }
});
