'use strict';
// FIX-BATCH-18 part B / FIX-18B 4 (native N4, Codex P2): the suite hangs when two browser runs share the machine, so
// tests/run.sh --browser holds a lock — a symbolic link whose target is the runner's pid, made in one atomic step. A second run
// refuses (exit 3) while the holder lives; a lock without a readable pid is busy, with how to clear it; a dead holder's lock is
// taken over by exactly one of several runners that start at once. DASH_TEST_LOCK_ONLY=<s> holds the lock and exits 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const RUN = path.join(__dirname, 'run.sh');
const env = (lock, extra) => Object.assign({}, process.env, { DASH_TEST_LOCK: lock }, extra || {});
const tmpLock = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dash-lock-')), 'lock');
const once = (lock, extra) => spawnSync('zsh', [RUN, '--browser'], { env: env(lock, extra), encoding: 'utf8', timeout: 20000 });
// n runners started together, each holding the lock 1.5 s if it gets it: their exit codes
function race(lock, n) {
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const c = spawn('zsh', [RUN, '--browser'], { env: env(lock, { DASH_TEST_LOCK_ONLY: '1.5' }) });
    let err = ''; c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => resolve({ code, err }));
  })));
}
const deadPid = () => { const c = spawnSync('true'); deadPid.last = c.pid; return c.pid; };   // a process that has exited

test('B18 runner: a second browser run refuses at once while the first holds the lock; the holder\'s lock is kept', () => {
  const lock = tmpLock();
  fs.symlinkSync(String(process.pid), lock);   // a live holder: this process
  const r = once(lock);
  assert.equal(r.status, 3, 'refused: ' + r.stderr);
  assert.match(r.stderr, /another browser test run is in progress \(pid \d+/);
  assert.equal(fs.readlinkSync(lock), String(process.pid), 'the holder\'s lock is untouched');
});
test('FIX-18B 4: a lock without a readable pid is busy (exit 3), with how to clear it, and is left alone', () => {
  for (const make of [(l) => fs.symlinkSync('not-a-pid', l), (l) => fs.mkdirSync(l)]) {
    const lock = tmpLock(); make(lock);
    const r = once(lock);
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /has no readable pid: if no browser test run is going, remove it/);
    assert.ok(fs.existsSync(lock) || fs.lstatSync(lock), 'kept');
  }
});
test('FIX-18B 4: six runners at once on a free lock — exactly one takes it (the pid in the same step), the others exit 3', async () => {
  const lock = tmpLock(), out = await race(lock, 6);
  assert.deepEqual(out.map((o) => o.code).sort(), [0, 3, 3, 3, 3, 3], JSON.stringify(out));
  assert.ok(!fs.existsSync(lock), 'released by its holder');
});
test('FIX-18B 4: a dead holder\'s lock, six runners at once — exactly one takes it over, the others exit 3', async () => {
  const lock = tmpLock(); fs.symlinkSync(String(deadPid()), lock);
  const out = await race(lock, 6);
  assert.deepEqual(out.map((o) => o.code).sort(), [0, 3, 3, 3, 3, 3], JSON.stringify(out));
  assert.ok(!fs.existsSync(lock) && fs.readdirSync(path.dirname(lock)).length === 0, 'released, nothing left behind');
});

// FIX-18D 2 (Codex's executed repro of FIX-18B): B checks a dead holder's lock and stops; A takes the lock over and holds it;
// B goes on to its takeover's first step and stops again; C starts there; then B finishes. B must never remove or move A's
// live lock: A exits 0, B and C exit 3 — A is the only one that ever runs. The stops are the script's own hook
// (DASH_TEST_LOCK_PAUSE: "check", "taken"), so the order is exact, not timed. The FIX-18B scheme (rename the lock away, then
// check) let C in at «taken»: A and C both ran.
test('FIX-18D 2: a contender stopped inside its takeover never displaces a live run (A 0, B 3, C 3)', async () => {
  const lock = tmpLock(), base = path.join(path.dirname(lock), 'pause');
  fs.symlinkSync(String(deadPid()), lock);
  const run = (extra) => new Promise((resolve) => {
    const c = spawn('zsh', [RUN, '--browser'], { env: env(lock, extra) });
    let err = ''; c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => resolve({ code, err }));
  });
  const until = async (f) => { for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 25)); assert.ok(f(), 'timed out'); };
  const holder = () => { try { return fs.readlinkSync(lock); } catch (e) { return null; } };
  const b = run({ DASH_TEST_LOCK_ONLY: '0', DASH_TEST_LOCK_PAUSE: base });
  await until(() => fs.existsSync(base + '.check.reached'));                // B has checked the dead pid
  const a = run({ DASH_TEST_LOCK_ONLY: '4' });                              // A takes the stale lock over and holds 4 s
  await until(() => /^\d+$/.test(holder() || '') && holder() !== String(deadPid.last));
  const aPid = holder();
  fs.writeFileSync(base + '.check', '');
  const bEarly = await Promise.race([b, until(() => fs.existsSync(base + '.taken.reached')).then(() => null)]);
  const rc = await run({ DASH_TEST_LOCK_ONLY: '0' });                       // C, with B inside its takeover (or already refused)
  fs.writeFileSync(base + '.taken', '');
  const rb = bEarly || await b, ra = await a;
  assert.deepEqual([ra.code, rb.code, rc.code], [0, 3, 3], JSON.stringify({ aPid, a: ra.err, b: rb.err, c: rc.err }));
  assert.ok(!fs.existsSync(lock) && !fs.existsSync(lock + '.takeover'), 'everything released');
});

// FIX-BATCH-19 2: README.md's test count (the badge and the «Tested and reviewed» row) is checked against a number — the same
// check a passing full run (--browser) makes with the count it ran, so the README cannot drift again (exit 4, both numbers).
test('B19 item 2: --readme-count accepts README\'s own number and refuses any other (exit 4, both numbers said)', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const n = Number(/tests-(\d+)%20passing/.exec(readme)[1]);
  assert.equal(Number(/Tested and reviewed\*\* \| (\d+) automated tests/.exec(readme)[1]), n, 'the badge and the row agree');
  assert.equal(spawnSync('zsh', [RUN, '--readme-count', String(n)], { encoding: 'utf8' }).status, 0);
  const off = spawnSync('zsh', [RUN, '--readme-count', String(n + 1)], { encoding: 'utf8' });
  assert.equal(off.status, 4);
  assert.match(off.stderr, new RegExp('README.md says ' + n + ' tests \\(badge\\) and ' + n + ' \\(Tested and reviewed\\); the suite ran ' + (n + 1)));
});

// FIX-19B C11 (native L4): the end-of-run README check is pinned — a passing full run (--browser) prints «README.md count: N
// (matches)» when README says N, and exits 4 with both numbers when it says another. The suite is stubbed: NODE is a script
// that prints a passing TAP summary of N tests (the runner's own NODE override), so this runs in milliseconds.
test('FIX-19B C11: a passing full run checks README\'s count — «matches» on N, exit 4 on any other number', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const n = Number(/tests-(\d+)%20passing/.exec(readme)[1]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-stub-')), stub = path.join(dir, 'node');
  const runWith = (count) => {
    fs.writeFileSync(stub, '#!/bin/sh\nprintf "ok 1 - stub\\n# tests ' + count + '\\n# pass ' + count + '\\n# fail 0\\n"\n', { mode: 0o755 });
    return spawnSync('zsh', [RUN, '--browser'], { env: Object.assign({}, process.env, { NODE: stub, DASH_TEST_LOCK: path.join(dir, 'lock') }), encoding: 'utf8', timeout: 20000 });
  };
  try {
    const same = runWith(n);
    assert.equal(same.status, 0, same.stderr);
    assert.match(same.stdout, new RegExp('^README.md count: ' + n + ' \\(matches\\)$', 'm'));
    const other = runWith(n + 3);
    assert.equal(other.status, 4, other.stdout + other.stderr);
    assert.match(other.stderr, new RegExp('README.md says ' + n + ' tests \\(badge\\) and ' + n + ' \\(Tested and reviewed\\); the suite ran ' + (n + 3)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
