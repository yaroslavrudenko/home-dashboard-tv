'use strict';
// Net.getJson against a scripted XMLHttpRequest: the error label names the real cause, and done() runs once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

// Plays the browser's event order for one outcome, synchronously on send().
function fakeXhr(play) {
  return function XMLHttpRequest() {
    const x = this;
    x.readyState = 0; x.status = 0; x.responseText = '';
    x.headers = {};
    x.open = (method, url) => { x.method = method; x.url = url; };
    x.setRequestHeader = (k, v) => { x.headers[k] = v; };
    x.getResponseHeader = () => null;              // a real XHR always has it (FB5D-V1 reads Retry-After)
    x.send = (body) => { x.body = body; play(x); };
  };
}
const fire = (x, state, status, text) => { x.readyState = state; x.status = status; if (text !== undefined) x.responseText = text; x.onreadystatechange(); };

function get(play) {
  const ctx = load(['js/net.js'], { XMLHttpRequest: fakeXhr(play) });
  const calls = [];
  ctx.Net.getJson('https://x.test/', 1000, (err, json) => calls.push([err, json]));
  return calls;
}

// Decision 17 (F17): per the XHR spec a timeout fires readystatechange (state 4, status 0) BEFORE timeout.
test('a timeout is reported as "timeout", not "network", and done() runs exactly once', () => {
  const calls = get((x) => { fire(x, 4, 0); x.ontimeout(); x.onerror && x.onerror(); });
  assert.deepEqual(calls, [['timeout', undefined]]);
});

test('HTTP errors, network errors and bad JSON have their own labels; a good answer is parsed', () => {
  assert.deepEqual(get((x) => fire(x, 4, 503)), [['http 503', undefined]]);
  assert.deepEqual(get((x) => { fire(x, 4, 0); x.onerror(); }), [['network', undefined]]);
  assert.deepEqual(get((x) => fire(x, 4, 200, '{oops')), [['parse', undefined]]);
  assert.deepEqual(JSON.parse(JSON.stringify(get((x) => fire(x, 4, 200, '[{"a":1}]')))), [[null, [{ a: 1 }]]]);
});

test('getText returns the raw body (a BOM and CRLF included) as a plain GET: no custom header, so no CORS preflight', () => {
  let seen;
  const ctx = load(['js/net.js'], { XMLHttpRequest: fakeXhr((x) => { seen = x; fire(x, 4, 200, '\uFEFF\r\n'); }) });
  const calls = [];
  ctx.Net.getText('https://x.test/a', 4000, (err, text) => calls.push([err, text]), { 'X-Requested-With': 'XMLHttpRequest' });
  assert.deepEqual(calls, [[null, '\uFEFF\r\n']]);
  assert.deepEqual([seen.method, seen.url, seen.timeout, seen.headers, seen.body], ['GET', 'https://x.test/a', 4000, {}, null], 'even a fourth argument sets nothing');
});

// FB5D-V1: an HTTP refusal carries the response's Retry-After (as the server sent it) to the caller.
test('FB5D-V1: a non-200 answer passes its Retry-After header as the third argument; 200 and a network error pass none', () => {
  const run = (play) => { const ctx = load(['js/net.js'], { XMLHttpRequest: fakeXhr((x) => { x.getResponseHeader = (h) => (/^retry-after$/i.test(h) ? x.ra : null); play(x); }) });
    const calls = []; ctx.Net.getJson('https://x.test/b', 1000, (err, json, meta) => calls.push([err, meta === undefined ? 'none' : JSON.stringify(meta)])); return calls; };
  assert.deepEqual(run((x) => { x.ra = '7200'; fire(x, 4, 429); }), [['http 429', '{"retryAfter":"7200"}']]);
  assert.deepEqual(run((x) => { x.ra = null; fire(x, 4, 403); }), [['http 403', '{"retryAfter":""}']]);
  assert.deepEqual(run((x) => { x.ra = '9'; fire(x, 4, 200, '{}'); }), [[null, 'none']]);
  assert.deepEqual(run((x) => { fire(x, 4, 0); x.onerror(); }), [['network', 'none']]);
});

// FB5B-M1: an image (the traffic map, batch 7) has a deadline and can be stopped. A fake Image records what the app does to it; the
// test fires its events by hand on a fake clock.
function imageNet() {
  const clock = fakeTimers(0), made = [];
  function Image() { this.src = ''; made.push(this); }
  const ctx = load(['js/net.js'], { Image, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  return { Net: ctx.Net, clock, made };
}

test('FB5B-M1: Net.getImage — loaded, failed, or "timeout" after timeoutMs; done exactly once; a late event changes nothing', () => {
  const ok = imageNet(), calls = [];
  const h = ok.Net.getImage('https://t.test/1.png', 20000, (err, img) => calls.push([err, img && img.src]));
  assert.equal(h.img.src, 'https://t.test/1.png');
  h.img.onload();
  assert.deepEqual(calls, [[null, 'https://t.test/1.png']]);
  assert.deepEqual(ok.clock.pending(), [], 'no deadline left behind');

  const bad = imageNet(), c2 = [];
  bad.Net.getImage('https://t.test/2.png', 20000, (err) => c2.push(err)).img.onerror();
  assert.deepEqual(c2, ['error']);

  const hang = imageNet(), c3 = [];
  const hh = hang.Net.getImage('https://t.test/3.png', 20000, (err, img) => c3.push([err, img]));
  hang.clock.advance(19999);
  assert.deepEqual(c3, [], 'still waiting');
  hang.clock.advance(1);
  assert.deepEqual(c3, [['timeout', null]]);
  assert.equal(hh.img.src, '', 'the download is stopped');
  assert.equal(hh.img.onload, null, 'handlers removed');
  assert.equal(hh.img.onerror, null);
});

test('FB5B-M1: Net.getImage — cancel() stops the download and reports "cancelled" once; cancel after the end is a no-op', () => {
  const n = imageNet(), calls = [];
  const h = n.Net.getImage('https://t.test/4.png', 20000, (err) => calls.push(err));
  h.cancel(); h.cancel();
  assert.deepEqual(calls, ['cancelled']);
  assert.equal(h.img.src, '');
  assert.deepEqual(n.clock.pending(), [], 'its deadline cleared');
  const done = imageNet(), c2 = [];
  const d = done.Net.getImage('https://t.test/5.png', 20000, (err) => c2.push(err));
  d.img.onload(); d.cancel();
  assert.deepEqual(c2, [null]);
  assert.equal(d.img.src, 'https://t.test/5.png', 'a loaded image is left alone');
});
