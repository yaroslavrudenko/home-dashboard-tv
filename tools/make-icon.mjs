// Renders img/icon.svg to img/icon.png at exactly 512×423 (the Samsung Smart TV tile size) in headless Chrome.
//   PUPPETEER_CORE_DIR=<dir with puppeteer-core> node tools/make-icon.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.PUPPETEER_CORE_DIR;
const puppeteer = createRequire(dir ? path.join(dir, 'noop.js') : import.meta.url)('puppeteer-core');
const svg = fs.readFileSync(path.join(ROOT, 'img', 'icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 423 });
  await page.setContent('<html><body style="margin:0">' + svg + '</body></html>');
  const out = path.join(ROOT, 'img', 'icon.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 512, height: 423 } });
  console.log(out);
} finally { await browser.close(); }
