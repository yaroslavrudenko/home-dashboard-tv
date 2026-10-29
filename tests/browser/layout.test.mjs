// Layout smoke at the TV's 1920×1080 in headless Chrome, with the recorded Open-Meteo answers.
// Checks what a viewer would notice: everything on screen, nothing clipped or overlapping, the right
// times, the full forecast, one request per place, and a calm failure state without network.
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
    assert.equal(app.weatherRequests.length, 3, 'one request per place');
    assert.deepEqual(app.weatherRequests.map((u) => new URL(u).searchParams.get('latitude')).sort(), ['-33.8688', '31.8928', '50.4501']);

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

test('no network: clocks still run, the weather card says it is unavailable and will retry', async () => {
  const app = await openApp({ weather: 'fail' });
  try {
    await app.page.waitForSelector('#status.is-failed', { timeout: 10000 });
    assert.deepEqual(app.errors, []);
    assert.equal(app.weatherRequests.length, 3, 'one attempt per place, no burst of retries');
    assert.equal(await app.page.$eval('#clock-israel .clock-time', (e) => e.textContent), '20:32');
    assert.equal(await app.page.$eval('.placeholder', (e) => e.textContent), 'Погода недоступна · повторим позже');
  } finally { await app.close(); }
});
