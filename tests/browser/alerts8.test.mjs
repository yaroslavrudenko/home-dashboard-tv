// Batch 8 at the TV's 1920×1080 in headless Chrome: the Hebrew original in the alert overlay (A1), the alert preview on
// the blue key (A2), the time of the last good answer in the "no connection" line (A3), the Alerts screen with the
// recent alerts in Israel (B1) and the refresh of the screen on view after a language change (B2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, RIGHT = 39, DOWN = 40, BACK = 10009, BLUE = 406;
const QUIET = { news: 'ok', alerts: 'empty-bom.txt', history: 'history.json' };
const KEY = (c) => { c.traffic.token = 'pk.FIXTURE123'; };
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
const gets = (list) => list.filter((r) => r.method === 'GET').length;

// A1: a long Hebrew title and instruction with figures, in a language that shows the original under the category.
const LONG = JSON.stringify({ id: '9', cat: '1', title: 'התרעה מיוחדת באזור 3 עד השעה 21:30 לפי הנחיות פיקוד העורף מספר 12', data: ['רחובות'],
  desc: 'הישארו בקרבת מרחב מוגן במשך 15 דקות ועקבו אחר ההנחיות בערוץ 14' });
test('A1: the Hebrew original line is right to left (block direction, lang he), wraps, and nothing in the overlay overflows — ru, uk, he', async () => {
  for (const lang of ['ru', 'uk', 'he']) {
    const app = await openApp({ ...QUIET, lang, alerts: () => ({ status: 200, body: LONG }) });
    try {
      const p = app.page;
      await p.waitForSelector('#alert.is-on .alert-kind');
      await p.evaluate(() => document.fonts.ready);
      await wait(300);
      const v = await p.evaluate(() => {
        const o = document.querySelector('.alert-orig'), i = document.querySelector('.alert-instr');
        return { orig: o && [o.getAttribute('dir'), o.getAttribute('lang'), getComputedStyle(o).direction, o.children.length],
          instr: [i.getAttribute('dir'), getComputedStyle(i).direction] };
      });
      if (lang === 'he') assert.equal(v.orig, null, 'Hebrew: the feed\'s words are the main line, no second copy');
      else {
        assert.deepEqual(v.orig, ['rtl', 'he', 'rtl', 0], lang + ': the line itself is the right-to-left block, no inline box inside it');
        assert.deepEqual(v.instr, ['rtl', 'rtl'], lang + ': the untranslated Hebrew instruction is right to left too');
      }
      assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), [], lang);
    } finally { await app.close(); }
  }
});

// A2: the blue key shows the overlay on a sample for previewMs, clearly marked; any key ends it (and does nothing else).
test('A2: the blue key previews the alert with a «not a real alert» banner, ends by itself, Back ends it without leaving the app', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.alerts.previewMs = 1200; } });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await press(p, BLUE), true, 'the blue key is consumed');
    await p.waitForSelector('#alert.is-on .alert-preview', { timeout: 2000 });
    const v = await p.evaluate(() => ({ banner: document.querySelector('.alert-preview').textContent, kind: document.querySelector('.alert-kind').textContent,
      areas: document.querySelector('.alert-areas').textContent }));
    assert.deepEqual(v, { banner: 'Проверка тревоги — это не настоящая тревога', kind: 'Ракетный обстрел', areas: 'Реховот' });
    assert.deepEqual(clean(await p.evaluate(measure, '#alert *')), []);
    await p.waitForFunction(() => document.getElementById('alert').className === 'alert', { timeout: 3000, polling: 50 });
    // again, ended by Back: the app stays (Back would exit it)
    await press(p, BLUE);
    await p.waitForSelector('#alert.is-on .alert-preview');
    await p.evaluate(() => { window.tizen = { application: { getCurrentApplication: () => ({ exit: () => { window.__exited = true; } }) } }; });
    assert.equal(await press(p, BACK), true);
    await wait(100);
    assert.deepEqual([await p.$eval('#alert', (e) => e.className), await p.evaluate(() => window.__exited)], ['alert', undefined]);
    // any other key ends it too, and only ends it: ◀ does not switch the screen (batch 9: the preview is on the Alerts screen)
    await press(p, BLUE);
    await p.waitForSelector('#alert.is-on .alert-preview');
    await press(p, LEFT);
    await wait(100);
    assert.deepEqual([await p.$eval('#alert', (e) => e.className), await p.evaluate(() => document.querySelector('.screen.is-active').id)], ['alert', 'screen-alerts']);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('A2: the preview banner in Hebrew and Ukrainian', async () => {
  for (const [lang, text] of [['he', 'בדיקת התרעה — זו אינה התרעה אמיתית'], ['uk', 'Перевірка тривоги — це не справжня тривога']]) {
    const app = await openApp({ ...QUIET, lang });
    try {
      await ready(app);
      await press(app.page, BLUE);
      await app.page.waitForSelector('#alert.is-on .alert-preview');
      assert.equal(await app.page.$eval('.alert-preview', (e) => e.textContent), text);
      assert.deepEqual(clean(await app.page.evaluate(measure, '#alert *')), [], lang);
    } finally { await app.close(); }
  }
});

test('A2: a real alert during the preview takes over at once (no banner) and stays after the preview time; the blue key never covers a real alert', async () => {
  let real = false;
  const app = await openApp({ news: 'ok', history: 'history.json', configure: (c) => { c.alerts.pollMs = 100; c.alerts.previewMs = 1500; },
    alerts: () => ({ status: 200, body: real ? '{"id":"1","cat":"1","title":"חדירת מחבלים","data":["רחובות"],"desc":""}' : '﻿\r\n' }) });
  try {
    await ready(app);
    const p = app.page;
    await press(p, BLUE);
    await p.waitForSelector('#alert.is-on .alert-preview');
    real = true;
    await p.waitForFunction(() => document.querySelector('#alert .alert-kind').textContent === 'Проникновение террористов', { timeout: 3000, polling: 50 });
    assert.equal(await p.$('.alert-preview'), null, 'the real alert carries no preview banner');
    await wait(1800);
    assert.equal(await p.$eval('#alert', (e) => e.className), 'alert is-on', 'the preview ending never hides the real alert');
    await press(p, BLUE);
    await wait(200);
    assert.deepEqual([await p.$('.alert-preview'), await p.$eval('.alert-kind', (e) => e.textContent)], [null, 'Проникновение террористов']);
  } finally { await app.close(); }
});

// A3: the corner says when the feed last answered.
test('A3: the feed lost after good answers: the corner says «Тревоги: нет связи · последний ответ 20:32» (he, uk too)', async () => {
  for (const [lang, text] of [['ru', 'Тревоги: нет связи · последний ответ 20:32'], ['he', 'התרעות: אין חיבור · תשובה אחרונה ב־20:32'], ['uk', 'Тривоги: немає зв’язку · остання відповідь 20:32']]) {
    const app = await openApp({ news: 'ok', lang, configure: (c) => { c.alerts.pollMs = 100; },
      alerts: (n) => (n <= 2 ? { status: 200, body: '﻿\r\n' } : { status: 503, body: '' }) });
    try {
      await ready(app);
      await app.page.waitForSelector('.alerts-offline', { timeout: 5000 });
      assert.equal(await app.page.$eval('#corner', (e) => e.textContent), text);
      assert.deepEqual(clean(await app.page.evaluate(measure, '#corner *')), [], lang);
    } finally { await app.close(); }
  }
});

// B1: the last screen (the sixth until batch 11 put the Markets screen after the news).
const ALERTS_VIEW = () => {
  const t = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
  return { title: t('#screen-alerts .screen-title'), home: t('.al-home'), near: t('.al-near'),
    rows: [...document.querySelectorAll('.al-row')].map((r) => [...r.children].map((c) => c.textContent)), empty: t('.al-recent-empty') };
};
test('B1: the Alerts screen is the eighth (◀ from the main screen), quiet: «Тревог нет · Реховот», checked time, nearby, the recorded recent alerts', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    assert.equal((await p.$$('.dot')).length, 8, 'eight page dots (batch 11: Markets; batch 12: Shabbat)');
    await wait(400);
    assert.equal(gets(app.requests.history), 0, 'nothing asked while the screen is not on view');
    await press(p, LEFT);
    await p.waitForSelector('.al-row', { timeout: 5000 });
    await wait(700);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-alerts');
    assert.equal(gets(app.requests.history), 1, 'one request on the explicit open');
    const v = await p.evaluate(ALERTS_VIEW);
    assert.equal(v.title, 'Тревоги');
    assert.match(v.home, /^Тревог нетРеховотПроверено в 20:3\d$/);
    assert.match(v.near, /^РядомРядом тревог нет/);
    // L13 (batch 16): the column labels first; the two areas no catalogue city covers stay Hebrew, and the label says so
    assert.deepEqual(v.rows, [['Время', 'Тревога', 'Районы (на иврите)'], ['19.10 19:38', 'Проникновение террористов', 'אביתר'], ['10.10 19:57', 'Вражеский беспилотник', 'ערב אל עראמשה']]);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-alerts *')), []);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B1: the Alerts screen in Hebrew and Ukrainian, nothing cut; a quiet week says so', async () => {
  for (const [lang, title, quiet] of [['he', 'התרעות', /^אין התרעותרחובות/], ['uk', 'Тривоги', /^Тривог немаєРеховот/]]) {
    const app = await openApp({ ...QUIET, lang });
    try {
      await ready(app);
      await press(app.page, LEFT);
      await app.page.waitForSelector('.al-row', { timeout: 5000 });
      await wait(700);
      const v = await app.page.evaluate(ALERTS_VIEW);
      assert.equal(v.title, title);
      assert.match(v.home, quiet);
      assert.equal(v.rows.length, 3, 'the column labels and the two alerts');
      assert.deepEqual(clean(await app.page.evaluate(measure, '#screen-alerts *')), [], lang);
    } finally { await app.close(); }
  }
  const none = await openApp({ ...QUIET, history: 'history-empty.json' });
  try {
    await ready(none);
    await press(none.page, LEFT);
    await none.page.waitForSelector('.al-recent-empty', { timeout: 5000 });
    assert.equal((await none.page.evaluate(ALERTS_VIEW)).empty, 'За последние 7 дней тревог не было');
  } finally { await none.close(); }
});

test('B1: with an alert up the Alerts screen opens by itself and the alert fills it; a lost feed never reads «Тревог нет»', async () => {
  const app = await openApp({ news: 'ok', history: 'history.json', alerts: 'rehovot.json' });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForSelector('#alert.is-on');
    await wait(900);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-alerts');
    assert.match((await p.evaluate(ALERTS_VIEW)).home, /^Ракетный обстрелРеховот/);
    assert.equal(await p.$eval('#alert', (e) => e.className), 'alert is-on', 'the alert covers this screen');
  } finally { await app.close(); }
  const lost = await openApp({ news: 'ok', history: 'history.json', alerts: 'fail', configure: (c) => { c.alerts.pollMs = 100; } });
  try {
    await ready(lost);
    await lost.page.waitForSelector('.alerts-offline', { timeout: 5000 });
    await press(lost.page, LEFT);
    await wait(900);
    const home = (await lost.page.evaluate(ALERTS_VIEW)).home;
    assert.ok(!/Тревог нет/.test(home), home);
    assert.match(home, /нет связи/);
  } finally { await lost.close(); }
});

// B2: the owner: a language change refreshes the screen on view like an explicit open.
test('B2: a language change on the traffic, map and Alerts screens refreshes that screen once 600 ms after the last press', async () => {
  const app = await openApp({ ...QUIET, configure: KEY, traffic: 'ok', map: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    const count = () => ({ traffic: gets(app.requests.traffic) / 10, map: app.requests.map.length, history: gets(app.requests.history), weather: app.weatherRequests.length });
    await press(p, LEFT); await wait(900);                       // Alerts
    let c0 = count();
    for (let i = 0; i < 4; i++) { await press(p, DOWN); await wait(80); }
    await wait(400);
    assert.equal(count().history, c0.history, 'nothing before the presses settle');
    await wait(500);
    assert.equal(count().history, c0.history + 1, 'one history request after the presses settle');
    await press(p, LEFT); await wait(900);                       // map
    c0 = count();
    await press(p, DOWN); await wait(1100);
    assert.equal(count().map, c0.map + 1, 'the map: one new image');
    await press(p, LEFT); await wait(900);                       // traffic
    c0 = count();
    await press(p, DOWN); await wait(1100);
    assert.equal(count().traffic, c0.traffic + 1, 'traffic: one batch');
    assert.equal(count().weather, c0.weather, 'no weather request off the weather screens');
  } finally { await app.close(); }
});
