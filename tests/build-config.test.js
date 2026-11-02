'use strict';
// Packaging and platform constraints: config.xml, the tile icon, the bundled fonts, build.sh's argument
// handling, tools/find-tv.sh's choice of device, and the CSS features Chromium 47 (Tizen 3.0) lacks.
// build.sh and find-tv.sh run only as copies in a temp folder against stub tizen / sdb / nc / ipconfig
// commands, so no test can ever reach a real TV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./harness');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Decision 21 (F13): least privilege — the app's own files plus exactly the hosts it reads (batch 2: news, alerts, traffic;
// batch 6: Mapbox instead of TomTom).
// Batch 6: the news feeds of the three languages (L2) and Mapbox; batch 7: the traffic map is a Mapbox image (img-src),
// the Waze frame and its hosts are gone. Batch 8: the Alerts screen's recent alerts (alerts-history.oref.org.il).
// Batch 11: the Markets screen's quotes (Yahoo's spark endpoint on query1) and daily rates (open.er-api).
const DATA = ['https://api.open-meteo.com', 'https://www.newsru.co.il', 'https://www.ynet.co.il', 'https://www.globes.co.il',
  'https://www.pravda.com.ua', 'https://epravda.com.ua', 'https://www.oref.org.il', 'https://alerts-history.oref.org.il', 'https://api.mapbox.com',
  'https://query1.finance.yahoo.com', 'https://open.er-api.com',
  // Batch 12: the air quality (Open-Meteo's air-quality API) and the Shabbat & holidays calendar (Hebcal).
  'https://air-quality-api.open-meteo.com', 'https://www.hebcal.com',
  // Batch 15: MET Norway, the weather's fallback source (forecast and sunrise).
  'https://api.met.no'];
const ORIGINS = DATA;
test('config.xml: package HomeDash01, app HomeDash01.Dashboard, Tizen 3.0, TV profile, internet, exactly the hosts the app reads', () => {
  const x = read('config.xml');
  assert.match(x, /<tizen:application id="HomeDash01\.Dashboard" package="HomeDash01" required_version="3\.0"\/>/);
  assert.match(x, /<name>Home Dashboard<\/name>/);
  assert.match(x, /<tizen:profile name="tv-samsung"\/>/);
  assert.match(x, /<tizen:privilege name="http:\/\/tizen\.org\/privilege\/internet"\/>/);
  assert.match(x, /<tizen:privilege name="http:\/\/tizen\.org\/privilege\/tv\.inputdevice"\/>/, 'L1: the language key is registered');
  assert.deepEqual([...x.matchAll(/<access origin="([^"]+)" subdomains="false"\/>/g)].map((m) => m[1]), ORIGINS);
  assert.equal((x.match(/<access /g) || []).length, ORIGINS.length, 'no other origin');
  const csp = x.match(/<tizen:content-security-policy>([^<]+)</)[1];
  assert.match(csp, /default-src 'self'/);
  assert.equal(csp.match(/connect-src ([^;]+)/)[1].trim(), DATA.join(' '));
  assert.ok(!/\*/.test(csp), 'no wildcard: ' + csp);
  assert.equal(csp.match(/img-src ([^;]+)/)[1].trim(), "'self' data: https://api.mapbox.com", 'the traffic map image from Mapbox only');
  assert.ok(!/frame-src|child-src|waze/.test(x), 'no frame and no Waze host');
  assert.match(x, /<icon src="img\/icon\.png"\/>/);
  assert.match(x, /<content src="index\.html"\/>/);
});

// Every host the code reads is in the policy, and nothing else: the feeds, the alert feed, Mapbox, Open-Meteo.
test('every URL in js/config.js is on an origin config.xml allows', () => {
  const urls = [...read('js/config.js').matchAll(/'(https:\/\/[^']+)'/g)].map((m) => new URL(m[1]).origin);
  assert.ok(urls.length >= 10, urls.join(' '));   // six feeds, weather, alerts, the routes and the map
  for (const o of urls) assert.ok(ORIGINS.includes(o), o);
  for (const o of DATA) assert.ok(urls.includes(o), 'unused origin ' + o);
});

// The Mapbox token never enters the repository: the committed config carries the placeholder, the build replaces it.
// (Batch 6: the TomTom key is gone with TomTom.)
test('js/config.js holds the Mapbox placeholder, never a token; build.local.env.example documents MAPBOX_TOKEN', () => {
  assert.match(read('js/config.js'), /token: '__MAPBOX_TOKEN__',/);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    const keys = [...read('js/' + f).matchAll(/\b(?:key|token)\s*:\s*'([^']*)'/g)].map((m) => m[1]);
    assert.ok(keys.every((k) => k === '__MAPBOX_TOKEN__'), 'js/' + f + ': ' + keys);
    assert.ok(!/pk\.eyJ/.test(read('js/' + f)), 'js/' + f + ': no Mapbox token');
  }
  assert.ok(!/TOMTOM/.test(read('js/config.js') + read('build.sh') + read('build.local.env.example')), 'TomTom gone');
  assert.match(read('build.local.env.example'), /^MAPBOX_TOKEN=$/m);
  assert.match(read('.gitignore'), /^build\.local\.env$/m);
});

test('the tile icon is a 512×423 PNG (square icons are stretched on Samsung TVs)', () => {
  const b = fs.readFileSync(path.join(ROOT, 'img', 'icon.png'));
  assert.equal(b.toString('latin1', 1, 4), 'PNG');
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [512, 423]);
});

test('build.sh --package stops after signing, before any TV command', () => {
  const lines = read('build.sh').split('\n').filter((l) => !/^\s*#/.test(l));
  const stop = lines.findIndex((l) => /package_only\s*\)\)\s*&&\s*exit 0/.test(l));
  const firstTv = lines.findIndex((l) => /\$SDB|find-tv/.test(l));
  const sign = lines.findIndex((l) => /\$TIZEN package -t wgt -s "\$CERT_PROFILE"/.test(l));
  assert.ok(sign >= 0 && stop > sign && firstTv > stop, JSON.stringify({ sign, stop, firstTv }));
});

test('no secrets in the repository files that are packaged', () => {
  for (const f of ['config.xml', 'index.html', ...fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)]) {
    // a secret is a literal value given to such a name; the one allowed is the build placeholder
    const text = read(f).replace("token: '__MAPBOX_TOKEN__'", '');
    assert.ok(!/(api[_-]?key|apikey|token|password|OTT_KEY)\s*[:=]\s*['"][^'"\n]+['"]/i.test(text), f);
    assert.ok(!/pk\.eyJ|sk\.eyJ/.test(text), f + ': no Mapbox token');
  }
});

test('CSS uses nothing Chromium 47 lacks (custom properties, grid, backdrop-filter, gap)', () => {
  const css = read('css/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/var\(--|--[a-z][\w-]*\s*:/.test(css), 'custom properties');
  assert.ok(!/display:\s*grid/.test(css), 'grid');
  assert.ok(!/backdrop-filter/.test(css), 'backdrop-filter');
  assert.ok(!/(^|[\s;{])gap\s*:/.test(css), 'flex gap');
});

test('index.html loads every app script, config first and app last', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts[0], 'js/config.js');
  assert.equal(scripts[scripts.length - 1], 'js/app.js');
  assert.deepEqual([...scripts].sort(), fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f).sort());
});

// Decision 1 (D1): Inter is bundled, licensed and packaged; every @font-face file exists.
test('the Inter font files referenced by the CSS exist, carry the OFL licence and are packaged by build.sh', () => {
  const css = read('css/app.css');
  const urls = [...css.matchAll(/url\(\.\.\/(fonts\/Inter-[^)]+)\)/g)].map((m) => m[1]);
  assert.equal(urls.length, 8, 'Light/Regular/Medium × Latin/Cyrillic + "≈" + ₪ ₴ ₽ (batch 11)');
  let bytes = 0;
  for (const u of urls) {
    const b = fs.readFileSync(path.join(ROOT, u));
    assert.equal(b.toString('latin1', 0, 4), 'wOF2', u);
    bytes += b.length;
  }
  assert.ok(bytes < 1024 * 1024, 'fonts stay under 1 MB: ' + bytes);
  assert.match(read('fonts/OFL.txt'), /SIL Open Font License, Version 1\.1/);
  assert.match(read('build.sh'), /cp -R config\.xml index\.html css js img fonts sounds \.buildResult\//);
});

// Batch 11: the Markets screen's currency signs ₪ ₴ ₽ (names and prices, Regular) are in none of Google's Latin / Cyrillic
// subsets, so the TV would draw them in a system font: one more tiny Inter Regular subset with exactly those three, like
// the "≈" one, loaded only when one of them is drawn.
test('Batch 11: ₪ ₴ ₽ come from a bundled Inter Regular subset of exactly those three signs', () => {
  const css = read('css/app.css');
  const face = /@font-face \{ font-family: "Inter"; font-weight: 400; src: url\(\.\.\/(fonts\/Inter-400-currency\.woff2)\) format\("woff2"\); unicode-range: ([^;]+); \}/.exec(css);
  assert.ok(face, 'one @font-face for the currency subset');
  assert.equal(face[2], 'U+20AA, U+20B4, U+20BD');
  const b = fs.readFileSync(path.join(ROOT, face[1]));
  assert.equal(b.toString('latin1', 0, 4), 'wOF2');
  assert.ok(b.length < 2048, 'three glyphs: ' + b.length + ' bytes');
});

// FB5B-H1: Hebrew (news, the alert's original title) has its own bundled face: Noto Sans Hebrew Regular, the Hebrew
// block only, WOFF (Chromium 47), licensed under the OFL; the shared font stack names it after Inter.
test('FB5B-H1: the Noto Sans Hebrew subset is bundled as WOFF for the Hebrew block only, with its OFL licence, in the shared font stack', () => {
  const css = read('css/app.css');
  const face = /@font-face \{ font-family: "Noto Sans Hebrew"; font-weight: 400; src: url\(\.\.\/(fonts\/[^)]+)\) format\("woff"\);\s*unicode-range: ([^;]+); \}/.exec(css);
  assert.ok(face, 'one @font-face for Noto Sans Hebrew');
  assert.equal(face[2], 'U+0590-05FF, U+FB1D-FB4F');
  const b = fs.readFileSync(path.join(ROOT, face[1]));
  assert.equal(b.toString('latin1', 0, 4), 'wOFF', 'WOFF, not WOFF2');
  assert.ok(b.length < 16 * 1024, 'a subset: ' + b.length + ' bytes');
  assert.match(read('fonts/OFL-NotoSansHebrew.txt'), /Copyright 2022 The Noto Project Authors[\s\S]*SIL Open Font License, Version 1\.1/);
  assert.match(css, /font-family: "Inter", "Noto Sans Hebrew", "SamsungOne", "TizenSans", sans-serif;/);
});

// A temp copy of the app with stub `tizen` / `sdb` that log every call. Returns { dir, log(), run(args) }.
function sandbox(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homedash-build-'));
  for (const f of ['build.sh', 'config.xml', 'index.html', 'css', 'js', 'img', 'fonts', 'sounds', 'tools']) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  const log = path.join(dir, 'calls.log');
  const stub = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, '#!/bin/zsh\necho "' + name + ' $*" >> ' + JSON.stringify(log) + '\n' + body); fs.chmodSync(p, 0o755); return p; };
  const tizen = stub('stub-tizen', 'touch "${@: -1}/stub.wgt"\n');
  const sdb = stub('stub-sdb', '');
  stub('tools/find-tv.sh', 'echo 127.0.0.1:1\n');                       // never scan the real network
  fs.writeFileSync(path.join(dir, 'build.local.env'), 'CERT_PROFILE=stub\nDEVICE_PROFILE=/dev/null\nTV=127.0.0.1:1\n' + (env || ''));
  return {
    dir,
    log: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''),
    run: (args) => spawnSync('/bin/zsh', [path.join(dir, 'build.sh'), ...args], { encoding: 'utf8', env: { ...process.env, TIZEN: tizen, SDB: sdb } }),
    close: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

// Decision 19 (Codex 3): every argument is validated before anything runs; a typo never reaches an install.
test('build.sh refuses unknown or extra arguments and answers --help before building or touching a TV', () => {
  const sb = sandbox();
  try {
    for (const args of [['--packge'], ['--package', 'extra'], ['package'], ['-p']]) {
      const r = sb.run(args);
      assert.equal(r.status, 2, args.join(' ') + ': ' + r.stderr);
      assert.match(r.stderr, /unknown argument/);
      assert.equal(sb.log(), '', 'no tizen / find-tv / sdb call for ' + args.join(' '));
      assert.ok(!fs.existsSync(path.join(sb.dir, '.buildResult')), 'nothing built for ' + args.join(' '));
    }
    const help = sb.run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--package/);
    assert.equal(sb.log(), '', 'no tizen / sdb call for --help');
  } finally { sb.close(); }
});

test('build.sh --package signs with the profile and never calls sdb', () => {
  const sb = sandbox();
  try {
    const r = sb.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(sb.log(), /^stub-tizen package -t wgt -s stub -- \.buildResult\n$/);
    assert.ok(fs.existsSync(path.join(sb.dir, '.buildResult', 'HomeDashboard.wgt')));
    assert.ok(fs.existsSync(path.join(sb.dir, '.buildResult', 'fonts', 'Inter-300-latin.woff2')), 'fonts are packaged');
    assert.ok(fs.existsSync(path.join(sb.dir, '.buildResult', 'sounds', 'alert.wav')), 'the alert sound is packaged');
  } finally { sb.close(); }
});

// tools/find-tv.sh against stub nc / ipconfig / sdb: NC_OPEN lists the hosts with the debug port open,
// DUIDS maps host → DUID.
function findTv(args, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homedash-findtv-'));
  const put = (name, body) => { const p = path.join(dir, name); fs.writeFileSync(p, '#!/bin/zsh\n' + body); fs.chmodSync(p, 0o755); return p; };
  put('nc', 'for h in ${=NC_OPEN}; do [[ "$h" == "$4" ]] && exit 0; done; exit 1\n');
  put('ipconfig', 'echo 192.168.1.2\n');
  const sdb = put('sdb', '[[ "$1" == connect ]] && exit 0\nhost=${2%%:*}\nfor kv in ${(s:,:)DUIDS}; do [[ "${kv%%=*}" == "$host" ]] && echo "${kv#*=}\\r"; done\n');
  try {
    return spawnSync('/bin/zsh', [path.join(ROOT, 'tools', 'find-tv.sh'), ...args], { encoding: 'utf8',
      env: { ...process.env, PATH: dir + ':' + process.env.PATH, SDB: sdb, TV_DUID: '', ...env } });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Decision 19 (Codex 4, F15): never guess between several devices; with TV_DUID only the matching one.
test('find-tv.sh fails when several devices answer and nothing tells them apart', () => {
  const r = findTv([], { NC_OPEN: '192.168.1.5 192.168.1.9' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /2 devices answer.*TV_DUID/);
  const one = findTv([], { NC_OPEN: '192.168.1.9' });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout.trim(), '192.168.1.9:26101');
});

test('find-tv.sh with TV_DUID installs only on the device that reports it, even when the old address answers', () => {
  const env = { NC_OPEN: '192.168.1.5 192.168.1.9', DUIDS: '192.168.1.5=AAAA,192.168.1.9=BBBB' };
  const pick = findTv([], { ...env, TV_DUID: 'BBBB' });
  assert.equal(pick.status, 0, pick.stderr);
  assert.equal(pick.stdout.trim(), '192.168.1.9:26101');
  const moved = findTv(['192.168.1.5:26101'], { ...env, TV_DUID: 'BBBB' });
  assert.equal(moved.stdout.trim(), '192.168.1.9:26101', 'the old address answers but is another device');
  const kept = findTv(['192.168.1.9:26101'], { ...env, TV_DUID: 'BBBB' });
  assert.equal(kept.stdout.trim(), '192.168.1.9:26101');
  const none = findTv([], { ...env, TV_DUID: 'CCCC' });
  assert.equal(none.status, 1);
  assert.equal(none.stdout, '');
  assert.match(none.stderr, /none reports TV_DUID=CCCC/);
});

test('build.sh --package with MAPBOX_TOKEN puts the token into the packaged config only; without it the placeholder stays', () => {
  const sb = sandbox('MAPBOX_TOKEN=pk.eyJ1IjoiZXhhbXBsZSJ9.AbC-12_x\n');
  try {
    const r = sb.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    const packaged = fs.readFileSync(path.join(sb.dir, '.buildResult', 'js', 'config.js'), 'utf8');
    assert.match(packaged, /token: 'pk\.eyJ1IjoiZXhhbXBsZSJ9\.AbC-12_x',/);
    assert.ok(!packaged.includes('__MAPBOX_TOKEN__'));
    assert.match(fs.readFileSync(path.join(sb.dir, 'js', 'config.js'), 'utf8'), /token: '__MAPBOX_TOKEN__',/, 'the source copy is untouched');
    assert.match(r.stdout, /Mapbox token: injected/);
    assert.ok(!r.stdout.includes('pk.eyJ1'), 'the token is never printed');
  } finally { sb.close(); }
  const none = sandbox();
  try {
    const r = none.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(none.dir, '.buildResult', 'js', 'config.js'), 'utf8'), /token: '__MAPBOX_TOKEN__',/);
    assert.match(r.stdout, /Mapbox token: not set/);
  } finally { none.close(); }
});

test('build.sh refuses a MAPBOX_TOKEN that is not a public token (pk. then letters, digits, . _ -), before building', () => {
  for (const bad of ["'pk.abc/def'", 'sk.eyJsecret', "'pk.a b'"]) {
    const sb = sandbox('MAPBOX_TOKEN=' + bad + '\n');
    try {
      const r = sb.run(['--package']);
      assert.equal(r.status, 2, bad + ': ' + r.stdout + r.stderr);
      assert.match(r.stderr, /MAPBOX_TOKEN must be a public token/);
      assert.equal(sb.log(), '', 'tizen never ran');
      assert.ok(!fs.existsSync(path.join(sb.dir, '.buildResult')), 'nothing built');
    } finally { sb.close(); }
  }
});

// FB5C (quota; the judges' COMMON DECISION 2026-10-30 + the owner's explicit-open rule), batch 6 (Mapbox): Mapbox's free
// tier is 100,000 Directions requests a MONTH; every refresh costs one request per route (10). The app sends at any hour
// while the screen is on view, at most every 10 min (rotation, staying open, wake), on every explicit ◀ ▶ open, and never
// past 3,000 requests per UTC date (a verified localStorage reservation before every round, no refunds): 32 × 3,000 =
// 96,000 (any 31 days touch at most 32 UTC dates). Simulated from the app's own code for every pattern, failures and restarts included.
const { trafficDays } = require('./traffic-day');
const ALL = (o) => Object.values(o.perUtcDate);

test('Mapbox quota (FB5C-10): every pattern ≤ 3,000 requests per UTC date — failures, refusals, restarts and ◀ ▶ every minute included', () => {
  const patterns = {
    'rotation on, all answers good': {},
    'rotation on, every round 503': { answer: () => 'http 503' },
    'parked on traffic (▶), all answers good': { park: true },
    'parked on traffic, every round times out': { park: true, answer: () => 'timeout' },
    'parked on traffic, 429 all day': { park: true, answer: () => 'http 429' },
    'parked on traffic, 403 all day': { park: true, answer: () => 'http 403' },
    'parked, every attempt fails and the app restarts after each': { park: true, restart: true, answer: () => 'timeout' },
    '◀ ▶ to traffic and back every minute': { visits: 60000 },
    '◀ ▶ every minute, every attempt fails, restart after each': { visits: 60000, restart: true, answer: () => 'http 503' }
  };
  const days = {};
  for (const [name, o] of Object.entries(patterns)) {
    const d = trafficDays(Object.assign({ days: 2 }, o));
    assert.equal(d.legs, 10);
    assert.equal(d.cap, 3000);
    assert.equal(d.hidden, 0, name + ': a request while another screen was on view');
    assert.equal(d.items, d.batches * 10, name + ': ten requests per round');
    for (const [date, n] of Object.entries(d.perUtcDate)) assert.ok(n <= 3000, name + ': ' + n + ' requests on ' + date);
    days[name] = d.perUtcDate;
  }
  console.log('# routing requests per UTC date', JSON.stringify(days));
  const clicks = trafficDays({ visits: 60000, days: 2 });
  assert.equal(clicks.perUtcDate['2026-10-01'], 3000, '◀ ▶ every minute: the cap binds, exactly at 3,000');
  const m = trafficDays({ visits: 60000, days: 31 });
  assert.ok(m.items <= 32 * 3000 && ALL(m).every((n) => n <= 3000), '31 days of ◀ ▶ every minute: ' + m.items);
  assert.ok(32 * 3000 < 100000, 'any 31 days (at most 32 UTC dates) stay under the free month');
});

test('Mapbox quota (FB5C-10): parked on traffic — 144 rounds per UTC date, requests at every hour, 31 days = 44,650 requests', () => {
  const day = trafficDays({ park: true, start: Date.parse('2026-10-30T00:00:00Z') - 1000, hours: 24 });
  assert.equal(day.perUtcDate['2026-10-30'], 1440, '144 rounds on the UTC date');
  assert.deepEqual([...new Set(day.hours)].sort((a, b) => a - b), [...Array(24).keys()], 'any hour: requests at every Israel hour');
  const failing = trafficDays({ park: true, restart: true, answer: () => 'timeout', start: Date.parse('2026-10-30T00:00:00Z') - 1000, hours: 24 });
  assert.equal(failing.perUtcDate['2026-10-30'], 1440, 'failing + a restart after every round: still 144, 0 extra requests per restart');
  const month = trafficDays({ park: true, days: 31 });
  assert.equal(month.items, 44650, 'healthy cadence: 10 × (31 × 1440 / 10 + 1) — one at the open, then every 10 min, the last exactly at the end');
});

test('Mapbox quota (FB5C-10): Jerusalem DST end 2026-10-25 parked — the 25-hour home date gets 150 rounds; UTC never clips', () => {
  const start = Date.parse('2026-10-24T21:00:00Z');      // 2026-10-25 00:00 in Israel (summer time)
  const d = trafficDays({ park: true, start: start - 1000, hours: 25 });
  assert.equal(d.perHomeDate['2026-10-25'], 1500, '1,500 min / 10 = 150 rounds on the home date');
  for (const n of ALL(d)) assert.ok(n <= 3000);
});

// Batch 10 (C/T10): HOME_CITY in build.local.env sets the home city of the PACKAGED config: one line replaced, the
// repository copy untouched; a value that is not a catalogue id stops the build before anything is packaged.
test('build.sh --package with HOME_CITY: one homeCity line replaced in the package only; a bad id stops the build; unset keeps Rehovot', () => {
  const homeLine = (file) => fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^\s*homeCity:/.test(l));
  const sb = sandbox('HOME_CITY=haifa\n');
  try {
    const r = sb.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Home city: haifa/);
    const packaged = homeLine(path.join(sb.dir, '.buildResult', 'js', 'config.js'));
    assert.equal(packaged.length, 1);
    assert.match(packaged[0], /^ {2}homeCity: 'haifa',/);
    assert.match(homeLine(path.join(sb.dir, 'js', 'config.js'))[0], /^ {2}homeCity: 'rehovot',/, 'the source copy is untouched');
  } finally { sb.close(); }
  for (const bad of ['Haifa', 'haifa;rm', 'atlantis', 'airport', 'hai fa']) {
    const b = sandbox('HOME_CITY="' + bad + '"\n');
    try {
      const r = b.run(['--package']);
      assert.equal(r.status, 2, bad + ': ' + r.stdout + r.stderr);
      assert.match(r.stderr, /HOME_CITY/);
      assert.ok(!fs.existsSync(path.join(b.dir, '.buildResult')), 'nothing built for ' + bad);
      assert.equal(b.log(), '', 'no tizen call for ' + bad);
    } finally { b.close(); }
  }
  const none = sandbox();
  try {
    assert.equal(none.run(['--package']).status, 0);
    assert.match(homeLine(path.join(none.dir, '.buildResult', 'js', 'config.js'))[0], /^ {2}homeCity: 'rehovot',/);
  } finally { none.close(); }
  assert.match(read('build.local.env.example'), /^HOME_CITY=$/m);
});
