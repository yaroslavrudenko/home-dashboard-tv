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

// Decision 21 (F13): least privilege — the app's own files plus exactly the hosts it reads (batch 2: news, alerts, TomTom).
// FB5-NS: the news feeds are Ynet and Globes (newsru, pravda and bbc removed).
const ORIGINS = ['https://api.open-meteo.com', 'https://www.ynet.co.il', 'https://www.globes.co.il',
  'https://www.oref.org.il', 'https://api.tomtom.com'];
test('config.xml: package HomeDash01, app HomeDash01.Dashboard, Tizen 3.0, TV profile, internet, exactly the hosts the app reads', () => {
  const x = read('config.xml');
  assert.match(x, /<tizen:application id="HomeDash01\.Dashboard" package="HomeDash01" required_version="3\.0"\/>/);
  assert.match(x, /<name>Home Dashboard<\/name>/);
  assert.match(x, /<tizen:profile name="tv-samsung"\/>/);
  assert.match(x, /<tizen:privilege name="http:\/\/tizen\.org\/privilege\/internet"\/>/);
  assert.deepEqual([...x.matchAll(/<access origin="([^"]+)" subdomains="false"\/>/g)].map((m) => m[1]), ORIGINS);
  assert.equal((x.match(/<access /g) || []).length, ORIGINS.length, 'no other origin');
  const csp = x.match(/<tizen:content-security-policy>([^<]+)</)[1];
  assert.match(csp, /default-src 'self'/);
  assert.equal(csp.match(/connect-src ([^;]+)/)[1].trim(), ORIGINS.join(' '));
  assert.ok(!/\*/.test(csp), 'no wildcard: ' + csp);
  assert.equal(csp.match(/img-src ([^;]+)/)[1].trim(), "'self' data: https://api.tomtom.com", 'FB5-MAP: map tiles from TomTom only');
  assert.match(x, /<icon src="img\/icon\.png"\/>/);
  assert.match(x, /<content src="index\.html"\/>/);
});

// Every host the code reads is in the policy, and nothing else: the feeds, the alert feed, TomTom and Open-Meteo.
test('every URL in js/config.js is on an origin config.xml allows', () => {
  const urls = [...read('js/config.js').matchAll(/'(https:\/\/[^']+)'/g)].map((m) => new URL(m[1]).origin);
  assert.ok(urls.length >= 5, urls.join(' '));   // FB5-NS: two feeds instead of three
  for (const o of urls) assert.ok(ORIGINS.includes(o), o);
  for (const o of ORIGINS) assert.ok(urls.includes(o), 'unused origin ' + o);
});

// The TomTom key never enters the repository: the committed config carries the placeholder, the build replaces it.
test('js/config.js holds the TomTom placeholder, never a key; build.local.env.example documents TOMTOM_KEY', () => {
  assert.match(read('js/config.js'), /key: '__TOMTOM_KEY__',/);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    const keys = [...read('js/' + f).matchAll(/\bkey\s*:\s*'([^']*)'/g)].map((m) => m[1]);
    assert.ok(keys.every((k) => k === '__TOMTOM_KEY__'), 'js/' + f + ': ' + keys);
  }
  assert.match(read('build.local.env.example'), /^TOMTOM_KEY=$/m);
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
    assert.ok(!/(api[_-]?key|apikey|token|password|OTT_KEY)\s*[:=]/i.test(read(f)), f);
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
  assert.equal(urls.length, 7, 'Light/Regular/Medium × Latin/Cyrillic + "≈"');
  let bytes = 0;
  for (const u of urls) {
    const b = fs.readFileSync(path.join(ROOT, u));
    assert.equal(b.toString('latin1', 0, 4), 'wOF2', u);
    bytes += b.length;
  }
  assert.ok(bytes < 1024 * 1024, 'fonts stay under 1 MB: ' + bytes);
  assert.match(read('fonts/OFL.txt'), /SIL Open Font License, Version 1\.1/);
  assert.match(read('build.sh'), /cp -R config\.xml index\.html css js img fonts \.buildResult\//);
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
  for (const f of ['build.sh', 'config.xml', 'index.html', 'css', 'js', 'img', 'fonts', 'tools']) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
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

test('build.sh --package with TOMTOM_KEY puts the key into the packaged config only; without it the placeholder stays', () => {
  const sb = sandbox('TOMTOM_KEY=AbC123xyz\n');
  try {
    const r = sb.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    const packaged = fs.readFileSync(path.join(sb.dir, '.buildResult', 'js', 'config.js'), 'utf8');
    assert.match(packaged, /key: 'AbC123xyz',/);
    assert.ok(!packaged.includes('__TOMTOM_KEY__'));
    assert.match(fs.readFileSync(path.join(sb.dir, 'js', 'config.js'), 'utf8'), /key: '__TOMTOM_KEY__',/, 'the source copy is untouched');
    assert.match(r.stdout, /TomTom key: injected/);
    assert.ok(!r.stdout.includes('AbC123xyz'), 'the key is never printed');
  } finally { sb.close(); }
  const none = sandbox();
  try {
    const r = none.run(['--package']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(none.dir, '.buildResult', 'js', 'config.js'), 'utf8'), /key: '__TOMTOM_KEY__',/);
    assert.match(r.stdout, /TomTom key: not set/);
  } finally { none.close(); }
});

test('build.sh refuses a TOMTOM_KEY with anything but letters and digits, before building', () => {
  const sb = sandbox("TOMTOM_KEY='abc/def'\n");
  try {
    const r = sb.run(['--package']);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /TOMTOM_KEY must be letters and digits only/);
    assert.equal(sb.log(), '', 'tizen never ran');
    assert.ok(!fs.existsSync(path.join(sb.dir, '.buildResult')), 'nothing built');
  } finally { sb.close(); }
});

// FB5C (quota; the judges' COMMON DECISION 2026-10-30 + the owner's explicit-open rule): TomTom's free routing tier is
// 20,000 items a MONTH (docs.tomtom.com/pricing, read 2026-10-30), shared by every key on the account; every refresh costs
// one item per route (10). The app sends at any hour while the screen is on view, at most every 25 min (rotation, staying
// open, wake), on every explicit ◀ ▶ open, and never past 580 items per UTC date (a verified localStorage reservation
// before every POST, no refunds). Simulated from the app's own code for every pattern, failures and restarts included.
const { trafficDays } = require('./traffic-day');
const ALL = (o) => Object.values(o.perUtcDate);

test('TomTom quota (FB5C-10): every pattern ≤ 580 items per UTC date — failures, refusals, restarts and ◀ ▶ every minute included', () => {
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
    assert.equal(d.hidden, 0, name + ': a request while another screen was on view');
    for (const [date, n] of Object.entries(d.perUtcDate)) assert.ok(n <= 580, name + ': ' + n + ' items on ' + date);
    days[name] = d.perUtcDate;
  }
  console.log('# routing items per UTC date', JSON.stringify(days));
  const clicks = trafficDays({ visits: 60000, days: 2 });
  assert.equal(clicks.perUtcDate['2026-10-01'], 580, '◀ ▶ every minute: the cap binds, exactly at 580');
  const m = trafficDays({ visits: 60000, days: 31 });
  assert.ok(m.items <= 32 * 580 && ALL(m).every((n) => n <= 580), '31 days of ◀ ▶ every minute: ' + m.items);
});

test('TomTom quota (FB5C-10): parked on traffic — 58 batches per UTC date, requests at every hour, 31 days = 17,860 items', () => {
  const day = trafficDays({ park: true, start: Date.parse('2026-10-30T00:00:00Z') - 1000, hours: 24 });
  assert.equal(day.perUtcDate['2026-10-30'], 580, '58 batches on the UTC date');
  assert.deepEqual([...new Set(day.hours)].sort((a, b) => a - b), [...Array(24).keys()], 'any hour: requests at every Israel hour');
  const failing = trafficDays({ park: true, restart: true, answer: () => 'timeout', start: Date.parse('2026-10-30T00:00:00Z') - 1000, hours: 24 });
  assert.equal(failing.perUtcDate['2026-10-30'], 580, 'failing + a restart after every dispatch: still 58, 0 extra items per restart');
  const month = trafficDays({ park: true, days: 31 });
  assert.equal(month.items, 17860, 'healthy cadence: 10 × ceil(31 × 1440 / 25)');
});

test('TomTom quota (FB5C-10): Jerusalem DST end 2026-10-25 parked — the 25-hour home date gets 60 batches; UTC never clips', () => {
  const start = Date.parse('2026-10-24T21:00:00Z');      // 2026-10-25 00:00 in Israel (summer time)
  const d = trafficDays({ park: true, start: start - 1000, hours: 25 });
  assert.equal(d.perHomeDate['2026-10-25'], 600, '1,500 min / 25 = 60 batches on the home date');
  for (const n of ALL(d)) assert.ok(n <= 580);
});
