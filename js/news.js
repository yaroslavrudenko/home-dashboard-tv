/* News from RSS 2.0 feeds. ES5.
 *   News.parse(xml, sourceId, max)   one feed's items, newest first: [{ key, title, summary, at, source }]
 *   News.plain(raw)                  an element's raw content as plain text, decoded layer by layer: the XML layer
 *                                    (CDATA sections verbatim, comments dropped, XML entities decoded), then the HTML
 *                                    it carries (scripts and tags dropped, HTML entities decoded), whitespace
 *                                    collapsed. Feed HTML is never rendered: the views escape this text.
 *   News.merge(lists)                every feed's items in one list, newest first, each story once
 *   News.createStore(cfg, deps)      every feed in ONE parallel round per refresh (js/refresher.js)
 * Parsing is a small text scanner (no DOMParser, no XML library), so the same code runs on the TV and in the Node
 * tests; it steps over CDATA sections and comments before it looks for any tag, so "</item>" inside a headline is
 * text, not structure. */
var News = (function () {
  var NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
    bdquo: '„', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…', minus: '−', shy: '' };
  var XML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
  var ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;
  var MAX_SUMMARY = 400;                           // the lead shows two lines; nothing longer is ever kept
  var CDATA_OPEN = '<![CDATA[', CDATA_CLOSE = ']]>', COMMENT_OPEN = '<!--', COMMENT_CLOSE = '-->';

  function fromCode(c) {
    if (c <= 0xffff) return String.fromCharCode(c);
    c -= 0x10000;
    return String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
  }
  // Decodes numeric references and the names in `table`; unknown names stay as written.
  function decodeWith(table, s) {
    return s.replace(ENTITY, function (all, e) {
      if (e.charAt(0) === '#') {
        var code = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code < 0x110000 && (code < 0xd800 || code > 0xdfff) ? fromCode(code) : '';
      }
      var n = table[e.toLowerCase()];
      return n === undefined ? all : n;
    });
  }

  // The XML layer: an element's character data (CDATA verbatim, comments dropped, XML entities decoded).
  function xmlText(raw) {
    var out = '', i = 0;
    for (;;) {
      var c = raw.indexOf(CDATA_OPEN, i), m = raw.indexOf(COMMENT_OPEN, i);
      var next = c < 0 ? m : m < 0 ? c : Math.min(c, m);
      if (next < 0) return out + decodeWith(XML_NAMED, raw.slice(i));
      out += decodeWith(XML_NAMED, raw.slice(i, next));
      if (next === c) {
        var ce = raw.indexOf(CDATA_CLOSE, c + 9);
        out += raw.slice(c + 9, ce < 0 ? raw.length : ce);
        i = ce < 0 ? raw.length : ce + 3;
      } else {
        var me = raw.indexOf(COMMENT_CLOSE, m + 4);
        i = me < 0 ? raw.length : me + 3;
      }
    }
  }
  // The HTML layer: tags (and whole scripts / styles) dropped before HTML entities are decoded, so a decoded "&lt;"
  // can never become a tag.
  function htmlText(html) {
    html = html.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ');
    return decodeWith(NAMED, html).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }
  function plain(raw) { return htmlText(xmlText(raw)); }

  // The end of the tag starting at `lt` (the index of its ">", outside quoted attribute values), or -1.
  function tagEnd(xml, lt) {
    for (var i = lt + 1, q = ''; i < xml.length; i++) {
      var ch = xml.charAt(i);
      if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === '\'') q = ch; else if (ch === '>') return i;
    }
    return -1;
  }
  // Every <item> of a feed as { element name: raw content } (the first occurrence of each child). CDATA sections,
  // comments, processing instructions and declarations are stepped over before any tag is read. Inside a child only
  // its own closing tag ends it, so nested or unbalanced markup in a description cannot cut an item short.
  function items(xml) {
    var out = [], item = null, child = null, childStart = 0, i = 0, len = xml.length;
    while (i < len) {
      var lt = xml.indexOf('<', i);
      if (lt < 0) break;
      if (xml.substr(lt, 9) === CDATA_OPEN) { var ce = xml.indexOf(CDATA_CLOSE, lt + 9); i = ce < 0 ? len : ce + 3; continue; }
      if (xml.substr(lt, 4) === COMMENT_OPEN) { var me = xml.indexOf(COMMENT_CLOSE, lt + 4); i = me < 0 ? len : me + 3; continue; }
      var gt = tagEnd(xml, lt);
      if (gt < 0) break;
      i = gt + 1;
      var first = xml.charAt(lt + 1);
      if (first === '?' || first === '!') continue;
      var closing = first === '/', body = xml.slice(lt + (closing ? 2 : 1), gt);
      var name = body.split(/[\s\/]/)[0], empty = body.charAt(body.length - 1) === '/';
      if (child !== null) {
        if (closing && name === child) { if (!item.hasOwnProperty(child)) item[child] = xml.slice(childStart, lt); child = null; }
      } else if (item !== null) {
        if (closing && name === 'item') { out.push(item); item = null; }
        else if (!closing && !empty) { child = name; childStart = gt + 1; }
      } else if (!closing && name === 'item' && !empty) item = {};
    }
    return out;
  }

  // Cut at a word boundary (the view clamps to two lines; this only bounds memory).
  function bounded(s) {
    if (s.length <= MAX_SUMMARY) return s;
    var cut = s.lastIndexOf(' ', MAX_SUMMARY);
    return s.slice(0, cut > 0 ? cut : MAX_SUMMARY);
  }
  // RSS pubDate (RFC 822: "+0200", "GMT" — what the three feeds send, checked on their live answers), else Dublin
  // Core dc:date (ISO 8601). No zone abbreviation is guessed: an unreadable time skips the story.
  function timeOf(it) {
    var at = it.pubDate !== undefined ? Date.parse(plain(it.pubDate)) : NaN;
    return isNaN(at) && it['dc:date'] !== undefined ? Date.parse(plain(it['dc:date'])) : at;
  }

  function parse(xml, sourceId, max) {
    var list = items(String(xml)), out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i], title = it.title !== undefined ? plain(it.title) : '', at = timeOf(it);
      if (!title || isNaN(at)) continue;           // a story without a headline or a time cannot be placed
      var link = (it.link !== undefined ? plain(it.link) : '') || (it.guid !== undefined ? plain(it.guid) : '');
      out.push({ key: link, title: title, summary: it.description !== undefined ? bounded(plain(it.description)) : '', at: at, source: sourceId });
    }
    out.sort(byNewest);
    return out.slice(0, max);
  }

  function byNewest(a, b) { return b.at - a.at; }
  // The same story under two addresses: scheme and host in any case, the path as written (paths are case-sensitive)
  // without trailing slashes, the query without tracking parameters (utm_*, at_*), no fragment.
  var TRACKING = /^(utm_|at_)/i, URL_PARTS = /^([a-z][a-z0-9+.\-]*:\/\/[^\/?#]*)([^?#]*)(\?[^#]*)?/i;
  function linkKey(link) {
    if (!link) return '';
    var m = URL_PARTS.exec(link);
    if (!m) return 'l:' + link.replace(/#[\s\S]*$/, '');
    var params = m[3] ? m[3].slice(1).split('&') : [], keep = [];
    for (var i = 0; i < params.length; i++) if (params[i] && !TRACKING.test(params[i])) keep.push(params[i]);
    return 'l:' + m[1].toLowerCase() + m[2].replace(/\/+$/, '') + (keep.length ? '?' + keep.join('&') : '');
  }
  // The same headline: case, spaces and punctuation ignored, but letters of every script kept and a sign before a
  // number kept ("−5" is not "+5"). Empty (all punctuation): no title key at all.
  var PLUS = /\+\s*(?=\d)/g, MINUS = /[\-−–]\s*(?=\d)/g;
  var NOISE = /[\s!-\/:-@\[-`{-~ «»‐-―‘-‟…−]+/g;
  function titleKey(title) {
    var k = title.toLowerCase().replace(PLUS, '\u0001').replace(MINUS, '\u0002').replace(NOISE, '');
    return k ? 't:' + k : '';
  }

  // A story counts once even when two feeds (or one feed twice) carry it: same address or same headline.
  function merge(lists) {
    var all = [], out = [], seen = {}, i;
    for (i = 0; i < lists.length; i++) all = all.concat(lists[i]);
    all.sort(byNewest);
    for (i = 0; i < all.length; i++) {
      var lk = linkKey(all[i].key), tk = titleKey(all[i].title);
      if ((lk && seen[lk]) || (tk && seen[tk])) continue;
      if (lk) seen[lk] = true;
      if (tk) seen[tk] = true;
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
