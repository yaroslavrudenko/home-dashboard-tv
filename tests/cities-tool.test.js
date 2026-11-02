'use strict';
// Codex P1 / P2 (batch 16): tools/cities.mjs --check asks Pikud HaOref and the geocoding at once, the geocoding POOL cities
// at a time (never 83 one after another), every request with a deadline; a request that fails fails the check.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('./harness');

const tool = () => import(pathToFileURL(path.join(ROOT, 'tools', 'cities.mjs')).href);
const OREF = [{ label: 'x' }];
function fakeFetch(opts) {
  const s = { calls: 0, inFlight: 0, peak: 0, signals: 0, geo: 0 };
  s.fetch = (url, init) => {
    s.calls++; if (init && init.signal) s.signals++;
    s.inFlight++; s.peak = Math.max(s.peak, s.inFlight);
    const geo = url.includes('geocoding');
    if (geo) s.geo++;
    if (geo && opts && opts.hangOn === s.geo) {               // a request that never answers: only its deadline ends it
      return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { s.inFlight--; reject(init.signal.reason); }));
    }
    return new Promise((r) => setTimeout(r, 5)).then(() => { s.inFlight--; return { ok: true, json: async () => (geo ? { results: [] } : OREF) }; });
  };
  return s;
}

test('P1: every city once, at most POOL geocoding requests in flight, Pikud HaOref alongside — not one after another', async () => {
  const { check, LIMITS } = await tool();
  const s = fakeFetch(), notes = [];
  const t = Date.now();
  await check(s.fetch, (m) => notes.push(m));
  const ctx = require('./harness').load(['js/cities.js']);
  assert.equal(s.calls, ctx.Cities.list.length + 1, 'one request per city + Oref');
  assert.ok(s.peak > 1 && s.peak <= LIMITS.POOL + 1, 'bounded concurrency: peak ' + s.peak);
  assert.ok(Date.now() - t < ctx.Cities.list.length * 5, 'faster than the sum of the delays');
  assert.equal(notes.length, ctx.Cities.list.length, 'no geocoding for any city: each said');
});

test('P2: every request carries a deadline; a request that hangs fails the check (never "no drift")', async () => {
  const { check, LIMITS } = await tool();
  assert.equal(LIMITS.TIMEOUT_MS, 20000);
  const s = fakeFetch({ hangOn: 3 });
  const realTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () => realTimeout.call(AbortSignal, 50);   // the deadline, made short for the test
  try {
    await assert.rejects(check(s.fetch, () => {}), /abort|timeout/i);
  } finally { AbortSignal.timeout = realTimeout; }
  assert.equal(s.signals, s.calls, 'every request with its signal');
});
