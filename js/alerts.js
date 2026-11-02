/* Israel Home Front Command (Pikud HaOref) alerts. ES5.
 *   Alerts.parse(text)            the feed's body → { alerts: [records] }, record { title, desc, areas }; end messages
 *                                 are dropped; empty = no alert now. The WHOLE answer is validated first: anything
 *                                 that is not the feed's shape (a block page, broken JSON, a record without a title,
 *                                 an area that is not a non-empty string) throws, and the caller counts that as a
 *                                 failed poll, never as "no alert".
 *   Alerts.covers(area, name)     does the feed's area name `area` belong to the configured area `name`?
 *   Alerts.coversPlace(area, place)  …to a configured place: any of its Oref names (place.match, default [place.he])
 *   Alerts.placeLookup(places)    area → the place it belongs to among `places` (or null): coversPlace as an index
 *   Alerts.isEnd(title)           is it one of the feed's end messages (exact, trimmed)?
 *   Alerts.text(v)                is v a string with something other than white space in it?
 *   Alerts.kind(title)            the alert's category key from its Hebrew title ('missiles', …) or null
 *   Alerts.instruction(desc)      { minutes (or null) } for the usual "enter the protected space" instruction, or null
 *   Alerts.createMonitor(cfg, deps)  polls every cfg.pollMs (one request in flight) and keeps each listed place up by
 *                                 one lifetime rule (below); a failed poll never clears anything; with deps.storage the
 *                                 places held survive a restart (S1: a restart never says "no alerts" inside a hold).
 *   Alerts.preview(st, cfg, now)  what the screen shows for the owner's alert preview: a NEW state with a sample alert
 *                                 for the first configured area and preview: true — or `st` itself while a real alert is
 *                                 up (a real alert always wins). `st` is never changed.
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
  // A configured place ({ he, match }) is listed under any of its Oref names: Kiryat Gat is "קריית גת, כרמי גת", Modi'in
  // is "מודיעין מכבים רעות" and the "מודיעין - …" centres.
  function coversPlace(area, place) {
    var names = place.match || [place.he];
    for (var i = 0; i < names.length; i++) if (covers(area, names[i])) return true;
    return false;
  }
  // The place a feed area belongs to, among many (the city catalogue, js/cities.js): coversPlace as an index, one pass
  // over the area's name whatever the number of places — the place named exactly the area, else the one whose name is the
  // longest "name - district" prefix of it; null for none. Built once per list of places.
  function placeLookup(places) {
    var byName = Object.create(null), i, j;
    for (i = 0; i < places.length; i++) {
      var names = places[i].match || [places[i].he];
      for (j = 0; j < names.length; j++) if (!byName[norm(names[j])]) byName[norm(names[j])] = places[i];
    }
    return function (area) {
      var a = norm(area), p = byName[a];
      for (var k = a.lastIndexOf('-'); !p && k > 0; k = a.lastIndexOf('-', k - 1)) p = byName[a.slice(0, a.charAt(k - 1) === ' ' ? k - 1 : k)];
      return p || null;
    };
  }
  function coversAny(rec, place) {
    for (var k = 0; k < rec.areas.length; k++) if (coversPlace(rec.areas[k], place)) return true;
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

  // The preview's sample: the most common alert, in the feed's own words, for the first configured area.
  var SAMPLE_TITLE = 'ירי רקטות וטילים', SAMPLE_DESC = 'היכנסו למרחב המוגן ושהו בו 10 דקות';
  function preview(st, cfg, now) {
    if (st.active) return st;
    var home = cfg.areas[0];
    return { active: { title: SAMPLE_TITLE, desc: SAMPLE_DESC, kind: kind(SAMPLE_TITLE), instruction: instruction(SAMPLE_DESC), places: [home],
      ids: home.he, startedAt: now }, nearby: st.nearby, around: st.around, offline: st.offline, checkedAt: st.checkedAt, preview: true };
  }

  /* The one lifetime rule, per configured place (`places`: { he, ru, uk, match }; kept by its `he`):
   *   listed       lastSeenAt = now; absence cleared; holdUntil ≥ now + max(graceMs, the instruction's minutes or
   *                defaultHoldMs), the longest of every record in the answer that covers the place.
   *   not listed   (a SUCCESSFUL poll) absence starts; the place clears at the first such poll at or after
   *                max(holdUntil, absentSince + graceMs). End messages change nothing (ids are never compared).
   *   failed poll  pending absence is forgotten: an outage never counts as absence.
   * view(): what the screen shows for these places, or null; the same object while nothing visible changed.
   * save() / restore(saved, now) (S1): the places held, as plain data, and back after a restart — a place of THIS list
   * whose hold has not run out keeps its own holdUntil (a restart never shortens a hold: a 30-minute instruction followed
   * by a 10-minute one still holds 30), bounded only by the longest hold it was given (maxHold) from its last sighting,
   * that sighting never later than now (a clock that went back cannot stretch it); it starts with no absence, so the first
   * good poll without it starts the grace again. A saved entry of any other shape restores nothing. */
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
          if (!coversAny(rec, places[j])) continue;
          h = holdMs(rec);                           // the longest hold wins, and its record gives the words on screen
          if (!hit || h > hold) { hit = rec; hold = h; }   // (a tie keeps the first)
        }
        if (hit) {
          if (!t) t = tracks[he] = { holdUntil: 0, maxHold: 0 };
          t.maxHold = Math.max(t.maxHold, hold);
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

    function save() {
      var out = {}, any = false;
      for (var he in tracks) if (tracks.hasOwnProperty(he)) {
        var t = tracks[he];
        out[he] = { holdUntil: t.holdUntil, lastSeenAt: t.lastSeenAt, maxHold: t.maxHold, record: { title: t.record.title, desc: t.record.desc, data: t.record.areas } };
        any = true;
      }
      return any ? { startedAt: startedAt, tracks: out } : null;
    }
    // log(message): what was not restored and why. A foreign shape restores nothing and never throws.
    function restore(saved, now, log) {
      var own = Object.prototype.hasOwnProperty;
      if (!isPlain(saved) || !isPlain(saved.tracks)) return;
      for (var j = 0; j < places.length; j++) {
        var he = places[j].he, s = own.call(saved.tracks, he) ? saved.tracks[he] : null, rec = null;
        if (!isPlain(s) || !Num.count(s.holdUntil) || !Num.count(s.lastSeenAt) || !Num.count(s.maxHold) || s.holdUntil <= now) continue;
        try { rec = record(s.record); } catch (e) { log('alerts: saved record for ' + he + ' not restored: ' + e.message); continue; }   // the feed's own shape check
        var seenAt = Math.min(s.lastSeenAt, now);
        tracks[he] = { holdUntil: Math.min(s.holdUntil, seenAt + s.maxHold), maxHold: s.maxHold, lastSeenAt: seenAt, absentSince: null, record: rec };
      }
      startedAt = Num.count(saved.startedAt) ? Math.min(saved.startedAt, now) : 0;
      refreshView(now);
    }

    return { seen: seen, failed: failed, save: save, restore: restore, view: function () { return shown; } };
  }

  function isPlain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // What the monitor keeps across a restart (S1): the held places of home and nearby, versioned; written when it changes
  // (while a place is held: each good poll moves its hold), removed when nothing is held.
  var STATE_KEY = 'homedash.alerts', STATE_VERSION = 1;

  // deps: { getText(url, timeoutMs, done), now(), setTimeout, clearTimeout, onChange(monitor), storage (optional:
  //         localStorage or null — S1: a restart keeps an alert held), log(message) (optional) }
  function createMonitor(cfg, deps) {
    var own = createTracker(cfg.areas, cfg), near = createTracker(cfg.nearby, cfg);
    var failures = 0, checkedAt = 0, inFlight = false, timer = null, generation = 0;
    var storage = deps.storage || null, log = deps.log || function () {}, savedText = '';

    // At boot, before the first poll: the holds of the last run. A corrupt, foreign or poisoned entry is ignored and said;
    // nothing in it can stop the monitor from starting (R16-3).
    function restoreState() {
      try {
        var text = storage.getItem(STATE_KEY), e = JSON.parse(text);
        if (!isPlain(e) || e.v !== STATE_VERSION) return;
        savedText = text;
        own.restore(e.own, deps.now(), log);
        near.restore(e.near, deps.now(), log);
      } catch (err) { log('alerts: saved state not restored: ' + err.message); }
    }
    // Written when it changed; `savedText` moves only after the write succeeded, so a failed write is tried again at the
    // next good poll (R16-2: one refused write never loses the hold).
    function saveState() {
      var o = own.save(), n = near.save(), text = o || n ? JSON.stringify({ v: STATE_VERSION, own: o, near: n }) : '';
      if (text === savedText) return;
      try {
        if (text) storage.setItem(STATE_KEY, text); else storage.removeItem(STATE_KEY);
        savedText = text;
      } catch (err) { log('alerts: state not saved (tried again at the next poll): ' + err.message); }
    }
    if (storage) restoreState();

    function visible() {
      var st = api.state();
      return [st.active, st.around, st.offline, st.offline ? st.checkedAt : 0];
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
      // After every poll, answered or not: a write refused earlier is tried again even while the feed is down (R16-2);
      // saveState writes only when the state text changed or the last write failed.
      if (storage) saveState();
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
      // own; `around` is the nearby view whatever happens at home, for the Alerts screen), whether the feed is
      // unreachable (never shown as "all clear") and when it last answered well.
      state: function () {
        var active = own.view(), around = near.view();
        return { active: active, nearby: active ? null : around, around: around, offline: failures >= cfg.failAfter, checkedAt: checkedAt };
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

  return { parse: parse, covers: covers, coversPlace: coversPlace, placeLookup: placeLookup, kind: kind, instruction: instruction, isEnd: isEnd, text: text, createMonitor: createMonitor, preview: preview };
})();
