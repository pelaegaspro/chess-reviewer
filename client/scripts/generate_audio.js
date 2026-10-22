import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, '..', 'public', 'audio', 'chess');
fs.mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;

function createWavBuffer(samples) {
  const byteLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + byteLength);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(1, 22); // num channels (1 = mono)
  buffer.writeUInt32LE(SAMPLE_RATE, 24); // sample rate
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (sample rate * num channels * bits per sample / 8)
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(byteLength, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(intSample), 44 + i * 2);
  }

  return buffer;
}

// Synthesize generators
function synthesizeMove() {
  const dur = 0.08;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 50);
    const wave = Math.sin(2 * Math.PI * 320 * t) * 0.7 + Math.sin(2 * Math.PI * 160 * t) * 0.3;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 160) * 0.4;
    samples[i] = (wave + noise) * env;
  }
  return samples;
}

function synthesizeCapture() {
  const dur = 0.1;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 45);
    const wave = Math.sin(2 * Math.PI * 280 * t) * 0.6;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 110) * 0.7;
    let tap2 = 0;
    if (t > 0.02) {
      const t2 = t - 0.02;
      tap2 = Math.sin(2 * Math.PI * 360 * t2) * Math.exp(-t2 * 50) * 0.5;
    }
    samples[i] = (wave + noise + tap2) * env;
  }
  return samples;
}

function synthesizeCastle() {
  const dur = 0.16;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const tap1 = (Math.sin(2 * Math.PI * 320 * t) + (Math.random() * 2 - 1) * 0.2) * Math.exp(-t * 45);
    let tap2 = 0;
    if (t > 0.065) {
      const t2 = t - 0.065;
      tap2 = (Math.sin(2 * Math.PI * 380 * t2) + (Math.random() * 2 - 1) * 0.2) * Math.exp(-t2 * 45) * 0.85;
    }
    samples[i] = tap1 + tap2;
  }
  return samples;
}

function synthesizeCheck() {
  const dur = 0.25;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 14);
    samples[i] = (Math.sin(2 * Math.PI * 1318.5 * t) + Math.sin(2 * Math.PI * 1975.5 * t)) * 0.4 * env;
  }
  return samples;
}

function synthesizeCheckmate() {
  const dur = 0.8;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [440, 554.37, 659.25, 880];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 4);
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    samples[i] = (s / freqs.length) * env * 0.7;
  }
  return samples;
}

function synthesizePromotion() {
  const dur = 0.3;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const step = dur / notes.length;
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const idx = Math.min(notes.length - 1, Math.floor(t / step));
    const nt = t - idx * step;
    samples[i] = Math.sin(2 * Math.PI * notes[idx] * nt) * Math.exp(-nt * 12) * 0.6;
  }
  return samples;
}

function synthesizeBrilliant() {
  const dur = 0.5;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [1046.5, 1318.5, 1567.98, 2093.0];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    freqs.forEach((f, idx) => {
      const stagger = idx * 0.04;
      if (t >= stagger) {
        const subT = t - stagger;
        s += Math.sin(2 * Math.PI * f * subT) * Math.exp(-subT * 7);
      }
    });
    samples[i] = s * 0.25;
  }
  return samples;
}

function synthesizeGreat() {
  const dur = 0.35;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [587.33, 739.99, 880];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    samples[i] = (s / freqs.length) * Math.exp(-t * 6) * 0.6;
  }
  return samples;
}

function synthesizeBest() {
  const dur = 0.15;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 1320 * t)) * 0.35 * Math.exp(-t * 18);
  }
  return samples;
}

function synthesizeExcellent() {
  const dur = 0.18;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = (Math.sin(2 * Math.PI * 987.77 * t) + Math.sin(2 * Math.PI * 1480 * t)) * 0.35 * Math.exp(-t * 16);
  }
  return samples;
}

function synthesizeInaccuracy() {
  const dur = 0.1;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = (Math.sin(2 * Math.PI * 220 * t) * 0.4 + (Math.random() * 2 - 1) * 0.3) * Math.exp(-t * 35) * 0.5;
  }
  return samples;
}

function synthesizeMistake() {
  const dur = 0.22;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const f = t < 0.11 ? 440 : 370;
    const nt = t < 0.11 ? t : t - 0.11;
    samples[i] = Math.sin(2 * Math.PI * f * nt) * Math.exp(-nt * 12) * 0.5;
  }
  return samples;
}

function synthesizeBlunder() {
  const dur = 0.35;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const f = 160 - t * 110;
    const wave = Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * (f * 1.5) * t) * 0.5;
    samples[i] = wave * Math.exp(-t * 7) * 0.6;
  }
  return samples;
}

function synthesizeMissedOpportunity() {
  const dur = 0.26;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const f = t < 0.13 ? 587 : 466;
    const nt = t < 0.13 ? t : t - 0.13;
    samples[i] = Math.sin(2 * Math.PI * f * nt) * Math.exp(-nt * 10) * 0.5;
  }
  return samples;
}

function synthesizeWin() {
  const dur = 0.75;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    samples[i] = (s / freqs.length) * Math.exp(-t * 4.5) * 0.7;
  }
  return samples;
}

function synthesizeLoss() {
  const dur = 0.7;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [329.63, 392.0, 493.88];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    samples[i] = (s / freqs.length) * Math.exp(-t * 4) * 0.6;
  }
  return samples;
}

function synthesizeDraw() {
  const dur = 0.5;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  const freqs = [440, 659.25];
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    samples[i] = (s / freqs.length) * Math.exp(-t * 5) * 0.5;
  }
  return samples;
}

function synthesizeResign() {
  const dur = 0.12;
  const count = Math.floor(SAMPLE_RATE * dur);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = (Math.sin(2 * Math.PI * 180 * t) + (Math.random() * 2 - 1) * 0.3) * Math.exp(-t * 30) * 0.6;
  }
  return samples;
}

const soundMap = {
  'move.wav': synthesizeMove(),
  'capture.wav': synthesizeCapture(),
  'castle.wav': synthesizeCastle(),
  'check.wav': synthesizeCheck(),
  'checkmate.wav': synthesizeCheckmate(),
  'promotion.wav': synthesizePromotion(),
  'best.wav': synthesizeBest(),
  'excellent.wav': synthesizeExcellent(),
  'great.wav': synthesizeGreat(),
  'brilliant.wav': synthesizeBrilliant(),
  'inaccuracy.wav': synthesizeInaccuracy(),
  'mistake.wav': synthesizeMistake(),
  'blunder.wav': synthesizeBlunder(),
  'missed-opportunity.wav': synthesizeMissedOpportunity(),
  'win.wav': synthesizeWin(),
  'loss.wav': synthesizeLoss(),
  'draw.wav': synthesizeDraw(),
  'resign.wav': synthesizeResign()
};

for (const [name, samples] of Object.entries(soundMap)) {
  const wavBuf = createWavBuffer(samples);
  const outPath = path.join(outDir, name);
  fs.writeFileSync(outPath, wavBuf);
  console.log(`Generated: ${outPath} (${wavBuf.length} bytes)`);
}

console.log('All 18 professional chess sound assets generated successfully.');

