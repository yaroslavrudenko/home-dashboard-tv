// FIX-BATCH-19 item 7 (PREPARE ONLY: the coordinator runs it on the TV): tools/tv-boot.mjs reads the boot from the page's own
// clock over the DevTools protocol. Dry run here, against the desktop headless Chrome the suite drives, through its inspector
// endpoint exactly as the coordinator will reach the TV's after `sdb forward`: two reloaded boots, each with «dash:start» and
// «dash:main-full» (the first main screen drawn with its weather) in order, and the median line.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { openApp, ROOT } from './page.mjs';

test('B19 item 7: tools/tv-boot.mjs — two fresh boots read over the inspector, start < first full main screen, a median line', async () => {
  const app = await openApp({ weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    await app.page.waitForSelector('#daily .day-max', { timeout: 10000 });
    const base = 'http://' + new URL(app.browser.wsEndpoint()).host;
    const out = await new Promise((ok, fail) => execFile(process.execPath, [path.join(ROOT, 'tools', 'tv-boot.mjs'), base, '--runs', '2'], { timeout: 60000 },
      (err, stdout, stderr) => (err ? fail(new Error(stderr || err.message)) : ok(stdout))));
    const lines = out.trim().split('\n');
    assert.equal(lines.length, 3, out);
    for (const l of lines.slice(0, 2)) {
      const b = JSON.parse(l);
      assert.ok(typeof b.start === 'number' && typeof b.mainFull === 'number' && b.start > 0 && b.mainFull >= b.start, l);
      assert.ok(b.load === null || b.load >= b.start, 'App.start runs on load: ' + l);
    }
    assert.match(lines[2], /^median ms from navigationStart — start: \d+, first full main screen: \d+, load: \d+ \(2 runs\)$/);
  } finally { await app.close(); }
});

// FIX-19B C5 (Codex P2): «dash:main-full» is named when the main screen is COMPLETE — at that moment the weather card, its
// status line and the three clock cards (with their weather) are already drawn.
test('FIX-19B C5: at «dash:main-full» the status line and every clock card are already drawn', async () => {
  const INIT = `(function () { var m = performance.mark.bind(performance); window.__atFull = null;
    performance.mark = function (name) { if (name === 'dash:main-full') window.__atFull = { status: (document.getElementById('status') || {}).textContent || '',
      clocks: [].map.call(document.querySelectorAll('.clock'), function (c) { var t = c.querySelector('.clock-time'), w = c.querySelector('.clock-temp'); return [t ? t.textContent : '', w ? w.textContent : '']; }),
      days: document.querySelectorAll('#daily .day-max').length }; return m(name); }; })();`;
  const app = await openApp({ init: INIT, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    await app.page.waitForFunction(() => window.__atFull, { timeout: 10000 });
    const at = await app.page.evaluate(() => window.__atFull);
    assert.match(at.status, /^Обновлено в \d\d:\d\d$/, 'the status already says when: ' + JSON.stringify(at));
    assert.equal(at.clocks.length, 3);
    assert.ok(at.clocks.every((c) => /^\d\d:\d\d$/.test(c[0]) && /°$/.test(c[1])), 'every clock card with its time and weather: ' + JSON.stringify(at.clocks));
    assert.equal(at.days, 7, 'the 7 days drawn');
  } finally { await app.close(); }
});

// FIX-19B C4 (perf R19-P1, native L3, Codex P2) and C6: every run is the boot of a NEW document. With an unload kept busy
// 600 ms (a weak TV: the old page still alive well after Page.reload) five runs give five different navigationStarts, none
// the page's first one; «--runs 1» reloads too.
const run = (base, extra) => new Promise((ok, fail) => execFile(process.execPath, [path.join(ROOT, 'tools', 'tv-boot.mjs'), base].concat(extra), { timeout: 120000 },
  (err, stdout, stderr) => (err ? fail(new Error(stderr || err.message)) : ok(stdout.trim().split('\n')))));
test('FIX-19B C4/C6: slow unload — 5 runs, 5 new documents (distinct navigationStart); --runs 1 reloads', async () => {
  const SLOW = "addEventListener('beforeunload', function () { var e = Date.now() + 600; while (Date.now() < e) {} });";
  const app = await openApp({ init: SLOW, weather: 'ok', air: 'ok', alerts: 'empty-bom.txt', configure: (c) => { c.rotation.enabled = false; } });
  try {
    await app.page.waitForSelector('#daily .day-max', { timeout: 10000 });
    const first = await app.page.evaluate(() => performance.timing.navigationStart);
    const base = 'http://' + new URL(app.browser.wsEndpoint()).host;
    const five = (await run(base, ['--runs', '5'])).slice(0, -1).map((l) => JSON.parse(l));
    const navs = five.map((b) => b.navigationStart);
    assert.equal(new Set(navs.concat([first])).size, 6, 'five new documents, none the first: ' + navs.join(','));
    assert.ok(five.every((b) => b.mainFull >= b.start && b.start > 0), JSON.stringify(five));
    const one = (await run(base, ['--runs', '1'])).slice(0, -1).map((l) => JSON.parse(l));
    assert.ok(one.length === 1 && !navs.concat([first]).includes(one[0].navigationStart), '--runs 1 reloads: ' + JSON.stringify(one));
  } finally { await app.close(); }
});
