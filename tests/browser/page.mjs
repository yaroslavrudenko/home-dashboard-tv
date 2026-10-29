// Opens the app in headless Chrome at the TV's 1920×1080. Every request is answered by interception:
// app files from the repo, Open-Meteo from tests/fixtures (or a failure), anything else aborted.
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
const BY_LAT = { '31.8928': 'rehovot', '50.4501': 'kyiv', '-33.8688': 'sydney' };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

// The answer to one multi-location request: one recorded fixture per requested latitude, in order.
export function weatherAnswer(url) {
  const lats = new URL(url).searchParams.get('latitude').split(',');
  return '[' + lats.map((lat) => fs.readFileSync(path.join(FIXTURES, BY_LAT[lat] + '.json'), 'utf8')).join(',') + ']';
}

function loadPuppeteer() {
  const dir = process.env.PUPPETEER_CORE_DIR;
  const req = createRequire(dir ? path.join(dir, 'noop.js') : import.meta.url);
  try { return req('puppeteer-core'); } catch (e) {
    throw new Error('puppeteer-core not found: set PUPPETEER_CORE_DIR (browser tests fail rather than skip). ' + e.message);
  }
}

// opts: { weather: 'ok' | 'fail' | 'ok-then-fail' | (n, url) => { status, body }, lang,
//         configure: source of a function(Config) run as js/config.js assigns it,
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((fixed, lang, configure, init) => {
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
  }, FIXED_NOW, opts.lang || null, opts.configure ? String(opts.configure) : null, opts.init || null);
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
    } else done = req.abort();
    Promise.resolve(done).catch(() => {});
  });
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'load' });
  return { browser, page, weatherRequests, errors, close: async () => { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); } };
}
