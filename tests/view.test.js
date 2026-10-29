'use strict';
// Pure formatting used by the view: temperatures and the clock difference.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load(['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/icons.js', 'js/view.js']);

test('temperatures use a typographic minus and never show "-0°"', () => {
  assert.equal(ctx.View.temp(21.4), '21°');
  assert.equal(ctx.View.temp(-0.3), '0°');
  assert.equal(ctx.View.temp(-3.6), '−4°');
  assert.equal(ctx.View.temp(null), '—');
});

test('clock difference to the home clock', () => {
  ctx.I18n.setLang('ru');
  assert.equal(ctx.View.diffText(120, 120), 'Как здесь');
  assert.equal(ctx.View.diffText(660, 120), '+9 ч');
  assert.equal(ctx.View.diffText(60, 120), '−1 ч');
  assert.equal(ctx.View.diffText(450, 120), '+5:30 ч');
  assert.equal(ctx.View.diffText(undefined, 120), '');
});

test('every weather code maps to an icon', () => {
  for (const c of [0, 1, 2, 3, 45, 51, 61, 71, 80, 95, 99]) assert.match(ctx.Icons.weather(c, true), /^<svg class="icon /);
});
