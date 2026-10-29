'use strict';
// Packaging and platform constraints: config.xml, the tile icon, build.sh's package-only mode, and the
// CSS features Chromium 47 (Tizen 3.0) lacks. build.sh itself is never run here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./harness');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('config.xml: package HomeDash01, app HomeDash01.Dashboard, Tizen 3.0, TV profile, internet, open origins', () => {
  const x = read('config.xml');
  assert.match(x, /<tizen:application id="HomeDash01\.Dashboard" package="HomeDash01" required_version="3\.0"\/>/);
  assert.match(x, /<name>Home Dashboard<\/name>/);
  assert.match(x, /<tizen:profile name="tv-samsung"\/>/);
  assert.match(x, /<tizen:privilege name="http:\/\/tizen\.org\/privilege\/internet"\/>/);
  assert.match(x, /<access origin="\*" subdomains="true"\/>/);
  assert.match(x, /<icon src="img\/icon\.png"\/>/);
  assert.match(x, /<content src="index\.html"\/>/);
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
