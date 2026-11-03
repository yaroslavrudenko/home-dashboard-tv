'use strict';
// Batch 17 (D-A1 / L7, DESIGN-17 §7.2; FIX-17B 14): the one state component — every kind in every language, the details
// joiner, the sub rules, escaping, the part words, the card and the Mapbox invitation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const ctx = load(['js/config.js', 'js/i18n.js', 'js/html.js', 'js/icons.js']);
const VS = ctx.ViewState;
const strip = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '\n').split('\n').filter(Boolean);
const WORDS = {
  ru: { fresh: 'Обновлено в 20:32', stale: 'Не обновляется · данные от 20:32', loading: 'Загрузка…', failed: 'Временно недоступно', retry: 'Повторим в 20:33', soon: 'Повторим позже', part: 'данные от 20:32', none: 'нет данных' },
  he: { fresh: 'עודכן ב־20:32', stale: 'לא מתעדכן · נתונים מ־20:32', loading: 'טוען…', failed: 'לא זמין כרגע', retry: 'ננסה שוב ב־20:33', soon: 'ננסה שוב בקרוב', part: 'נתונים מ־20:32', none: 'אין נתונים' },
  uk: { fresh: 'Оновлено о 20:32', stale: 'Не оновлюється · дані від 20:32', loading: 'Завантаження…', failed: 'Тимчасово недоступно', retry: 'Повторимо о 20:33', soon: 'Повторимо пізніше', part: 'дані від 20:32', none: 'немає даних' },
  en: { fresh: 'Updated at 20:32', stale: 'Not updating · data from 20:32', loading: 'Loading…', failed: 'Temporarily unavailable', retry: 'Retrying at 20:33', soon: 'Will retry soon', part: 'data from 20:32', none: 'no data' }
};

for (const lang of Object.keys(WORDS)) {
  test('ViewState ' + lang + ': every kind — the header line, the block, the part word', () => {
    const w = WORDS[lang];
    ctx.I18n.setLang(lang);
    assert.equal(VS.headText('fresh', '20:32'), w.fresh);
    assert.equal(VS.headText('stale', '20:32'), w.stale);
    for (const k of ['loading', 'failed', 'none']) assert.equal(VS.headText(k, '20:32'), '', k + ': the header says nothing');
    assert.deepEqual(strip(VS.block('loading')), [w.loading], 'loading: no sub');
    assert.deepEqual(strip(VS.block('failed', { retryAt: '20:33' })), [w.failed, w.retry]);
    assert.deepEqual(strip(VS.block('failed', { retryAt: '' })), [w.failed, w.soon], 'no next attempt: «later»');
    assert.deepEqual(strip(VS.block('failed')), [w.failed, w.soon]);
    assert.equal(VS.partText('stale', '20:32'), w.part);
    assert.equal(VS.partText('none'), w.none);
    assert.equal(VS.partText('fresh', '20:32'), '');
    assert.equal(VS.partText('loading'), '');
  });
}

test('ViewState: details joined by « · »; no time, no sentence (FIX-17B 3); the one joiner', () => {
  ctx.I18n.setLang('ru');
  assert.equal(VS.headText('fresh', '20:32', ['MET Norway', '12 мин назад']), 'Обновлено в 20:32 · MET Norway · 12 мин назад');
  assert.equal(VS.headText('fresh', '20:32', []), 'Обновлено в 20:32');
  assert.equal(VS.headText('fresh', ''), '', 'FIX-17B 3: «Обновлено в » with no time is never said');
  assert.equal(VS.headText('stale', '', ['MET Norway']), '');
  assert.equal(VS.join(['a', 'b', 'c']), 'a · b · c');
});

test('ViewState: the block — a text override has no sub; sub \'\' means none, undefined the default; glyph first; kind in the class', () => {
  ctx.I18n.setLang('ru');
  assert.equal(VS.block('failed', { text: 'Лимит исчерпан · после 02:15' }),
    '<div class="state is-failed"><div class="state-text">Лимит исчерпан · после 02:15</div></div>', 'its own text says when: no retry line');
  assert.equal(VS.block('failed', { retryAt: '20:33', sub: '' }), '<div class="state is-failed"><div class="state-text">Временно недоступно</div></div>');
  assert.match(VS.block('failed', { retryAt: '20:33', sub: undefined }), /state-sub">Повторим в 20:33</);
  assert.equal(VS.block('none', { text: 'T', sub: 'S', glyph: '<svg class="g"></svg>' }),
    '<div class="state is-none"><svg class="g"></svg><div class="state-text">T</div><div class="state-sub">S</div></div>');
});

test('ViewState: text from outside is escaped, never markup', () => {
  const html = VS.block('none', { text: '<img src=x onerror=1>', sub: '"&\'' });
  assert.ok(!/<img/.test(html));
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.match(html, /&quot;&amp;&#39;/);
});

test('ViewState: one card holds the block; the one Mapbox invitation (FIX-17B 11)', () => {
  ctx.I18n.setLang('ru');
  assert.equal(VS.card('loading'), '<div class="card state-card"><div class="state is-loading"><div class="state-text">Загрузка…</div></div></div>');
  const inv = VS.noKeyCard();
  assert.match(inv, /^<div class="card state-card"><div class="state is-none"><svg class="icon g-car"/);
  assert.deepEqual(strip(inv), ['Подключите токен Mapbox, чтобы видеть пробки', 'MAPBOX_TOKEN в build.local.env, затем пересоберите приложение']);
});
