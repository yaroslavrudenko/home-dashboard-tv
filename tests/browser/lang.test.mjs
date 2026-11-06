// Batch 6 (the owner's top priority): the interface language — Русский / עברית / Українська — at the TV's 1920×1080 in
// headless Chrome. One remote key (yellow, 405) cycles ru → he → uk → ru and is remembered; the language picks the news
// sources (L2); Hebrew mirrors the whole layout with figures kept left to right (L3); alerts speak the language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, measure, newsSource, withoutHeadlineClamp, TRAFFIC_ROUTES, anyPlaceWeather } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const YELLOW = 405, RIGHT = 39, LEFT = 37;
const SCREENS = ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'];   // batch 11: Markets after the news; batch 12: Shabbat after the markets
const TOKEN = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; };
const QUIET = { news: 'ok', alerts: 'empty-bom.txt', traffic: 'ok', map: 'ok', configure: TOKEN };
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(300); }
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const state = (p) => p.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, stored: localStorage.getItem('homedash.lang'),
  toast: [document.getElementById('toast').className, document.getElementById('toast').textContent],
  titles: [...document.querySelectorAll('.screen-title')].map((t) => t.textContent), israel: document.querySelector('#clock-israel .clock-city').textContent }));
const feedsOf = (app) => app.requests.news.map((r) => newsSource(r.url));
const counts = (app) => ({ weather: app.weatherRequests.length, news: app.requests.news.length, traffic: app.requests.traffic.length, map: app.requests.map.length });

test('L1: the yellow key cycles Русский → עברית → Українська → Русский at once on every screen, with the toast, and remembers it', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    let s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.titles, s.israel], ['ru', 'ltr', null, ['Погода в Израиле', 'Новости', 'Рынки', 'Шабат и праздники', 'Пробки', 'Карта пробок', 'Тревоги'], 'Израиль']);
    assert.equal(await press(p, YELLOW), true, 'the key is the app\'s');
    s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.toast, s.titles, s.israel],
      ['he', 'rtl', 'he', ['toast is-on', 'עברית'], ['מזג האוויר בישראל', 'חדשות', 'שווקים', 'שבת וחגים', 'תנועה', 'מפת תנועה', 'התרעות'], 'ישראל']);
    await press(p, YELLOW);
    s = await state(p);
    assert.deepEqual([s.lang, s.dir, s.stored, s.toast, s.titles, s.israel],
      ['uk', 'ltr', 'uk', ['toast is-on', 'Українська'], ['Погода в Ізраїлі', 'Новини', 'Ринки', 'Шабат і свята', 'Затори', 'Карта заторів', 'Тривоги'], 'Ізраїль']);
    await press(p, YELLOW);
    s = await state(p);
    assert.deepEqual([s.lang, s.stored, s.toast[1], s.israel], ['ru', 'ru', 'Русский', 'Израиль']);
    await wait(1900);
    assert.equal((await state(p)).toast[0], 'toast', 'the toast is gone after a moment');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// The owner (2026-10-30): «я бы хотел чтобы локализация переключалась бы по нажатию кнопок вверх и вниз».
const UP = 38, DOWN = 40;
test('L1: ▼ switches to the next language and ▲ to the previous (ru → he → uk), with the toast, at once, remembered', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page, seq = [];
    for (const k of [DOWN, DOWN, DOWN, UP, UP, UP]) { assert.equal(await press(p, k), true, 'the key is the app\'s'); const s = await state(p); seq.push([s.lang, s.stored, s.toast[1]]); }
    assert.deepEqual(seq, [['he', 'he', 'עברית'], ['uk', 'uk', 'Українська'], ['ru', 'ru', 'Русский'], ['uk', 'uk', 'Українська'], ['he', 'he', 'עברית'], ['ru', 'ru', 'Русский']]);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-main', '▲ ▼ never change the screen');
  } finally { await app.close(); }
});

test('L1/B2: a held ▼ (seven presses) redraws at once but fetches ONE news round, of the language it lands on, and ONE weather round for the screen on view, 600 ms after the last press', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page, before = app.requests.news.length, weather = app.weatherRequests.length;
    for (let i = 0; i < 7; i++) await press(p, DOWN);             // ru → he → uk → ru → he → uk → ru → he
    assert.deepEqual([(await state(p)).lang, (await state(p)).dir], ['he', 'rtl'], 'drawn at once');
    await wait(300);
    assert.equal(app.requests.news.length, before, 'nothing while the remote is still moving');
    await wait(700);
    assert.deepEqual(feedsOf(app).slice(before), ['ynet', 'globes'], 'one round, the landing language only');
    await wait(1000);
    assert.equal(app.requests.news.length, before + 2, 'and nothing more');
    assert.equal(app.weatherRequests.length, weather + 1, 'B2: the main screen on view refreshes its weather once, not per press');
  } finally { await app.close(); }
});

// B2 (the owner, 2026-10-30: «также когда я меняю локализацию»): the screen on view refreshes as if just opened.
test('L1/L2/B2: a switch asks for the new language\'s two feeds and refreshes the screen on view (traffic: one batch) — no weather or map request', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    await press(p, LEFT); await wait(500);         // ◀ the Alerts screen
    await press(p, LEFT); await wait(500);         // ◀ the map
    await press(p, LEFT); await wait(800);         // ◀ traffic: the map and the routes loaded once
    assert.deepEqual(feedsOf(app), ['newsru', 'newsrufin'], 'Russian at boot: NEWSru only');
    assert.ok(counts(app).traffic === TRAFFIC_ROUTES && counts(app).map >= 1, JSON.stringify(counts(app)));
    const before = counts(app);
    await press(p, YELLOW);
    await wait(1500);
    const after = counts(app);
    assert.deepEqual([after.weather, after.traffic, after.map], [before.weather, before.traffic + TRAFFIC_ROUTES, before.map], 'the traffic on view: one batch; nothing else');
    assert.deepEqual(feedsOf(app).slice(before.news), ['ynet', 'globes'], 'Hebrew: Ynet and Globes, at once');
    await press(p, YELLOW); await wait(1500);
    assert.deepEqual(feedsOf(app).slice(before.news + 2), ['pravda', 'epravda'], 'Ukrainian: Ukrainska Pravda and Ekonomichna Pravda');
    assert.deepEqual([counts(app).weather, counts(app).traffic, counts(app).map], [before.weather, before.traffic + 2 * TRAFFIC_ROUTES, before.map]);   // two switches: two batches
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
    assert.deepEqual(clean(withoutHeadlineClamp(await p.evaluate(measure, '#screen-news *'))), []);
    await press(p, YELLOW);
    await p.waitForFunction(() => document.querySelectorAll('.news-title').length === 10 && /[іїєґ]/i.test(document.querySelector('.news-title').textContent), { timeout: 8000, polling: 50 });
    const uk = await cols();
    assert.deepEqual(uk.map((c) => c.slice(0, 4)), [['Україна', 'Українська правда', 5, 'ltr'], ['Економіка', 'Економічна правда', 5, 'ltr']]);
    assert.deepEqual(clean(withoutHeadlineClamp(await p.evaluate(measure, '#screen-news *'))), []);
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
    // ◀ is still the previous screen on the left: from the main screen ◀ opens the Alerts screen (the last), ▶ the Israel weather
    await press(p, LEFT); await wait(400);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-alerts');
    await press(p, RIGHT); await press(p, RIGHT); await wait(400);
    assert.equal(await p.evaluate(() => document.querySelector('.screen.is-active').id), 'screen-israel');
    assert.deepEqual(await p.$$eval('.dot', (d) => d.map((e) => e.className)), SCREENS.map((_, k) => (k === 1 ? 'dot is-on' : 'dot')), 'the second dot from the left');
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
    assert.deepEqual(await p.evaluate(ALERT_VIEW), { kind: 'Ракетний обстріл', orig: 0, areas: ['Реховот'], instr: 'Увійдіть до захищеного приміщення й залишайтеся там 10 хв', since: 'Від 20:32' });   // L3: «З» read as «3»
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
        const boxes = await p.evaluate(measure, '#screen-' + SCREENS[i] + ' *'), kept = withoutHeadlineClamp(boxes);
        // D-T1 (batch 16) sees a vertical clamp too; the one allowed is a headline past three lines (the owner's «3 строки») —
        // at most one per screen in the recordings
        assert.ok(boxes.length - kept.length <= 1, lang + ': clamped headlines ' + (boxes.length - kept.length));
        assert.deepEqual(clean(kept), [], lang + ' ' + SCREENS[i]);
      }
      assert.deepEqual(app.errors, [], lang);
    } finally { await app.close(); }
  }
});

// The traffic screen drawn in a language ('en': the fallback string table, not one of Config.languages — switched after
// boot, before the screen draws), Inter loaded.
async function trafficIn(app, lang) {
  await ready(app);
  if (lang === 'en') await app.page.evaluate(() => { I18n.setLang('en'); document.documentElement.lang = 'en'; });
  for (let i = 0; i < SCREENS.indexOf('traffic'); i++) await press(app.page, RIGHT);
  await app.page.waitForSelector('.tw-time:not(.is-none)', { timeout: 15000 });
  await wait(900);
  await app.page.evaluate(() => document.fonts.ready);
}
// Per column: its left edge, the distinct end edges of the chips, the start / end edges of the times, the end edges of the
// lengths ('end': right, left in Hebrew), and how many rows take an hour or more.
const GRID = () => {
  const rtl = document.documentElement.dir === 'rtl';
  return [...document.querySelectorAll('.tcol')].map((c) => {
    const rows = [...c.querySelectorAll('.tw-row')];
    const edge = (sel, end) => [...new Set(rows.filter((r) => r.querySelector(sel)).map((r) => Math.round(r.querySelector(sel).getBoundingClientRect()[end !== rtl ? 'right' : 'left'])))];
    return { left: Math.round(c.getBoundingClientRect().left), chipEnd: edge('.chip', true), timeStart: edge('.tw-time', false), timeEnd: edge('.tw-time', true),
      kmEnd: edge('.tw-km', true), hours: rows.filter((r) => /\d\D+\d/.test(r.querySelector('.tw-time').textContent)).length };
  });
};

// D1 (review-1, 2026-11-06): chips, times and lengths stand on one grid down each column in every language, the rows of an
// hour or more («1 год 39 хв», «2 שע׳ 27 דק׳») included; the time's box is sized to the widest time the screen can show
// (0 min … 9 h 59 min) in that language.
test('L3 (D1): traffic — the chips\' ends, the times and the lengths on one grid down each column, ≥ 1 h rows included, in ru / he / uk / en; the time box holds the widest time', async () => {
  const widest = {};
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    const app = await openApp({ ...QUIET, lang: lang === 'en' ? 'ru' : lang });
    try {
      await trafficIn(app, lang);
      const cols = await app.page.evaluate(GRID);
      assert.equal(cols[0].hours >= 3, true, lang + ': Rehovot\'s «Города» has rows of an hour or more: ' + cols[0].hours);
      for (const [k, c] of cols.entries()) {
        assert.deepEqual([c.chipEnd.length, c.timeStart.length, c.timeEnd.length, c.kmEnd.length], [1, 1, 1, 1], lang + ' column ' + k + ' on one grid: ' + JSON.stringify(c));
        assert.ok(Math.abs(c.chipEnd[0] - c.timeStart[0]) <= 16, lang + ': the chip ends where the time begins (its 16 px margin at most)');
      }
      widest[lang] = await app.page.evaluate(() => {
        const host = document.querySelector('#traffic-body .tw-row'), box = host.querySelector('.tw-time').getBoundingClientRect().width;
        const unit = (s) => s.replace(/(\s*[^\d\s]+)/g, '<span class="unit">$1</span>');
        let max = [0, ''];
        for (let h = 0; h <= 9; h++) for (let m = 0; m < 60; m++) {
          const s = document.createElement('span'), text = h ? I18n.t('t.hmin', { h, m: m < 10 ? '0' + m : String(m) }) : I18n.t('t.min', { n: m });
          s.className = 'tw-time'; s.style.cssText = 'position:absolute;visibility:hidden;min-width:0';
          s.innerHTML = unit(text); host.appendChild(s);
          const w = s.getBoundingClientRect().width; s.remove();
          if (w > max[0]) max = [w, text];
        }
        return { box, widest: Math.ceil(max[0] * 10) / 10, text: max[1] };
      });
      assert.ok(widest[lang].widest <= widest[lang].box, lang + ': the widest time fits its box: ' + JSON.stringify(widest[lang]));
    } finally { await app.close(); }
  }
  console.log('# D1 widest time per language (px, in a box of)', JSON.stringify(widest));
});

// D4 (review-1, 2026-11-06): the home city whose routes carry the catalogue's longest names in every language — Umm
// al-Fahm: «Мигдаль-ха-Эмек» and «Бака-эль-Гарбия», «באקה אל גרבייה», «Мігдаль-га-Емек», "Baqa al-Gharbiyye" — with its own
// times (several hours to Eilat): nothing cut, nothing overlapping in a row, the ten rows of each column inside the card on
// one grid, Hebrew right to left. Then a name longer than any in the catalogue (the airport's terminal) wraps onto a
// second line in its widget, still nothing cut and the ten rows still inside.
const LONGEST = { ru: ['Мигдаль-ха-Эмек', 'Бака-эль-Гарбия'], he: ['באקה אל גרבייה'], uk: ['Мігдаль-га-Емек', 'Бака-ель-Гарбія'], en: ['Baqa al-Gharbiyye'] };
const TERMINAL = { ru: 'Аэропорт Бен-Гурион, терминал 3 (вылет)', he: 'נמל התעופה בן גוריון, טרמינל 3 (יציאות)', uk: 'Аеропорт Бен-Гуріон, термінал 3 (виліт)',
  en: 'Ben Gurion Airport, Terminal 3 (departures)' };
const ROWS = () => {
  const rtl = document.documentElement.dir === 'rtl', body = document.getElementById('traffic-body').getBoundingClientRect();
  const lines = (e) => { const q = document.createRange(); q.selectNodeContents(e); return new Set([...q.getClientRects()].map((x) => Math.round(x.top))).size; };
  return { rtl, bodyBottom: Math.round(body.bottom), cols: [...document.querySelectorAll('.tcol')].map((c) => ({ left: Math.round(c.getBoundingClientRect().left),
    rows: [...c.querySelectorAll('.tw')].map((w) => {
      const parts = [...w.querySelector('.tw-row').children].map((e) => e.getBoundingClientRect()), b = w.getBoundingClientRect();
      // the parts in reading order: each ends before the next begins (right to left in Hebrew)
      const apart = parts.every((p, i) => i === 0 || (rtl ? parts[i - 1].left >= p.right - 0.5 : parts[i - 1].right <= p.left + 0.5));
      return { name: w.querySelector('.tw-name').textContent, lines: lines(w.querySelector('.tw-name')), top: Math.round(b.top), bottom: Math.round(b.bottom), apart };
    }) })) };
};
test('L3 (D4): traffic from Umm al-Fahm, the longest names in ru / he / uk / en — nothing cut or overlapping, ten rows a column inside the card on one grid, Hebrew right to left; a longer name wraps, never cut', async () => {
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    const app = await openApp({ ...QUIET, lang: lang === 'en' ? 'ru' : lang, weather: anyPlaceWeather, configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; c.homeCity = 'ummalfahm'; } });
    try {
      await trafficIn(app, lang);
      const p = app.page, v = await p.evaluate(ROWS), names = v.cols.flatMap((c) => c.rows.map((r) => r.name));
      for (const n of LONGEST[lang]) assert.ok(names.includes(n), lang + ': ' + n + ' on the screen: ' + names);
      assert.deepEqual(v.cols.map((c) => c.rows.length), [10, 10], lang + ': two columns of ten');
      assert.equal(v.rtl, lang === 'he', lang + ': direction');
      assert.equal(v.cols[0].left > v.cols[1].left, lang === 'he', lang + ': «Города» first in reading order');
      for (const c of v.cols) {
        assert.ok(c.rows.every((r) => r.apart), lang + ': name, chip, time, length never overlap: ' + JSON.stringify(c.rows.filter((r) => !r.apart)));
        assert.ok(c.rows[9].bottom <= v.bodyBottom && c.rows[9].bottom <= 1080 - 48, lang + ': the tenth row inside the card: ' + c.rows[9].bottom);
      }
      for (let k = 0; k < 10; k++) assert.equal(new Set(v.cols.map((c) => c.rows[k].top + '/' + c.rows[k].bottom)).size, 1, lang + ': row ' + k + ' on one grid');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), [], lang + ': nothing cut');
      // a name longer than any in the catalogue: two lines in its widget, nothing cut, the ten rows still inside
      await p.evaluate((t) => { document.querySelector('.tcol .tw-name').textContent = t; }, TERMINAL[lang]);
      const w = await p.evaluate(ROWS);
      assert.equal(w.cols[0].rows[0].lines, 2, lang + ': the long name wraps: ' + JSON.stringify(w.cols[0].rows[0]));
      assert.ok(w.cols.every((c) => c.rows.every((r) => r.apart) && c.rows[9].bottom <= w.bodyBottom), lang + ': still apart and inside: ' + JSON.stringify(w.cols.map((c) => c.rows[9])));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), [], lang + ': the wrapped name not cut');
      assert.deepEqual(app.errors, [], lang);
    } finally { await app.close(); }
  }
});
