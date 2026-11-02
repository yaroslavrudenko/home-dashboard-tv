// Batch 12 at the TV's 1920×1080 in headless Chrome: the Shabbat & holidays screen (fifth, after the markets) drawn from
// the recorded Hebcal answer for Rehovot, the boot round that starts the air quality and the calendar beside the weather,
// and the UV / air on the main screen and the Israel cards — in ru, he and uk, nothing cut or spilling.
// SHABBAT_SHOTS=<dir> also writes shabbat-<lang>.png, main-<lang>.png and israel-<lang>.png there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const RIGHT = 39;
const SCREENS = ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'];
// Monday 2026-11-02 09:31 in Israel: the day the Hebcal and air answers were recorded (tests/fixtures/hebcal, /air).
const NOW = Date.parse('2026-11-02T07:31:00Z');
const RECORDED = { news: 'ok', alerts: 'empty-bom.txt', weather: 'ok', air: 'ok', hebcal: 'ok', markets: 'ok' };
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const gets = (app, kind) => app.requests[kind].filter((r) => r.method === 'GET').length;
const toScreen = async (p, id) => { for (let i = 0; i < SCREENS.indexOf(id); i++) await press(p, RIGHT); };
const shot = async (p, name) => {
  if (!process.env.SHABBAT_SHOTS) return;
  fs.mkdirSync(process.env.SHABBAT_SHOTS, { recursive: true });
  await p.screenshot({ path: path.join(process.env.SHABBAT_SHOTS, name + '.png') });
};

test('Batch 12: the Shabbat screen is the fifth — eight page dots; the recorded calendar: Rehovot, Friday\'s candles 16:27, six holidays', async () => {
  const app = await openApp({ ...RECORDED, now: NOW, configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForSelector('.day', { timeout: 10000 });
    assert.deepEqual(await p.$$eval('.screen', (s) => s.map((e) => e.id)), SCREENS.map((id) => 'screen-' + id));
    await toScreen(p, 'shabbat');
    await p.waitForSelector('#sh-week .sh-tile', { timeout: 5000 });
    await wait(600);
    assert.deepEqual(await p.$$eval('.dot', (d) => d.map((e) => e.className)), SCREENS.map((id) => (id === 'shabbat' ? 'dot is-on' : 'dot')));
    const v = await p.evaluate(() => ({ title: document.querySelector('#screen-shabbat .screen-title').textContent,
      week: document.getElementById('sh-week').textContent, rows: document.querySelectorAll('#sh-list .sh-row').length,
      status: document.getElementById('shabbat-status').className }));
    assert.equal(v.title, 'Шабат и праздники');
    assert.match(v.week, /Реховот/);
    assert.match(v.week, /16:27/, 'Friday 6 November, candle lighting in Rehovot (Hebcal, 18 minutes before sunset)');
    assert.match(v.week, /17:24/, 'havdalah');
    assert.equal(v.rows, 6);
    assert.equal(v.status, 'status screen-status is-fresh');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('Batch 12: the boot round starts the weather, the air quality and the calendar together with the news and the alerts; nothing else', async () => {
  const app = await openApp({ ...RECORDED, now: NOW, configure: (c) => { c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForSelector('.day', { timeout: 10000 });
    await wait(800);
    const boot = { weather: app.weatherRequests.length, air: gets(app, 'air'), hebcal: gets(app, 'hebcal'), news: gets(app, 'news'),
      alerts: gets(app, 'alerts'), markets: gets(app, 'markets') };
    assert.deepEqual(boot, { weather: 1, air: 1, hebcal: 1, news: 2, alerts: 1, markets: 0 });
    const air = new URL(app.requests.air[0].url), hebcal = new URL(app.requests.hebcal[0].url);
    assert.equal(air.searchParams.get('latitude').split(',').length, 4, 'one air request: home and the three regions');
    assert.deepEqual([hebcal.searchParams.get('geonameid'), hebcal.searchParams.get('start'), hebcal.searchParams.get('end')],
      ['293725', '2026-10-24', '2027-05-01'], 'Rehovot by its GeoNames id; from 9 days back to 180 days ahead (FIX-12B S2)');
    console.log('# batch 12 boot round: ' + JSON.stringify(boot));
  } finally { await app.close(); }
});

for (const lang of ['ru', 'he', 'uk']) {
  test('Batch 12, ' + lang + ': UV and air on the main card, the air chip on every Israel card, the Shabbat screen — nothing cut, all legible', async () => {
    const app = await openApp({ ...RECORDED, lang, now: NOW, configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForSelector('.day', { timeout: 10000 });
      await p.waitForSelector('.now-air .air-num', { timeout: 5000 });
      await p.evaluate(() => document.fonts.ready);
      await wait(600);
      const main = await p.evaluate(() => ({ uv: document.querySelector('.air-uv') && document.querySelector('.air-uv').textContent,
        air: document.querySelector('.now-air').textContent }));
      assert.match(main.uv, /\d/, lang + ': the UV maximum is a number');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      assert.deepEqual((await p.evaluate(legibility, '#screen-main .now-air *')).bad, [], lang + ' main air legible');
      await shot(p, 'main-' + lang);
      await press(p, RIGHT); await wait(900);
      const chips = await p.$$eval('#screen-israel .region-air', (c) => c.map((e) => [e.className, e.textContent.trim()]));
      assert.equal(chips.length, 3);
      assert.ok(chips.every(([cls, t]) => /lv-/.test(cls) && t.length > 0), lang + ': a level word on every region: ' + JSON.stringify(chips));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel');
      await shot(p, 'israel-' + lang);
      for (let i = 0; i < 3; i++) await press(p, RIGHT);
      await p.waitForSelector('#sh-week .sh-tile', { timeout: 5000 });
      await wait(900);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-shabbat *')), [], lang + ' shabbat');
      assert.deepEqual((await p.evaluate(legibility, '#screen-shabbat *')).bad, [], lang + ' shabbat legible');
      assert.equal(await p.$eval('html', (e) => e.dir), lang === 'he' ? 'rtl' : 'ltr');
      // the weekly reading fills the band under the Hebrew date: three labelled items, wholly above the rule and the tiles
      const r = await p.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const read = document.querySelector('#sh-week .sh-read'), rule = document.querySelector('#sh-week .sh-rule'), date = document.querySelector('#sh-week .sh-hdate');
        return { items: [].map.call(document.querySelectorAll('#sh-week .sh-read-item'), (e) => [].map.call(e.children, (c) => c.textContent.trim())),
          top: box(read).top, bottom: box(read).bottom, rule: box(rule).top, date: box(date).bottom };
      });
      assert.equal(r.items.length, 3, lang + ': portion, haftarah, Shabbat Mevarchim: ' + JSON.stringify(r.items));
      assert.ok(r.items.every((it) => it.length >= 2 && it.every((t) => t.length > 0)), lang + ': every value under its label');
      assert.ok(r.top >= r.date && r.bottom <= r.rule - 12, lang + ': inside the band, clear of the rule ' + JSON.stringify(r));
      await shot(p, 'shabbat-' + lang);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

// The weekly reading in its tightest states: a festival week with today's note and a two-part Torah reference (Omer day 3,
// 25 April 2027), the calm festival day in Hebrew (Pesach I) and a special Shabbat (Shirah) — every reference part on one
// line (verse numbers never split), the block clear of the rule, nothing cut. Captures: tests/fixtures/hebcal/*-ly.json.
const READING = [
  ['omer', 'ru', '2027-04-25T07:00:00Z', '2027-04-19', 'Счёт омера'],
  ['pesach', 'he', '2027-04-22T07:00:00Z', '2027-04-19', 'הפטרה'],
  ['shirah', 'uk', '2027-01-18T08:00:00Z', '2027-01-18', 'Особливий шабат'],
];
for (const [name, lang, iso, capture, label] of READING) {
  test('Reading, ' + name + ' (' + lang + '): labelled, references whole, clear of the rule, nothing cut', async () => {
    const hebcal = (n, url) => ({ status: 200, contentType: 'application/json',
      body: fs.readFileSync(path.resolve('tests/fixtures/hebcal/hebcal-' + (new URL(url).searchParams.get('geonameid') === '281184' ? 'jlm' : 'rehovot') + '-' + capture + '-ly.json'), 'utf8') });
    const app = await openApp({ ...RECORDED, hebcal, lang, now: Date.parse(iso), configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForSelector('.day', { timeout: 10000 });
      await toScreen(p, 'shabbat');
      await p.waitForSelector('#sh-week .sh-read', { timeout: 5000 });
      await p.evaluate(() => document.fonts.ready);
      await wait(900);
      const r = await p.evaluate(() => {
        const read = document.querySelector('#sh-week .sh-read'), rule = document.querySelector('#sh-week .sh-rule');
        const parts = [].map.call(document.querySelectorAll('#sh-week .sh-ref-part'), (e) => [e.textContent,   // lines = distinct rect tops (bidi runs give several rects on one line)
          [].map.call(e.getClientRects(), (b) => Math.round(b.top)).filter((t, i, a) => a.indexOf(t) === i).length]);
        return { labels: [].map.call(document.querySelectorAll('#sh-week .sh-read-label'), (e) => e.textContent),
          parts, bottom: read.getBoundingClientRect().bottom, rule: rule ? rule.getBoundingClientRect().top : null,
          calm: !!document.querySelector('#sh-week .sh-calm') };
      });
      assert.ok(r.labels.includes(label), name + ': ' + JSON.stringify(r.labels));
      assert.ok(r.parts.length >= 2 && r.parts.every(([, lines]) => lines === 1), name + ': every reference part on one line ' + JSON.stringify(r.parts));
      if (!r.calm) assert.ok(r.bottom <= r.rule - 12, name + ': clear of the rule ' + JSON.stringify(r));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-shabbat *')), [], name + ' shabbat');
      assert.deepEqual((await p.evaluate(legibility, '#screen-shabbat *')).bad, [], name + ' legible');
      await shot(p, 'reading-' + name + '-' + lang);
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
