/* Markets: shares, crypto, indices, currencies and commodities (Config.markets). ES5.
 * Sources, checked 2026-11-02 (tests/fixtures/markets):
 *   Yahoo v7/finance/spark?symbols=A,B,…&range=1d&interval=1d — no key, no crumb; up to 20 symbols per request; answers
 *     in any order, one { symbol, response: [{ meta }] } each: meta.regularMarketPrice, .regularMarketChangePercent (the
 *     source's own day change, used as given), .currency ('ILA' = agorot on the Tel Aviv exchange), .instrumentType,
 *     .currentTradingPeriod.regular { start, end } (epoch seconds; a 24-hour market's session runs 00:00–23:59).
 *   open.er-api.com/v6/latest/<BASE> — no key; one daily table { result: 'success', base_code, rates: { UAH: units for
 *     ONE base unit, … }, time_next_update_unix }. (Its ILS and USD tables are computed apart: a cross rate taken from one
 *     differs from the other's own figure by 0.5%, so each row reads the table of its own base.)
 *   Markets.plan(cfg)               the round's requests: { spark: [url], rates: [{ base, url }] }
 *   Markets.quotes(json)            one spark answer → { symbol: meta } for every symbol with a price; a foreign shape throws
 *   Markets.rateTable(json, base)   one rates answer → its rates; anything but that base's successful table throws
 *   Markets.snapshot(cfg, data, nowMs)   the MarketsSnapshot of data = { quotes, tables: { base: rates }, updatedAt }
 *   Markets.createController(cfg, deps)  asked only while the screen is on view (js/onview.js); snapshot() is null until
 *                                   the first answers, then the latest snapshot; state() says what the header says
 * MarketsSnapshot: { updatedAt, groups: [{ id, rows: [{ id, price, currency, changePct, closed, stale? }] }] } — every
 * configured row in the configured order. A row its source did not give this round keeps its last good values with
 * stale: true (as weather and news keep theirs); one that never had a value has price null (never dropped, never made up).
 * closed: a quote's market is outside its regular session (true / false); null for a daily rate, which has no trading
 * hours. updatedAt is the arrival time of the newest usable data shown (0: none). */
var Markets = (function () {
  var CURRENCIES = { USD: true, ILS: true, UAH: true, RUB: true, EUR: true };
  var LAST_MINUTE_S = 60;                          // a 24-hour session's `end` is its last minute, not its end
  var DAY_SESSION_S = 24 * 3600 - LAST_MINUTE_S;   // 00:00–23:59: how Yahoo names a 24-hour market's session

  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function eachRow(cfg, f) {
    for (var i = 0; i < cfg.groups.length; i++) for (var j = 0; j < cfg.groups[i].rows.length; j++) f(cfg.groups[i].rows[j]);
  }

  function sparkUrl(cfg, symbols) {
    var enc = [];
    for (var i = 0; i < symbols.length; i++) enc.push(encodeURIComponent(symbols[i]));
    return cfg.spark + '?symbols=' + enc.join(',') + '&range=1d&interval=1d';
  }
  function plan(cfg) {
    var symbols = [], bases = [], spark = [], rates = [], i;
    eachRow(cfg, function (r) {
      if (r.yahoo) symbols.push(r.yahoo);
      else if (bases.indexOf(r.base) < 0) bases.push(r.base);
    });
    for (i = 0; i < symbols.length; i += cfg.perRequest) spark.push(sparkUrl(cfg, symbols.slice(i, i + cfg.perRequest)));
    for (i = 0; i < bases.length; i++) rates.push({ base: bases[i], url: cfg.rates + bases[i] });
    return { spark: spark, rates: rates };
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
  function rateTable(json, base) {
    if (!json || json.result !== 'success' || json.base_code !== base || !json.rates || typeof json.rates !== 'object') {
      throw new Error('markets: unexpected rates shape');
    }
    return json.rates;
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
  function rateRow(row, table) {
    var v = table ? table[row.code] : undefined;
    if (!finite(v) || v <= 0) return emptyRow(row.id, null);
    return { id: row.id, price: v, currency: row.code, changePct: null, closed: null };
  }

  function snapshot(cfg, data, nowMs) {
    var nowS = Math.floor(nowMs / 1000), groups = [];
    for (var i = 0; i < cfg.groups.length; i++) {
      var g = cfg.groups[i], rows = [];
      for (var j = 0; j < g.rows.length; j++) {
        var r = g.rows[j];
        rows.push(r.yahoo ? quoteRow(r.id, data.quotes[r.yahoo], nowS) : rateRow(r, data.tables[r.base]));
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
    for (var i = 0; i < snap.groups.length; i++) {
      for (var j = 0; j < snap.groups[i].rows.length; j++) {
        var r = snap.groups[i].rows[j];
        if (r.price === null) gaps++; else { priced++; if (r.stale) kept++; }
      }
    }
    if (!priced) return 'failed';
    return kept || gaps || now - snap.updatedAt > cfg.staleAfterMs ? 'stale' : 'fresh';
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, documentVisible() (optional), onChange(snapshot) }
  function createController(cfg, deps) {
    var requests = plan(cfg), kept = {}, lastGood = {}, lastMeta = {}, current = null;   // kept: base → { table, receivedAt, until }
    var bySymbol = {}, needs = {};                 // Yahoo symbol → row id; base → the codes its rows read
    eachRow(cfg, function (r) {
      if (r.yahoo) bySymbol[r.yahoo] = r.id;
      else (needs[r.base] = needs[r.base] || []).push(r.code);
    });

    function isCurrent(k, now) { return !!k && now >= k.receivedAt && now < k.until; }
    // A table is kept only when it has every code its rows read, as a number > 0 (an incomplete one is a failed refresh
    // of that base: asked again next round, and never put over a complete one); then until the provider's next update
    // (at most rateReuseMaxMs) and never shorter than one refreshMs, so a past or missing next-update keeps it this round.
    function keep(base, json, now) {
      var table = rateTable(json, base), codes = needs[base];
      for (var i = 0; i < codes.length; i++) if (!finite(table[codes[i]]) || table[codes[i]] <= 0) throw new Error('markets: incomplete rates for ' + base);
      var next = json.time_next_update_unix * 1000, ahead = finite(next) ? Math.min(next - now, cfg.rateReuseMaxMs) : 0;
      kept[base] = { table: table, receivedAt: now, until: now + Math.max(ahead, cfg.refreshMs) };
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
            rows[j] = { id: g.id, price: g.price, currency: g.currency, changePct: g.changePct,
              closed: lastMeta[g.id] ? closedAt(lastMeta[g.id], nowS) : g.closed, stale: true };
            anyStale = true;
          }
        }
      }
      // Stale rows came with an earlier snapshot: the newest data shown is at most that snapshot's time.
      if (anyStale && current) snap.updatedAt = Math.max(snap.updatedAt, current.updatedAt);
      return snap;
    }

    // One round: every spark request and every rates table that is not current, all at once. The quotes are shown as soon
    // as every spark answer is in (with the rate tables that are current); the round shows its whole result when it ends.
    function round(done) {
      var start = deps.now(), found = {}, newest = 0, jobs = [], sparkLeft = requests.spark.length, left, i;
      // The time moves only for an answer that brought at least one configured row.
      function takeQuotes(json, now) {
        var q = quotes(json), usable = false;
        for (var s in q) if (q.hasOwnProperty(s)) { found[s] = q[s]; if (bySymbol.hasOwnProperty(s)) { usable = true; lastMeta[bySymbol[s]] = q[s]; } }
        if (usable) newest = Math.max(newest, now);
      }
      function takeRates(base, json, now) { keep(base, json, now); newest = Math.max(newest, now); }
      for (i = 0; i < requests.spark.length; i++) jobs.push({ url: requests.spark[i], take: takeQuotes, spark: true });
      for (i = 0; i < requests.rates.length; i++) {
        var r = requests.rates[i];
        if (!isCurrent(kept[r.base], start)) jobs.push({ url: r.url, take: takeRates.bind(null, r.base) });
      }
      function build() {
        var now = deps.now(), tables = {};
        for (var b in kept) if (kept.hasOwnProperty(b) && isCurrent(kept[b], now)) { tables[b] = kept[b].table; newest = Math.max(newest, kept[b].receivedAt); }
        return withLastGood(snapshot(cfg, { quotes: found, tables: tables, updatedAt: newest }, now), now);
      }
      // The round is over before it is drawn: a render that throws never stops the cadence.
      function finish() {
        current = build();
        done();
        deps.onChange(current);
      }
      left = jobs.length;
      if (!left) { finish(); return; }
      for (i = 0; i < jobs.length; i++) (function (job) {
        deps.getJson(job.url, cfg.timeoutMs, function (err, json) {
          if (!err) { try { job.take(json, deps.now()); } catch (e) { /* an unreadable or incomplete answer: its rows stay empty */ } }
          left--;
          if (job.spark) sparkLeft--;
          if (!left) finish();
          else if (job.spark && !sparkLeft) { current = build(); deps.onChange(current); }
        });
      })(jobs[i]);
    }

    var gate = OnView.create(cfg.refreshMs, deps, round);
    return {
      // The Markets screen came into view (explicit: the remote opened it, or the language changed on it) or left it.
      setVisible: gate.setVisible,
      // The TV hid or showed the page.
      visibilityChanged: gate.visibilityChanged,
      snapshot: function () { return current; },
      // { kind: 'loading' | 'failed' | 'stale' | 'fresh', snapshot, updatedAt } — what the header says (kindOf).
      state: function () { return { kind: kindOf(cfg, current, deps.now()), snapshot: current, updatedAt: current ? current.updatedAt : 0 }; }
    };
  }

  return { plan: plan, quotes: quotes, rateTable: rateTable, snapshot: snapshot, createController: createController };
})();
