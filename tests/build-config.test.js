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
const ORIGINS = ['https://api.open-meteo.com', 'https://www.newsru.co.il', 'https://www.pravda.com.ua', 'https://feeds.bbci.co.uk',
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
  assert.match(x, /<icon src="img\/icon\.png"\/>/);
  assert.match(x, /<content src="index\.html"\/>/);
});

// Every host the code reads is in the policy, and nothing else: the feeds, the alert feed, TomTom and Open-Meteo.
test('every URL in js/config.js is on an origin config.xml allows', () => {
  const urls = [...read('js/config.js').matchAll(/'(https:\/\/[^']+)'/g)].map((m) => new URL(m[1]).origin);
  assert.ok(urls.length >= 6, urls.join(' '));
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
  const urls = [...css.matchAll(/url\(\.\.\/(fonts\/[^)]+)\)/g)].map((m) => m[1]);
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

// C3 (quota): TomTom's free tier allows ~2,500 billable items a day; every refresh costs one item per route and road.
// The worst day the app can produce, retries INCLUDED (every request counted, the shortest jittered waits), must stay
// under it — this fails the moment a leg or a shorter interval would break the budget. A 429 all day stays at or
// below the 188 batches/day measured before batch 3.
test('TomTom quota: the worst simulated day, retries included, stays under 2,500 items; 429 all day ≤ 188 batches', () => {
  const { trafficDay } = require('./traffic-day');
  const LIMIT = 2500;
  const flip = (n) => (n % 2 ? 'ok' : 'http 503');
  const days = {
    'rotation on, all answers good': {},
    'rotation on, every round 503': { answer: () => 'http 503' },
    'rotation on, 429 all day': { answer: () => 'http 429' },
    'parked on traffic (▶), all answers good': { park: true },
    'parked on traffic, every round times out': { park: true, answer: () => 'timeout' },
    'parked on traffic, every other round 503': { park: true, answer: flip },
    'parked on traffic, 429 all day': { park: true, answer: () => 'http 429' },
    'parked on traffic, 403 all day': { park: true, answer: () => 'http 403' }
  };
  const seen = {};
  for (const [name, o] of Object.entries(days)) {
    for (const random of [() => 0, () => 0.999999]) {
      const r = trafficDay(Object.assign({ random }, o));
      assert.equal(r.legs, 7);
      assert.ok(r.items <= LIMIT, name + ': ' + r.items + ' items/day');
      seen[name] = Math.max(seen[name] || 0, r.batches);
    }
  }
  assert.ok(seen['rotation on, 429 all day'] <= 188 && seen['parked on traffic, 429 all day'] <= 188, JSON.stringify(seen));
  assert.ok(seen['rotation on, all answers good'] <= 100, 'a rotation visit never refreshes: ' + seen['rotation on, all answers good']);
});
