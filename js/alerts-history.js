/* The recent Pikud HaOref alerts across Israel, for the Alerts screen. ES5.
 * Source: Pikud HaOref's site API, www.oref.org.il/api/v1/AlertHistory/heb?period=lastWeek&cities= (the request its own
 * «last week» tab sends), checked 2026-11-04 — the old alerts-history.oref.org.il GetAlarmsHistory.aspx now answers 301 to
 * an HTML page. A plain GET answers 200 with one page — the newest 200 area records, newest minute first (the next page by
 * the cursor, nextUrl) — grouped by day:
 *   { lastRetrievedAlarm (the cursor of the next page: its last record), alarmsGroupedByDate: [{ key (the day, DD.MM.YYYY), value: [{ data: area,
 *     date, time: 'HH:MM:SS', dateTime: 'YYYY-MM-DDTHH:MM:00' (Israel time), category, category_Desc: the title, matrixId,
 *     rid }] }] } — a quiet week: { alarmsGroupedByDate: [] }.
 *   AlertsHistory.parse(answer, max, placeOf)   the newest `max` events: one per moment and title, { date, time, title, kind,
 *                                    areas (in the feed's order, each once: one lookup per record), places }; end messages
 *                                    dropped. places: the areas as the screen names them, [{ area, place }] — place: the
 *                                    city an area belongs to (placeOf(area), Alerts.placeLookup over the catalogue) or null;
 *                                    a city once however many of its districts are listed (Tel Aviv has four); only the
 *                                    events kept are mapped. Anything that is not the feed's shape throws (the round
 *                                    failed, never "no alerts").
 *   AlertsHistory.createController(cfg, deps)   asks only while the Alerts screen is on view AND the TV shows the page,
 *                                    one round at a time (its pages one after another, batch 21B): an explicit open (◀ ▶, a language change) at once; otherwise
 *                                    every cfg.refreshMs since the last attempt — the shared gate, js/onview.js (the App
 *                                    gives it the rotation cycle: at most one week's page per cycle). A failed round
 *                                    keeps the last list. deps.places: the places the areas are named by (js/cities.js). */
var AlertsHistory = (function () {
  var STAMP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/, text = Alerts.text;
  // "The threat has been removed" (category 13, like "the event has ended"): an end, never an alert in the list.
  var REMOVED = /^\s*הוסר החשש/;
  // Batch 21B F1: the API's end / all-clear messages are category 13 in every wording («… - האירוע הסתיים», «… - החשש
  // הוסר», «סיום שהייה בסמיכות למרחב המוגן», «הסתיים אירוע … - ניתן לצאת מהבתים»); measured over 122 recorded days, Mar–Jun
  // 2026: category 13 holds end / all-clear titles only. The title checks stay for a wording filed under another number.
  var END_CATEGORY = 13;

  function shapeError() { return new Error('alerts history: unexpected shape'); }

  // An event's areas as the screen names them: [{ area, place }], a city once (its first listed district stands for it).
  function placesOf(areas, placeOf) {
    var out = [], seen = Object.create(null);
    for (var i = 0; i < areas.length; i++) {
      var p = placeOf ? placeOf(areas[i]) : null;
      if (p && seen[p.he]) continue;
      if (p) seen[p.he] = true;
      out.push({ area: areas[i], place: p });
    }
    return out;
  }

  // The answer's area records, day by day in the feed's order; anything but the grouped shape throws.
  function records(answer) {
    var days = answer && answer.alarmsGroupedByDate, out = [];
    if (!Array.isArray(days)) throw shapeError();
    for (var i = 0; i < days.length; i++) {
      if (!days[i] || !Array.isArray(days[i].value)) throw shapeError();
      out.push.apply(out, days[i].value);   // one copy of each record, never a re-copy of the list per day
    }
    return out;
  }

  // The events of a stream of area records, kept in arrival order: one per moment and title, end messages skipped.
  // add(list) takes the next records (a malformed one throws); count(openAt) and list(openAt, max, placeOf) leave out the
  // events of the minute `openAt` — the minute a full page ended on, whose areas may go on in the next page.
  function collector() {
    var byKey = {}, events = [];
    function add(list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i], m = r && typeof r === 'object' && typeof r.dateTime === 'string' ? r.dateTime.match(STAMP) : null;
        if (!m || !text(r.data) || !text(r.category_Desc)) throw shapeError();
        if (r.category === END_CATEGORY || Alerts.isEnd(r.category_Desc) || REMOVED.test(r.category_Desc)) continue;
        var key = r.dateTime + '|' + r.category_Desc, e = byKey[key];
        if (!e) {
          e = byKey[key] = { at: r.dateTime, order: events.length, date: m[3] + '.' + m[2] + '.' + m[1], time: m[4] + ':' + m[5],
            title: r.category_Desc, kind: Alerts.kind(r.category_Desc), areas: [], seen: Object.create(null) };
          events.push(e);
        }
        if (!e.seen[r.data]) { e.seen[r.data] = true; e.areas.push(r.data); }   // PERF-1: one lookup, never a scan of the list
      }
    }
    function closed(openAt) {
      var out = [];
      for (var i = 0; i < events.length; i++) if (events[i].at !== openAt) out.push(events[i]);
      return out;
    }
    function list(openAt, max, placeOf) {
      var done = closed(openAt), out = [];
      done.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : a.order - b.order; });
      for (var i = 0; i < done.length && i < max; i++) {
        out.push({ date: done[i].date, time: done[i].time, title: done[i].title, kind: done[i].kind, areas: done[i].areas,
          places: placesOf(done[i].areas, placeOf) });
      }
      return out;
    }
    return { add: add, count: function (openAt) { return closed(openAt).length; }, list: list };
  }

  // One answer, read whole (every event closed).
  function parse(answer, max, placeOf) {
    var c = collector();
    c.add(records(answer));
    return c.list(null, max, placeOf);
  }

  // Batch 21B F2: the next page of the same request, after `last` (the answer's lastRetrievedAlarm) — the cursor Pikud's own
  // page sends (lastCreatedOn, lastTitle, lastCityName; checked 2026-11-04 on 2026-03-05: 8 pages, 1,600 records, none twice).
  function nextUrl(url, last) {
    return url + '&lastCreatedOn=' + encodeURIComponent(last.dateTime) + '&lastTitle=' + encodeURIComponent(last.category_Desc) +
      '&lastCityName=' + encodeURIComponent(last.data);
  }
  function isCursor(r) { return !!r && typeof r.dateTime === 'string' && text(r.category_Desc) && text(r.data); }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, documentVisible() (optional), onChange(),
  //         places (optional: the places areas are named by), log(message) (optional) }
  // state(): { kind: 'loading' | 'failed' (no list yet) | 'fresh' | 'stale' (the last round failed or the list is older
  //            than cfg.staleAfterMs), events, updatedAt }
  function createController(cfg, deps) {
    var log = deps.log || function () {};
    var events = [], updatedAt = 0, failed = false, placeOf = Alerts.placeLookup(deps.places || []);   // the index: built once
    // One round: page after page (each needs the one before: its cursor), while a page is full (cfg.pageSize records) and
    // fewer than cfg.max events are closed, at most cfg.maxPages. Read to the end or to cfg.max closed events: the list.
    // The cap reached: the closed events found are the list (true rows, only fewer); none closed — the round failed (the
    // last list kept, stale), never "no alerts". A page that fails or is malformed fails the round the same way.
    // The round is over (the gate schedules the next) before the screen is redrawn.
    // FIX-BATCH-19 3 (P7): the round returns cancel() — left during it, the request in flight is aborted, nothing is drawn.
    var gate = OnView.create(cfg.refreshMs, deps, function (done) {
      var cancelled = false, xhr = null, pages = 0, found = collector(), next = null;
      function finish(list) {
        failed = list === null;
        if (list) { events = list; updatedAt = deps.now(); }
        done();
        deps.onChange();
      }
      // The round's result with one more page in: the list, null (failed), or undefined (ask `next`). A malformed page throws.
      function after(json) {
        var page = records(json), openAt = page.length ? page[page.length - 1].dateTime : null;
        found.add(page);
        if (page.length < cfg.pageSize) return found.list(null, cfg.max, placeOf);   // the week read to its end
        // Batch 21C C2: with `max` complete events in, no next page is asked, so its cursor is not needed: every kept event is
        // newer than the open minute, and the page is newest minute first, so all their records are already in.
        var closed = found.count(openAt);
        if (closed >= cfg.max || pages >= cfg.maxPages) return closed ? found.list(openAt, cfg.max, placeOf) : null;
        if (!isCursor(json.lastRetrievedAlarm)) throw shapeError();
        next = nextUrl(cfg.url, json.lastRetrievedAlarm);
        return undefined;
      }
      function ask(url) {
        pages++;
        xhr = deps.getJson(url, cfg.timeoutMs, function (err, json) {
          if (cancelled) return;
          var list = null;
          if (!err) { try { list = after(json); } catch (e) { list = null; log('alerts history: ' + e.message); } }
          if (list === undefined) ask(next); else finish(list);
        });
      }
      ask(cfg.url);
      return function () { cancelled = true; if (xhr && xhr.abort) xhr.abort(); };
    });

    return {
      // The Alerts screen came into view (explicit: the remote opened it, or the language changed on it) or left it.
      setVisible: gate.setVisible,
      // The TV hid or showed the page: hidden stops the cadence; shown asks the gate again.
      visibilityChanged: gate.visibilityChanged,
      state: function () {
        return { kind: Freshness.kind(!!updatedAt, failed, updatedAt, deps.now(), cfg.staleAfterMs), events: events, updatedAt: updatedAt };
      }
    };
  }

  return { parse: parse, createController: createController };
})();
