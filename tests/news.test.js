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
  assert.match(nr[0].summary, /^Сирены прозвучали в Реховоте/);
  const pr = ctx.News.parse(feed('pravda'), 'pravda', 15);
  assert.equal(pr.length, 5);
  assert.equal(pr[0].summary, '', 'no description: no summary (the article body in content:encoded is never read)');
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
  const item = ctx.News.parse(feed('bbc'), 'bbc', 15).find((i) => /искусственном/.test(i.title));
  assert.equal(item.summary, 'Брюссель утвердил правила «высокого риска» & штрафы до 7% оборота.');
  assert.ok(!/[<>]|script|onerror/.test(item.summary));
  assert.equal(ctx.News.plain('<![CDATA[<p>A&nbsp;&amp;&#160;B &#x41;&#1046;</p>]]>'), 'A & B AЖ');
  assert.equal(ctx.News.plain('&lt;b&gt;bold&lt;/b&gt; &amp;amp;'), 'bold &', 'escaped HTML: unescaped, then its tags dropped');
  assert.equal(ctx.News.plain('a &unknown; &#0; b'), 'a &unknown; b', 'unknown entities stay literal, invalid code points vanish');
});

test('merge: newest first across feeds; a story carried twice (same headline or same address) appears once, the newest copy', () => {
  const ctx = load(FILES);
  const lists = ['newsru', 'pravda', 'bbc'].map((id) => ctx.News.parse(feed(id), id, 15));
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

function makeStore(ctx, random) {
  const clock = fakeTimers(T0);
  const calls = [];
  let changes = 0;
  const store = ctx.News.createStore(ctx.Config.news, {
    getText: (url, timeoutMs, done) => calls.push({ url, timeoutMs, done }),
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, random, onChange: () => { changes++; } });
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

test('one refresh = ONE parallel round: every feed requested at once, with a timeout; nothing more while it is in flight', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  assert.equal(s.store.refresh(), true);
  assert.deepEqual(s.calls.map((c) => c.url), plain(ctx.Config.news.feeds.map((f) => f.url)), 'all three before any answer');
  assert.ok(s.calls.every((c) => c.timeoutMs === 20000));
  assert.equal(s.store.refresh(), false);
  assert.equal(s.calls.length, 3);
  assert.equal(s.store.status().kind, 'loading');
  assert.equal(s.answer(), 3);
  assert.equal(s.changes(), 1, 'one render when the whole round is in');
  assert.equal(s.store.status().kind, 'fresh');
  assert.equal(s.store.items().length, 14);
  assert.deepEqual(s.clock.pending(), [10 * 60000], 'next round in 10 min');
});

test('one feed failing: its last good stories stay, the screen is stale and names the source; others keep updating', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx, () => 0.5);
  s.store.refresh(); s.answer();
  s.clock.advance(10 * 60000);
  s.answer({ bbc: 'http 503' });
  const st = s.store.status();
  assert.equal(st.kind, 'stale');
  assert.deepEqual([...st.failed], ['bbc']);
  assert.equal(s.store.items().filter((i) => i.source === 'bbc').length, 3, 'the BBC stories are still shown');
  assert.equal(st.updatedAt, T0 + 10 * 60000, 'the other feeds did update');
  s.clock.advance(60000);                          // back-off: at most one minute
  assert.equal(s.answer(), 3);
  assert.equal(s.store.status().kind, 'fresh');
});

test('an answer with no stories (an error page served as 200) is a failure, not an empty feed', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer({ newsru: '<html><body>Service unavailable</body></html>' });
  assert.deepEqual([...s.store.status().failed], ['newsru']);
});

test('nothing yet and every feed failed: "failed" with a known retry time; stories older than 35 min are stale', () => {
  const ctx = load(FILES);
  const s = makeStore(ctx);
  s.store.refresh(); s.answer({ newsru: 'timeout', pravda: 'network', bbc: 'http 404' });
  assert.equal(s.store.status().kind, 'failed');
  assert.ok(s.store.nextAt() > T0);
  const t = makeStore(ctx);
  t.store.refresh(); t.answer();
  t.store.stop();
  t.clock.advance(35 * 60000);
  assert.equal(t.store.status().kind, 'fresh', 'exactly at the limit');
  t.clock.advance(1);
  assert.equal(t.store.status().kind, 'stale');
});

// B2 (Codex #4, CE F8): de-duplication never merges two different stories.
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
  assert.deepEqual(plain(mixed.map((i) => [i.title, i.summary])), [['A tail', 'x a y']]);
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
