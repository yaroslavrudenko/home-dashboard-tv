/* Markets: shares, crypto, indices, currencies and commodities (Config.markets). ES5.
 * Sources (tests/fixtures/markets):
 *   Yahoo v7/finance/spark?symbols=A,B,…&range=1d&interval=1d (checked 2026-11-02) — no key, no crumb; up to 20 symbols per
 *     request; answers in any order, one { symbol, response: [{ meta }] } each: meta.regularMarketPrice,
 *     .regularMarketChangePercent (the source's own day change, used as given), .currency ('ILA' = agorot on the Tel Aviv
 *     exchange), .instrumentType, .currentTradingPeriod.regular { start, end } (epoch seconds; a 24-hour market's session
 *     runs 00:00–23:59).
 *   Coinbase (checked 2026-11-04, owner 2026-11-04: crypto and every currency from Coinbase, every minute):
 *     api.exchange.coinbase.com/products/<P>/stats — { open (the price 24 hours earlier), high, low, last, volume, … } as
 *       strings; a product Coinbase does not trade answers { message: 'NotFound' } (TRX-USD).
 *     api.coinbase.com/v2/exchange-rates?currency=USD — { data: { currency: 'USD', rates: { ILS: '3.1663775', … } } }:
 *       units of each currency for ONE dollar, as strings.
 *   Markets.plan(cfg)                the requests: { spark: [url], stats: [{ product, url }], rates: url }
 *   Markets.quotes(json)             one spark answer → { symbol: meta } for every symbol with a price; a foreign shape throws
 *   Markets.stats(json)              one stats answer → { last, open } (numbers > 0); anything else throws
 *   Markets.rateTable(json, codes)   one exchange-rates answer → { code: units for one dollar } of exactly `codes`; a foreign
 *                                    shape, another base, or a code missing or not > 0 throws (never half a table)
 *   Markets.snapshot(cfg, data, nowMs)   the MarketsSnapshot of data = { quotes, stats: { product: { last, open } },
 *                                    rates (a rateTable or null), basis (a rateTable to measure the currencies against, or
 *                                    null), updatedAt }
 *   Markets.createController(cfg, deps)  two sources, each on its own on-view gate (js/onview.js) and cadence: Yahoo every
 *                                    cfg.refreshMs, Coinbase every cfg.coinbase.refreshMs; snapshot() is null until the
 *                                    first answers, then the latest snapshot; state() says what the header says
 * MarketsSnapshot: { updatedAt, groups: [{ id, rows: [{ id, price, currency, changePct, closed, stale?, unit? }], since? }] } —
 * every configured row in the configured order. changePct: a quote's — Yahoo's own day change; a crypto row's — against its
 * price 24 hours earlier; a currency row's — against the basis: the FIRST rates table the dashboard read on the current home
 * (Israel) calendar day (batch 23C, the owner's «а», 2026-11-04: an honest label from the actual basis time), and only for a
 * LATER table of that same day — the first table of the day IS the basis, so it shows no change; across the home day's
 * boundary it is null until the new day's basis and a later table are in (checked on every state(), no request needed) —
 * never a stale or guessed basis. since: on a group whose rows carry such a change, the home wall time the basis was read
 * ("% с 07:31": what the card says it is measured from).
 * A row its source did not give in that source's last round keeps its last good values with stale: true (as weather and news
 * keep theirs); one that never had a value has price null (never dropped, never made up). closed: a quote's market is outside
 * its regular session (true / false; it follows the clock between rounds, A2); false for crypto (it trades around the
 * clock); null for a currency rate, a reference rate with no trading hours. unit: what a commodity's price is for (the
 * configured row's unit: 'barrel', 'ounce', …). updatedAt is the arrival time of the newest usable data shown (0: none). */
var Markets = (function () {
  var CURRENCIES = { USD: true, ILS: true, UAH: true, RUB: true, EUR: true };
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
    var last = numberOf(json && json.last), open = numberOf(json && json.open);
    if (!positive(last) || !positive(open)) throw new Error('markets: unexpected stats shape');
    return { last: last, open: open };
  }
  function rateTable(json, codes) {
    var d = json && json.data, rates = d && d.rates, out = {};
    if (!d || d.currency !== 'USD' || !rates || typeof rates !== 'object') throw new Error('markets: unexpected rates shape');
    for (var i = 0; i < codes.length; i++) {
      var v = numberOf(rates[codes[i]]);
      if (!positive(v)) throw new Error('markets: no rate for ' + codes[i]);
      out[codes[i]] = v;
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
  // A crypto product: its last price in the product's quote currency (BTC-USD: USD), the change against 24 hours earlier.
  function statsRow(row, s) {
    if (!s || !positive(s.last) || !positive(s.open)) return emptyRow(row.id, false);
    var currency = row.product.split('-')[1];
    return { id: row.id, price: s.last, currency: CURRENCIES.hasOwnProperty(currency) ? currency : null, changePct: (s.last / s.open - 1) * 100, closed: false };
  }
  // `code` units for one `base` from a dollar table; null without both as numbers > 0 (N2: snapshot() is a public pure
  // function, so it keeps its own guard, whatever table it is handed).
  function cross(table, row) {
    var x = table ? table[row.code] : undefined, y = table ? table[row.base] : undefined;
    return positive(x) && positive(y) ? x / y : null;
  }
  // A currency's change against a basis table (null without one, or without its two codes).
  function changeFrom(price, basis, row) {
    var m = cross(basis, row);
    return price === null || m === null ? null : (price / m - 1) * 100;
  }
  function rateRow(row, rates, basis) {
    var v = cross(rates, row);
    if (v === null) return emptyRow(row.id, null);
    return { id: row.id, price: v, currency: row.code, changePct: changeFrom(v, basis, row), closed: null };
  }
  function rowOf(r, data, nowS) {
    if (r.yahoo) return quoteRow(r.id, data.quotes[r.yahoo], nowS);
    if (r.product) return statsRow(r, data.stats[r.product]);
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
  //         log(message) (optional), wallAt(ms) (optional: the home clock's Tz.wallTime — says the basis as a home time;
  //         without it no currency change), storage (optional: localStorage or null; the day's basis kept on the TV) }
  function createController(cfg, deps) {
    var log = deps.log || function () {}, cb = cfg.coinbase, codes = rateCodes(cfg), requests = plan(cfg);
    var lastGood = {}, lastMeta = {}, current = null, hold = {}, bySymbol = {};   // hold: host → not asked before (ms)
    // What each source's last round gave (got), the time of its newest data (at), and the data time of the last good rates
    // table (lastRatesAt: the FX rows shown, fresh or kept, are from it).
    var got = { quotes: {}, stats: {}, rates: null, ratesAt: 0 }, at = { yahoo: 0, coinbase: 0 }, lastRatesAt = 0;
    var basis = readBasis(deps.now());   // { day (home), at (the table's data time), rates: { code: units for one dollar } }
    eachRow(cfg, function (r) { if (r.yahoo) bySymbol[r.yahoo] = r.id; });

    // FIX-BATCH-19 4 (P10): «Обновлено» is the time the data were made — the answer's Date − Age (js/net.js getJsonDated) when
    // the source gives it, never later than its arrival nor earlier than httpAgeMaxMs before it; else the arrival.
    function dataAt(meta, now) {
      var d = meta && meta.dataAt;
      return finite(d) ? Math.max(now - cfg.httpAgeMaxMs, Math.min(now, d)) : now;
    }

    // ---- the basis (batch 23C, the owner's «а»): the first rates table read on the home calendar day, kept on the TV ----
    // The home (Israel) calendar day of a moment, by the home clock's zone rule (js/tz.js); null when the zone is unknown.
    function homeDay(ms) {
      var w = deps.wallAt ? deps.wallAt(ms) : null;
      return w && w.ok ? Tz.wallDate(w) : null;
    }
    // C3 (Codex): a kept record counts only when it is whole and possible — read never in the future, on the very home day it
    // names (so a day in any other form never matches), and exactly the rates the rows read, each a number > 0; anything
    // else is ignored (the day's first table then becomes the basis).
    function validBasis(e, now) {
      if (!e || !finite(e.at) || e.at > now || homeDay(e.at) !== e.day || !e.rates || typeof e.rates !== 'object') return false;
      for (var k in e.rates) if (e.rates.hasOwnProperty(k) && codes.indexOf(k) < 0) return false;
      for (var i = 0; i < codes.length; i++) if (!positive(e.rates[codes[i]])) return false;
      return true;
    }
    function readBasis(now) {
      if (!deps.storage) return null;
      try {
        var e = JSON.parse(deps.storage.getItem(cb.basisKey));
        if (e === null || validBasis(e, now)) return e;
        log(cb.basisKey + ': not restored: invalid');
        return null;
      } catch (err) { log(cb.basisKey + ': not restored: ' + err.message); return null; }
    }
    // A rates table read at readAt becomes the basis when it is the first of its home day: a later table of the same day never
    // replaces it (N3), and a table of an earlier day — a late or cached answer from before midnight — never replaces today's
    // (S1).
    function noteBasis(readAt, table) {
      var day = homeDay(readAt);
      if (!day || (basis && basis.day >= day)) return;
      basis = { day: day, at: readAt, rates: table };
      if (!deps.storage) return;
      try { deps.storage.setItem(cb.basisKey, JSON.stringify(basis)); } catch (err) { log(cb.basisKey + ': not kept: ' + err.message); }
    }
    // C1 (Codex): the basis that counts at `now` — today's (home day), for a LATER table (the first table is the basis itself:
    // no change yet; a table read after today's basis is today's) — with its home time («since»); else none.
    function basisAt(now) {
      var today = homeDay(now);
      if (!today || !basis || basis.day !== today || !(lastRatesAt > basis.at)) return null;
      return { since: Tz.hhmm(deps.wallAt(basis.at)), table: basis.rates };
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
      for (var s in q) if (q.hasOwnProperty(s)) { into.quotes[s] = q[s]; if (bySymbol.hasOwnProperty(s)) { usable = true; lastMeta[bySymbol[s]] = q[s]; } }
      if (usable) into.newest = Math.max(into.newest, readAt);
    }
    function statsJob(request) {
      return { url: request.url, take: function (into, json, readAt) { into.stats[request.product] = stats(json); into.newest = Math.max(into.newest, readAt); } };
    }
    function takeRates(into, json, readAt) {
      into.rates = rateTable(json, codes);
      into.ratesAt = readAt;
      into.newest = Math.max(into.newest, readAt);
    }

    // A row without a value this round shows its last good one, marked stale — its closed mark recomputed for now from its
    // last trading session; a row with one becomes the last good.
    function withLastGood(snap, now) {
      var anyStale = false, nowS = Math.floor(now / 1000);
      for (var i = 0; i < snap.groups.length; i++) {
        var rows = snap.groups[i].rows;
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j], g = lastGood[r.id];
          if (r.price !== null) lastGood[r.id] = r;
          else if (g) {
            rows[j] = copyRow(g, { closed: lastMeta[g.id] ? closedAt(lastMeta[g.id], nowS) : g.closed, stale: true });
            anyStale = true;
          }
        }
      }
      // Stale rows came with an earlier snapshot: the newest data shown is at most that snapshot's time.
      if (anyStale && current) snap.updatedAt = Math.max(snap.updatedAt, current.updatedAt);
      return snap;
    }
    function build() {
      var now = deps.now();
      return fxNow(withLastGood(snapshot(cfg, { quotes: got.quotes, stats: got.stats, rates: got.rates, basis: null,
        updatedAt: Math.max(at.yahoo, at.coinbase) }, now), now), now);
    }
    function groupWith(g, rows, since) { var o = { id: g.id, rows: rows }; if (since) o.since = since; return o; }
    // C1: every currency row's change (fresh or kept) and its card's «since» for `now` — the same snapshot object while
    // nothing changes, so the minute tick redraws nothing; across 00:00 Israel time the change goes with no request.
    function fxNow(snap, now) {
      if (!snap) return snap;
      var b = basisAt(now), groups = null;
      for (var i = 0; i < snap.groups.length; i++) {
        var spec = cfg.groups[i].rows, rows = snap.groups[i].rows, out = null, any = false;
        for (var j = 0; j < rows.length; j++) {
          if (!spec[j].code) continue;
          var pct = b ? changeFrom(rows[j].price, b.table, spec[j]) : null;
          if (pct !== null) any = true;
          if (pct === rows[j].changePct) continue;
          out = out || rows.slice();
          out[j] = copyRow(rows[j], { changePct: pct });
        }
        var since = any ? b.since : undefined;
        if (out || since !== snap.groups[i].since) { groups = groups || snap.groups.slice(); groups[i] = groupWith(snap.groups[i], out || rows, since); }
      }
      return groups ? { updatedAt: snap.updatedAt, groups: groups } : snap;
    }

    // One source, s: { name, jobs ([{ url, take }]), fields (of `got` its round replaces), refreshMs (its cadence) }. A round
    // sends every job whose host is not held back, all at once, and is shown when its last answer is in; a source's rows it
    // did not give this round are kept (stale). FIX-BATCH-19 3 (P7) / FIX-19B: the round returns cancel(reason) — the TV hid
    // the page, or the screen was left before any answer came: every request still in flight is aborted and the round draws
    // nothing (OnView asks again on the next arrival). Left once an answer has come, the round declines (false) and ends in
    // the background, so a slow network never starves the screen; its snapshot is there on the return.
    function source(s) {
      function round(done) {
        var start = deps.now(), into = { quotes: {}, stats: {}, rates: null, ratesAt: 0, newest: 0 }, live = [], pending = [];
        var left, arrived = 0, cancelled = false, i;
        for (i = 0; i < s.jobs.length; i++) if (!held(s.jobs[i].url, start)) live.push(s.jobs[i]);
        // The round is over before it is drawn: a render that throws never stops the cadence.
        function finish() {
          for (var f = 0; f < s.fields.length; f++) got[s.fields[f]] = into[s.fields[f]];
          if (into.newest) at[s.name] = into.newest;
          if (into.rates) { lastRatesAt = into.ratesAt; noteBasis(into.ratesAt, into.rates); }
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
    var gates = [source({ name: 'yahoo', jobs: yahooJobs, fields: ['quotes'], refreshMs: cfg.refreshMs }),
      source({ name: 'coinbase', jobs: coinbaseJobs, fields: ['stats', 'rates', 'ratesAt'], refreshMs: cb.refreshMs })];

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
      return groups ? { updatedAt: snap.updatedAt, groups: groups } : snap;
    }

    return {
      // The Markets screen came into view (explicit: the remote opened it, or the language changed on it) or left it: both
      // sources' gates follow it.
      setVisible: function (v, explicit) { for (var g = 0; g < gates.length; g++) gates[g].setVisible(v, explicit); },
      // The TV hid or showed the page.
      visibilityChanged: function () { for (var g = 0; g < gates.length; g++) gates[g].visibilityChanged(); },
      snapshot: function () { return current; },
      // { kind: 'loading' | 'failed' | 'stale' | 'fresh', snapshot, updatedAt } — what the header says (kindOf).
      state: function () {
        var now = deps.now();
        current = fxNow(closedNow(current, now), now);
        return { kind: kindOf(cfg, current, now), snapshot: current, updatedAt: current ? current.updatedAt : 0 };
      }
    };
  }

  return { plan: plan, quotes: quotes, stats: stats, rateTable: rateTable, snapshot: snapshot,
    createController: createController };
})();
