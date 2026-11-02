'use strict';
// News: RSS parsing of each feed's recorded shape (tests/fixtures/news), sanitising, merge / de-duplication /
// newest-first order, and the refresh cycle — every feed in one parallel round, last good stories kept, stale marks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FILES = ['js/config.js', 'js/refresher.js', 'js/news.js'];
const T0 = Date.parse('2026-10-29T18:34:00Z');
const feed = (id) => fs.readFileSync(path.join(__dirname, 'fixtures', 'news', id + '.xml'), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('each feed\'s shape parses: CDATA (NEWSru, BBC), escaped text (Pravda), "+0200" and "GMT" dates', () => {
  const ctx = load(FILES);
  const nr = ctx.News.parse(feed('newsru'), 'newsru', 15);
  assert.equal(nr.length, 6);
  assert.equal(nr[0].title, 'Ракетная тревога в центре страны: перехваты над Шфелой, пострадавших нет');
  assert.equal(nr[0].at, Date.parse('2026-10-29T18:28:00Z'));
  assert.equal(nr[0].key, 'https://www.newsru.co.il/rest/29oct2026/shfela_alert.html');
  assert.deepEqual(Object.keys(nr[0]).sort(), ['at', 'key', 'source', 'title'], 'only what the screen shows: no summary (PERF-3)');
  const pr = ctx.News.parse(feed('pravda-rus'), 'pravda', 15);
  assert.equal(pr.length, 5);
  const bbc = ctx.News.parse(feed('bbc'), 'bbc', 15);
  assert.equal(bbc[0].at, Date.parse('2026-10-29T18:22:00Z'));
  assert.equal(bbc[0].key, 'https://www.bbc.com/russian/articles/c0xyz?at_medium=RSS&at_campaign=rss', 'the XML-escaped link decoded');
});

test('a story without a time is skipped; the list is newest first and limited to perFeed', () => {
  const ctx = load(FILES);
  const bbc = ctx.News.parse(feed('bbc'), 'bbc', 15);
  assert.equal(bbc.length, 4, 'the dateless item is gone');
  assert.ok(!bbc.some((i) => /без даты/.test(i.title)));
  const two = ctx.News.parse(feed('newsru'), 'newsru', 2);
  assert.deepEqual(plain(two.map((i) => i.at)), [Date.parse('2026-10-29T18:28:00Z'), Date.parse('2026-10-29T18:15:00Z')]);
});

test('feed text is sanitised: tags and scripts dropped, entities decoded, whitespace collapsed — plain text only', () => {
  const ctx = load(FILES);
  // PERF-3: the headline is the only feed text shown, so the sanitising is proven on it
  const rss = '<rss><channel><item><title><![CDATA[<p>Брюссель утвердил правила &laquo;высокого риска&raquo; &amp; штрафы<script>alert(1)</script> ' +
    '<img src=x onerror=y> до 7% оборота.</p>]]></title><link>https://x.test/1</link><pubDate>Thu, 29 Oct 2026 20:30:00 +0200</pubDate></item></channel></rss>';
  const item = ctx.News.parse(rss, 'bbc', 15)[0];
  assert.equal(item.title, 'Брюссель утвердил правила «высокого риска» & штрафы до 7% оборота.');
  assert.ok(!/[<>]|script|onerror/.test(item.title));
  assert.equal(ctx.News.plain('<![CDATA[<p>A&nbsp;&amp;&#160;B &#x41;&#1046;</p>]]>'), 'A & B AЖ');
  assert.equal(ctx.News.plain('&lt;b&gt;bold&lt;/b&gt; &amp;amp;'), 'bold &', 'escaped HTML: unescaped, then its tags dropped');
  assert.equal(ctx.News.plain('a &unknown; &#0; b'), 'a &unknown; b', 'unknown entities stay literal, invalid code points vanish');
});

test('merge: newest first across feeds; a story carried twice (same headline or same address) appears once, the newest copy', () => {
  const ctx = load(FILES);
  const lists = ['newsru', 'pravda-rus', 'bbc'].map((id) => ctx.News.parse(feed(id), id, 15));
  const all = ctx.News.merge(lists);
  assert.equal(all.length, 6 + 5 + 4 - 1, 'the BBC copy of the NEWSru story is dropped');
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].at >= all[i].at, 'order at ' + i);
  const alert = all.filter((i) => /Ракетная тревога/.test(i.title));
  assert.deepEqual(plain(alert.map((i) => i.source)), ['newsru'], 'kept the newer copy');
  const sameLink = ctx.News.merge([[{ key: 'https://X.test/a?utm_source=rss&at_medium=RSS#top', title: 'One', at: 2, source: 'a' }], [{ key: 'https://x.test/a/', title: 'Other words', at: 1, source: 'b' }]]);
  assert.deepEqual(plain(sameLink).map((i) => i.source), ['a'], 'same address with tracking parameters, a fragment or a trailing slash');
  const distinct = ctx.News.merge([[{ key: 'https://x.test/1', title: 'Новость один', at: 2 }, { key: 'https://x.test/2', title: 'Новость два', at: 1 }]]);
  assert.equal(distinct.length, 2, 'different stories both stay');
});

// lang: the store's language (default 'he': Ynet and Globes, the feeds the batch-5 tests below were written for).
function makeStore(ctx, random, lang) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const store = ctx.News.createStore(ctx.Config.news, {
    getText: (url, timeoutMs, done) => calls.push({ url, timeoutMs, done }),
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random, onChange: () => { changes++; } }, lang || 'he');
  // Answers every open request of the last round: per feed id, 'ok' | an error label | a body string.
  const answer = (by) => {
    const open = calls.splice(0, calls.length);
    for (const c of open) {
      const id = ctx.Config.news.feeds.find((f) => f.url === c.url).id, a = (by && by[id]) || 'ok';
      if (a === 'ok') c.done(null, feed(id)); else if (a.startsWith('<')) c.done(null, a); else c.done(a, undefined);
    }
    return open.length;
  };
  return { store, clock, calls, answer, changes: () => changes };
}

// FB5-NS: two feeds (Ynet, Globes), one per column; was three merged feeds.
test('one refresh = ONE parallel round: every feed requested at once, with a timeout; nothing more while it is in flight', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.refresh(), true);
  assert.deepEqual(s.calls.map((c) => c.url), ['https://www.ynet.co.il/Integration/StoryRss2.xml',
    'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2'], 'both of the language\'s feeds before any answer');
  assert.ok(s.calls.every((c) => c.timeoutMs === 20000));
  assert.equal(s.store.refresh(), false);
  assert.equal(s.calls.length, 2);
  assert.equal(s.store.status().kind, 'loading');
  assert.equal(s.answer(), 2);
  assert.equal(s.changes(), 1, 'one render when the whole round is in');
  assert.equal(s.store.status().kind, 'fresh');
  assert.deepEqual([s.store.column('il').items.length, s.store.column('econ').items.length], [5, 5]);
  assert.deepEqual(s.clock.pending(), [10 * 60000], 'next round in 10 min');
});

// FB5-NS + batch 6 (L2): the language picks the sources — ru: NEWSru's Israel and economy sections; he: Ynet and Globes;
// uk: Ukrainska Pravda and Ekonomichna Pravda. Two columns, five stories each, one feed per column and language.
test('L2: config — two columns, one feed per column in every language (ru NEWSru, he Ynet + Globes, uk Pravda + Ekonomichna Pravda)', () => {
  const ctx = load(FILES);
  const n = ctx.Config.news;
  assert.deepEqual(plain(n.columns), [{ id: 'il', feeds: { ru: 'newsru', he: 'ynet', uk: 'pravda' } }, { id: 'econ', feeds: { ru: 'newsrufin', he: 'globes', uk: 'epravda' } }]);
  assert.equal(n.perColumn, 5);
  assert.deepEqual(plain(n.feeds.map((f) => [f.id, f.url])), [
    ['newsru', 'https://www.newsru.co.il/il/www/section/israel'], ['newsrufin', 'https://www.newsru.co.il/il/www/section/finance'],
    ['ynet', 'https://www.ynet.co.il/Integration/StoryRss2.xml'], ['globes', 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2'],
    ['pravda', 'https://www.pravda.com.ua/rss/'], ['epravda', 'https://epravda.com.ua/rss/']]);
  for (const lang of ctx.Config.languages) for (const c of n.columns) assert.ok(n.feeds.some((f) => f.id === c.feeds[lang]), lang + ' ' + c.id);
});

test('L2: only the active language\'s two feeds are fetched — Russian, Hebrew, Ukrainian', () => {
  const ctx = load(FILES);
  const want = { ru: ['newsru.co.il/il/www/section/israel', 'newsru.co.il/il/www/section/finance'], he: ['ynet.co.il', 'globes.co.il'],
    uk: ['www.pravda.com.ua/rss/', '//epravda.com.ua/rss/'] };
  for (const lang of ['ru', 'he', 'uk']) {
    const s = makeStore(ctx, null, lang);
    s.store.refresh();
    assert.equal(s.calls.length, 2, lang + ': two requests, never the other languages\' feeds');
    s.calls.forEach((c, i) => assert.ok(c.url.includes(want[lang][i]), lang + ' ' + c.url));
    s.answer();
    const il = s.store.column('il'), econ = s.store.column('econ');
    assert.deepEqual([il.source, econ.source, il.kind, econ.kind, il.items.length, econ.items.length],
      [ctx.Config.news.columns[0].feeds[lang], ctx.Config.news.columns[1].feeds[lang], 'fresh', 'fresh', 5, 5], lang);
  }
});

test('L2: use(lang) puts the new language\'s feeds on screen (loading) and fetches nothing; refresh() fetches them; the old round\'s late answers change nothing', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 0.5, 'ru');
  s.store.refresh();
  const old = s.calls.splice(0, s.calls.length);                     // the Russian round, still in flight
  s.store.use('he');
  assert.equal(s.calls.length, 0, 'use() alone fetches nothing (the app waits for the remote to settle)');
  s.store.refresh();
  assert.deepEqual(s.calls.map((c) => c.url.split('/')[2]), ['www.ynet.co.il', 'www.globes.co.il'], 'refresh(): the new feeds only');
  assert.deepEqual([s.store.column('il').source, s.store.column('il').kind, s.store.column('econ').kind], ['ynet', 'loading', 'loading']);
  assert.equal(s.store.status().kind, 'loading');
  old.forEach((c) => c.done(null, feed(c.url.includes('finance') ? 'newsrufin' : 'newsru')));
  assert.equal(s.changes(), 0, 'a late answer of the old language changes nothing');
  assert.equal(s.store.column('il').kind, 'loading');
  s.answer();
  assert.equal(s.changes(), 1);
  assert.deepEqual([s.store.column('il').kind, s.store.column('econ').kind], ['fresh', 'fresh']);
  assert.deepEqual(s.clock.pending(), [10 * 60000], 'one cycle: the next round in 10 min, the old cycle\'s timer gone');
  s.store.use('he');
  assert.equal(s.calls.length, 0, 'the same language again: nothing');
  s.store.use('uk');
  s.store.refresh();
  s.answer();
  s.store.use('he');
  s.store.refresh();
  assert.equal(s.store.column('il').kind, 'fresh', 'back to Hebrew: its stories stay on view while they refresh');
  assert.equal(s.calls.length, 2);
});

test('L2: the Ukrainian and Russian economy feeds parse as recorded (ISO pubDate of Ekonomichna Pravda; NEWSru\'s economy section)', () => {
  const ctx = load(FILES);
  const ep = ctx.News.parse(feed('epravda'), 'epravda', 15);
  assert.equal(ep.length, 7);
  assert.equal(ep[0].at, Date.parse('2026-10-29T14:00:00Z'), '"2026-10-29T16:00:00+02:00" in <pubDate>');
  assert.match(ep[0].title, /^Міненерго про Київ/);
  const nf = ctx.News.parse(feed('newsrufin'), 'newsrufin', 15);
  assert.equal(nf.length, 7);
  assert.match(nf[0].key, /^https:\/\/www\.newsru\.co\.il\/finance\//);
});

test('FB5-NS: a column is its own feed\'s top five, newest first, each story once', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer();
  const il = s.store.column('il'), econ = s.store.column('econ');
  assert.equal(il.kind, 'fresh');
  assert.deepEqual(plain(il.items.map((i) => i.key.slice(-6))), ['s1aa01', 's1aa02', 's1aa03', 's1aa04', 's1aa05'], 'Ynet: newest first; the repeated story once');
  assert.ok(il.items.every((i) => i.source === 'ynet') && econ.items.every((i) => i.source === 'globes'), 'no story crosses columns');
  const at = plain(econ.items.map((i) => i.at));
  assert.deepEqual(at, [...at].sort((a, b) => b - a), 'Globes lists its top stories out of time order; the column is newest first');
  assert.equal(econ.items[0].at, Date.parse('2026-10-29T18:31:00Z'));
  assert.equal(econ.updatedAt, T0);
});

test('FB5-NS: one feed failing: only its column is stale and keeps its five stories; the other column updates', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 0.5);
  s.store.refresh(); s.answer();
  s.clock.advance(10 * 60000);
  s.answer({ globes: 'http 503' });
  const st = s.store.status();
  assert.equal(st.kind, 'stale');
  assert.deepEqual([...st.failed], ['globes']);
  assert.equal(st.updatedAt, T0 + 10 * 60000, 'Ynet did update');
  const econ = s.store.column('econ'), il = s.store.column('il');
  assert.deepEqual([econ.kind, econ.items.length, econ.updatedAt], ['stale', 5, T0], 'Globes keeps its last stories and their time');
  assert.deepEqual([il.kind, il.updatedAt], ['fresh', T0 + 10 * 60000], 'Ynet unaffected');
  s.clock.advance(60000);                          // back-off: at most one minute
  assert.equal(s.answer(), 2);
  assert.equal(s.store.status().kind, 'fresh');
});

test('an answer with no stories (an error page served as 200) is a failure, not an empty feed', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer({ ynet: '<html><body>Service unavailable</body></html>' });
  assert.deepEqual([...s.store.status().failed], ['ynet']);
  assert.deepEqual(plain(s.store.column('il')), { source: 'ynet', items: [], kind: 'failed', updatedAt: 0 }, 'FB5-NS: «Нет данных» in that column only');
  assert.equal(s.store.column('econ').kind, 'fresh');
});

test('nothing yet and every feed failed: "failed" with a known retry time; stories older than 35 min are stale', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer({ ynet: 'timeout', globes: 'http 404' });
  assert.equal(s.store.status().kind, 'failed');
  assert.ok(s.store.nextAt() > T0);
  const t = makeStore(ctx);
  t.store.refresh(); t.answer();
  t.store.stop();
  t.clock.advance(35 * 60000);
  assert.equal(t.store.status().kind, 'fresh', 'exactly at the limit');
  assert.equal(t.store.column('il').kind, 'fresh');
  t.clock.advance(1);
  assert.equal(t.store.status().kind, 'stale');
  assert.equal(t.store.column('il').kind, 'stale', 'FB5-NS: the column too');
});

test('B2: distinct stories stay distinct — identity query, path case, signed numbers, Hebrew and punctuation-only headlines', () => {
  const ctx = load(FILES);
  const it = (key, title, at) => ({ key, title, at: at || 1, source: 's' });
  const n = (...items) => ctx.News.merge([items]).length;
  assert.equal(n(it('https://x.test/story?id=1', 'A'), it('https://x.test/story?id=2', 'B')), 2, '?id=1 and ?id=2');
  assert.equal(n(it('https://x.test/News/A1', 'A'), it('https://x.test/news/a1', 'B')), 2, 'paths are case-sensitive');
  assert.equal(n(it('https://x.test/a', 'Температура -5'), it('https://x.test/b', 'Температура +5')), 2, '−5 is not +5');
  assert.equal(n(it('https://x.test/a', 'Температура −5'), it('https://x.test/b', 'Температура – 5')), 1, 'the same sign written two ways');
  assert.equal(n(it('https://x.test/a', 'פיגוע בירושלים'), it('https://x.test/b', 'גשם בתל אביב')), 2, 'two Hebrew headlines');
  assert.equal(n(it('https://x.test/a', '!!!'), it('https://x.test/b', '???')), 2, 'no usable title key: links decide');
  assert.equal(n(it('https://x.test/a', '«Тель-Авив»: пробки'), it('https://y.test/b', 'Тель Авив — пробки')), 1, 'the same headline, punctuation aside');
  assert.equal(n(it('https://x.test/a?id=1&utm_campaign=x', 'A'), it('https://x.test/a?id=1', 'B')), 1, 'tracking parameters only are dropped');
});

// B1 (CE F6, Codex #6): CDATA and comments are text, never structure; each layer decoded once, at its own level.
test('B1: CDATA holding "</item>", mixed CDATA, comments and nested markup do not break items; layered decoding', () => {
  const ctx = load(FILES);
  const rss = (items) => '<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><!-- <item><title>ghost</title></item> -->' + items + '</channel></rss>';
  const item = (title, extra) => '<item><title>' + title + '</title><link>https://x.test/1</link>' + (extra || '') + '<pubDate>Thu, 29 Oct 2026 20:30:00 +0200</pubDate></item>';
  const one = ctx.News.parse(rss(item('<![CDATA[Что означает тег </item> в RSS]]>')), 's', 15);
  assert.deepEqual(plain(one.map((i) => [i.title, i.at])), [['Что означает тег в RSS', Date.parse('2026-10-29T18:30:00Z')]], 'the headline and its date survive');
  const mixed = ctx.News.parse(rss(item('<![CDATA[A]]> tail', '<description>x <tags><tag>a</tag></tags> <br> y</description>')), 's', 15);
  assert.deepEqual(plain(mixed.map((i) => i.title)), ['A tail'], 'a description with nested markup never cuts the item');
  const nested = ctx.News.parse(rss(item('x <tags><tag>a</tag></tags> <br> y')), 's', 15);
  assert.deepEqual(plain(nested.map((i) => i.title)), ['x a y'], 'nested markup inside the headline: its text only');
  assert.equal(ctx.News.parse(rss(item('a <!-- hidden --> b')), 's', 15)[0].title, 'a b', 'a comment inside an element is dropped');
  assert.equal(ctx.News.plain('<![CDATA[A]]> tail'), 'A tail');
  assert.equal(ctx.News.plain('a &amp;lt;b&amp;gt; c'), 'a <b> c', 'XML-escaped "&lt;b&gt;" is the text "<b>", never a tag');
  assert.equal(ctx.News.plain('<![CDATA[&amp;amp;]]>'), '&amp;', 'CDATA is not XML-decoded; the HTML inside is decoded once, never twice');
  assert.equal(ctx.News.plain('&amp;nbsp;x &nbsp;y'), 'x y', 'an HTML entity escaped for XML, and one written raw');
});

// B3 (CE F7): Dublin Core dates; no zone abbreviation is guessed.
test('B3: dc:date when there is no pubDate; an unknown zone abbreviation is not guessed (the story is skipped)', () => {
  const ctx = load(FILES);
  const rss = (date) => '<rss><channel><item><title>T</title><link>https://x.test/1</link>' + date + '</item></channel></rss>';
  assert.equal(ctx.News.parse(rss('<dc:date>2026-10-29T20:30:00+02:00</dc:date>'), 's', 15)[0].at, Date.parse('2026-10-29T18:30:00Z'));
  assert.equal(ctx.News.parse(rss('<pubDate>Thu, 29 Oct 2026 20:30:00 IDT</pubDate>'), 's', 15).length, 0, 'IDT is not guessed');
  assert.equal(ctx.News.parse(rss('<pubDate>Thu, 29 Oct 2026 20:30:00 IDT</pubDate><dc:date>2026-10-29T20:30:00+03:00</dc:date>'), 's', 15)[0].at,
    Date.parse('2026-10-29T17:30:00Z'), 'an unreadable pubDate falls back to dc:date');
});

// C-2 (batch 16): the one freshness rule — stories dated after the clock (it went back) are stale, never fresh.
test('C-2: a clock that went back makes a feed\'s stories stale, not fresh', () => {
  const ctx = load(FILES), s = makeStore(ctx);
  s.store.refresh();
  s.answer();
  assert.equal(s.store.column('il').kind, 'fresh');
  s.clock.advance(-60 * 60000);
  assert.equal(s.store.column('il').kind, 'stale');
});
// C-19 (batch 16): a feed that does not parse is said through deps.log (never a silent catch) and is a failure of its column.
test('C-19: a feed whose parse throws is logged with its message', () => {
  const ctx = load(FILES), logs = [];
  const t = fakeTimers(T0), calls = [];
  const store = ctx.News.createStore(ctx.Config.news, { getText: (u, ms, done) => calls.push(done), now: t.now, setTimeout: t.setTimeout,
    clearTimeout: t.clearTimeout, onChange: () => {}, log: (m) => logs.push(m) }, 'he');
  store.refresh();
  calls[0](null, { toString() { throw new Error('boom'); } });
  calls[1](null, feed('globes'));
  assert.deepEqual(logs, ['news ynet: boom']);
  assert.equal(store.column('il').kind, 'failed');
});
