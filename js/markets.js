/* Markets: shares, crypto, indices, currencies and commodities (Config.markets). ES5.
 * Sources (tests/fixtures/markets):
 *   Yahoo v7/finance/spark?symbols=A,B,…&range=1d&interval=1d (checked 2026-11-02) — no key, no crumb; up to 20 symbols per
 *     request; answers in any order, one { symbol, response: [{ meta }] } each: meta.regularMarketPrice,
 *     .regularMarketChangePercent (the source's own day change, used as given), .currency ('ILA' = agorot on the Tel Aviv
 *     exchange), .instrumentType, .currentTradingPeriod.regular { start, end } (epoch seconds; a 24-hour market's session
 *     runs 00:00–23:59).
 *   Coinbase (checked 2026-11-04, owner 2026-11-04: crypto and every currency from Coinbase, every minute):
 *     api.exchange.coinbase.com/products/<P>/stats — { open, high, low, last, volume, … } as strings (only `last`, the last
 *       trade, is read); a product Coinbase does not trade answers { message: 'NotFound' } (TRX-USD).
 *     api.coinbase.com/v2/exchange-rates?currency=USD — { data: { currency: 'USD', rates: { ILS: '3.1663775', … } } }:
 *       units of each currency for ONE dollar, as strings.
 *     api.coinbase.com/v2/prices/<BASE>-<CURRENCY>/spot?date=<YYYY-MM-DD> (checked 2026-11-05) — { data: { amount: '3.14045…',
 *       base: 'USD', currency: 'ILS' } }: units of CURRENCY for one BASE at 00:00 UTC of that date, when the date has ENDED
 *       (for today's date it is the live rate); an unknown pair answers 404. The same instant for fiat and crypto: BTC-USD of
 *       2026-11-04 = 77336.755, the Exchange's daily candle OPEN; BTC-ILS / BTC-USD = USD-ILS of the same date (11-03, 11-04,
 *       10-28; coordinator, 2026-11-05).
 *     api.coinbase.com/v2/prices/USD/spot?date=<YYYY-MM-DD> (checked 2026-11-05; not in Coinbase's documented v2 reference) —
 *       { data: [{ base: 'BTC', currency: 'USD', amount: '76674.8950001045146293' }, … 414 assets] }: every asset's dated
 *       dollar price in ONE answer (the coins' basis; the per-pair answers round it — SOL of 2026-11-04 reads 92.755 here and
 *       92.735 per pair, 0.02%). There is no such answer for a currency (prices/ILS/spot answers 400).
 *   Markets.plan(cfg)                the requests: { spark: [url], stats: [{ product, url }], rates: url }
 *   Markets.quotes(json)             one spark answer → { symbol: meta } for every symbol with a price; a foreign shape throws
 *   Markets.stats(json)              one stats answer → { last } (a number > 0); anything else throws
 *   Markets.rateTable(json, codes)   one exchange-rates answer → { code: units for one dollar } of exactly `codes`; a foreign
 *                                    shape, another base, or a code missing or not > 0 throws (never half a table)
 *   Markets.snapshot(cfg, data, nowMs)   the MarketsSnapshot of data = { quotes, stats: { product: { last } }, rates (a
 *                                    rateTable or null), basis (what the currencies and crypto are measured against, or null:
 *                                    { rates: a rateTable or null, prices: { product: price } }), updatedAt }
 *   Markets.createController(cfg, deps)  two sources, each on its own on-view gate (js/onview.js) and cadence: Yahoo every
 *                                    cfg.refreshMs, Coinbase every cfg.coinbase.refreshMs; snapshot() is null until the
 *                                    first answers, then the latest snapshot; state() says what the header says
 * MarketsSnapshot: { updatedAt, groups: [{ id, rows: [{ id, price, currency, changePct, closed, stale?, unit? }], since? }] } —
 * every configured row in the configured order. changePct: a share's, index's or commodity's — Yahoo's own day change; a
 * currency's and a coin's — ONE rule (batch 26, the owner's «да - исправляй» and «все проценты должны считаться одинаково»,
 * 2026-11-05): against Coinbase's price at 00:00 UTC of the PREVIOUS UTC date D (it replaces batch 23C's first table of the
 * home day, which measured minutes and read 0%, and the coins' price 24 hours earlier), from the first answer on. The basis is
 * dated spot answers — one per currency the rows read but the dollar (4), one for all the coins — asked in the Coinbase round
 * itself, only what it lacks for the current D (so once per UTC day while the screen is on view: 5 requests; after a failure
 * only the missing pair, or the coins' one), and kept on the TV as { date, prices: { pair: price } }. The currencies' change
 * needs all four (a cross needs every code: never half a table on screen); each coin's is its own (a missing one leaves only
 * that row without a change). While a row has no basis for the current D (asked, failed, or the UTC date just changed:
 * checked on every state(), no request needed) its change is null — never a stale day's basis. since: on a group whose rows carry such a change, the home (Israel) calendar date of D 00:00 UTC,
 * "2026-11-04" (the card: «% с 4 ноября»).
 * A row its source did not give in that source's last round keeps its last good values with stale: true (as weather and news
 * keep theirs); one that never had a value has price null (never dropped, never made up). closed: a quote's market is outside
 * its regular session (true / false; it follows the clock between rounds, A2); false for crypto (it trades around the
 * clock); null for a currency rate, a reference rate with no trading hours. unit: what a commodity's price is for (the
 * configured row's unit: 'barrel', 'ounce', …). updatedAt is the arrival time of the newest usable data shown (0: none).
 * keptAt (batch 25 T5, only while a row is kept): the OLDEST kept row's own data time — each row's from the very answer that
 * carried it (its spark answer, its product's stats, the rates table). */
var Markets = (function () {
  var CURRENCIES = { USD: true, ILS: true, UAH: true, RUB: true, EUR: true };
  var DOLLAR = 'USD';                              // the base of every Coinbase rate: units of a currency for one dollar
  var LAST_MINUTE_S = 60;                          // a 24-hour session's `end` is its last minute, not its end
  var DAY_SESSION_S = 24 * 3600 - LAST_MINUTE_S;   // 00:00–23:59: how Yahoo names a 24-hour market's session

  var finite = Num.finite;
  function positive(v) { return finite(v) && v > 0; }
  // A source's number: Coinbase sends them as strings; anything but a string or a number is no number.
  function numberOf(v) { return typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN; }
  function eachRow(cfg, f) {
    for (var i = 0; i < cfg.groups.length; i++) for (var j = 0; j < cfg.groups[i].rows.length; j++) f(cfg.groups[i].rows[j]);
  }

  function sparkUrl(cfg, symbols) {
    var enc = [];
    for (var i = 0; i < symbols.length; i++) enc.push(encodeURIComponent(symbols[i]));
    return cfg.spark + '?symbols=' + enc.join(',') + '&range=1d&interval=1d';
  }
  function plan(cfg) {
    var symbols = [], spark = [], stats = [], i;
    eachRow(cfg, function (r) {
      if (r.yahoo) symbols.push(r.yahoo);
      else if (r.product) stats.push({ product: r.product, url: cfg.coinbase.stats + encodeURIComponent(r.product) + '/stats' });
    });
    for (i = 0; i < symbols.length; i += cfg.perRequest) spark.push(sparkUrl(cfg, symbols.slice(i, i + cfg.perRequest)));
    return { spark: spark, stats: stats, rates: cfg.coinbase.rates };
  }
  // The codes the currency rows read (each base and code once), in row order.
  function rateCodes(cfg) {
    var codes = [];
    eachRow(cfg, function (r) {
      if (!r.code) return;
      if (codes.indexOf(r.base) < 0) codes.push(r.base);
      if (codes.indexOf(r.code) < 0) codes.push(r.code);
    });
    return codes;
  }

  function quotes(json) {
    var list = json && json.spark && json.spark.result, out = {};
    if (!Array.isArray(list)) throw new Error('markets: unexpected spark shape');
    for (var i = 0; i < list.length; i++) {
      var e = list[i], m = e && e.response && e.response[0] && e.response[0].meta;
      if (m && typeof e.symbol === 'string' && finite(m.regularMarketPrice)) out[e.symbol] = m;
    }
    return out;
  }
  function stats(json) {
    var last = numberOf(json && json.last);
    if (!positive(last)) throw new Error('markets: unexpected stats shape');
    return { last: last };
  }
  function rateTable(json, codes) {
    var d = json && json.data, rates = d && d.rates, out = {};
    if (!d || d.currency !== DOLLAR || !rates || typeof rates !== 'object') throw new Error('markets: unexpected rates shape');
    for (var i = 0; i < codes.length; i++) {
      var v = numberOf(rates[codes[i]]);
      if (!positive(v)) throw new Error('markets: no rate for ' + codes[i]);
      out[codes[i]] = v;
    }
    return out;
  }
  // One dated spot answer for `pair` ('USD-ILS', 'BTC-USD') → units of its currency for one of its base; another pair, or an
  // amount not > 0, throws.
  function spotRate(json, pair) {
    var d = json && json.data, v = numberOf(d && d.amount), p = pair.split('-');
    if (!d || d.base !== p[0] || d.currency !== p[1] || !positive(v)) throw new Error('markets: unexpected spot shape for ' + pair);
    return v;
  }
  // The dollar's dated spots of every asset (prices/USD/spot?date=…: { data: [{ base, currency, amount }, …] }) → { product:
  // amount as a number } for each of `products` found as base-currency (a coin not in it is simply absent; an amount not > 0
  // is dropped where every price is, withSpots); a foreign shape throws.
  function coinPrices(json, products) {
    var list = json && json.data, out = {};
    if (!Array.isArray(list)) throw new Error('markets: unexpected spot shape for ' + DOLLAR);
    for (var i = 0; i < list.length; i++) {
      var e = list[i], key = e ? e.base + '-' + e.currency : '';
      if (products.indexOf(key) >= 0) out[key] = numberOf(e.amount);
    }
    return out;
  }


  function emptyRow(id, closed) { return { id: id, price: null, currency: null, changePct: null, closed: closed }; }
  // Closed: outside the regular session Yahoo names (an equity closes at its end; a 24-hour session keeps its last
  // minute, 23:59); no session named: never called closed.
  function closedAt(m, nowS) {
    var p = m.currentTradingPeriod && m.currentTradingPeriod.regular;
    if (!p || !finite(p.start) || !finite(p.end)) return false;
    var end = p.end - p.start === DAY_SESSION_S ? p.end + LAST_MINUTE_S : p.end;
    return nowS < p.start || nowS >= end;
  }
  function quoteRow(id, m, nowS) {
    if (!m) return emptyRow(id, false);
    var price = m.regularMarketPrice, currency = m.currency;
    if (currency === 'ILA') { price = price / 100; currency = 'ILS'; }
    // An index is a value in points, not money.
    if (m.instrumentType === 'INDEX' || !CURRENCIES.hasOwnProperty(currency)) currency = null;
    return { id: id, price: price, currency: currency, changePct: finite(m.regularMarketChangePercent) ? m.regularMarketChangePercent : null,
      closed: closedAt(m, nowS) };
  }
  // A crypto product: its last price in the product's quote currency (BTC-USD: USD), the change against the basis.
  function statsRow(row, s, basis) {
    if (!s || !positive(s.last)) return emptyRow(row.id, false);
    var currency = row.product.split('-')[1];
    return { id: row.id, price: s.last, currency: CURRENCIES.hasOwnProperty(currency) ? currency : null, changePct: changeFrom(s.last, basis, row), closed: false };
  }
  // `code` units for one `base` from a dollar table; null without both as numbers > 0 (N2: snapshot() is a public pure
  // function, so it keeps its own guard, whatever table it is handed).
  function cross(table, row) {
    var x = table ? table[row.code] : undefined, y = table ? table[row.base] : undefined;
    return positive(x) && positive(y) ? x / y : null;
  }
  // A coin's basis price from a basis's prices; null without one as a number > 0 (N-2: snapshot() is a public pure function,
  // so it keeps its own guard, like cross()).
  function coinAt(prices, product) {
    var v = prices ? prices[product] : undefined;
    return positive(v) ? v : null;
  }
  // A currency's or a coin's change against a basis { rates, prices } (null without one, or without the row's own figure:
  // a currency's two codes, a coin's price).
  function changeFrom(price, basis, row) {
    var m = !basis ? null : row.product ? coinAt(basis.prices, row.product) : cross(basis.rates, row);
    return price === null || m === null ? null : (price / m - 1) * 100;
  }
  function rateRow(row, rates, basis) {
    var v = cross(rates, row);
    if (v === null) return emptyRow(row.id, null);
    return { id: row.id, price: v, currency: row.code, changePct: changeFrom(v, basis, row), closed: null };
  }
  function rowOf(r, data, nowS) {
    if (r.yahoo) return quoteRow(r.id, data.quotes[r.yahoo], nowS);
    if (r.product) return statsRow(r, data.stats[r.product], data.basis);
    return rateRow(r, data.rates, data.basis);
  }

  // A row with some of its fields changed (every other field kept, the unit and the stale mark included).
  var copyRow = Obj.copyWith;

  function snapshot(cfg, data, nowMs) {
    var nowS = Math.floor(nowMs / 1000), groups = [];
    for (var i = 0; i < cfg.groups.length; i++) {
      var g = cfg.groups[i], rows = [];
      for (var j = 0; j < g.rows.length; j++) {
        var r = g.rows[j], row = rowOf(r, data, nowS);
        rows.push(r.unit ? copyRow(row, { unit: r.unit }) : row);
      }
      groups.push({ id: g.id, rows: rows });
    }
    return { updatedAt: data.updatedAt, groups: groups };
  }

  // What the header says about a snapshot: nothing yet (loading); no price at all (failed); a row kept from an earlier
  // round, a row without a price next to priced ones, or data older than cfg.staleAfterMs (stale); otherwise fresh.
  function kindOf(cfg, snap, now) {
    if (!snap) return 'loading';
    var priced = 0, gaps = 0, kept = 0;
    eachRow(snap, function (r) { if (r.price === null) gaps++; else { priced++; if (r.stale) kept++; } });   // N3: a snapshot has the config's groups/rows shape
    if (!priced) return 'failed';
    return Freshness.kind(true, kept > 0 || gaps > 0, snap.updatedAt, now, cfg.staleAfterMs);
  }

  function hostOf(url) { return url.split('/')[2]; }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, documentVisible() (optional), onChange(snapshot),
  //         log(message) (optional), wallAt(ms) (optional: the home clock's Tz.wallTime — says the basis date at home;
  //         without it the card says the UTC date D), storage (optional: localStorage or null; the basis kept on the TV) }
  function createController(cfg, deps) {
    var log = deps.log || function () {}, cb = cfg.coinbase, codes = rateCodes(cfg), requests = plan(cfg);
    var lastGood = {}, lastMeta = {}, current = null, hold = {}, bySymbol = {};   // hold: host → not asked before (ms)
    // What each source's last round gave (got) and the time of its newest data (at).
    // Batch 25 T5: each answer's data time per row it carried — quoteAt (symbol), statsAt (product), ratesAt (the table).
    var got = { quotes: {}, quoteAt: {}, stats: {}, statsAt: {}, rates: null, ratesAt: 0 }, at = { yahoo: 0, coinbase: 0 };
    // Batch 25 T5: each row's own data time when it was last good — the snapshot's keptAt is the oldest of the kept ones.
    var lastGoodAt = {};
    var products = [], pairs = [], p;    // the coins, in row order; every pair the basis holds: the currencies', then the coins
    for (p = 0; p < requests.stats.length; p++) products.push(requests.stats[p].product);
    for (p = 0; p < codes.length; p++) if (codes[p] !== DOLLAR) pairs.push(DOLLAR + '-' + codes[p]);
    pairs = pairs.concat(products);
    // { date (a UTC date D), prices: { pair: its price at D 00:00 UTC }, rates: the currencies' table they make, or null }
    var basis = readBasis(deps.now());
    eachRow(cfg, function (r) { if (r.yahoo) bySymbol[r.yahoo] = r.id; });

    // FIX-BATCH-19 4 (P10): «Обновлено» is the time the data were made — the answer's Date − Age (js/net.js getJsonDated) when
    // the source gives it, never later than its arrival nor earlier than httpAgeMaxMs before it; else the arrival.
    function dataAt(meta, now) {
      var d = meta && meta.dataAt;
      return finite(d) ? Math.max(now - cfg.httpAgeMaxMs, Math.min(now, d)) : now;
    }

    // ---- the basis (batch 26): Coinbase's prices at 00:00 UTC of the previous UTC date, kept on the TV ----
    // The basis date at `now`: the previous UTC date D — the latest ENDED date, whose dated spot is its 00:00 UTC price.
    function basisDate(now) { return Tz.addDays(Tz.isoDate(now), -1); }
    // A kept record { date, prices } counts only when it is whole and possible: a real date, not after the current D (an
    // older one is kept but asked again), and prices of configured pairs only, each a number > 0 (any subset: what is
    // missing is asked again); anything else is ignored (and asked again).
    function validPrices(m) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
      for (var k in m) if (m.hasOwnProperty(k) && (pairs.indexOf(k) < 0 || !positive(m[k]))) return false;
      return true;
    }
    function validBasis(e, now) { return !!e && Tz.validDate(e.date) && e.date <= basisDate(now) && validPrices(e.prices); }
    // D's currencies' table from its prices: every code's rate, or none (never half a table on screen).
    function ratesOf(prices) {
      var rates = {};
      for (var i = 0; i < codes.length; i++) {
        rates[codes[i]] = codes[i] === DOLLAR ? 1 : prices[DOLLAR + '-' + codes[i]];
        if (!positive(rates[codes[i]])) return null;
      }
      return rates;
    }
    // The basis in memory: the kept prices and the currencies' table they make (never kept on the TV: it is derived).
    function basisOf(date, prices) { return { date: date, prices: prices, rates: ratesOf(prices) }; }
    function readBasis(now) {
      if (!deps.storage) return null;
      try {
        var e = JSON.parse(deps.storage.getItem(cb.basisKey));
        if (e === null) return null;
        if (validBasis(e, now)) return basisOf(e.date, e.prices);
        log(cb.basisKey + ': not restored: invalid');
        return null;
      } catch (err) { log(cb.basisKey + ': not restored: ' + err.message); return null; }
    }
    function keepBasis(b) {
      basis = b;
      if (!deps.storage) return;
      try { deps.storage.setItem(cb.basisKey, JSON.stringify({ date: b.date, prices: b.prices })); } catch (err) { log(cb.basisKey + ': not kept: ' + err.message); }
    }
    // The basis that counts at `now`: the current D's, else none (a stale day's basis never counts).
    function basisFor(now) { return basis && basis.date === basisDate(now) ? basis : null; }
    // A currency's dated spot (one pair a request: Coinbase has no batched fiat answer), and every coin's in ONE request (the
    // dollar's dated spots of every asset: the configured coins are picked from it).
    function pairJob(date, pair) {
      return { url: cb.spot + encodeURIComponent(pair) + '/spot?date=' + date,
        take: function (into, json) { into.spot[pair] = spotRate(json, pair); into.spotDate = date; } };
    }
    function coinsJob(date) {
      return { url: cb.spot + DOLLAR + '/spot?date=' + date,
        take: function (into, json) { var got = coinPrices(json, products); for (var k in got) if (got.hasOwnProperty(k)) into.spot[k] = got[k]; into.spotDate = date; } };
    }
    // The requests for what D's basis still lacks — each missing currency's pair, and one request for the coins while any is
    // missing; none once D's basis is whole.
    function basisJobs(now) {
      var date = basisDate(now), b = basisFor(now), jobs = [], coins = false;
      for (var i = 0; i < pairs.length; i++) {
        if (b && positive(b.prices[pairs[i]])) continue;
        if (products.indexOf(pairs[i]) < 0) jobs.push(pairJob(date, pairs[i])); else coins = true;
      }
      if (coins) jobs.push(coinsJob(date));
      return jobs;
    }
    // D's basis with one round's spot answers added (a new object, never the kept one changed): every price kept, every one
    // that came; the same basis when nothing was added.
    function withSpots(date, spot) {
      var kept = basis && basis.date === date ? basis.prices : {}, prices = {}, added = false;
      for (var i = 0; i < pairs.length; i++) {
        var v = positive(kept[pairs[i]]) ? kept[pairs[i]] : spot[pairs[i]];
        if (positive(v)) { prices[pairs[i]] = v; added = added || v !== kept[pairs[i]]; }
      }
      return added ? basisOf(date, prices) : basis;
    }
    // What the card says the change is measured from: D 00:00 UTC as a home date (the UTC date D without the home clock).
    function sinceOf(date) {
      var w = deps.wallAt ? deps.wallAt(Tz.dateMs(date)) : null;
      return w && w.ok ? Tz.wallDate(w) : date;
    }

    // ---- back-off: a 429, or any refusal naming a Retry-After still ahead, holds back that host only ----
    function held(url, now) { var h = hold[hostOf(url)]; return !!h && now < h; }
    // C2 (Codex): parallel refusals never shorten a hold — the later deadline wins.
    function holdBack(url, err, meta) {
      var now = deps.now(), until = Net.retryAfterAt(meta ? meta.retryAfter : '', now), host = hostOf(url);   // until 0: none named
      if (err !== 'http 429' && !until) return;
      hold[host] = Math.max(hold[host] || 0, now + Math.min(until ? until - now : cfg.backoffMs, cfg.backoffMaxMs));
      log('markets: ' + host + ' answered ' + err + ': held back ' + Math.round((hold[host] - now) / 1000) + ' s');
    }

    // ---- what one answer gives a round: take(into (the round's own collection), json, readAt (its data's time)) ----
    // The time moves only for an answer that brought at least one configured row.
    function takeQuotes(into, json, readAt) {
      var q = quotes(json), usable = false;
      for (var s in q) if (q.hasOwnProperty(s)) { into.quotes[s] = q[s]; into.quoteAt[s] = readAt; if (bySymbol.hasOwnProperty(s)) { usable = true; lastMeta[bySymbol[s]] = q[s]; } }
      if (usable) into.newest = Math.max(into.newest, readAt);
    }
    function statsJob(request) {
      return { url: request.url, take: function (into, json, readAt) { into.stats[request.product] = stats(json); into.statsAt[request.product] = readAt; into.newest = Math.max(into.newest, readAt); } };
    }
    function takeRates(into, json, readAt) {
      into.rates = rateTable(json, codes);
      into.ratesAt = readAt;
      into.newest = Math.max(into.newest, readAt);
    }

    // A row without a value this round shows its last good one, marked stale — its closed mark recomputed for now from its
    // last trading session; a row with one becomes the last good.
    // A row's own data time: the answer that carried it (batch 25 T5).
    function rowAt(spec) { return spec.yahoo ? got.quoteAt[spec.yahoo] : spec.product ? got.statsAt[spec.product] : got.ratesAt; }
    function withLastGood(snap, now) {
      var anyStale = false, nowS = Math.floor(now / 1000), keptAt = 0;
      for (var i = 0; i < snap.groups.length; i++) {
        var rows = snap.groups[i].rows;
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j], g = lastGood[r.id];
          if (r.price !== null) { lastGood[r.id] = r; lastGoodAt[r.id] = rowAt(cfg.groups[i].rows[j]); }
          else if (g) {
            rows[j] = copyRow(g, { closed: lastMeta[g.id] ? closedAt(lastMeta[g.id], nowS) : g.closed, stale: true });
            anyStale = true;
            keptAt = keptAt ? Math.min(keptAt, lastGoodAt[r.id]) : lastGoodAt[r.id];
          }
        }
      }
      // Stale rows came with an earlier snapshot: the newest data shown is at most that snapshot's time.
      if (anyStale && current) snap.updatedAt = Math.max(snap.updatedAt, current.updatedAt);
      if (keptAt) snap.keptAt = keptAt;
      return snap;
    }
    function build() {
      var now = deps.now();
      return fxNow(withLastGood(snapshot(cfg, { quotes: got.quotes, stats: got.stats, rates: got.rates, basis: null,
        updatedAt: Math.max(at.yahoo, at.coinbase) }, now), now), now);
    }
    function groupWith(g, rows, since) { var o = { id: g.id, rows: rows }; if (since) o.since = since; return o; }
    // Every currency's and coin's change (fresh or kept) and its card's «since» for `now` — the same snapshot object while
    // nothing changes, so the minute tick redraws nothing; across 00:00 UTC the old day's change goes with no request.
    function fxNow(snap, now) {
      if (!snap) return snap;
      var b = basisFor(now), groups = null;
      for (var i = 0; i < snap.groups.length; i++) {
        var spec = cfg.groups[i].rows, rows = snap.groups[i].rows, out = null, any = false;
        for (var j = 0; j < rows.length; j++) {
          if (!spec[j].code && !spec[j].product) continue;
          var pct = changeFrom(rows[j].price, b, spec[j]);
          if (pct !== null) any = true;
          if (pct === rows[j].changePct) continue;
          out = out || rows.slice();
          out[j] = copyRow(rows[j], { changePct: pct });
        }
        var since = any ? sinceOf(b.date) : undefined;
        if (out || since !== snap.groups[i].since) { groups = groups || snap.groups.slice(); groups[i] = groupWith(snap.groups[i], out || rows, since); }
      }
      return groups ? Obj.copyWith(snap, { groups: groups }) : snap;
    }

    // One source, s: { name, jobsAt(now) (the round's requests: [{ url, take }]), fields (of `got` its round replaces),
    // refreshMs (its cadence) }. A round sends every job whose host is not held back, all at once, and is shown when its last
    // answer is in; a source's rows it did not give this round are kept (stale). FIX-BATCH-19 3 (P7) / FIX-19B: the round returns cancel(reason) — the TV hid
    // the page, or the screen was left before any answer came: every request still in flight is aborted and the round draws
    // nothing (OnView asks again on the next arrival). Left once an answer has come, the round declines (false) and ends in
    // the background, so a slow network never starves the screen; its snapshot is there on the return.
    function source(s) {
      function round(done) {
        var start = deps.now(), jobs = s.jobsAt(start), live = [], pending = [];
        var into = { quotes: {}, quoteAt: {}, stats: {}, statsAt: {}, rates: null, ratesAt: 0, spot: {}, spotDate: '', newest: 0 };
        var left, arrived = 0, cancelled = false, i;
        for (i = 0; i < jobs.length; i++) if (!held(jobs[i].url, start)) live.push(jobs[i]);
        // The round is over before it is drawn: a render that throws never stops the cadence.
        function finish() {
          for (var f = 0; f < s.fields.length; f++) got[s.fields[f]] = into[s.fields[f]];
          if (into.newest) at[s.name] = into.newest;
          if (into.spotDate) { var b = withSpots(into.spotDate, into.spot); if (b && b !== basis) keepBasis(b); }
          current = build();
          done();
          deps.onChange(current);
        }
        left = live.length;
        if (!left) { finish(); return; }
        for (i = 0; i < live.length; i++) (function (job) {
          pending.push(deps.getJson(job.url, cfg.timeoutMs, function (err, json, meta) {
            if (cancelled) return;
            if (err) holdBack(job.url, err, meta);
            else { arrived++; try { job.take(into, json, dataAt(meta, deps.now())); } catch (e) { log(e.message); } }   // unreadable or incomplete: its rows stay empty
            if (!--left) finish();
          }));
        })(live[i]);
        return function (reason) {
          if (reason === 'leave' && arrived > 0) return false;
          cancelled = true;
          for (var k = 0; k < pending.length; k++) if (pending[k] && pending[k].abort) pending[k].abort();
        };
      }
      return OnView.create(s.refreshMs, deps, round);
    }

    var yahooJobs = [], coinbaseJobs = [], i;
    for (i = 0; i < requests.spark.length; i++) yahooJobs.push({ url: requests.spark[i], take: takeQuotes });
    for (i = 0; i < requests.stats.length; i++) coinbaseJobs.push(statsJob(requests.stats[i]));
    coinbaseJobs.push({ url: requests.rates, take: takeRates });
    // Coinbase's round also asks for what the current D's basis lacks (once per UTC day, in parallel with the rest).
    function coinbaseJobsAt(now) { var extra = basisJobs(now); return extra.length ? coinbaseJobs.concat(extra) : coinbaseJobs; }
    var gates = [source({ name: 'yahoo', jobsAt: function () { return yahooJobs; }, fields: ['quotes', 'quoteAt'], refreshMs: cfg.refreshMs }),
      source({ name: 'coinbase', jobsAt: coinbaseJobsAt, fields: ['stats', 'statsAt', 'rates', 'ratesAt'], refreshMs: cb.refreshMs })];

    // A2: the closed marks for `now`, from each priced quote's last session (no request); the same snapshot object while no
    // mark changes, so the minute tick redraws nothing.
    function closedNow(snap, now) {
      if (!snap) return snap;
      var nowS = Math.floor(now / 1000), groups = null;
      for (var i = 0; i < snap.groups.length; i++) {
        var rows = snap.groups[i].rows, out = null;
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j], m = lastMeta[r.id], c = m && r.price !== null && typeof r.closed === 'boolean' ? closedAt(m, nowS) : r.closed;
          if (c === r.closed) continue;
          out = out || rows.slice();
          out[j] = copyRow(r, { closed: c });
        }
        if (out) { groups = groups || snap.groups.slice(); groups[i] = groupWith(snap.groups[i], out, snap.groups[i].since); }
      }
      return groups ? Obj.copyWith(snap, { groups: groups }) : snap;
    }

    return {
      // The Markets screen came into view (explicit: the remote opened it, or the language changed on it) or left it: both
      // sources' gates follow it.
      setVisible: function (v, explicit) { for (var g = 0; g < gates.length; g++) gates[g].setVisible(v, explicit); },
      // The TV hid or showed the page.
      visibilityChanged: function () { for (var g = 0; g < gates.length; g++) gates[g].visibilityChanged(); },
      snapshot: function () { return current; },
      // { kind: 'loading' | 'failed' | 'stale' | 'fresh', snapshot, updatedAt } — what the header says (kindOf). updatedAt:
      // the newest data's time, or — while any row is kept — the OLDEST kept row's (batch 25 T5).
      state: function () {
        var now = deps.now();
        current = fxNow(closedNow(current, now), now);
        return { kind: kindOf(cfg, current, now), snapshot: current, updatedAt: !current ? 0 : current.keptAt || current.updatedAt };
      }
    };
  }

  return { plan: plan, quotes: quotes, stats: stats, rateTable: rateTable, snapshot: snapshot,
    createController: createController };
})();
