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
    x.open = () => {};
    x.send = () => play(x);
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
