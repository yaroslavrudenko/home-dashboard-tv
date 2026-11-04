/* Traffic from the Mapbox Directions API, profile driving-traffic (live traffic for Israel; TomTom has none there,
 * measured 2026-10-30). ES5.
 * Every route is ONE GET /directions/v5/mapbox/driving-traffic/{from};{to}?overview=false (no geometry), the ten
 * started together: travel time now (`duration`), the usual time at this hour (`duration_typical`), the length.
 *   Traffic.hasToken(cfg)          false while config.js still holds the build placeholder
 *   Traffic.urls(cfg)              the GET of every route, in cfg.routes order
 *   Traffic.summary(json)          { travel, free (the typical time), delay, length } from one answer, or null
 *   Traffic.level(summary, cfg)    'ok' | 'slow' | 'jam': travel time against the typical time
 *   Traffic.decide(cfg, facts)     'due', or why a round may not be sent now (THE gate; see below)
 *   Traffic.correct(record, now)   the accounting record after a clock correction, or null when none is needed
 *   Traffic.createStore(cfg, deps) the store: asks decide() on every path, keeps the accounting record and the row cache;
 *                                  status() is the whole screen (its routes included) from one read of that record
 *   Traffic.signature(routes)      which routes a cached row belongs to (a short hash of every id, from and to)
 * When a round is sent (the judges' COMMON DECISION 2026-10-30 and the owner's explicit-open rule; cfg.schedule):
 * only while the traffic screen is the one on view AND the TV shows it (document visible), one round at a time, with a
 * valid accounting record, and never past dailyRequestCap (3,000) requests on the UTC date. On top of that: an explicit
 * ◀ ▶ open sends at once (openMinIntervalMs: 0); every other path — a rotation arrival, the screen staying open, wake —
 * waits minIntervalMs (10 min) since the last ATTEMPT, at any hour. A deadline Mapbox gave (Retry-After on 403 / 429 /
 * 503, any of the ten answers; kept as retryNotBefore) holds for every path, explicit opens included.
 * Mapbox's free tier is 100,000 Directions requests a MONTH; 3,000 a UTC date: any 31 days touch at most 32 UTC dates,
 * so ≤ 96,000 requests (44,650 parked on the screen).
 * The accounting record (localStorage `tt-quota` — "traffic", the name kept from the first provider so a TV keeps its
 * count — { v: 1, utcDate, used, lastAttemptAt, retryNotBefore }) is written and read back BEFORE every round:
 * used += 10, lastAttemptAt = now; nothing is ever refunded (failure, timeout, refusal, crash) and the answers do not
 * move lastAttemptAt. Storage that fails, or a record that is corrupt (an impossible date included), pauses sending. A clock that went back is
 * corrected without sending (Traffic.correct). Any failure — transport, a malformed answer, a refusal (401/403/429) —
 * keeps the last good values and their times; the rows and their failure state are kept in `tt-cache` and shown at once
 * after a restart — only for the same routes (`sig`): after a change of home city the old city's times are never shown. A route Mapbox cannot route (NoRoute / NoSegment) and nothing else is "no data" on its row and a
 * good round. */
var Traffic = (function () {
  var QUERY = '?overview=false&access_token=';
  var PERMANENT = { NoRoute: 1, NoSegment: 1 };    // routing answers that a retry cannot change

  // A Mapbox public token ("pk." …); the build placeholder is not one.
  function hasToken(cfg) { return typeof cfg.token === 'string' && /^pk\.[A-Za-z0-9._-]+$/.test(cfg.token); }
  function point(p) { return p[1] + ',' + p[0]; }   // Mapbox wants lon,lat; the config writes lat,lon

  function urls(cfg) {
    var out = [];
    for (var i = 0; i < cfg.routes.length; i++) out.push(cfg.base + point(cfg.routes[i].from) + ';' + point(cfg.routes[i].to) + QUERY + encodeURIComponent(cfg.token));
    return out;
  }

  function seconds(v) { return Num.finite(v) && v >= 0 ? v : null; }

  // One answer: { travel, free (the typical time at this hour; the travel time when Mapbox has none), delay, length }.
  function summary(json) {
    var r = json && json.code === 'Ok' && json.routes && json.routes[0], travel = r ? seconds(r.duration) : null;
    if (travel === null) return null;
    var free = seconds(r.duration_typical);
    if (free === null) free = travel;
    return { travel: travel, free: free, delay: Math.max(travel - free, 0), length: seconds(r.distance) };
  }

  // Why a request was refused: 'key' (401 / 403: the token, or Mapbox's limit on it) | 'busy' (429) | null.
  function refusal(status) { return status === 401 || status === 403 ? 'key' : status === 429 ? 'busy' : null; }
  // A failed route's class: 'key' | 'busy' | 'timeout' | 'route' (cannot be routed) | 'shape' (an answer that is not a
  // route) | 'item' (anything else).
  function errorOf(a) {
    if (a.err) return refusal(+(/^http (\d+)$/.exec(a.err) || [])[1]) || (a.err === 'timeout' ? 'timeout' : 'item');
    return a.json && PERMANENT[a.json.code] ? 'route' : 'shape';
  }

  var VERSION = 1, QUOTA = 'tt-quota', CACHE = 'tt-cache', MINUTE = 60000;
  var ROW_ERRORS = { key: 1, busy: 1, route: 1, item: 1, timeout: 1, shape: 1 };
  var usedOn = Ledger.usedOn, utcDate = Ledger.utcDate, copyRecord = Ledger.copy, count = Num.count;   // the accounting: js/ledger.js

  // A Retry-After header (delta seconds or an HTTP date) as a moment, or 0 when absent, malformed or already past: js/net.js,
  // bound when called (Net is the transport, loaded before this file in index.html).
  function retryAfterAt(value, now) { return Net.retryAfterAt(value, now); }
  var DEADLINE_STATUS = { 'http 403': 1, 'http 429': 1, 'http 503': 1 };   // the answers whose Retry-After is recorded

  // THE gate: may a round be sent now? facts: { selected (the traffic screen is on view), visible (the TV shows the
  // page), explicitOpen (the remote just opened the screen), busy (a round in flight), storage (the record was read and
  // is valid), now, utcDate, used, lastAttemptAt, retryNotBefore (the record), requests (per round) }.
  // Returns 'due' | 'busy' | 'hidden' | 'storage' | 'cap' | 'floor' (the first reason that holds, in this order).
  function decide(cfg, f) {
    var s = cfg.schedule;
    if (f.busy) return 'busy';
    if (!f.selected || !f.visible) return 'hidden';
    if (!f.storage) return 'storage';
    if (usedOn(f, f.now) + f.requests > s.dailyRequestCap) return 'cap';
    if (f.now - f.lastAttemptAt < (f.explicitOpen ? s.openMinIntervalMs : s.minIntervalMs) || f.now < f.retryNotBefore) return 'floor';
    return 'due';
  }

  // The earliest moment decide() can say 'due' to a path other than an explicit open (the cap: the next UTC date too).
  function earliest(cfg, r, n, now) {
    var t = Math.max(r.lastAttemptAt + cfg.schedule.minIntervalMs, r.retryNotBefore);
    return usedOn(r, now) + n > cfg.schedule.dailyRequestCap ? Math.max(t, Ledger.nextUtcMidnight(now)) : t;
  }

  function level(s, cfg) {
    var ratio = s.free > 0 ? s.travel / s.free : 1;
    return ratio >= cfg.redRatio ? 'jam' : ratio >= cfg.amberRatio ? 'slow' : 'ok';
  }

  // FNV-1a (32 bit, shifts and adds: exact in ES5 arithmetic) of every route's id, from and to, as 8 hex digits.
  function signature(routes) {
    var text = '', h = 0x811c9dc5, i;
    for (i = 0; i < routes.length; i++) text += routes[i].id + ':' + routes[i].from.join(',') + '>' + routes[i].to.join(',') + '|';
    for (i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  // A cache written before signatures existed (5df4e33) holds the owner's Rehovot routes: kept for exactly those.
  var LEGACY_SIG = '5004d845';

  function validCache(c, n, sig) {
    if (!c || c.v !== VERSION || (c.sig === undefined ? sig !== LEGACY_SIG : c.sig !== sig) || !Array.isArray(c.rows) || c.rows.length !== n || typeof c.failed !== 'boolean' ||
        (c.problem !== null && c.problem !== 'refused') || !count(c.attemptAt)) return false;
    for (var i = 0; i < n; i++) {
      var r = c.rows[i], d = r && r.data;
      if (!r || !count(r.updatedAt) || (r.error !== null && !ROW_ERRORS[r.error])) return false;
      if (d !== null && !(d && seconds(d.travel) !== null && seconds(d.free) !== null && seconds(d.delay) !== null && (d.length === null || seconds(d.length) !== null))) return false;
    }
    return true;
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, storage (localStorage or null),
  //         documentVisible() (optional: the TV shows the page; default true), onChange(store), log(message) (optional) }
  function createStore(cfg, deps) {
    var n = cfg.routes.length, storage = deps.storage || null, rows = [], i;
    var docVisible = deps.documentVisible || function () { return true; }, log = deps.log || function () {};
    var selected = false, inFlight = false, failed = false, problem = null, answeredFor = 0, paused = false;
    var timer = null, generation = 0;

    function readJson(key) { try { return JSON.parse(storage.getItem(key)); } catch (e) { return undefined; } }
    var cached = storage ? readJson(CACHE) : null, sig = signature(cfg.routes);
    if (validCache(cached, n, sig)) { rows = cached.rows; failed = cached.failed; problem = cached.problem; answeredFor = cached.attemptAt; }
    else for (i = 0; i < n; i++) rows.push({ data: null, updatedAt: 0, error: null });

    // The accounting record (js/ledger.js): null when storage is unusable or the record is corrupt; a fresh one on a first
    // install. persist() writes it and reads it back; a failure pauses sending.
    var ledger = Ledger.open(storage, QUOTA);
    function account(now) { return ledger.read(now); }
    function persist(r) { paused = !ledger.write(r); return !paused; }
    function saveCache() {
      try { storage.setItem(CACHE, JSON.stringify({ v: VERSION, sig: sig, rows: rows, failed: failed, problem: problem, attemptAt: answeredFor })); }
      catch (e) { log('traffic: rows not cached: ' + e.message); }   // the rows on screen still hold for this run
    }

    function facts(now, r, explicit) {
      return { selected: selected, visible: docVisible(), explicitOpen: !!explicit, busy: inFlight, storage: !!r, now: now,
        utcDate: r ? r.utcDate : '', used: r ? r.used : 0, lastAttemptAt: r ? r.lastAttemptAt : 0, retryNotBefore: r ? r.retryNotBefore : 0, requests: n };
    }

    // Asked again when the gate can next open (a minute from now while storage is in trouble, and never sooner than a
    // minute after a correction); no timer while not on view or while a round is in flight.
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
      var now = deps.now(), r = account(now), fixed = r && Ledger.correct(r, now);
      if (fixed) { plan(now, persist(fixed) ? fixed : null, true); return; }
      if (decide(cfg, facts(now, r, explicit)) !== 'due') { plan(now, r, false); return; }
      var next = { utcDate: utcDate(now), used: usedOn(r, now) + n, lastAttemptAt: now, retryNotBefore: r.retryNotBefore };
      if (!persist(next)) { plan(now, null, false); deps.onChange(api); return; }
      send(now);
    }

    // Stores the round's answers ([{ err, json }] in route order); `failed` when the round failed. `problem` remembers a
    // refusal for the screen.
    function accept(answers) {
      var bad = 0, broken = false, refused = false, t = deps.now();
      for (var i = 0; i < n; i++) {
        var s = rows[i], a = answers[i], d = a.err ? null : summary(a.json);
        if (d) { s.data = d; s.updatedAt = t; s.error = null; continue; }
        s.error = errorOf(a);
        bad++;
        if (s.error === 'key' || s.error === 'busy') refused = true;
        else if (s.error !== 'route') broken = true;
      }
      problem = refused ? 'refused' : null;
      failed = refused || bad === n || broken;
    }

    // A deadline Mapbox gave (Retry-After on 403 / 429 / 503; the latest of the round's answers) joins the accounting
    // record, written and read back, so the one gate enforces it for every path, explicit opens and restarts included;
    // it never moves a deadline earlier.
    function recordDeadline(answers, now) {
      var at = 0;
      for (var i = 0; i < answers.length; i++) {
        var a = answers[i];
        if (DEADLINE_STATUS[a.err] && a.meta) at = Math.max(at, retryAfterAt(a.meta.retryAfter, now));
      }
      var r = at && account(now);
      if (!r || at <= r.retryNotBefore) return;
      var next = copyRecord(r);
      next.retryNotBefore = at;
      persist(next);
    }

    var list = urls(cfg);                          // the same requests every time: built once
    // The ten routes at once; the answers are applied together when the last one is in (one render per round).
    function send(at) {
      inFlight = true;
      var mine = generation, answers = [], pending = n;
      for (var i = 0; i < n; i++) (function (i) {
        deps.getJson(list[i], cfg.timeoutMs, function (err, json, meta) {
          if (mine !== generation) return;         // stopped meanwhile: a late answer changes nothing
          answers[i] = { err: err, json: json, meta: meta };
          if (--pending) return;
          inFlight = false;
          answeredFor = at;
          accept(answers);
          saveCache();
          var now = deps.now();
          recordDeadline(answers, now);
          plan(now, account(now), false);
          deps.onChange(api);
        });
      })(i);
      deps.onChange(api);
    }

    // The last attempt failed: its answer said so, or it has no recorded answer at all (the app stopped mid-flight).
    function lastFailed(r) { return failed || (!inFlight && !!r && r.lastAttemptAt > answeredFor); }

    // A row Mapbox cannot route shows "no data", never its old value: a retry cannot change that answer.
    function view(i, now, wasFailed) {
      var s = rows[i];
      if (!s.data || s.error === 'route') return { kind: s.error ? 'failed' : 'loading', data: null };
      return { kind: Freshness.kind(true, wasFailed || !!s.error, s.updatedAt, now, cfg.staleAfterMs), data: s.data, level: level(s.data, cfg),
        updatedAt: s.updatedAt, future: now < s.updatedAt };
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
        if (selected && !explicit) return;         // a guard: app.js only calls again with explicit (◀ ▶ onto this screen)
        selected = true;
        check(explicit);
      },
      // The TV woke up: asked again at once (the same gate).
      wake: function () { if (selected) check(false); },
      // The whole screen, from ONE read of the accounting record (PERF-4): routes (every route's view, in cfg.routes
      // order); kind 'loading' (nothing to show, a round in flight) | 'failed' (nothing to show) | 'fresh' |
      // 'stale' (a row on screen is old, future-dated, failed, or the last attempt failed); (B17: no «updating» flag — a round in flight with no data is 'loading', with data the data's own kind);
      // future (a row's time is ahead of the clock); updatedAt: the OLDEST row with data; problem: 'storage' | 'cap' |
      // 'refused' | null; resumeAt: when the cap or the refusal lets the next attempt go.
      status: function () {
        var now = deps.now(), r = account(now), f = lastFailed(r), any = false, stale = false, future = false, oldest = Infinity, routes = [];
        for (var i = 0; i < n; i++) {
          var v = view(i, now, f);
          routes.push(v);
          if (!v.data) continue;
          any = true;
          oldest = Math.min(oldest, v.updatedAt);
          if (v.kind !== 'fresh') stale = true;
          if (v.future) future = true;
        }
        var p = !r || paused ? 'storage' : usedOn(r, now) + n > cfg.schedule.dailyRequestCap ? 'cap' : problem;
        return { routes: routes, kind: any ? (stale ? 'stale' : 'fresh') : inFlight ? 'loading' : 'failed', future: future,
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

  return { hasToken: hasToken, urls: urls, summary: summary, level: level, decide: decide, correct: Ledger.correct, createStore: createStore,
    signature: signature };
})();
