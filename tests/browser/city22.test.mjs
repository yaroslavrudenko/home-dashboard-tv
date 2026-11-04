// B22 — owner 2026-11-04 (judges' common decision, city card): the «Реховот» card unloaded. The owner: «мне главное разгрузить
// секцию где показывается Город». Seven agreed fixes (one each, built as decided):
//   1 the grades' scale [100|121|196|271] + «мкг/м³» leaves the city card for the hourly title row, after its «Пыль»; the row
//     stays one line; only the top grade on screen is lit, the rest quiet grey; the key is there whenever the rows are
//   2 the card's «Пыль» label grey like «Качество воздуха» / «УФ макс.»
//   3 «Макс.» / «Мин.» gone: the line under the condition holds only «Ощущается как», always 34 px
//   4 the air column AQ → dust → UV; the UV figure quiet after sunset too; a stale night UV never dimmed twice
//   5 the air column 256 px + 32 px end margin (its start edge unchanged)
//   6 «Осадки» gone: four details
//   7 the big icon 176 × 176, stroke 1.9
// At 1920×1080 in ru, he, uk, en. CITY22_SHOTS=<dir> writes main-<lang>-<calm|khamsin>.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, airForecastAnswer, weatherAnswer, FIXED_NOW } from './page.mjs';

const REAL = 'aq-4places-hourly-2026-11-02';
const LANGS = ['ru', 'he', 'uk', 'en'];
const KG = { 1: 'rgb(255, 210, 122)', 2: 'rgb(255, 160, 90)', 3: 'rgb(255, 122, 89)', 4: 'rgb(242, 85, 85)' };
const MUTED = 'rgba(255, 255, 255, 0.62)', MUTED_FILL = 'rgba(255, 255, 255, 0.06)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const wake = (p) => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const clean = (boxes) => boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
// The recorded air answer with every place's current and hourly dust set to `dust` (null: none), the AQI to `aqi` if given.
const air = (dust, aqi) => () => {
  const list = JSON.parse(airForecastAnswer(REAL, -4)().body);
  for (const p of list) {
    p.current.dust = dust; p.hourly.dust = p.hourly.dust.map((d) => (d === null ? null : dust));
    if (aqi !== undefined) p.current.european_aqi = aqi;
  }
  return { status: 200, contentType: 'application/json', body: JSON.stringify(list) };
};
// The recorded weather with the current sky set to `code` (and day or night), the day's UV maximum to `uv`.
const weather = ({ code, isDay, uv }) => (n, url) => {
  const list = JSON.parse(weatherAnswer(url));
  for (const p of list) {
    if (code !== undefined) p.current.weather_code = code;
    if (isDay !== undefined) p.current.is_day = isDay ? 1 : 0;
    if (uv !== undefined) p.daily.uv_index_max = p.daily.uv_index_max.map(() => uv);
  }
  return { status: 200, body: JSON.stringify(list) };
};
const open = (lang, o) => openApp(Object.assign({ lang, alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } }, o));
const settle = async (p) => { await p.waitForSelector('#daily .day-max', { timeout: 10000 }); await p.waitForSelector('#now .air-dust', { timeout: 10000 }); await p.evaluate(() => document.fonts.ready); await wait(300); };

// Runs in the page: what the city card and the hourly title row show.
function card() {
  const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)], r = (e) => e.getBoundingClientRect();
  const head = q('#hourly .card-head'), kids = head ? [...head.children] : [], scale = all('#hourly .card-head .dust-legend-scale .dust-num');
  const sub = q('#now .now-sub'), uvNum = q('#now .air-uv .air-num'), icon = q('#now .now-icon svg');
  return {
    nowScales: all('#now .dust-legend-scale').length, headScales: all('#hourly .card-head .dust-legend-scale').length,
    headUnit: q('#hourly .card-head .dust-legend .air-unit') ? q('#hourly .card-head .dust-legend .air-unit').textContent : null,
    // one line: every part of the title row overlaps every other vertically
    headOneLine: kids.length > 0 && Math.max(...kids.map((k) => r(k).top)) < Math.min(...kids.map((k) => r(k).bottom)),
    headHeight: head ? Math.round(r(head).height) : null, headWrap: head ? getComputedStyle(head).flexWrap : null, headWidthOk: head ? head.scrollWidth <= head.clientWidth : null,
    hourlyHeight: Math.round(r(q('.hourly-card')).height),
    pills: scale.map((e) => ({ text: e.textContent, top: e.classList.contains('is-top'), color: getComputedStyle(e).color, fill: getComputedStyle(e).backgroundColor })),
    dustLabel: q('#now .air-dust .air-label') ? getComputedStyle(q('#now .air-dust .air-label')).color : null,
    aqLabel: getComputedStyle(q('#now .air-aq .air-label')).color,
    order: all('#now .now-air .air-item').map((e) => e.className.split(' ')[1]),
    details: all('#now .detail').length, detailCut: all('#now .detail-label, #now .detail-value').filter((e) => e.scrollWidth > e.clientWidth).length,
    sub: { spans: sub.querySelectorAll('span').length, height: Math.round(r(sub).height), text: sub.textContent.trim() },
    uvNight: q('#now .air-uv').classList.contains('is-night'), uvColor: uvNum ? getComputedStyle(uvNum).color : null, uvOpacity: uvNum ? getComputedStyle(uvNum).opacity : null,
    icon: icon ? [Math.round(r(icon).width), Math.round(r(icon).height), getComputedStyle(icon).strokeWidth, icon.getAttribute('class')] : null,
    // the air column's width and its box gap to the icon's box (on the inline end: right in ltr, left in rtl)
    air: [Math.round(r(q('#now .now-air')).width), Math.round(document.documentElement.dir === 'rtl' ? r(q('#now .now-air')).left - r(q('#now .now-icon')).right : r(q('#now .now-icon')).left - r(q('#now .now-air')).right)],
  };
}
// Runs in the page: the ink gap — from the widest air text (its text runs) to the big icon's drawing (its box when it draws nothing).
function inkGap() {
  const rtl = document.documentElement.dir === 'rtl', runs = [];
  const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) { const g = document.createRange(); g.selectNodeContents(c); runs.push(g.getBoundingClientRect()); } else if (c.nodeType === 1) walk(c); } };
  walk(document.querySelector('#now .now-air'));
  const svg = document.querySelector('#now .now-icon svg'), ink = [...svg.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((x) => x.width || x.height);
  const box = ink.length ? ink : [svg.getBoundingClientRect()];
  const textEnd = rtl ? Math.min(...runs.map((x) => x.left)) : Math.max(...runs.map((x) => x.right));
  const iconStart = rtl ? Math.max(...box.map((x) => x.right)) : Math.min(...box.map((x) => x.left));
  return { gap: Math.round(rtl ? textEnd - iconStart : iconStart - textEnd), cls: svg.getAttribute('class'), runs: runs.length };
}
// Runs in the page: the rects that must not move between the states (R8).
function rects() {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
  return { now: box('#now'), hourly: box('.hourly-card'), head: box('#hourly .card-head'), key: box('#hourly .card-head .dust-legend'), air: box('#now .now-air'), details: box('#now .details') };
}

for (const lang of LANGS) {
  test('B22 ' + lang + ': the city card unloaded — no scale in it, the key once on the hourly title row (one line, one lit grade in a khamsin), grey «Пыль», AQ → dust → UV, one 34 px «feels like» line, four details, a 176 px icon, nothing cut', async () => {
    for (const [name, dust] of [['calm', 25], ['khamsin', 250]]) {
      const app = await open(lang, { weather: 'ok', air: air(dust, dust >= 100 ? 150 : undefined) });
      try {
        const p = app.page;
        await settle(p);
        const v = await p.evaluate(card);
        assert.deepEqual([v.nowScales, v.headScales], [0, 1], lang + ' ' + name + ': the scale left the city card for the hourly title row (fix 1)');
        assert.ok(v.headUnit, lang + ': the unit after the scale');
        assert.deepEqual([v.headOneLine, v.headWidthOk, v.headWrap, v.hourlyHeight], [true, true, 'nowrap', 240], lang + ' ' + name + ': the title row one line, nothing cut, the card 240 px: ' + JSON.stringify(v));
        assert.deepEqual(v.pills.map((x) => x.text), ['100', '121', '196', '271']);
        if (name === 'calm') assert.deepEqual(v.pills.filter((x) => x.top || x.color !== MUTED || x.fill !== MUTED_FILL), [], lang + ': all four quiet on a calm day');
        else {
          assert.deepEqual(v.pills.filter((x) => x.top).map((x) => [x.text, x.fill]), [['196', KG[3]]], lang + ': only the top grade (250 → 3) lit');
          assert.deepEqual(v.pills.filter((x) => !x.top).filter((x) => x.color !== MUTED || x.fill !== MUTED_FILL), [], lang + ': the other three quiet');
        }
        assert.equal(v.dustLabel, v.aqLabel, lang + ': «Пыль» grey like «Качество воздуха» (fix 2)');
        assert.equal(v.dustLabel, MUTED);
        assert.deepEqual(v.order, ['air-aq', 'air-dust', 'air-uv'], lang + ': AQ → dust → UV (fix 4)');
        assert.deepEqual([v.details, v.detailCut], [4, 0], lang + ': four details, nothing cut (fix 6)');
        assert.deepEqual([v.sub.spans, v.sub.height], [1, 34], lang + ': only «feels like», 34 px (fix 3): ' + v.sub.text);
        assert.deepEqual(v.icon.slice(0, 3), [176, 176, '1.9px'], lang + ': the icon 176 × 176, stroke 1.9 (fix 7)');
        assert.deepEqual(v.air, [256, 32], lang + ': the air column 256 + 32 (fix 5)');
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main *')), [], lang + ' ' + name + ' main');
        assert.deepEqual((await p.evaluate(legibility, '#screen-main #now *, #screen-main #hourly .card-head *')).bad, [], lang + ' ' + name + ' legible');
        if (process.env.CITY22_SHOTS && lang !== 'en') { fs.mkdirSync(process.env.CITY22_SHOTS, { recursive: true }); await p.screenshot({ path: path.join(process.env.CITY22_SHOTS, 'main-' + lang + '-' + name + '.png') }); }
        assert.deepEqual(app.errors, []);
      } finally { await app.close(); }
    }
  });

  // Fix 4/5/7 (the a11y judge's threshold): ≥ 48 px between the widest air text and the icon's drawing, for every icon kind, on a
  // khamsin day with the longest level words (AQI 150 «опасное», UV 11 «экстремальный», dust 3400).
  test('B22 ' + lang + ': ≥ 48 px from the widest air text to the big icon — clear, cloud, rain, storm, unknown', async () => {
    for (const [kind, code] of [['clear', 0], ['cloud', 3], ['rain', 61], ['storm', 95], ['unknown', null]]) {
      const w = code === null
        // FIX-19B C1: a sky nobody knows — the next morning (stale19), the forecast hour with no code: the card's empty icon box
        ? (n, url) => { const list = JSON.parse(weatherAnswer(url)); for (const p of list) { p.hourly.weather_code = p.hourly.weather_code.map(() => null); p.daily.uv_index_max = p.daily.time.map(() => 11); } return { status: 200, body: JSON.stringify(list) }; }
        : weather({ code, isDay: true, uv: 11 });
      const app = await open(lang, { weather: w, air: air(3400, 150), now: code === null ? FIXED_NOW + 12.5 * 3600000 : FIXED_NOW });
      try {
        const p = app.page;
        await settle(p);
        const g = await p.evaluate(inkGap);
        if (code === null) assert.equal(g.cls, 'icon w-none', lang + ': the unknown sky');
        assert.ok(g.runs >= 6 && g.gap >= 48, lang + ' ' + kind + ': ' + JSON.stringify(g));
        assert.deepEqual(clean(await p.evaluate(measure, '#screen-main #now *')), [], lang + ' ' + kind);
      } finally { await app.close(); }
    }
  });
}

// Fix 1: the boundaries — 99 nothing lit; 100/120 grade 1; 121/195 grade 2; 196/270 grade 3; 271 grade 4: exactly one lit pill.
// B22 follow-up (verification, Codex): in all four languages, as the layout tests
for (const lang of LANGS) {
test('B22 ' + lang + ': the key lights exactly one grade at the boundaries 99/100/120/121/195/196/270/271', async () => {
  for (const [dust, top] of [[99, 0], [100, 1], [120, 1], [121, 2], [195, 2], [196, 3], [270, 3], [271, 4]]) {
    const app = await open(lang, { weather: 'ok', air: air(dust) });
    try {
      const p = app.page;
      await settle(p);
      const pills = (await p.evaluate(card)).pills, lit = pills.filter((x) => x.top);
      assert.deepEqual(lit.map((x) => [x.text, x.fill]), top ? [[['100', '121', '196', '271'][top - 1], KG[top]]] : [], lang + ' ' + dust + ' µg/m³');
      assert.equal(pills.filter((x) => !x.top && (x.color !== MUTED || x.fill !== MUTED_FILL)).length, 0, lang + ' ' + dust + ': the rest quiet');
    } finally { await app.close(); }
  }
});
}

// Fix 4: by day the UV figure in its own colour; after sunset quiet (62 %); stale at night not dimmed again (≥ 4.5:1).
for (const lang of LANGS) {
test('B22 ' + lang + ': the UV figure — 0.92 by day, 62 % after sunset, and a stale night UV stays at 62 % (no double dimming, ≥ 4.5:1)', async () => {
  const day = await open(lang, { weather: weather({ isDay: true, uv: 6 }), air: air(25) });
  try { await settle(day.page); const v = await day.page.evaluate(card); assert.deepEqual([v.uvNight, v.uvColor], [false, 'rgba(255, 255, 255, 0.92)'], lang + ' by day'); } finally { await day.close(); }
  const app = await open(lang, { weather: 'ok-then-fail', air: air(25) });
  try {
    const p = app.page;
    await settle(p);
    const night = await p.evaluate(card);
    assert.deepEqual([night.uvNight, night.uvColor, night.uvOpacity], [true, MUTED, '1'], lang + ' after sunset (the recording is 20:32): quiet');
    await p.evaluate(() => { window.__offsetMs = 16 * 60000; });
    await wake(p);
    await p.waitForSelector('#now.is-stale', { timeout: 10000 });
    await wait(300);
    const stale = await p.evaluate(card);
    assert.deepEqual([stale.uvNight, stale.uvColor, stale.uvOpacity], [true, MUTED, '1'], lang + ' stale at night: not dimmed twice');
    assert.deepEqual((await p.evaluate(legibility, '#screen-main #now .now-air *')).bad, [], lang + ' stale + night: every air text ≥ 4.5:1');
  } finally { await app.close(); }
});
}

// R8: nothing moves when the data land or change — the cards, the title row and its key, the air column, the details.
// B22 follow-up (verification, Codex): uk and en too
for (const lang of LANGS) {
  test('B22 ' + lang + ': the city card and the hourly title row keep their rects — loading, fresh, khamsin, no dust, stale', async () => {
    const seen = {};
    for (const state of ['loading', 'fresh', 'khamsin', 'no-dust', 'stale']) {
      const o = state === 'loading' ? { weather: { hang: true }, air: { hang: true } } : state === 'stale' ? { weather: 'ok-then-fail', air: air(25) }
        : { weather: 'ok', air: air(state === 'khamsin' ? 250 : state === 'no-dust' ? null : 25) };
      const app = await open(lang, o);
      try {
        const p = app.page;
        if (state === 'loading') { await p.waitForSelector('#hourly .card-head .dust-legend', { timeout: 10000 }); await p.evaluate(() => document.fonts.ready); await wait(300); }
        else if (state === 'no-dust') { await p.waitForSelector('#daily .day-max', { timeout: 10000 }); await p.waitForSelector('#now .air-aq .air-num', { timeout: 10000 }); await p.evaluate(() => document.fonts.ready); await wait(300); }
        else await settle(p);
        if (state === 'stale') { await p.evaluate(() => { window.__offsetMs = 16 * 60000; }); await wake(p); await p.waitForSelector('#now.is-stale', { timeout: 10000 }); await wait(300); }
        seen[state] = await p.evaluate(rects);
        if (state === 'no-dust') assert.equal(await p.$eval('#now .air-dust', (e) => e.className), 'air-item air-dust is-none', 'no dust: the slot only');
      } finally { await app.close(); }
    }
    for (const state of ['loading', 'khamsin', 'no-dust', 'stale']) {
      for (const k of ['now', 'hourly', 'head', 'key']) assert.deepEqual(seen[state][k], seen.fresh[k], lang + ' ' + state + ' ' + k);
      if (state !== 'loading') for (const k of ['air', 'details']) assert.deepEqual(seen[state][k], seen.fresh[k], lang + ' ' + state + ' ' + k);
    }
  });
}
