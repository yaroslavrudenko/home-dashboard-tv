// Opens the app in headless Chrome at the TV's 1920×1080. Every request is answered by interception:
// app files from the repo, Open-Meteo / news / alerts / Mapbox from tests/fixtures (or a failure), anything else aborted.
//   PUPPETEER_CORE_DIR  a folder whose node_modules holds puppeteer-core (nothing is installed in this repo)
//   CHROME              Chrome executable (default: macOS Google Chrome)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(process.env.APP_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const ORIGIN = 'http://dashboard.test';
// The moment the fixtures were recorded, two minutes past Rehovot's `current.time` (2026-10-29 18:32 UTC =
// 20:32 in Israel), so the hourly strip of the recorded answer starts at the current hour.
const REHOVOT = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'rehovot.json'), 'utf8'));
export const FIXED_NOW = Date.parse(REHOVOT.current.time + ':00Z') - REHOVOT.utc_offset_seconds * 1000 + 2 * 60000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' };
// oref.org.il answers a CORS preflight without Access-Control-Allow-Origin / -Allow-Headers (measured 2026-10-29), so a
// poll that needs a preflight never reaches the GET: the harness answers OPTIONS the same way.
// FB5-WX: the Israel regions (haifa, telaviv, beersheva) are derived from the Rehovot recording (tests/fixtures).
// Batch 10: Haifa as the home city (js/cities.js: its centre, 32.8185) answers with the Haifa region's recording.
const BY_LAT = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney', '32.794': 'haifa', '32.0853': 'telaviv', '31.2518': 'beersheva', '32.8185': 'haifa' };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };

// The answer to one multi-location request: one recorded fixture per requested latitude, in order.
// Batch 12: the 2026-10-29 recordings predate the UV index; each place's daily uv_index_max is taken from the 2026-11-02
// recording of the same call (tests/fixtures/weather-uv-2026-11-02.json), by place index, where the recording lacks it.
const UV = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'weather-uv-2026-11-02.json'), 'utf8'));
export function weatherAnswer(url) {
  const lats = new URL(url).searchParams.get('latitude').split(',');
  return JSON.stringify(lats.map((lat, i) => {
    const w = JSON.parse(fs.readFileSync(path.join(FIXTURES, BY_LAT[lat] + '.json'), 'utf8'));
    if (w.daily && !w.daily.uv_index_max && UV[i]) w.daily.uv_index_max = UV[i].daily.uv_index_max.slice(0, w.daily.time.length);
    return w;
  }));
}
// Batch 12: the air quality (one request for every place: the 4-place recording, or the 1-place one) and the Hebcal
// calendar (Jerusalem's recording for its GeoNames id, else Rehovot's; both 2026-11-02, 180 days).
export function airAnswer(url) {
  const n = new URL(url).searchParams.get('latitude').split(',').length;
  return { status: 200, contentType: 'application/json', body: fixtureText('air/aq-' + (n === 1 ? '1place' : '4places') + '.json') };
}
export function hebcalAnswer(url) {
  const jlm = new URL(url).searchParams.get('geonameid') === '281184';
  return { status: 200, contentType: 'application/json', body: fixtureText('hebcal/hebcal-' + (jlm ? 'jlm' : 'rehovot') + '-2026-11-02-180d.json') };
}

function loadPuppeteer() {
  const dir = process.env.PUPPETEER_CORE_DIR;
  const req = createRequire(dir ? path.join(dir, 'noop.js') : import.meta.url);
  try { return req('puppeteer-core'); } catch (e) {
    throw new Error('puppeteer-core not found: set PUPPETEER_CORE_DIR (browser tests fail rather than skip). ' + e.message);
  }
}

// News feeds, the alert feed and Mapbox: `opts.news` 'ok' (tests/fixtures/news) | 'fail' | 'live' (fetched from the real
// feeds by Node at that moment) | (url) => { status, body }; `opts.alerts` (the live feed) and `opts.history` (the recent
// alerts, alerts-history.oref.org.il) a file in tests/fixtures/oref | 'fail' |
// (n) => { status, body }; `opts.traffic` (one GET per route) 'ok' (that route's answer in tests/fixtures/mapbox/routes.json)
// | 'fail' | (round, url) => { status, body } (round: 1 for the first ten GETs, …); `opts.map` (the traffic map image)
// 'ok' (tests/fixtures/mapbox/static.png, a real traffic-night-v2 image made smaller) | 'fail' | (n, url) => { status, body }
// | { hang: true }; `opts.traffic` / `opts.map` 'live': straight to the real Mapbox (a measurement with a real token).
// `opts.markets` (batch 11: Yahoo Finance, open.er-api.com) 'ok' (the recorded answers in tests/fixtures/markets:
// marketsRecorded) | 'fail' | 'live' (fetched from the real sources by Node at that moment) | (n, url) => { status, body }.
// Left out: the request is aborted (a network failure), as before these screens existed.
// Every news feed of every language, the most specific address first (NEWSru serves both of its sections).
const NEWS_FEEDS = [['https://www.newsru.co.il/il/www/section/finance', 'newsrufin'], ['https://www.newsru.co.il/', 'newsru'],
  ['https://www.ynet.co.il/', 'ynet'], ['https://www.globes.co.il/', 'globes'], ['https://www.pravda.com.ua/', 'pravda'], ['https://epravda.com.ua/', 'epravda']];
const MAP = /^https:\/\/api\.mapbox\.com\/styles\//;
const HISTORY = 'https://alerts-history.oref.org.il/';
// Batch 11: the Markets screen's sources (Yahoo Finance's spark quotes, open.er-api.com's daily rates; js/config.js `markets`).
// FIX-11B C8: their recorded answers (tests/fixtures/markets, 2026-11-02): each spark request gets the recorded entries of
// exactly the symbols it asks for, a rates request its base's table.
export function marketsRecorded(url) {
  const u = new URL(url);
  if (u.pathname.startsWith('/v7/finance/spark')) {
    const want = u.searchParams.get('symbols').split(',');
    const all = ['spark-1', 'spark-2'].flatMap((f) => JSON.parse(fixtureText('markets/' + f + '.json')).spark.result);
    return { status: 200, contentType: 'application/json', body: JSON.stringify({ spark: { result: all.filter((r) => want.includes(r.symbol)), error: null } }) };
  }
  return { status: 200, contentType: 'application/json', body: fixtureText('markets/rates-' + u.pathname.split('/').pop() + '.json') };
}
const MARKETS = /^https:\/\/(query1\.finance\.yahoo\.com|open\.er-api\.com)\//;
const fixtureText = (rel) => fs.readFileSync(path.join(FIXTURES, rel));
// The Mapbox answers of one round, in route order (tests/fixtures/mapbox/routes.json), and which route a GET asks for
// (its destination, lon,lat, is the answer's second waypoint).
export const trafficFixture = () => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'mapbox', 'routes.json'), 'utf8'));
export function routeIndexOf(url) {
  const to = decodeURIComponent(new URL(url).pathname.split(';')[1]);
  return trafficFixture().findIndex((a) => a.waypoints[1].location.join(',') === to);
}
export function newsSource(url) { for (const [prefix, id] of NEWS_FEEDS) if (url.startsWith(prefix)) return id; return null; }
async function answerFor(kind, opts, url, n) {
  const o = opts[kind];
  const custom = typeof o === 'function' ? o(kind === 'news' ? url : kind === 'traffic' ? Math.ceil(n / 10) : n, url) : null;
  if (custom) return custom;
  if (o === 'fail') return { status: 503, body: '' };
  if (kind === 'markets') {
    if (o === 'ok') return marketsRecorded(url);
    if (o !== 'live') throw new Error('markets: use \'ok\', \'fail\', \'live\' or a function');
    const r = await fetch(url);
    return { status: r.status, contentType: r.headers.get('content-type') || 'application/json', body: Buffer.from(await r.arrayBuffer()) };
  }
  if (kind === 'air' || kind === 'hebcal') {
    if (o === 'ok') return kind === 'air' ? airAnswer(url) : hebcalAnswer(url);
    if (o !== 'live') throw new Error(kind + ': use \'ok\', \'fail\', \'live\' or a function');
    const r = await fetch(url);
    return { status: r.status, contentType: r.headers.get('content-type') || 'application/json', body: Buffer.from(await r.arrayBuffer()) };
  }
  if (kind === 'news') {
    if (o === 'live') { const r = await fetch(url); return { status: r.status, body: Buffer.from(await r.arrayBuffer()) }; }
    return { status: 200, body: fixtureText('news/' + newsSource(url) + '.xml') };   // 'ok', or a function that answered null
  }
  if (kind === 'alerts' || kind === 'history') return { status: 200, body: fixtureText('oref/' + o) };
  if (kind === 'map') return { status: 200, contentType: 'image/png', headers: { 'Cache-Control': 'max-age=60,s-maxage=30' }, body: fixtureText('mapbox/static.png') };
  return { status: 200, body: JSON.stringify(trafficFixture()[routeIndexOf(url)]) };
}

// opts: { weather: 'ok' | 'fail' | 'ok-then-fail' | (n, url) => { status, body }, lang, news, alerts, traffic,
//         now (the app's clock at start; default FIXED_NOW), cpuThrottle (CPU slow-down factor from the first byte),
//         configure: source of a function(Config) run as js/config.js assigns it,
//         home: source of a function(Config) run right after the home city is written into Config (HomeCity.apply at
//         boot: the routes, the map and the alert areas exist only from then on),
//         init: source of a script run before the app (e.g. remove Intl, stub tizen / webapis) }
// window.__offsetMs moves the app's clock (Date.now) forward.
export async function openApp(opts = {}) {
  const puppeteer = loadPuppeteer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-browser-'));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: profile, args: ['--window-size=1920,1080', '--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const weatherRequests = [];
  const requests = { news: [], alerts: [], history: [], traffic: [], map: [], markets: [], air: [], hebcal: [] };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((fixed, lang, configure, init, home) => {
    const start = Date.now(), realNow = Date.now;
    window.__offsetMs = 0;
    Date.now = () => fixed + (realNow() - start) + window.__offsetMs;
    if (init) (0, eval)(init);
    // Config is adjusted the moment js/config.js assigns it, before the app boots.
    if (lang || configure) {
      const fn = configure ? (0, eval)('(' + configure + ')') : null;
      let cfg;
      Object.defineProperty(window, 'Config', { configurable: true,
        get: () => cfg, set: (v) => { if (lang) v.lang = lang; if (fn) fn(v); cfg = v; } });
    }
    if (home) {
      const after = (0, eval)('(' + home + ')');
      let hc;
      Object.defineProperty(window, 'HomeCity', { configurable: true, get: () => hc,
        set: (v) => { const apply = v.apply; v.apply = (c, d) => { apply(c, d); after(c); }; hc = v; } });
    }
  }, opts.now || FIXED_NOW, opts.lang || null, opts.configure ? String(opts.configure) : null, opts.init || null, opts.home ? String(opts.home) : null);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    let done;
    if (url.startsWith(ORIGIN + '/')) {
      const rel = decodeURIComponent(url.slice(ORIGIN.length + 1).split('?')[0]) || 'index.html';
      const file = path.join(ROOT, rel);
      done = !file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile() ? req.respond({ status: 404, body: '' })
        : req.respond({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    } else if (url.startsWith('https://api.open-meteo.com/')) {
      weatherRequests.push(url);
      const n = weatherRequests.length;
      const fail = opts.weather === 'fail' || (opts.weather === 'ok-then-fail' && n > 1);
      const answer = typeof opts.weather === 'function' ? opts.weather(n, url)
        : fail ? { status: 503, body: '' } : { status: 200, body: weatherAnswer(url) };
      done = req.respond({ status: answer.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: answer.body });
    } else {
      const kind = newsSource(url) ? 'news' : url.startsWith('https://www.oref.org.il/') ? 'alerts' : url.startsWith(HISTORY) ? 'history' : MAP.test(url) ? 'map'
        : url.startsWith('https://api.mapbox.com/') ? 'traffic' : MARKETS.test(url) ? 'markets'
        : url.startsWith('https://air-quality-api.open-meteo.com/') ? 'air' : url.startsWith('https://www.hebcal.com/') ? 'hebcal' : null;
      if (kind) requests[kind].push({ url, method: req.method(), headers: req.headers(), body: req.postData() });
      if (!kind || opts[kind] === undefined) done = req.abort();
      else if ((kind === 'map' || kind === 'traffic') && opts[kind] === 'live') done = req.continue();   // the real service
      else if (req.method() === 'OPTIONS') done = req.respond(kind === 'alerts' || kind === 'history' ? { status: 200, headers: { Allow: 'GET, HEAD' }, body: '' } : { status: 204, headers: CORS });
      else done = answerFor(kind, opts, url, requests[kind].length).then((a) => (a.hang ? null
        : req.respond({ status: a.status, headers: Object.assign({}, CORS, a.headers), contentType: a.contentType, body: a.body })));
    }
    Promise.resolve(done).catch(() => {});
  });
  if (opts.cpuThrottle) {                         // e.g. 6: a slow TV CPU, set before the first byte so boot is measured too
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuThrottle });
  }
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'load' });
  return { browser, page, weatherRequests, requests, errors, close: async () => { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); } };
}

// Every visible element matching `selector` (default: everything inside #stage): its box, and whether its text is cut (scrollWidth > clientWidth).
export function measure(selector = '#stage *') {
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
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

// Text legibility over the lightest card: every own-text element matching `selector` at ≥ 24 px and ≥ 4.5:1, Inter
// loaded with tabular figures. Runs in the page (page.evaluate(legibility, selector)).
export async function legibility(selector = '#stage *') {
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
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('svg') || !el.childNodes.length) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el), m = cs.color.match(/[\d.]+/g).map(Number);
    // the colour's own alpha times every ancestor's opacity (FB5B-T5: an opacity on a parent dims the text as much)
    let alpha = m.length > 3 ? m[3] : 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) alpha *= parseFloat(getComputedStyle(a).opacity);
    if (!alpha || cs.visibility === 'hidden') continue;          // not drawn at all (a hidden screen): nothing to read
    const fg = over(m.slice(0, 3), alpha, bg);
    const contrast = (lum(fg) + 0.05) / (lum(bg) + 0.05);
    if (parseFloat(cs.fontSize) < 24 || contrast < 4.5) bad.push(el.className + ' "' + el.textContent.trim().slice(0, 20) + '" ' + cs.fontSize + ' ' + contrast.toFixed(2));
  }
  const t = document.querySelector('.clock-time');
  const width = (text) => { const s = document.createElement('span'); s.textContent = text; t.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
  return { bad, inter: ['300 104px Inter', '400 30px Inter', '500 34px Inter'].map((f) => document.fonts.check(f)),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.weight).sort().join(','),
    family: getComputedStyle(document.body).fontFamily, tnum: [width('1111'), width('0000')] };
  }
