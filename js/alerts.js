/* Israel Home Front Command (Pikud HaOref) alerts. ES5.
 *   Alerts.parse(text)            the feed's body → list of alerts [{ title, desc, cat, areas }]; [] = no alert now.
 *                                 Throws on anything that is not the feed's shape (a block page, broken JSON):
 *                                 the caller counts that as a failed poll, never as "no alert".
 *   Alerts.covers(area, name)     does the feed's area name `area` belong to the configured area `name`?
 *   Alerts.kind(title)            the alert's category key from its Hebrew title ('missiles', …) or null
 *   Alerts.instruction(desc)      { minutes (or null) } for the usual "enter the protected space" instruction, or null
 *   Alerts.createMonitor(cfg, deps)  polls every cfg.pollMs (one request in flight), keeps the alert up until the
 *                                 feed stops listing the area + cfg.graceMs, and never clears it on a failed poll.
 * The feed answers an empty body (often just a byte-order mark and CRLF) when there is no alert, and one object
 * { id, cat, title, data: [area, …], desc } while there is one. */
var Alerts = (function () {
  var ENDED = /הסתיים/;           // "… the event has ended": an all-clear for the listed areas, never an alert
  var KINDS = [
    [/רקטות|טילים/, 'missiles'], [/כלי טיס/, 'aircraft'], [/מחבלים/, 'infiltration'], [/רעידת אדמה/, 'earthquake'],
    [/צונאמי/, 'tsunami'], [/חומרים מסוכנים/, 'hazmat'], [/רדיולוגי/, 'radiological'], [/צפויות להתקבל התרעות/, 'prealert']
  ];
  var SHELTER = /היכנסו למרחב המוגן/, MINUTES = /(\d+)\s*דקות/;

  function shapeError() { return new Error('alerts: unexpected shape'); }

  function one(o) {
    if (!o || typeof o !== 'object') throw shapeError();
    var data = typeof o.data === 'string' ? [o.data] : o.data;
    if (!Array.isArray(data)) throw shapeError();
    var areas = [];
    for (var i = 0; i < data.length; i++) if (typeof data[i] === 'string' && data[i]) areas.push(data[i]);
    return { title: String(o.title || ''), desc: String(o.desc || ''), cat: String(o.cat || ''), areas: areas };
  }

  function parse(text) {
    var body = String(text === undefined || text === null ? '' : text).replace(/^﻿/, '').replace(/^\s+|\s+$/g, '');
    if (!body) return [];
    var json = JSON.parse(body);                   // throws on a block page or a cut answer
    var list = Array.isArray(json) ? json : [json], out = [];
    for (var i = 0; i < list.length; i++) {
      var a = one(list[i]);
      if (!ENDED.test(a.title)) out.push(a);
    }
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

  // The configured places (cfg list of { he, name }) the alerts cover: { alert (the first matching), names }.
  function match(alerts, places) {
    var hit = null, names = [], seen = {};
    for (var i = 0; i < alerts.length; i++) {
      for (var j = 0; j < places.length; j++) {
        for (var k = 0; k < alerts[i].areas.length; k++) {
          if (!covers(alerts[i].areas[k], places[j].he)) continue;
          if (!hit) hit = alerts[i];
          if (!seen[places[j].he]) { seen[places[j].he] = true; names.push(places[j].name); }
          break;
        }
      }
    }
    return hit ? { alert: hit, names: names } : null;
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

  // deps: { getText(url, timeoutMs, done, headers), now(), setTimeout, clearTimeout, onChange(monitor) }
  function createMonitor(cfg, deps) {
    var active = null, nearby = null, failures = 0, inFlight = false, timer = null, generation = 0;
    var HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };   // Referer cannot be set from a page; the feed answers without it

    // Raises or refreshes a notice from a match, or ends it once the area has been absent for graceMs.
    function track(current, hit, now) {
      if (hit) {
        var title = hit.alert.title, desc = hit.alert.desc;
        if (current && current.title === title && current.desc === desc && current.names.join('|') === hit.names.join('|')) {
          current.lastSeenAt = now;
          return current;
        }
        return { title: title, desc: desc, kind: kind(title), instruction: instruction(desc), names: hit.names,
          startedAt: current ? current.startedAt : now, lastSeenAt: now };
      }
      return current && now - current.lastSeenAt >= cfg.graceMs ? null : current;
    }

    // Returns whether anything on screen changes.
    function accept(err, text) {
      var list = null;
      if (!err) { try { list = parse(text); } catch (e) { list = null; } }
      var wasOffline = failures >= cfg.failAfter;
      if (list === null) {                         // a failed poll changes nothing but the connection marker
        failures++;
        return !wasOffline && failures >= cfg.failAfter;
      }
      failures = 0;
      var now = deps.now(), before = [active, active && active.lastSeenAt, nearby];
      active = track(active, match(list, cfg.areas), now);
      nearby = track(nearby, match(list, cfg.nearby), now);
      return wasOffline || before[0] !== active || before[2] !== nearby;
    }

    function poll() {
      if (inFlight) return false;
      inFlight = true;
      if (timer !== null) { deps.clearTimeout(timer); timer = null; }
      var mine = generation;
      deps.getText(cfg.url, cfg.timeoutMs, function (err, text) {
        if (mine !== generation) return;
        inFlight = false;
        var changed = accept(err, text);
        timer = deps.setTimeout(function () { timer = null; poll(); }, cfg.pollMs);
        if (changed) deps.onChange(api);
      }, HEADERS);
      return true;
    }

    var api = {
      poll: poll,
      // What the screen shows: the alert over every screen, a quiet nearby notice (only without an alert of our
      // own), and whether the feed is unreachable (never shown as "all clear").
      state: function () { return { active: active, nearby: active ? null : nearby, offline: failures >= cfg.failAfter }; },
      stop: function () {
        generation++;
        inFlight = false;
        if (timer !== null) deps.clearTimeout(timer);
        timer = null;
      }
    };
    return api;
  }

  return { parse: parse, covers: covers, match: match, kind: kind, instruction: instruction, createMonitor: createMonitor };
})();
