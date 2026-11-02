// Batch 13: the dust forecast (the owner, 2026-11-02: «а есть прогноз хамсина на каждый час дня как для температуры и на
// неделю?» → «делай оба варианта»). At the TV's 1920×1080, in ru, he and uk: a dust line under every hour of the strip and a
// dust column after every day's high (the main 7 days and the Israel 5 days), each card's legend on its title row («Пыль,
// мкг/м³», «Пыль макс., мкг/м³», the amber pill «хамсин ≥ 100»; in Hebrew on the left of the title), «—» past the forecast,
// empty slots before the first air answer and nothing moving when it lands, amber pills in a khamsin; the main screen in its
// 984 px budget, nothing cut, outside its card or overlapping, everything legible. The air answers are the real 2026-11-02
// recording and the SYNTHETIC khamsin derived from it, moved to the weather recordings' dates (airForecastAnswer).
// B13_SHOTS=<dir> also writes the screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, airForecastAnswer, weatherAnswer } from './page.mjs';

const REAL = 'aq-4places-hourly-2026-11-02', KHAMSIN = 'aq-4places-hourly-khamsin-synthetic-2026-11-02';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const LEGEND = { ru: ['Пыль, мкг/м³', 'Пыль макс., мкг/м³', 'хамсин ≥ 100'], he: ['אבק, מק״ג/מ״ק', 'אבק מרבי, מק״ג/מ״ק', 'חמסין ‪≥ 100‬'],
  uk: ['Пил, мкг/м³', 'Пил макс., мкг/м³', 'хамсин ≥ 100'] };
const shot = async (p, name) => { if (process.env.B13_SHOTS) { fs.mkdirSync(process.env.B13_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B13_SHOTS, name + '.png') }); } };

// What a viewer reads on the main screen, and the geometry that must hold.
function mainState() {
  const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)], box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const rtl = document.documentElement.dir === 'rtl';
  const legendOf = (card) => ({ key: card.querySelector('.dust-legend-key').textContent, khamsin: card.querySelector('.dust-legend-khamsin').textContent,
    active: card.querySelector('.dust-legend-khamsin').classList.contains('is-active'),
    title: box(card.querySelector('.card-title')), legend: box(card.querySelector('.dust-legend')) });
  const hourly = q('.hourly-card'), daily = q('#daily');
  const nowNum = q('.now-air .air-dust .air-num');
  return { rtl, hourly: legendOf(hourly), daily: legendOf(daily), status: box(q('#status')), nowAir: nowNum ? nowNum.textContent : null,
    hours: all('.hour-dust').map((e) => e.textContent), khamsinHours: all('.hour-dust .is-khamsin').length,
    days: all('#daily .day-dust').map((e) => e.textContent), khamsinDays: all('#daily .day-dust .is-khamsin').length,
    hourBoxes: all('.hour-dust').map(box), dayBoxes: all('#daily .day-dust').map(box), temps: all('.hour-temp').map(box), highs: all('#daily .day-max').map(box),
    hourlyCard: box(hourly), dailyCard: box(daily), lastDay: box(all('#daily .day').pop()), stage: box(q('#stage')) };
}
function israelState() {
  return [...document.querySelectorAll('.region')].map((c) => {
    const r = (e) => e.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl', lg = r(c.querySelector('.dust-legend')), tt = r(c.querySelector('.card-title')), dd = r(c.querySelector('.day-dust'));
    return { key: c.querySelector('.dust-legend-key').textContent, days: [...c.querySelectorAll('.day-dust')].map((e) => e.textContent),
      gap: Math.round(lg.top - tt.bottom), endDiff: Math.round(rtl ? lg.left - dd.left : lg.right - dd.right),
      active: c.querySelector('.dust-legend-khamsin').classList.contains('is-active'),
      khamsin: c.querySelectorAll('.day-dust .is-khamsin').length, lastBottom: r([...c.querySelectorAll('.day')].pop()).bottom, cardBottom: r(c).bottom };
  });
}

async function open(lang, air) {
  const app = await openApp({ weather: 'ok', lang, air, configure: (c) => { c.rotation.enabled = false; } });
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await app.page.evaluate(() => document.fonts.ready);
  return app;
}

for (const lang of ['ru', 'he', 'uk']) {
  test('B13 ' + lang + ': a dust line under every hour, a dust column after every day\'s high, each legend on its title row; the 984 px budget kept, nothing cut', async () => {
    const app = await open(lang, airForecastAnswer(REAL, -4));
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 }); await wait(300);
      const m = await p.evaluate(mainState);
      // the real recording moved to 2026-10-29: Rehovot from 20:00 on (11-02 20:00 …), the days 10-29 … 11-02, then past the 5 days
      // X2: «Сейчас» is the CURRENT reading (27, as the current card) — the forecast for that hour said 29
      assert.deepEqual(m.hours, ['27', '32', '30', '30', '32', '34', '36', '38', '35', '31', '31', '38'], lang);
      assert.equal(m.nowAir, '27', 'the same value as the current card');
      assert.deepEqual([m.hourly.active, m.daily.active], [false, false], 'X4: no khamsin on screen: the legend\'s «хамсин ≥ 100» is quiet');
      // X3: the wrapped legend 6 px under the daily title, its end above the dust column (left in Hebrew)
      assert.ok(Math.abs(m.daily.legend.t - m.daily.title.b - 6) <= 1, lang + ': legend gap ' + (m.daily.legend.t - m.daily.title.b));
      assert.ok(Math.abs(m.rtl ? m.daily.legend.l - m.dayBoxes[0].l : m.daily.legend.r - m.dayBoxes[0].r) <= 1, lang + ': the legend ends above the dust column');
      assert.deepEqual(m.days, ['32', '38', '19', '16', '16', '—', '—'], lang + ': past the 5-day forecast «—»');
      assert.equal(m.khamsinHours + m.khamsinDays, 0, 'no khamsin in the real recording at home');
      assert.deepEqual([m.hourly.key, m.daily.key, m.hourly.khamsin, m.daily.khamsin], [LEGEND[lang][0], LEGEND[lang][1], LEGEND[lang][2], LEGEND[lang][2]], lang + ': the legends');
      // the hourly legend on the title's own row, after the title (in Hebrew: on its left), never over the status line
      assert.ok(m.hourly.legend.t < m.hourly.title.b && m.hourly.title.t < m.hourly.legend.b, lang + ': the hourly legend on the title row');
      assert.ok(m.rtl ? m.hourly.legend.r <= m.hourly.title.l : m.hourly.legend.l >= m.hourly.title.r, lang + ': after the title, in the reading direction');
      assert.ok(m.hourly.legend.r <= m.status.l || m.status.r <= m.hourly.legend.l, lang + ': the legend and the status line apart');
      // each hour's dust under its temperature, inside the 240 px card; each day's after its high, inside the daily card
      m.hourBoxes.forEach((b, i) => { assert.ok(b.t >= m.temps[i].b - 0.5, 'hour ' + i + ' under its temperature'); assert.ok(b.b <= m.hourlyCard.b - 13, 'hour ' + i + ' inside the padding'); });
      m.dayBoxes.forEach((b, i) => assert.ok(m.rtl ? b.r <= m.highs[i].l - 13 : b.l >= m.highs[i].r + 13, 'day ' + i + ' after its high, apart from it'));
      assert.equal(Math.round(m.hourlyCard.b - m.hourlyCard.t), 240, 'the hourly card keeps its 240 px');
      assert.equal(Math.round(m.hourlyCard.b), 1032, 'the 984 px budget: the cards end where they did');
      assert.ok(m.lastDay.b <= m.dailyCard.b - 31, 'the 7 days inside the daily card\'s padding');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      assert.deepEqual((await p.evaluate(legibility, '#screen-main .card-head *, #screen-main .hour-dust *, #screen-main .day-dust *')).bad, [], lang + ' legible');
      assert.equal(app.requests.air.length, 1, 'ONE air request carries the current air and the forecast of every place');
      await shot(p, 'b13-main-' + lang);
      await press(p, 39); await wait(1200);
      const isr = await p.evaluate(israelState);
      assert.deepEqual(isr.map((c) => c.key), [0, 1, 2].map(() => LEGEND[lang][1]));
      // X6: Haifa's 2026-11-06 is a CAMS fill (24 × 0): «—»
      assert.deepEqual(isr.map((c) => c.days), [['24', '33', '15', '12', '—'], ['26', '37', '18', '14', '16'], ['48', '53', '23', '16', '185']], lang + ': Haifa, Tel Aviv, Beer Sheva');
      isr.forEach((c, i) => {
        assert.ok(Math.abs(c.gap - 6) <= 1, lang + ' region ' + i + ': legend gap ' + c.gap);
        assert.ok(Math.abs(c.endDiff) <= 1, lang + ' region ' + i + ': the legend ends above the dust column ' + c.endDiff);
      });
      assert.deepEqual(isr.map((c) => c.active), [false, false, true], 'X4: lit only on the card that shows a khamsin day');
      assert.deepEqual(isr.map((c) => c.khamsin), [0, 0, 1], 'Beer Sheva\'s real 185 µg/m³ on the 5th day is a khamsin');
      isr.forEach((c, i) => assert.ok(c.lastBottom <= c.cardBottom - 23, 'region ' + i + ': the days inside the card'));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel');
      assert.deepEqual((await p.evaluate(legibility, '#screen-israel .card-head *, #screen-israel .day-dust *')).bad, [], lang + ' israel legible');
      await shot(p, 'b13-israel-' + lang);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

test('B13 ru khamsin: amber pills on the khamsin hours and days (main and Israel), and nothing moves against an ordinary day', async () => {
  const ref = await open('ru', airForecastAnswer(REAL, -4));
  let normal;
  try {
    await ref.page.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 });
    normal = await ref.page.evaluate(mainState);
  } finally { await ref.close(); }
  const app = await open('ru', airForecastAnswer(KHAMSIN, -4));
  try {
    const p = app.page;
    await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 }); await wait(300);
    const m = await p.evaluate(mainState);
    assert.equal(m.khamsinHours, 12, 'the synthetic khamsin covers the whole strip');
    assert.deepEqual([m.hours[0], m.nowAir], ['182', '182'], 'X2: «Сейчас» is the current reading (the forecast said 144)');
    assert.deepEqual([m.hourly.active, m.daily.active], [true, true], 'X4: the legend\'s pill lit');
    assert.deepEqual([m.days.slice(0, 2), m.khamsinDays], [['197', '240'], 2], 'today and tomorrow');
    assert.deepEqual(m.hourBoxes.map((b) => b.t), normal.hourBoxes.map((b) => b.t), 'the hour lines stay where they were');
    assert.deepEqual(m.dayBoxes.map((b) => [b.l, b.r, b.t]), normal.dayBoxes.map((b) => [b.l, b.r, b.t]), 'the day column stays where it was');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], 'main');
    assert.deepEqual((await p.evaluate(legibility, '#screen-main .hour-dust *, #screen-main .day-dust *')).bad, [], 'amber on amber legible');
    await shot(p, 'b13-main-ru-khamsin');
    await press(p, 39); await wait(1200);
    assert.deepEqual((await p.evaluate(israelState)).map((c) => c.khamsin), [0, 1, 1], 'Tel Aviv tomorrow (synthetic), Beer Sheva on the 5th day (real)');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], 'israel');
    await shot(p, 'b13-israel-ru-khamsin');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B13 ru no air yet: every slot there and empty, the legends shown, the same boxes as with data; air failed: «—» everywhere, legends kept', async () => {
  const ref = await open('ru', airForecastAnswer(REAL, -4));
  let normal;
  try {
    await ref.page.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 });
    normal = await ref.page.evaluate(mainState);
  } finally { await ref.close(); }
  const app = await open('ru', () => ({ hang: true }));
  try {
    const p = app.page;
    await wait(800);
    const m = await p.evaluate(mainState);
    assert.deepEqual([m.hours, m.days], [Array(12).fill(''), Array(7).fill('')], 'empty slots');
    assert.deepEqual([m.hourly.key, m.daily.key], [LEGEND.ru[0], LEGEND.ru[1]]);
    assert.deepEqual(m.hourBoxes.map((b) => [b.t, b.b]), normal.hourBoxes.map((b) => [b.t, b.b]), 'the hour slots keep their height: nothing moves when the air lands');
    assert.deepEqual(m.dayBoxes.map((b) => [b.l, b.r]), normal.dayBoxes.map((b) => [b.l, b.r]), 'the day column keeps its width');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), []);
    await shot(p, 'b13-main-ru-noair');
  } finally { await app.close(); }
  const failed = await open('ru', 'fail');
  try {
    await failed.page.waitForFunction(() => document.querySelector('.hour-dust') && document.querySelector('.hour-dust').textContent === '—', { timeout: 10000 });
    const m = await failed.page.evaluate(mainState);
    assert.deepEqual([m.hours, m.days], [Array(12).fill('—'), Array(7).fill('—')]);
    assert.equal(await failed.page.$$eval('.hour-dust .dust-none, .day-dust .dust-none', (e) => e.length), 19, 'X5: every «—» muted');
    assert.deepEqual([m.hourly.key, m.daily.key, m.hourly.khamsin], LEGEND.ru, 'the legends stay');
    await shot(failed.page, 'b13-main-ru-airfailed');
  } finally { await failed.close(); }
});

test('B13-D7: a new dust forecast alone redraws the main screen — the current air the same, only the hours ahead turn into a khamsin', async () => {
  // 1st air answer: the real recording; 2nd (the refresh when the main screen is opened again): the synthetic khamsin's
  // hours with the real recording's CURRENT values, so the air block's summary is unchanged and only the forecast differs.
  const real = JSON.parse(airForecastAnswer(REAL, -4)().body), dusty = JSON.parse(airForecastAnswer(KHAMSIN, -4)().body);
  dusty.forEach((p, i) => { p.current = real[i].current; });
  const answers = [real, dusty];
  // the weather answers once; its refreshes on the screen changes hang (still in flight): the weather part of the key stays
  const app = await openApp({ weather: (n, url) => (n === 1 ? { status: 200, body: weatherAnswer(url) } : { hang: true }), lang: 'ru',
    air: (n) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(answers[Math.min(n, 2) - 1]) }), configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 });
    assert.equal((await p.evaluate(mainState)).khamsinHours, 0);
    const before = await p.$eval('.now-air', (e) => e.textContent);
    await press(p, 39); await wait(900); await press(p, 37);       // the Israel screen and back: each opening refreshes the air
    // X2: «Сейчас» keeps the unchanged current reading (not a khamsin): the 11 hours ahead turn
    await p.waitForFunction(() => document.querySelectorAll('.hour-dust .is-khamsin').length === 11, { timeout: 10000 });
    assert.ok(app.requests.air.length >= 2, 'the air was asked again');
    assert.equal(await p.$eval('.now-air', (e) => e.textContent), before, 'the current air unchanged: only the forecast redrew the card');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// ---- FIX-13B X7 (code F2): the App passes «stale» to the view — once the air answer fails after a good one, every dust slot
// on the main and Israel screens is dimmed (.is-stale). Kills the reviewer's mutant S1 (stale: false in js/app.js dustOf).
test('X7: the air going stale dims every dust slot on the main and Israel screens', async () => {
  const good = airForecastAnswer(REAL, -4);
  const app = await open('ru', (n) => (n === 1 ? good() : { status: 503, body: '' }));
  try {
    const p = app.page;
    await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 });
    assert.equal(await p.$$eval('.hour-dust.is-stale, .day-dust.is-stale', (e) => e.length), 0, 'fresh: nothing dimmed');
    await press(p, 39); await wait(1500);                      // opening a screen asks the air again: it fails → stale
    await p.waitForFunction(() => document.querySelectorAll('#screen-israel .day-dust.is-stale').length === 15, { timeout: 10000 });
    await press(p, 37);
    await p.waitForFunction(() => document.querySelectorAll('#screen-main .hour-dust.is-stale').length === 12 && document.querySelectorAll('#daily .day-dust.is-stale').length === 7, { timeout: 10000 });
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// ---- FIX-13B X1 (Codex, code F1): a four-digit dust (a strong khamsin) fits — the hourly pill in its 88 px column, the daily
// column 72 px — on the main and Israel screens, in Russian and Hebrew. Every FORECAST value set to v (the current reading
// stays the recording's: the current card's own 4-digit case is a batch-12 item, recorded for the next batch).
const every = (v) => () => {
  const list = JSON.parse(airForecastAnswer(REAL, -4)().body);
  for (const p of list) p.hourly.dust = p.hourly.dust.map((d) => (d === null ? null : v));
  return { status: 200, contentType: 'application/json', body: JSON.stringify(list) };
};
for (const [lang, v, shots] of [['ru', 1250, ['b13b-main-ru-1250']], ['ru', 3400, []], ['he', 1250, ['b13b-israel-he-1250']], ['he', 3400, ['b13b-main-he-3400']]]) {
  test('X1 ' + lang + ' ' + v + ' µg/m³: the four-digit dust fits every hour and every day, main and Israel — nothing cut or overflowing', async () => {
    const app = await open(lang, every(v));
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 }); await wait(300);
      const fit = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect(), inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
        return { hours: [...document.querySelectorAll('.hour-dust .dust-num')].every((n) => inside(r(n), r(n.closest('.hour')))),
          days: [...document.querySelectorAll('#daily .day-dust .dust-num')].every((n) => inside(r(n), r(n.parentNode))), text: document.querySelector('#daily .day-dust').textContent,
          hour1: document.querySelectorAll('.hour-dust')[1].textContent };
      });
      assert.deepEqual(fit, { hours: true, days: true, text: String(v), hour1: String(v) }, lang + ' ' + v);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + v + ' main');
      if (shots.includes('b13b-main-' + lang + '-' + v)) await shot(p, 'b13b-main-' + lang + '-' + v);
      await press(p, 39); await wait(1200);
      const isr = await p.evaluate(() => [...document.querySelectorAll('#screen-israel .day-dust .dust-num')].every((n) => {
        const a = n.getBoundingClientRect(), b = n.parentNode.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5; }));
      assert.equal(isr, true, lang + ' ' + v + ' israel: every day\'s figure inside its column');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' ' + v + ' israel');
      if (shots.includes('b13b-israel-' + lang + '-' + v)) await shot(p, 'b13b-israel-' + lang + '-' + v);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
