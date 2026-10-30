// Maintains js/cities.js (the home-city catalogue). Run by hand with Node 22 (full ICU); the build never runs it.
//   node tools/cities.mjs --order   rewrites Cities.order: the picker's order per language, sorted with Intl.Collator
//   node tools/cities.mjs --check   compares the catalogue with the live sources and reports drift (nothing is written):
//                                   a `match` name Pikud HaOref no longer lists (home alerts would silently stop — run it
//                                   at every release), and a city centre more than 2 km from Open-Meteo's geocoding.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'js', 'cities.js');
const LANGS = ['ru', 'he', 'uk', 'en'];
const DRIFT_KM = 2;

// The app's own catalogue and functions (the distance of js/homecity.js, the name rule of js/alerts.js), never copies.
function app() {
  const ctx = { Math, JSON, String, Array, Object, RegExp, Error };
  vm.createContext(ctx);
  for (const f of ['cities.js', 'homecity.js', 'alerts.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), ctx, { filename: f });
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

async function check() {
  const { Cities, HomeCity, Alerts } = app(), cities = Cities.list, problems = [], km = HomeCity.km;
  const oref = await (await fetch('https://www.oref.org.il/districts/districts_heb.json')).json();
  const labels = oref.map((d) => d.label);
  for (const c of cities) for (const m of c.match || [c.he]) if (!labels.some((l) => Alerts.covers(l, m))) problems.push(c.id + ': Oref lists no area for "' + m + '"');
  for (const c of cities) {
    const u = 'https://geocoding-api.open-meteo.com/v1/search?count=1&countryCode=IL&language=he&name=' + encodeURIComponent(c.he);
    const r = (await (await fetch(u)).json()).results;
    if (!r || !r.length) { console.log('- ' + c.id + ': no geocoding (kept as is)'); continue; }
    const d = km(c.at, [r[0].latitude, r[0].longitude]);
    if (d > DRIFT_KM) problems.push(c.id + ': ' + d.toFixed(1) + ' km from geocoding ("' + r[0].name + '")');
  }
  console.log(problems.length ? problems.join('\n') : 'no drift');
  process.exitCode = problems.length ? 1 : 0;
}

const arg = process.argv[2];
if (arg === '--order') order();
else if (arg === '--check') await check();
else { console.error('usage: node tools/cities.mjs --order | --check'); process.exit(2); }
