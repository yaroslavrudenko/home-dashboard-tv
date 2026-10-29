'use strict';
// Loads the app's ES5 scripts, unchanged, into a Node `vm` context so they can be tested without a TV
// or a browser. Zero dependencies: Node 22 `node:test` + `node:assert` only.
//
// HOMEDASH_ROOT points the harness at another copy of the app (mutation proofs edit a copy, never js/).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(process.env.HOMEDASH_ROOT || path.join(__dirname, '..'));
const FIXTURES = path.join(__dirname, 'fixtures');

// globals: extra names visible to the scripts (e.g. a fake Intl). Pass Intl: undefined to remove it.
function load(files, globals) {
  const ctx = { Math, Date, JSON, String, Number, Array, Object, RegExp, Error, isNaN, parseInt, parseFloat, Infinity, NaN };
  ctx.Intl = Intl;
  if (globals) for (const k of Object.keys(globals)) ctx[k] = globals[k];
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

function fixture(id) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, id + '.json'), 'utf8'));
}

// A manual clock + timer queue for the weather store: nothing runs until the test advances time.
function fakeTimers(start) {
  let now = start, seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { at: now + ms, f }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    pending: () => [...timers.values()].map((t) => t.at - now).sort((a, b) => a - b),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null, nextId = null;
        for (const [id, t] of timers) if (t.at <= end && (next === null || t.at < next.at)) { next = t; nextId = id; }
        if (!next) break;
        timers.delete(nextId);
        now = next.at;
        next.f();
      }
      now = end;
    }
  };
}

module.exports = { ROOT, load, fixture, fakeTimers };
