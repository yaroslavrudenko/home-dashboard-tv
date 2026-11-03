'use strict';
// FIX-17B 4 (Codex F2): a stale column's «данные от HH:MM» is left out ONLY when the header is stale at the same minute
// (N11: never one time twice); under a FRESH header it is always said — the header speaks for the current column, so a
// stale column hiding behind its minute would read as current.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

function render(lang, cols, head) {
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/html.js', 'js/view-news.js']);
  ctx.I18n.setLang(lang);
  const nodes = {}, el = { innerHTML: '', querySelector: (sel) => (nodes[sel] = nodes[sel] || { className: '', innerHTML: '' }) };
  ctx.NewsView.init(el);
  ctx.NewsView.render(cols, head, Date.UTC(2026, 9, 29, 18, 32), 5);
  return { body: nodes['#news-body'].innerHTML, status: nodes['#news-status'].innerHTML };
}
const item = { key: 'k', title: 't', at: Date.UTC(2026, 9, 29, 18, 30) };
const PART = { ru: 'данные от 20:32', he: 'נתונים מ־20:32', uk: 'дані від 20:32' };

for (const lang of ['ru', 'he', 'uk']) {
  test('FIX-17B 4 ' + lang + ': fresh and stale columns in the same minute — the stale one says it; both stale at that minute — said once, in the header', () => {
    const mixed = render(lang, [{ id: 'israel', source: 'a', items: [item], kind: 'fresh', updated: '20:32' },
      { id: 'economy', source: 'b', items: [item], kind: 'stale', updated: '20:32' }], { kind: 'fresh', updated: '20:32', retryAt: '' });
    assert.equal((mixed.body.match(/news-col-state/g) || []).length, 1, 'the stale column says it');
    assert.ok(mixed.body.includes('<span class="news-col-state">' + PART[lang] + '</span>'), lang);
    const both = render(lang, [{ id: 'israel', source: 'a', items: [item], kind: 'stale', updated: '20:32' },
      { id: 'economy', source: 'b', items: [item], kind: 'stale', updated: '20:32' }], { kind: 'stale', updated: '20:32', retryAt: '' });
    assert.equal((both.body.match(/news-col-state/g) || []).length, 0, 'the stale header says that minute: the columns say nothing more');
    assert.ok(both.status.includes(PART[lang]), 'said once, in the header');
  });
}
