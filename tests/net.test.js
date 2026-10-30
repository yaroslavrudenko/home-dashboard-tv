'use strict';
// Net.getJson against a scripted XMLHttpRequest: the error label names the real cause, and done() runs once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

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

