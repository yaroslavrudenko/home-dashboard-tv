/* News from RSS 2.0 feeds. ES5.
 *   News.parse(xml, sourceId, max)   one feed's items, newest first: [{ key, title, summary, at, source }]
 *   News.plain(raw)                  an element's content as plain text (CDATA unwrapped, tags dropped, entities
 *                                    decoded, whitespace collapsed). Feed HTML is never rendered: views escape it.
 *   News.merge(lists)                every feed's items in one list, newest first, each story once
 *   News.createStore(cfg, deps)      every feed in ONE parallel round per refresh (js/refresher.js)
 * Parsing is text-based (no DOMParser), so the same code runs on the TV and in the Node tests. */
var News = (function () {
  var NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
    bdquo: '„', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…', minus: '−', shy: '' };
  var ITEM = /<item[\s>][\s\S]*?<\/item>/g, CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/;
  var MAX_SUMMARY = 400;                           // the lead shows two lines; nothing longer is ever kept

  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (all, e) {
      if (e.charAt(0) === '#') {
        var code = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code < 0x110000 && (code < 0xd800 || code > 0xdfff) ? fromCode(code) : '';
      }
      var n = NAMED[e.toLowerCase()];
      return n === undefined ? all : n;
    });
  }
  function fromCode(c) {
    if (c <= 0xffff) return String.fromCharCode(c);
    c -= 0x10000;
    return String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
  }

  function plain(raw) {
    var cdata = CDATA.exec(raw);
    var html = cdata ? cdata[1] : decode(raw);     // XML-escaped content is HTML once unescaped
    html = html.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ');
    return decode(html).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  // One compiled pattern per element name, built once and reused for every item of every refresh.
  var TAGS = {};
  function tag(item, name) {
    var re = TAGS[name] || (TAGS[name] = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
    var m = re.exec(item);
    return m ? plain(m[1]) : '';
  }
  // Cut at a word boundary (the view clamps to two lines; this only bounds memory).
  function bounded(s) {
    if (s.length <= MAX_SUMMARY) return s;
    var cut = s.lastIndexOf(' ', MAX_SUMMARY);
    return s.slice(0, cut > 0 ? cut : MAX_SUMMARY);
  }

  function parse(xml, sourceId, max) {
    var items = String(xml).match(ITEM) || [], out = [];
    for (var i = 0; i < items.length; i++) {
      var title = tag(items[i], 'title'), at = Date.parse(tag(items[i], 'pubDate'));
      if (!title || isNaN(at)) continue;           // a story without a headline or a time cannot be placed
      var link = tag(items[i], 'link') || tag(items[i], 'guid');
      out.push({ key: link, title: title, summary: bounded(tag(items[i], 'description')), at: at, source: sourceId });
    }
    out.sort(byNewest);
    return out.slice(0, max);
  }

  function byNewest(a, b) { return b.at - a.at; }
  function linkKey(link) { return link ? 'l:' + link.replace(/[?#][\s\S]*$/, '').replace(/\/+$/, '').toLowerCase() : ''; }
  function titleKey(title) { return 't:' + title.toLowerCase().replace(/[^0-9a-zа-яёіїєґ]+/g, ''); }

  // A story counts once even when two feeds (or one feed twice) carry it: same address or same headline.
  function merge(lists) {
    var all = [], out = [], seen = {}, i;
    for (i = 0; i < lists.length; i++) all = all.concat(lists[i]);
    all.sort(byNewest);
    for (i = 0; i < all.length; i++) {
      var lk = linkKey(all[i].key), tk = titleKey(all[i].title);
      if ((lk && seen[lk]) || seen[tk]) continue;
      if (lk) seen[lk] = true;
      seen[tk] = true;
      out.push(all[i]);
    }
    return out;
  }

  // deps: { getText(url, timeoutMs, done), now(), setTimeout, clearTimeout, random() (optional), onChange(store) }
  function createStore(cfg, deps) {
    var feeds = cfg.feeds, state = [], merged = [];
    for (var i = 0; i < feeds.length; i++) state.push({ items: null, updatedAt: 0, error: null });

    function accept(answers) {
      var failed = false, lists = [];
      for (var i = 0; i < feeds.length; i++) {
        var s = state[i], a = answers[i], items = null;
        if (!a.err) { try { items = parse(a.text, feeds[i].id, cfg.perFeed); } catch (e) { items = null; } }
        // An answer with no story at all (an error page served as 200) is a failure, not an empty feed.
        if (items && items.length) { s.items = items; s.updatedAt = deps.now(); s.error = null; } else { s.error = a.err || 'parse'; failed = true; }
        if (s.items) lists.push(s.items);
      }
      merged = merge(lists);
      return failed;
    }

    // Every feed at once; the answers are applied together, so one refresh renders once.
    var cycle = Refresher.create(cfg, deps, function (finish) {
      var answers = [], pending = feeds.length;
      for (var i = 0; i < feeds.length; i++) (function (i) {
        deps.getText(feeds[i].url, cfg.timeoutMs, function (err, text) {
          answers[i] = { err: err, text: text };
          if (--pending === 0) finish(function () { return accept(answers); });
        });
      })(i);
    }, function () { deps.onChange(api); });

    var api = {
      refresh: cycle.refresh,
      items: function () { return merged; },
      // kind: 'loading' | 'failed' (nothing yet) | 'fresh' | 'stale' (some feed failed or is old); `failed` lists the
      // sources whose stories are not current; updatedAt is the latest successful answer.
      status: function () {
        var any = false, errors = 0, latest = 0, failed = [], now = deps.now();
        for (var i = 0; i < feeds.length; i++) {
          var s = state[i];
          if (s.error) errors++;
          if (!s.items) { if (s.error) failed.push(feeds[i].id); continue; }
          any = true;
          latest = Math.max(latest, s.updatedAt);
          var age = now - s.updatedAt;
          if (s.error || age < 0 || age > cfg.staleAfterMs) failed.push(feeds[i].id);
        }
        if (!any) return { kind: errors === feeds.length ? 'failed' : 'loading', failed: failed };
        return { kind: failed.length ? 'stale' : 'fresh', updatedAt: latest, failed: failed };
      },
      nextAt: cycle.nextAt,
      stop: cycle.stop
    };
    return api;
  }

  return { parse: parse, plain: plain, merge: merge, createStore: createStore };
})();
