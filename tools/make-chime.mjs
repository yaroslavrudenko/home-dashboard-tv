// Writes sounds/alert.wav, the attention sound of an alert at home: three soft bell tones (B5, G5, B5), about 2 s in
// all, mono 16-bit PCM at 22 050 Hz — the plainest WAV, which Chromium 47 on the 2017 TVs plays. No dependencies.
//   node tools/make-chime.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 22050, SECONDS = 2, PEAK = 0.6;
// [start s, frequency Hz]: each tone rings on (decaying) under the next one.
const TONES = [[0, 987.77], [0.55, 783.99], [1.1, 987.77]];
const ATTACK = 0.008, DECAY = 3.2;               // a quick start (no click), then a bell-like fall

const n = Math.round(RATE * SECONDS), samples = new Float64Array(n);
for (const [start, f] of TONES) {
  for (let i = Math.round(start * RATE); i < n; i++) {
    const t = i / RATE - start;
    const env = Math.min(1, t / ATTACK) * Math.exp(-DECAY * t);
    // the fundamental with a little of its octave for a clearer bell
    samples[i] += env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
  }
}
// fade the last 50 ms to silence, then scale to PEAK
const fade = Math.round(0.05 * RATE);
for (let i = n - fade; i < n; i++) samples[i] *= (n - i) / fade;
let max = 0;
for (const v of samples) max = Math.max(max, Math.abs(v));

const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) data.writeInt16LE(Math.round((samples[i] / max) * PEAK * 32767), i * 2);
const head = Buffer.alloc(44);
head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8, 'ascii');
head.write('fmt ', 12, 'ascii'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
head.write('data', 36, 'ascii'); head.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.join(ROOT, 'sounds'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'sounds', 'alert.wav'), Buffer.concat([head, data]));
console.log('sounds/alert.wav: ' + (44 + data.length) + ' bytes, ' + SECONDS + ' s');
