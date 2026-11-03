'use strict';
// Batch 11 (Markets screen, data side): the symbol lists in js/config.js `markets` checked against the market-cap ranking
// recorded on 2026-11-02 (tests/fixtures/markets/ranking.json), the Yahoo spark and open.er-api answers recorded the same
// morning (spark-1/2.json = the two requests the app sends, rates-ILS/USD.json) parsed into the MarketsSnapshot contract,
// and the on-view refresh: 4 requests in one parallel round, 2 while the daily rates are current, none off view.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/onview.js', 'js/markets.js'];
const DIR = path.join(__dirname, 'fixtures', 'markets');
const recorded = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const AT = 1793610586 * 1000;                     // 2026-11-02 08:57 UTC: the spark answers were recorded; TASE open, US closed
const MIN = 60000;

const answers = { spark: [recorded('spark-1'), recorded('spark-2')], rates: { ILS: recorded('rates-ILS'), USD: recorded('rates-USD') } };
// The snapshot of the recorded answers as the app would build it at `now` (every request succeeded).
function recordedSnapshot(ctx, now) {
  const quotes = Object.assign({}, ctx.Markets.quotes(answers.spark[0]), ctx.Markets.quotes(answers.spark[1]));
  return ctx.Markets.snapshot(ctx.Config.markets, { quotes, tables: { ILS: answers.rates.ILS.rates, USD: answers.rates.USD.rates }, updatedAt: now }, now);
}
const rowOf = (snap, id) => { for (const g of snap.groups) for (const r of g.rows) if (r.id === id) return r; return undefined; };

test('config: six groups in the contract order, SIX rows each, every row id once, the fx rows in the owner\'s order', () => {
  const m = plain(load(FILES).Config.markets);
  assert.deepEqual(m.groups.map((g) => g.id), ['fx', 'us', 'il', 'crypto', 'indices', 'commodities']);
  for (const g of m.groups) assert.equal(g.rows.length, 6, g.id + ' has 6 rows');
  const ids = m.groups.flatMap((g) => g.rows.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length, 'every row id once');
  assert.deepEqual(m.groups[0].rows.map((r) => r.id), ['USDILS', 'EURILS', 'UAHperILS', 'RUBperILS', 'EURUSD', 'UAHperUSD']);
  assert.deepEqual(m.groups[4].rows.map((r) => r.id), ['^GSPC', '^DJI', '^IXIC', '^NDX', '^RUT', '^VIX']);
  assert.deepEqual(m.groups[5].rows.map((r) => r.id), ['BZ=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F', 'CL=F']);
  for (const r of m.groups.flatMap((g) => g.rows)) assert.ok(r.yahoo ? !r.base : r.base && r.code, 'a row is a Yahoo symbol or a rate: ' + r.id);
});

test('config: US = the five largest US companies by market cap (2026-11-02), then INTU, always present as the 6th', () => {
  const us = plain(load(FILES).Config.markets).groups[1].rows.map((r) => r.id);
  const SAME_COMPANY = { GOOG: 'GOOGL' };          // Alphabet: one company, the class A share is shown
  assert.deepEqual(us.slice(0, 5), recorded('ranking').us.slice(0, 5).map((c) => SAME_COMPANY[c.ticker] || c.ticker));
  assert.equal(us[5], 'INTU');
  assert.equal(us.indexOf('INTU'), 5, 'INTU once, last');
});

test('config: Israel = the six largest companies listed on the Tel Aviv exchange (Check Point, not listed there, skipped)', () => {
  const il = plain(load(FILES).Config.markets).groups[2].rows.map((r) => r.id);
  const listed = recorded('ranking').il.filter((c) => c.taseListed);
  assert.deepEqual(il, listed.slice(0, 6).map((c) => c.taseListed));
  assert.ok(recorded('ranking').il.some((c) => c.ticker === 'CHKP' && !c.taseListed), 'the ranking does hold a company that is not on TASE');
  assert.ok(il.every((s) => /\.TA$/.test(s)));
});

test('config: crypto = the six largest by market cap without stablecoins; no stablecoin at all', () => {
  const crypto = plain(load(FILES).Config.markets).groups[3].rows;
  const rank = recorded('ranking').crypto, stable = new Set(rank.filter((c) => c.stablecoin).map((c) => c.symbol));
  assert.deepEqual(crypto.map((r) => r.id), rank.filter((c) => !c.stablecoin).slice(0, 6).map((c) => c.symbol));
  for (const r of crypto) {
    assert.ok(!stable.has(r.id), r.id + ' is a stablecoin');
    assert.equal(r.yahoo, r.id + '-USD', 'priced in US dollars');
  }
  assert.ok(stable.has('USDT') && stable.has('USDC'), 'the ranking does hold stablecoins above the 6th coin');
});

test('requests: 33 Yahoo symbols in 2 spark requests (≤ 20 each, URL-encoded), one rates request per base — 4 in all', () => {
  const ctx = load(FILES), p = plain(ctx.Markets.plan(ctx.Config.markets));
  assert.equal(p.spark.length, 2);
  const symbols = p.spark.map((u) => decodeURIComponent(new URL(u).searchParams.get('symbols')).split(','));
  assert.deepEqual(symbols.map((s) => s.length), [20, 13]);
  assert.deepEqual(symbols.flat(), plain(ctx.Config.markets).groups.flatMap((g) => g.rows.filter((r) => r.yahoo).map((r) => r.yahoo)));
  assert.match(p.spark[1], /^https:\/\/query1\.finance\.yahoo\.com\/v7\/finance\/spark\?symbols=TRX-USD,%5EGSPC,.*,CL%3DF&range=1d&interval=1d$/);
  assert.deepEqual(p.rates, [{ base: 'ILS', url: 'https://open.er-api.com/v6/latest/ILS' }, { base: 'USD', url: 'https://open.er-api.com/v6/latest/USD' }]);
});

test('TASE prices: Yahoo\'s agorot (ILA) divided by 100 into shekels; the currency becomes ILS', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.deepEqual(plain(rowOf(s, 'TEVA.TA')), { id: 'TEVA.TA', price: 130.1, currency: 'ILS', changePct: 1.641, closed: false });
  assert.equal(rowOf(s, 'ESLT.TA').price, 2482.7);
  for (const r of s.groups[2].rows) assert.ok(r.currency === 'ILS' && r.price > 5 && r.price < 5000, r.id + ' ' + r.price);
});

test('UAH and RUB direction: units of the currency for ONE shekel / ONE dollar — cross-checked against Yahoo\'s own USD/ILS', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  // FIX-11B A12: a daily rate has no trading hours: closed null
  assert.deepEqual(plain(rowOf(s, 'UAHperILS')), { id: 'UAHperILS', price: 14.545465, currency: 'UAH', changePct: null, closed: null });
  assert.deepEqual(plain(rowOf(s, 'RUBperILS')), { id: 'RUBperILS', price: 25.677571, currency: 'RUB', changePct: null, closed: null });
  assert.deepEqual(plain(rowOf(s, 'UAHperUSD')), { id: 'UAHperUSD', price: 45.436273, currency: 'UAH', changePct: null, closed: null });
  const usdIls = rowOf(s, 'USDILS').price;
  assert.equal(usdIls, 3.128);
  // per dollar ÷ per shekel = shekels per dollar: an inverted rate would be off by a factor of ~100–1000, not 1%
  for (const c of ['UAH', 'RUB']) {
    const perUsd = c === 'UAH' ? rowOf(s, 'UAHperUSD').price : answers.rates.USD.rates.RUB;   // no RUB-per-dollar row: the table
    const implied = perUsd / rowOf(s, c + 'perILS').price;
    assert.ok(Math.abs(implied / usdIls - 1) < 0.01, c + ': ' + implied + ' vs ' + usdIls);
  }
  assert.deepEqual(plain(rowOf(s, 'EURUSD')), { id: 'EURUSD', price: 1.1237, currency: 'USD', changePct: 0.6406, closed: false });
});

test('rate tables of another base, or not a success, give no rate (never a rate read the wrong way round)', () => {
  const ctx = load(FILES);
  assert.throws(() => ctx.Markets.rateTable(answers.rates.USD, 'ILS'), /rates/);
  assert.throws(() => ctx.Markets.rateTable({ result: 'error', 'error-type': 'unsupported-code' }, 'ILS'), /rates/);
  assert.equal(ctx.Markets.rateTable(answers.rates.ILS, 'ILS').UAH, 14.545465);
});

test('day change %: the source\'s own figure, never recomputed (SOL: price above the chart\'s previous close, yet −0.70% for the day)', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.equal(rowOf(s, 'INTU').changePct, 2.989);
  assert.equal(rowOf(s, 'SOL').changePct, -0.70275);
  assert.equal(rowOf(s, 'BTC').changePct, 0.26);
  const noChange = JSON.parse(JSON.stringify(answers.spark[0]));
  delete noChange.spark.result.find((x) => x.symbol === 'INTU').response[0].meta.regularMarketChangePercent;
  const q = ctx.Markets.quotes(noChange);
  const snap = ctx.Markets.snapshot(ctx.Config.markets, { quotes: q, tables: {}, updatedAt: AT }, AT);
  assert.deepEqual([rowOf(snap, 'INTU').price, rowOf(snap, 'INTU').changePct], [341.09, null], 'no figure from the source: null');
});

test('closed market: outside Yahoo\'s regular session the last close is shown, marked closed; a 24-hour market is never closed', () => {
  const ctx = load(FILES);
  const before = recordedSnapshot(ctx, AT);                         // 08:57 UTC Monday: New York opens at 14:30 UTC
  assert.deepEqual(plain(rowOf(before, 'INTU')), { id: 'INTU', price: 341.09, currency: 'USD', changePct: 2.989, closed: true });
  assert.equal(rowOf(before, '^GSPC').closed, true);
  assert.equal(rowOf(before, 'TEVA.TA').closed, false, 'TASE trades');
  const usOpen = recordedSnapshot(ctx, Date.parse('2026-11-02T15:00:00Z'));
  assert.deepEqual([rowOf(usOpen, 'INTU').closed, rowOf(usOpen, 'TEVA.TA').closed], [false, false]);
  const evening = recordedSnapshot(ctx, Date.parse('2026-11-02T21:30:00Z'));
  assert.deepEqual([rowOf(evening, 'INTU').closed, rowOf(evening, 'TEVA.TA').closed], [true, true]);
  // Yahoo ends a 24-hour session at 23:59: its last minute still belongs to it
  const lastMinute = recordedSnapshot(ctx, Date.parse('2026-11-02T23:59:30Z'));
  for (const id of ['BTC', 'SOL', 'USDILS', 'EURUSD']) assert.equal(rowOf(lastMinute, id).closed, false, id);
});

test('an index is a value in points, not money: currency null (^VIX, ^GSPC); commodities and crypto in dollars', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.deepEqual(plain(rowOf(s, '^VIX')), { id: '^VIX', price: 19.1, currency: null, changePct: -1.649, closed: false });
  for (const r of s.groups[4].rows) assert.ok(r.currency === null && r.price > 0, r.id);
  for (const g of [s.groups[3], s.groups[5]]) for (const r of g.rows) assert.ok(r.currency === 'USD' && r.price > 0, r.id);
  for (const g of s.groups) assert.equal(g.rows.length, 6, g.id);
});

test('a failed row stays, with price null: a symbol missing from the answer, an unreadable answer, a missing rate', () => {
  const ctx = load(FILES), cfg = ctx.Config.markets;
  const partial = JSON.parse(JSON.stringify(answers.spark[0]));
  partial.spark.result = partial.spark.result.filter((x) => x.symbol !== 'INTU');
  partial.spark.result.find((x) => x.symbol === 'AAPL').response[0].meta.regularMarketPrice = null;
  const s = ctx.Markets.snapshot(cfg, { quotes: ctx.Markets.quotes(partial), tables: { ILS: { UAH: 14.5 } }, updatedAt: AT }, AT);
  const UNIT = { 'BZ=F': 'barrel', 'CL=F': 'barrel' };   // Codex L1: a commodity row carries its unit, priced or not
  const empty = (id) => Object.assign({ id, price: null, currency: null, changePct: null, closed: /per(ILS|USD)$/.test(id) ? null : false }, UNIT[id] ? { unit: UNIT[id] } : {});   // A12: a rate row null
  for (const id of ['INTU', 'AAPL', 'RUBperILS', 'UAHperUSD', 'BZ=F', 'CL=F']) assert.deepEqual(plain(rowOf(s, id)), empty(id), id);
  assert.equal(rowOf(s, 'NVDA').price, 204.64);
  assert.equal(rowOf(s, 'UAHperILS').price, 14.5);
  for (const g of s.groups) assert.equal(g.rows.length, 6, 'no row dropped in ' + g.id);
  for (const bad of [{}, '<html>', { spark: { result: null, error: { code: 'Bad Request' } } }]) assert.throws(() => ctx.Markets.quotes(bad), /spark/);
});

// The controller: on view only (js/onview.js), every request with the timeout, all of a round in parallel.
function controller(opts) {
  const ctx = load(FILES), t = fakeTimers((opts && opts.start) || AT), calls = [], snaps = [];
  let visible = true;
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: (s) => snaps.push(s), getJson: (url, ms, done) => calls.push({ url, ms, done }) });
  // Answers every open request: by URL part → an error label (a string) or another body (an object); otherwise the
  // recorded answer for that request.
  const answer = (fail) => {
    const open = calls.splice(0, calls.length);
    for (const call of open) {
      const err = fail && Object.keys(fail).find((k) => call.url.includes(k));
      if (err) { if (typeof fail[err] === 'string') call.done(fail[err]); else call.done(null, fail[err]); continue; }
      const base = /latest\/([A-Z]{3})$/.exec(call.url);
      call.done(null, base ? answers.rates[base[1]] : answers.spark[call.url.includes('TRX-USD') ? 1 : 0]);
    }
    return open.length;
  };
  return { ctx, t, c, calls, snaps, answer, hide: () => { visible = false; c.visibilityChanged(); } };
}

test('request count per refresh: 4 in one parallel round (2 spark + 2 rates), each with the 15 s timeout; one render per round', () => {
  const h = controller();
  assert.equal(h.c.snapshot(), null, 'nothing yet: the view shows its loading state');
  h.c.setVisible(true, true);
  const sentBeforeAnyAnswer = h.calls.length;
  assert.equal(sentBeforeAnyAnswer, 4, 'every request before any answer');
  assert.ok(h.calls.every((c) => c.ms === 15000));
  h.c.setVisible(true, true);
  assert.equal(h.calls.length, 4, 'nothing more while the round is in flight');
  h.t.advance(800);
  assert.equal(h.answer(), 4);
  assert.equal(h.snaps.length, 2, 'FIX-11B A9: a cold round shows the quotes first (rates still out), then the whole round');
  const s = h.c.snapshot();
  assert.equal(s, h.snaps[1]);
  assert.equal(s.updatedAt, AT + 800, 'the moment the newest answer came');
  assert.deepEqual(plain(s.groups).map((g) => [g.id, g.rows.filter((r) => r.price !== null).length]),
    [['fx', 6], ['us', 6], ['il', 6], ['crypto', 6], ['indices', 6], ['commodities', 6]]);
  console.log('# markets requests per refresh: cold round ' + sentBeforeAnyAnswer + ' (all sent before any answer)');
});

test('the daily rates are reused until the provider\'s next update: later rounds send 2 requests, then 4 again after it', () => {
  const h = controller(), every = h.ctx.Config.markets.refreshMs, next = answers.rates.ILS.time_next_update_unix * 1000;
  h.c.setVisible(true, true);
  const cold = h.answer();
  const perRound = [];
  for (let i = 0; i < 3; i++) { h.t.advance(every); perRound.push(h.answer()); }
  assert.deepEqual(perRound, [2, 2, 2], 'only the two spark requests while the rates are current');
  assert.equal(rowOf(h.c.snapshot(), 'UAHperILS').price, 14.545465, 'the kept rate is still shown');
  assert.equal(h.c.snapshot().updatedAt, AT + 3 * every, 'the newest answer');
  h.c.setVisible(false);
  h.t.advance(next - h.t.now());
  h.c.setVisible(true, true);
  const afterUpdate = h.answer();
  assert.deepEqual([cold, afterUpdate], [4, 4], 'cold, and past the provider\'s next update: the rates are asked again');
  console.log('# markets requests per refresh: cold ' + cold + ', rates current ' + perRound.join('/') + ', after the provider\'s update ' + afterUpdate);
});

test('on view only: off view or with the page hidden nothing is asked; a rotation arrival waits for the 5-minute cadence', () => {
  const h = controller(), every = h.ctx.Config.markets.refreshMs;
  h.t.advance(60 * MIN);
  assert.equal(h.calls.length, 0, 'never before the screen is shown');
  h.c.setVisible(true, false);
  assert.equal(h.answer(), 4, 'the first arrival asks at once');
  h.c.setVisible(false);
  h.t.advance(every / 2);
  h.c.setVisible(true, false);
  assert.equal(h.calls.length, 0, 'back within 5 min by rotation: the data is fresh, nothing');
  h.c.setVisible(true, true);
  assert.equal(h.answer(), 2, 'an explicit ◀ ▶ open asks at once');
  h.c.setVisible(false);
  h.t.advance(10 * every);
  assert.equal(h.calls.length, 0, 'off view: nothing');
  h.c.setVisible(true, false);
  assert.equal(h.answer(), 2);
  h.hide();
  h.t.advance(10 * every);
  assert.equal(h.calls.length, 0, 'the TV hid the page: nothing');
});

test('a round that ends after the screen was left (or the page hidden) leaves no timer behind: nothing wakes off view', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.c.setVisible(false);
  h.answer();
  assert.deepEqual(h.t.pending(), [], 'left during the round');
  // FIX-BATCH-19 3 (P7, owner's order): the round left is cancelled — its late answers draw nothing (was: shown on return)
  assert.equal(h.c.snapshot(), null, 'a cancelled round\'s late answers are not taken');
  h.c.setVisible(true, true);
  h.hide();
  h.answer();
  assert.deepEqual(h.t.pending(), [], 'page hidden during the round');
});

test('failures: a row whose source never answered stays, with price null and no stale mark; all failed from the start → every price null, updatedAt 0', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer({ 'TRX-USD': 'timeout', 'latest/USD': 'http 503' });
  const s = h.c.snapshot();
  for (const id of ['TRX', 'CL=F', '^GSPC', 'UAHperUSD']) assert.deepEqual(plain(rowOf(s, id)), Object.assign({ id, price: null, currency: null, changePct: null, closed: id === 'UAHperUSD' ? null : false }, id === 'CL=F' ? { unit: 'barrel' } : {}), id);
  for (const id of ['BTC', 'INTU', 'TEVA.TA', 'UAHperILS']) assert.ok(rowOf(s, id).price > 0, id);
  for (const g of s.groups) assert.equal(g.rows.length, 6);
  h.c.setVisible(true, true);
  assert.equal(h.answer({ 'TRX-USD': 'network', 'latest/USD': 'timeout' }), 3, 'the rates of ILS are current, USD is asked again');
  for (const id of ['TRX', 'CL=F', 'UAHperUSD']) assert.deepEqual([rowOf(h.c.snapshot(), id).price, 'stale' in rowOf(h.c.snapshot(), id)], [null, false], 'still never had a value: ' + id);
  const fresh = controller();
  fresh.c.setVisible(true, true);
  fresh.answer({ 'spark?': 'timeout', 'latest/': 'network' });
  assert.equal(fresh.c.snapshot().updatedAt, 0, 'nothing came: no time');
  assert.ok(fresh.c.snapshot().groups.every((g) => g.rows.length === 6 && g.rows.every((r) => r.price === null && !('stale' in r))));
});

// Coordinator's decision 2026-11-02 (contract: the optional per-row `stale: true`, as weather and news keep their last good data).
test('stale: a row that had a good value keeps its last price and change, marked stale: true, while its source fails; the next good round clears it', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  const first = plain(h.c.snapshot());
  assert.ok(first.groups.every((g) => g.rows.every((r) => !('stale' in r))), 'fresh rows carry no stale mark');
  const was = (id) => rowOf(first, id);

  h.t.advance(MIN);
  h.c.setVisible(true, true);
  h.answer({ 'TRX-USD': 'timeout' });
  let s = plain(h.c.snapshot());
  for (const id of ['TRX', '^GSPC', '^VIX', 'CL=F']) assert.deepEqual(rowOf(s, id), Object.assign({}, was(id), { stale: true }), id);
  assert.ok(rowOf(s, 'TRX').price > 0 && rowOf(s, 'TRX').changePct !== null);
  for (const id of ['BTC', 'INTU', 'TEVA.TA', 'USDILS']) assert.deepEqual(rowOf(s, id), was(id), id + ' answered: fresh, no mark');
  assert.equal(s.updatedAt, AT + MIN, 'the newest answer');

  // A newer good value replaces the kept one: BTC answers 80,000 once, then its source fails.
  const moved = JSON.parse(JSON.stringify(answers.spark[0]));
  Object.assign(moved.spark.result.find((x) => x.symbol === 'BTC-USD').response[0].meta, { regularMarketPrice: 80000, regularMarketChangePercent: 2.5 });
  h.c.setVisible(true, true);
  h.answer({ 'USDILS%3DX': moved });
  assert.deepEqual([rowOf(h.c.snapshot(), 'BTC').price, 'stale' in rowOf(h.c.snapshot(), 'BTC')], [80000, false]);
  h.c.setVisible(true, true);
  h.answer({ 'USDILS%3DX': 'timeout' });
  assert.deepEqual(plain(rowOf(h.c.snapshot(), 'BTC')), Object.assign({}, was('BTC'), { price: 80000, changePct: 2.5, stale: true }), 'the LATEST good value, not the first');
  h.c.setVisible(true, true);
  h.answer();

  h.t.advance(MIN);
  h.c.setVisible(true, true);
  assert.equal(h.answer({ 'spark?': 'network' }), 2, 'the daily rates are current: only the two spark requests');
  s = plain(h.c.snapshot());
  for (const g of s.groups) for (const r of g.rows) {
    if (/per(ILS|USD)$/.test(r.id)) assert.ok(!('stale' in r) && r.price > 0, r.id + ': the kept daily rate is current, not stale');
    else assert.deepEqual(r, Object.assign({}, was(r.id), { stale: true }), r.id);
  }
  assert.equal(s.updatedAt, AT + MIN, 'every quote is stale: the time of the newest data shown, never a later one');

  h.t.advance(MIN);
  h.c.setVisible(true, true);
  h.answer();
  s = plain(h.c.snapshot());
  assert.ok(s.groups.every((g) => g.rows.every((r) => !('stale' in r) && r.price !== null)), 'a good round clears every mark');
  assert.equal(s.updatedAt, AT + 3 * MIN);

  h.c.setVisible(false);
  h.t.advance(answers.rates.ILS.time_next_update_unix * 1000 - h.t.now());
  h.c.setVisible(true, true);
  assert.equal(h.answer({ 'latest/': 'http 503' }), 4, 'past the provider\'s update the rates are asked again, and fail');
  s = plain(h.c.snapshot());
  assert.deepEqual(rowOf(s, 'UAHperILS'), { id: 'UAHperILS', price: 14.545465, currency: 'UAH', changePct: null, closed: null, stale: true });
  assert.deepEqual(rowOf(s, 'UAHperUSD'), { id: 'UAHperUSD', price: 45.436273, currency: 'UAH', changePct: null, closed: null, stale: true });
  assert.ok(!('stale' in rowOf(s, 'BTC')));
});

// ---- FIX-11B (the one fix round after the four reviewers) -----------------------------------------------------------
const rates = (base, patch) => Object.assign(JSON.parse(JSON.stringify(answers.rates[base])), patch || {});
const withRates = (base, table) => { const r = rates(base); r.rates = table; return r; };

// A1 [C1+X3]: a table is kept at least one refreshMs even when the provider names a past (or no) next update; a table that
// lacks a code the rows need (missing, null, ≤ 0) is a failed refresh of that base: asked again next round, never cached.
test('A1: a past or missing next-update never drops a fresh table: its rates are shown this round, asked again after refreshMs', () => {
  for (const patch of [{ time_next_update_unix: AT / 1000 - 3600 }, { time_next_update_unix: undefined }]) {
    const h = controller(), every = h.ctx.Config.markets.refreshMs;
    h.c.setVisible(true, true);
    h.answer({ 'latest/ILS': rates('ILS', patch), 'latest/USD': rates('USD', patch) });
    for (const id of ['UAHperILS', 'RUBperILS', 'UAHperUSD']) assert.ok(rowOf(h.c.snapshot(), id).price > 0, id + ' ' + JSON.stringify(patch));
    h.t.advance(every - 1);
    assert.equal(h.calls.length, 0);
    h.t.advance(1);
    assert.equal(h.answer(), 4, 'after refreshMs both bases are asked again');
  }
});

test('A1: an incomplete table ({USD: 1}; UAH or RUB null, missing or ≤ 0) is a failed refresh: rows keep their last good value, the base is asked again next round and recovers', () => {
  const h = controller(), every = h.ctx.Config.markets.refreshMs;
  h.c.setVisible(true, true);
  h.answer({ 'latest/USD': withRates('USD', { USD: 1 }), 'latest/ILS': withRates('ILS', Object.assign({}, answers.rates.ILS.rates, { RUB: null })) });
  assert.deepEqual([rowOf(h.c.snapshot(), 'UAHperUSD').price, rowOf(h.c.snapshot(), 'RUBperILS').price, rowOf(h.c.snapshot(), 'UAHperILS').price],
    [null, null, null], 'an incomplete table gives no rate at all (never a half table)');
  h.t.advance(every);
  assert.equal(h.answer(), 4, 'both incomplete bases are asked again');
  for (const id of ['UAHperUSD', 'RUBperILS', 'UAHperILS']) assert.ok(rowOf(h.c.snapshot(), id).price > 0, id + ' recovered');
  h.t.advance(every);
  assert.equal(h.answer(), 2, 'complete now: reused until the provider\'s update');
  for (const bad of [{ UAH: 0, RUB: 25 }, { RUB: 25 }, { UAH: -1, RUB: 25 }, { UAH: 'x', RUB: 25 }]) {
    const k = controller();
    k.c.setVisible(true, true);
    k.answer({ 'latest/ILS': withRates('ILS', bad) });
    k.t.advance(every);
    assert.equal(k.answer(), 3, 'ILS asked again after ' + JSON.stringify(bad));
  }
});

test('A1: a complete cached table is never replaced by an incomplete one: past the provider\'s update an incomplete answer keeps the last good rates (stale)', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  h.c.setVisible(false);
  h.t.advance(answers.rates.ILS.time_next_update_unix * 1000 - h.t.now());
  h.c.setVisible(true, true);
  assert.equal(h.answer({ 'latest/ILS': withRates('ILS', { UAH: 14.6 }) }), 4);
  assert.deepEqual(plain(rowOf(h.c.snapshot(), 'UAHperILS')).price, 14.545465, 'the complete table\'s value, kept');
  assert.equal(rowOf(h.c.snapshot(), 'UAHperILS').stale, true);
});

// A2 [C2+X2]: the time moves only when an answer gave at least one usable configured row; the controller says the kind.
test('A2: empty or unusable answers never advance updatedAt; the kind is failed with no price, stale with gaps or kept rows, else fresh', () => {
  const h = controller(), empty = { spark: { result: [], error: null } };
  assert.equal(h.c.state().kind, 'loading');
  h.c.setVisible(true, true);
  h.answer({ 'spark?': empty, 'latest/': 'network' });
  assert.deepEqual([h.c.state().kind, h.c.snapshot().updatedAt], ['failed', 0], 'nothing usable: no time, failed');
  h.c.setVisible(true, true);
  const unknown = JSON.parse(JSON.stringify(answers.spark[0]));
  unknown.spark.result = [Object.assign(unknown.spark.result[0], { symbol: 'NOT-CONFIGURED' })];
  h.answer({ 'spark?': unknown, 'latest/': 'network' });
  assert.deepEqual([h.c.state().kind, h.c.snapshot().updatedAt], ['failed', 0], 'an unknown symbol is not data');
  h.t.advance(MIN);
  h.c.setVisible(true, true);
  h.answer();
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['fresh', AT + MIN]);
  h.t.advance(MIN);
  h.c.setVisible(true, true);
  h.answer({ 'spark?': empty });
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['stale', AT + MIN], 'an empty round keeps the last good time');
  const gaps = controller();
  gaps.c.setVisible(true, true);
  gaps.answer({ 'TRX-USD': 'timeout' });
  assert.equal(gaps.c.state().kind, 'stale', 'rows without a price next to priced ones: stale, never fresh');
});

// A3 [C3]: a render that throws never stops the refreshes.
test('A3: an onChange that throws never stops the cadence: the next round still comes after refreshMs', () => {
  const ctx = load(FILES), t = fakeTimers(AT), calls = [];
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => { throw new Error('render failed'); }, getJson: (url, ms, done) => calls.push({ url, done }) });
  c.setVisible(true, true);
  const open = calls.splice(0);
  for (const call of open) {
    const base = /latest\/([A-Z]{3})$/.exec(call.url);
    try { call.done(null, base ? answers.rates[base[1]] : answers.spark[call.url.includes('TRX-USD') ? 1 : 0]); } catch (e) { /* the render's own error */ }
  }
  assert.deepEqual(t.pending(), [ctx.Config.markets.refreshMs], 'the next round is scheduled');
  t.advance(ctx.Config.markets.refreshMs);
  assert.equal(calls.length, 2, 'and sent');
});

// A6 [X4] + A7 [X5]: closed is a function of the session and NOW, for kept rows too; only a 24-hour session's 23:59 end
// has its last minute; an equity closes at its end.
test('A6: a kept (stale) row recomputes closed at the current time: a failure round past the session end shows it closed', () => {
  const h = controller({ start: Date.parse('2026-11-02T20:58:00Z') });
  h.c.setVisible(true, true);
  h.answer();
  assert.equal(rowOf(h.c.snapshot(), 'INTU').closed, false, 'two minutes before New York closes');
  h.t.advance(5 * MIN);
  h.c.setVisible(true, true);
  h.answer({ 'USDILS%3DX': 'timeout' });
  assert.deepEqual([rowOf(h.c.snapshot(), 'INTU').stale, rowOf(h.c.snapshot(), 'INTU').closed], [true, true], 'kept, and closed since 21:00');
});

test('A7: an equity closes exactly at its session end; a 24-hour session (23:59 end) keeps its last minute', () => {
  const ctx = load(FILES), at = (iso) => recordedSnapshot(ctx, Date.parse(iso));
  assert.equal(rowOf(at('2026-11-02T20:59:59Z'), 'INTU').closed, false);
  assert.equal(rowOf(at('2026-11-02T21:00:00Z'), 'INTU').closed, true, 'INTU closes at 21:00:00, not 21:01');
  assert.equal(rowOf(at('2026-11-02T21:00:30Z'), '^DJI').closed, true);
  assert.equal(rowOf(at('2026-11-02T23:59:30Z'), 'BTC').closed, false, 'crypto: 23:59 is its last minute');
  assert.equal(rowOf(at('2026-11-03T04:59:30Z'), 'BZ=F').closed, false, 'a future\'s 23:59 New York end: its last minute');
  assert.equal(rowOf(at('2026-11-03T00:00:00Z'), 'BTC').closed, true, 'after the last minute of the recorded session');
});

// A9 [P1]: the quotes are shown as soon as every spark answer is in, with the rate tables already current; the round
// publishes again when it ends. A round with nothing but spark requests publishes once.
test('A9: a cold round publishes when the quotes are in (rates still pending), then once more at the end; a warm round once', () => {
  const h = controller();
  h.c.setVisible(true, true);
  const spark = h.calls.filter((c) => c.url.includes('spark')), rest = h.calls.filter((c) => !c.url.includes('spark'));
  spark.forEach((call) => call.done(null, answers.spark[call.url.includes('TRX-USD') ? 1 : 0]));
  assert.equal(h.snaps.length, 1, 'published with the quotes, the rates still out');
  assert.ok(rowOf(h.snaps[0], 'INTU').price > 0);
  assert.equal(rowOf(h.snaps[0], 'UAHperILS').price, null);
  rest.forEach((call) => call.done(null, answers.rates[/latest\/([A-Z]{3})$/.exec(call.url)[1]]));
  h.calls.length = 0;
  assert.equal(h.snaps.length, 2);
  assert.ok(rowOf(h.snaps[1], 'UAHperILS').price > 0);
  h.t.advance(h.ctx.Config.markets.refreshMs);
  assert.equal(h.answer(), 2);
  assert.equal(h.snaps.length, 3, 'warm: one publish');
});

// A11 [C11]: markets ages like every other source.
test('A11: Config.markets.staleAfterMs exists (as weather, news and the alerts history have); older data is stale without a failure', () => {
  const h = controller(), cfg = h.ctx.Config.markets;
  assert.ok(cfg.staleAfterMs > cfg.refreshMs, String(cfg.staleAfterMs));
  h.c.setVisible(true, true);
  h.answer();
  h.c.setVisible(false);
  h.t.advance(cfg.staleAfterMs);
  assert.equal(h.c.state().kind, 'fresh');
  h.t.advance(1);
  assert.equal(h.c.state().kind, 'stale');
});

// A12 [C12]: the daily rate tables have no trading hours: their rows carry closed: null, so a card's closed mark is
// decided by its quotes only.
test('A12: rows from the daily rate tables carry closed: null (no trading hours); quote rows a boolean', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  for (const id of ['UAHperILS', 'RUBperILS', 'UAHperUSD']) assert.equal(rowOf(s, id).closed, null, id);
  for (const id of ['USDILS', 'EURUSD', 'INTU', 'BTC']) assert.equal(typeof rowOf(s, id).closed, 'boolean', id);
});

// ---- Batch 16 ---------------------------------------------------------------------------------------------------------
// Codex A2: the closed mark follows the clock between rounds — recomputed on state() (the minute tick) from each quote's last
// session, with no request; the snapshot object changes only when a mark does.
test('A2: INTU answered at 20:59 UTC reads open; at 21:01 (no new request) it reads closed; an unchanged minute keeps the snapshot', () => {
  const END = 1793653200 * 1000;                     // the recorded INTU session's end
  const h = controller({ start: END - 60000 });
  h.c.setVisible(true, true);
  h.answer();
  assert.equal(rowOf(h.c.state().snapshot, 'INTU').closed, false);
  const sent = h.calls.length, before = h.c.state().snapshot;
  assert.equal(h.c.state().snapshot, before, 'the same minute: the same object (nothing redrawn)');
  h.t.advance(120000);
  const after = h.c.state().snapshot;
  assert.equal(rowOf(after, 'INTU').closed, true, 'closed at 21:01 without a round');
  assert.equal(h.calls.length, sent, 'no request for it');
  assert.notEqual(after, before, 'a changed mark: a new snapshot (the view redraws)');
  assert.equal(h.c.state().snapshot, after, '… once');
  assert.equal(rowOf(after, 'BTC').closed, rowOf(before, 'BTC').closed, 'a 24-hour market untouched');
});
// C-2: the one freshness rule — quotes dated after the clock (it went back) are stale.
test('C-2: a clock that went back makes the quotes stale', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  assert.equal(h.c.state().kind, 'fresh');
  h.t.advance(-60 * 60000);
  assert.equal(h.c.state().kind, 'stale');
});
// Codex L1: a commodity row carries its unit — priced, kept stale, or never priced.
test('L1: every commodity row says what its price is for (barrel, MMBtu, troy ounce, pound), stale rows too', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  const units = (s) => plain(s.groups.find((g) => g.id === 'commodities').rows.map((r) => r.unit));
  assert.deepEqual(units(h.c.snapshot()), ['barrel', 'mmbtu', 'ounce', 'ounce', 'pound', 'barrel']);
  h.t.advance(h.ctx.Config.markets.refreshMs);
  h.answer({ 'spark?': 'timeout' });
  assert.ok(rowOf(h.c.snapshot(), 'GC=F').stale, 'kept from the last round');
  assert.deepEqual(units(h.c.snapshot()), ['barrel', 'mmbtu', 'ounce', 'ounce', 'pound', 'barrel'], 'the unit kept with it');
  for (const g of h.c.snapshot().groups) if (g.id !== 'commodities') assert.ok(g.rows.every((r) => !('unit' in r)), g.id + ': no unit');
});
// C-19: an unreadable answer is said through deps.log, its rows stay empty.
test('C-19: an unreadable markets answer is logged with its message', () => {
  const ctx = load(FILES), t = fakeTimers(AT), calls = [], logs = [];
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => {}, getJson: (url, ms, done) => calls.push(done), log: (m) => logs.push(m) });
  c.setVisible(true, true);
  for (const done of calls.splice(0)) done(null, { nope: 1 });
  assert.deepEqual(logs.slice(0, 2), ['markets: unexpected spark shape', 'markets: unexpected spark shape']);
  assert.equal(c.state().kind, 'failed');
});

// N2 (FIX-BATCH-18 part B): Markets.snapshot is a public pure function and keeps its own guard — a rate of 0 or below is no
// price (an empty row), whatever table it is handed; keep() refuses such a table for the controller (A1 above).
test('N2: snapshot() turns a rate ≤ 0 into an empty row (its own guard, not only keep()\'s)', () => {
  const ctx = load(FILES), cfg = ctx.Config.markets;
  const s = ctx.Markets.snapshot(cfg, { quotes: {}, tables: { ILS: { UAH: 0, RUB: -25.6, USD: 0.27 } }, updatedAt: AT }, AT);
  for (const id of ['UAHperILS', 'RUBperILS']) assert.equal(rowOf(s, id).price, null, id + ': no price');
  assert.ok(rowOf(s, 'UAHperUSD').price === null, 'no USD table: no price');
});

// FIX-BATCH-19 3 (P7, NEXT-BATCH: «abort the XHR on leave»): leaving the screen (or the TV hiding the page) during a round
// aborts every request still in flight; a late answer draws nothing; the attempt is forgotten, so coming back (even by the
// rotation) asks again at once.
test('B19 P7: leave during a round → every pending request aborted, no late render; back on view → asked again at once', () => {
  const ctx = load(FILES), t = fakeTimers(AT), calls = [], snaps = [];
  let visible = true;
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: (s) => snaps.push(s),
    getJson: (url, ms, done) => { const x = { url, done, aborted: false, abort() { this.aborted = true; } }; calls.push(x); return x; } });
  c.setVisible(true, true);
  assert.equal(calls.length, 4, 'a round: 4 requests');
  c.setVisible(false);
  assert.deepEqual(calls.map((x) => x.aborted), [true, true, true, true], 'left: every pending request aborted');
  for (const x of calls) x.done(null, /latest/.test(x.url) ? answers.rates[/latest\/([A-Z]{3})$/.exec(x.url)[1]] : answers.spark[0]);
  assert.deepEqual([snaps.length, c.snapshot()], [0, null], 'the late answers draw nothing');
  t.advance(MIN);
  c.setVisible(true, false);   // the rotation brings the screen back a minute later
  assert.equal(calls.length, 8, 'the aborted attempt is forgotten: asked again at once');
  visible = false; c.visibilityChanged();
  assert.ok(calls.slice(4).every((x) => x.aborted), 'the TV hid the page: aborted too');
});

// FIX-BATCH-19 4 (P10): «Обновлено» says when the data were made, not when a cached copy reached the TV — the answer's
// Date − Age (Net.getJsonDated): a copy made 5 minutes ago reads 5 minutes ago; a time after the arrival (a clock ahead) reads
// the arrival; older than httpAgeMaxMs reads that bound; no such header: the arrival, as before.
test('B19 P10: updatedAt is the data\'s own time (Date − Age), bounded by the arrival and httpAgeMaxMs', () => {
  const at = (meta) => {
    const ctx = load(FILES), t = fakeTimers(AT), calls = [];
    const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
      onChange: () => {}, getJson: (url, ms, done) => calls.push({ url, done }) });
    c.setVisible(true, true);
    for (const x of calls) x.done(null, /latest/.test(x.url) ? answers.rates[/latest\/([A-Z]{3})$/.exec(x.url)[1]] : answers.spark[x.url.includes('TRX-USD') ? 1 : 0], meta);
    return c.snapshot().updatedAt - AT;
  };
  assert.equal(at({ dataAt: AT - 5 * MIN }), -5 * MIN, 'a cached copy made 5 minutes ago');
  assert.equal(at({ dataAt: AT + MIN }), 0, 'a Date after the arrival: the arrival');
  assert.equal(at({ dataAt: AT - 3 * 60 * MIN }), -60 * MIN, 'older than httpAgeMaxMs: the bound');
  assert.equal(at(undefined), 0, 'no header: the arrival');
  assert.equal(at({ dataAt: NaN }), 0, 'unreadable: the arrival');
});

// FIX-19B, the P7 decision (perf R19-P2: aborting every left round starved the screen on a slow network): left once an answer
// has come, the round is not aborted — it ends in the background and its snapshot is on screen at the return; the rotation back
// within refreshMs asks nothing more (4 requests in all). The TV hiding the page still aborts all.
test('FIX-19B P7: left after the first answer → not aborted, the round ends in the background, the return shows it (4 requests)', () => {
  const ctx = load(FILES), t = fakeTimers(AT), calls = [];
  let visible = true;
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: () => {},
    getJson: (url, ms, done) => { const x = { url, done, aborted: false, abort() { this.aborted = true; } }; calls.push(x); return x; } });
  const reply = (x) => x.done(null, /latest/.test(x.url) ? answers.rates[/latest\/([A-Z]{3})$/.exec(x.url)[1]] : answers.spark[x.url.includes('TRX-USD') ? 1 : 0]);
  c.setVisible(true, true);
  reply(calls[0]);                                   // one spark answer has come
  c.setVisible(false);
  assert.ok(calls.every((x) => !x.aborted), 'left with an answer in: nothing aborted');
  calls.slice(1).forEach(reply);
  assert.deepEqual(t.pending(), [], 'no timer off view');
  t.advance(MIN);
  c.setVisible(true, false);
  assert.equal(calls.length, 4, 'the rotation back asks nothing more');
  assert.ok(c.snapshot().groups.some((g) => g.rows.some((r) => r.price !== null)), 'the round\'s prices are there');
  c.setVisible(true, true);                          // an explicit open asks (the 2 spark: the rates are current); the TV hides the page during it
  assert.equal(calls.length, 6);
  reply(calls[4]);
  visible = false; c.visibilityChanged();
  assert.ok(calls.slice(5).every((x) => x.aborted), 'hidden: every request still open aborted, answers in or not');
});
