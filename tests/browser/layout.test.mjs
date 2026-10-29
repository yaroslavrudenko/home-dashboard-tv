// Layout smoke at the TV's 1920×1080 in headless Chrome, with the recorded Open-Meteo answers.
// Checks what a viewer would notice: everything on screen, nothing clipped or overlapping, the right
// times, the full forecast, one request per refresh, and a calm failure state without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp } from './page.mjs';

// Every visible element inside #stage: its box, and whether its text is cut (scrollWidth > clientWidth).
function measure() {
  const out = [];
  for (const el of document.querySelectorAll('#stage *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const card = el.closest('.card');
    const pr = el.parentElement.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : null;
    out.push({ cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className, text: (el.textContent || '').trim().slice(0, 40),
      l: r.left, t: r.top, r: r.right, b: r.bottom, cut: el.children.length === 0 && el.scrollWidth > el.clientWidth + 1,
      // a text leaf wider or taller than the box it sits in (e.g. a label wider than its column)
      overflowsParent: el.children.length === 0 && (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5),
      outsideCard: cr && el !== card ? (r.left < cr.left - 0.5 || r.right > cr.right + 0.5 || r.top < cr.top - 0.5 || r.bottom > cr.bottom + 0.5) : false });
  }
  return out;
}

async function ready(app) {
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 200));
}

test('1920×1080, Russian: clocks, current weather, 12-hour strip, 7 days; everything on screen and uncut', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    assert.deepEqual(app.errors, []);
    assert.equal(app.weatherRequests.length, 1, 'one request for every place');
    assert.equal(new URL(app.weatherRequests[0]).searchParams.get('latitude'), '31.8928,50.4501,-33.8688');
    assert.equal(new URL(app.weatherRequests[0]).searchParams.get('forecast_hours'), '24');

    const clocks = await p.$$eval('.clock', (els) => els.map((e) => [e.id, e.querySelector('.clock-city').textContent, e.querySelector('.clock-time').textContent]));
    assert.deepEqual(clocks, [['clock-israel', 'Израиль', '20:32'], ['clock-ukraine', 'Украина', '20:32'], ['clock-sydney', 'Сидней', '05:32']]);
    assert.equal(await p.$$eval('.clock .approx', (e) => e.length), 0, 'desktop Chrome resolves every zone exactly');
    assert.equal(await p.$eval('.now-place', (e) => e.textContent), 'Реховот');
    assert.match(await p.$eval('.now-temp', (e) => e.textContent), /^−?\d+°$/);
    assert.equal(await p.$$eval('.hour', (e) => e.length), 12);
    assert.equal(await p.$$eval('.day', (e) => e.length), 7);
    assert.equal(await p.$$eval('.detail', (e) => e.length), 5);
    assert.equal(await p.$eval('#status', (e) => e.className), 'status is-fresh');
    assert.match(await p.$eval('#status', (e) => e.textContent), /^Обновлено в 20:3\d$/);

    const boxes = await p.evaluate(measure);
    assert.ok(boxes.length > 100, 'measured ' + boxes.length + ' elements');
    const off = boxes.filter((b) => b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080);
    assert.deepEqual(off, [], 'elements outside the 1920×1080 screen');
    assert.deepEqual(boxes.filter((b) => b.cut), [], 'text cut off');
    assert.deepEqual(boxes.filter((b) => b.outsideCard), [], 'content spilling out of its card');
    assert.deepEqual(boxes.filter((b) => b.overflowsParent), [], 'text wider or taller than its own box');

    // The three clock cards share one row and one height; the burn-in margin (≥ 8 px) is kept.
    const cards = await p.$$eval('.clock', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.height, r.left, r.right]; }));
    assert.equal(new Set(cards.map((c) => c[0])).size, 1);
    assert.equal(new Set(cards.map((c) => c[1])).size, 1);
    assert.ok(cards[0][2] >= 16 && cards[2][3] <= 1920 - 16, 'side margins leave room for the pixel shift');
  } finally { await app.close(); }
});

test('English renders with the same layout, nothing cut', async () => {
  const app = await openApp({ weather: 'ok', lang: 'en' });
  try {
    await ready(app);
    assert.deepEqual(app.errors, []);
    assert.equal(await app.page.$eval('html', (e) => e.lang), 'en');
    assert.equal(await app.page.$eval('#clock-ukraine .clock-city', (e) => e.textContent), 'Ukraine');
    const boxes = await app.page.evaluate(measure);
    assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.r > 1920 || b.b > 1080), []);
  } finally { await app.close(); }
});

// Decision 16 (D10): one centred message, placeholder rows, the message is not repeated in the status line.
test('no network: clocks still run, the weather card says it is unavailable and will retry', async () => {
  const app = await openApp({ weather: 'fail' });
  try {
    await app.page.waitForSelector('#status.is-failed', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 200));
    const p = app.page;
    assert.deepEqual(app.errors, []);
    assert.equal(app.weatherRequests.length, 1, 'one attempt, no burst of retries');
    assert.equal(await p.$eval('#clock-israel .clock-time', (e) => e.textContent), '20:32');
    assert.equal(await p.$eval('.empty-text', (e) => e.textContent), 'Погода временно недоступна');
    assert.match(await p.$eval('.empty-sub', (e) => e.textContent), /^Повторим в 20:3\d$/);
    assert.equal(await p.$eval('#status', (e) => e.textContent), '', 'the status line does not repeat the message');
    assert.equal(await p.$$eval('.hour.is-empty', (e) => e.length), 12, 'placeholder hours keep the composition');
    assert.equal(await p.$$eval('.day.is-empty', (e) => e.length), 7, 'placeholder days');
    const boxes = await p.evaluate(measure);
    assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.r > 1920 || b.b > 1080), []);
    const [msg, card] = await p.evaluate(() => [document.querySelector('.empty-state').getBoundingClientRect(), document.querySelector('#now').getBoundingClientRect()]
      .map((r) => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 })));
    assert.ok(Math.abs(msg.cx - card.cx) < 2, 'the message is centred horizontally');
  } finally { await app.close(); }
});

const boxOf = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
const intersects = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const NO_INTL = 'delete window.Intl;';

// Decision 11 (D3, D4): one column grid and one inner gutter.
test('one grid: the daily card is one clock column, the seams line up, every card text starts at 40 px', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const g = await app.page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const clocks = [...document.querySelectorAll('.clock')].map((e) => e.getBoundingClientRect());
      return { clocks: clocks.map((c) => [c.left, c.right]), daily: [r('#daily').left, r('#daily').right], left: [r('.col-left').left, r('.col-left').right],
        text: { clock: r('#clock-israel .clock-city').left - clocks[0].left, now: r('.now-place').left - r('#now').left,
          hourly: r('#hourly .card-title').left - r('.hourly-card').left, daily: r('#daily .card-title').left - r('#daily').left } };
    });
    const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1, what + ': ' + a + ' vs ' + b);
    near(g.daily[0], g.clocks[2][0], 'daily left = third clock left');
    near(g.daily[1], g.clocks[2][1], 'daily right = third clock right');
    near(g.left[1], g.clocks[1][1], 'left column right = second clock right');
    for (const [k, v] of Object.entries(g.text)) near(v, 41, k + ' text inset (40 px padding + 1 px border)');
  } finally { await app.close(); }
});

// Decision 12 (D7) and decision 1 (D1): sofa legibility and the bundled typeface.
test('legibility: no text below 24 px, contrast at least 4.5:1 on the lightest card, Inter loaded with tabular figures', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const r = await app.page.evaluate(async () => {
      await document.fonts.ready;
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
      // The lightest card background: the page's lightest colour under the card's top fill (8.5 % white),
      // or the night clock's top fill — whichever is lighter.
      const page = [0x1a, 0x23, 0x40];
      const bgs = [over([255, 255, 255], 0.085, page), over([150, 160, 255], 0.075, page)];
      const bg = bgs.sort((x, y) => lum(y) - lum(x))[0];
      const bad = [];
      for (const el of document.querySelectorAll('#stage *')) {
        if (el.closest('svg') || !el.childNodes.length) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el), m = cs.color.match(/[\d.]+/g).map(Number);
        const fg = over(m.slice(0, 3), m.length > 3 ? m[3] : 1, bg);
        const contrast = (lum(fg) + 0.05) / (lum(bg) + 0.05);
        if (parseFloat(cs.fontSize) < 24 || contrast < 4.5) bad.push(el.className + ' "' + el.textContent.trim().slice(0, 20) + '" ' + cs.fontSize + ' ' + contrast.toFixed(2));
      }
      const t = document.querySelector('.clock-time');
      const width = (text) => { const s = document.createElement('span'); s.textContent = text; t.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
      return { bad, inter: ['300 104px Inter', '400 30px Inter', '500 34px Inter'].map((f) => document.fonts.check(f)),
        loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.weight).sort().join(','),
        family: getComputedStyle(document.body).fontFamily, tnum: [width('1111'), width('0000')] };
    });
    assert.deepEqual(r.bad, [], 'text below 24 px or below 4.5:1');
    assert.match(r.family, /^"?Inter"?,/);
    assert.deepEqual(r.inter, [true, true, true], 'Inter 300/400/500 available');
    assert.match(r.loaded, /300/); assert.match(r.loaded, /400/); assert.match(r.loaded, /500/);
    assert.equal(r.tnum[0], r.tnum[1], 'tabular figures: "1111" as wide as "0000"');
  } finally { await app.close(); }
});

// Decision 2 (D2, F1, F4): the TV without time-zone support. A small "≈", the hour difference kept, nothing overlaps.
test('no Intl on the TV: every clock shows a small "≈" with the built-in time; nothing overlaps or is cut', async () => {
  const app = await openApp({ weather: 'ok', init: NO_INTL });
  try {
    await ready(app);
    const p = app.page;
    assert.deepEqual(app.errors, []);
    assert.equal(await p.$$eval('.clock .approx', (e) => e.length), 3, 'the "≈" marker on all three clocks');
    const clocks = await p.$$eval('.clock', (els) => els.map((e) => [e.querySelector('.clock-time').textContent, e.querySelector('.clock-diff').textContent]));
    assert.deepEqual(clocks, [['≈20:32', ''], ['≈20:32', 'Как здесь'], ['≈05:32', '+9 ч']]);
    for (const id of ['israel', 'ukraine', 'sydney']) {
      const [meta, date, time] = await p.evaluate((id, f) => ['.clock-meta', '.clock-date', '.clock-time'].map((s) => (0, eval)(f)('#clock-' + id + ' ' + s)), id, String(boxOf));
      assert.ok(!intersects(meta, date) && !intersects(date, time), id + ': meta / date / time overlap');
      assert.ok(meta.b - meta.t <= 40, id + ': the meta row stays one line, ' + (meta.b - meta.t));
    }
    const boxes = await p.evaluate(measure);
    assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent), []);
  } finally { await app.close(); }
});

test('a zone nobody can resolve shows a short "zone unknown" label instead of a time', async () => {
  const app = await openApp({ weather: 'ok', init: NO_INTL, configure: (c) => { c.clocks[2].rule = 'NONE'; } });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await p.$eval('#clock-sydney .clock-time', (e) => e.className + '|' + e.textContent), 'clock-time is-unknown|Пояс неизвестен');
    assert.ok(!(await p.$eval('#stage', (e) => e.textContent)).includes('--:--'));
    const boxes = await p.evaluate(measure);
    assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent), []);
  } finally { await app.close(); }
});

const wake = (p) => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

// Decision 5 (Codex 2, F3): every place's status reaches its own card; decision 6: a failed request marks all stale.
test('a failed refresh marks the temperature stale on every clock card and on the main card', async () => {
  const app = await openApp({ weather: 'ok-then-fail' });
  try {
    await ready(app);
    const p = app.page;
    assert.equal(await p.$$eval('.clock-weather.is-stale', (e) => e.length), 0, 'fresh at first');
    await p.evaluate(() => { window.__offsetMs = 16 * 60000; });
    await wake(p);
    await p.waitForSelector('#status.is-stale', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(app.weatherRequests.length, 2);
    assert.equal(await p.$$eval('.clock-weather.is-stale .stale-mark', (e) => e.length), 3, 'marked on all three clock cards');
    assert.equal(await p.$$eval('.now.is-stale .now-temp .stale-mark', (e) => e.length), 1, 'marked on the main card');
    assert.match(await p.$eval('#status', (e) => e.textContent), /^Не обновляется · данные от 20:3\d$/);
    const dim = await p.$eval('.clock-weather.is-stale .clock-temp', (e) => getComputedStyle(e).color);
    assert.equal(dim, 'rgba(255, 255, 255, 0.62)', 'the stale temperature is dimmed');
  } finally { await app.close(); }
});

// F4: refresh on wake.
test('waking the TV refreshes the weather when it is older than the refresh interval, and not when it is recent', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const p = app.page;
    await p.evaluate(() => { window.__offsetMs = 5 * 60000; });
    await wake(p);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(app.weatherRequests.length, 1, 'recent data: no request');
    await p.evaluate(() => { window.__offsetMs = 16 * 60000; });
    await wake(p);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(app.weatherRequests.length, 2, 'data older than 15 min: one new request');
  } finally { await app.close(); }
});

// F4, F5: Back exits; the screen saver call carries both callbacks.
test('Back (10009) exits the app, other keys do not; the screen saver is switched off with result callbacks', async () => {
  const init = `window.__calls = [];
    window.tizen = { application: { getCurrentApplication: () => ({ exit: () => window.__calls.push('exit') }) } };
    window.webapis = { appcommon: { AppCommonScreenSaverState: { SCREEN_SAVER_OFF: 'OFF' },
      setScreenSaver: (state, ok, fail) => { window.__calls.push('screensaver ' + state + ' ' + typeof ok + ' ' + typeof fail); ok(); } } };`;
  const app = await openApp({ weather: 'ok', init });
  try {
    await ready(app);
    const p = app.page;
    const press = (code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
    assert.equal(await press(13), false);
    assert.ok(!(await p.evaluate(() => window.__calls)).includes('exit'), 'Enter does not exit');
    assert.equal(await press(10009), true, 'Back is consumed');
    const calls = await p.evaluate(() => window.__calls);
    assert.ok(calls.includes('exit'), 'Back exits: ' + calls);
    assert.ok(calls.includes('screensaver OFF function function'), 'screen saver off with callbacks: ' + calls);
  } finally { await app.close(); }
});

// Decision 16 (D11): every condition string in every language fits the card on one line.
test('every weather condition in both languages fits the main card on one line, nothing pushed out', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const bad = await app.page.evaluate(() => {
      const out = [], codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
      const now = document.getElementById('now');
      for (const lang of ['ru', 'en']) {
        I18n.setLang(lang);
        for (const code of codes) {
          const cond = now.querySelector('.now-cond');
          cond.textContent = I18n.condition(code);
          const c = cond.getBoundingClientRect(), d = now.querySelector('.details').getBoundingClientRect(), n = now.getBoundingClientRect();
          const icon = now.querySelector('.now-icon').getBoundingClientRect();
          const lineH = parseFloat(getComputedStyle(cond).lineHeight);
          if (c.height > lineH + 1 || d.bottom > n.bottom - 1 || c.right > icon.left) out.push(lang + ' ' + code + ' ' + cond.textContent);
        }
      }
      return out;
    });
    assert.deepEqual(bad, []);
  } finally { await app.close(); }
});

// Decision 14 (D6, Gemini 7): one week-wide gradient behind every bar; a dot for the current temperature on Today.
test('range bars are windows onto one week-wide gradient, and Today carries the current-temperature dot', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const r = await app.page.evaluate(() => [...document.querySelectorAll('.day')].map((day) => {
      const track = day.querySelector('.range').getBoundingClientRect(), f = day.querySelector('.range-fill');
      const fr = f.getBoundingClientRect(), cs = getComputedStyle(f);
      const size = parseFloat(cs.backgroundSize) / 100 * fr.width, pos = parseFloat(cs.backgroundPositionX) / 100 * (fr.width - size);
      const dot = day.querySelector('.range-dot');
      return { imageLeft: fr.left + pos, imageWidth: size, trackLeft: track.left, trackWidth: track.width,
        dot: dot ? [dot.getBoundingClientRect().left, dot.getBoundingClientRect().right] : null };
    }));
    for (const [i, d] of r.entries()) {
      assert.ok(Math.abs(d.imageLeft - d.trackLeft) <= 1 && Math.abs(d.imageWidth - d.trackWidth) <= 1, 'day ' + i + ': ' + JSON.stringify(d));
    }
    assert.ok(r[0].dot, 'Today has the dot');
    assert.ok(r[0].dot[0] >= r[0].trackLeft - 0.5 && r[0].dot[1] <= r[0].trackLeft + r[0].trackWidth + 0.5, 'the dot stays on the track');
    assert.equal(r.filter((d) => d.dot).length, 1, 'only Today');
  } finally { await app.close(); }
});

// F6: the night tint follows the place's fresh weather (is_day), not fixed hours.
test('a clock card is tinted for the night from its place\'s weather, not from fixed hours', async () => {
  // Fixed hours would call 20:32 "day" with the night starting at 23; Open-Meteo says it is night in Israel.
  const app = await openApp({ weather: 'ok', configure: (c) => { c.nightStartsHour = 23; } });
  try {
    await ready(app);
    assert.match(await app.page.$eval('#clock-israel', (e) => e.className), /is-night/);
  } finally { await app.close(); }
});

// P-4: the shifted stage never grows the document, so the root layer is never repainted by a shift.
test('the burn-in shift moves the stage without growing the page', async () => {
  const app = await openApp({ weather: 'ok' });
  try {
    await ready(app);
    const size = await app.page.evaluate(async () => {
      const st = document.getElementById('stage');
      st.style.transition = 'none';
      st.style.transform = 'translate(8px, 8px)';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return [document.documentElement.scrollWidth, document.documentElement.scrollHeight, getComputedStyle(st).willChange];
    });
    assert.deepEqual(size, [1920, 1080, 'transform']);
  } finally { await app.close(); }
});
