'use strict';
// Batch 17 (C-1): the modules js/app.js was split into, each on its own (DESIGN-17 §7.2). The browser pins of the whole
// (tests/browser/app17.test.mjs) prove the split changed nothing; these prove each module's own contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, ROOT } = require('./harness');

const T0 = Date.UTC(2026, 9, 29, 18, 32);   // 20:32 in Israel
function fakeDate(now) {
  function D(...a) { return a.length ? new Date(...a) : new Date(now.ms); }
  D.now = () => now.ms; D.UTC = Date.UTC; D.parse = Date.parse;
  return D;
}

// ---- HomeClock -------------------------------------------------------------------------------------------------
test('HomeClock: "HH:MM" at home, a stamp of another day carries its date, a retry is rounded up to the next minute', () => {
  const now = { ms: T0 };
  const ctx = load(['js/tz.js', 'js/home-clock.js'], { Date: fakeDate(now) });
  const clocks = [{ id: 'israel', zones: ['Asia/Jerusalem'], rule: 'IL', place: 'rehovot' }, { id: 'ukraine', zones: ['Europe/Kyiv'], rule: 'EU', place: 'kyiv' }];
  const c = ctx.HomeClock.create(clocks, T0);
  assert.equal(c.hhmm(T0), '20:32');
  assert.equal(c.hhmm(0), '', 'no moment: nothing');
  assert.equal(c.stamp(T0), '20:32', 'today: the time alone');
  assert.equal(c.stamp(T0 - 86400000), '28.10 20:32', 'another day: its date first');
  assert.equal(c.retryAt(T0 + 1000), '20:33', 'never "retry at" the minute already shown');
  assert.equal(c.retryAt(0), '');
  assert.equal(c.today(), '2026-10-29');
  assert.equal(c.date(), '29.10.2026');
  assert.equal(c.placeHourKey('nowhere'), null, 'a place without a clock: no hour');
  assert.equal(c.placeWall({ id: 'nowhere' })(T0).hours, 20, 'a place without a clock reads the home clock (batch 15)');
  assert.equal(c.placeWall({ id: 'kyiv' })(T0).hours, 20, 'Kyiv: its own clock (UTC+2 in late October)');
});

// ---- AppNav ----------------------------------------------------------------------------------------------------
function navWorld(ids) {
  const calls = [], els = {};
  const el = () => ({ className: '', style: {}, offsetWidth: 0, innerHTML: '', children: [{}, {}, {}] });
  const doc = { getElementById: (id) => (els[id] = els[id] || el()) };
  const ctx = load(['js/screens.js', 'js/app-nav.js']);
  const gate = (name) => ({ setVisible: (on, explicit) => { if (on) calls.push(name + '.visible' + (explicit ? '!' : '')); } });
  const sources = { markets: gate('markets'), traffic: gate('traffic'), map: gate('map'), history: gate('history'),
    store: { refresh: () => calls.push('store.refresh') }, air: { refresh: () => calls.push('air.refresh') },
    news: { refresh: () => calls.push('news.refresh') }, shabbat: { refresh: () => calls.push('shabbat.refresh') } };
  const render = {};
  for (const id of ids) render[id] = () => calls.push('render ' + id);
  const timers = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {}, log: () => {} };
  const nav = ctx.AppNav.create(doc, { ids, rotation: { enabled: false, intervalMs: 45000, dwellMs: {}, afterKeyMs: 60000, afterAlertMs: 0 },
    render, sources, onShown: () => calls.push('onShown'), timers });
  nav.start();
  return { nav, calls };
}
test('AppNav: a ◀ ▶ open — select (explicit) → refresh on open → render → the banner; frozen order (§3.1)', () => {
  const w = navWorld(['main', 'news', 'markets']);
  w.calls.length = 0;
  w.nav.step(1);
  assert.deepEqual(w.calls, ['news.refresh', 'render news', 'onShown']);
  w.calls.length = 0;
  w.nav.step(1);
  assert.deepEqual(w.calls, ['markets.visible!', 'render markets', 'onShown'], 'markets: told it is on view, by the remote');
});
test('AppNav: onData redraws only when one of its screens is on view; open() is false for an unknown screen', () => {
  const w = navWorld(['main', 'news']);
  const onNews = w.nav.onData('news'), onMain = w.nav.onData('main', 'israel');
  w.calls.length = 0;
  onNews();
  assert.deepEqual(w.calls, [], 'news is not on view');
  onMain();
  assert.deepEqual(w.calls, ['render main']);
  assert.equal(w.nav.open('nowhere'), false);
  assert.equal(w.nav.currentIs('main'), true);
});
// FIX-17B 16: built through the renderers' factories (stub sources), never read from the source text: the draws the App puts
// in its table cover exactly Config.screens.
test('the render table the App builds covers every configured screen exactly', () => {
  const ctx = load(['js/config.js', 'js/app-render-weather.js', 'js/app-render-feeds.js']);
  const w = ctx.WeatherRender.create({}, {}), f = ctx.FeedRender.create({}, {});
  const draws = Object.keys(w).filter((k) => k !== 'clocks').concat(Object.keys(f)).sort();
  assert.deepEqual(draws, [...ctx.Config.screens].sort());
  for (const k of draws) assert.equal(typeof (w[k] || f[k]), 'function', k);
});

// ---- AlertFlow -------------------------------------------------------------------------------------------------
function flowWorld() {
  const now = { ms: T0 }, calls = [];
  const ctx = load(['js/config.js', 'js/alerts.js', 'js/app-alerts.js'], { Date: fakeDate(now) });
  let state = { active: null, checkedAt: T0 }, timer = null, onView = 'main';
  ctx.AlertView = { render: (s) => calls.push('layer ' + (s.active ? 'up' : 'quiet')) };
  ctx.AlertBanner = { render: (on) => calls.push('banner ' + on) };
  const flow = ctx.AlertFlow.create({ alerts: { state: () => state }, sound: { start: () => calls.push('sound.start'), stop: () => calls.push('sound.stop'), once: () => calls.push('sound.once') },
    nav: { hold: (on) => { const changed = on !== world.held; world.held = on; return changed; }, open: (id) => { onView = id; calls.push('open ' + id); return true; },
      currentIs: (id) => onView === id, renderCurrent: () => calls.push('render ' + onView) },
    clock: { hhmm: () => '20:32' }, cityView: { close: () => calls.push('city.close') },
    timers: { now: () => now.ms, setTimeout: (f) => { timer = f; return 1; }, clearTimeout: () => { timer = null; } } });
  const world = { flow, calls, held: false, set: (s) => { state = s; }, fire: () => timer && timer(), onView: () => onView };
  return world;
}
test('AlertFlow: a real alert ends the preview for good, closes the city sheet, opens the Alerts screen and rings once', () => {
  const w = flowWorld();
  w.flow.togglePreview();
  assert.equal(w.flow.previewing(), true);
  w.calls.length = 0;
  w.set({ active: { startedAt: T0, title: 't', ids: '1', places: [] }, checkedAt: T0 });
  w.flow.render();
  assert.equal(w.flow.previewing(), false);
  assert.deepEqual(w.calls, ['city.close', 'layer up', 'sound.start', 'open alerts', 'banner false']);
  w.calls.length = 0;
  w.flow.render();
  assert.ok(!w.calls.includes('sound.start') && !w.calls.includes('open alerts'), 'only the hold change opens and rings');
  assert.equal(w.flow.alertUp(), true);
});
test('AlertFlow: the preview never shows the banner, and the blue key is ignored over a real alert', () => {
  const w = flowWorld();
  w.flow.togglePreview();
  assert.ok(w.calls.includes('banner false') && !w.calls.includes('banner true'), 'no banner for a preview');
  w.fire();
  assert.equal(w.flow.previewing(), false, 'the preview ends on its own');
  w.set({ active: { startedAt: T0, title: 't', ids: '1', places: [] }, checkedAt: T0 });
  w.flow.render();
  w.flow.togglePreview();
  assert.equal(w.flow.previewing(), false);
});

// ---- AppKeys ---------------------------------------------------------------------------------------------------
function keysWorld(o = {}) {
  const calls = [];
  const ctx = load(['js/app-keys.js']);
  const keys = ctx.AppKeys.create({ env: { canRegisterKeys: () => true, registerKey: (n) => { calls.push('register ' + n); return n !== 'ColorF2Yellow' || !o.noYellow; }, exit: () => calls.push('exit') },
    player: { stop: () => calls.push('player.stop') },
    nav: { touch: () => calls.push('touch'), step: (d) => calls.push('step ' + d) },
    flow: { previewing: () => !!o.preview, togglePreview: () => calls.push('preview'), alertUp: () => !!o.alert },
    lang: { switch: (s) => calls.push('lang ' + s) },
    cityView: { isOpen: () => !!o.city, key: (k) => calls.push('city ' + k), open: () => calls.push('city.open') }, homeId: () => 'rehovot' });
  const press = (code) => { const e = { keyCode: code, prevented: false, preventDefault() { this.prevented = true; } }; keys.onKey(e); return e.prevented; };
  return { keys, calls, press };
}
test('AppKeys: the routing table — the city sheet first, the preview second, Back, ◀ ▶, OK only without an alert, the language keys', () => {
  let w = keysWorld({ city: true });
  w.press(39);
  assert.deepEqual(w.calls, ['city 39', 'touch']);
  w = keysWorld({ preview: true });
  w.press(39);
  assert.deepEqual(w.calls, ['preview', 'touch'], 'any key only ends the preview');
  w = keysWorld();
  w.press(10009); w.press(37); w.press(13); w.press(40); w.press(38); w.press(405);
  // D5 (COMMON-DECISION player-behind 2026-11-05): Back stops the player behind, then exits.
  assert.deepEqual(w.calls, ['player.stop', 'exit', 'step -1', 'city.open', 'touch', 'lang 1', 'touch', 'lang -1', 'touch', 'lang 1', 'touch']);
  w = keysWorld({ alert: true });
  w.press(13);
  assert.deepEqual(w.calls, ['touch'], 'OK never opens the city sheet over an alert');
});
test('AppKeys: the language key is the first colour key the TV lets the app register', () => {
  const w = keysWorld({ noYellow: true });
  w.keys.register();
  assert.deepEqual(w.calls, ['register ColorF3Blue', 'register ColorF2Yellow', 'register ColorF0Red']);
  w.calls.length = 0;
  w.press(403);
  assert.deepEqual(w.calls, ['lang 1', 'touch']);
});

test('D5: Back stops the player behind before the dashboard exits', () => {
  const w = keysWorld();
  w.press(10009);
  assert.deepEqual(w.calls, ['player.stop', 'exit']);
});

// ---- AppEnv: the life journal (D7) ----------------------------------------------------------------------------------
function envWorld(o = {}) {
  const store = {}, logs = [];
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { if (o.refuse) throw new Error('QuotaExceededError'); store[k] = String(v); } };
  const ctx = load(['js/app-env.js'], { window: { localStorage }, console: { error: (m) => logs.push(m), log: () => {} } });
  return { env: ctx.AppEnv, store, logs };
}
test('D7: AppEnv.life keeps the last 100 dated lines in dashLife, across launches', () => {
  const w = envWorld();
  for (let i = 0; i < 105; i++) w.env.life('line ' + i);
  const lines = JSON.parse(w.store.dashLife);
  assert.equal(lines.length, 100);
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT\S+Z line 5$/);
  assert.match(lines[99], / line 104$/);
});
test('D7: AppEnv.exit journals the exit first; a storage refusing the journal is logged, never thrown', () => {
  const w = envWorld();
  w.env.exit();                                            // desktop: no tizen — logged
  assert.match(JSON.parse(w.store.dashLife).pop(), / exit$/);
  const r = envWorld({ refuse: true });
  r.env.life('launch');
  assert.ok(r.logs.some((m) => /dashLife/.test(m)), 'the refusal was not said');
});

// ---- AppLang ---------------------------------------------------------------------------------------------------
function langWorld(stored, refuse) {
  const calls = [], logs = [];
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/html.js', 'js/app-lang.js'], { console: { error: (m) => logs.push(m), log: () => {} } });
  ctx.document = { documentElement: {}, querySelectorAll: () => [] };
  const storage = { getItem: () => { if (refuse) throw new Error('refused'); return stored; }, setItem: () => { if (refuse) throw new Error('refused'); } };
  let settle = null;
  const timers = { setTimeout: (f) => { settle = f; return 1; }, clearTimeout: () => {} };
  const lang = ctx.AppLang.create({ env: { storage: () => storage, log: (m) => logs.push(m) }, timers, toast: { show: (t) => calls.push('toast ' + t) },
    sources: { news: { use: (l) => calls.push('news.use ' + l), refresh: () => calls.push('news.refresh') } },
    ui: { nav: { select: (id, ex) => calls.push('select ' + id + ex), refreshOnOpen: (id) => calls.push('refreshOnOpen ' + id), current: () => 'news', renderCurrent: () => calls.push('render') },
      flow: { render: () => calls.push('flow.render') } } });
  return { ctx, lang, calls, logs, settle: () => settle() };
}
test('AppLang: stored → Config.lang → the first; an unknown stored value or a refusing storage keeps going', () => {
  let w = langWorld('he'); w.lang.start(); assert.equal(w.ctx.I18n.lang(), 'he');
  w = langWorld('xx'); w.lang.start(); assert.equal(w.ctx.I18n.lang(), w.ctx.Config.lang);
  w = langWorld(null, true); w.lang.start(); assert.equal(w.ctx.I18n.lang(), w.ctx.Config.lang);
  w.lang.switch(1);
  assert.match(w.logs.join('\n'), /language not saved: refused/);
});
test('AppLang: seven presses → one settle, in the frozen order (news.refresh → select → refreshOnOpen, F17-3)', () => {
  const w = langWorld('ru');
  w.lang.start();
  for (let i = 0; i < 7; i++) w.lang.switch(1);
  w.calls.length = 0;
  w.settle();
  assert.deepEqual(w.calls, ['news.refresh', 'select newstrue', 'refreshOnOpen news']);
});

// ---- AppCity ---------------------------------------------------------------------------------------------------
test('AppCity: saved and read back → one reload; no storage or a refusing one → false, no reload (C-18)', () => {
  const ctx = load(['js/config.js', 'js/i18n.js', 'js/app-city.js']);
  const run = (storage) => {
    const calls = [];
    const city = ctx.AppCity.create({ env: { storage: () => storage, sessionStore: () => ({ setItem: () => calls.push('toast kept') }), log: (m) => calls.push('log ' + m), reload: () => calls.push('reload') }, toast: { show: () => {} } });
    return { ok: city.choose('haifa'), calls };
  };
  const mem = {};
  assert.deepEqual(run({ setItem: (k, v) => { mem[k] = v; }, getItem: (k) => mem[k] }), { ok: true, calls: ['toast kept', 'reload'] });
  assert.deepEqual(run(null), { ok: false, calls: ['log city not saved: the TV gives no storage'] });
  assert.deepEqual(run({ setItem: () => {}, getItem: () => null }), { ok: false, calls: [] }, 'not read back: kept, no reload');
});

// ---- AppWake ---------------------------------------------------------------------------------------------------
test('AppWake: on wake, data not fresh or older than its interval refreshes; hidden refreshes nothing; the tick re-arms at the minute + 50 ms', () => {
  const now = { ms: T0 + 20000 }, calls = [];
  const ctx = load(['js/config.js', 'js/app-wake.js'], { Date: fakeDate(now) });
  let armed = null;
  const timers = { now: () => now.ms, setTimeout: (f, ms) => { armed = ms; return 1; }, clearTimeout: () => {}, setInterval: () => 1 };
  let visible = false;
  const src = (name, st) => ({ status: () => st, refresh: () => calls.push(name + '.refresh') });
  const sources = { store: src('store', { kind: 'fresh', updatedAt: now.ms - 60000 }), news: src('news', { kind: 'stale', updatedAt: now.ms }),
    air: src('air', { kind: 'fresh', updatedAt: now.ms - 2 * 3600000 }), shabbat: src('shabbat', { kind: 'fresh', updatedAt: now.ms }),
    markets: { visibilityChanged: () => calls.push('markets.gate') }, history: { visibilityChanged: () => calls.push('history.gate') },
    map: null, traffic: { wake: () => calls.push('traffic.wake') }, alerts: { poll: () => calls.push('alerts.poll') } };
  const wake = ctx.AppWake.create({ timers, env: { documentVisible: () => visible, keepScreenOn: () => calls.push('screensaver') }, nav: { renderCurrent: () => calls.push('render') },
    sources, player: { visibilityChanged: () => calls.push('player') }, doc: {} });
  wake.onVisible();
  assert.deepEqual(calls, ['player', 'history.gate', 'markets.gate'], 'hidden: the gates are told, nothing refreshes');
  calls.length = 0;
  visible = true;
  wake.onVisible();
  assert.deepEqual(calls, ['player', 'history.gate', 'markets.gate', 'screensaver', 'render', 'alerts.poll', 'news.refresh', 'air.refresh', 'traffic.wake']);
  assert.equal(armed, 60000 - now.ms % 60000 + 50);
});

// ---- module sizes (A7) ---------------------------------------------------------------------------------------------
test('C-1: the App is a composition root and every module it was split into stays small (≤ 200 lines)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^app.*\.js$|^home-clock\.js$|^view-state\.js$|^view-toast\.js$/.test(f));
  assert.ok(files.length >= 12, files.join(','));
  for (const f of files) assert.ok(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').split('\n').length <= 200, f);
});

// Batch 25 T5 F3 (Opus): the Markets header's time can be a kept row's from an earlier day (Yahoo failing overnight) — it
// carries its date, as the weather's (B14-3, HomeClock.stamp); today's alone.
test('B25 F3: the Markets header — a kept row\'s time from before midnight carries its date, one of today the time alone', () => {
  const NOW = Date.UTC(2026, 9, 29, 22, 10), now = { ms: NOW };   // 00:10 on 30.10 in Israel
  const ctx = load(['js/config.js', 'js/tz.js', 'js/home-clock.js', 'js/app-render-feeds.js'], { Date: fakeDate(now) });
  const clock = ctx.HomeClock.create(ctx.Config.clocks, NOW), drawn = [];
  ctx.MarketsView = { render: (snap, s) => drawn.push(s) };
  let st = { kind: 'stale', snapshot: null, updatedAt: Date.UTC(2026, 9, 29, 21, 50) };   // 23:50 on 29.10
  const f = ctx.FeedRender.create({ markets: { state: () => st } }, clock);
  f.markets();
  st = { kind: 'fresh', snapshot: null, updatedAt: NOW - 5 * 60000 };
  f.markets();
  assert.deepEqual(drawn.map((s) => [s.kind, s.updated]), [['stale', '29.10 23:50'], ['fresh', '00:05']]);
});
