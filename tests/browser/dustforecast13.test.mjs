// Batch 13: the dust forecast (the owner, 2026-11-02: «а есть прогноз хамсина на каждый час дня как для температуры и на
// неделю?» → «делай оба варианта»). At the TV's 1920×1080, in ru, he and uk: a dust line under every hour of the strip and a
// dust column after every day's high (the main 7 days and the Israel 7 days — FIX-BATCH-18 item 1; were 5), each card's legend on its title row («Пыль,
// мкг/м³», «Пыль макс., мкг/м³», the amber pill «хамсин ≥ 100»; in Hebrew on the left of the title), «—» past the forecast,
// empty slots before the first air answer and nothing moving when it lands, amber pills in a khamsin; the main screen in its
// 984 px budget, nothing cut, outside its card or overlapping, everything legible. The air answers are the real 2026-11-02
// recording and the SYNTHETIC khamsin derived from it, moved to the weather recordings' dates (airForecastAnswer).
// OWNER-1LEG-C (owner 2026-11-02, one legend + design C): the title rows carry their title only; the ONE legend «Пыль
// [хамсин ≥ 100]» is the main card's dust label; the day rows carry the weather only and each day's dust is in the band under
// the list (#daily .dust-band, .region .dust-band: «Пыль», then one cell per day — its short name over its maximum).
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
// OWNER-1LEG-C: [the one legend's key = the band's label, its pill, today's name in the band]
// FIX-18B 13B: the one key is the grades' scale «100 121 196 271» (each on its pill) after «Пыль»
const LEGEND = { ru: ['Пыль', '100121196271', 'Сег.'], he: ['אבק', '100121196271', 'היום'], uk: ['Пил', '100121196271', 'Сьог.'] };
const shot = async (p, name) => { if (process.env.B13_SHOTS) { fs.mkdirSync(process.env.B13_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B13_SHOTS, name + '.png') }); } };

// What a viewer reads on the main screen, and the geometry that must hold.
function mainState() {
  const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)], box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const rtl = document.documentElement.dir === 'rtl';
  // B22 (owner 2026-11-04, judges' common decision, city card, fix 1): the one legend — the grades' scale and its unit — on the hourly
  // title row after its «Пыль» (null when there are no rows), and how many legends there are on the screen / in titles
  const lg = q('#screen-main .dust-legend');
  const legend = lg ? { key: q('#hourly .card-head .band-label').textContent, khamsin: lg.querySelector('.dust-legend-scale').textContent,   // FIX-18B 13B: the grades' scale
    active: lg.querySelector('.dust-legend-scale').classList.contains('is-active'), onHourlyHead: !!lg.closest('#hourly .card-head'), box: box(lg) } : null;
  const hourly = q('.hourly-card'), daily = q('#daily'), band = q('#daily .dust-band');
  const nowNum = q('.now-air .air-dust .air-num');
  return { rtl, legend, legends: all('#screen-main .dust-legend').length, titleLegends: all('#screen-main .card-head .dust-legend').length,
    hourlyTitle: box(q('.hourly-card .card-title')), status: box(q('#status')), nowAir: nowNum ? nowNum.textContent : null,
    hours: all('.hour-dust').map((e) => e.textContent), khamsinHours: all('.hour-dust .is-khamsin').length,
    days: all('#daily .dust-band .day-dust').map((e) => e.textContent), khamsinDays: all('#daily .dust-band .day-dust .is-khamsin').length,
    dustInRows: all('#daily .day .day-dust').length, bandLabel: band ? band.querySelector('.band-label').textContent : null,
    bandDays: all('#daily .dust-band .band-day').map((e) => e.textContent), bandDayBoxes: all('#daily .dust-band .band-day').map(box),
    hourBoxes: all('.hour-dust').map(box), dayBoxes: all('#daily .dust-band .day-dust').map(box), temps: all('.hour-temp').map(box),
    hourlyCard: box(hourly), dailyCard: box(daily), lastDay: box(all('#daily .day').pop()), band: band ? box(band) : null, stage: box(q('#stage')) };
}
function israelState() {
  return [...document.querySelectorAll('.region')].map((c) => {
    const r = (e) => e.getBoundingClientRect();
    // OWNER-1LEG-C: no legend on a region card; the dust in the band under its days, labelled «Пыль»
    const band = c.querySelector('.dust-band');
    return { key: band.querySelector('.band-label').textContent, days: [...c.querySelectorAll('.dust-band .day-dust')].map((e) => e.textContent),
      bandDays: [...c.querySelectorAll('.dust-band .band-day')].map((e) => e.textContent), legends: c.querySelectorAll('.dust-legend').length,
      dustInRows: c.querySelectorAll('.day .day-dust').length, bandTop: r(band).top, bandBottom: r(band).bottom,
      khamsin: c.querySelectorAll('.dust-band .day-dust .is-khamsin').length, lastBottom: r([...c.querySelectorAll('.day')].pop()).bottom, cardBottom: r(c).bottom };
  });
}

async function open(lang, air) {
  const app = await openApp({ weather: 'ok', lang, air, configure: (c) => { c.rotation.enabled = false; } });
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await app.page.evaluate(() => document.fonts.ready);
  return app;
}

for (const lang of ['ru', 'he', 'uk']) {
  test('B13 / OWNER-1LEG-C ' + lang + ': a dust line under every hour, each day\'s dust in the band under the 7 days, the one legend on the current card\'s dust; the 984 px budget kept, nothing cut', async () => {
    const app = await open(lang, airForecastAnswer(REAL, -4));
    try {
      const p = app.page;
      await p.waitForFunction(() => document.querySelectorAll('.hour-dust .dust-num').length === 12, { timeout: 10000 }); await wait(300);
      const m = await p.evaluate(mainState);
      // the real recording moved to 2026-10-29: Rehovot from 20:00 on (11-02 20:00 …), the days 10-29 … 11-02, then past the 5 days
      // X2: «Сейчас» is the CURRENT reading (27, as the current card) — the forecast for that hour said 29
      assert.deepEqual(m.hours, ['27', '32', '30', '30', '32', '34', '36', '38', '35', '31', '31', '38'], lang);
      assert.equal(m.nowAir, '27', 'the same value as the current card');
      assert.equal(m.legend.active, false, 'X4: no khamsin on screen: the legend\'s «хамсин ≥ 100» is quiet');
      // B22 (owner 2026-11-04, judges' common decision, city card, fix 1; replaces OWNER-1LEG-C's placement): ONE legend, on the
      // hourly title row; none in the city card
      assert.deepEqual([m.legends, m.legend.onHourlyHead, m.titleLegends], [1, true, 1], lang + ': one legend, on the hourly title row');
      // owner 2026-11-04, batch 24 (в): was «—», «—» — past the 5-day forecast the days are beyond the horizon: «…»
      assert.deepEqual(m.days, ['32', '38', '19', '16', '16', '…', '…'], lang + ': past the 5-day forecast «…»');
      assert.equal(m.khamsinHours + m.khamsinDays, 0, 'no khamsin in the real recording at home');
      assert.deepEqual([m.legend.key, m.legend.khamsin, m.bandLabel], [LEGEND[lang][0], LEGEND[lang][1], LEGEND[lang][0]], lang + ': the legend and the band\'s label');
      assert.equal(m.bandDays.length, 7, 'a band cell per day');
      assert.equal(m.bandDays[0], LEGEND[lang][2], lang + ': today in the band');
      // the title and the status line apart (the legend left the title row)
      assert.ok(m.hourlyTitle.r <= m.status.l || m.status.r <= m.hourlyTitle.l, lang + ': the title and the status line apart');
      // each hour's dust under its temperature, inside the 240 px card; each day's after its high, inside the daily card
      m.hourBoxes.forEach((b, i) => { assert.ok(b.t >= m.temps[i].b - 0.5, 'hour ' + i + ' under its temperature'); assert.ok(b.b <= m.hourlyCard.b - 13, 'hour ' + i + ' inside the padding'); });
      // OWNER-1LEG-C: the day rows carry no dust; each day's dust under its name in the band, the band under the last day, inside the card
      assert.equal(m.dustInRows, 0, lang + ': no dust in a day row');
      m.dayBoxes.forEach((b, i) => assert.ok(b.t >= m.bandDayBoxes[i].b - 0.5 && b.l >= m.dailyCard.l && b.r <= m.dailyCard.r, 'day ' + i + ' dust under its name, inside the card'));
      assert.ok(m.band.t >= m.lastDay.b, lang + ': the band under the 7 days');
      assert.equal(Math.round(m.hourlyCard.b - m.hourlyCard.t), 240, 'the hourly card keeps its 240 px');
      assert.equal(Math.round(m.hourlyCard.b), 1032, 'the 984 px budget: the cards end where they did');
      assert.ok(m.lastDay.b <= m.dailyCard.b - 31, 'the 7 days inside the daily card\'s padding');
      assert.ok(m.band.b <= m.dailyCard.b - 31, lang + ': the band inside the daily card\'s padding: ' + (m.dailyCard.b - m.band.b));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      assert.deepEqual((await p.evaluate(legibility, '#screen-main .card-head *, #screen-main .hour-dust *, #screen-main .dust-band *, #screen-main .air-dust *')).bad, [], lang + ' legible');
      assert.equal(app.requests.air.length, 1, 'ONE air request carries the current air and the forecast of every place');
      await shot(p, 'b13-main-' + lang);
      await press(p, 39); await wait(1200);
      const isr = await p.evaluate(israelState);
      assert.deepEqual(isr.map((c) => c.key), [0, 1, 2].map(() => LEGEND[lang][0]), lang + ': each band labelled «Пыль»');
      assert.deepEqual(isr.map((c) => [c.legends, c.dustInRows, c.bandDays.length, c.bandDays[0]]), [0, 1, 2].map(() => [0, 0, 7, LEGEND[lang][2]]), lang + ': no legend, no dust in a row, a band cell per day');
      // owner 2026-11-04, batch 24 (а)+(в) (was X6 «—» and «—» past the forecast): Haifa's 2026-11-06 (24 × 0) reads 0; FIX-BATCH-18
      // item 4: 7 band cells, past the 5-day air forecast «…»
      assert.deepEqual(isr.map((c) => c.days), [['24', '33', '15', '12', '0', '…', '…'], ['26', '37', '18', '14', '16', '…', '…'], ['48', '53', '23', '16', '185', '…', '…']], lang + ': Haifa, Tel Aviv, Beer Sheva');
      assert.deepEqual(isr.map((c) => c.khamsin), [0, 0, 1], 'Beer Sheva\'s real 185 µg/m³ on the 5th day is a khamsin');
      isr.forEach((c, i) => assert.ok(c.lastBottom <= c.cardBottom - 23, 'region ' + i + ': the days inside the card'));
      isr.forEach((c, i) => assert.ok(c.bandTop >= c.lastBottom && c.bandBottom <= c.cardBottom - 23, 'region ' + i + ': the band under the days, inside the card: ' + (c.cardBottom - c.bandBottom)));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel');
      assert.deepEqual((await p.evaluate(legibility, '#screen-israel .card-head *, #screen-israel .dust-band *')).bad, [], lang + ' israel legible');
      await shot(p, 'b13-israel-' + lang);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

test('B13 / OWNER-1LEG-C ru khamsin: amber pills on the khamsin hours and band days (main and Israel), the one legend lit, and nothing moves against an ordinary day', async () => {
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
    assert.deepEqual([m.legend.active, m.legends, m.titleLegends], [true, 1, 1], 'X4 / B22 fix 1: the one legend lit, on the hourly title row');
    assert.deepEqual([m.days.slice(0, 2), m.khamsinDays], [['197', '240'], 2], 'today and tomorrow');
    assert.deepEqual(m.hourBoxes.map((b) => b.t), normal.hourBoxes.map((b) => b.t), 'the hour lines stay where they were');
    assert.deepEqual(m.dayBoxes.map((b) => [b.l, b.r, b.t]), normal.dayBoxes.map((b) => [b.l, b.r, b.t]), 'the band cells stay where they were');
    assert.deepEqual(m.band, normal.band, 'the band keeps its box');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], 'main');
    assert.deepEqual((await p.evaluate(legibility, '#screen-main .hour-dust *, #screen-main .dust-band *, #screen-main .air-dust *')).bad, [], 'amber on amber legible');
    await shot(p, 'b13-main-ru-khamsin');
    await press(p, 39); await wait(1200);
    assert.deepEqual((await p.evaluate(israelState)).map((c) => c.khamsin), [0, 1, 1], 'Tel Aviv tomorrow (synthetic), Beer Sheva on the 5th day (real)');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], 'israel');
    await shot(p, 'b13-israel-ru-khamsin');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('B13 / OWNER-1LEG-C ru no air yet: every slot there and empty, the band and its label shown, the same boxes as with data; air failed: «—» everywhere, the band kept', async () => {
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
    // OWNER-1LEG-C: the band and its label stand before the air; B22 fix 1: the one legend is on the hourly title row already, quiet
    assert.deepEqual([m.bandLabel, m.bandDays, m.titleLegends, m.legend.active, m.legend.box], [LEGEND.ru[0], normal.bandDays, 1, false, normal.legend.box]);
    assert.deepEqual(m.hourBoxes.map((b) => [b.t, b.b]), normal.hourBoxes.map((b) => [b.t, b.b]), 'the hour slots keep their height: nothing moves when the air lands');
    assert.deepEqual(m.band, normal.band, 'the band keeps its box: nothing moves when the air lands');
    assert.deepEqual(m.bandDayBoxes, normal.bandDayBoxes, 'the day names in the band stay where they will be with data');
    assert.deepEqual(m.dayBoxes.map((b) => [b.l, b.r, b.t, b.b]), normal.dayBoxes.map((b) => [b.l, b.r, b.t, b.b]), 'the band cells keep their boxes');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), []);
    await shot(p, 'b13-main-ru-noair');
  } finally { await app.close(); }
  const failed = await open('ru', 'fail');
  try {
    await failed.page.waitForFunction(() => document.querySelector('.hour-dust') && document.querySelector('.hour-dust').textContent === '—', { timeout: 10000 });
    const m = await failed.page.evaluate(mainState);
    assert.deepEqual([m.hours, m.days], [Array(12).fill('—'), Array(7).fill('—')]);
    assert.equal(await failed.page.$$eval('.hour-dust .dust-none, .day-dust .dust-none', (e) => e.length), 19, 'X5: every «—» muted');
    assert.deepEqual([m.bandLabel, m.bandDays, m.titleLegends], [LEGEND.ru[0], normal.bandDays, 1], 'the band stays; B22 fix 1: the one legend on the hourly title row');
    assert.deepEqual(m.band, normal.band, 'the band keeps its box');
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
    await p.waitForFunction(() => document.querySelectorAll('#screen-israel .day-dust.is-stale').length === 21, { timeout: 10000 });
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
      // FIX-18B 13A: a band cell says a value from 1000 on in thousands (the hours keep the whole figure)
      const short = (lang === 'he' ? String(Math.round(v / 100) / 10) + 'K' : String(Math.round(v / 100) / 10).replace('.', ',') + 'к');
      assert.deepEqual(fit, { hours: true, days: true, text: short, hour1: String(v) }, lang + ' ' + v);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + v + ' main');
      // batch 16 («3400» spare): the daily pill leaves room in its 72 px column on the TV's font, never 0 px
      const spare = await p.evaluate(() => Math.min.apply(null, [...document.querySelectorAll('#daily .day-dust .dust-num')].map((n) => n.parentNode.getBoundingClientRect().width - n.getBoundingClientRect().width)));
      assert.ok(spare >= 4, lang + ' ' + v + ': ' + spare.toFixed(1) + ' px spare in the day column');
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
