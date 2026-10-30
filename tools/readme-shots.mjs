// Renders the README gallery into docs/screenshots/ at 1920×1080 in headless Chrome, from the test fixtures:
//   he-1-main … he-6-alerts   every screen in Hebrew (the README's language for screenshots)
//   he-alert, he-alert-preview   the full-screen alert and the blue key's preview
//   ru-1-main, uk-3-news         the Languages row
//   hero.png                     a 1600-px collage of the six Hebrew screens
//   PUPPETEER_CORE_DIR=<dir with puppeteer-core> node tools/readme-shots.mjs [--map <png>]
// --map: a real Mapbox traffic-night-v2 picture of the map card (1790×910) to show instead of the small fixture image —
// cropped from a capture of the app on 2026-10-30, so it already carries the home dot and the «© Mapbox © OpenStreetMap»
// line: the page's own two are hidden for that shot, never drawn twice.
import fs from 'node:fs';
import path from 'node:path';
import { openApp, ROOT } from '../tests/browser/page.mjs';

const OUT = path.join(ROOT, 'docs', 'screenshots');
const mapAt = process.argv.indexOf('--map');
const realMap = mapAt > 0 ? fs.readFileSync(process.argv[mapAt + 1]) : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, BLUE = 406;
const SCREENS = ['main', 'israel', 'news', 'traffic', 'map', 'alerts'];

async function shot(file, { lang, alerts = 'empty-bom.txt', screen = 'main', act }) {
  const app = await openApp({ lang, news: 'ok', alerts, history: 'history.json', traffic: 'ok',
    map: realMap ? () => ({ status: 200, contentType: 'image/png', body: realMap }) : 'ok',
    configure: (c) => { c.traffic.token = 'pk.FIXTURE123'; c.rotation.enabled = false; } });
  try {
    const p = app.page;
    await p.waitForSelector('.day', { timeout: 10000 });
    for (let i = 0; i < SCREENS.indexOf(screen); i++) await press(p, RIGHT);
    if (act) await act(p);
    if (realMap && screen === 'map') await p.addStyleTag({ content: '.map-attribution, .map-home { visibility: hidden !important; }' });
    await p.evaluate(() => document.fonts.ready);
    await wait(1500);
    if (app.errors.length) throw new Error(file + ': ' + app.errors.join('; '));
    await p.screenshot({ path: path.join(OUT, file) });
    console.log(path.join(OUT, file));
  } finally { await app.close(); }
}

const HE = ['he-1-main.png', 'he-2-israel.png', 'he-3-news.png', 'he-4-traffic.png', 'he-5-map.png', 'he-6-alerts.png'];
for (let i = 0; i < SCREENS.length; i++) await shot(HE[i], { lang: 'he', screen: SCREENS[i] });
await shot('he-alert.png', { lang: 'he', alerts: 'rehovot.json' });
await shot('he-alert-preview.png', { lang: 'he', act: (p) => press(p, BLUE) });
await shot('ru-1-main.png', { lang: 'ru' });
await shot('uk-3-news.png', { lang: 'uk', screen: 'news' });

// The hero: the six Hebrew screens in a 3 × 2 grid, each with its caption.
const CAPTIONS = ['Clocks and weather at home', 'Weather across Israel', 'News in the interface language', 'Live traffic, ten routes',
  'Live traffic map', 'Pikud HaOref alerts'];
const tiles = HE.map((f, i) => '<figure><img src="data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') + '"><figcaption>' +
  CAPTIONS[i] + '</figcaption></figure>').join('');
const html = '<!DOCTYPE html><html><head><style>' +
  'html,body{margin:0;width:1600px;background:#0b1020;font-family:Inter,"Helvetica Neue",Arial,sans-serif}' +
  'body{background:radial-gradient(ellipse 80% 60% at 50% 0%,#1d2a52 0%,#0b1020 70%)}' +
  '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:48px}' +
  'figure{margin:0}img{display:block;width:100%;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}' +
  'figcaption{margin-top:14px;text-align:center;font-size:21px;color:rgba(255,255,255,.82)}' +
  '</style></head><body><div class="grid">' + tiles + '</div></body></html>';
const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt' });
try {
  const page = await app.browser.newPage();
  await page.setViewport({ width: 1600, height: 400 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'hero.png'), fullPage: true });
  console.log(path.join(OUT, 'hero.png'));
} finally { await app.close(); }
