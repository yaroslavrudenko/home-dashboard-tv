'use strict';
// Batch 10 (A): the attention sound did not play on the TV (a red screen, no sound). js/chime.js makes one ring with Web
// Audio — the recipe of tools/make-chime.mjs: three tones B5, G5, B5 at 0, 0.55 and 1.1 s, each with its octave at a
// quarter, about 2 s, the WAV's level — one AudioContext reused, every node disconnected after the ring. The bundled WAV
// plays only where Web Audio is missing or throws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeTimers } = require('./harness');

const T0 = Date.parse('2026-10-30T18:00:00Z');

// A fake Web Audio: every node, every parameter call, every connection.
function fakeAudio(opts = {}) {
  const made = { contexts: 0, nodes: [], resumed: 0 };
  function param(value) {
    const p = { value, calls: [] };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime', 'exponentialRampToValueAtTime']) p[m] = (...a) => { p.calls.push([m, ...a]); };
    return p;
  }
  function node(kind, ctx) {
    const n = { kind, to: [], connected: true, disconnects: 0,
      connect(t) { n.to.push(t); if (t === ctx.destination) ctx.rings++; },
      disconnect() { n.disconnects++; n.connected = false; } };
    made.nodes.push(n);
    return n;
  }
  function Ctx() {
    if (opts.throwOnCreate) throw new Error('no audio device');
    made.contexts++;
    this.currentTime = 10;
    this.state = opts.state || 'running';
    this.rings = 0;
    this.destination = { kind: 'destination' };
    this.resume = () => { made.resumed++; this.state = 'running'; return Promise.resolve(); };
  }
  Ctx.prototype.createGain = function () { const n = node('gain', this); n.gain = param(1); return n; };
  Ctx.prototype.createOscillator = function () {
    if (opts.throwOnOscillator) throw new Error('oscillator refused');
    const n = node('osc', this); n.frequency = param(440); n.type = 'sine';
    n.start = (t) => { n.startAt = t; }; n.stop = (t) => { n.stopAt = t; };
    return n;
  };
  return { Ctx, made };
}

function make(audioOpts, withCtx = true) {
  const ctx = load(['js/chime.js']);
  const clock = fakeTimers(T0);
  const fa = fakeAudio(audioOpts);
  const wav = { made: 0, plays: 0, currentTime: 5 };
  const logs = [];
  const chime = ctx.Chime.create({ AudioContext: withCtx ? fa.Ctx : undefined, setTimeout: clock.setTimeout, log: (m) => logs.push(m),
    makeAudio: () => { wav.made++; return { set currentTime(v) { wav.currentTime = v; }, get currentTime() { return wav.currentTime; }, play: () => { wav.plays++; } }; } });
  return { chime, clock, fa, wav, logs };
}

test('A: one ring = the make-chime recipe on Web Audio: three tones (B5, G5, B5) at 0, 0.55, 1.1 s, each with its octave at a quarter, to 2 s, into one gain at the WAV level', () => {
  const { chime, fa, wav } = make();
  chime.play();
  const oscs = fa.made.nodes.filter((n) => n.kind === 'osc');
  const t0 = 10.05;
  assert.deepEqual(oscs.map((o) => [+(o.startAt - t0).toFixed(3), o.frequency.value, +(o.stopAt - t0).toFixed(3)]),
    [[0, 987.77, 2], [0, 1975.54, 2], [0.55, 783.99, 2], [0.55, 1567.98, 2], [1.1, 987.77, 2], [1.1, 1975.54, 2]]);
  const master = fa.made.nodes.find((n) => n.kind === 'gain' && n.to.some((t) => t.kind === 'destination'));
  assert.ok(master, 'one gain reaches the speakers');
  assert.deepEqual(master.gain.calls.map((c) => [c[0], c[1], +(c[2] - t0).toFixed(3)]),
    [['setValueAtTime', 0.48, 0], ['setValueAtTime', 0.48, 1.95], ['linearRampToValueAtTime', 0, 2]], 'the WAV level, faded in the last 50 ms');
  const envs = fa.made.nodes.filter((n) => n.kind === 'gain' && n.gain.calls.length === 3 && n !== master);
  assert.equal(envs.length, 3, 'one envelope per tone');
  for (const e of envs) assert.deepEqual(e.gain.calls.map((c) => c[0]), ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime']);
  assert.ok(Math.abs(envs[0].gain.calls[2][3] - 1 / 3.2) < 1e-9, 'the bell fall: exp(−3.2 t)');
  assert.equal(wav.made, 0, 'the WAV is not touched');
});

test('A: one AudioContext for every ring, and every ring\'s nodes are disconnected after it — five rings leave nothing connected', () => {
  const { chime, fa, clock } = make();
  for (let i = 0; i < 5; i++) { chime.play(); clock.advance(30000); }
  assert.equal(fa.made.contexts, 1, 'made once, reused');
  assert.equal(fa.made.nodes.length, 5 * (1 + 3 * 5), 'per ring: the master gain, and per tone an envelope and two partials (oscillator + gain)');
  assert.deepEqual(fa.made.nodes.filter((n) => n.connected), [], 'nothing left connected');
});

test('A: a suspended context is resumed before the ring', () => {
  const { chime, fa } = make({ state: 'suspended' });
  chime.play();
  assert.equal(fa.made.resumed, 1);
  assert.equal(fa.made.nodes.filter((n) => n.kind === 'osc').length, 6);
});

test('A: no Web Audio on the TV: the bundled WAV plays from the start, rewound each time', () => {
  const { chime, wav } = make({}, false);
  chime.play();
  wav.currentTime = 1.7;
  chime.play();
  assert.deepEqual([wav.made, wav.plays, wav.currentTime], [1, 2, 0]);
});

test('A: Web Audio throws (the context cannot be made, or a node is refused): the WAV plays, logged, and Web Audio is not tried again', () => {
  const a = make({ throwOnCreate: true });
  a.chime.play();
  a.chime.play();
  assert.deepEqual([a.wav.plays, a.fa.made.contexts], [2, 0]);
  assert.match(a.logs[0], /Web Audio/);
  const b = make({ throwOnOscillator: true });
  b.chime.play();
  b.chime.play();
  assert.equal(b.wav.plays, 2);
  assert.deepEqual(b.fa.made.nodes.filter((n) => n.connected && n.to.length), [], 'the half-built ring is disconnected');
  assert.equal(b.logs.length, 1, 'tried once, then the WAV');
});

test('A: the WAV refused (a rejected play or a throw) is logged, never thrown', async () => {
  const ctx = load(['js/chime.js']);
  const logs = [];
  const rejecting = ctx.Chime.create({ setTimeout: () => 0, log: (m) => logs.push(m), makeAudio: () => ({ play: () => Promise.reject(new Error('NotAllowedError')) }) });
  const throwing = ctx.Chime.create({ setTimeout: () => 0, log: (m) => logs.push(m), makeAudio: () => ({ play: () => { throw new Error('no device'); } }) });
  rejecting.play();
  throwing.play();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(logs.sort(), ['alert sound (audio): NotAllowedError', 'alert sound (audio): no device']);
});
