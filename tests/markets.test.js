'use strict';
// Batch 11 (Markets screen, data side): the symbol lists in js/config.js `markets` checked against the market-cap ranking
// recorded on 2026-11-02 (tests/fixtures/markets/ranking.json); the Yahoo spark answers recorded the same morning (spark-1/2.json)
// parsed into the MarketsSnapshot contract. Batch 23 (owner 2026-11-04: «крипту на Coinbase», «я хочу все валюты обновляться
// быстрее», «TRX заменить, процент к полуночи, 24 часа ок»): crypto and every currency from Coinbase, answers recorded
// 2026-11-04 07:22 UTC (tests/fixtures/markets/coinbase: each product's Exchange stats, TRX-USD's NotFound, the dollar
// table), refreshed every minute on view; Yahoo (shares, indices, commodities) stays at 5 minutes; a 429 holds back only
// its own host. Batch 26 (the owner's «да - исправляй» and «все проценты должны считаться одинаково», 2026-11-05; it replaces
// batch 23C's first table of the Israel day and the coins' «24 hours earlier»): the currencies' and the coins' change is against
// Coinbase's price at 00:00 UTC of the previous UTC date (dated spots recorded 2026-11-05), asked with the rates table once per
// UTC day, kept on the TV, said on both cards as that date at home. Codex C3, native N2 pinned below.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/tz.js', 'js/net.js', 'js/config.js', 'js/onview.js', 'js/markets.js'];
const DIR = path.join(__dirname, 'fixtures', 'markets');
const recorded = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const AT = 1793610586 * 1000;                     // 2026-11-02 08:57 UTC: the spark answers were recorded; TASE open, US closed
const MIN = 60000;
const PRODUCTS = ['BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'SOL-USD', 'ZEC-USD'];

const SPARK = ['spark-1', 'spark-2'].flatMap((f) => recorded(f).spark.result);
const STATS = Object.fromEntries(PRODUCTS.concat('TRX-USD').map((p) => [p, recorded('coinbase/stats-' + p)]));
const RATES = recorded('coinbase/exchange-rates-USD');
const CODES = ['USD', 'ILS', 'EUR', 'UAH', 'RUB'];
// A recorded spark answer for exactly the symbols a request asks for (the app's batches differ from the recorded ones).
const sparkFor = (symbols) => ({ spark: { result: SPARK.filter((r) => symbols.includes(r.symbol)), error: null } });
const symbolsOf = (url) => decodeURIComponent(new URL(url).searchParams.get('symbols')).split(',');
const kindOf = (url) => (url.includes('finance.yahoo.com') ? 'yahoo' : url.includes('api.exchange.coinbase.com') ? 'stats'
  : url.includes('api.coinbase.com/v2/exchange-rates') ? 'rates' : url.includes('api.coinbase.com/v2/prices/') ? 'spot' : 'other');
const productOf = (url) => decodeURIComponent(/products\/([^/]+)\/stats/.exec(url)[1]);
// A basis table (made up, round numbers) — the recorded table is measured against it where a test only needs a basis there.
const BASIS = { USD: 1, ILS: 3.15, EUR: 0.89, UAH: 45.4, RUB: 81.5 };
// The coins' basis prices where a test only needs one (made up, round numbers), and BASIS as the currencies' pair prices.
const CRYPTO_BASIS = { 'BTC-USD': 76000, 'ETH-USD': 2200, 'BNB-USD': 690, 'XRP-USD': 1.2, 'SOL-USD': 90, 'ZEC-USD': 1100 };
const BASIS_PRICES = Object.assign({ 'USD-ILS': 3.15, 'USD-EUR': 0.89, 'USD-UAH': 45.4, 'USD-RUB': 81.5 }, CRYPTO_BASIS);
// Every currency row's exact change: the recorded table (2026-11-04 07:22 UTC) against BASIS, from the same crosses.
const FX_PCT = { USDILS: 0.5199206349206342, EURILS: 0.4588881214512952, UAHperILS: -0.3082204825170187, RUBperILS: -0.11708367189144919,
  EURUSD: -0.060716834119889374, UAHperUSD: 0.2100976505139629 };
const FX_IDS = Object.keys(FX_PCT);
// The recorded answer to one request: [error, body]; a product Coinbase does not trade answers 404 (TRX-USD); a dated spot the
// recording of that pair (or of every asset: USD) and date (tests/fixtures/markets/coinbase/spot-<PAIR|USD>-<date>.json), else 404.
function recordedAnswer(url) {
  const k = kindOf(url);
  if (k === 'yahoo') return [null, sparkFor(symbolsOf(url))];
  if (k === 'stats') return STATS[productOf(url)] && !STATS[productOf(url)].message ? [null, STATS[productOf(url)]] : ['http 404'];
  if (k === 'rates') return [null, RATES];
  if (k === 'spot') {
    const m = /\/prices\/([A-Z]+(?:-[A-Z]{3})?)\/spot\?date=(\d{4}-\d\d-\d\d)$/.exec(url), file = m && path.join(DIR, 'coinbase', 'spot-' + m[1] + '-' + m[2] + '.json');
    return file && fs.existsSync(file) ? [null, JSON.parse(fs.readFileSync(file, 'utf8'))] : ['http 404'];
  }
  throw new Error('unexpected request ' + url);
}
// A dollar table in Coinbase's answer shape (strings).
const ratesAnswer = (table) => ({ data: { currency: 'USD', rates: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, String(v)])) } });
// A localStorage stand-in.
function memoryStorage(entries) { const m = new Map(entries || []); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
const KEY = 'markets.fxBasis.v2';
// A kept basis: BASIS and CRYPTO_BASIS as the prices of the previous UTC date of `ms` (the current D: no basis request).
const basisRecord = (ms) => ({ date: new Date(ms - 86400000).toISOString().slice(0, 10), prices: BASIS_PRICES });

// The snapshot of the recorded answers as the app would build it at `now` (every request succeeded; basis { rates, crypto }:
// none unless given).
function recordedSnapshot(ctx, now, basis) {
  const quotes = ctx.Markets.quotes(sparkFor(SPARK.map((r) => r.symbol)));
  const stats = Object.fromEntries(PRODUCTS.map((p) => [p, ctx.Markets.stats(STATS[p])]));
  return ctx.Markets.snapshot(ctx.Config.markets, { quotes, stats, rates: ctx.Markets.rateTable(RATES, CODES), basis: basis || null, updatedAt: now }, now);
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
  // batch 23: a row is exactly one of a Yahoo symbol, a Coinbase product, a Coinbase rate
  for (const r of m.groups.flatMap((g) => g.rows)) assert.equal([!!r.yahoo, !!r.product, !!(r.base && r.code)].filter(Boolean).length, 1, r.id);
  assert.ok(m.groups[0].rows.every((r) => r.base && r.code), 'every currency from Coinbase\'s table (owner 2026-11-04: «все валюты»)');
  assert.ok(m.groups[3].rows.every((r) => r.product), 'every coin from Coinbase');
});

test('batch 23: every currency the fx rows read is in the recorded Coinbase dollar table, as a number > 0', () => {
  const ctx = load(FILES), rates = RATES.data.rates;
  assert.equal(RATES.data.currency, 'USD');
  for (const r of ctx.Config.markets.groups[0].rows) for (const c of [r.base, r.code]) assert.ok(Number(rates[c]) > 0, r.id + ': ' + c + ' = ' + rates[c]);
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

// Batch 23 (owner 2026-11-04: «TRX заменить»): the rule now also skips tokenized assets and a coin Coinbase does not trade —
// TRX-USD answered NotFound (recorded) — so ZEC (rank 10) is the sixth.
test('config: crypto = the six largest by market cap without stablecoins, tokenized assets and coins Coinbase does not trade: ZEC replaces TRX', () => {
  const crypto = plain(load(FILES).Config.markets).groups[3].rows;
  const rank = recorded('ranking').crypto, notOnCoinbase = new Set(['TRX']);
  assert.deepEqual(STATS['TRX-USD'], { message: 'NotFound' }, 'the recorded answer that rules TRX out');
  const eligible = rank.filter((c) => !c.stablecoin && !c.tokenizedAsset && !notOnCoinbase.has(c.symbol));
  assert.deepEqual(crypto.map((r) => r.id), eligible.slice(0, 6).map((c) => c.symbol));
  assert.deepEqual(crypto.map((r) => r.id), ['BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'ZEC']);
  for (const r of crypto) {
    assert.equal(r.product, r.id + '-USD', 'priced in US dollars');
    assert.ok(Number(STATS[r.product].last) > 0, r.id + ' answers on Coinbase');
  }
  assert.ok(rank.some((c) => c.stablecoin) && rank.some((c) => c.tokenizedAsset), 'the ranking does hold stablecoins and a tokenized asset');
});

test('requests: Yahoo — the 24 remaining symbols in 2 spark requests (≤ 20 each); Coinbase — one stats per coin (6) + one rates table', () => {
  const ctx = load(FILES), p = plain(ctx.Markets.plan(ctx.Config.markets));
  assert.equal(p.spark.length, 2);
  const symbols = p.spark.map(symbolsOf);
  assert.deepEqual(symbols.map((s) => s.length), [20, 4]);
  assert.deepEqual(symbols.flat(), plain(ctx.Config.markets).groups.flatMap((g) => g.rows.filter((r) => r.yahoo).map((r) => r.yahoo)));
  assert.ok(!symbols.flat().some((s) => /=X$|-USD$/.test(s)), 'no currency and no coin is asked from Yahoo any more');
  assert.deepEqual(p.stats, PRODUCTS.map((product) => ({ product, url: 'https://api.exchange.coinbase.com/products/' + product + '/stats' })));
  assert.equal(p.rates, 'https://api.coinbase.com/v2/exchange-rates?currency=USD');
});

test('TASE prices: Yahoo\'s agorot (ILA) divided by 100 into shekels; the currency becomes ILS', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.deepEqual(plain(rowOf(s, 'TEVA.TA')), { id: 'TEVA.TA', price: 130.1, currency: 'ILS', changePct: 1.641, closed: false });
  assert.equal(rowOf(s, 'ESLT.TA').price, 2482.7);
  for (const r of s.groups[2].rows) assert.ok(r.currency === 'ILS' && r.price > 5 && r.price < 5000, r.id + ' ' + r.price);
});

test('B26: crypto from Coinbase stats — price = last; the change against the basis\'s coin price (none without one); USD; never closed', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT), b = recordedSnapshot(ctx, AT, { rates: null, prices: NOV3_CRYPTO });
  const price = { BTC: 78015.4, ETH: 2298.24, BNB: 700.02, XRP: 1.2727, SOL: 92.91, ZEC: 1272.19 };
  for (const [id, p] of Object.entries(price)) {
    assert.deepEqual(plain(rowOf(s, id)), { id, price: p, currency: 'USD', changePct: null, closed: false }, id + ': no basis, no change (never «24 hours earlier» any more)');
    assert.deepEqual(plain(rowOf(b, id)), { id, price: p, currency: 'USD', changePct: NOV3_CRYPTO_PCT[id], closed: false }, id + ': against D 00:00 UTC');
  }
  const one = recordedSnapshot(ctx, AT, { rates: null, prices: { 'BTC-USD': NOV3_CRYPTO['BTC-USD'] } });
  assert.deepEqual(COIN_IDS.map((id) => rowOf(one, id).changePct), [NOV3_CRYPTO_PCT.BTC, null, null, null, null, null], 'each coin its own');
  // N-2: a basis without coin prices (the currencies' table alone) never throws — coinAt() guards like cross()
  const fiatOnly = recordedSnapshot(ctx, AT, { rates: BASIS });
  assert.deepEqual([COIN_IDS.map((id) => rowOf(fiatOnly, id).changePct), rowOf(fiatOnly, 'USDILS').changePct], [[null, null, null, null, null, null], FX_PCT.USDILS]);
});

test('batch 23: currencies from Coinbase\'s one dollar table — X per Y = rates[X] / rates[Y], exact; no hours (closed null); no change without a basis', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  const want = { USDILS: [3.1663775, 'ILS'], EURILS: [3.5555673885682197, 'ILS'], UAHperILS: [14.368275524107071, 'UAH'],
    RUBperILS: [25.84272279600269, 'RUB'], EURUSD: [1.122913293998653, 'USD'], UAHperUSD: [45.495384333333334, 'UAH'] };
  for (const [id, [price, currency]] of Object.entries(want)) assert.deepEqual(plain(rowOf(s, id)), { id, price, currency, changePct: null, closed: null }, id);
  // the cross is consistent: (₴ per $) / (₴ per ₪) = ₪ per $; € per $ inverse
  assert.ok(Math.abs(rowOf(s, 'UAHperUSD').price / rowOf(s, 'UAHperILS').price - rowOf(s, 'USDILS').price) < 1e-12);
  assert.ok(Math.abs(rowOf(s, 'EURILS').price / rowOf(s, 'USDILS').price - rowOf(s, 'EURUSD').price) < 1e-12);
  // with a basis (an earlier table of the day): each change exact, from the same cross
  const b = recordedSnapshot(ctx, AT, { rates: BASIS, prices: {} });
  for (const [id, pct] of Object.entries(FX_PCT)) assert.equal(rowOf(b, id).changePct, pct, id);
});

test('batch 23: stats() and rateTable() refuse what is not a usable answer (never half a table, never a NotFound priced)', () => {
  const ctx = load(FILES);
  assert.throws(() => ctx.Markets.stats(STATS['TRX-USD']), /stats/);
  for (const bad of [null, {}, { last: '0' }, { last: '-1' }, { last: 'x' }, { last: true }, { open: '2' }]) assert.throws(() => ctx.Markets.stats(bad), /stats/, JSON.stringify(bad));
  assert.deepEqual(plain(ctx.Markets.stats(STATS['BTC-USD'])), { last: 78015.4 }, 'only the last trade is read');
  assert.throws(() => ctx.Markets.rateTable({ data: { currency: 'EUR', rates: RATES.data.rates } }, CODES), /rates/, 'another base');
  assert.throws(() => ctx.Markets.rateTable({ errors: [{ id: 'not_found' }] }, CODES), /rates/);
  const noRub = JSON.parse(JSON.stringify(RATES)); delete noRub.data.rates.RUB;
  assert.throws(() => ctx.Markets.rateTable(noRub, CODES), /no rate for RUB/);
  for (const v of ['0', '-3', 'x', null]) {
    const bad = JSON.parse(JSON.stringify(RATES)); bad.data.rates.UAH = v;
    assert.throws(() => ctx.Markets.rateTable(bad, CODES), /no rate for UAH/, String(v));
  }
  assert.deepEqual(plain(ctx.Markets.rateTable(RATES, CODES)), { USD: 1, ILS: 3.1663775, EUR: 0.890540708124522, UAH: 45.495384333333334, RUB: 81.827816 });
});

test('day change % of a quote: the source\'s own figure, never recomputed', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.equal(rowOf(s, 'INTU').changePct, 2.989);
  const noChange = sparkFor(['INTU']);
  noChange.spark.result = JSON.parse(JSON.stringify(noChange.spark.result));
  delete noChange.spark.result[0].response[0].meta.regularMarketChangePercent;
  const snap = ctx.Markets.snapshot(ctx.Config.markets, { quotes: ctx.Markets.quotes(noChange), stats: {}, rates: null, basis: null, updatedAt: AT }, AT);
  assert.deepEqual([rowOf(snap, 'INTU').price, rowOf(snap, 'INTU').changePct], [341.09, null], 'no figure from the source: null');
});

test('closed market: outside Yahoo\'s regular session the last close is shown, marked closed', () => {
  const ctx = load(FILES);
  const before = recordedSnapshot(ctx, AT);                         // 08:57 UTC Monday: New York opens at 14:30 UTC
  assert.deepEqual(plain(rowOf(before, 'INTU')), { id: 'INTU', price: 341.09, currency: 'USD', changePct: 2.989, closed: true });
  assert.equal(rowOf(before, '^GSPC').closed, true);
  assert.equal(rowOf(before, 'TEVA.TA').closed, false, 'TASE trades');
  const usOpen = recordedSnapshot(ctx, Date.parse('2026-11-02T15:00:00Z'));
  assert.deepEqual([rowOf(usOpen, 'INTU').closed, rowOf(usOpen, 'TEVA.TA').closed], [false, false]);
  const evening = recordedSnapshot(ctx, Date.parse('2026-11-02T21:30:00Z'));
  assert.deepEqual([rowOf(evening, 'INTU').closed, rowOf(evening, 'TEVA.TA').closed], [true, true]);
  for (const id of ['BTC', 'ZEC']) assert.equal(rowOf(evening, id).closed, false, id + ': crypto trades around the clock');
});

test('an index is a value in points, not money: currency null (^VIX, ^GSPC); commodities and crypto in dollars', () => {
  const ctx = load(FILES), s = recordedSnapshot(ctx, AT);
  assert.deepEqual(plain(rowOf(s, '^VIX')), { id: '^VIX', price: 19.1, currency: null, changePct: -1.649, closed: false });
  for (const r of s.groups[4].rows) assert.ok(r.currency === null && r.price > 0, r.id);
  for (const g of [s.groups[3], s.groups[5]]) for (const r of g.rows) assert.ok(r.currency === 'USD' && r.price > 0, r.id);
  for (const g of s.groups) assert.equal(g.rows.length, 6, g.id);
});

test('a failed row stays, with price null: a symbol missing from the answer, a coin without stats, a missing rate', () => {
  const ctx = load(FILES), cfg = ctx.Config.markets;
  const partial = sparkFor(SPARK.map((r) => r.symbol).filter((s) => s !== 'INTU'));
  partial.spark.result = JSON.parse(JSON.stringify(partial.spark.result));
  partial.spark.result.find((x) => x.symbol === 'AAPL').response[0].meta.regularMarketPrice = null;
  const s = ctx.Markets.snapshot(cfg, { quotes: ctx.Markets.quotes(partial), stats: { 'BTC-USD': { last: 78000 } },
    rates: { USD: 1, ILS: 3.2 }, basis: null, updatedAt: AT }, AT);
  const UNIT = { 'BZ=F': 'barrel', 'CL=F': 'barrel' };   // Codex L1: a commodity row carries its unit, priced or not
  const empty = (id, closed) => Object.assign({ id, price: null, currency: null, changePct: null, closed }, UNIT[id] ? { unit: UNIT[id] } : {});
  for (const id of ['INTU', 'AAPL', 'ETH', 'ZEC']) assert.deepEqual(plain(rowOf(s, id)), empty(id, false), id);
  for (const id of ['EURILS', 'UAHperILS', 'RUBperILS', 'EURUSD', 'UAHperUSD']) assert.deepEqual(plain(rowOf(s, id)), empty(id, null), id);
  assert.equal(rowOf(s, 'USDILS').price, 3.2);
  assert.equal(rowOf(s, 'BTC').price, 78000);
  for (const g of s.groups) assert.equal(g.rows.length, 6, 'no row dropped in ' + g.id);
  for (const bad of [{}, '<html>', { spark: { result: null, error: { code: 'Bad Request' } } }]) assert.throws(() => ctx.Markets.quotes(bad), /spark/);
});

// ---- the controller: two sources, each on view only, on its own cadence ------------------------------------------------
// opts: { start, storage (default: one holding BASIS as the basis of the start's D; null: none), wallAt (false: none; a
// function: that home clock),
// intl (undefined: remove Intl) }. answer(fail): answers every open request — by URL part → an error label (a string),
// { error, retryAfter } (a refusal with its header) or another body (an object); otherwise the recorded answer.
function controller(opts = {}) {
  const ctx = 'intl' in opts ? load(FILES, { Intl: opts.intl }) : load(FILES), t = fakeTimers(opts.start || AT), calls = [], snaps = [], logs = [];
  let visible = true;
  const home = ctx.Tz.resolve(ctx.Config.clocks[0], t.now());
  const storage = 'storage' in opts ? opts.storage : memoryStorage([[KEY, JSON.stringify(basisRecord(t.now()))]]);
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    documentVisible: () => visible, onChange: (s) => snaps.push(s), log: (m) => logs.push(m), storage,
    wallAt: opts.wallAt === false ? undefined : typeof opts.wallAt === 'function' ? opts.wallAt : (ms) => ctx.Tz.wallTime(home, ms),
    getJson: (url, ms, done) => { const x = { url, ms, done, aborted: false, abort() { this.aborted = true; } }; calls.push(x); return x; } });
  const reply = (call, fail) => {
    const key = fail && Object.keys(fail).find((k) => call.url.includes(k));
    if (key) {
      const f = fail[key];
      if (typeof f === 'string') call.done(f, undefined, { retryAfter: '' });
      else if (f && f.error) call.done(f.error, undefined, { retryAfter: f.retryAfter || '' });
      else call.done(null, f);
      return;
    }
    const [err, body] = recordedAnswer(call.url);
    call.done(err, body, err ? { retryAfter: '' } : undefined);
  };
  const answer = (fail) => { const open = calls.splice(0, calls.length); for (const call of open) reply(call, fail); return open.length; };
  // the open requests by kind: { yahoo, stats, rates, spot (only when asked) }
  const count = () => { const n = { yahoo: 0, stats: 0, rates: 0 }; for (const x of calls) n[kindOf(x.url)] = (n[kindOf(x.url)] || 0) + 1; return n; };
  return { ctx, t, c, calls, snaps, logs, storage, answer, reply, count, hide: () => { visible = false; c.visibilityChanged(); } };
}
const STATS_HOST = 'api.exchange.coinbase.com', RATES_HOST = 'v2/exchange-rates';
const fxGroup = (snap) => snap.groups.find((g) => g.id === 'fx');

test('requests per round: cold = 2 Yahoo + 6 Coinbase stats + 1 Coinbase rates, all at once, each with the 15 s timeout; each source publishes when its round ends', () => {
  const h = controller();
  assert.equal(h.c.snapshot(), null, 'nothing yet: the view shows its loading state');
  h.c.setVisible(true, true);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1 }, 'every request before any answer');
  assert.ok(h.calls.every((c) => c.ms === 15000));
  h.c.setVisible(true, true);
  assert.equal(h.calls.length, 9, 'nothing more while the rounds are in flight');
  h.t.advance(800);
  assert.equal(h.answer(), 9);
  assert.equal(h.snaps.length, 2, 'one publish per source round');
  const s = h.c.snapshot();
  assert.equal(s.updatedAt, AT + 800, 'the moment the newest answer came');
  assert.deepEqual(plain(s.groups).map((g) => [g.id, g.rows.filter((r) => r.price !== null).length]),
    [['fx', 6], ['us', 6], ['il', 6], ['crypto', 6], ['indices', 6], ['commodities', 6]]);
  assert.equal(h.c.state().kind, 'fresh');
  console.log('# markets requests: cold round 9 (Yahoo 2 + Coinbase 7), all sent before any answer');
});

test('cadence: on view Coinbase every 60 s (7 requests), Yahoo every 5 min (2); off view or the page hidden: nothing', () => {
  const h = controller(), per = [];
  h.c.setVisible(true, true);
  h.answer();
  for (let m = 1; m <= 10; m++) { h.t.advance(MIN); per.push(h.count()); h.answer(); }
  const coinbase = per.map((n) => n.stats + n.rates), yahoo = per.map((n) => n.yahoo);
  assert.deepEqual(coinbase, [7, 7, 7, 7, 7, 7, 7, 7, 7, 7], 'Coinbase every minute');
  assert.deepEqual(yahoo, [0, 0, 0, 0, 2, 0, 0, 0, 0, 2], 'Yahoo every 5 minutes, as before');
  h.c.setVisible(false);
  h.t.advance(60 * MIN);
  assert.equal(h.calls.length, 0, 'off view: nothing');
  assert.deepEqual(h.t.pending(), [], 'no timer off view');
  h.c.setVisible(true, false);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1 }, 'a rotation arrival an hour later: both sources ask');
  h.answer();
  h.hide();
  h.t.advance(60 * MIN);
  assert.equal(h.calls.length, 0, 'the TV hid the page: nothing');
  console.log('# markets requests per 10 min on view: Coinbase ' + coinbase.reduce((a, b) => a + b) + ', Yahoo ' + yahoo.reduce((a, b) => a + b));
});

test('cadence: a rotation arrival asks each source only when ITS refreshMs has passed since its last attempt; ◀ ▶ asks both at once', () => {
  const h = controller();
  h.c.setVisible(true, false);
  assert.equal(h.answer(), 9, 'the first arrival asks at once');
  h.c.setVisible(false);
  h.t.advance(30 * 1000);
  h.c.setVisible(true, false);
  assert.equal(h.calls.length, 0, 'back after 30 s by rotation: both fresh');
  h.c.setVisible(false);
  h.t.advance(60 * 1000);
  h.c.setVisible(true, false);
  assert.deepEqual(h.count(), { yahoo: 0, stats: 6, rates: 1 }, '90 s after: Coinbase only (Yahoo waits for its 5 min)');
  h.answer();
  h.c.setVisible(false);
  h.c.setVisible(true, true);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1 }, 'an explicit ◀ ▶ open asks both at once');
});

test('a coin whose stats fail (404, timeout) shows only that row stale or «нет данных»; never asked from Yahoo; the rest stay fresh', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer({ 'ZEC-USD': 'http 404' });
  let s = h.c.snapshot();
  assert.deepEqual(plain(rowOf(s, 'ZEC')), { id: 'ZEC', price: null, currency: null, changePct: null, closed: false }, 'never had a value: no data');
  for (const id of ['BTC', 'ETH', 'BNB', 'XRP', 'SOL']) assert.ok(rowOf(s, id).price > 0 && !('stale' in rowOf(s, id)), id);
  h.t.advance(MIN);
  h.answer();
  const good = plain(rowOf(h.c.snapshot(), 'ZEC'));
  assert.equal(good.price, 1272.19);
  h.t.advance(MIN);
  assert.equal(h.calls.filter((x) => kindOf(x.url) === 'yahoo').length, 0, 'the coins are never sent to Yahoo');
  h.answer({ 'ZEC-USD': 'timeout' });
  s = plain(h.c.snapshot());
  assert.deepEqual(rowOf(s, 'ZEC'), Object.assign({}, good, { stale: true }), 'kept, marked stale');
  for (const id of ['BTC', 'USDILS', 'INTU']) assert.ok(!('stale' in rowOf(s, id)), id + ' fresh');
  assert.equal(h.c.state().kind, 'stale');
});

test('the 6 coins: with every stats request failing, the currencies still come (one source\'s rows never hold another\'s)', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer({ [STATS_HOST]: 'network' });
  const s = h.c.snapshot();
  for (const r of s.groups[3].rows) assert.equal(r.price, null, r.id);
  for (const r of s.groups[0].rows) assert.ok(r.price > 0, r.id);
});

// Batch 26 — the basis (the owner's «да - исправляй» and «все проценты должны считаться одинаково», 2026-11-05; it replaces
// batch 23C's first table of the Israel day, which read 0% on every cross but the euro's, and the coins' «24 hours earlier»):
// each currency's and coin's change is against Coinbase's price at 00:00 UTC of the PREVIOUS UTC date D — dated spots recorded
// 2026-11-05 (tests/fixtures/markets/coinbase): one per currency (spot-USD-<CODE>-<D>.json; the change needs all four) and ONE
// answer with every asset's dollar price for the coins (spot-USD-<D>.json, 414 entries; each coin its own) — asked in the
// Coinbase round itself for what the TV lacks for the current D, kept on the TV as { date, prices }. The currencies' and the
// crypto cards say D 00:00 UTC as an Israel date, from the first answer on.
const NOV4 = Date.parse('2026-11-04T07:31:00Z');   // 09:31 in Israel (winter, +02:00): D = 2026-11-03
const FIAT_PAIRS = ['USD-EUR', 'USD-ILS', 'USD-UAH', 'USD-RUB'];
// D = 2026-11-03 (recorded): the pair prices, and every currency's and coin's exact change of the recorded answers (2026-11-04
// 07:22 UTC) against them (computed once from the fixtures, outside the app).
const NOV3_FIAT = { 'USD-ILS': 3.140450000000002, 'USD-EUR': 0.8934554389099844, 'USD-UAH': 45.65037099999956, 'USD-RUB': 81.25001600000097 };
const NOV3_CRYPTO = { 'BTC-USD': 76674.89500010452, 'ETH-USD': 2249.6149999999084, 'BNB-USD': 698.0550000000097, 'XRP-USD': 1.248,
  'SOL-USD': 91.8250000000003, 'ZEC-USD': 1133.3149999999591 };
const NOV3_BASIS = { date: '2026-11-03', prices: Object.assign({}, NOV3_FIAT, NOV3_CRYPTO) };
const NOV3_PCT = { USDILS: 0.8255982422900487, EURILS: 1.1555994117799617, UAHperILS: -1.1555659215069292, RUBperILS: -0.11352267954539697,
  EURUSD: 0.32729899474228663, UAHperUSD: -0.3395080111533555 };
const NOV3_CRYPTO_PCT = { BTC: 1.7482971445786255, ETH: 2.1614809645247535, BNB: 0.28149644368857807, XRP: 1.9791666666666652,
  SOL: 1.181595426081894, ZEC: 12.253874695035893 };
// D = 2026-11-04 (recorded), the same way (SOL from the batched answer: 92.755, where the per-pair answer reads 92.735).
const NOV4_PCT = { USDILS: 0.11311179967132823, EURILS: 0.3287319441537928, UAHperILS: -0.4820485857642387, RUBperILS: 0.07472808065700498,
  EURUSD: 0.2153765282153497, UAHperUSD: -0.3694820399235743 };
const NOV4_CRYPTO_PCT = { BTC: 0.8775193629428468, ETH: 1.1694014328745617, BNB: 0.3900760074541765, XRP: -0.18430649778439223,
  SOL: 0.16710689450716298, ZEC: 4.480406690022143 };
const COIN_IDS = Object.keys(NOV3_CRYPTO_PCT);
const COINS_KEY = 'prices/USD/spot';
const spotsOf = (h) => h.calls.filter((x) => kindOf(x.url) === 'spot').map((x) => x.url).sort();
const pairUrls = (pairs, date) => pairs.map((p) => 'https://api.coinbase.com/v2/prices/' + p + '/spot?date=' + date).sort();
const fiatUrls = (date) => pairUrls(FIAT_PAIRS, date);
const coinsUrls = (date) => ['https://api.coinbase.com/v2/prices/USD/spot?date=' + date];
const spotUrls = (date) => fiatUrls(date).concat(coinsUrls(date)).sort();
const without = (o, key) => { const c = Object.assign({}, o); delete c[key]; return c; };
// The recorded every-asset answer of D without one coin (a test vector made from the real answer: that coin absent).
const coinsWithout = (date, base) => ({ data: recorded('coinbase/spot-USD-' + date).data.filter((e) => e.base !== base) });
const fxChanges = (snap) => Object.fromEntries(FX_IDS.map((id) => [id, rowOf(snap, id).changePct]));
const coinChanges = (snap) => Object.fromEntries(COIN_IDS.map((id) => [id, rowOf(snap, id).changePct]));
const cryptoGroup = (snap) => snap.groups.find((g) => g.id === 'crypto');
const noChange = (snap) => FX_IDS.every((id) => rowOf(snap, id).changePct === null) && !('since' in fxGroup(snap));
const noCoinChange = (snap) => COIN_IDS.every((id) => rowOf(snap, id).changePct === null) && !('since' in cryptoGroup(snap));

test('B26 basis: the first Coinbase round asks the previous UTC date\'s 4 currency spots + ONE coins answer WITH its 7 requests (12 at once); currencies and crypto measured from the first answer, both cards say D at home', () => {
  const h = controller({ start: NOV4, storage: memoryStorage() });
  h.c.setVisible(true, true);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1, spot: 5 }, 'every request before any answer: one parallel round, no extra hop');
  assert.deepEqual(spotsOf(h), spotUrls('2026-11-03'), 'D = the previous UTC date (never today\'s: that is the live price)');
  assert.ok(h.calls.every((c) => c.ms === 15000), 'the same timeout');
  h.answer();
  const s = h.c.snapshot();
  assert.deepEqual(fxChanges(s), NOV3_PCT, 'the currencies: the first rates table already measured against D 00:00 UTC');
  assert.deepEqual(coinChanges(s), NOV3_CRYPTO_PCT, 'the coins: the same rule, last against D 00:00 UTC, picked from the one answer');
  assert.deepEqual([fxGroup(s).since, cryptoGroup(s).since], ['2026-11-03', '2026-11-03'], 'D 00:00 UTC is 02:00 on 3 November in Israel, on both cards');
  for (const g of s.groups) if (g.id !== 'fx' && g.id !== 'crypto') assert.ok(!('since' in g), g.id + ': Yahoo\'s own day change, no basis label');
  assert.deepEqual(plain(rowOf(s, 'INTU')).changePct, plain(rowOf(recordedSnapshot(h.ctx, NOV4), 'INTU')).changePct, 'a share keeps Yahoo\'s figure');
  assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), NOV3_BASIS, 'kept on the TV: the date and every pair\'s price (the table is derived, not kept)');
  console.log('# markets basis: Coinbase 00:00 UTC of 2026-11-03; USD/ILS +' + NOV3_PCT.USDILS.toFixed(4) + '%, BTC +' + NOV3_CRYPTO_PCT.BTC.toFixed(4) + '% «% с 3 ноября» from the first answer');
});

test('B26 round trip: 3 rounds on one UTC day = 12, 7, 7 Coinbase requests; across 00:00 UTC the change goes with no request, the next round asks the new D once (12), then 7', () => {
  const h = controller({ start: Date.parse('2026-11-04T23:57:30Z'), storage: memoryStorage() }), per = [];
  const coinbase = () => { const n = h.count(); return n.stats + n.rates + (n.spot || 0); };
  h.c.setVisible(true, true);
  per.push([coinbase(), spotsOf(h)]); h.answer();
  for (let m = 1; m <= 2; m++) { h.t.advance(MIN); per.push([coinbase(), spotsOf(h)]); h.answer(); }
  assert.deepEqual(per, [[12, spotUrls('2026-11-03')], [7, []], [7, []]], 'one day: the basis asked once');
  assert.deepEqual([fxChanges(h.c.state().snapshot), coinChanges(h.c.state().snapshot)], [NOV3_PCT, NOV3_CRYPTO_PCT]);
  h.c.setVisible(false);
  h.t.advance(MIN);                                   // 00:00:30 UTC on 5 November, off view
  assert.equal(h.calls.length, 0, 'off view: nothing asked');
  assert.ok(noChange(h.c.state().snapshot) && noCoinChange(h.c.state().snapshot), 'the old D\'s change goes on state() alone, on both cards: never a stale day\'s basis');
  assert.ok(FX_IDS.concat(COIN_IDS).every((id) => rowOf(h.c.state().snapshot, id).price > 0), 'the prices stay');
  h.c.setVisible(true, true);
  const next = [[coinbase(), spotsOf(h)]];
  h.answer();
  assert.deepEqual([fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot())], [NOV4_PCT, NOV4_CRYPTO_PCT], 'the new D (2026-11-04) from its first answer');
  assert.deepEqual([fxGroup(h.c.snapshot()).since, cryptoGroup(h.c.snapshot()).since], ['2026-11-04', '2026-11-04']);
  for (let m = 1; m <= 2; m++) { h.t.advance(MIN); next.push([coinbase(), spotsOf(h)]); h.answer(); }
  assert.deepEqual(next, [[12, spotUrls('2026-11-04')], [7, []], [7, []]], 'the new day: once more, then never again that day');
  assert.equal(JSON.parse(h.storage.m.get(KEY)).date, '2026-11-04');
  console.log('# markets Coinbase requests per round across a UTC day change: ' + per.concat(next).map((x) => x[0]).join(', '));
});

test('B26: one currency spot failing (timeout, 404, another pair, amount 0, another base) → every currency change null (never half a table); the other 3 pairs and the coins kept; the next round asks that ONE pair', () => {
  const ils = recorded('coinbase/spot-USD-ILS-2026-11-03');
  const fails = [['timeout', 'timeout'], ['404', 'http 404'], ['another pair', ils],
    ['amount 0', { data: { amount: '0', base: 'USD', currency: 'EUR' } }], ['another base', { data: { amount: '0.89', base: 'EUR', currency: 'EUR' } }]];
  for (const [what, answer] of fails) {
    const h = controller({ start: NOV4, storage: memoryStorage() });
    h.c.setVisible(true, true);
    h.answer({ 'USD-EUR/spot': answer });
    assert.ok(noChange(h.c.snapshot()), what + ': no currency table, no change, no label');
    assert.ok(FX_IDS.every((id) => rowOf(h.c.snapshot(), id).price > 0), what + ': the prices are there');
    assert.deepEqual([coinChanges(h.c.snapshot()), cryptoGroup(h.c.snapshot()).since], [NOV3_CRYPTO_PCT, '2026-11-03'], what + ': the coins are their own');
    assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), { date: '2026-11-03', prices: without(NOV3_BASIS.prices, 'USD-EUR') }, what + ': the 3 pairs and the coins kept');
    if (typeof answer === 'object') assert.ok(h.logs.includes('markets: unexpected spot shape for USD-EUR'), what + ': logged');
    h.t.advance(MIN);
    assert.deepEqual(spotsOf(h), pairUrls(['USD-EUR'], '2026-11-03'), what + ': only the missing pair asked again (1 request)');
    h.answer();
    assert.deepEqual(fxChanges(h.c.snapshot()), NOV3_PCT, what + ': then the change');
    assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), NOV3_BASIS, what + ': the kept basis whole');
  }
});

test('B26: each coin is its own — a coin missing from the one answer leaves only its row without a change; the coins\' one request is asked again; the whole answer failing touches no currency', () => {
  const h = controller({ start: NOV4, storage: memoryStorage() });
  h.c.setVisible(true, true);
  h.answer({ [COINS_KEY]: coinsWithout('2026-11-03', 'ZEC') });
  const s = h.c.snapshot();
  assert.deepEqual(coinChanges(s), Object.assign({}, NOV3_CRYPTO_PCT, { ZEC: null }), 'ZEC: no change; the other five measured');
  assert.ok(rowOf(s, 'ZEC').price > 0, 'ZEC keeps its price');
  assert.equal(cryptoGroup(s).since, '2026-11-03', 'the card says the date of the changes it shows');
  assert.deepEqual(fxChanges(s), NOV3_PCT, 'the currencies unaffected');
  assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), { date: '2026-11-03', prices: without(NOV3_BASIS.prices, 'ZEC-USD') }, 'kept without ZEC');
  h.t.advance(MIN);
  assert.deepEqual(spotsOf(h), coinsUrls('2026-11-03'), 'the coins\' one request asked again');
  assert.equal(h.count().stats + h.count().rates + h.count().spot, 8, '7 + 1');
  h.answer();
  assert.deepEqual(coinChanges(h.c.snapshot()), NOV3_CRYPTO_PCT);
  assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), NOV3_BASIS);
  h.t.advance(MIN);
  assert.equal(h.count().spot, undefined, 'whole: nothing more asked');
  // the whole answer failing or foreign: every coin without a change, the currencies measured; a foreign one logged. Inside the
  // list, an entry in another currency or with an amount not > 0 is no price (test vectors on the real shape).
  const odd = [{ base: 'BTC', currency: 'EUR', amount: '70000' }, { base: 'ETH', currency: 'USD', amount: '0' }, { base: 'BNB', currency: 'USD', amount: '-1' }];
  for (const [what, answer] of [['timeout', 'timeout'], ['foreign shape', { data: { amount: '1', base: 'BTC', currency: 'USD' } }], ['another currency, amount ≤ 0', { data: odd }]]) {
    const o = controller({ start: NOV4, storage: memoryStorage() });
    o.c.setVisible(true, true);
    o.answer({ [COINS_KEY]: answer });
    assert.ok(noCoinChange(o.c.snapshot()) && COIN_IDS.every((id) => rowOf(o.c.snapshot(), id).price > 0), what + ': coins priced, no change, no label');
    assert.deepEqual(fxChanges(o.c.snapshot()), NOV3_PCT, what + ': the currencies measured');
    if (what === 'foreign shape') assert.ok(o.logs.includes('markets: unexpected spot shape for USD'), what + ': logged');
    assert.deepEqual(JSON.parse(o.storage.m.get(KEY)), { date: '2026-11-03', prices: NOV3_FIAT }, what + ': no coin price kept (never a 0 or a foreign one)');
    o.t.advance(MIN);
    assert.deepEqual(spotsOf(o), coinsUrls('2026-11-03'), what + ': 1 request again');
  }
});

test('B26: the spot answers alone are no data on screen — with every other request failing the basis is kept, updatedAt stays 0, the screen says failed', () => {
  const h = controller({ start: NOV4, storage: memoryStorage() });
  h.c.setVisible(true, true);
  h.t.advance(800);
  h.answer({ 'spark?': 'network', [STATS_HOST]: 'network', [RATES_HOST]: 'network' });
  assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), NOV3_BASIS, 'the basis came');
  assert.deepEqual([h.c.snapshot().updatedAt, h.c.state().kind], [0, 'failed'], 'a historical price is never «Обновлено»');
  h.t.advance(MIN);
  assert.equal(h.count().spot, undefined, 'the basis is there: not asked again');
  h.answer();
  assert.deepEqual([fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot())], [NOV3_PCT, NOV3_CRYPTO_PCT]);
  assert.equal(h.c.snapshot().updatedAt, NOV4 + 800 + MIN, 'the newest data: the rates table and the stats');
});

test('B26 back-off: a 429 on a spot holds api.coinbase.com — the rates table and every spot wait together; then one round asks the table and the missing pair', () => {
  const h = controller({ start: NOV4, storage: memoryStorage() });
  h.c.setVisible(true, true);
  h.answer({ 'USD-RUB/spot': { error: 'http 429', retryAfter: '120' } });
  assert.ok(noChange(h.c.snapshot()), 'no currency table');
  h.t.advance(MIN);
  assert.deepEqual([h.count().rates, h.count().spot, h.count().stats], [0, undefined, 6], 'held: neither the table nor the spots; the Exchange stats go on');
  h.answer();
  h.t.advance(MIN);
  assert.deepEqual([h.count().rates, spotsOf(h)], [1, pairUrls(['USD-RUB'], '2026-11-03')], 'the hold over: the table and the one missing pair');
  h.answer();
  assert.deepEqual(fxChanges(h.c.snapshot()), NOV3_PCT);
});

test('B26: a kept basis of the current D is reused after a restart (0 basis requests); a part kept is completed; an older D is asked again and replaced; the v1 key is not read', () => {
  const storage = memoryStorage([[KEY, JSON.stringify(NOV3_BASIS)]]);
  const h = controller({ start: NOV4, storage });
  h.c.setVisible(true, true);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1 }, 'restored: no spot asked');
  h.answer();
  assert.deepEqual([fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot())], [NOV3_PCT, NOV3_CRYPTO_PCT], 'the restored basis counts from the first answer');
  assert.deepEqual([fxGroup(h.c.snapshot()).since, cryptoGroup(h.c.snapshot()).since], ['2026-11-03', '2026-11-03']);
  const part = memoryStorage([[KEY, JSON.stringify({ date: '2026-11-03', prices: { 'USD-ILS': NOV3_FIAT['USD-ILS'], 'BTC-USD': NOV3_CRYPTO['BTC-USD'] } })]]);
  const p = controller({ start: NOV4, storage: part });
  p.c.setVisible(true, true);
  assert.deepEqual(spotsOf(p), pairUrls(['USD-EUR', 'USD-UAH', 'USD-RUB'], '2026-11-03').concat(coinsUrls('2026-11-03')).sort(), 'only what is missing: 3 pairs + the coins\' one');
  p.answer();
  assert.deepEqual(JSON.parse(part.m.get(KEY)), NOV3_BASIS, 'completed on the TV');
  const old = memoryStorage([[KEY, JSON.stringify({ date: '2026-11-02', prices: BASIS_PRICES })]]);
  const o = controller({ start: NOV4, storage: old });
  assert.deepEqual(o.logs, [], 'an older D is a valid record, not an error');
  o.c.setVisible(true, true);
  assert.deepEqual(spotsOf(o), spotUrls('2026-11-03'), 'an older D: asked again');
  o.answer();
  assert.deepEqual([fxChanges(o.c.snapshot()), coinChanges(o.c.snapshot())], [NOV3_PCT, NOV3_CRYPTO_PCT], 'never measured against the older day');
  assert.deepEqual(JSON.parse(old.m.get(KEY)), NOV3_BASIS, 'replaced on the TV');
  const v1 = memoryStorage([['markets.fxBasis.v1', JSON.stringify({ day: '2026-11-04', at: NOV4 - MIN, rates: BASIS })]]);
  const w = controller({ start: NOV4, storage: v1 });
  w.c.setVisible(true, true);
  assert.deepEqual(spotsOf(w), spotUrls('2026-11-03'), 'batch 23C\'s v1 record is not read');
  w.answer();
  assert.equal(v1.m.get('markets.fxBasis.v1'), JSON.stringify({ day: '2026-11-04', at: NOV4 - MIN, rates: BASIS }), 'and left as it was');
});

// The UTC/Israel boundary: from 00:00 to 02:00 in Israel (winter, +02:00; to 03:00 in summer) the UTC date is still the previous
// one, so D is two Israel days back; D 00:00 UTC is 02:00 (03:00) in Israel, the same calendar date. Through Intl and through
// the built-in IL rule.
test('B26 boundary: 01:30 in Israel on 5 Nov (23:30 UTC on the 4th) measures against 3 Nov; at 00:00 UTC (02:00 in Israel) D moves to 4 Nov — the change goes, the next round asks it', () => {
  for (const intl of [Intl, undefined]) {
    const h = controller({ start: Date.parse('2026-11-04T23:30:00Z'), storage: memoryStorage(), intl });
    h.c.setVisible(true, true);
    assert.deepEqual(spotsOf(h), spotUrls('2026-11-03'), 'the UTC date is still the 4th: D = the 3rd, intl ' + !!intl);
    h.answer();
    assert.equal(fxGroup(h.c.snapshot()).since, '2026-11-03', 'intl ' + !!intl);
    h.c.setVisible(false);
    h.t.advance(30 * MIN + 30 * 1000);                // 00:00:30 UTC: 02:00:30 on 5 November in Israel
    assert.ok(noChange(h.c.state().snapshot) && noCoinChange(h.c.state().snapshot), 'D moved at 00:00 UTC, not at the Israel midnight, intl ' + !!intl);
    h.c.setVisible(true, true);
    assert.deepEqual(spotsOf(h), spotUrls('2026-11-04'), 'intl ' + !!intl);
    h.answer();
    assert.deepEqual([fxGroup(h.c.snapshot()).since, fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot())], ['2026-11-04', NOV4_PCT, NOV4_CRYPTO_PCT], 'intl ' + !!intl);
  }
  // summer time (+03:00): D 00:00 UTC is 03:00 in Israel, still D's date
  const summer = controller({ start: Date.parse('2026-10-24T22:30:00Z'), storage: memoryStorage([[KEY, JSON.stringify({ date: '2026-10-23', prices: BASIS_PRICES })]]) });
  summer.c.setVisible(true, true);
  summer.answer();
  assert.deepEqual([fxGroup(summer.c.snapshot()).since, cryptoGroup(summer.c.snapshot()).since], ['2026-10-23', '2026-10-23'], '01:30 on 25 October in Israel: D = 23 October');
});

// C3 (Codex, batch 23C; kept for v2): a kept basis counts only when whole and possible; anything else is logged and asked again.
test('B26 C3: an invalid kept basis is ignored (a bad date, a broken or unknown price, no prices) — logged, asked again', () => {
  const date = '2026-11-03', prices = NOV3_BASIS.prices, bad = [
    ['a date after D (today\'s)', { date: '2026-11-04', prices }],
    ['not a real date', { date: '2026-02-30', prices }],
    ['a date in another form', { date: '03.11.2026', prices }],
    ['no date', { prices }],
    ['no prices', { date }],
    ['prices not an object', { date, prices: 3 }],
    ['prices an array', { date, prices: [] }],
    ['a currency price 0', { date, prices: Object.assign({}, prices, { 'USD-UAH': 0 }) }],
    ['a currency price negative', { date, prices: Object.assign({}, prices, { 'USD-EUR': -0.9 }) }],
    ['a price as a string', { date, prices: Object.assign({}, prices, { 'USD-ILS': '3.14' }) }],
    ['a currency the rows do not read', { date, prices: Object.assign({}, prices, { 'USD-GBP': 0.8 }) }],
    ['a coin price 0', { date, prices: Object.assign({}, prices, { 'BTC-USD': 0 }) }],
    ['a coin the rows do not read', { date, prices: Object.assign({}, prices, { 'TRX-USD': 0.3 }) }],
    ['batch 26\'s first draft shape { rates, crypto }', { date, rates: BASIS, crypto: CRYPTO_BASIS }]
  ];
  for (const [what, record] of bad) {
    const h = controller({ start: NOV4, storage: memoryStorage([[KEY, JSON.stringify(record)]]) });
    assert.ok(h.logs.includes(KEY + ': not restored: invalid'), what + ': said through log');
    h.c.setVisible(true, true);
    assert.deepEqual(spotsOf(h), spotUrls('2026-11-03'), what + ': asked again');
    h.answer();
    assert.deepEqual([fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot())], [NOV3_PCT, NOV3_CRYPTO_PCT], what + ': measured against the recorded basis, never the kept one');
    assert.deepEqual(JSON.parse(h.storage.m.get(KEY)), NOV3_BASIS, what + ': replaced on the TV');
  }
  const rubbish = controller({ start: NOV4, storage: memoryStorage([[KEY, '{not json']]) });
  assert.ok(rubbish.logs.some((m) => /not restored/.test(m)));
  const broken = controller({ start: NOV4, storage: { getItem: () => { throw new Error('quota'); }, setItem: () => { throw new Error('quota'); } } });
  broken.c.setVisible(true, true);
  broken.answer();
  broken.t.advance(MIN);
  assert.equal(broken.count().spot, undefined, 'the basis still counts in memory: not asked again');
  broken.answer();
  assert.deepEqual([fxChanges(broken.c.snapshot()), coinChanges(broken.c.snapshot())], [NOV3_PCT, NOV3_CRYPTO_PCT]);
  assert.ok(broken.logs.some((m) => /not restored: quota/.test(m)) && broken.logs.some((m) => /not kept: quota/.test(m)), broken.logs.join(' | '));
});

// «since» is D 00:00 UTC as a HOME date: Israel (+02:00 / +03:00) keeps it on D itself, so only a home clock behind UTC shows
// the conversion is real — the label follows the clock, it is not the UTC date copied.
test('B26: «since» is D 00:00 UTC read on the home clock — a home clock 5 h behind UTC says the day before D', () => {
  const behind = (ms) => { const d = new Date(ms - 5 * 3600000); return { ok: true, approx: false, offset: -300, hours: d.getUTCHours(), minutes: d.getUTCMinutes(),
    weekday: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() }; };
  const h = controller({ start: NOV4, wallAt: behind, storage: memoryStorage() });
  h.c.setVisible(true, true);
  h.answer();
  assert.deepEqual([fxGroup(h.c.snapshot()).since, cryptoGroup(h.c.snapshot()).since, fxChanges(h.c.snapshot())], ['2026-11-02', '2026-11-02', NOV3_PCT], '2026-11-03 00:00 UTC is 19:00 on 2 November there');
});

test('B26: without the home clock the change still shows; the cards say the UTC date D', () => {
  const h = controller({ start: NOV4, wallAt: false, storage: memoryStorage() });
  h.c.setVisible(true, true);
  h.answer();
  assert.deepEqual([fxChanges(h.c.snapshot()), coinChanges(h.c.snapshot()), fxGroup(h.c.snapshot()).since, cryptoGroup(h.c.snapshot()).since],
    [NOV3_PCT, NOV3_CRYPTO_PCT, '2026-11-03', '2026-11-03']);
});

test('back-off: a 429 from Coinbase Exchange holds back that host only (Retry-After 120 s honoured); the rates, Yahoo and the kept prices go on', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  const was = plain(rowOf(h.c.snapshot(), 'BTC'));
  h.t.advance(MIN);
  h.answer({ 'BTC-USD': { error: 'http 429', retryAfter: '120' } });
  h.t.advance(MIN);
  assert.deepEqual(h.count(), { yahoo: 0, stats: 0, rates: 1 }, '60 s later: the Exchange host is held back, the rates asked');
  h.answer();
  assert.deepEqual(plain(rowOf(h.c.snapshot(), 'BTC')), Object.assign({}, was, { stale: true }), 'the last good price kept, stale');
  assert.ok(h.c.snapshot().groups[3].rows.every((r) => r.stale), 'every coin kept: its host was not asked');
  assert.ok(h.c.snapshot().groups[0].rows.every((r) => !r.stale && r.price > 0), 'the currencies fresh');
  h.t.advance(MIN);
  assert.deepEqual(h.count(), { yahoo: 0, stats: 6, rates: 1 }, '120 s after the 429: asked again');
  h.answer();
  assert.ok(h.c.snapshot().groups[3].rows.every((r) => !r.stale), 'recovered');
  assert.ok(h.logs.some((m) => /api\.exchange\.coinbase\.com answered http 429: held back 120 s/.test(m)), h.logs.join(' | '));
});

test('back-off: a 429 without Retry-After holds its host backoffMs (5 min); a Retry-After date is read; a 503 naming one too; a timeout holds nothing', () => {
  const h = controller(), cfg = h.ctx.Config.markets;
  h.c.setVisible(true, true);
  h.answer({ [RATES_HOST]: 'http 429' });
  for (let m = 1; m <= 4; m++) { h.t.advance(MIN); assert.equal(h.count().rates, 0, 'minute ' + m + ': held'); h.answer(); }
  h.t.advance(MIN);
  assert.equal(cfg.backoffMs, 5 * MIN);
  assert.equal(h.count().rates, 1, 'after backoffMs: asked again');
  h.answer({ [RATES_HOST]: { error: 'http 503', retryAfter: new Date(h.t.now() + 3 * MIN).toUTCString() } });
  h.t.advance(MIN); assert.equal(h.count().rates, 0); h.answer();
  h.t.advance(MIN); assert.equal(h.count().rates, 0); h.answer();
  h.t.advance(MIN); assert.equal(h.count().rates, 1, 'the date named: 3 minutes'); h.answer({ [RATES_HOST]: 'timeout' });
  h.t.advance(MIN); assert.equal(h.count().rates, 1, 'a timeout is retried on the next round, nothing held');
  // N2 (native): a day-long Retry-After is read as backoffMaxMs (1 h) — held every round until then, and asked at the cap
  h.answer({ [RATES_HOST]: { error: 'http 429', retryAfter: '86400' } });
  assert.equal(cfg.backoffMaxMs, 60 * MIN);
  const asked = [];
  for (let m = 1; m <= 61; m++) { h.t.advance(MIN); asked.push(h.count().rates); h.answer(); }
  assert.deepEqual(asked.slice(0, 59), Array(59).fill(0), 'held every round for 59 minutes');
  assert.equal(asked[59], 1, 'asked again at 60 minutes: the cap, not the 24 hours named');
});

// C2 (Codex): parallel refusals on one host never shorten its hold — the later deadline wins, in either answer order, and a
// later 429 without Retry-After (5 min) does not cut a 1-hour hold short.
test('C2: two parallel refusals (Retry-After 3600 and 120) hold the host 3600 s in either order; a later short 429 never shortens it', () => {
  for (const order of [['BTC-USD', 'ETH-USD'], ['ETH-USD', 'BTC-USD']]) {
    const h = controller();
    h.c.setVisible(true, true);
    const fail = { 'BTC-USD': { error: 'http 429', retryAfter: '3600' }, 'ETH-USD': { error: 'http 429', retryAfter: '120' } };
    const open = h.calls.splice(0);
    for (const p of order) h.reply(open.find((x) => x.url.includes(p)), fail);
    for (const x of open) if (!order.some((p) => x.url.includes(p))) h.reply(x);
    const stats = [];
    for (let m = 1; m <= 61; m++) { h.t.advance(MIN); stats.push(h.count().stats); h.answer(); }
    assert.deepEqual(stats.slice(0, 59), Array(59).fill(0), order.join(' then ') + ': held the longer hour, not 2 minutes');
    assert.equal(stats[59], 6, order.join(' then ') + ': asked again after 3600 s');
  }
  // a 1-hour hold, then the same host refuses again without a Retry-After (backoffMs, 5 min) in that round: still 1 hour
  const h = controller();
  h.c.setVisible(true, true);
  const open = h.calls.splice(0);
  h.reply(open.find((x) => x.url.includes('BTC-USD')), { 'BTC-USD': { error: 'http 429', retryAfter: '3600' } });
  h.reply(open.find((x) => x.url.includes('ETH-USD')), { 'ETH-USD': 'http 429' });
  for (const x of open) if (!/BTC-USD|ETH-USD/.test(x.url)) h.reply(x);
  const stats = [];
  for (let m = 1; m <= 61; m++) { h.t.advance(MIN); stats.push(h.count().stats); h.answer(); }
  assert.equal(stats.indexOf(6), 59, 'the stats asked first at 60 minutes: ' + stats.join(''));
});

test('back-off: a Yahoo 429 holds Yahoo only — Coinbase goes on every minute', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer({ 'finance.yahoo.com': 'http 429' });
  const per = [];
  for (let m = 1; m <= 6; m++) { h.t.advance(MIN); per.push(h.count()); h.answer(); }
  assert.deepEqual(per.map((n) => n.yahoo), [0, 0, 0, 0, 2, 0], 'Yahoo held backoffMs (5 min, its own cadence), then asked again');
  assert.deepEqual(per.map((n) => n.stats + n.rates), [7, 7, 7, 7, 7, 7], 'Coinbase every minute meanwhile');
  const held = controller();
  held.c.setVisible(true, true);
  held.answer({ 'finance.yahoo.com': 'http 429' });
  for (const r of held.c.snapshot().groups[1].rows) assert.equal(r.price, null, r.id + ': Yahoo refused');
  assert.ok(held.c.snapshot().groups[0].rows.every((r) => r.price > 0), 'the currencies came');
  held.t.advance(MIN);
  held.answer();
  held.c.setVisible(false);
  held.c.setVisible(true, true);                     // an explicit ◀ ▶ open a minute after the 429
  assert.deepEqual(held.count(), { yahoo: 0, stats: 6, rates: 1 }, 'even an explicit open does not ask a held host');
});

test('a round that ends after the screen was left (or the page hidden) leaves no timer behind: nothing wakes off view', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.c.setVisible(false);
  h.answer();
  assert.deepEqual(h.t.pending(), [], 'left during the round');
  assert.equal(h.c.snapshot(), null, 'a cancelled round\'s late answers are not taken');
  h.c.setVisible(true, true);
  h.hide();
  h.answer();
  assert.deepEqual(h.t.pending(), [], 'page hidden during the round');
});

test('failures: all failed from the start → every price null, updatedAt 0, failed; rows never dropped', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer({ 'spark?': 'timeout', [STATS_HOST]: 'network', [RATES_HOST]: 'http 500' });
  assert.equal(h.c.snapshot().updatedAt, 0, 'nothing came: no time');
  assert.ok(h.c.snapshot().groups.every((g) => g.rows.length === 6 && g.rows.every((r) => r.price === null && !('stale' in r))));
  assert.equal(h.c.state().kind, 'failed');
});

// Coordinator's decision 2026-11-02 (contract: the optional per-row `stale: true`, as weather and news keep their last good data).
test('stale: a row that had a good value keeps its last price and change, marked stale, while its source fails; the next good round clears it', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  const first = plain(h.c.snapshot());
  assert.ok(first.groups.every((g) => g.rows.every((r) => !('stale' in r))), 'fresh rows carry no stale mark');
  const was = (id) => rowOf(first, id);
  h.t.advance(MIN);
  h.answer({ [RATES_HOST]: 'timeout' });
  let s = plain(h.c.snapshot());
  for (const id of ['USDILS', 'UAHperILS', 'EURUSD']) assert.deepEqual(rowOf(s, id), Object.assign({}, was(id), { stale: true }), id);
  for (const id of ['BTC', 'INTU', 'TEVA.TA']) assert.deepEqual(rowOf(s, id), was(id), id + ' fresh, no mark');
  assert.equal(s.updatedAt, AT + MIN, 'the newest answer (the coins)');
  h.t.advance(4 * MIN);                              // Coinbase's next round (left open) and Yahoo's 5-minute one: both fail
  assert.deepEqual(h.count(), { yahoo: 2, stats: 6, rates: 1 });
  h.answer({ 'spark?': 'network', [STATS_HOST]: 'network', [RATES_HOST]: 'network' });
  s = plain(h.c.snapshot());
  for (const g of s.groups) for (const r of g.rows) assert.deepEqual(r, Object.assign({}, was(r.id), { stale: true }), r.id);
  assert.equal(s.updatedAt, AT + MIN, 'every row stale: the time of the newest data shown, never a later one');
  h.t.advance(MIN);
  h.c.setVisible(true, true);
  h.answer();
  s = plain(h.c.snapshot());
  assert.ok(s.groups.every((g) => g.rows.every((r) => !('stale' in r) && r.price !== null)), 'a good round clears every mark');
});

// A2 [C2+X2]: the time moves only when an answer gave at least one usable configured row; the controller says the kind.
test('A2: empty or unusable Yahoo answers never advance its time; rows without a price next to priced ones: stale', () => {
  const h = controller(), empty = { spark: { result: [], error: null } };
  assert.equal(h.c.state().kind, 'loading');
  h.c.setVisible(true, true);
  h.answer({ 'spark?': empty, [STATS_HOST]: 'network', [RATES_HOST]: 'network' });
  assert.deepEqual([h.c.state().kind, h.c.snapshot().updatedAt], ['failed', 0], 'nothing usable: no time, failed');
  h.c.setVisible(true, true);
  const unknown = { spark: { result: [Object.assign({}, SPARK[0], { symbol: 'NOT-CONFIGURED' })], error: null } };
  h.answer({ 'spark?': unknown, [STATS_HOST]: 'network', [RATES_HOST]: 'network' });
  assert.deepEqual([h.c.state().kind, h.c.snapshot().updatedAt], ['failed', 0], 'an unknown symbol is not data');
  const gaps = controller();
  gaps.c.setVisible(true, true);
  gaps.answer({ 'SOL-USD': 'timeout' });
  assert.equal(gaps.c.state().kind, 'stale', 'rows without a price next to priced ones: stale, never fresh');
});

// A3 [C3]: a render that throws never stops the refreshes.
test('A3: an onChange that throws never stops the cadence: the next Coinbase round still comes after 60 s', () => {
  const ctx = load(FILES), t = fakeTimers(AT), calls = [];
  const c = ctx.Markets.createController(ctx.Config.markets, { now: t.now, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout,
    onChange: () => { throw new Error('render failed'); }, getJson: (url, ms, done) => calls.push({ url, done }) });
  c.setVisible(true, true);
  for (const call of calls.splice(0)) {
    const [err, body] = recordedAnswer(call.url);
    try { call.done(err, body); } catch (e) { /* the render's own error */ }
  }
  assert.deepEqual(t.pending(), [ctx.Config.markets.coinbase.refreshMs, ctx.Config.markets.refreshMs], 'both next rounds are scheduled');
  t.advance(ctx.Config.markets.coinbase.refreshMs);
  assert.equal(calls.length, 7, 'and sent');
});

// A6 [X4]: closed is a function of the session and NOW, for kept rows too.
test('A6: a kept (stale) quote recomputes closed at the current time: a failure round past the session end shows it closed', () => {
  const h = controller({ start: Date.parse('2026-11-02T20:58:00Z') });
  h.c.setVisible(true, true);
  h.answer();
  assert.equal(rowOf(h.c.snapshot(), 'INTU').closed, false, 'two minutes before New York closes');
  h.t.advance(5 * MIN);                              // Yahoo's next round at 21:03 fails
  h.answer({ 'spark?': 'timeout' });
  assert.deepEqual([rowOf(h.c.snapshot(), 'INTU').stale, rowOf(h.c.snapshot(), 'INTU').closed], [true, true], 'kept, and closed since 21:00');
});

test('A7: an equity closes exactly at its session end; a 24-hour session (23:59 end) keeps its last minute', () => {
  const ctx = load(FILES), at = (iso) => recordedSnapshot(ctx, Date.parse(iso));
  assert.equal(rowOf(at('2026-11-02T20:59:59Z'), 'INTU').closed, false);
  assert.equal(rowOf(at('2026-11-02T21:00:00Z'), 'INTU').closed, true, 'INTU closes at 21:00:00, not 21:01');
  assert.equal(rowOf(at('2026-11-02T21:00:30Z'), '^DJI').closed, true);
  assert.equal(rowOf(at('2026-11-03T04:59:30Z'), 'BZ=F').closed, false, 'a future\'s 23:59 New York end: its last minute');
});

// A11 [C11]: markets ages like every other source.
test('A11: Config.markets.staleAfterMs exists; older data is stale without a failure', () => {
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

// ---- Batch 16 ---------------------------------------------------------------------------------------------------------
test('A2: INTU answered at 20:59 UTC reads open; at 21:01 (no new request) it reads closed; an unchanged minute keeps the snapshot', () => {
  const END = 1793653200 * 1000;                     // the recorded INTU session's end
  const h = controller({ start: END - 60000 });
  h.c.setVisible(true, true);
  h.answer();
  h.c.setVisible(false);                             // no new round: the mark follows the clock alone
  assert.equal(rowOf(h.c.state().snapshot, 'INTU').closed, false);
  const before = h.c.state().snapshot;
  assert.equal(h.c.state().snapshot, before, 'the same minute: the same object (nothing redrawn)');
  h.t.advance(120000);
  const after = h.c.state().snapshot;
  assert.equal(rowOf(after, 'INTU').closed, true, 'closed at 21:01 without a round');
  assert.equal(h.calls.length, 0, 'no request for it');
  assert.notEqual(after, before, 'a changed mark: a new snapshot (the view redraws)');
  assert.equal(h.c.state().snapshot, after, '… once');
  assert.equal(rowOf(after, 'BTC').closed, false, 'crypto untouched');
});
test('C-2: a clock that went back makes the quotes stale', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  assert.equal(h.c.state().kind, 'fresh');
  h.t.advance(-60 * 60000);
  assert.equal(h.c.state().kind, 'stale');
});
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
test('C-19: an unreadable markets answer is logged with its message', () => {
  const h = controller();
  h.c.setVisible(true, true);
  for (const x of h.calls.splice(0)) x.done(null, { nope: 1 });
  assert.deepEqual(h.logs.filter((m) => /unexpected/.test(m)).sort(), ['markets: unexpected rates shape'].concat(Array(2).fill('markets: unexpected spark shape'), Array(6).fill('markets: unexpected stats shape')).sort());
  assert.equal(h.c.state().kind, 'failed');
});
test('N2: snapshot() turns a rate ≤ 0 (or missing) into an empty row (its own guard, not only rateTable()\'s)', () => {
  const ctx = load(FILES), cfg = ctx.Config.markets;
  const s = ctx.Markets.snapshot(cfg, { quotes: {}, stats: { 'BTC-USD': { last: 0 }, 'ETH-USD': { last: 2298.24 } }, rates: { USD: 1, ILS: 0, UAH: -25.6, EUR: 0.9 },
    basis: { rates: { USD: 1, EUR: 0 }, prices: { 'ETH-USD': 0 } }, updatedAt: AT }, AT);
  for (const id of ['USDILS', 'EURILS', 'UAHperILS', 'RUBperILS', 'UAHperUSD', 'BTC']) assert.equal(rowOf(s, id).price, null, id + ': no price');
  assert.deepEqual([rowOf(s, 'EURUSD').price, rowOf(s, 'EURUSD').changePct], [1 / 0.9, null], 'a basis rate ≤ 0: a price, no change');
  assert.deepEqual([rowOf(s, 'ETH').price, rowOf(s, 'ETH').changePct], [2298.24, null], 'a coin\'s basis price ≤ 0: a price, no change');
});

// FIX-BATCH-19 3 (P7): leaving the screen (or the TV hiding the page) during a round aborts every request still in flight; a
// late answer draws nothing; back on view (even by the rotation) asks again at once.
test('B19 P7: leave during a round → every pending request aborted, no late render; back on view → asked again at once', () => {
  const h = controller();
  h.c.setVisible(true, true);
  const first = h.calls.slice();
  assert.equal(first.length, 9);
  h.c.setVisible(false);
  assert.ok(first.every((x) => x.aborted), 'left: every pending request aborted');
  h.answer();
  assert.deepEqual([h.snaps.length, h.c.snapshot()], [0, null], 'the late answers draw nothing');
  h.t.advance(MIN);
  h.c.setVisible(true, false);
  assert.equal(h.calls.length, 9, 'the aborted attempts are forgotten: asked again at once');
  const second = h.calls.slice();
  h.hide();
  assert.ok(second.every((x) => x.aborted), 'the TV hid the page: aborted too');
});

// FIX-BATCH-19 4 (P10): «Обновлено» says when the data were made (Date − Age), bounded by the arrival and httpAgeMaxMs.
test('B19 P10: updatedAt is the data\'s own time (Date − Age), bounded by the arrival and httpAgeMaxMs', () => {
  const at = (meta) => {
    const h = controller();
    h.c.setVisible(true, true);
    for (const x of h.calls.splice(0)) { const [err, body] = recordedAnswer(x.url); x.done(err, body, meta); }
    return h.c.snapshot().updatedAt - AT;
  };
  assert.equal(at({ dataAt: AT - 5 * MIN }), -5 * MIN, 'a cached copy made 5 minutes ago');
  assert.equal(at({ dataAt: AT + MIN }), 0, 'a Date after the arrival: the arrival');
  assert.equal(at({ dataAt: AT - 3 * 60 * MIN }), -60 * MIN, 'older than httpAgeMaxMs: the bound');
  assert.equal(at(undefined), 0, 'no header: the arrival');
  assert.equal(at({ dataAt: NaN }), 0, 'unreadable: the arrival');
});

// FIX-19B, the P7 decision: left once an answer has come, a source's round is not aborted — it ends in the background and its
// snapshot is on screen at the return; the TV hiding the page still aborts all.
test('FIX-19B P7: left after a source\'s first answer → that round is not aborted, ends in the background; the return shows it', () => {
  const h = controller();
  h.c.setVisible(true, true);
  const yahoo = h.calls.filter((x) => kindOf(x.url) === 'yahoo'), coinbase = h.calls.filter((x) => kindOf(x.url) !== 'yahoo');
  h.reply(coinbase[0]);                              // one Coinbase answer has come; none from Yahoo
  h.c.setVisible(false);
  assert.ok(coinbase.every((x) => !x.aborted), 'Coinbase: an answer in, not aborted');
  assert.ok(yahoo.every((x) => x.aborted), 'Yahoo: no answer yet, aborted');
  coinbase.slice(1).forEach((x) => h.reply(x));
  assert.deepEqual(h.t.pending(), [], 'no timer off view');
  h.calls.length = 0;
  h.t.advance(30 * 1000);
  h.c.setVisible(true, false);
  assert.deepEqual(h.count(), { yahoo: 2, stats: 0, rates: 0 }, 'the rotation back: the aborted Yahoo asks at once, Coinbase is fresh');
  assert.ok(h.c.snapshot().groups[3].rows.every((r) => r.price > 0), 'the background round\'s coins are there');
});

// Batch 25 T5 (native reviewer F4, owner 2026-11-04, batch 25 T5): while a row is kept (stale) the header's «данные от» time
// is the OLDEST kept row's data time, never the newest source's — Coinbase answering every minute must not make three-hour-old
// Yahoo rows look a minute old. Nothing kept: the newest data's time («Обновлено в …»), as before.
test('B25 T5: Coinbase fresh every minute, Yahoo failing for 3 h → stale, the header\'s time is Yahoo\'s last good data (3 h old), not Coinbase\'s', () => {
  const h = controller();
  h.c.setVisible(true, true);
  h.answer();
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['fresh', AT], 'nothing kept: the newest data\'s time');
  for (let m = 1; m <= 180; m++) { h.t.advance(MIN); h.answer({ 'spark?': 'network' }); }
  const st = h.c.state();
  assert.equal(st.kind, 'stale');
  assert.equal(h.c.snapshot().updatedAt, AT + 180 * MIN, 'the snapshot still says when its newest data (the coins) came');
  assert.equal(st.updatedAt, AT, 'the header: the oldest kept row\'s data (Yahoo, 3 h ago), never Coinbase\'s minute-old time');
  assert.equal(rowOf(st.snapshot, 'INTU').stale, true);
  assert.equal(rowOf(st.snapshot, 'BTC').stale, undefined, 'the coins are fresh');
  // the rates fail too, later: the oldest of the kept rows is still Yahoo's
  h.t.advance(MIN);
  h.answer({ 'spark?': 'network', [RATES_HOST]: 'network' });
  assert.equal(h.c.state().updatedAt, AT, 'two sources kept: the older one');
  // Yahoo comes back: only the rates are kept — their own last good time (one minute before)
  h.t.advance(5 * MIN);
  h.answer({ [RATES_HOST]: 'network' });
  const back = h.c.state();
  assert.equal(rowOf(back.snapshot, 'INTU').stale, undefined, 'Yahoo fresh again');
  assert.equal(rowOf(back.snapshot, 'USDILS').stale, true);
  assert.deepEqual([back.updatedAt, h.c.snapshot().updatedAt], [AT + 180 * MIN, AT + 186 * MIN], 'the kept rates\' own last good time, not the coins\' newer one');
  h.t.advance(MIN);
  h.answer();
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['fresh', h.c.snapshot().updatedAt], 'nothing kept: the newest again');
});

// Batch 25 T5 F1/F2 (panel 0/3 + Codex): a kept row's time is the data time of the very answer that carried it — never its
// source's newest. The answers here carry their own data times (meta.dataAt: Date − Age, js/net.js); `dated(url)` gives each.
function answerDated(h, dated, fail) {
  for (const x of h.calls.splice(0, h.calls.length)) {
    const err = fail && fail(x.url);
    if (err) { x.done(err, undefined, { retryAfter: '' }); continue; }
    const [e, body] = recordedAnswer(x.url);
    x.done(e, body, e ? { retryAfter: '' } : { dataAt: dated(x.url) });
  }
}
test('B25 F2 (Codex\'s repro): rates dated 5 min before the coins, then the rates fail — the header says the RATES\' time, not the coins\'', () => {
  const h = controller();
  h.c.setVisible(true, true);
  answerDated(h, (url) => (kindOf(url) === 'rates' ? AT - 5 * MIN : AT));            // FX «09:55», crypto and Yahoo «10:00»
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['fresh', AT]);
  h.t.advance(MIN);                                                                  // «10:01»: Coinbase's next round
  answerDated(h, () => AT + MIN, (url) => (kindOf(url) === 'rates' ? 'network' : null));
  const st = h.c.state();
  assert.equal(rowOf(st.snapshot, 'USDILS').stale, true);
  assert.equal(rowOf(st.snapshot, 'BTC').stale, undefined);
  assert.equal(st.updatedAt, AT - 5 * MIN, 'the kept FX rows\' own table time («09:55»), never the coins\' («10:00»)');
  assert.equal(st.snapshot.keptAt, AT - 5 * MIN, 'carried on the snapshot (F4)');
});
test('B25 F2: two Yahoo answers of different ages, the older one\'s symbols kept — the header says the older answer\'s time', () => {
  const h = controller();
  h.c.setVisible(true, true);
  const sparks = h.calls.filter((x) => kindOf(x.url) === 'yahoo').map((x) => x.url);
  assert.equal(sparks.length, 2);
  answerDated(h, (url) => (url === sparks[0] ? AT - 20 * MIN : url === sparks[1] ? AT - 2 * MIN : AT));
  h.t.advance(5 * MIN);                                                              // Yahoo's next round: the first spark fails
  answerDated(h, () => AT + 5 * MIN, (url) => (url === sparks[0] ? 'network' : null));
  const st = h.c.state(), stale = st.snapshot.groups.flatMap((g) => g.rows.filter((r) => r.stale).map((r) => r.id));
  assert.ok(stale.length > 0 && stale.length < 24, 'only the first spark\'s rows are kept: ' + stale.join(','));
  assert.equal(st.updatedAt, AT - 20 * MIN, 'the older spark\'s time, never the newer one\'s (Yahoo\'s newest)');
});
// Native reviewer F1c (owner 2026-11-04, batch 25): in one Coinbase round the BTC stats answer is 10 min older than the rates
// table; BTC then fails alone — the kept BTC row is timed by its own stats answer, never by the rates table of its round.
test('B25 F1c: a kept crypto row is timed by its own stats answer', () => {
  const h = controller();
  h.c.setVisible(true, true);
  const btc = (url) => kindOf(url) === 'stats' && url.includes('BTC-USD');
  answerDated(h, (url) => (btc(url) ? AT - 10 * MIN : AT));                          // BTC «09:50», the rates and the rest «10:00»
  assert.deepEqual([h.c.state().kind, h.c.state().updatedAt], ['fresh', AT]);
  h.t.advance(MIN);                                                                  // «10:01»: Coinbase's next round, BTC fails
  answerDated(h, () => AT + MIN, (url) => (btc(url) ? 'network' : null));
  const st = h.c.state(), stale = st.snapshot.groups.flatMap((g) => g.rows.filter((r) => r.stale).map((r) => r.id));
  assert.equal(stale.join(','), 'BTC', 'only BTC is kept');
  assert.equal(st.updatedAt, AT - 10 * MIN, 'the header: BTC\'s own stats time («09:50»), never the rates table\'s («10:00»)');
});
test('B25 F4: the kept time travels with the snapshot — none on a snapshot with nothing kept, and the minute tick keeps it', () => {
  const h = controller();
  h.c.setVisible(true, true);
  answerDated(h, () => AT - MIN);
  assert.equal('keptAt' in h.c.state().snapshot, false, 'nothing kept: no keptAt');
  h.t.advance(MIN);
  answerDated(h, () => AT + MIN, (url) => (kindOf(url) === 'rates' ? 'network' : null));
  h.c.setVisible(false);
  const before = h.c.state().snapshot;
  h.t.advance(23 * 3600000);                                                         // across 00:00 Israel: fxNow / closedNow make new snapshots
  assert.notEqual(h.c.state().snapshot, before, 'a regrouped snapshot (the currency change and the closed marks moved)');
  assert.equal(h.c.state().snapshot.keptAt, AT - MIN, 'the regrouped snapshot keeps its keptAt');
  assert.equal(h.c.state().updatedAt, AT - MIN);
});
