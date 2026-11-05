// Batch 11 (integration) at the TV's 1920×1080 in headless Chrome: the Markets screen's place and refresh wiring (M1, M3). It comes
// right after the news; its sources are asked only while it is on view: at once on a ◀ ▶ open or a language change on
// it, on a rotation arrival only when the last attempt is Config.markets.refreshMs old, then every refreshMs while it
// stays; nothing while another screen is shown. Counts are in rounds: one round is whatever the first open asked.
//
// Batch 11 (view), the Markets screen at the TV's 1920×1080 in headless Chrome, in Russian, Hebrew and Ukrainian, drawn from
// the view's fixture snapshot (tests/fixtures/markets-view-snapshot.json — made-up quotes; the view never fetches).
// What a viewer would notice: six equal cards 3 × 2, currencies first, six rows each on one pitch, prices ending on
// one line per card, nothing cut or spilling, Hebrew mirrored with left-to-right figures.
// Until the app wires the screen (js/app.js, index.html), the test adds the screen element and js/view-markets.js
// itself; once wired, it uses the app's. MARKETS_SHOTS=<dir> also writes markets-<lang>.png there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, measure, legibility, ROOT, marketsRecorded } from './page.mjs';

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'markets-view-snapshot.json'), 'utf8'));
const LAYOUT = SNAPSHOT.groups.map((g) => ({ id: g.id, rows: g.rows.length }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Shows the Markets screen alone, drawn from the snapshot (runs in the page).
function showMarkets(snapshot, layout) {
  let el = document.getElementById('screen-markets');
  if (!el) { el = document.createElement('section'); el.id = 'screen-markets'; document.getElementById('stage').insertBefore(el, document.getElementById('corner')); }
  for (const s of document.querySelectorAll('.screen')) s.className = 'screen';
  el.className = 'screen is-active';
  MarketsView.init(el, layout);
  MarketsView.render(snapshot, { kind: 'fresh', updated: '14:32' });
}
const CARDS = () => [...document.querySelectorAll('#screen-markets .mk-card')].map((c) => {
  const b = c.getBoundingClientRect();
  return { id: c.id, box: [b.left, b.top, b.right, b.bottom].map(Math.round),
    rows: [...c.querySelectorAll('.mk-row')].map((r) => { const rb = r.getBoundingClientRect(); return [Math.round(rb.top - b.top), Math.round(rb.height)]; }),
    // where each price's TEXT ends on the right (decimals in one column), in every language
    priceEnds: [...c.querySelectorAll('.mk-price')].map((p) => { const r = document.createRange(); r.selectNodeContents(p); return Math.round(r.getBoundingClientRect().right); }),
    // FIX-11B B1 [D1]: where each price's DECIMAL SEPARATOR stands (the last «,» / «.» before digits), in every language
    seps: [...c.querySelectorAll('.mk-price')].map((p) => {
      const t = p.firstChild, txt = t.textContent, re = /[,.](?=\d)/g; let i = -1, m;
      while ((m = re.exec(txt))) i = m.index;
      if (i < 0) return null;
      const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().left;
    }),
    places: [...c.querySelectorAll('.mk-price')].map((p) => { const m = /[,.](\d+)\D*$/.exec(p.textContent); return m ? m[1].length : 0; }),
    // FIX-11B-B1b: the gap between a price's number and its currency sign, in px (null: no sign, e.g. the indices)
    signGaps: [...c.querySelectorAll('.mk-row')].filter((r) => r.querySelector('.mk-price')).map((r) => {
      const t = r.querySelector('.mk-price').firstChild, s = r.querySelector('.mk-sign, .mk-unit');
      if (!s || !s.textContent) return null;
      const d = [...t.textContent].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
      const g = (a) => { const q = document.createRange(); q.setStart(t, a); q.setEnd(t, a + 1); return q.getBoundingClientRect(); };
      const q = document.createRange(); q.selectNodeContents(s); const sb = q.getBoundingClientRect(), l = g(d[0]).left, rr = g(d[d.length - 1]).right;
      return Math.round(sb.left >= rr ? sb.left - rr : l - sb.right);
    }),
    // the clear space between a price (its sign, else its last digit) and the change's arrow, in px
    arrowGaps: [...c.querySelectorAll('.mk-row')].filter((r) => r.querySelector('.mk-price')).map((r) => {
      const q = document.createRange(), s = r.querySelector('.mk-sign'); q.selectNodeContents(s || r.querySelector('.mk-price').firstChild);
      const pb = q.getBoundingClientRect(), ab = r.querySelector('.mk-arrow').getBoundingClientRect();
      return Math.round(ab.left >= pb.right ? ab.left - pb.right : pb.left - ab.right);
    }),
    priceW: c.querySelector('.mk-price') ? Math.round(c.querySelector('.mk-price').getBoundingClientRect().width) : 0,
    nodata: !!c.querySelector('.mk-nodata'),
    // VG-13: how far the rows table reaches past the card's inner (padding) edge on each side, in px (0 = inside)
    spill: (() => { const t = c.querySelector('.mk-rows').getBoundingClientRect(), cs = getComputedStyle(c);
      const inL = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), inR = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      return [Math.max(0, Math.round(inL - t.left)), Math.max(0, Math.round(t.right - inR))]; })(),
    head: (() => { const h = c.querySelector('.mk-head').getBoundingClientRect(); return [Math.round(h.top - b.top), Math.round(h.height), getComputedStyle(c.querySelector('.mk-title')).fontSize]; })(),
    // V1 (VG-13): the WHOLE row and the head are one line each — every text node of it (name, any mark, price, change,
    // «Нет данных») measured by its own line boxes (a table cell is as tall as its row, so its box says nothing): one
    // line box per text node, and all of them centred on one line (within 8 px: the three font sizes differ).
    rowLines: [...c.querySelectorAll('.mk-row'), c.querySelector('.mk-head')].map((row) => {
      const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT), centres = [];
      let extraLines = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(t);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0);
        extraLines += new Set(rects.map((x) => Math.round(x.top))).size - 1;
        for (const x of rects) centres.push((x.top + x.bottom) / 2);
      }
      return extraLines === 0 && Math.max(...centres) - Math.min(...centres) <= 8 ? 1 : 2;
    }) };
});

for (const [lang, dir] of [['ru', 'ltr'], ['he', 'rtl'], ['uk', 'ltr']]) {
  test('Batch 11, ' + lang + ': the Markets screen — six equal cards 3 × 2, six rows on one pitch, prices on one line, nothing cut', async () => {
    const app = await openApp({ weather: 'ok', lang });
    try {
      const p = app.page;
      await p.waitForSelector('.day', { timeout: 10000 });
      if (!(await p.evaluate(() => typeof MarketsView !== 'undefined'))) await p.addScriptTag({ url: 'http://dashboard.test/js/view-markets.js' });
      await p.evaluate(showMarkets, SNAPSHOT, LAYOUT);
      await p.evaluate(() => document.fonts.ready);
      await wait(900);                                    // the screen's fade-in settles
      assert.deepEqual(app.errors, []);
      assert.equal(await p.$eval('html', (e) => e.dir), dir);

      const cards = await p.evaluate(CARDS);
      assert.deepEqual(cards.map((c) => c.id), ['mk-fx', 'mk-us', 'mk-il', 'mk-crypto', 'mk-indices', 'mk-commodities']);
      assert.deepEqual(cards.map((c) => c.rows.length), [6, 6, 6, 6, 6, 6]);
      // 3 × 2: two lines of three; one width, one height; in Hebrew the first card is on the right
      const tops = [...new Set(cards.map((c) => c.box[1]))], w = cards.map((c) => c.box[2] - c.box[0]), h = cards.map((c) => c.box[3] - c.box[1]);
      assert.equal(tops.length, 2, 'two lines of cards');
      assert.deepEqual(cards.map((c) => c.box[1]), [tops[0], tops[0], tops[0], tops[1], tops[1], tops[1]]);
      assert.ok(Math.max(...w) - Math.min(...w) <= 1 && Math.max(...h) - Math.min(...h) <= 1, 'equal cards: ' + w + ' / ' + h);
      const xs = cards.slice(0, 3).map((c) => c.box[0]);
      assert.ok(dir === 'rtl' ? xs[0] > xs[1] && xs[1] > xs[2] : xs[0] < xs[1] && xs[1] < xs[2], 'reading order ' + dir + ': ' + xs);
      assert.ok(Math.min(...cards.map((c) => c.box[0])) >= 64 && Math.max(...cards.map((c) => c.box[2])) <= 1856, 'page margins kept');
      assert.ok(Math.max(...cards.map((c) => c.box[3])) <= 1032, 'above the page dots');
      // one pitch in every card, the same row tops everywhere; every name on one line (a wrapped name would crowd its row)
      const pitch = cards[0].rows.map((r) => r[1]);
      for (const c of cards) {
        assert.deepEqual(c.rows.map((r) => r[1]), pitch.slice(0, c.rows.length), c.id + ' row heights');
        assert.deepEqual(c.rows.map((r) => r[0]), cards[0].rows.slice(0, c.rows.length).map((r) => r[0]), c.id + ' row tops');
        assert.ok(Math.max(...c.priceEnds) - Math.min(...c.priceEnds) <= 1, c.id + ': every price ends on one line ' + c.priceEnds);
        // FIX-16B N2: a commodity's unit is a quiet suffix of its name on the same line — every row and every head one line
        assert.deepEqual(c.rowLines, c.rowLines.map(() => 1), c.id + ': every row and the head on one line ' + c.rowLines);
      }
      assert.ok(cards[0].rows[5][0] + cards[0].rows[5][1] <= cards[0].box[3] - cards[0].box[1], 'the sixth row fits its card');
      // FIX-11B B7 [D7]: the card head as on the News / Israel screens (26 px top padding after the 1 px edge, a 46 px
      // head, a 34 px title) and a 58 px row pitch; B1: one decimal column per card (spread ≤ 2 px)
      for (const c of cards) {
        assert.deepEqual(c.head, [27, 46, '34px'], c.id + ' head');
        assert.deepEqual(c.spill, [0, 0], lang + ' ' + c.id + ': the rows stay inside the card\'s padding');
        assert.ok(c.arrowGaps.every((g) => g >= 10), lang + ' ' + c.id + ': the arrow stands clear of the price (≥ 10 px): ' + c.arrowGaps);
        assert.ok(c.signGaps.every((g) => g === null || (g >= 0 && g <= 8)), lang + ' ' + c.id + ': every sign right after its number (≤ 8 px): ' + c.signGaps);
        // B6 [D6]: one price-column width per card, the same in every language (16 px gap + the card's set width); a card
        // showing «нет данных» may be wider (the text is longer in Ukrainian) and is left out
        if (!c.nodata) assert.equal(c.priceW, { 'mk-fx': 176, 'mk-us': 156, 'mk-il': 184, 'mk-crypto': 222, 'mk-indices': 169, 'mk-commodities': 152 }[c.id], lang + ' ' + c.id + ' price column');
        assert.deepEqual(c.rows.map((r) => r[1]), c.rows.map(() => 58), c.id + ' row pitch');
        assert.ok(c.seps.every((x) => x !== null), c.id + ': every price has its decimals');
        // FIX-11B-B1a: every row of every card, crypto included (crypto always 2 places), on one decimal column
        assert.ok(Math.max(...c.seps) - Math.min(...c.seps) <= 2, lang + ' ' + c.id + ': decimal separators within 2 px: ' + c.seps.map(Math.round));
      }

      const boxes = (await p.evaluate(measure, '#screen-markets *'));
      assert.ok(boxes.length > 150, 'measured ' + boxes.length);
      assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent || b.l < 0 || b.t < 0 || b.r > 1920 || b.b > 1080), [], lang + ': cut or spilling');
      const leg = await p.evaluate(legibility, '#screen-markets *');
      assert.deepEqual(leg.bad, [], lang + ': text below 24 px or 4.5:1');

      if (dir === 'rtl') {                                 // figures left to right inside Hebrew: "$" after the number
        // FIX-11B-B1b: LRE … PDF around the number (the cell's first text); its sign follows in its own box, and the cell is ltr
        const ends = await p.$$eval('#mk-us .mk-price', (els) => els.map((e) => [e.firstChild.textContent, e.lastChild.className, getComputedStyle(e).direction]));
        assert.ok(ends.every(([t, sign, d]) => t.charCodeAt(0) === 0x202a && t.charCodeAt(t.length - 1) === 0x202c && sign === 'mk-sign' && d === 'ltr'), 'LRE … PDF around every number, the sign after it');
      }
      if (process.env.MARKETS_SHOTS) {
        fs.mkdirSync(process.env.MARKETS_SHOTS, { recursive: true });
        await p.screenshot({ path: path.join(process.env.MARKETS_SHOTS, 'markets-' + lang + '.png') });
      }
    } finally { await app.close(); }
  });
}

// ---- Batch 11 (integration): the screen's place and refresh wiring ----

const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); return e.defaultPrevented; }, code);
const LEFT = 37, RIGHT = 39, DOWN = 40;
const QUIET = { news: 'ok', alerts: 'empty-bom.txt', markets: 'ok' };   // FIX-11B C8: the recorded answers
const SCREENS = ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'];   // batch 12: Shabbat after the markets
async function ready(app) { await app.page.waitForSelector('.day', { timeout: 10000 }); await wait(200); }
const gets = (app) => app.requests.markets.filter((r) => r.method === 'GET').length;
const screenOn = (p) => p.evaluate(() => document.querySelector('.screen.is-active').id);
const toMarkets = async (p) => { for (let i = 0; i < SCREENS.indexOf('markets'); i++) await press(p, RIGHT); };

test('M1: the Markets screen comes right after the news — eight page dots, the fourth lit; drawn at once (never an empty screen)', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const p = app.page;
    assert.deepEqual(await p.$$eval('.screen', (s) => s.map((e) => e.id)), SCREENS.map((id) => 'screen-' + id), 'the screens in order');
    assert.equal(gets(app), 0, 'boot: nothing asked for a screen not on view');
    await toMarkets(p);
    await wait(800);
    assert.equal(await screenOn(p), 'screen-markets');
    assert.deepEqual(await p.$$eval('.dot', (d) => d.map((e) => e.className)), SCREENS.map((id) => (id === 'markets' ? 'dot is-on' : 'dot')));
    assert.ok((await p.$eval('#screen-markets', (e) => e.textContent.trim())).length > 0, 'something is drawn: a loading or no-data state at least');
    await press(p, RIGHT); await wait(500);
    assert.equal(await screenOn(p), 'screen-shabbat', 'the Shabbat screen comes next (batch 12)');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// Batch 23: two sources, each on its own cadence — Coinbase (6 stats + 1 rates) every coinbase.refreshMs (60 s), Yahoo (2
// spark) every refreshMs (5 min); shortened here to 1.5 s and 6 s. Batch 26: Coinbase's first round also asks the currencies'
// and the coins' basis — 4 currency spots + 1 answer for every coin, once per UTC day (the app keeps it): 12 then 7.
const coinbaseGets = (app) => app.requests.markets.filter((r) => r.method === 'GET' && /coinbase\.com/.test(r.url)).length;
test('M3: on view each source every ITS refreshMs (Coinbase 7, Yahoo 2); another screen on view: nothing; a ◀ ▶ open asks both at once', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.markets.coinbase.refreshMs = 1500; c.markets.refreshMs = 6000; c.rotation.enabled = false; } });
  try {
    await ready(app);
    const p = app.page;
    await toMarkets(p);
    await wait(400);
    assert.deepEqual([gets(app), coinbaseGets(app)], [14, 12], '◀ ▶ open, cold: Yahoo 2 + Coinbase 7 + the 5 basis requests (batch 26), at once');
    await wait(1500);
    assert.deepEqual([gets(app), coinbaseGets(app)], [21, 19], 'staying on view: Coinbase again after its refreshMs (7: the basis kept), Yahoo not yet');
    await press(p, RIGHT); await wait(300);                    // Shabbat
    const left = gets(app);
    await wait(3500);
    assert.equal(gets(app), left, 'another screen on view: not a single request');
    await press(p, LEFT); await wait(400);                     // back: an explicit open
    assert.equal(gets(app), left + 9, '◀ ▶ back: both sources at once (9)');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('M3: a rotation arrival asks only when the last attempt is refreshMs old (5 min by default)', async () => {
  // the Markets screen's own dwell (90 s) shortened with the rest: 700 ms everywhere
  const app = await openApp({ ...QUIET, configure: (c) => { c.rotation.intervalMs = 700; c.rotation.dwellMs = { markets: 700 }; } });
  try {
    await ready(app);
    const p = app.page;
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-markets', { timeout: 5000, polling: 50 });
    await wait(400);
    const round = gets(app);
    assert.equal(round, 14, 'the first arrival (no data yet): both sources, 14 (Yahoo 2 + Coinbase 7 + the 5 basis requests)');
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-traffic', { timeout: 3000, polling: 50 });
    await p.waitForFunction(() => document.querySelector('.screen.is-active').id === 'screen-markets', { timeout: 8000, polling: 50 });
    await wait(400);
    assert.equal(gets(app), round, 'the next arrival seconds later: nothing');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('M1: a language change on the Markets screen redraws it in that language and refreshes it once, 600 ms after the last press', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.rotation.enabled = false; } });
  try {
    await ready(app);
    const p = app.page;
    await toMarkets(p);
    await wait(400);
    assert.equal(gets(app), 14, 'the first round: 9 + the 5 basis requests');
    const before = await p.$eval('#screen-markets', (e) => e.textContent);
    await press(p, DOWN); await wait(80); await press(p, DOWN);   // ru → he → uk
    await wait(1100);
    assert.equal(await p.evaluate(() => document.documentElement.lang), 'uk');
    assert.equal(gets(app), 23, 'one round of both sources (9: the basis kept) for the language the remote settled on');
    assert.notEqual(await p.$eval('#screen-markets', (e) => e.textContent), before, 'redrawn in Ukrainian');
    assert.equal(await screenOn(p), 'screen-markets', 'the language never changes the screen');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('Batch 11: ₪ ₴ ₽ are drawn with the bundled Inter (its currency subset loads for them), never a system font', async () => {
  const app = await openApp(QUIET);
  try {
    await ready(app);
    const faces = await app.page.evaluate(async () => (await document.fonts.load('400 30px Inter', '₪₴₽'))
      .map((f) => [f.family.replace(/"/g, ''), f.weight, f.unicodeRange, f.status]));
    assert.deepEqual(faces, [['Inter', '400', 'U+20AA, U+20B4, U+20BD', 'loaded']]);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// Batch 11, the owner: «для рынков сделай 90 секунд». The rotation keeps the Markets screen Config.rotation.dwellMs.markets;
// every other screen intervalMs. Shortened here as the other rotation tests do (real time, small numbers): 500 ms and
// 2000 ms. The page records when each screen became active.
test('Batch 11: the rotation keeps the Markets screen its own dwell (90 s; 2 s here), every other screen intervalMs', async () => {
  const app = await openApp({ ...QUIET, configure: (c) => { c.rotation.intervalMs = 500; c.rotation.dwellMs = { markets: 2000 }; } });
  try {
    await ready(app);
    const p = app.page;
    await p.evaluate(() => {
      window.__onAt = [];
      let last = '';
      setInterval(() => { const id = document.querySelector('.screen.is-active').id; if (id !== last) { last = id; window.__onAt.push([id, performance.now()]); } }, 20);
    });
    await p.waitForFunction(() => window.__onAt.some((x) => x[0] === 'screen-map'), { timeout: 8000, polling: 50 });
    const on = await p.evaluate(() => window.__onAt);
    const stay = (id) => { const i = on.findIndex((x) => x[0] === id); return on[i + 1][1] - on[i][1]; };
    assert.ok(stay('screen-markets') >= 1900 && stay('screen-markets') < 2400, 'Markets stays its dwell: ' + Math.round(stay('screen-markets')) + ' ms');
    for (const id of ['screen-news', 'screen-traffic']) assert.ok(stay(id) >= 400 && stay(id) < 800, id + ' stays intervalMs: ' + Math.round(stay(id)) + ' ms');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// FIX-11B C8: the header tells the truth across rounds — a good recorded round reads «Обновлено в …» (fresh); a round
// whose quotes fail keeps the last prices and reads «Не обновляется · данные от …» (stale). Exact counts (batch 23): 9 a round, both sources
// (batch 26: 14 the first, the 5 basis requests with it).
test('C8: a good round then a failed round — the header goes fresh → stale, the prices stay; 9 requests a round', async () => {
  const app = await openApp({ ...QUIET, markets: (n, url) => (n <= 14 ? marketsRecorded(url) : { status: 503, body: '' }),
    configure: (c) => { c.rotation.enabled = false; } });
  try {
    await ready(app);
    const p = app.page;
    await toMarkets(p);
    await p.waitForSelector('#markets-status.is-fresh', { timeout: 5000 });
    assert.equal(gets(app), 14);
    const priced = await p.$$eval('#screen-markets .mk-price', (e) => e.length);
    assert.equal(priced, 36, 'every row priced');
    await press(p, RIGHT); await wait(300); await press(p, LEFT);          // an explicit reopen: the quotes fail
    await p.waitForSelector('#markets-status.is-stale', { timeout: 5000 });
    assert.equal(gets(app), 23, 'the reopen: both sources (9), every request refused');
    assert.match(await p.$eval('#markets-status', (e) => e.textContent), /^Не обновляется · данные от \d\d:\d\d$/);
    assert.equal(await p.$$eval('#screen-markets .mk-price', (e) => e.length), 36, 'the last prices stay, dimmed');
    assert.ok(await p.$$eval('#screen-markets .mk-row.is-stale', (e) => e.length) >= 30, 'the quote rows are marked stale');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

// FIX-11B A9 [P1]: one slow source never holds the screen (the perf reviewer's erApiHangs case). Batch 23: the two sources are
// two rounds — with Coinbase hanging (until its 15 s timeout) Yahoo's prices are drawn as soon as it answers (300 ms here),
// and with Yahoo hanging Coinbase's are; < 1000 ms either way.
for (const [hangs, card, other] of [['coinbase.com', '#mk-us', 'Yahoo'], ['finance.yahoo.com', '#mk-crypto', 'Coinbase']]) {
  test('A9: ' + hangs + ' hanging: ' + other + '\'s prices are drawn in under 1 s (answering in 300 ms), not after the 15 s timeout', async () => {
    const app = await openApp({ ...QUIET, configure: (c) => { c.rotation.enabled = false; },
      markets: (n, url) => (url.includes(hangs) ? { hang: true } : new Promise((r) => setTimeout(() => r(marketsRecorded(url)), 300))) });
    try {
      await ready(app);
      const p = app.page;
      await p.evaluate(() => { window.__t0 = performance.now(); });
      await toMarkets(p);
      await p.waitForFunction(() => document.querySelectorAll('#screen-markets .mk-price').length > 0, { timeout: 5000, polling: 20 });
      const ms = await p.evaluate(() => performance.now() - window.__t0);
      assert.ok(ms < 1000, 'first priced render after ' + Math.round(ms) + ' ms');
      assert.equal(await p.$$eval(card + ' .mk-price', (e) => e.length), 6, other + '\'s rows are all there');
      assert.match(await p.$eval('#markets-status', (e) => e.className), /is-stale/, 'the other source still out: not called fresh');
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}

// Batch 26 (the owner's «да - исправляй», «все проценты должны считаться одинаково»): the currencies and the crypto cards say
// what their changes are measured from — the Israel date of D 00:00 UTC, D the previous UTC date (the app's clock starts at
// FIXED_NOW, 20:32 on 29 October in Israel: D = 28 October) — in the place of «закрыто» (the head's end), one line, clear of
// the title (≥ 24 px: the designer's D26-1, the worst case measured 26 px), from the FIRST answer on (the 5 basis requests come
// with it). The crypto card's title is the longest of the two. The longest month of each language with a two-digit day too (Russian «сентября», Ukrainian «листопада»; Hebrew's
// longest, «באוקטובר», is the base case): there the clock is moved and the 28 October recording answers for that D (layout
// only — no recording exists for a date not yet ended).
const FIXED_D = (url) => marketsRecorded(url.replace(/date=\d{4}-\d\d-\d\d/, 'date=2026-10-28'));
for (const [lang, now, want] of [['ru', null, /^% с 28 октября$/], ['he', null, /^% מ־28 באוקטובר$/], ['uk', null, /^% з 28 жовтня$/],
  ['ru', Date.parse('2026-10-01T09:00:00Z'), /^% с 30 сентября$/], ['uk', Date.parse('2026-12-01T09:00:00Z'), /^% з 30 листопада$/]]) {
  test('B26, ' + lang + (now ? ', the longest month' : '') + ': the FX and crypto card heads say the basis date from the first answer on, at the head\'s end, on one line, clear of the title', async () => {
    const app = await openApp({ ...QUIET, lang, ...(now ? { now, markets: (n, url) => FIXED_D(url) } : {}), configure: (c) => { c.rotation.enabled = false; } });
    try {
      await ready(app);
      const p = app.page;
      await toMarkets(p);
      await p.waitForFunction(() => document.querySelectorAll('#mk-fx .mk-price, #mk-crypto .mk-price').length === 12, { timeout: 5000, polling: 20 });
      await p.evaluate(() => document.fonts.ready);
      for (const card of ['#mk-fx', '#mk-crypto']) {
        const first = await p.evaluate((card) => ({ since: !!document.querySelector(card + ' .mk-since'), changes: [...document.querySelectorAll(card + ' .mk-pct')].map((e) => e.textContent) }), card);
        assert.equal(first.since, true, card + ': the first answer already has its label');
        assert.ok(first.changes.every((c) => c !== '—'), card + ': and every change: ' + first.changes.join(' '));
        const m = await p.evaluate((card) => {
          const head = document.querySelector(card + ' .mk-head'), since = head.querySelector('.mk-since'), title = head.querySelector('.mk-title');
          const r = (e) => e.getBoundingClientRect(), hb = r(head), sb = r(since), tb = r(title), q = document.createRange();
          q.selectNodeContents(since);
          return { text: since.textContent, lines: new Set([...q.getClientRects()].map((x) => Math.round(x.top))).size,
            gap: getComputedStyle(head).direction === 'rtl' ? tb.left - sb.right : sb.left - tb.right,
            atEnd: getComputedStyle(head).direction === 'rtl' ? Math.round(sb.left - hb.left) : Math.round(hb.right - sb.right),
            inside: sb.top >= hb.top - 1 && sb.bottom <= hb.bottom + 1, closedLook: getComputedStyle(since).fontSize };
        }, card);
        assert.match(m.text, want, card);
        assert.equal(m.lines, 1, card + ': one line');
        assert.ok(m.gap >= 24, card + ': clear of the title: ' + m.gap);
        assert.ok(m.atEnd <= 1 && m.inside, card + ': at the head\'s end, inside it: ' + JSON.stringify(m));
        assert.equal(m.closedLook, '24px', card + ': the look of «закрыто»');
      }
      const boxes = await p.evaluate(measure, '#screen-markets *');
      assert.deepEqual(boxes.filter((b) => b.cut || b.outsideCard || b.overflowsParent), [], lang + ': nothing cut or spilling');
      assert.deepEqual(app.errors, []);
    } finally { await app.close(); }
  });
}
