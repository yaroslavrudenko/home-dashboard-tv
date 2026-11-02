'use strict';
// Batch 16: the small shared helpers every module now uses — one home per rule (C-2, C-3, C-4, C-5, C-6, C-8, C-11, C-16,
// C-21, PERF-2).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('C-11 / C-3: Num — one finite-number rule and one count rule for every module', () => {
  const ctx = load([]);
  for (const v of [0, 1, -1, 0.5, 1e9]) assert.equal(ctx.Num.finite(v), true, String(v));
  for (const v of [NaN, Infinity, -Infinity, '1', null, undefined, {}]) assert.equal(ctx.Num.finite(v), false, String(v));
  for (const v of [0, 1, 1793610586000]) assert.equal(ctx.Num.count(v), true, String(v));
  for (const v of [-1, 0.5, NaN, Infinity, '3', null, undefined]) assert.equal(ctx.Num.count(v), false, String(v));
  const src = (f) => require('node:fs').readFileSync(require('node:path').join(require('./harness').ROOT, 'js', f), 'utf8');
  for (const f of ['ledger.js', 'traffic.js', 'markets.js', 'openmeteo.js']) assert.ok(!/isFinite\(v\)/.test(src(f)), f + ': no private copy');
});

test('C-2: Freshness — one rule: no data loading/failed; data fresh, stale on doubt, when old, or when dated in the future', () => {
  const ctx = load([]), F = ctx.Freshness, NOW = 1000000, MAX = 600;
  assert.equal(F.kind(false, false, 0, NOW, MAX), 'loading');
  assert.equal(F.kind(false, true, 0, NOW, MAX), 'failed');
  assert.equal(F.kind(true, false, NOW - 100, NOW, MAX), 'fresh');
  assert.equal(F.kind(true, false, NOW - MAX, NOW, MAX), 'fresh', 'exactly staleAfterMs old: still fresh');
  assert.equal(F.kind(true, false, NOW - MAX - 1, NOW, MAX), 'stale');
  assert.equal(F.kind(true, true, NOW, NOW, MAX), 'stale', 'in doubt');
  assert.equal(F.kind(true, false, NOW + 1, NOW, MAX), 'stale', 'a clock that went back: never fresh');
  assert.equal(F.old(NOW + 1, NOW, MAX), true);
});

test('C-16 / C-21 / C-6: Html — esc escapes the single quote too; setStatus writes only a changed line; statusText is Html\'s', () => {
  const ctx = load(['js/i18n.js', 'js/html.js']);
  assert.equal(ctx.Html.esc('<a href=\'x\' title="y">&</a>'), '&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;&lt;/a&gt;');
  let writes = 0, html = '';
  const el = { className: '' };
  Object.defineProperty(el, 'innerHTML', { get: () => html.replace('<span class="status-dot"></span>', '<span class="status-dot"/>'), set: (v) => { html = v; writes++; } });
  ctx.Html.setStatus(el, 'status', 'fresh', 'Обновлено в 20:32');
  ctx.Html.setStatus(el, 'status', 'fresh', 'Обновлено в 20:32');
  assert.equal(writes, 1, 'the page\'s own serialisation is never compared: the line last written is remembered');
  ctx.Html.setStatus(el, 'status', 'stale', 'Не обновляется · данные от 20:32');
  assert.equal(writes, 2);
  ctx.I18n.setLang('ru');
  assert.equal(ctx.Html.statusText('stale', '20:32', 'met'), 'Не обновляется · данные от 20:32 · MET Norway');
  assert.equal(ctx.Html.label, undefined, 'C-14: no dead export');
});

test('C-5: I18n.tOr — a name from the tables, or the fallback (never the key); L3 uk «Від {time}»; L1 the short column line', () => {
  const ctx = load(['js/i18n.js']);
  ctx.I18n.setLang('ru');
  assert.equal(ctx.I18n.tOr('markets.row.AAPL', 'AAPL'), 'Apple');
  assert.equal(ctx.I18n.tOr('markets.row.ZZZ', 'ZZZ'), 'ZZZ');
  ctx.I18n.setLang('uk');
  assert.equal(ctx.I18n.t('a.since', { time: '20:32' }), 'Від 20:32', 'never «З 20:32», read as «3 20:32»');
  for (const [lang, line] of [['ru', 'данные от 09:31'], ['he', 'נתונים מ־09:31'], ['uk', 'дані від 09:31']]) {
    ctx.I18n.setLang(lang);
    assert.equal(ctx.I18n.t('n.colStale', { time: '09:31' }), line, lang);
  }
});

test('C-8: Tz — a wall time\'s dates from one place: "2026-10-29", "29.10", "29.10.2026"; hourKey built on it', () => {
  const ctx = load(['js/tz.js']);
  const w = { ok: true, year: 2026, month: 9, day: 9, hours: 7 };
  assert.deepEqual([ctx.Tz.wallDate(w), ctx.Tz.ddmm(w), ctx.Tz.ddmmyyyy(w), ctx.Tz.hourKey(w)], ['2026-10-09', '09.10', '09.10.2026', '2026-10-09T07']);
});

test('C-4: HomeCity.name — one place-name rule: the language, its "in" form where asked, else English, else Russian', () => {
  const ctx = load(['js/cities.js', 'js/homecity.js']);
  const r = { he: 'רחובות', ru: 'Реховот', uk: 'Реховот', en: 'Rehovot', ruIn: 'Реховоте', ukIn: 'Реховоті' };
  assert.deepEqual([ctx.HomeCity.name(r, 'ru'), ctx.HomeCity.name(r, 'ru', 'In'), ctx.HomeCity.name(r, 'he', 'In'), ctx.HomeCity.name(r, 'fr')],
    ['Реховот', 'Реховоте', 'רחובות', 'Rehovot']);
  assert.equal(ctx.HomeCity.name({ ru: 'Аэропорт' }, 'uk'), 'Аэропорт', 'Russian last');
});

test('PERF-2: Screens.dwellMs / cycleMs — one full turn of the rotation from its own config (Markets stays 90 s)', () => {
  const ctx = load(['js/config.js', 'js/screens.js']), c = ctx.Config;
  assert.equal(ctx.Screens.dwellMs(c.rotation, 'markets'), 90000);
  assert.equal(ctx.Screens.dwellMs(c.rotation, 'news'), 45000);
  assert.equal(ctx.Screens.dwellMs(c.rotation, null), 45000);
  assert.equal(ctx.Screens.cycleMs(c.screens, c.rotation), 7 * 45000 + 90000);
});
