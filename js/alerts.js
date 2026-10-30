/* Israel Home Front Command (Pikud HaOref) alerts. ES5.
 *   Alerts.parse(text)            the feed's body → { alerts: [records], ended: [records] }, record { id, title, desc,
 *                                 areas }; both empty = no alert now. The WHOLE answer is validated first: anything
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
  // End messages: "the event has ended", "you may leave the protected space". An end is never an alert.
  var ENDED = /האירוע הסתיים|ניתן לצאת מהמרחב המוגן/;
  var KINDS = [
    [/רקטות|טילים/, 'missiles'], [/כלי טיס/, 'aircraft'], [/מחבלים/, 'infiltration'], [/רעידת אדמה/, 'earthquake'],
    [/צונאמי/, 'tsunami'], [/חומרים מסוכנים/, 'hazmat'], [/רדיולוגי/, 'radiological'], [/צפויות להתקבל התרעות/, 'prealert']
  ];
  var SHELTER = /היכנסו למרחב המוגן/, MINUTES = /(\d+)\s*דקות/, BLANK = /^\s*$/;

  function shapeError() { return new Error('alerts: unexpected shape'); }
  function text(v) { return typeof v === 'string' && !BLANK.test(v); }

  function record(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !text(o.title)) throw shapeError();
    var data = typeof o.data === 'string' ? [o.data] : o.data;
    if (!Array.isArray(data) || !data.length) throw shapeError();
    for (var i = 0; i < data.length; i++) if (!text(data[i])) throw shapeError();
    if (o.desc !== undefined && o.desc !== null && typeof o.desc !== 'string') throw shapeError();
    return { id: typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id) : '', title: o.title, desc: o.desc || '', areas: data };
  }

  function parse(raw) {
    var body = String(raw === undefined || raw === null ? '' : raw).replace(/^﻿/, '').replace(/^\s+|\s+$/g, '');
    var out = { alerts: [], ended: [] };
    if (!body) return out;
    var json = JSON.parse(body);                   // throws on a block page or a cut answer
    var list = Array.isArray(json) ? json : [json], records = [], i;
    for (i = 0; i < list.length; i++) records.push(record(list[i]));   // every record valid, or the poll failed
    for (i = 0; i < records.length; i++) (ENDED.test(records[i].title) ? out.ended : out.alerts).push(records[i]);
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

  // Event ids are digit strings that grow with time; compared as text (18 digits do not fit a double).
  // Returns -1 / 0 / 1, or null when they cannot be compared (the correlation is uncertain).
  function compareIds(a, b) {
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
    a = a.replace(/^0+(?=\d)/, ''); b = b.replace(/^0+(?=\d)/, '');
    return a.length !== b.length ? (a.length < b.length ? -1 : 1) : a === b ? 0 : a < b ? -1 : 1;
  }

  /* The one lifetime rule, per configured place (`places`: { he, name }):
   *   listed       lastSeenAt = now; absence cleared; holdUntil ≥ now + max(graceMs, the instruction's minutes or
   *                defaultHoldMs); the event id remembered.
   *   not listed   (a SUCCESSFUL poll) absence starts; the place clears at the first such poll at or after
   *                max(holdUntil, absentSince + graceMs) — or at once on an end message covering it whose id is not
   *                older than the event (an end without a comparable id, for another area or for an older event
   *                changes nothing).
   *   failed poll  pending absence is forgotten: an outage never counts as absence.
   * view(): what the screen shows for these places, or null; the same object while nothing visible changed. */
  function createTracker(places, cfg) {
    var tracks = {}, startedAt = 0, shown = null;

    function holdMs(rec) {
      var instr = instruction(rec.desc), m = instr && instr.minutes ? instr.minutes * 60000 : cfg.defaultHoldMs;
      return Math.max(cfg.graceMs, m);
    }
    function ends(ended, place, eventId) {
      for (var i = 0; i < ended.length; i++) {
        if (!coversAny(ended[i], place)) continue;
        var c = compareIds(ended[i].id, eventId);
        if (c !== null && c >= 0) return true;
      }
      return false;
    }

    function seen(parsed, now) {
      for (var j = 0; j < places.length; j++) {
        var he = places[j].he, t = tracks[he], hit = null, id = '';
        for (var i = 0; i < parsed.alerts.length; i++) {
          var rec = parsed.alerts[i];
          if (!coversAny(rec, he)) continue;
          if (!hit) hit = rec;
          if (id === '' || compareIds(rec.id, id) === 1) id = rec.id;
        }
        if (hit) {
          if (!t) t = tracks[he] = { holdUntil: 0, eventId: '' };
          t.record = hit;
          t.lastSeenAt = now;
          t.absentSince = null;
          t.holdUntil = Math.max(t.holdUntil, now + holdMs(hit));
          if (t.eventId === '' || compareIds(id, t.eventId) === 1) t.eventId = id;
        } else if (t) {
          if (t.absentSince === null) t.absentSince = now;
          if (ends(parsed.ended, he, t.eventId) || now >= Math.max(t.holdUntil, t.absentSince + cfg.graceMs)) delete tracks[he];
        }
      }
      return refreshView(now);
    }
    function failed() { for (var he in tracks) if (tracks.hasOwnProperty(he)) tracks[he].absentSince = null; }

    // The places on view (config order) and the most recently listed record for the words.
    function refreshView(now) {
      var names = [], latest = null;
      for (var j = 0; j < places.length; j++) {
        var t = tracks[places[j].he];
        if (!t) continue;
        names.push(places[j].name);
        if (!latest || t.lastSeenAt > latest.lastSeenAt) latest = t;
      }
      if (!latest) { startedAt = 0; shown = null; return shown; }
      if (!startedAt) startedAt = now;
      var r = latest.record;
      if (!shown || shown.title !== r.title || shown.desc !== r.desc || shown.names.join('|') !== names.join('|') || shown.startedAt !== startedAt) {
        shown = { title: r.title, desc: r.desc, kind: kind(r.title), instruction: instruction(r.desc), names: names, startedAt: startedAt };
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
