/* Traffic from the TomTom Routing API. ES5.
 * Every route is one item of ONE synchronous batch request (POST /routing/1/batch/sync/json), asked for its summary
 * only (no geometry): travel time with live traffic, travel time without traffic, the delay and the length.
 *   Traffic.hasKey(cfg)            false while config.js still holds the build placeholder
 *   Traffic.request(cfg)           { url, body } of the batch request (one item per route)
 *   Traffic.parse(json, n)         n summaries (null where an item failed) from the batch answer; throws unless it
 *                                  is a batch answer with exactly n items
 *   Traffic.level(summary, cfg)    'ok' | 'slow' | 'jam': travel time against free flow
 *   Traffic.decide(cfg, facts)     'due', or why a batch may not be sent now (THE gate; see below)
 *   Traffic.correct(record, now)   the accounting record after a clock correction, or null when none is needed
 *   Traffic.createStore(cfg, deps) the store: asks decide() on every path, keeps the accounting record and the row cache
 * When a batch is sent (the judges' COMMON DECISION 2026-10-30 and the owner's explicit-open rule; cfg.schedule):
 * only while the traffic screen is the one on view AND the TV shows it (document visible), one batch at a time, with a
 * valid accounting record, and never past dailyItemCap (580) items on the UTC date. On top of that: an explicit ◀ ▶
 * open sends at once (openMinIntervalMs: 0); every other path — a rotation arrival, the screen staying open, wake —
 * waits minIntervalMs (25 min) since the last ATTEMPT, at any hour, and a deadline TomTom gave (retryNotBefore).
 * TomTom's free routing tier is 20,000 items a MONTH for the whole account; 580 a UTC date keeps any 31 days ≤ 17,980.
 * The accounting record (localStorage `tt-quota`, { v: 1, utcDate, used, lastAttemptAt, retryNotBefore }) is written
 * and read back BEFORE every POST: used += 10, lastAttemptAt = now; nothing is ever refunded (failure, timeout,
 * refusal, crash) and the answer does not move lastAttemptAt. Storage that fails, or a record that is corrupt, pauses
 * sending. A clock that went back is corrected without sending (Traffic.correct). Any failure — transport, a malformed
 * batch, any item error other than "cannot be routed", a refusal (401/403/429) — keeps the last good values and their
 * times; the rows and their failure state are kept in `tt-cache` and shown at once after a restart. An item TomTom
 * cannot route (NO_ROUTE_FOUND-type) and nothing else is "no data" on its row and a good round. */
var Traffic = (function () {
  var QUERY = '/json?travelMode=car&routeType=fastest&traffic=true&computeTravelTimeFor=all&routeRepresentation=summaryOnly';
  var PERMANENT = /NO_ROUTE_FOUND|MAP_MATCHING_FAILURE/;   // routing answers that a retry cannot change

  function hasKey(cfg) { return typeof cfg.key === 'string' && /^[A-Za-z0-9]+$/.test(cfg.key); }
  function point(p) { return p[0] + ',' + p[1]; }

  function request(cfg) {
    var items = [];
    for (var i = 0; i < cfg.routes.length; i++) items.push({ query: '/calculateRoute/' + point(cfg.routes[i].from) + ':' + point(cfg.routes[i].to) + QUERY });
    return { url: cfg.base + '?key=' + encodeURIComponent(cfg.key), body: { batchItems: items } };
  }

  function seconds(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; }

  function summaryOf(item) {
    var r = item && item.statusCode === 200 && item.response && item.response.routes;
    var s = r && r[0] && r[0].summary;
    if (!s) return null;
    var travel = seconds(s.travelTimeInSeconds), delay = seconds(s.trafficDelayInSeconds);
    if (travel === null) return null;
    var free = seconds(s.noTrafficTravelTimeInSeconds);
    if (free === null) free = delay === null ? travel : Math.max(travel - delay, 0);
    return { travel: travel, free: free, delay: Math.max(travel - free, 0), length: seconds(s.lengthInMeters) };
  }

  // Throws when the answer is not a batch answer for these n items; a single failed item is null.
  function parse(json, n) {
    if (!json || !Array.isArray(json.batchItems) || json.batchItems.length !== n) throw new Error('traffic: not a batch answer');
    var out = [];
    for (var i = 0; i < n; i++) out.push(summaryOf(json.batchItems[i]));
    return out;
  }

  // Why the batch, or one of its items, was refused: 'key' (401 / 403: the key, or TomTom's monthly limit on it) |
  // 'busy' (429: too many requests) | null.
  function refusal(status) { return status === 401 || status === 403 ? 'key' : status === 429 ? 'busy' : null; }
  // A failed item's class: 'key' | 'busy' | 'route' (cannot be routed; never a 5xx) | 'item' (anything else).
  function itemError(item) {
    var code = item && item.statusCode, err = item && item.response && item.response.error;
    return refusal(code) || (!(code >= 500) && err && typeof err.description === 'string' && PERMANENT.test(err.description) ? 'route' : 'item');
  }

  var VERSION = 1, QUOTA = 'tt-quota', CACHE = 'tt-cache', DAY_MS = 86400000, MINUTE = 60000;
  var ROW_ERRORS = { key: 1, busy: 1, route: 1, item: 1, timeout: 1, shape: 1 };

  // The UTC date of a moment, "YYYY-MM-DD" (the accounting day: TomTom counts in UTC, home dates can be 25 h long).
  function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function nextUtcMidnight(ms) { return (Math.floor(ms / DAY_MS) + 1) * DAY_MS; }
  function count(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v; }
  function validRecord(r) {
    return !!r && r.v === VERSION && typeof r.utcDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.utcDate) &&
      count(r.used) && count(r.lastAttemptAt) && count(r.retryNotBefore);
  }
  // Items already used on now's UTC date: a strictly later date starts again at 0.
  function usedOn(r, now) { return r.utcDate < utcDate(now) ? 0 : r.used; }

  // THE gate: may a batch be sent now? facts: { selected (the traffic screen is on view), visible (the TV shows the
  // page), explicitOpen (the remote just opened the screen), busy (a batch in flight), storage (the record was read and
  // is valid), now, utcDate, used, lastAttemptAt, retryNotBefore (the record), items (per batch) }.
  // Returns 'due' | 'busy' | 'hidden' | 'storage' | 'cap' | 'floor' (the first reason that holds, in this order).
  function decide(cfg, f) {
    var s = cfg.schedule;
    if (f.busy) return 'busy';
    if (!f.selected || !f.visible) return 'hidden';
    if (!f.storage) return 'storage';
    if (usedOn(f, f.now) + f.items > s.dailyItemCap) return 'cap';
    if (f.now - f.lastAttemptAt < (f.explicitOpen ? s.openMinIntervalMs : s.minIntervalMs) || f.now < f.retryNotBefore) return 'floor';
    return 'due';
  }

  // A clock that went back: an attempt time in the future is rebased to now; an accounting date in the future becomes
  // today's UTC date with `used` kept (no correction ever grants a fresh budget). Null when nothing needs correcting.
  function correct(r, now) {
    var today = utcDate(now), out = null;
    if (r.lastAttemptAt > now) { out = copyRecord(r); out.lastAttemptAt = now; }
    if (r.utcDate > today) { out = out || copyRecord(r); out.utcDate = today; }
    return out;
  }
  function copyRecord(r) { return { v: VERSION, utcDate: r.utcDate, used: r.used, lastAttemptAt: r.lastAttemptAt, retryNotBefore: r.retryNotBefore }; }

  // The earliest moment decide() can say 'due' to a path other than an explicit open (the cap: the next UTC date too).
  function earliest(cfg, r, n, now) {
    var t = Math.max(r.lastAttemptAt + cfg.schedule.minIntervalMs, r.retryNotBefore);
    return usedOn(r, now) + n > cfg.schedule.dailyItemCap ? Math.max(t, nextUtcMidnight(now)) : t;
  }

  function level(s, cfg) {
    var ratio = s.free > 0 ? s.travel / s.free : 1;
    return ratio >= cfg.redRatio ? 'jam' : ratio >= cfg.amberRatio ? 'slow' : 'ok';
  }

  function validCache(c, n) {
    if (!c || c.v !== VERSION || !Array.isArray(c.rows) || c.rows.length !== n || typeof c.failed !== 'boolean' ||
        (c.problem !== null && c.problem !== 'refused') || !count(c.attemptAt)) return false;
    for (var i = 0; i < n; i++) {
      var r = c.rows[i], d = r && r.data;
      if (!r || !count(r.updatedAt) || (r.error !== null && !ROW_ERRORS[r.error])) return false;
      if (d !== null && !(d && seconds(d.travel) !== null && seconds(d.free) !== null && seconds(d.delay) !== null && (d.length === null || seconds(d.length) !== null))) return false;
    }
    return true;
  }

  // deps: { postJson(url, body, timeoutMs, done), now(), setTimeout, clearTimeout, storage (localStorage or null),
  //         documentVisible() (optional: the TV shows the page; default true), onChange(store) }
  function createStore(cfg, deps) {
    var n = cfg.routes.length, storage = deps.storage || null, rows = [], i;
    var docVisible = deps.documentVisible || function () { return true; };
    var selected = false, inFlight = false, failed = false, problem = null, answeredFor = 0, paused = false;
    var timer = null, generation = 0;

    function readJson(key) { try { return JSON.parse(storage.getItem(key)); } catch (e) { return undefined; } }
    var cached = storage ? readJson(CACHE) : null;
    if (validCache(cached, n)) { rows = cached.rows; failed = cached.failed; problem = cached.problem; answeredFor = cached.attemptAt; }
    else for (i = 0; i < n; i++) rows.push({ data: null, updatedAt: 0, error: null });

    // The accounting record, or null when storage is unusable or the record is corrupt. None stored yet (a first
    // install): a fresh record with no cooldown.
    function account(now) {
      if (!storage) return null;
      var text;
      try { text = storage.getItem(QUOTA); } catch (e) { return null; }
      if (text === null) return { v: VERSION, utcDate: utcDate(now), used: 0, lastAttemptAt: 0, retryNotBefore: 0 };
      var r;
      try { r = JSON.parse(text); } catch (e) { return null; }
      return validRecord(r) ? r : null;
    }
    // Writes the record and reads it back: true only when what is stored is exactly what was written.
    function persist(r) {
      var text = JSON.stringify(copyRecord(r));
      try { storage.setItem(QUOTA, text); paused = storage.getItem(QUOTA) !== text; } catch (e) { paused = true; }
      return !paused;
    }
    function saveCache() {
      try { storage.setItem(CACHE, JSON.stringify({ v: VERSION, rows: rows, failed: failed, problem: problem, attemptAt: answeredFor })); }
      catch (e) { /* the rows on screen still hold for this run */ }
    }

    function facts(now, r, explicit) {
      return { selected: selected, visible: docVisible(), explicitOpen: !!explicit, busy: inFlight, storage: !!r, now: now,
        utcDate: r ? r.utcDate : '', used: r ? r.used : 0, lastAttemptAt: r ? r.lastAttemptAt : 0, retryNotBefore: r ? r.retryNotBefore : 0, items: n };
    }

    // Asked again when the gate can next open (a minute from now while storage is in trouble, and never sooner than a
    // minute after a correction); no timer while not on view or while a batch is in flight.
    function plan(now, r, corrected) {
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      if (!selected || !docVisible() || inFlight) return;
      var at = r && !paused ? earliest(cfg, r, n, now) : now + MINUTE;
      if (corrected) at = Math.max(at, now + MINUTE);
      timer = deps.setTimeout(function () { timer = null; check(false); }, at > now ? at - now : MINUTE);
    }

    // Every path comes here: a clock correction first (it sends nothing), then the gate, then the reservation.
    function check(explicit) {
      var now = deps.now(), r = account(now), fixed = r && correct(r, now);
      if (fixed) { plan(now, persist(fixed) ? fixed : null, true); return; }
      if (decide(cfg, facts(now, r, explicit)) !== 'due') { plan(now, r, false); return; }
      var next = { utcDate: utcDate(now), used: usedOn(r, now) + n, lastAttemptAt: now, retryNotBefore: r.retryNotBefore };
      if (!persist(next)) { plan(now, null, false); deps.onChange(api); return; }
      send(now);
    }

    // Stores the answers; `failed` when the round failed. `problem` remembers a refusal for the screen.
    function accept(err, json) {
      var list = null, bad = 0, broken = false, refused = false, t = deps.now();
      if (!err) { try { list = parse(json, n); } catch (e) { err = 'shape'; } }
      var whole = err ? refusal(+(/^http (\d+)$/.exec(err) || [])[1]) : null;
      for (var i = 0; i < n; i++) {
        var s = rows[i], d = list ? list[i] : null;
        if (d) { s.data = d; s.updatedAt = t; s.error = null; continue; }
        s.error = list ? itemError(json.batchItems[i]) : whole || (ROW_ERRORS[err] ? err : 'item');
        bad++;
        if (s.error === 'key' || s.error === 'busy') refused = true;
        else if (s.error !== 'route') broken = true;
      }
      problem = refused ? 'refused' : null;
      failed = refused || !list || bad === n || broken;
    }

    var req = request(cfg);                        // the same request every time: built once
    function send(at) {
      inFlight = true;
      var mine = generation;
      deps.postJson(req.url, req.body, cfg.timeoutMs, function (err, json) {
        if (mine !== generation) return;           // stopped meanwhile: a late answer changes nothing
        inFlight = false;
        answeredFor = at;
        accept(err, json);
        saveCache();
        var now = deps.now();
        plan(now, account(now), false);
        deps.onChange(api);
      });
      deps.onChange(api);
    }

    // The last attempt failed: its answer said so, or it has no recorded answer at all (the app stopped mid-flight).
    function lastFailed(r) { return failed || (!inFlight && !!r && r.lastAttemptAt > answeredFor); }

    // A row TomTom cannot route shows "no data", never its old value: a retry cannot change that answer.
    function view(i, now, wasFailed) {
      var s = rows[i], age = now - s.updatedAt;
      if (!s.data || s.error === 'route') return { kind: s.error ? 'failed' : 'loading', data: null };
      var future = age < 0;
      return { kind: wasFailed || s.error || future || age > cfg.staleAfterMs ? 'stale' : 'fresh', data: s.data, level: level(s.data, cfg),
        updatedAt: s.updatedAt, future: future };
    }

    var api = {
      // The traffic screen came into view (explicit: the remote opened it with ◀ ▶) or left it.
      setVisible: function (v, explicit) {
        if (!v) {
          selected = false;
          if (timer !== null) deps.clearTimeout(timer);
          timer = null;
          return;
        }
        if (selected && !explicit) return;
        selected = true;
        check(explicit);
      },
      // The TV woke up: asked again at once (the same gate).
      wake: function () { if (selected) check(false); },
      routes: function () {
        var now = deps.now(), f = lastFailed(account(now)), out = [];
        for (var i = 0; i < n; i++) out.push(view(i, now, f));
        return out;
      },
      // The whole screen: kind 'loading' (nothing to show, a batch in flight) | 'failed' (nothing to show) | 'fresh' |
      // 'stale' (a row on screen is old, future-dated, failed, or the last attempt failed); updating (a batch in flight);
      // future (a row's time is ahead of the clock); updatedAt: the OLDEST row with data; problem: 'storage' | 'cap' |
      // 'refused' | null; resumeAt: when the cap or the refusal lets the next attempt go.
      status: function () {
        var now = deps.now(), r = account(now), f = lastFailed(r), any = false, stale = false, future = false, oldest = Infinity;
        for (var i = 0; i < n; i++) {
          var v = view(i, now, f);
          if (!v.data) continue;
          any = true;
          oldest = Math.min(oldest, v.updatedAt);
          if (v.kind !== 'fresh') stale = true;
          if (v.future) future = true;
        }
        var p = !r || paused ? 'storage' : usedOn(r, now) + n > cfg.schedule.dailyItemCap ? 'cap' : problem;
        return { kind: any ? (stale ? 'stale' : 'fresh') : inFlight ? 'loading' : 'failed', updating: inFlight, future: future,
          updatedAt: any ? oldest : 0, problem: p, resumeAt: p === 'cap' || p === 'refused' ? earliest(cfg, r, n, now) : 0 };
      },
      stop: function () {
        generation++;
        inFlight = false;
        if (timer !== null) deps.clearTimeout(timer);
        timer = null;
      }
    };
    return api;
  }

  return { hasKey: hasKey, request: request, parse: parse, level: level, decide: decide, correct: correct, createStore: createStore };
})();
