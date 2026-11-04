'use strict';
// Batch 16: the Alerts screen's own view (js/view-alerts.js) on a stand-in element — the grey shield before the first
// answer (L2), names never split by a line-leading «·» (L11), catalogue names and the column labels (L13), the time said
// once (L17), a function replacement for the areas (C-15).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, orefRecord, orefHistory, fakeTimers } = require('./harness');

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
const rec = (data, o) => orefRecord(Object.assign({ data }, o));   // batch 21: the www.oref.org.il AlertHistory record

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
  const events = h.ctx.AlertsHistory.parse(orefHistory([rec('אשדוד - א,ב,ד,ה'), rec('חיפה - מערב'), rec('אביתר', { dateTime: '2026-10-29T19:00:00' })]), 7, placeOf);
  h.ctx.AlertsScreenView.render(h.quiet, { kind: 'fresh', events }, h.m);
  const t = text(h.body());
  assert.deepEqual(t.slice(t.indexOf('Время'), t.indexOf('Время') + 3), ['Время', 'Тревога', 'Районы (на иврите)']);
  assert.ok(t.includes('Ашдод') && t.includes('Хайфа'), 'catalogue names in Russian: ' + t.join(' | '));
  assert.match(h.body(), /<div class="al-areas" dir="rtl" lang="he"><span class="al-name">אביתר<\/span><\/div>/, 'the unknown one as written, right to left');
  const known = h.ctx.AlertsHistory.parse(orefHistory([rec('אשדוד - א,ב,ד,ה')]), 7, placeOf);
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
  const events = h.ctx.AlertsHistory.parse(orefHistory([rec('a$&b'), rec('c'), rec('d'), rec('e')]), 7, () => null);
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

// ---- Batch 21C (C1, Codex's verification of 21B) --------------------------------------------------------------------------
// «No alerts in N days» only for a list read to its end (fresh). A quiet week answered, then a war-day round that cannot be
// finished (page 2 fails, no cursor, capped with nothing complete): stale, empty — the failed block under «not updating · data
// from HH:MM», never «none». The real controller and the real view, the recorded pages.
const orefFile = (n) => JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'oref', n + '.json'), 'utf8'));
function quietThenWarDay(lang, patch, second) {
  const h = setup(lang), t = fakeTimers(Date.parse('2026-03-05T21:30:00Z'));
  let pending = null;
  const c = h.ctx.AlertsHistory.createController(Object.assign({}, h.ctx.Config.alerts.history, { refreshMs: 405000 }, patch), { now: t.now,
    setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, onChange: () => {}, getJson: (url, ms, done) => { pending = done; } });
  const reply = (err, body) => { const d = pending; pending = null; d(err, body); };
  c.setVisible(true, true);
  reply(null, orefFile('history-empty'));
  const show = () => { h.ctx.AlertsScreenView.render(h.quiet, c.state(), Object.assign({}, h.m, { updated: '20:30' })); return text(h.body()); };
  const before = show();
  t.advance(405000);
  c.setVisible(true, true);
  second(reply);
  return { h, c, before, after: show() };
}
const NONE = { ru: 'За последние 7 дней тревог не было', he: 'לא היו התרעות ב־7 הימים האחרונים' };
test('B21C C1: quiet week, then an unfinished war-day round (page 2 503 / no cursor / capped at 0) → stale, never «none»', () => {
  const war = orefFile('2026-03-05/page-1'), noCursor = Object.assign({}, war, { lastRetrievedAlarm: undefined });
  const cases = {
    'page 2 answers 503': [{}, (reply) => { reply(null, war); reply('http 503'); }],
    'a full page without a cursor': [{}, (reply) => reply(null, noCursor)],
    'capped with nothing complete': [{ maxPages: 1 }, (reply) => reply(null, war)]
  };
  for (const lang of ['ru', 'he']) for (const name of Object.keys(cases)) {
    const r = quietThenWarDay(lang, cases[name][0], cases[name][1]);
    assert.ok(r.before.includes(NONE[lang]), lang + ': the quiet week, read to its end, says «none»');
    assert.deepEqual([r.c.state().kind, r.c.state().events.length], ['stale', 0], name);
    assert.ok(!r.after.includes(NONE[lang]), lang + ' ' + name + ': never «none» from an unfinished round: ' + r.after.join(' | '));
    assert.ok(r.after.includes(r.h.ctx.I18n.t('st.failed')), lang + ' ' + name + ': the failed block');
    assert.match(r.h.status().innerHTML, new RegExp(r.h.ctx.I18n.t('st.stale', { time: '20:30' }).replace(/[·.]/g, '.')), name + ': «not updating · data from 20:30»');
    assert.ok(!/state is-none/.test(r.h.body()), name);
  }
});
