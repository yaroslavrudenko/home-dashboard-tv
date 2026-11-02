'use strict';
// Batch 12, FIX-12B code F3: the producer (js/shabbat.js, Shabbat.view over the recorded Hebcal answers) and the consumer
// (js/view-shabbat.js) meet on ONE contract. The view's snapshot fixture (tests/fixtures/shabbat-view-snapshots.json)
// must BE the producer's output for its recorded source at its home instant — a producer change that the fixture does not
// follow fails here — and the producer's output goes straight into ShabbatView in every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fixture, ROOT } = require('./harness');

const DATA = ['js/config.js', 'js/tz.js', 'js/refresher.js', 'js/openmeteo.js', 'js/placestore.js', 'js/shabbat.js'];
const VIEW = ['js/i18n.js', 'js/html.js', 'js/icons.js', 'js/view.js', 'js/view-shabbat.js'];
const SNAP = fixture('shabbat-view-snapshots');
const PLACE = { ru: 'Реховот', he: 'רחובות', uk: 'Реховот' };
const plain = (v) => JSON.parse(JSON.stringify(v));
const hebcal = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hebcal', file), 'utf8'));

// The producer's snapshot for a fixture entry: its source parsed, viewed at its instant on its home date.
function produce(ctx, entry) {
  return ctx.Shabbat.view(ctx.Shabbat.parse(hebcal(entry.source), ctx.Config.shabbat), entry.nowMs, entry.today, ctx.Config.shabbat);
}
function fakeScreen() {
  const nodes = {};
  const node = (id) => nodes[id] || (nodes[id] = { id, className: '', innerHTML: '' });
  return { el: { innerHTML: '', querySelector: (sel) => node(sel.replace(/^#/, '')) }, nodes };
}

test('F3: every snapshot the view is tested with IS the producer\'s output for its recorded Hebcal answer and instant', () => {
  const ctx = load(DATA);
  const names = Object.keys(SNAP);
  assert.equal(names.length, 9);
  for (const name of names) {
    const e = SNAP[name];
    assert.ok(e.source && e.today && e.nowMs, name + ': the entry names its source, home date and instant');
    assert.deepEqual(plain(produce(ctx, e)), e.snapshot, name + ': the fixture equals Shabbat.view over ' + e.source);
  }
});

test('F3: the producer\'s output rendered by ShabbatView in ru, he and uk — every state, no raw key, the calm card exactly for shabbat / yomtov', () => {
  const ctx = load(DATA.concat(VIEW));
  const calm = [ctx.Shabbat.STATE.SHABBAT, ctx.Shabbat.STATE.YOMTOV];
  const seen = new Set();
  for (const lang of ['ru', 'he', 'uk']) {
    ctx.I18n.setLang(lang);
    for (const name of Object.keys(SNAP)) {
      const scr = fakeScreen();
      ctx.ShabbatView.init(scr.el, { upcoming: ctx.Config.shabbat.upcoming });
      const snap = produce(ctx, SNAP[name]);
      seen.add(snap.state);
      ctx.ShabbatView.render(snap, { kind: 'fresh', updated: '09:31', retryAt: '', place: PLACE[lang] });
      const week = scr.nodes['sh-week'], list = scr.nodes['sh-list'], html = week.innerHTML + list.innerHTML;
      assert.ok(html.length > 200, lang + ' ' + name + ': both cards drawn');
      assert.ok(!/\b(sh|w|n)\.[a-z]+\.?[A-Za-z]*/.test(html.replace(/<[^>]*>/g, ' ')), lang + ' ' + name + ': no raw string key');
      assert.ok(html.includes(PLACE[lang]), lang + ' ' + name + ': the home city');
      assert.equal(/is-calm/.test(week.className), calm.includes(snap.state), lang + ' ' + name + ': calm exactly in ' + calm);
      assert.equal(scr.nodes['shabbat-status'].className, 'status screen-status is-fresh');
    }
  }
  assert.deepEqual([...seen].sort(), Object.values(plain(ctx.Shabbat.STATE)).sort(), 'every state of the contract is exercised');
});

// The coordinator's order: the view reads the producer's states only (js/shabbat.js loads before it in index.html); the
// literal copy of the names that stood in until the merge is gone.
test('F3: the view takes the states from Shabbat.STATE only — no literal copy of the names', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'view-shabbat.js'), 'utf8');
  assert.match(src, /var STATE = Shabbat\.STATE;/);
  assert.ok(!/WEEKDAY:\s*'weekday'/.test(src), 'no literal fallback');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="js/shabbat.js"') > 0 && html.indexOf('src="js/shabbat.js"') < html.indexOf('src="js/view-shabbat.js"'), 'js/shabbat.js loads first');
});
