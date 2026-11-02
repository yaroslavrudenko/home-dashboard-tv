'use strict';
// Batch 12 (S4, S7): what the forecast and the air-quality API share — the several-places coordinate list, the
// finite-number rule and the level bands (UV and European AQI use the same helper).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load(['js/openmeteo.js']);

test('query: the places\' coordinates in their order, Open-Meteo\'s several-places form', () => {
  assert.equal(ctx.OpenMeteo.query([{ lat: 31.8928, lon: 34.8113 }, { lat: -33.8688, lon: 151.2093 }]), 'latitude=31.8928,-33.8688&longitude=34.8113,151.2093');
});

test('num: a finite number, else null (NaN, ±Infinity, strings, null, undefined)', () => {
  for (const v of [0, -3.5, 1e9]) assert.equal(ctx.OpenMeteo.num(v), v);
  for (const v of [NaN, Infinity, -Infinity, '5', null, undefined, {}]) assert.equal(ctx.OpenMeteo.num(v), null, String(v));
});

test('band: the first level whose ceiling the value does not exceed, else the top level; no value, no level', () => {
  const bands = [[2, 'low'], [5, 'mid']];
  const out = [0, 2, 3, 5, 6].map((v) => ctx.OpenMeteo.band(v, bands, 'top'));
  assert.deepEqual(out, ['low', 'low', 'mid', 'mid', 'top']);
  assert.equal(ctx.OpenMeteo.band(null, bands, 'top'), null);
});
