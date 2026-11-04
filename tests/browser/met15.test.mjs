// Batch 15 (the owner, 2026-11-02: «да, добавь MET Norway как запасной»; «каждый раз пытаться первый вариант - при ошибке
// второй»). Open-Meteo answers 503 and MET Norway answers from its recordings (tests/fixtures/met, asked 2026-11-02 15:2x UTC):
// the same refresh asks MET — 6 forecasts and 6 sunrise requests, Open-Meteo once — and the main and Israel screens show the
// weather with «… · MET Norway» on their status. B14-1: on the hourly card the status never comes nearer than 24 px to the title
// and the dust legend (a shorter form when the full one does not fit), in the MET, khamsin and stale states; B14-3: a stale
// time of another day carries its date. OWNER-1LEG-C: the title row carries the title only — the gap is measured against the
// title, and the khamsin pill is the one legend's, on the current card's dust item. B17-V1: the failed card says «Временно недоступно». B15_SHOTS=<dir> writes main-<lang>-met.png, israel-<lang>-met.png, main-<lang>-stale-met.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, airAnswer, metAnswer } from './page.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const NOW = Date.parse('2026-11-02T15:25:00Z');          // 17:25 in Israel, minutes after MET's recordings
const DAY = 86400000;
const overloaded = { status: 503, body: JSON.stringify({ error: true, reason: 'The service is overloaded' }) };
// B17-V1: the state block's failed word (the pre-B17 sentences «Погода временно недоступна» … are gone from the product)
const FAILED = { ru: 'Временно недоступно', he: 'לא זמין כרגע', uk: 'Тимчасово недоступно' };
const ISRAEL_MET = { ru: 'Обновлено в 17:25 · MET Norway', he: 'עודכן ב־17:25 · MET נורווגיה', uk: 'Оновлено о 17:25 · MET Norway' };
const SOURCE = { ru: /MET/, he: /MET נורווגיה/, uk: /MET/ };
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
// The air answer with every place's dust at 240 µg/m³: a khamsin (the legend's amber pill).
const khamsin = (n, url) => { const a = airAnswer(url), list = JSON.parse(a.body); for (const p of list) p.current.dust = 240; return Object.assign(a, { body: JSON.stringify(list) }); };
// The gap between the hourly card's status and its title (B14-1; OWNER-1LEG-C: the title row has no legend), the status text,
// and the one legend's khamsin pill (on the current card's dust item).
const head = () => {
  const r = (e) => e.getBoundingClientRect(), st = document.getElementById('status'), h = document.querySelector('#hourly .card-head');
  const s = r(st), t = r(h.querySelector('.card-title')), rtl = document.dir === 'rtl';
  return { text: st.textContent, gap: Math.round(rtl ? t.left - s.right : s.left - t.right), titleLegends: h.querySelectorAll('.dust-legend').length,
    sameRow: s.top < t.bottom && t.top < s.bottom, pill: !!document.querySelector('#hourly .card-head .dust-legend-scale.is-active') };   // B22 fix 1: the key on the hourly title row
};

for (const lang of ['ru', 'he', 'uk']) {
  test('B15 ' + lang + ': Open-Meteo 503 → MET in the same refresh (1 + 12 requests); main and Israel show its weather labelled MET; the header gap ≥ 24 px, khamsin too', async () => {
    const app = await openApp({ lang, weather: () => overloaded, met: 'ok', air: khamsin, news: 'ok', alerts: 'empty-bom.txt', now: NOW,
      configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForFunction(() => /MET/.test(document.getElementById('status').textContent), { timeout: 15000 });
      await p.waitForSelector('#hourly .card-head .dust-legend-scale.is-active', { timeout: 10000 });   // B22 (owner 2026-11-04, judges' common decision, city card, fix 1)
      await p.evaluate(() => document.fonts.ready); await wait(500);
      assert.equal(app.weatherRequests.length, 1, 'Open-Meteo asked once');
      assert.equal(app.requests.met.length, 12, 'MET: one forecast and one sunrise request per place');
      assert.equal(app.requests.met.filter((r) => r.url.indexOf('/locationforecast/2.0/complete?') > 0).length, 6);
      assert.ok(app.requests.met.every((r) => r.method === 'GET' && !r.headers['user-agent-override']), 'plain GETs, no header faked');
      const h = await p.evaluate(head);
      assert.match(h.text, SOURCE[lang], 'the source is named: ' + h.text);
      assert.match(h.text, /17:25/);
      assert.ok(h.pill, 'the khamsin pill is on');
      assert.equal(h.titleLegends, 1, 'B22 fix 1: the one khamsin key on the hourly title row');
      assert.ok(!h.sameRow || h.gap >= 24, lang + ': the status ' + h.gap + ' px from the title: ' + h.text);
      const main = await p.evaluate(() => ({ temp: (document.querySelector('#now .now-temp') || {}).textContent || null, text: document.getElementById('screen-main').textContent,
        sunrise: [...document.querySelectorAll('#now .detail')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()) }));
      assert.ok(main.temp, 'MET\'s temperature on the card');
      // FIX-15B Y3 (owner D-F1 «прочерк»): MET starts at the current hour, so today's max, min and UV max are «—»
      const today = await p.evaluate(() => ({ sub: [...document.querySelectorAll('#now .now-sub span')].map((e) => e.textContent.trim()),
        uv: document.querySelector('#now .air-uv .air-num').textContent.trim() }));
      // B22 (owner 2026-11-04, judges' common decision, city card, fix 3): the line holds only «feels like» — no max / min left to say «—»
      assert.deepEqual([today.sub.length, today.uv], [1, '—'], JSON.stringify(today));
      assert.equal(main.text.indexOf(FAILED[lang]), -1);
      assert.ok(main.sunrise.some((t) => /05:57/.test(t)) && main.sunrise.some((t) => /16:50/.test(t)), 'the sun from MET: ' + JSON.stringify(main.sunrise));
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      assert.deepEqual((await p.evaluate(legibility, '#screen-main .status *, #screen-main .status')).bad, [], lang + ' the status legible');
      if (process.env.B15_SHOTS) { fs.mkdirSync(process.env.B15_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.B15_SHOTS, 'main-' + lang + '-met.png') }); }
      await press(p, 39); await wait(900);
      const israel = await p.evaluate(() => ({ status: document.getElementById('israel-status').textContent,
        cards: [...document.querySelectorAll('#screen-israel .region')].map((c) => c.className), text: document.getElementById('screen-israel').textContent }));
      assert.equal(israel.status, ISRAEL_MET[lang]);
      assert.deepEqual(israel.cards, ['card region', 'card region', 'card region'], 'every region drawn, fresh');
      assert.equal(israel.text.indexOf(FAILED[lang]), -1);
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), [], lang + ' israel');
      if (process.env.B15_SHOTS) await p.screenshot({ path: path.join(process.env.B15_SHOTS, 'israel-' + lang + '-met.png') });
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

// A restart a day later while both sources fail: MET's kept answer (batch 14) is shown stale, with its date and its source.
const CLOCK = 'try { window.__offsetMs = Number(sessionStorage.getItem("b15.offset")) || 0; } catch (e) {}';
for (const lang of ['ru', 'he', 'uk']) {
  test('B15 ' + lang + ': restarted a day later, both sources down — MET\'s kept weather, stale, with its date and source; the header gap ≥ 24 px', async () => {
    const app = await openApp({ lang, weather: () => overloaded, met: (n, url) => (n <= 12 ? metAnswer(url) : Object.assign({ contentType: 'application/json' }, overloaded)), air: 'ok', news: 'ok', alerts: 'empty-bom.txt',
      now: NOW, init: CLOCK, configure: (c) => { c.rotation.enabled = false; } });
    try {
      const p = app.page;
      await p.waitForFunction(() => /MET/.test(document.getElementById('status').textContent), { timeout: 15000 });
      await wait(500);
      await p.evaluate((ms) => sessionStorage.setItem('b15.offset', String(ms)), DAY);
      await p.reload({ waitUntil: 'load' });
      await p.waitForFunction(() => document.querySelector('#now .now-temp, #now .state'), { timeout: 10000 });   // B17-V1: .state
      await wait(2000);
      await p.evaluate(() => document.fonts.ready);
      const h = await p.evaluate(head);
      assert.match(h.text, /02\.11 17:25/, 'the date of another day (B14-3): ' + h.text);
      assert.match(h.text, SOURCE[lang]);
      assert.ok(!h.sameRow || h.gap >= 24, lang + ': ' + h.gap + ' px: ' + h.text);
      assert.ok(await p.$('#now .now-temp'), 'the kept MET weather on the card');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' main');
      if (process.env.B15_SHOTS) await p.screenshot({ path: path.join(process.env.B15_SHOTS, 'main-' + lang + '-stale-met.png') });
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
