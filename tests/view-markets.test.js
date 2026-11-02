'use strict';
// The Markets screen's view (js/view-markets.js) rendering a MarketsSnapshot: card order, row names, prices in each
// language's own marks, the day's change, «Нет данных» rows, the closed mark, Hebrew bidi, placeholders before the first
// data, and that a refresh rewrites only the cards whose quotes changed. The fixture's quotes are made up for the test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./harness');

const FILES = ['js/config.js', 'js/i18n.js', 'js/tz.js', 'js/html.js', 'js/icons.js', 'js/view.js', 'js/view-markets.js'];
const ORDER = ['fx', 'us', 'il', 'crypto', 'indices', 'commodities'];
const ROWS = { fx: 6, us: 6, il: 6, crypto: 6, indices: 6, commodities: 6 };   // the owner's M4-FINAL-3/5: six rows in every card
const LAYOUT = ORDER.map((id) => ({ id, rows: ROWS[id] }));
const LRE = '‪', PDF = '‬', NNBSP = ' ', NBSP = ' ';

// A stand-in for the screen element: querySelector('#x') always returns the same node, every innerHTML write is counted.
function fakeScreen() {
  const nodes = {};
  const node = (id) => {
    if (nodes[id]) return nodes[id];
    let html = '';
    const n = { id, className: '', writes: 0 };
    Object.defineProperty(n, 'innerHTML', { get: () => html, set: (v) => { html = v; n.writes++; } });
    return (nodes[id] = n);
  };
  const el = { innerHTML: '', querySelector: (sel) => node(sel.replace(/^#/, '')) };
  return { el, nodes, card: (id) => nodes['mk-' + id] };
}

function setup(lang) {
  const ctx = load(FILES);
  ctx.I18n.setLang(lang || 'ru');
  const scr = fakeScreen();
  ctx.MarketsView.init(scr.el, LAYOUT);
  return { ctx, scr };
}

const unwrap = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const text = (html) => unwrap(html.replace(/<[^>]*>/g, ''));
// One card's rows as { cls, name, price, change, chgClass, arrow, closed }.
function rows(cardHtml) {
  return cardHtml.split(/<div class="mk-row(?=[ "])/).slice(1).map((r) => {
    const pick = (cls) => { const m = r.match(new RegExp('<span class="' + cls + '">([^<]*)</span>')); return m ? unwrap(m[1]) : null; };
    const name = r.match(/<span class="mk-name">([^<]*)/);
    const chg = r.match(/<span class="mk-chg( is-\w+)?">/);
    return { cls: r.slice(0, r.indexOf('"')).trim(), name: name ? unwrap(name[1]) : null, price: (r.match(/<span class="mk-price">([^<]*)/) || [])[1] !== undefined ? unwrap(r.match(/<span class="mk-price">([^<]*)/)[1]) : null,
      // FIX-11B-B1b: the sign inside the price cell, in its own box right after the number
      unit: r.includes('<span class="mk-price">') ? unwrap((r.match(/<span class="mk-price">[^<]*<span class="mk-sign">([^<]*)<\/span><\/span>/) || [null, ''])[1]) : null,
      signInPrice: /<span class="mk-price">[^<]*<span class="mk-sign">/.test(r), nodata: pick('mk-nodata'),
      change: unwrap((r.match(/<span class="mk-pct">([^<]*)/) || [])[1] || ''), chgClass: chg ? (chg[1] || '').trim() : null,
      // B4: the arrow slot is always there; an arrow is drawn only going up or down
      arrow: /is-(up|down)/.test(chg ? chg[1] || '' : ''), slot: r.includes('<span class="mk-arrow"></span>'), closed: r.includes('mk-closed') };
  });
}
const head = (cardHtml) => cardHtml.slice(0, cardHtml.indexOf('<div class="mk-rows">'));

test('Markets: six cards in the snapshot order (currencies first), six rows each, every group and row named', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  assert.deepEqual(ORDER.map((id) => text(head(scr.card(id).innerHTML).replace(/<span class="mk-closed">.*?<\/span>/, ''))),
    ['Валюты', 'Акции США', 'Акции Израиля', 'Криптовалюты', 'Индексы США', 'Сырьё']);
  for (const id of ORDER) assert.equal(rows(scr.card(id).innerHTML).length, ROWS[id], id);
  assert.deepEqual(rows(scr.card('fx').innerHTML).map((r) => r.name), ['₪ за 1 $', '₪ за 1 €', '₴ за 1 ₪', '₽ за 1 ₪', '$ за 1 €', '₴ за 1 $']);
  assert.deepEqual(rows(scr.card('us').innerHTML).map((r) => r.name), ['Apple', 'NVIDIA', 'Microsoft', 'Alphabet', 'Amazon', 'Intuit']);
  assert.deepEqual(rows(scr.card('indices').innerHTML).map((r) => r.name), ['S&P 500', 'Dow Jones', 'Nasdaq', 'Nasdaq 100', 'Russell 2000', 'VIX']);
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Обновлено в 14:32');
  assert.equal(scr.nodes['markets-status'].className, 'status screen-status is-fresh');
});

test('Markets: prices in display units with the language\'s own marks; indices carry no currency', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  const price = (id) => rows(scr.card(id).innerHTML).map((r) => r.price);
  const unit = (id) => rows(scr.card(id).innerHTML).map((r) => r.unit);
  // FIX-11B-B1b: the sign inside the price cell (its own box right after the number); FX always 4 places (the source's
  // real digits, no padding); crypto always 2 (B1a); indices 2.
  assert.deepEqual(price('fx'), ['3,6912', '4,0137', '11,3700', '22,0500', '1,0874', '41,6200']);
  assert.ok(rows(scr.card('fx').innerHTML).every((r) => r.signInPrice), 'every currency sign sits inside its price cell');
  assert.deepEqual(unit('fx'), ['₪', '₪', '₴', '₽', '$', '₴']);
  assert.deepEqual(price('crypto'), ['108' + NNBSP + '452,31', '3' + NNBSP + '912,55', '1' + NNBSP + '084,20', '2,41', '186,33', '0,34']);   // FIX-11B-B1a: crypto always 2 places, TRX included
  assert.deepEqual(price('indices'), ['6' + NNBSP + '812,44', '47' + NNBSP + '315,80', '23' + NNBSP + '104,61', '25' + NNBSP + '377,12', '2' + NNBSP + '481,06', '17,84']);
  assert.deepEqual(unit('indices'), ['', '', '', '', '', ''], 'points: no sign at all');
  assert.equal(price('il')[1], '1' + NNBSP + '642,00', 'shekels, not agorot: the data side divides, the view shows');
  assert.equal(unit('il')[1], '₪');
});

test('Markets: the day\'s change — ▲ green up, ▼ red down, no arrow when the source gives none', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  const us = rows(scr.card('us').innerHTML);
  assert.deepEqual(us.map((r) => [r.change, r.chgClass, r.arrow, r.slot]), [['+0,37%', 'is-up', true, true], ['+1,84%', 'is-up', true, true], ['−0,42%', 'is-down', true, true],
    ['+2,11%', 'is-up', true, true], ['+0,93%', 'is-up', true, true], ['−1,27%', 'is-down', true, true]]);
  const uah = rows(scr.card('fx').innerHTML)[2];
  assert.deepEqual([uah.change, uah.chgClass, uah.arrow, uah.slot], ['—', 'is-none', false, true], 'B3: no day change from the source: a muted «—», nothing invented; B4: the arrow slot kept');
  const nodata = rows(scr.card('il').innerHTML)[5];
  assert.deepEqual([nodata.cls, nodata.change], ['is-nodata', ''], 'no dash on a «нет данных» row');
});

test('Markets: a quote without a price says «Нет данных» in its own row — never hidden, never a number', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  const il = rows(scr.card('il').innerHTML);
  assert.equal(il.length, 6);
  assert.deepEqual([il[5].cls, il[5].name, il[5].nodata, il[5].price], ['is-nodata', 'Мизрахи', 'нет данных', null]);
  const snap = fixture('markets-view-snapshot');
  snap.groups[1].rows[5].price = NaN;
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:37' });
  assert.equal(rows(scr.card('us').innerHTML)[5].nodata, 'нет данных', 'NaN is no price either');
});

// V1 (VG-13): the mark lives only in the head — a row is one line. Every priced row closed: «закрыто»; some (the US
// indices after hours with ^VIX still trading, or natural gas alone): «частично закрыто»; the closed prices are dimmed.
test('Markets: a closed market is said once, in the card head — «закрыто» (all) or «частично закрыто» (some), never in a row', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  assert.match(head(scr.card('il').innerHTML), /<span class="mk-closed">закрыто<\/span>/, 'every priced Israeli row is closed: the head says it');
  assert.deepEqual(rows(scr.card('il').innerHTML).map((r) => r.closed), [false, false, false, false, false, false], 'not repeated per row');
  assert.deepEqual(rows(scr.card('il').innerHTML).map((r) => r.cls), ['is-closed', 'is-closed', 'is-closed', 'is-closed', 'is-closed', 'is-nodata']);
  const com = rows(scr.card('commodities').innerHTML);
  assert.deepEqual(com.map((r) => r.closed), [false, false, false, false, false, false], 'no row carries the mark');
  assert.deepEqual(com.map((r) => r.cls), ['', 'is-closed', '', '', '', ''], 'only natural gas is dimmed');
  assert.match(head(scr.card('commodities').innerHTML), /<span class="mk-closed">частично закрыто<\/span>/);
  const idx = rows(scr.card('indices').innerHTML);
  assert.match(head(scr.card('indices').innerHTML), /<span class="mk-closed">частично закрыто<\/span>/, 'five indices closed, VIX trading');
  assert.deepEqual(idx.map((r) => [r.cls, r.closed]), [['is-closed', false], ['is-closed', false], ['is-closed', false], ['is-closed', false], ['is-closed', false], ['', false]]);
  for (const id of ORDER) assert.ok(!scr.card(id).innerHTML.slice(scr.card(id).innerHTML.indexOf('<div class="mk-rows">')).includes('mk-closed'), id + ': no mark inside the rows');
  assert.doesNotMatch(head(scr.card('crypto').innerHTML), /mk-closed/);
});

test('Markets: a quote the last round could not refresh (stale) keeps its last value, dimmed — never «Нет данных»', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  const sol = rows(scr.card('crypto').innerHTML)[4];
  assert.deepEqual([sol.name, sol.cls, sol.price, sol.change, sol.nodata], ['Солана', 'is-stale', '186,33', '−2,48%', null]);   // B1: the sign in its own cell
  assert.equal(rows(scr.card('crypto').innerHTML)[4].unit, '$');
  assert.deepEqual(rows(scr.card('crypto').innerHTML).map((r) => r.cls), ['', '', '', '', 'is-stale', ''], 'only the stale row is dimmed');
});

test('Markets in Hebrew: every price and change stays left to right (LRE … PDF), «.» decimals and «,» groups, Hebrew names', () => {
  const { ctx, scr } = setup('he');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  const us = rows(scr.card('us').innerHTML);
  assert.equal(us[1].name, 'אנבידיה');
  assert.equal(us[1].price, LRE + '201.37' + PDF);   // B1: the number alone, left to right; the sign in its own cell
  assert.equal(us[1].unit, '$');
  assert.equal(us[2].change, LRE + '−0.42%' + PDF);
  assert.equal(rows(scr.card('crypto').innerHTML)[0].price, LRE + '108,452.31' + PDF);
  assert.equal(rows(scr.card('fx').innerHTML)[0].name, 'שקלים לדולר');
  assert.match(head(scr.card('il').innerHTML), />סגור</);
  for (const id of ORDER) for (const r of rows(scr.card(id).innerHTML)) {
    if (r.price !== null) assert.ok(r.price.startsWith(LRE) && r.price.endsWith(PDF), 'he ' + id + ' ' + r.name);
    if (r.change && r.change !== '—') assert.ok(r.change.startsWith(LRE) && r.change.endsWith(PDF), 'he change ' + id + ' ' + r.name);   // B3: «—» is no figure
  }
  for (const lang of ['ru', 'uk']) {
    const o = setup(lang);
    o.ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
    assert.ok(!/[‪-‮]/.test(o.scr.card('us').innerHTML), lang + ': no bidi marks outside Hebrew');
  }
});

test('Markets before the first data: every card keeps its six row slots as placeholders; the header says loading, or failed', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(null, { kind: 'loading', updated: '' });
  for (const id of ORDER) {
    assert.equal(scr.card(id).className, 'card mk-card is-empty');
    assert.equal(rows(scr.card(id).innerHTML).filter((r) => r.cls === 'is-empty').length, ROWS[id], id + ': its slots, so nothing moves when data comes');
    assert.equal(text(head(scr.card(id).innerHTML)), ctx.I18n.t('markets.group.' + id));
  }
  assert.equal(scr.nodes['markets-status'].className, 'status screen-status is-loading');
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Загружаем котировки…');
  ctx.MarketsView.render(null, { kind: 'failed', updated: '' });
  assert.equal(scr.nodes['markets-status'].className, 'status screen-status is-failed');
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Котировки временно недоступны');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'stale', updated: '14:32' });
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Не обновляется · данные от 14:32');
  assert.equal(scr.card('fx').className, 'card mk-card');
});

test('Markets: a snapshot with updatedAt 0 (nothing ever arrived) shows no «Обновлено» line; fresh rows carry no stale key', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  snap.updatedAt = 0;
  for (const g of snap.groups) for (const r of g.rows) Object.assign(r, { price: null, changePct: null, closed: false });
  ctx.MarketsView.render(snap, { kind: 'failed', updated: '02:00' });
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Котировки временно недоступны', 'A2: failed is honoured, whatever time comes with it');
  assert.equal(scr.nodes['markets-status'].className, 'status screen-status is-failed');
  assert.ok(rows(scr.card('us').innerHTML).every((r) => r.nodata === '—'), 'B8: a card with no price at all: «—» in its rows');
  const fresh = fixture('markets-view-snapshot');
  assert.ok(fresh.groups[0].rows.every((r) => !('stale' in r)), 'the fixture mirrors js/markets.js: fresh rows have no stale key');
});

test('Markets refresh: an unchanged card is not rewritten; one changed quote rewrites only its card; a language switch rewrites all', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
  const writes = () => ORDER.map((id) => scr.card(id).writes);
  assert.deepEqual(writes(), [1, 1, 1, 1, 1, 1]);
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:37' });
  assert.deepEqual(writes(), [1, 1, 1, 1, 1, 1], 'same quotes five minutes later: no card touched');
  const next = fixture('markets-view-snapshot');
  next.groups[3].rows[0].price = 108501.07;
  ctx.MarketsView.render(next, { kind: 'fresh', updated: '14:42' });
  assert.deepEqual(writes(), [1, 1, 1, 2, 1, 1], 'only the crypto card');
  ctx.I18n.setLang('uk');
  ctx.MarketsView.render(next, { kind: 'fresh', updated: '14:42' });
  assert.deepEqual(writes(), [2, 2, 2, 3, 2, 2]);
  assert.equal(text(head(scr.card('fx').innerHTML)), 'Валюти');
});

test('Markets: a change that rounds to zero is flat (no arrow, no colour); an unnamed symbol shows as itself', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  snap.groups[5].rows[3].changePct = -0.004;
  snap.groups[5].rows[4].id = 'XAU=X';
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
  const com = rows(scr.card('commodities').innerHTML);
  assert.deepEqual([com[3].change, com[3].chgClass, com[3].arrow], ['0,00%', 'is-flat', false]);
  assert.equal(com[4].name, 'XAU=X');
});

test('I18n.number: each language\'s decimal mark and thousands group, typographic minus, no Intl needed', () => {
  const ctx = load(['js/config.js', 'js/i18n.js'], { Intl: undefined });
  const n = (lang, v, d) => { ctx.I18n.setLang(lang); return ctx.I18n.number(v, d); };
  assert.equal(n('ru', 1234567.891, 2), '1' + NNBSP + '234' + NNBSP + '567,89');
  assert.equal(n('uk', 999.5, 0), '1' + NNBSP + '000');
  assert.equal(n('he', 1234567.891, 2), '1,234,567.89');
  assert.equal(n('ru', -37.5, 1), '−37,5');
  assert.equal(n('ru', -0.001, 2), '0,00', 'a minus never sits on a zero');
  assert.equal(n('he', 3.69124, 4), '3.6912');
});

test('Markets strings: every group, every row of the fixture and the screen\'s own strings in Russian, Hebrew and Ukrainian', () => {
  const ctx = load(['js/config.js', 'js/i18n.js']);
  const keys = ['screen.markets', 'markets.loading', 'markets.failed', 'markets.closed', 'markets.partlyClosed', 'markets.noData']
    .concat(ORDER.map((g) => 'markets.group.' + g))
    .concat(fixture('markets-view-snapshot').groups.flatMap((g) => g.rows.map((r) => 'markets.row.' + r.id)));
  const seen = {};
  for (const lang of ['ru', 'he', 'uk']) {
    ctx.I18n.setLang(lang);
    for (const k of keys) {
      const v = ctx.I18n.t(k);
      assert.ok(v && v !== k, lang + ' ' + k);
      seen[lang + k] = v;
    }
  }
  // own strings, not the English fallback, for every key that names words (brand and index names may stay Latin)
  for (const k of ['screen.markets', 'markets.closed', 'markets.partlyClosed', 'markets.noData', 'markets.group.fx', 'markets.row.UAHperILS', 'markets.row.BZ=F'])
    for (const lang of ['ru', 'he', 'uk']) { ctx.I18n.setLang('en'); assert.notEqual(seen[lang + k], ctx.I18n.t(k), lang + ' ' + k + ' is its own'); }
  for (const gone of ['GBPILS', 'RUBperUSD', '^NYA', 'PL=F']) assert.equal(ctx.I18n.t('markets.row.' + gone), 'markets.row.' + gone, gone + ': not on the screen (M4-FINAL-5)');
});

// ---- FIX-11B (the one fix round after the four reviewers) -----------------------------------------------------------
// A12 [C12]: the daily rate rows have no trading hours (closed: null): a weekend currencies card, whose Yahoo FX rows are
// closed, reads «закрыто» — not «частично закрыто».
const weekend = () => {
  const snap = fixture('markets-view-snapshot');
  for (const r of snap.groups[0].rows) if (r.closed !== null) r.closed = true;
  return snap;
};
test('A12: a weekend currencies card (FX quotes closed, daily rates without hours) reads «закрыто»; the rate rows are not dimmed', () => {
  const { ctx, scr } = setup('ru');
  ctx.MarketsView.render(weekend(), { kind: 'fresh', updated: '14:32' });
  assert.match(head(scr.card('fx').innerHTML), /<span class="mk-closed">закрыто<\/span>/);
  assert.deepEqual(rows(scr.card('fx').innerHTML).map((r) => r.cls), ['is-closed', 'is-closed', '', '', 'is-closed', '']);
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:32' });
  assert.doesNotMatch(head(scr.card('fx').innerHTML), /mk-closed/, 'a weekday: the FX quotes trade, nothing is closed');
});

// A13 [C7]: the sign comes from the row's currency only (indices arrive with currency null): no per-group rule.
test('A13: the sign is the row\'s currency, the one source: a row with a currency shows its sign in any card, null shows none', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  snap.groups[4].rows[0].currency = 'USD';
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
  assert.deepEqual(rows(scr.card('indices').innerHTML).map((r) => r.unit), ['$', '', '', '', '', '']);
});

// C6: a symbol the strings do not name is shown as itself — escaped like every other text.
test('C6: an unnamed id with markup is escaped, never markup', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  snap.groups[5].rows[4].id = '<img src=x onerror="window.__pwn=1">';
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
  assert.ok(!scr.card('commodities').innerHTML.includes('<img'), 'no tag');
  assert.equal(rows(scr.card('commodities').innerHTML)[4].name, '<img src=x onerror="window.__pwn=1">');
});

// A10 [X1]: the minute tick renders the same snapshot object again: no card is serialised to find out nothing changed.
test('A10: the same snapshot in the same language (a minute tick): no serialisation at all; a new snapshot is still compared per card', () => {
  let calls = 0;
  const spy = { parse: JSON.parse, stringify: function () { calls++; return JSON.stringify.apply(JSON, arguments); } };
  const ctx = load(FILES, { JSON: spy });
  ctx.I18n.setLang('ru');
  const scr = fakeScreen();
  ctx.MarketsView.init(scr.el, LAYOUT);
  const snap = fixture('markets-view-snapshot');
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:32' });
  calls = 0;
  ctx.MarketsView.render(snap, { kind: 'fresh', updated: '14:33' });
  assert.equal(calls, 0, 'nothing serialised for the same object');
  assert.equal(text(scr.nodes['markets-status'].innerHTML), 'Обновлено в 14:33', 'the header still follows');
  ctx.MarketsView.render(fixture('markets-view-snapshot'), { kind: 'fresh', updated: '14:37' });
  assert.deepEqual(ORDER.map((id) => scr.card(id).writes), [1, 1, 1, 1, 1, 1], 'a new object with the same quotes: no card rewritten');
});

// B8 [D8]: a card none of whose rows has a price says so once, in its head (amber), and «—» in each row.
test('B8: a card with no price at all: one amber «нет данных» in its head and «—» in every row; the other cards are untouched', () => {
  const { ctx, scr } = setup('ru');
  const snap = fixture('markets-view-snapshot');
  for (const r of snap.groups[1].rows) Object.assign(r, { price: null, changePct: null, closed: false });
  ctx.MarketsView.render(snap, { kind: 'stale', updated: '14:32' });
  assert.match(head(scr.card('us').innerHTML), /<span class="mk-failed">нет данных<\/span>/);
  assert.deepEqual(rows(scr.card('us').innerHTML).map((r) => [r.cls, r.nodata, r.change]), Array(6).fill(['is-nodata', '—', '']));
  assert.doesNotMatch(head(scr.card('il').innerHTML), /mk-failed/, 'one missing row: no head mark');
  assert.equal(rows(scr.card('il').innerHTML)[5].nodata, 'нет данных');
});
