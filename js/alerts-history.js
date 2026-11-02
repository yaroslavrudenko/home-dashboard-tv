/* The recent Pikud HaOref alerts across Israel, for the Alerts screen. ES5.
 * Source: alerts-history.oref.org.il (GetAlarmsHistory.aspx, lang=he; mode=2 = the last 7 days), checked 2026-10-30:
 * a plain GET answers 200 with a JSON list, one record per AREA, newest first:
 *   { data: area, date: 'DD.MM.YYYY', time: 'HH:MM:SS', alertDate: 'YYYY-MM-DDTHH:MM:00' (Israel time), category,
 *     category_desc: the title, matrix_id, rid }
 * (www.oref.org.il/WarningMessages/History/AlertsHistory.json answers 403 to the same GET.)
 *   AlertsHistory.parse(list, max)   the newest `max` events: one per moment and title, { date, time, title, kind, areas }
 *                                    (areas in the feed's order, each once); end messages dropped. Anything that is not
 *                                    the feed's shape throws (the round failed, never "no alerts").
 *   AlertsHistory.createController(cfg, deps)   asks only while the Alerts screen is on view AND the TV shows the page,
 *                                    one request at a time: an explicit open (◀ ▶, a language change) at once; otherwise
 *                                    every cfg.refreshMs since the last attempt — the shared gate, js/onview.js. A failed
 *                                    round keeps the last list. */
var AlertsHistory = (function () {
  var STAMP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/, text = Alerts.text;
  // "The threat has been removed" (category 13, like "the event has ended"): an end, never an alert in the list.
  var REMOVED = /^\s*הוסר החשש/;

  function shapeError() { return new Error('alerts history: unexpected shape'); }

  function parse(list, max) {
    if (!Array.isArray(list)) throw shapeError();
    var byKey = {}, events = [], i;
    for (i = 0; i < list.length; i++) {
      var r = list[i], m = r && typeof r === 'object' && typeof r.alertDate === 'string' ? r.alertDate.match(STAMP) : null;
      if (!m || !text(r.data) || !text(r.category_desc)) throw shapeError();
      if (Alerts.isEnd(r.category_desc) || REMOVED.test(r.category_desc)) continue;
      var key = r.alertDate + '|' + r.category_desc, e = byKey[key];
      if (!e) {
        e = byKey[key] = { at: r.alertDate, order: events.length, date: m[3] + '.' + m[2] + '.' + m[1], time: m[4] + ':' + m[5],
          title: r.category_desc, kind: Alerts.kind(r.category_desc), areas: [] };
        events.push(e);
      }
      if (e.areas.indexOf(r.data) < 0) e.areas.push(r.data);
    }
    events.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : a.order - b.order; });
    var out = [];
    for (i = 0; i < events.length && i < max; i++) {
      out.push({ date: events[i].date, time: events[i].time, title: events[i].title, kind: events[i].kind, areas: events[i].areas });
    }
    return out;
  }

  // deps: { getJson(url, timeoutMs, done), now(), setTimeout, clearTimeout, documentVisible() (optional), onChange() }
  // state(): { kind: 'loading' | 'failed' (no list yet) | 'fresh' | 'stale' (the last round failed or the list is older
  //            than cfg.staleAfterMs), events, updatedAt }
  function createController(cfg, deps) {
    var events = [], updatedAt = 0, failed = false;
    // One round: one request; the round is over (the gate schedules the next) before the screen is redrawn.
    var gate = OnView.create(cfg.refreshMs, deps, function (done) {
      deps.getJson(cfg.url, cfg.timeoutMs, function (err, json) {
        var list = null;
        if (!err) { try { list = parse(json, cfg.max); } catch (e) { list = null; } }
        failed = list === null;
        if (list) { events = list; updatedAt = deps.now(); }
        done();
        deps.onChange();
      });
    });

    return {
      // The Alerts screen came into view (explicit: the remote opened it, or the language changed on it) or left it.
      setVisible: gate.setVisible,
      // The TV hid or showed the page: hidden stops the cadence; shown asks the gate again.
      visibilityChanged: gate.visibilityChanged,
      state: function () {
        var kind = !updatedAt ? (failed ? 'failed' : 'loading') : failed || deps.now() - updatedAt > cfg.staleAfterMs ? 'stale' : 'fresh';
        return { kind: kind, events: events, updatedAt: updatedAt };
      }
    };
  }

  return { parse: parse, createController: createController };
})();
