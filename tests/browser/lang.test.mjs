// Batch 6 (the owner's top priority): the interface language — Русский / עברית / Українська — at the TV's 1920×1080 in
// headless Chrome. One remote key (yellow, 405) cycles ru → he → uk → ru and is remembered; the language picks the news
// sources (L2); Hebrew mirrors the whole layout with figures kept left to right (L3); alerts speak the language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure, newsSource } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const YELLOW = 405, RIGHT = 39, LEFT = 37;
const SCREENS = ['main', 'israel', 'news', 'traffic', 'map'];
const TOKEN = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; };
const QUIET = { news: 'ok', alerts: 'empty-bom.txt', traffic: 'ok', waze: 'stub', configure: TOKEN };
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(300); }
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const state = (p) => p.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, stored: localStorage.getItem('homedash.lang'),
  toast: [document.getElementById('toast').className, document.getElementById('toast').textContent],
  titles: [...document.querySelectorAll('.screen-title')].map((t) => t.textContent), israel: document.querySelector('#clock-israel .clock-city').textContent }));
const feedsOf = (app) => app.requests.news.map((r) => newsSource(r.url));
const counts = (app) => ({ weather: app.weatherRequests.length, news: app.requests.news.length, traffic: app.requests.traffic.length, waze: app.requests.waze.length });

test('L1: the yellow key cycles Русский → עברית → Українська → Русский at once on every screen, with the toast, and remembers it', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    let s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.titles, s.israel], ['ru', 'ltr', null, ['Погода в Израиле', 'Новости', 'Пробки', 'Карта пробок'], 'Израиль']);
    assert.equal(await press(p, YELLOW), true, 'the key is the app\'s');
    s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.toast, s.titles, s.israel],
      ['he', 'rtl', 'he', ['toast is-on', 'עברית'], ['מזג האוויר בישראל', 'חדשות', 'תנועה', 'מפת תנועה'], 'ישראל']);
    await press(p, YELLOW);
    s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.toast, s.titles, s.israel],
      ['uk', 'ltr', 'uk', ['toast is-on', 'Українська'], ['Погода в Ізраїлі', 'Новини', 'Затори', 'Карта заторів'], 'Ізраїль']);
    await press(p, YELLOW);
    s = await state(p);
    assert.deepEqual([s.lang, s.stored, s.toast[1], s.israel], ['ru', 'ru', 'Русский', 'Израиль']);
    await wait(1900);
    assert.equal((await state(p)).toast[0], 'toast', 'the toast is gone after a moment');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('L1/L2: a switch asks the network for the new language\'s two feeds and nothing else — no weather, traffic or map request', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    await press(p, LEFT); await wait(500);         // ◀ the map
    await press(p, LEFT); await wait(800);         // ◀ traffic: the map and the routes loaded once
    assert.deepEqual(feedsOf(app), ['newsru', 'newsrufin'], 'Russian at boot: NEWSru only');
    assert.ok(counts(app).traffic === 10 && counts(app).waze >= 1, JSON.stringify(counts(app)));
    const before = counts(app);
    await press(p, YELLOW);
    await wait(1500);
    const after = counts(app);
    assert.deepEqual([after.weather, after.traffic, after.waze], [before.weather, before.traffic, before.waze], 'no other request');
    assert.deepEqual(feedsOf(app).slice(before.news), ['ynet', 'globes'], 'Hebrew: Ynet and Globes, at once');
    await press(p, YELLOW); await wait(1500);
    assert.deepEqual(feedsOf(app).slice(before.news + 2), ['pravda', 'epravda'], 'Ukrainian: Ukrainska Pravda and Ekonomichna Pravda');
    assert.deepEqual([counts(app).weather, counts(app).traffic, counts(app).waze], [before.weather, before.traffic, before.waze]);
  } finally { await app.close(); }
});

test('L2: the news screen in each language — Russian NEWSru, Hebrew Ynet + Globes right to left, Ukrainian «Україна» + «Економіка»', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    for (let i = 0; i < 2; i++) await press(p, RIGHT);
    await p.waitForSelector('.news-title');
    const cols = () => p.evaluate(() => [...document.querySelectorAll('.news-col')].map((c) => [c.querySelector('.news-col-title').textContent,
      c.querySelector('.src-name').textContent, c.querySelectorAll('.news-title').length, getComputedStyle(c).direction, Math.round(c.getBoundingClientRect().left)]));
    const ru = await cols();
    assert.deepEqual(ru.map((c) => c.slice(0, 4)), [['Израиль', 'NEWSru', 5, 'ltr'], ['Экономика', 'NEWSru', 5, 'ltr']]);
    assert.ok(ru[0][4] < ru[1][4], '«Израиль» on the left');
    await press(p, YELLOW);
    await p.waitForFunction(() => document.querySelectorAll('.news-title').length === 10 && /[֐-׿]/.test(document.querySelector('.news-title').textContent), { timeout: 8000, polling: 50 });
    const he = await cols();
    assert.deepEqual(he.map((c) => c.slice(0, 4)), [['ישראל', 'Ynet', 5, 'rtl'], ['כלכלה', 'Globes', 5, 'rtl']]);
    assert.ok(he[0][4] > he[1][4], '«ישראל» on the right: mirrored');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
    await press(p, YELLOW);
    await p.waitForFunction(() => document.querySelectorAll('.news-title').length === 10 && /[іїєґ]/i.test(document.querySelector('.news-title').textContent), { timeout: 8000, polling: 50 });
    const uk = await cols();
    assert.deepEqual(uk.map((c) => c.slice(0, 4)), [['Україна', 'Українська правда', 5, 'ltr'], ['Економіка', 'Економічна правда', 5, 'ltr']]);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-news *')), []);
  } finally { await app.close(); }
});

test('L1: the remembered language wins at start (its feeds only); an unknown stored value falls back to Config.lang', async () => {
  const app = await openApp({ ...QUIET, init: 'localStorage.setItem("homedash.lang", "uk");' });
  try {
    await ready(app);
    assert.deepEqual([...Object.values(await app.page.evaluate(() => ({ l: document.documentElement.lang, d: document.documentElement.dir })))], ['uk', 'ltr']);
    assert.equal(await app.page.$eval('#clock-ukraine .clock-city', (e) => e.textContent), 'Україна');
    assert.deepEqual(feedsOf(app), ['pravda', 'epravda'], 'only the Ukrainian feeds');
  } finally { await app.close(); }
  const he = await openApp({ ...QUIET, init: 'localStorage.setItem("homedash.lang", "he");' });
  try {
    await ready(he);
    assert.equal(await he.page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.deepEqual(feedsOf(he), ['ynet', 'globes']);
  } finally { await he.close(); }
  const bad = await openApp({ ...QUIET, init: 'localStorage.setItem("homedash.lang", "xx");' });
  try {
    await ready(bad);
    assert.equal(await bad.page.evaluate(() => document.documentElement.lang), 'ru');
  } finally { await bad.close(); }
});

test('L3: Hebrew mirrors the layout — Israel\'s clock on the right, the status line on the left, bars from the right; figures stay left to right; page dots and ◀ ▶ stay physical', async () => {
  const app = await openApp({ ...QUIET, lang: 'he' });
  try {
    await ready(app);
    const p = app.page;
    const v = await p.evaluate(() => {
      const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
      const temp = document.querySelector('.now-temp');
      return { clocks: ['#clock-israel', '#clock-ukraine', '#clock-sydney'].map(left), now: left('#now'), daily: left('#daily'),
        status: Math.round(document.getElementById('status').getBoundingClientRect().left - document.querySelector('.hourly-card').getBoundingClientRect().left),
        range: getComputedStyle(document.querySelector('.range')).transform, dots: getComputedStyle(document.getElementById('dots')).direction,
        temp: temp.textContent, tempW: temp.getBoundingClientRect().width, date: document.querySelector('#clock-israel .clock-date').textContent,
        dayName: document.querySelector('.day-name').textContent, timeDir: getComputedStyle(document.querySelector('.clock-time')).direction };
    });
    assert.ok(v.clocks[0] > v.clocks[1] && v.clocks[1] > v.clocks[2], 'right to left: Israel, Ukraine, Sydney ' + v.clocks);
    assert.ok(v.daily < v.now, 'the 7-day card on the left');
    assert.ok(v.status < 100, 'the status line at the start (left) of the hourly card: ' + v.status);
    assert.equal(v.range, 'matrix(-1, 0, 0, 1, 0, 0)', 'the range bars fill from the right');
    assert.equal(v.dots, 'ltr', 'page dots physical');
    assert.match(v.temp, /^‪−?\d+°‬$/, 'the temperature kept left to right: ' + JSON.stringify(v.temp));
    assert.match(v.date, /^יום [א-ת]+, \d+ ב[א-ת]+$/);
    assert.equal(v.dayName, 'היום');
    assert.equal(v.timeDir, 'ltr', '"≈" stays before the time');
    // ◀ is still the previous screen on the left: from the main screen ◀ opens the map (the last), ▶ the Israel weather
    await press(p, LEFT); await wait(400);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-map');
    await press(p, RIGHT); await press(p, RIGHT); await wait(400);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-israel');
    assert.deepEqual(await p.$$eval('.dot', (d) => d.map((e) => e.className)), ['dot', 'dot is-on', 'dot', 'dot', 'dot'], 'the second dot from the left');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

const ALERT = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', data: ['רחובות', 'נס ציונה'], desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות' });
const ODD = JSON.stringify({ id: '2', cat: '1', title: 'התרעה לא מוכרת', data: ['רחובות'], desc: 'הנחיה מיוחדת' });
const ALERT_VIEW = () => ({ kind: document.querySelector('.alert-kind').textContent, orig: document.querySelectorAll('.alert-orig').length,
  areas: [...document.querySelectorAll('.alert-area')].map((e) => e.textContent), instr: document.querySelector('.alert-instr').textContent,
  since: document.querySelector('.alert-since').textContent });

test('L3: the alert in each language — Hebrew: the feed\'s own words as the main line, no second translation; Ukrainian: its own words, the Oref original as in Russian', async () => {
  const app = await openApp({ ...QUIET, alerts: () => ({ status: 200, body: ALERT }) });
  try {
    await app.page.waitForSelector('#alert.is-on .alert-kind');
    await wait(300);
    const p = app.page;
    assert.deepEqual(await p.evaluate(ALERT_VIEW), { kind: 'Ракетный обстрел', orig: 0, areas: ['Реховот'], instr: 'Войдите в защищённое помещение и оставайтесь там 10 мин', since: 'С 20:32' });
    await press(p, YELLOW); await wait(300);
    assert.deepEqual(await p.evaluate(ALERT_VIEW), { kind: 'ירי רקטות וטילים', orig: 0, areas: ['רחובות'], instr: 'היכנסו למרחב המוגן ושהו בו 10 דקות', since: 'מ־20:32' });
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    await press(p, YELLOW); await wait(300);
    assert.deepEqual(await p.evaluate(ALERT_VIEW), { kind: 'Ракетний обстріл', orig: 0, areas: ['Реховот'], instr: 'Увійдіть до захищеного приміщення й залишайтеся там 10 хв', since: 'З 20:32' });
  } finally { await app.close(); }
  const odd = await openApp({ ...QUIET, lang: 'uk', alerts: () => ({ status: 200, body: ODD }) });
  try {
    await odd.page.waitForSelector('#alert.is-on .alert-kind');
    await wait(300);
    const v = await odd.page.evaluate(ALERT_VIEW);
    assert.deepEqual([v.kind, v.orig, v.instr], ['Тривога', 1, 'הנחיה מיוחדת'], 'an unknown kind: the Ukrainian word, the Hebrew original under it, as in Russian');
  } finally { await odd.close(); }
  // Hebrew with a title the screen has no category for: the feed's title itself is the main line — never «התרעה» over it
  const heOdd = await openApp({ ...QUIET, lang: 'he', alerts: () => ({ status: 200, body: ODD }) });
  try {
    await heOdd.page.waitForSelector('#alert.is-on .alert-kind');
    await wait(300);
    const v = await heOdd.page.evaluate(ALERT_VIEW);
    assert.deepEqual([v.kind, v.orig, v.instr, v.areas], ['התרעה לא מוכרת', 0, 'הנחיה מיוחדת', ['רחובות']]);
  } finally { await heOdd.close(); }
});

test('L3: the quiet "alert nearby" corner names the places in the language (Ukrainian spelling) and sits on the left in Hebrew', async () => {
  const NEAR = JSON.stringify({ id: '3', cat: '1', title: 'ירי רקטות וטילים', data: ['נס ציונה', 'קריית עקרון'], desc: '' });
  const app = await openApp({ ...QUIET, lang: 'uk', alerts: () => ({ status: 200, body: NEAR }) });
  try {
    await app.page.waitForFunction(() => document.querySelector('.nearby'), { timeout: 8000, polling: 50 });
    assert.equal(await app.page.$eval('.nearby', (e) => e.textContent), 'Тривога поруч: Нес-Ціона, Кір’ят-Екрон');
    await press(app.page, YELLOW); await press(app.page, YELLOW); await wait(300);   // uk → ru → he
    await wait(200);
    const v = await app.page.evaluate(() => ({ text: document.querySelector('.nearby').textContent, l: Math.round(document.getElementById('corner').getBoundingClientRect().left) }));
    assert.equal(v.text, 'התרעה בסביבה: נס ציונה, קריית עקרון');
    assert.equal(v.l, 64, 'mirrored: the left half of the bottom margin');
  } finally { await app.close(); }
});

test('L3: the Israel weather sub-line in Ukrainian wraps between its parts, never inside «км/год»', async () => {
  const app = await openApp({ ...QUIET, lang: 'uk' });
  try {
    await ready(app);
    await press(app.page, RIGHT); await wait(900);
    const v = await app.page.evaluate(() => [...document.querySelectorAll('.region-part')].map((e) => [e.textContent, e.getClientRects().length]));
    assert.ok(v.length >= 6, JSON.stringify(v));
    for (const [text, lines] of v) assert.equal(lines, 1, text + ' broke across lines');
    assert.ok(v.some(([t]) => /км\/год$/.test(t)));
  } finally { await app.close(); }
});

test('L3: every screen in every language: nothing cut, outside its card or off the screen', async () => {
  for (const lang of ['ru', 'he', 'uk']) {
    const app = await openApp({ ...QUIET, lang });
    try {
      await ready(app);
      const p = app.page;
      for (let i = 0; i < SCREENS.length; i++) {
        if (i) { await press(p, RIGHT); await wait(900); }
        if (SCREENS[i] === 'news') await p.waitForSelector('.news-title');
        if (SCREENS[i] === 'traffic') await p.waitForSelector('.tw-time');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-' + SCREENS[i] + ' *')), [], lang + ' ' + SCREENS[i]);
      }
      assert.deepEqual(app.errors, [], lang);
    } finally { await app.close(); }
  }
});
