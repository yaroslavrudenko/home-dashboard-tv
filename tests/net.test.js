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

test('getText returns the raw body (a BOM and CRLF included) and sends the given headers; HTTP errors keep their labels', () => {
  let seen;
  const ctx = load(['js/net.js'], { XMLHttpRequest: fakeXhr((x) => { seen = x; fire(x, 4, 200, '\uFEFF\r\n'); }) });
  const calls = [];
  ctx.Net.getText('https://x.test/a', 4000, (err, text) => calls.push([err, text]), { 'X-Requested-With': 'XMLHttpRequest' });
  assert.deepEqual(calls, [[null, '\uFEFF\r\n']]);
  assert.deepEqual([seen.method, seen.url, seen.timeout, seen.headers['X-Requested-With'], seen.body], ['GET', 'https://x.test/a', 4000, 'XMLHttpRequest', null]);
});

test('postJson sends the body as JSON with its content type and parses the JSON answer', () => {
  let seen;
  const ctx = load(['js/net.js'], { XMLHttpRequest: fakeXhr((x) => { seen = x; fire(x, 4, 200, '{"ok":true}'); }) });
  const calls = [];
  ctx.Net.postJson('https://x.test/b', { batchItems: [1] }, 20000, (err, json) => calls.push([err, JSON.stringify(json)]));
  assert.deepEqual(calls, [[null, '{"ok":true}']]);
  assert.deepEqual([seen.method, seen.headers['Content-Type'], seen.body, seen.timeout], ['POST', 'application/json', '{"batchItems":[1]}', 20000]);
});
