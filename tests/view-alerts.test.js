'use strict';
// Batch 16: the Alerts screen's own view (js/view-alerts.js) on a stand-in element — the grey shield before the first
// answer (L2), names never split by a line-leading «·» (L11), catalogue names and the column labels (L13), the time said
// once (L17), a function replacement for the areas (C-15).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const FILES = ['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/alerts.js', 'js/onview.js', 'js/alerts-history.js', 'js/view-alert.js', 'js/view-alerts.js'];
function setup(lang) {
  const ctx = load(FILES);
  ctx.I18n.setLang(lang || 'ru');
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = { id, className: '', innerHTML: '' });
  ctx.AlertsScreenView.init({ innerHTML: '', querySelector: (s) => node(s.replace(/^#/, '')) });
  const m = { homes: ctx.Config.alerts.areas, nearby: ctx.Config.alerts.nearby, since: '', checked: '20:32', today: '29.10.2026', updated: '20:30', days: 7 };
  const quiet = { active: null, nearby: null, around: null, offline: false, checkedAt: 1 };
  return { ctx, nodes, m, quiet, body: () => nodes['al-body'].innerHTML, status: () => nodes['alerts-status'] };
}
const text = (html) => html.replace(/<[^>]*>/g, '\u0000').split('\u0000').map((s) => s.trim()).filter(Boolean);
const rec = (data, o) => Object.assign({ data, date: '29.10.2026', time: '20:01:12', alertDate: '2026-10-29T20:01:00', category: 1, category_desc: 'ירי רקטות וטילים' }, o);

test('L2: before the first answer the shield is neutral (is-checking: grey, no check); after it, the green «Тревог нет»', () => {
  const h = setup();
  h.ctx.AlertsScreenView.render(Object.assign({}, h.quiet, { checkedAt: 0 }), { kind: 'loading', events: [] }, h.m);
  assert.match(h.body(), /<section class="card al-home is-quiet is-checking"><svg class="icon g-shield"/);
  assert.ok(text(h.body()).includes('Проверяем…'));
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'loading', events: [] }, h.m);
  assert.match(h.body(), /<section class="card al-home is-quiet"><svg/);
  assert.ok(text(h.body()).includes('Тревог нет'));
});

test('L13 / C-7: catalogue cities named in the interface language; an area no city covers stays Hebrew under a column label that says so', () => {
  const h = setup('ru'), placeOf = h.ctx.Alerts.placeLookup(h.ctx.Cities.list);
  const events = h.ctx.AlertsHistory.parse([rec('אשדוד - א,ב,ד,ה'), rec('חיפה - מערב'), rec('אביתר', { alertDate: '2026-10-29T19:00:00' })], 7, placeOf);
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'fresh', events }, h.m);
  const t = text(h.body());
  assert.deepEqual(t.slice(t.indexOf('Время'), t.indexOf('Время') + 3), ['Время', 'Тревога', 'Районы (на иврите)']);
  assert.ok(t.includes('Ашдод') && t.includes('Хайфа'), 'catalogue names in Russian: ' + t.join(' | '));
  assert.match(h.body(), /<div class="al-areas" dir="rtl" lang="he"><span class="al-name">אביתר<\/span><\/div>/, 'the unknown one as written, right to left');
  const known = h.ctx.AlertsHistory.parse([rec('אשדוד - א,ב,ד,ה')], 7, placeOf);
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'fresh', events: known }, h.m);
  assert.ok(text(h.body()).includes('Районы'), 'every name translated: the plain label');
  const he = setup('he');
  he.ctx.AlertsScreenView.render(he.quiet, { kind: 'fresh', events }, he.m);
  assert.ok(text(he.body()).includes('אשדוד - א,ב,ד,ה'), 'Hebrew: the feed\'s own words');
});

test('L11: a separator never starts a line — the space before «·» and «,» is a no-break space', () => {
  const h = setup('ru');
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'loading', events: [] }, h.m);
  const near = h.body().slice(h.body().indexOf('al-near-places'));
  assert.ok(near.includes('</span> · <span'), 'nbsp before the dot');
  assert.ok(!/<\/span> · <span/.test(near), 'no breakable space before the dot');
});

test('C-15: an area name holding "$&" is drawn as written (a function replacement, never a pattern)', () => {
  const h = setup('ru');
  const events = h.ctx.AlertsHistory.parse([rec('a$&b'), rec('c'), rec('d'), rec('e')], 7, () => null);
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'fresh', events }, h.m);
  assert.ok(h.body().includes('<span class="al-name">a$&amp;b</span>'), 'the name intact inside «… и ещё 1»');
});

test('L17: the header says the list\'s state only when it is not current — a fresh list\'s time is not said beside «Проверено в»', () => {
  const h = setup('ru');
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'fresh', events: [] }, h.m);
  assert.equal(h.status().innerHTML, '', 'fresh: the home card\'s «Проверено в 20:32» is the one time');
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'stale', events: [] }, h.m);
  assert.equal(text(h.status().innerHTML).join(''), 'Не обновляется · данные от 20:30');
});
