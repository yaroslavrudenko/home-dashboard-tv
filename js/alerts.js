/* Israel Home Front Command (Pikud HaOref) alerts. ES5.
 *   Alerts.parse(text)            the feed's body → { alerts: [records] }, record { title, desc, areas }; end messages
 *                                 are dropped; empty = no alert now. The WHOLE answer is validated first: anything
 *                                 that is not the feed's shape (a block page, broken JSON, a record without a title,
 *                                 an area that is not a non-empty string) throws, and the caller counts that as a
 *                                 failed poll, never as "no alert".
 *   Alerts.covers(area, name)     does the feed's area name `area` belong to the configured area `name`?
 *   Alerts.kind(title)            the alert's category key from its Hebrew title ('missiles', …) or null
 *   Alerts.instruction(desc)      { minutes (or null) } for the usual "enter the protected space" instruction, or null
 *   Alerts.createMonitor(cfg, deps)  polls every cfg.pollMs (one request in flight) and keeps each listed place up by
 *                                 one lifetime rule (below); a failed poll never clears anything.
 * The feed answers an empty body (often just a byte-order mark and CRLF) when there is no alert, and one object
 * { id, cat, title, data: [area, …], desc } (or a list of them) while there is one. The category is never read:
 * the recorded active and "ended" answers share cat "1". */
var Alerts = (function () {
  // End messages: "the event has ended", "you may leave the protected space". Only these exact titles (trimmed) are
  // ends; they are told apart only so that they never RAISE an alert, and they never clear or shorten one. Any other
  // wording ("you may NOT leave…", extra words) is an alert: when unsure, alert. The third is Oref's real
  // post-event wording "you may leave the protected space but stay near it" (FB4-A7b).
  var ENDS = ['האירוע הסתיים', 'ניתן לצאת מהמרחב המוגן', 'ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו'];
  var KINDS = [
    [/רקטות|טילים/, 'missiles'], [/כלי טיס/, 'aircraft'], [/מחבלים/, 'infiltration'], [/רעידת אדמה/, 'earthquake'],
    [/צונאמי/, 'tsunami'], [/חומרים מסוכנים/, 'hazmat'], [/רדיולוגי/, 'radiological'], [/צפויות להתקבל התרעות/, 'prealert']
  ];
  var SHELTER = /היכנסו למרחב המוגן/, MINUTES = /(\d+)\s*דקות/, BLANK = /^\s*$/, EDGES = /^\s+|\s+$/g;

  function shapeError() { return new Error('alerts: unexpected shape'); }
  function text(v) { return typeof v === 'string' && !BLANK.test(v); }
  function isEnd(title) { return ENDS.indexOf(title.replace(EDGES, '')) >= 0; }

  function record(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !text(o.title)) throw shapeError();
    var data = typeof o.data === 'string' ? [o.data] : o.data;
    if (!Array.isArray(data) || !data.length) throw shapeError();
    for (var i = 0; i < data.length; i++) if (!text(data[i])) throw shapeError();
    if (o.desc !== undefined && o.desc !== null && typeof o.desc !== 'string') throw shapeError();
    return { title: o.title, desc: o.desc || '', areas: data };
  }

  function parse(raw) {
    var body = String(raw === undefined || raw === null ? '' : raw).replace(/^﻿/, '').replace(EDGES, '');
    var out = { alerts: [] };
    if (!body) return out;
    var json = JSON.parse(body);                   // throws on a block page or a cut answer
    var list = Array.isArray(json) ? json : [json], records = [], i;
    for (i = 0; i < list.length; i++) records.push(record(list[i]));   // every record valid, or the poll failed
    for (i = 0; i < records.length; i++) if (!isEnd(records[i].title)) out.alerts.push(records[i]);
    return out;
  }

  function norm(s) { return String(s).replace(/\s+/g, ' ').replace(/^ | $/g, ''); }
  // "רחובות" covers "רחובות" and a district of it written "רחובות - מזרח"; never a different name that merely
  // starts with the same letters.
  function covers(area, name) {
    var a = norm(area), n = norm(name);
    if (a === n) return true;
    if (a.indexOf(n) !== 0) return false;
    return /^ ?-/.test(a.slice(n.length));
  }
  function coversAny(rec, name) {
    for (var k = 0; k < rec.areas.length; k++) if (covers(rec.areas[k], name)) return true;
    return false;
  }

  function kind(title) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i][0].test(title)) return KINDS[i][1];
    return null;
  }
  function instruction(desc) {
    if (!SHELTER.test(desc)) return null;
    var m = desc.match(MINUTES);
    return { minutes: m ? +m[1] : null };
  }

  /* The one lifetime rule, per configured place (`places`: { he, ru, uk }):
   *   listed       lastSeenAt = now; absence cleared; holdUntil ≥ now + max(graceMs, the instruction's minutes or
   *                defaultHoldMs), the longest of every record in the answer that covers the place.
   *   not listed   (a SUCCESSFUL poll) absence starts; the place clears at the first such poll at or after
   *                max(holdUntil, absentSince + graceMs). End messages change nothing (ids are never compared).
   *   failed poll  pending absence is forgotten: an outage never counts as absence.
   * view(): what the screen shows for these places, or null; the same object while nothing visible changed. */
  function createTracker(places, cfg) {
    var tracks = {}, startedAt = 0, shown = null;

    function holdMs(rec) {
      var instr = instruction(rec.desc), m = instr && instr.minutes ? instr.minutes * 60000 : cfg.defaultHoldMs;
      return Math.max(cfg.graceMs, m);
    }
    function seen(parsed, now) {
      for (var j = 0; j < places.length; j++) {
        var he = places[j].he, t = tracks[he], hit = null, hold = 0;
        for (var i = 0; i < parsed.alerts.length; i++) {
          var rec = parsed.alerts[i], h;
          if (!coversAny(rec, he)) continue;
          h = holdMs(rec);                           // the longest hold wins, and its record gives the words on screen
          if (!hit || h > hold) { hit = rec; hold = h; }   // (a tie keeps the first)
        }
        if (hit) {
          if (!t) t = tracks[he] = { holdUntil: 0 };
          t.record = hit;
          t.lastSeenAt = now;
          t.absentSince = null;
          t.holdUntil = Math.max(t.holdUntil, now + hold);
        } else if (t) {
          if (t.absentSince === null) t.absentSince = now;
          if (now >= Math.max(t.holdUntil, t.absentSince + cfg.graceMs)) delete tracks[he];
        }
      }
      return refreshView(now);
    }
    function failed() { for (var he in tracks) if (tracks.hasOwnProperty(he)) tracks[he].absentSince = null; }

    // The places on view (config order; the view names them in the interface language) and the most recently listed
    // record for the words.
    function refreshView(now) {
      var on = [], ids = [], latest = null;
      for (var j = 0; j < places.length; j++) {
        var t = tracks[places[j].he];
        if (!t) continue;
        on.push(places[j]);
        ids.push(places[j].he);
        if (!latest || t.lastSeenAt > latest.lastSeenAt) latest = t;
      }
      if (!latest) { startedAt = 0; shown = null; return shown; }
      if (!startedAt) startedAt = now;
      var r = latest.record;
      if (!shown || shown.title !== r.title || shown.desc !== r.desc || shown.ids !== ids.join('|') || shown.startedAt !== startedAt) {
        shown = { title: r.title, desc: r.desc, kind: kind(r.title), instruction: instruction(r.desc), places: on, ids: ids.join('|'), startedAt: startedAt };
      }
      return shown;
    }

    return { seen: seen, failed: failed, view: function () { return shown; } };
  }

  // deps: { getText(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(monitor) }
  function createMonitor(cfg, deps) {
    var own = createTracker(cfg.areas, cfg), near = createTracker(cfg.nearby, cfg);
    var failures = 0, checkedAt = 0, inFlight = false, timer = null, generation = 0;

    function visible() {
      var st = api.state();
      return [st.active, st.nearby, st.offline, st.offline ? st.checkedAt : 0];
    }
    // Returns whether anything on screen changes.
    function accept(err, body) {
      var parsed = null, before = visible(), i;
      if (!err) { try { parsed = parse(body); } catch (e) { parsed = null; } }
      if (parsed === null) {                       // a failed or malformed poll: nothing clears, absence is forgotten
        failures++;
        own.failed();
        near.failed();
      } else {
        failures = 0;
        checkedAt = deps.now();
        own.seen(parsed, checkedAt);
        near.seen(parsed, checkedAt);
      }
      var after = visible();
      for (i = 0; i < after.length; i++) if (after[i] !== before[i]) return true;
      return false;
    }

    function poll() {
      if (inFlight) return false;
      inFlight = true;
      if (timer !== null) { deps.clearTimeout(timer); timer = null; }
      var mine = generation;
      deps.getText(cfg.url, cfg.timeoutMs, function (err, body) {
        if (mine !== generation) return;
        inFlight = false;
        var changed = accept(err, body);
        timer = deps.setTimeout(function () { timer = null; poll(); }, cfg.pollMs);
        if (changed) deps.onChange(api);
      });
      return true;
    }

    var api = {
      poll: poll,
      // What the screen shows: the alert over every screen, a quiet nearby notice (only without an alert of our
      // own), whether the feed is unreachable (never shown as "all clear") and when it last answered well.
      state: function () {
        var active = own.view();
        return { active: active, nearby: active ? null : near.view(), offline: failures >= cfg.failAfter, checkedAt: checkedAt };
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

  return { parse: parse, covers: covers, kind: kind, instruction: instruction, createMonitor: createMonitor };
})();
