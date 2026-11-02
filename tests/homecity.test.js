'use strict';
// Batch 10 (C): the home city. js/cities.js is the catalogue (SSOT); js/homecity.js resolves the city (stored choice →
// Config.homeCity → Rehovot) and derives the main weather place, the ten traffic routes and their columns, the map and the
// alert areas. The owner's Rehovot setup is frozen in tests/fixtures/config-5df4e33.json (captured from the repository at
// 5df4e33 with `git show`, never from the tree under test) and must come out of the derivation unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, fakeTimers } = require('./harness');

const FROZEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'config-5df4e33.json'), 'utf8'));
const OREF = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'oref', 'districts_heb.json'), 'utf8')).map((d) => d.label_he);
const plain = (v) => JSON.parse(JSON.stringify(v));
const ctx = load(['js/cities.js', 'js/homecity.js', 'js/alerts.js']);
const { Cities, HomeCity, Alerts } = ctx;
const ids = Cities.list.map((c) => c.id);
const entry = (id) => HomeCity.find(Cities, id);
const officialOf = (place) => OREF.filter((a) => Alerts.coversPlace(a, place));

test('C/T1: the catalogue — unique ids, names in four languages (Russian, Ukrainian spelling), the "in" forms, centres inside Israel, the picker orders', () => {
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 16, 'ten routes and spare: ' + ids.length);
  for (const c of [...Cities.list, ...Cities.pois]) {
    assert.match(c.id, /^[a-z]+$/, c.id);
    assert.match(c.he, /^[א-ת '"״׳-]+$/, c.id + ' he');
    assert.match(c.ru, /^[А-ЯЁа-яё -]+$/, c.id + ' ru');
    assert.match(c.uk, /^[А-ЩЬЮЯҐЄІЇа-щьюяґєії’ -]+$/, c.id + ' uk');
    assert.ok(c.en, c.id + ' en');
    assert.ok(c.at[0] > 29.4 && c.at[0] < 33.4 && c.at[1] > 34.2 && c.at[1] < 35.9, c.id + ' inside Israel: ' + c.at);
  }
  for (const c of Cities.list) {
    assert.match(c.ruIn, /^[А-ЯЁа-яё -]+$/, c.id + ' ruIn');
    assert.match(c.ukIn, /^[А-ЩЬЮЯҐЄІЇа-щьюяґєії’ -]+$/, c.id + ' ukIn');
  }
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    const order = Cities.order[lang], coll = new Intl.Collator(lang);
    assert.deepEqual([...order].sort(), [...ids].sort(), lang + ': every city once');
    for (let i = 1; i < order.length; i++) assert.ok(coll.compare(entry(order[i - 1])[lang], entry(order[i])[lang]) <= 0, lang + ' sorted at ' + order[i]);
  }
});

test('C/T1: no two cities share a centre (the draft geocoded Tira onto Tirat Carmel); Tira is in the Triangle', () => {
  const seen = new Map();
  for (const c of Cities.list) { const k = c.at.join(','); assert.ok(!seen.has(k), c.id + ' and ' + seen.get(k)); seen.set(k, c.id); }
  assert.ok(HomeCity.km(entry('tira').at, entry('tiratcarmel').at) > 50);
});

test('C/T2: every city\'s Oref names cover at least one official area; home and every derived nearby city never share an area', () => {
  for (const c of Cities.list) for (const m of c.match || [c.he]) assert.ok(officialOf({ he: m }).length, c.id + ': ' + m);
  for (const id of ids) {
    const d = HomeCity.derive(Cities, id), home = new Set(officialOf(d.alerts.areas[0]));
    for (const n of d.alerts.nearby) for (const a of officialOf(n)) assert.ok(!home.has(a), id + ': ' + a + ' both home and nearby (' + n.he + ')');
  }
});

test('C/T3: Rehovot (the default) derives the owner\'s 5df4e33 setup exactly — routes, columns, map, alert areas and every name', () => {
  const d = plain(HomeCity.derive(Cities, 'rehovot'));
  assert.deepEqual([d.place.lat, d.place.lon], [FROZEN.place0.lat, FROZEN.place0.lon]);
  assert.deepEqual(d.routes, FROZEN.routes);
  assert.deepEqual(d.columns, FROZEN.columns);
  assert.deepEqual(d.map, FROZEN.map);
  const pick = (list) => list.map((p) => ({ he: p.he, ru: p.ru, uk: p.uk }));
  assert.deepEqual(pick(d.alerts.areas), FROZEN.alerts.areas);
  assert.deepEqual(pick(d.alerts.nearby), FROZEN.alerts.nearby);
  for (const lang of ['ru', 'he', 'uk', 'en']) {
    const want = FROZEN.names[lang];
    assert.equal(HomeCity.name(entry('rehovot'), lang), want['place.rehovot'], lang);
    for (const r of FROZEN.routes) assert.equal(HomeCity.name(d.names[r.id], lang), want['t.route.' + r.id], lang + ' ' + r.id);
  }
});

test('C/T3: apply writes the derived sections into Config; the Israel clock follows the home place (the harness, like App.start)', () => {
  const app = load(['js/config.js']);
  const C = app.Config;
  assert.equal(C.homeCity, 'rehovot');
  assert.deepEqual(plain(C.places[0]), { id: 'home', lat: 31.8928, lon: 34.8113 });
  assert.equal(C.clocks[0].place, 'home');
  assert.deepEqual(plain(C.traffic.routes), FROZEN.routes);
  assert.deepEqual([C.map.center, C.map.zoom, C.map.home].map(plain), [FROZEN.map.center, FROZEN.map.zoom, FROZEN.map.home]);
  assert.equal(C.home.id, 'rehovot');
  assert.deepEqual(plain(C.places.slice(1).map((p) => p.id)), ['kyiv', 'sydney', 'haifa', 'telaviv', 'beersheva'], 'the regions keep their places');
});

test('C/T4: every city derives 10 routes from home (5 big cities + the 5 nearest, ≥ 2 km, none twice, never home), the map on home, ≤ 11 nearby areas', () => {
  for (const id of ids) {
    const d = HomeCity.derive(Cities, id), c = entry(id), dests = d.routes.map((r) => r.id);
    assert.equal(d.routes.length, 10, id + ': the quota math assumes ten');
    assert.ok(d.routes.every((r) => r.from === c.at), id + ' from home');
    assert.deepEqual([d.columns[0].legs.length, d.columns[1].legs.length], [5, 5], id);
    assert.deepEqual(d.columns[0].legs.concat(d.columns[1].legs), dests, id);
    assert.equal(new Set(dests).size, 10, id + ' no destination twice');
    assert.ok(!dests.includes(id), id + ' never home');
    assert.ok(!d.columns[0].legs.includes(id) && d.columns[0].legs.every((x) => ['tlv', 'jlm', 'haifa', 'beersheva', 'ashkelon', 'netanya'].includes(x)), id);
    if (!c.near) {
      const kms = d.columns[1].legs.map((x) => HomeCity.km(c.at, entry(x).at));
      for (let i = 0; i < kms.length; i++) assert.ok(kms[i] >= 2 && (i === 0 || kms[i] >= kms[i - 1]), id + ' near ' + kms);
    }
    assert.ok(d.map.home === c.at && (c.map || d.map.center === c.at), id + ' map');
    assert.ok(d.alerts.nearby.length <= 11 && !d.alerts.nearby.some((n) => n.he === c.he), id + ' nearby');
    for (const n of d.alerts.nearby) assert.ok(n.match.length && n.ruIn && n.ukIn, id + ' nearby fields');
  }
});

test('C/T5: named examples — Haifa, Tel Aviv, Jerusalem; Kiryat Shmona falls back to the 40 km ring; Eilat has no city within 40 km', () => {
  const near = (id) => plain(HomeCity.derive(Cities, id).columns[1].legs);
  const cities = (id) => plain(HomeCity.derive(Cities, id).columns[0].legs);
  const nearby = (id) => plain(HomeCity.derive(Cities, id).alerts.nearby.map((p) => p.ru));
  assert.deepEqual(cities('haifa'), ['tlv', 'jlm', 'beersheva', 'ashkelon', 'netanya']);
  assert.deepEqual(near('haifa'), ['tiratcarmel', 'nesher', 'kiryatyam', 'kiryatmotzkin', 'kiryatbialik']);
  assert.deepEqual(nearby('haifa'), ['Тират-Кармель', 'Нешер', 'Кирьят-Ям', 'Кирьят-Моцкин', 'Кирьят-Бялик', 'Кирьят-Ата', 'Акко', 'Шфарам', 'Тамра']);
  assert.deepEqual(near('tlv'), ['ramatgan', 'givatayim', 'bneibrak', 'givatshmuel', 'kiryatono']);
  assert.deepEqual(near('jlm'), ['maaleadumim', 'beitarillit', 'beitshemesh', 'modiinillit', 'modiin']);
  assert.deepEqual(nearby('jlm'), ['Маале-Адумим', 'Бейтар-Илит', 'Бейт-Шемеш']);
  // the 40 km fallback: Safed 28.4 and Ma'alot-Tarshiha 35.7 km (the design's example missed Ma'alot); Karmiel 42 km is out
  assert.deepEqual(nearby('kiryatshmona'), ['Цфат', 'Маалот-Таршиха']);
  assert.deepEqual(nearby('eilat'), []);
  assert.deepEqual(plain(HomeCity.derive(Cities, 'haifa').map), plain({ center: entry('haifa').at, zoom: 9.6, home: entry('haifa').at }));
});

test('C/T6: which city — the stored choice, else the build\'s, else Rehovot; unknown or non-city ids fall through', () => {
  assert.equal(HomeCity.resolve(Cities, 'haifa', 'tlv'), 'haifa');
  assert.equal(HomeCity.resolve(Cities, null, 'tlv'), 'tlv');
  assert.equal(HomeCity.resolve(Cities, 'atlantis', 'tlv'), 'tlv', 'a city the catalogue dropped');
  assert.equal(HomeCity.resolve(Cities, 'airport', 'glilot'), 'rehovot', 'a route destination is not a city');
  assert.equal(HomeCity.resolve(Cities, undefined, 'Haifa'), 'rehovot');
  assert.equal(HomeCity.resolve(Cities, null, null), 'rehovot');
});

test('C/T7: alerts by the city\'s Oref names — Modi\'in\'s centres raise Modi\'in (Modi\'in Illit does not); Kiryat Gat and Tel Aviv districts', () => {
  const app = load(['js/config.js', 'js/cities.js', 'js/homecity.js', 'js/alerts.js']);
  const raised = (home, areas) => {
    const cfg = plain(app.Config.alerts);
    const d = app.HomeCity.derive(app.Cities, home);
    cfg.areas = d.alerts.areas; cfg.nearby = d.alerts.nearby;
    const clock = fakeTimers(Date.parse('2026-10-30T18:00:00Z'));
    let body = '';
    const m = app.Alerts.createMonitor(cfg, { getText: (u, t, done) => done(null, body), now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, onChange: () => {} });
    body = JSON.stringify({ id: '1', cat: '1', title: 'ירי רקטות וטילים', data: areas, desc: 'היכנסו למרחב המוגן ושהו בו 10 דקות' });
    m.poll();
    const st = m.state();
    return plain({ home: st.active ? st.active.places.map((p) => p.en) : [], near: st.around ? st.around.places.map((p) => p.en) : [] });
  };
  assert.deepEqual(raised('modiin', ['מודיעין - ליגד סנטר']).home, ['Modi\'in']);
  assert.deepEqual(raised('modiin', ['מודיעין מכבים רעות']).home, ['Modi\'in']);
  assert.deepEqual(raised('modiin', ['מודיעין עילית']), { home: [], near: ['Modi\'in Illit'] }, 'the other city: nearby only');
  assert.deepEqual(raised('kiryatgat', ['קריית גת, כרמי גת']).home, ['Kiryat Gat']);
  assert.deepEqual(raised('tlv', ['תל אביב - מזרח']).home, ['Tel Aviv']);
  const preview = app.Alerts.preview({ active: null, nearby: null, around: null, offline: false, checkedAt: 0 }, { areas: app.HomeCity.derive(app.Cities, 'haifa').alerts.areas }, 1);
  assert.equal(preview.active.places[0].ru, 'Хайфа', 'the preview names the home city');
});

test('C/T8 (F1): the traffic row cache carries its routes\' signature — another city\'s times are never shown; the pre-signature cache stays only for Rehovot', () => {
  const app = load(['js/config.js', 'js/tz.js', 'js/ledger.js', 'js/traffic.js']);
  const T0 = Date.parse('2026-10-29T18:00:00Z');
  const rehovot = app.Config.traffic, haifa = plain(rehovot);
  haifa.routes = app.HomeCity.derive(app.Cities, 'haifa').routes;
  rehovot.token = haifa.token = 'pk.test';
  const row = { data: { travel: 1800, free: 1500, delay: 300, length: 25000 }, updatedAt: T0, error: null };
  const cacheText = (sig) => JSON.stringify(Object.assign({ v: 1, rows: Array.from({ length: 10 }, () => row), failed: false, problem: null, attemptAt: T0 }, sig === undefined ? {} : { sig }));
  const shown = (cfg, text) => {
    const m = new Map([['tt-cache', text]]);
    const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
    const s = app.Traffic.createStore(cfg, { getJson: () => {}, now: () => T0 + 60000, setTimeout: () => 0, clearTimeout: () => {}, storage, onChange: () => {} });
    return s.status().routes.filter((r) => r.data).length;
  };
  const sigR = app.Traffic.signature(rehovot.routes), sigH = app.Traffic.signature(haifa.routes);
  assert.notEqual(sigR, sigH);
  assert.equal(sigR, '5004d845', 'the 5df4e33 Rehovot routes: the legacy constant in js/traffic.js');
  assert.equal(shown(rehovot, cacheText(sigR)), 10, 'its own cache');
  assert.equal(shown(haifa, cacheText(sigR)), 0, 'Rehovot\'s times are not Haifa\'s');
  assert.equal(shown(haifa, cacheText(sigH)), 10);
  assert.equal(shown(rehovot, cacheText(undefined)), 10, 'the owner\'s cache from before signatures: kept');
  assert.equal(shown(haifa, cacheText(undefined)), 0, 'a pre-signature cache for any other city: dropped');
});

test('C/T8: a round writes the signature into the cache', () => {
  const app = load(['js/config.js', 'js/tz.js', 'js/ledger.js', 'js/traffic.js']);
  const cfg = app.Config.traffic;
  cfg.token = 'pk.test';
  const m = new Map(), dones = [];
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  const s = app.Traffic.createStore(cfg, { getJson: (u, t, done) => dones.push(done), now: () => Date.parse('2026-10-29T18:00:00Z'), setTimeout: () => 0, clearTimeout: () => {}, storage, onChange: () => {} });
  s.setVisible(true, true);
  assert.equal(dones.length, 10);
  dones.forEach((d) => d('timeout'));
  assert.equal(JSON.parse(m.get('tt-cache')).sig, app.Traffic.signature(cfg.routes));
});

// Batch 12: the Shabbat screen asks Hebcal for the home city by its GeoNames id (the city's own candle custom), else by
// its centre. Ids: GeoNames via Open-Meteo geocoding, kept where the match is ≤ 2 km away and Hebcal answers it
// (design captures geonameid-probe-2pass.json, 2026-11-02).
test('B12: 78 cities carry a GeoNames id (positive integers, all different); the five without one are the design\'s', () => {
  const withGeo = Cities.list.filter((c) => c.geo !== undefined);
  assert.equal(withGeo.length, 78);
  assert.ok(withGeo.every((c) => Number.isInteger(c.geo) && c.geo > 0));
  assert.equal(new Set(withGeo.map((c) => c.geo)).size, 78);
  assert.deepEqual(plain(Cities.list.filter((c) => c.geo === undefined).map((c) => c.id)).sort(), ['beitarillit', 'maaleadumim', 'modiinillit', 'tayibe', 'ummalfahm']);
  assert.ok(Cities.pois.every((p) => p.geo === undefined), 'route destinations are not homes');
});

test('B12: derive gives the Shabbat place — Rehovot 293725, Jerusalem 281184 (Shushan Purim), Beitar Illit / Modi\'in Illit by their centre with the Jerusalem 40 minutes; apply writes it into Config.shabbat', () => {
  assert.deepEqual(plain(HomeCity.derive(Cities, 'rehovot').shabbat), { geo: 293725, lat: 31.8928, lon: 34.8113, candleMins: null, shushanPurim: false });
  assert.deepEqual(plain(HomeCity.derive(Cities, 'jlm').shabbat), { geo: 281184, lat: 31.7816, lon: 35.2186, candleMins: null, shushanPurim: true });
  assert.deepEqual(plain(HomeCity.derive(Cities, 'beitarillit').shabbat), { geo: null, lat: 31.7014, lon: 35.1162, candleMins: 40, shushanPurim: false });
  assert.deepEqual(plain(HomeCity.derive(Cities, 'modiinillit').shabbat), { geo: null, lat: 31.9308, lon: 35.045, candleMins: 40, shushanPurim: false });
  const c = load(['js/config.js']).Config;
  HomeCity.apply(c, HomeCity.derive(Cities, 'haifa'));
  assert.deepEqual(plain(c.shabbat.place), { geo: 294801, lat: 32.8185, lon: 34.9988, candleMins: null, shushanPurim: false });
});

test('S9: only Jerusalem keeps Shushan Purim; only the two cities without a GeoNames id that follow the Jerusalem custom carry 40 candle minutes', () => {
  assert.deepEqual(plain(Cities.list.filter((c) => c.shushanPurim).map((c) => c.id)), ['jlm']);
  assert.deepEqual(plain(Cities.list.filter((c) => c.candleMins).map((c) => [c.id, c.candleMins, c.geo === undefined])).sort(),
    [['beitarillit', 40, true], ['modiinillit', 40, true]]);
});
