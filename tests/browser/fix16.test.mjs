// Batch 16 (the full-repository review at 2cccd73): the visible fixes at the TV's 1920×1080 in headless Chrome, ru / he / uk.
// L2 the neutral shield before the first answer · D-T2 / L1 Ukrainian stale news fits, said once · X5 the «—» of no dust is
// muted · D-C4 seven-digit prices in every Markets card · L8 one calm card when no price at all · L16 the map's home name and
// traffic key · L6 the holidays card when the calendar fails · L10 the Israel cards' rows on one line · L12 a dry day's icon on
// the row's centre · L15 one left edge on the traffic screen · D-P1 no outer card shadow · Codex L1 the commodity units.
// FIX16_SHOTS=<dir> also writes a screenshot of each state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, withoutHeadlineClamp, ROOT, weatherAnswer } from './page.mjs';

const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'markets-view-snapshot.json'), 'utf8'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, LEFT = 37;
const SCREENS = ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'];
// The screen `id` on view and settled (its cross-fade and slide over: what a viewer sees, and boxes at rest).
const settled = (p, id) => p.waitForFunction((id) => { const s = document.querySelector('.screen.is-active'), cs = getComputedStyle(s);
  return s.id === 'screen-' + id && cs.opacity === '1' && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)'); }, {}, id);
const toScreen = async (p, id) => { for (let i = 0; i < SCREENS.indexOf(id); i++) await press(p, RIGHT); await settled(p, id); };
const STILL = (c) => { c.rotation.enabled = false; };
const TOKEN = (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; };
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
const shot = async (p, name) => { if (!process.env.FIX16_SHOTS) return; fs.mkdirSync(process.env.FIX16_SHOTS, { recursive: true }); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: path.join(process.env.FIX16_SHOTS, name + '.png') }); };

test('L2: before the alert feed\'s first answer the shield is grey with no check; after it, green with its check', async () => {
  const silent = await openApp({ alerts: { hang: true }, configure: STILL });
  try {
    const p = silent.page;
    await press(p, LEFT);
    await settled(p, 'alerts');
    await p.waitForSelector('.al-home.is-checking');
    const v = await p.evaluate(() => { const g = document.querySelector('.al-home .ic-shield'), paths = g.querySelectorAll('path');
      return { stroke: getComputedStyle(paths[0]).stroke, check: getComputedStyle(paths[1]).display, text: document.querySelector('.al-home-main').textContent }; });
    assert.deepEqual(v, { stroke: 'rgba(255, 255, 255, 0.62)', check: 'none', text: 'Проверяем…' }, 'neutral: never the green «all clear» before any data');
    await shot(p, 'l2-ru-checking');
  } finally { await silent.close(); }
  const quiet = await openApp({ alerts: 'empty-bom.txt', configure: STILL });
  try {
    const p = quiet.page;
    await press(p, LEFT);
    await p.waitForFunction(() => document.querySelector('.al-home') && !document.querySelector('.al-home.is-checking'));
    const v = await p.evaluate(() => { const paths = document.querySelectorAll('.al-home .ic-shield path'); return [getComputedStyle(paths[0]).stroke, getComputedStyle(paths[1]).display]; });
    assert.deepEqual(v, ['rgb(140, 230, 180)', 'inline'], 'answered and quiet: the green shield with its check');
  } finally { await quiet.close(); }
});

test('D-T2 / L1 / N11 / FIX-17B 4: Ukrainian, one feed not updating — always said under a fresh header (its minute too); «дані від 20:32» on one line, nothing cut; both stale — said once', async () => {
  let econ = 0;
  const one = await openApp({ lang: 'uk', alerts: 'empty-bom.txt', configure: (c) => { c.news.refreshMs = 400; c.rotation.enabled = false; },
    news: (url) => (url.includes('epravda') && ++econ > 1 ? { status: 503, body: '' } : null) });
  try {
    const p = one.page;
    await toScreen(p, 'news');
    // FIX-17B 4 (Codex F2): failed, its stories from the FRESH header's own minute (20:32) — the column still says it is not
    // updating (the header speaks for the current column, never for a stale one); only a stale header at the same minute
    // makes it say nothing (N11, the both-stale case below)
    await p.waitForFunction(() => /^Оновлено о 20:32$/.test(document.getElementById('news-status').textContent), { timeout: 8000 });
    for (const end = Date.now() + 5000; econ < 3 && Date.now() < end;) await wait(50);
    assert.ok(econ >= 3, 'the economy feed has failed since');
    await p.waitForSelector('.news-col-state', { timeout: 8000 });
    assert.deepEqual(await p.$$eval('.news-col-state', (e) => e.map((x) => x.textContent)), ['дані від 20:32'], 'a stale column under a fresh header at its minute: said');
    // three minutes on: the Ukraine feed is current at 20:35, the economy column says its own older minute
    await p.evaluate(() => { window.__offsetMs = 3 * 60000; });
    await p.waitForFunction(() => /^Оновлено о 20:3[5-9]$/.test(document.getElementById('news-status').textContent), { timeout: 8000 });
    await p.evaluate(() => document.fonts.ready);
    const v = await p.evaluate(() => { const s = document.querySelector('.news-col-state'), h = s.parentNode;
      return { text: s.textContent, fits: s.scrollWidth <= s.clientWidth && h.scrollWidth <= h.clientWidth, head: Math.round(h.getBoundingClientRect().height),
        header: document.getElementById('news-status').textContent }; });
    assert.equal(v.text, 'дані від 20:32');
    assert.ok(v.fits, 'inside its column head');
    assert.equal(v.head, 48, 'the head keeps its one line');
    assert.match(v.header, /^Оновлено о 20:3[5-9]$/);
    assert.deepEqual(clean(withoutHeadlineClamp(await p.evaluate(measure, '#screen-news *'))), []);
    await shot(p, 'l1-uk-news-one-stale');
  } finally { await one.close(); }
  let n = 0;
  const both = await openApp({ lang: 'uk', alerts: 'empty-bom.txt', configure: (c) => { c.news.refreshMs = 400; c.rotation.enabled = false; },
    news: () => (++n > 2 ? { status: 503, body: '' } : null) });
  try {
    const p = both.page;
    await toScreen(p, 'news');
    await p.waitForSelector('#news-status.is-stale', { timeout: 8000 });
    const v = await p.evaluate(() => ({ header: document.getElementById('news-status').textContent, states: [...document.querySelectorAll('.news-col-state')].map((e) => e.textContent) }));
    assert.match(v.header, /^Не оновлюється · дані від 20:3\d$/);
    assert.deepEqual(v.states, [], 'the header says it: the columns do not repeat it');
    await shot(p, 'l1-uk-news-both-stale');
  } finally { await both.close(); }
});

test('X5: «—» for no dust value is muted grey, never the dust colour (the V5 mutant)', async () => {
  const app = await openApp({ weather: 'ok', air: 'fail', configure: STILL });
  try {
    const p = app.page;
    await p.waitForSelector('.hour-dust .dust-none', { timeout: 10000 });
    const colours = await p.$$eval('.hour-dust .dust-none, .day-dust .dust-none', (e) => [...new Set(e.map((x) => getComputedStyle(x).color))]);
    assert.deepEqual(colours, ['rgba(255, 255, 255, 0.62)']);
    const dust = await p.$eval('.hour-dust', (e) => getComputedStyle(e).color);
    assert.equal(dust, 'rgb(227, 207, 166)', 'the slot itself keeps the dust colour (for a figure)');
  } finally { await app.close(); }
});

// D-C4: the price struts are fixed per card; each card's headroom is pinned here, in whole digits, against today's widest
// quote (2026-11-02): the rates 41,6 → 3 digits; US shares 4 → 6; Israeli shares (shekels) 4 → 6; crypto 6 (BTC) → 6;
// indices 5 (the Dow) → 5; commodities 4 (gold per ounce) → 4 — every name whole, every cell inside its card, the
// decimals of a card in one column, in ru, he and uk.
const HEADROOM = { 'mk-fx': 3, 'mk-us': 6, 'mk-il': 6, 'mk-crypto': 6, 'mk-indices': 5, 'mk-commodities': 4 };
test('D-C4 / Codex L1: every Markets card holds its pinned number of digits — nothing cut, the decimals in one column; the units shown', async () => {
  for (const lang of ['ru', 'he', 'uk']) {
    const app = await openApp({ lang, markets: 'ok', alerts: 'empty-bom.txt', configure: STILL });
    try {
      const p = app.page;
      await toScreen(p, 'markets');
      await p.waitForSelector('#mk-commodities .mk-price', { timeout: 10000 });
      const units = await p.$$eval('#mk-commodities .mk-per', (e) => e.map((x) => x.textContent));
      assert.equal(units.length, 6, lang + ': every commodity says what its price is for');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-markets .card, #screen-markets .card *, #screen-markets .screen-head *')), [], lang + ' recorded');
      await shot(p, 'units-' + lang + '-markets');
      // every row of a card at its pinned width, through the view itself (the language's own figures and separators)
      const v = await p.evaluate((HEADROOM, snap) => {
        for (const g of snap.groups) for (const r of g.rows) r.price = +('987654321'.slice(0, HEADROOM['mk-' + g.id]) + '.55');
        MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
        const cards = document.querySelectorAll('#screen-markets .mk-card'), r = (e) => e.getBoundingClientRect();
        return [...cards].map((c) => ({ id: c.id, seps: [...c.querySelectorAll('.mk-price')].map((pr) => { const t = pr.firstChild, i = t.textContent.search(/[,.]\d+\D*$/); if (i < 0) return null; const q = document.createRange(); q.setStart(t, i); q.setEnd(t, i + 1); return Math.round(q.getBoundingClientRect().left); }),
          inside: [...c.querySelectorAll('.mk-row > span')].every((s) => r(s).right <= r(c).right + 0.5 && r(s).left >= r(c).left - 0.5) }));
      }, HEADROOM, SNAP);
      for (const c of v) {
        assert.ok(c.inside, lang + ' ' + c.id + ': every cell inside its card');
        const seps = c.seps.filter((x) => x !== null);
        assert.ok(Math.max(...seps) - Math.min(...seps) <= 1, lang + ' ' + c.id + ': decimals in one column ' + seps);
      }
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-markets .card, #screen-markets .card *, #screen-markets .screen-head *')), [], lang + ' seven digits');
      await shot(p, 'dc4-' + lang + '-markets-headroom');
    } finally { await app.close(); }
  }
});

test('L8 / B17-V1: no price anywhere — one calm card holds the state block «Временно недоступно · Повторим позже», the header stays amber without a sentence; nothing cut', async () => {
  const app = await openApp({ markets: 'fail', alerts: 'empty-bom.txt', configure: STILL });
  try {
    const p = app.page;
    await toScreen(p, 'markets');
    await p.waitForSelector('.mk-body.is-none', { timeout: 10000 });
    const v = await p.evaluate(() => ({ cards: [...document.querySelectorAll('.mk-card')].filter((c) => c.getBoundingClientRect().width).length,
      none: [...document.querySelectorAll('#mk-none .state.is-failed > *')].map((e) => e.tagName === 'svg' ? 'glyph' : e.className + ':' + e.textContent),
      header: document.getElementById('markets-status').className + '|' + document.getElementById('markets-status').textContent }));
    // B17-V1: the one block — the chart glyph, the state word and «Повторим позже» (markets has no next attempt to name)
    assert.deepEqual(v, { cards: 0, none: ['glyph', 'state-text:Временно недоступно', 'state-sub:Повторим позже'], header: 'status screen-status is-failed|' });
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-markets .card, #screen-markets .card *, #screen-markets .screen-head *')), []);
    await shot(p, 'l8-ru-markets-none');
  } finally { await app.close(); }
});

test('L16: the map — the home dot named beside it, the traffic colours keyed with the traffic words; ru and he, nothing cut', async () => {
  for (const [lang, name, words] of [['ru', 'Реховот', ['Свободно', 'Затруднено', 'Пробка']], ['he', 'רחובות', ['זורם', 'איטי', 'פקק']]]) {
    const app = await openApp({ lang, map: 'ok', traffic: 'ok', alerts: 'empty-bom.txt', configure: TOKEN });
    try {
      const p = app.page;
      await toScreen(p, 'map');
      await p.waitForSelector('.map-img', { timeout: 10000 });
      const v = await p.evaluate(() => { const r = (e) => e.getBoundingClientRect(), dot = r(document.querySelector('.map-home')), label = r(document.querySelector('.map-home-name'));
        return { name: document.querySelector('.map-home-name').textContent, key: [...document.querySelectorAll('.map-key-item')].map((e) => e.textContent),
          beside: label.left >= dot.right && label.left - dot.right <= 24 && label.top < dot.bottom && dot.top < label.bottom,
          swatches: [...document.querySelectorAll('.map-key-line')].map((e) => getComputedStyle(e).backgroundColor) }; });
      assert.deepEqual([v.name, v.key, v.beside], [name, words, true], lang);
      assert.equal(new Set(v.swatches).size, 3, 'three different colours');
      assert.deepEqual(clean(await p.evaluate(measure, '#screen-map *')), [], lang);
      assert.deepEqual((await p.evaluate(legibility, '#screen-map .map-key *, #screen-map .map-home-name')).bad, [], lang + ' legible');
      await shot(p, 'l16-' + lang + '-map');
    } finally { await app.close(); }
  }
});

test('L6 / B17-V1 / B17-V2: the calendar fails — the holidays card says «Временно недоступно» (never blank), the retry is said once, in the week card; the header says nothing', async () => {
  const app = await openApp({ hebcal: 'fail', alerts: 'empty-bom.txt', configure: STILL });
  try {
    const p = app.page;
    await toScreen(p, 'shabbat');
    await p.waitForSelector('.sh-list .state.is-failed', { timeout: 10000 });
    const v = await p.evaluate(() => { const t = (s) => { const e = document.querySelector(s); return e ? e.textContent : null; };
      return { list: t('.sh-list .state.is-failed .state-text'), listSub: t('.sh-list .state-sub'), week: t('.sh-week .state.is-failed .state-text'),
        weekSub: t('.sh-week .state.is-failed .state-sub'), glyph: !!document.querySelector('.sh-week .state.is-failed > svg'),
        header: document.getElementById('shabbat-status').textContent, cls: document.getElementById('shabbat-status').className }; });
    assert.deepEqual([v.list, v.listSub], ['Временно недоступно', null], 'B17-V1: card C says it, no retry line');
    assert.deepEqual([v.week, v.glyph], ['Временно недоступно', true], 'B17-V1: card A, the candles glyph');
    assert.match(v.weekSub, /^Повторим (в \d\d:\d\d|позже)$/, 'the retry said once, in card A');
    assert.equal(v.header, '', 'B17-V2: no data, no header sentence');
    assert.match(v.cls, /is-failed/);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-shabbat *')), []);
    await shot(p, 'l6-ru-shabbat-failed');
  } finally { await app.close(); }
});

test('L10 / L12 / L15 / D-P1: the Israel cards\' days start on one line (uk), a dry day\'s icon on the row\'s centre, one left edge on Traffic, no outer card shadow', async () => {
  const app = await openApp({ lang: 'uk', weather: 'ok', traffic: 'ok', alerts: 'empty-bom.txt', configure: TOKEN });
  try {
    const p = app.page;
    await p.waitForSelector('.day', { timeout: 10000 });
    const main = await p.evaluate(() => [...document.querySelectorAll('#daily .day')].filter((d) => d.querySelector('.day-icon.is-dry')).map((d) => {
      const a = d.getBoundingClientRect(), i = d.querySelector('.day-icon > .icon').getBoundingClientRect(); return Math.round(Math.abs((a.top + a.bottom) / 2 - (i.top + i.bottom) / 2)); }));
    assert.ok(main.length > 0 && main.every((d) => d <= 1), 'L12: every dry day\'s icon on the row\'s centre: ' + main);
    assert.equal(await p.$eval('.card', (e) => getComputedStyle(e).boxShadow), 'rgba(255, 255, 255, 0.14) 0px 1px 0px 0px inset', 'D-P1: the inset line only');
    await press(p, RIGHT);
    await settled(p, 'israel');
    const isr = await p.evaluate(() => [...document.querySelectorAll('#screen-israel .region')].map((c) => ({ day: Math.round(c.querySelector('.day').getBoundingClientRect().top),
      sub: Math.round(c.querySelector('.region-sub').getBoundingClientRect().height), text: c.querySelector('.region-sub').textContent })));
    assert.equal(new Set(isr.map((c) => c.day)).size, 1, 'L10: the first day on one line across the cards ' + JSON.stringify(isr.map((c) => c.day)));
    assert.ok(isr.every((c) => c.sub === 34 && !/·/.test(c.text)), 'L10 → batch 18: ONE line (34 px), no «·»');
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-israel *')), []);
    await shot(p, 'l10-uk-israel');
    for (let i = 0; i < 4; i++) await press(p, RIGHT);
    await settled(p, 'traffic');
    await p.waitForSelector('.tw-name', { timeout: 10000 });
    const edges = await p.evaluate(() => { const x = (s) => { const e = document.querySelector('#screen-traffic ' + s), q = document.createRange(); q.selectNodeContents(e); return Math.round(q.getBoundingClientRect().left); };
      return [x('.screen-title'), x('.tcol-title'), x('.tw-name')]; });
    // D-ROUTES20: a widget is one line now — its name starts on the edge; its time and length are end-aligned columns
    assert.equal(new Set(edges).size, 1, 'L15: the title, the column title and the widgets\' names on one left edge: ' + edges);
    assert.deepEqual(clean(await p.evaluate(measure, '#screen-traffic *')), []);
    await shot(p, 'l15-uk-traffic');
  } finally { await app.close(); }
});

// ---- FIX-16B (the review panel) --------------------------------------------------------------------------------------------
test('N1: a three-line headline is 3 × 38 = 114 px, and at least 16 px stay under its third line, in ru, he and uk', async () => {
  for (const lang of ['ru', 'he', 'uk']) {
    const app = await openApp({ lang, news: 'ok', alerts: 'empty-bom.txt', configure: STILL });
    try {
      const p = app.page;
      await toScreen(p, 'news');
      await p.waitForSelector('.news-title');
      await p.evaluate(() => document.fonts.ready);
      const v = await p.evaluate(() => [...document.querySelectorAll('.news-row')].map((row) => {
        const t = row.querySelector('.news-title'); if (!t) return null;
        const r = row.getBoundingClientRect(), b = t.getBoundingClientRect(), cs = getComputedStyle(t);
        return { h: Math.round(b.height), below: Math.round((r.bottom - b.bottom) * 10) / 10, font: cs.fontSize, lh: cs.lineHeight };
      }).filter(Boolean));
      assert.equal(v.length, 10, lang);
      for (const x of v) assert.deepEqual([x.h, x.font, x.lh], [114, '28px', '38px'], lang);   // B17-T1: the type scale (30 → 28), the 38 px line box kept
      assert.ok(v.every((x) => x.below >= 16), lang + ': space under the third line ' + v.map((x) => x.below));
      await shot(p, 'n1-' + lang + '-news');
    } finally { await app.close(); }
  }
});

test('R16-5: a closed price that is also stale keeps the stale grey; a closed fresh one the quiet-strong tint', async () => {
  const app = await openApp({ markets: 'ok', alerts: 'empty-bom.txt', configure: STILL });
  try {
    const p = app.page;
    await toScreen(p, 'markets');
    const v = await p.evaluate((snap) => {
      snap.groups[1].rows[0].closed = true; snap.groups[1].rows[0].stale = true; snap.groups[1].rows[1].closed = true; delete snap.groups[1].rows[1].stale;
      MarketsView.render(snap, { kind: 'stale', updated: '14:32' });
      const rows = document.querySelectorAll('#mk-us .mk-row');
      return [rows[0].className, getComputedStyle(rows[0].querySelector('.mk-price')).color, rows[1].className, getComputedStyle(rows[1].querySelector('.mk-price')).color];
    }, SNAP);
    assert.deepEqual(v, ['mk-row is-closed is-stale', 'rgba(255, 255, 255, 0.62)', 'mk-row is-closed', 'rgba(255, 255, 255, 0.85)']);
  } finally { await app.close(); }
});

test('N6 / B17-V3 / N7 / N9 / N8: Traffic says «Оновлено о 20:32 · Щойно» (never «0 хв тому»); the alert column labels one line, one baseline; no rule over a day past the data; no legend over a failed card', async () => {
  // N9: the forecast answers five days, so the 7-day card ends with two gap rows
  const fiveDays = (n, url) => ({ status: 200, body: JSON.stringify(JSON.parse(weatherAnswer(url)).map((w) => {
    for (const k of Object.keys(w.daily)) w.daily[k] = w.daily[k].slice(0, 5);
    return w; })) });
  const app = await openApp({ lang: 'uk', weather: fiveDays, traffic: 'ok', history: 'history.json', alerts: 'empty-bom.txt', configure: TOKEN });
  try {
    const p = app.page;
    // FIX-BATCH-19 5 (supersedes N9's empty rows): a day past the data is its own named row with «—» for its values, never an
    // empty slot — five days of data give two such rows in the 7-day list
    await p.waitForSelector('#daily .day-max');
    const past = await p.evaluate(() => [...document.querySelectorAll('#daily .days .day')].filter((d) => d.querySelector('.day-max') && d.querySelector('.day-max').textContent === '—')
      .map((d) => [d.querySelector('.day-name').textContent !== '', d.classList.contains('is-gap')]));
    assert.deepEqual(past, [[true, false], [true, false]], 'two days past the data, each named, none an empty gap');
    await toScreen(p, 'traffic');
    await p.waitForSelector('.tw-name');
    // B17-V3: fresh with its age; under a minute I18n.ago says «Щойно» — never «0 хв тому» (N6)
    assert.equal(await p.$eval('#traffic-status', (e) => e.textContent), 'Оновлено о 20:32 · Щойно');
    for (let i = 0; i < 2; i++) await press(p, RIGHT);
    await settled(p, 'alerts');
    await p.waitForSelector('.al-heads');
    const heads = await p.evaluate(() => [...document.querySelectorAll('.al-heads > div')].map((d) => { const q = document.createRange(); q.selectNodeContents(d); const rs = q.getClientRects(); return { text: d.textContent, lines: rs.length, bottom: Math.round(rs[0].bottom) }; }));
    assert.deepEqual(heads.map((h) => h.text), ['Час', 'Тривога', 'Райони (івритом)']);
    assert.ok(heads.every((h) => h.lines === 1), 'N7: each label one line');
    assert.equal(new Set(heads.map((h) => h.bottom)).size, 1, 'N7: one baseline ' + heads.map((h) => h.bottom));
    await shot(p, 'n7-uk-alerts');
  } finally { await app.close(); }
  const failed = await openApp({ weather: 'fail', alerts: 'empty-bom.txt', configure: STILL });
  try {
    await failed.page.waitForSelector('.wx-none');
    assert.equal(await failed.page.$$eval('.dust-legend', (e) => e.length), 0, 'N8: no rows, no legend');
    await shot(failed.page, 'n8-ru-weather-failed');
  } finally { await failed.close(); }
});

test('N4: the Ukrainian banner says «від 20:32»', async () => {
  const app = await openApp({ lang: 'uk', alerts: 'rehovot.json', configure: STILL });
  try {
    const p = app.page;
    await p.waitForSelector('.alert.is-on');
    await press(p, RIGHT);
    await p.waitForSelector('.banner.is-on');
    assert.equal(await p.$eval('.banner-text', (e) => e.textContent), 'Тривога в Реховоті · від 20:32');
  } finally { await app.close(); }
});

// S1 (FIX-16B observation, now a decision): a restart inside a hold opens the alert and rings again — «when unsure, alert».
test('S1: an alert held across a restart is on screen at once and rings again (a decision: when unsure, alert)', async () => {
  const now = Date.parse('2026-10-29T18:34:00Z');
  const saved = JSON.stringify({ v: 1, own: { startedAt: now - 60000, tracks: { 'רחובות': { holdUntil: now + 9 * 60000, lastSeenAt: now - 60000, maxHold: 600000,
    record: { title: 'ירי רקטות וטילים', desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות', data: ['רחובות'] } } } }, near: null });
  const init = 'localStorage.setItem("homedash.alerts", ' + JSON.stringify(saved) + '); window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push("wav"); return Promise.resolve(); };' +
    'var connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (t) { if (t instanceof AudioDestinationNode) window.__plays.push("chime"); return connect.apply(this, arguments); };';
  const app = await openApp({ now, alerts: { hang: true }, init, configure: STILL });
  try {
    const p = app.page;
    await p.waitForSelector('.alert.is-on', { timeout: 5000 });
    const v = await p.evaluate(() => ({ screen: document.querySelector('.screen.is-active').id, since: document.querySelector('.alert-since').textContent, plays: window.__plays.slice() }));
    assert.deepEqual(v, { screen: 'screen-alerts', since: 'С 20:33', plays: ['chime'] }, 'restored before any answer of the feed (it never answers here)');
  } finally { await app.close(); }
});
