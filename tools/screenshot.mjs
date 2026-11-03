// Writes docs/screenshot.png: the app at 1920×1080 in headless Chrome with the recorded weather fixtures.
//   PUPPETEER_CORE_DIR=<dir with puppeteer-core> node tools/screenshot.mjs [out.png]
import path from 'node:path';
import { openApp, ROOT } from '../tests/browser/page.mjs';

const out = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'screenshot.png'));
// G12: the screen as the TV shows it — the air block filled, the alert feed answering (its empty, BOM-only body), the
// rotation held on the main screen; the shot waits for the air figures and the fonts, never only for the days.
const app = await openApp({ weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
try {
  await app.page.waitForSelector('.day', { timeout: 10000 });
  await app.page.waitForSelector('.now-air .air-num', { timeout: 10000 });
  await app.page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));
  await app.page.screenshot({ path: out });
  console.log(out);
} finally { await app.close(); }
