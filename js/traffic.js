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
 *   Traffic.createStore(cfg, deps) the store: asks decide() on every path, keeps the accounting record and the row cache
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
 * after a restart. A route Mapbox cannot route (NoRoute / NoSegment) and nothing else is "no data" on its row and a
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

  function seconds(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; }

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

  var VERSION = 1, QUOTA = 'tt-quota', CACHE = 'tt-cache', DAY_MS = 86400000, MINUTE = 60000;
  var ROW_ERRORS = { key: 1, busy: 1, route: 1, item: 1, timeout: 1, shape: 1 };

  // The UTC date of a moment, "YYYY-MM-DD" (the accounting day: one fixed length, home dates can be 25 h long).
  function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function nextUtcMidnight(ms) { return (Math.floor(ms / DAY_MS) + 1) * DAY_MS; }
  function count(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v; }
  // A real calendar date "YYYY-MM-DD": it survives the round trip through Date.UTC (2026-02-31 and 0000-00-00 do not).
  function validDate(d) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    var t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    return t >= 0 && utcDate(t) === d;
  }
  function validRecord(r) {
    return !!r && r.v === VERSION && validDate(r.utcDate) && count(r.used) && count(r.lastAttemptAt) && count(r.retryNotBefore);
  }
  // A Retry-After header (delta seconds or an HTTP date) as a moment, or 0 when absent, malformed or already past.
  function retryAfterAt(value, now) {
    var t = /^\s*\d+\s*$/.test(value) ? now + 1000 * +value : value ? Date.parse(value) : NaN;
    return isFinite(t) && t > now ? Math.ceil(t) : 0;
  }
  var DEADLINE_STATUS = { 'http 403': 1, 'http 429': 1, 'http 503': 1 };   // the answers whose Retry-After is recorded
  // Requests already used on now's UTC date: a strictly later date starts again at 0.
  function usedOn(r, now) { return r.utcDate < utcDate(now) ? 0 : r.used; }

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
    return usedOn(r, now) + n > cfg.schedule.dailyRequestCap ? Math.max(t, nextUtcMidnight(now)) : t;
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

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, storage (localStorage or null),
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
      var now = deps.now(), r = account(now), fixed = r && correct(r, now);
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
        if (selected && !explicit) return;         // a guard: app.js only calls again with explicit (◀ ▶ onto this screen)
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
      // The whole screen: kind 'loading' (nothing to show, a round in flight) | 'failed' (nothing to show) | 'fresh' |
      // 'stale' (a row on screen is old, future-dated, failed, or the last attempt failed); updating (a round in flight);
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
        var p = !r || paused ? 'storage' : usedOn(r, now) + n > cfg.schedule.dailyRequestCap ? 'cap' : problem;
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

  return { hasToken: hasToken, urls: urls, summary: summary, level: level, decide: decide, correct: correct, validDate: validDate, createStore: createStore };
})();
