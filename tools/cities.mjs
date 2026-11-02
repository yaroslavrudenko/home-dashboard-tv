// Maintains js/cities.js (the home-city catalogue). Run by hand with Node 22 (full ICU); the build never runs it.
//   node tools/cities.mjs --order   rewrites Cities.order: the picker's order per language, sorted with Intl.Collator
//   node tools/cities.mjs --check   compares the catalogue with the live sources and reports drift (nothing is written):
//                                   a `match` name Pikud HaOref no longer lists (home alerts would silently stop — run it
//                                   at every release), and a city centre more than 2 km from Open-Meteo's geocoding.
//                                   Pikud HaOref's list and the geocoding run at once, the geocoding POOL cities at a time,
//                                   every request with a TIMEOUT_MS deadline; a request that fails or times out fails the
//                                   check (exit 1, never "no drift"). check(fetch) is exported for the tests.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'js', 'cities.js');
const LANGS = ['ru', 'he', 'uk', 'en'];
const DRIFT_KM = 2;
const POOL = 8;                       // geocoding requests in flight at most (Codex P1: bounded, never 83 one after another)
const TIMEOUT_MS = 20000;             // every request's deadline (Codex P2)
const OREF = 'https://www.oref.org.il/districts/districts_heb.json';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search?count=1&countryCode=IL&language=he&name=';

// The app's own catalogue and functions (the distance of js/homecity.js, the name rule of js/alerts.js), never copies.
function app() {
  const ctx = { Math, JSON, String, Array, Object, RegExp, Error };
  vm.createContext(ctx);
  for (const f of ['num.js', 'cities.js', 'homecity.js', 'alerts.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const load = () => app().Cities;

function order() {
  const src = fs.readFileSync(FILE, 'utf8'), list = load().list;
  const block = LANGS.map((lang) => {
    const coll = new Intl.Collator(lang);
    const ids = list.slice().sort((a, b) => coll.compare(a[lang], b[lang])).map((c) => "'" + c.id + "'");
    return '    ' + lang + ': [' + ids.join(', ') + ']';
  }).join(',\n');
  const next = src.replace(/ {2}order: \{[^}]*\}/, '  order: {\n' + block + '\n  }');
  if (next === src && !/order: \{\n/.test(src)) throw new Error('order block not found');
  fs.writeFileSync(FILE, next);
  console.log('order written for', LANGS.join(', '), '·', list.length, 'cities');
}

// One GET as JSON with the deadline; anything but a 2xx answer throws.
async function getJson(url, get) {
  const r = await get(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return r.json();
}
// fn over every item, at most `limit` at once; the results in the items' order.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// The drift report: [problem], and notes said through `log`. Pikud HaOref and the geocoding together (independent).
export async function check(get = fetch, log = console.log) {
  const { Cities, HomeCity, Alerts } = app(), cities = Cities.list, problems = [], km = HomeCity.km;
  const [oref, geo] = await Promise.all([getJson(OREF, get), pool(cities, POOL, (c) => getJson(GEO + encodeURIComponent(c.he), get))]);
  const labels = oref.map((d) => d.label);
  for (const c of cities) for (const m of c.match || [c.he]) if (!labels.some((l) => Alerts.covers(l, m))) problems.push(c.id + ': Oref lists no area for "' + m + '"');
  cities.forEach((c, i) => {
    const r = geo[i].results;
    if (!r || !r.length) { log('- ' + c.id + ': no geocoding (kept as is)'); return; }
    const d = km(c.at, [r[0].latitude, r[0].longitude]);
    if (d > DRIFT_KM) problems.push(c.id + ': ' + d.toFixed(1) + ' km from geocoding ("' + r[0].name + '")');
  });
  return problems;
}
export const LIMITS = { POOL, TIMEOUT_MS };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = process.argv[2];
  if (arg === '--order') order();
  else if (arg === '--check') {
    try {
      const problems = await check();
      console.log(problems.length ? problems.join('\n') : 'no drift');
      process.exitCode = problems.length ? 1 : 0;
    } catch (e) { console.error('check failed: ' + e.message); process.exitCode = 1; }
  } else { console.error('usage: node tools/cities.mjs --order | --check'); process.exit(2); }
}
