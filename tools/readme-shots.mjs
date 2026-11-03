// Renders the README gallery into docs/screenshots/ at 1920×1080 in headless Chrome, from the test fixtures:
//   he-1-main … he-8-alerts   every screen in Hebrew (the README's language for screenshots)
//   he-alert, he-alert-preview   the alert (it opens and fills the Alerts screen) and the blue key's preview
//   he-banner, he-city           the red home-alert banner on another screen, and the home-city picker (OK)
//   ru-1-main, uk-3-news, ru-4-markets, uk-4-markets   the Languages row
//   hero.png                     a 1600-px collage of the eight Hebrew screens
// The weather, news, traffic and alert screens at the moment their answers were recorded (2026-10-29, page.mjs FIXED_NOW);
// the Markets and Shabbat screens and the air quality at theirs (2026-11-02 09:31 in Israel, batch 11 / 12).
//   PUPPETEER_CORE_DIR=<dir with puppeteer-core> node tools/readme-shots.mjs [--map <png>] [--only a.png,b.png]
// --only: write just these files (the hero is always composed from the screen shots on disk).
// --live (needs MAPBOX_TOKEN in the environment): every shot at the real time with the real forecast. The home and Israel
// weather screens (he-1-main, he-2-israel, ru-1-main) and the banner and city-picker shots over the home screen keep the
// khamsin air fixture (see LIVE below); every other shot takes every source live (news, markets, Hebcal, Mapbox, Pikud
// HaOref), except the alert itself in he-alert and he-banner (the recorded Rehovot alert: see DEMO_ALERT).
// --map: a real Mapbox traffic-night-v2 picture of the map card to show instead of the small fixture image — the raw Static
// Images answer at the configured centre and zoom (Rehovot's view) at the card's size @2x (1792×880), as the app asks for it;
// the page draws its own home dot and name, the traffic key and the attribution over it, as on the TV.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { openApp, ROOT, FIXED_NOW } from '../tests/browser/page.mjs';

const OUT = path.join(ROOT, 'docs', 'screenshots');
const mapAt = process.argv.indexOf('--map');
const realMap = mapAt > 0 ? fs.readFileSync(process.argv[mapAt + 1]) : null;
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1].split(',') : null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (p, code) => p.evaluate((code) => { const e = new Event('keydown', { cancelable: true }); Object.defineProperty(e, 'keyCode', { value: code }); document.dispatchEvent(e); }, code);
const RIGHT = 39, BLUE = 406, OK = 13;
const SCREENS = ['main', 'israel', 'news', 'markets', 'shabbat', 'traffic', 'map', 'alerts'];
const NOV2 = Date.parse('2026-11-02T07:31:00Z');
const NOW = { markets: NOV2, shabbat: NOV2 };
const live = process.argv.includes('--live');
// --live: these shots take the real Open-Meteo forecast at the real time. The weather screens and the two shots drawn over
// the home screen (the banner, the city picker) show a KHAMSIN (the owner, 2026-11-02: the README must show it): their air is
// tests/fixtures/air/aq-4places-hourly-khamsin-synthetic-2026-11-02.json — Rehovot's recorded 2026-11-02 forecast with a
// synthetic khamsin over it (18:00 on 2 November to 15:00 on 3 November), the Israel regions as recorded (Beer Sheva's real
// 185 µg/m³ day). Taken on 2–3 November so its hours line up with the clock.
const LIVE = ['he-1-main.png', 'he-2-israel.png', 'ru-1-main.png', 'he-banner.png', 'he-city.png'];
const KHAMSIN_AIR = () => ({ status: 200, contentType: 'application/json',
  body: fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'air', 'aq-4places-hourly-khamsin-synthetic-2026-11-02.json')) });
const fetched = new Map();
// One real answer per URL, fetched synchronously (the harness answers a request in the same tick).
function real(url) {
  if (!fetched.has(url)) fetched.set(url, execFileSync('curl', ['-sS', '--max-time', '20', '-A', 'Mozilla/5.0', url], { maxBuffer: 1 << 24 }));
  return { status: 200, contentType: 'application/json', body: fetched.get(url) };
}

// --live, every other shot (FIX-16C, the owner: the README shots are current): every source answers live at the real time —
// the news feeds, Yahoo Finance / open.er-api, Hebcal, Open-Meteo (weather and air), Pikud HaOref's live feed and history,
// and Mapbox (the routes and the map, with the real token from the MAPBOX_TOKEN environment variable: never written into a
// file). The alert itself (he-alert, he-banner) stays the recorded Rehovot alert: a live one exists only during a real alert.
const TOKEN = process.env.MAPBOX_TOKEN || '';
if (live && !/^pk\./.test(TOKEN)) throw new Error('--live needs MAPBOX_TOKEN (the public pk. token) in the environment');
const DEMO_ALERT = ['he-alert.png', 'he-banner.png'];
// Pikud HaOref answers only with the headers its own site sends; fetched asynchronously, so a slow answer never holds the
// other sources up.
// A full desktop-Chrome User-Agent: since 2026-11-03 the live feed answers 403 text/html to a bare «Mozilla/5.0»
// (measured 17:11 IL: bare 403, this one 200 application/json).
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const oref = async (n, url) => {
  const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.oref.org.il/', 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(20000) });
  return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
};

async function shot(file, { lang, alerts = 'empty-bom.txt', screen = 'main', act }) {
  if (only && !only.includes(file)) return;
  const isLive = live && LIVE.includes(file), allLive = live && !LIVE.includes(file);
  const app = await openApp({ lang, news: allLive ? 'live' : 'ok', alerts: allLive && !DEMO_ALERT.includes(file) ? oref : alerts,
    history: allLive ? oref : 'history.json', traffic: allLive ? 'live' : 'ok', markets: allLive ? 'live' : 'ok', hebcal: allLive ? 'live' : 'ok',
    air: isLive ? KHAMSIN_AIR : allLive ? 'live' : 'ok', weather: live ? (n, url) => real(url) : 'ok', now: live ? Date.now() : NOW[screen] || FIXED_NOW,
    map: allLive ? 'live' : realMap ? () => ({ status: 200, contentType: 'image/png', body: realMap }) : 'ok',
    // the source of a function the page runs (page.mjs): the token goes in as a literal, never through a closure
    configure: '(c) => { c.traffic.token = ' + JSON.stringify(allLive ? TOKEN : 'pk.FIXTURE123') + '; c.rotation.enabled = false; }' });
  try {
    const p = app.page;
    await p.waitForSelector('.day', { timeout: 10000 });
    for (let i = 0; i < SCREENS.indexOf(screen); i++) await press(p, RIGHT);
    if (act) await act(p);
    await p.evaluate(() => document.fonts.ready);
    await wait(live ? 8000 : 1500);   // live answers (news, markets, routes, the map) take seconds to arrive
    if (app.errors.length) throw new Error(file + ': ' + app.errors.join('; '));
    await p.screenshot({ path: path.join(OUT, file) });
    console.log(path.join(OUT, file));
  } finally { await app.close(); }
}

const HE = ['he-1-main.png', 'he-2-israel.png', 'he-3-news.png', 'he-4-markets.png', 'he-5-shabbat.png', 'he-6-traffic.png', 'he-7-map.png', 'he-8-alerts.png'];
for (let i = 0; i < SCREENS.length; i++) await shot(HE[i], { lang: 'he', screen: SCREENS[i] });
await shot('he-alert.png', { lang: 'he', alerts: 'rehovot.json' });
await shot('he-alert-preview.png', { lang: 'he', act: (p) => press(p, BLUE) });
// The home alert opens the Alerts screen; one step right is the home screen, where the red banner stays on top.
await shot('he-banner.png', { lang: 'he', alerts: 'rehovot.json', act: async (p) => { await wait(800); await press(p, RIGHT); } });
await shot('he-city.png', { lang: 'he', act: (p) => press(p, OK) });
await shot('ru-1-main.png', { lang: 'ru' });
await shot('uk-3-news.png', { lang: 'uk', screen: 'news' });
await shot('ru-4-markets.png', { lang: 'ru', screen: 'markets' });
await shot('uk-4-markets.png', { lang: 'uk', screen: 'markets' });

// The hero: the eight Hebrew screens in a 4 × 2 grid, each with its caption.
const CAPTIONS = ['Clocks, weather, UV and air at home', 'Weather and air across Israel', 'News in the interface language', 'Markets: currencies, shares, crypto',
  'Shabbat and holidays', 'Live traffic, ten routes', 'Live traffic map', 'Pikud HaOref alerts'];
const tiles = HE.map((f, i) => '<figure><img src="data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64') + '"><figcaption>' +
  CAPTIONS[i] + '</figcaption></figure>').join('');
const html = '<!DOCTYPE html><html><head><style>' +
  'html,body{margin:0;width:1600px;background:#0b1020;font-family:Inter,"Helvetica Neue",Arial,sans-serif}' +
  'body{background:radial-gradient(ellipse 80% 60% at 50% 0%,#1d2a52 0%,#0b1020 70%)}' +
  '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:40px}' +
  'figure{margin:0}img{display:block;width:100%;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}' +
  'figcaption{margin-top:12px;text-align:center;font-size:18px;color:rgba(255,255,255,.82)}' +
  '</style></head><body><div class="grid">' + tiles + '</div></body></html>';
const app = await openApp({ news: 'ok', alerts: 'empty-bom.txt' });
try {
  const page = await app.browser.newPage();
  await page.setViewport({ width: 1600, height: 400 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'hero.png'), fullPage: true });
  console.log(path.join(OUT, 'hero.png'));
} finally { await app.close(); }
