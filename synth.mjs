// Procedural soundtrack for ETHLABS (15 s, 128 BPM, D minor; resolves to D major when the dot lands on the logo).
// The line on screen is a string, so every landing is a Karplus-Strong pluck here. Event times come from the page itself
// (out/sync.json, exported by render-all.sh): 512 raindrops, 18 letters and 103 network nodes land frame-true.
// Writes out/audio.wav (float32 stereo, 48 kHz).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SY = JSON.parse(fs.readFileSync(path.join(DIR, 'out/sync.json'), 'utf8'));
const { B, T } = SY;
const SR = 48000, DUR = 15, NS = SR * DUR, TAU = Math.PI * 2;

let seed = 20260927;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const panX = (x) => clamp((x - 960) / 960, -1, 1) * 0.8; // screen x → stereo

// ------------------------------------------------------------------ buses
const bus = () => [new Float32Array(NS), new Float32Array(NS)];
const DRUM = bus(), MUS = bus(), FX = bus(), REV = bus(), DLY = bus(), KICKS = [];
const BUS = { DRUM, MUS, FX };
function place(sig, t0, { gain = 1, pan = 0, rev = 0, dly = 0, to = 'FX' } = {}) {
  const s0 = Math.round(t0 * SR), a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4, O = BUS[to];
  const gl = gain * Math.cos(a) * Math.SQRT2, gr = gain * Math.sin(a) * Math.SQRT2;
  for (let i = 0; i < sig.length; i++) {
    const k = s0 + i; if (k < 0 || k >= NS) continue;
    const l = sig[i] * gl, r = sig[i] * gr;
    O[0][k] += l; O[1][k] += r;
    if (rev) { REV[0][k] += l * rev; REV[1][k] += r * rev; }
    if (dly) { DLY[0][k] += l * dly; DLY[1][k] += r * dly; }
  }
}

// ------------------------------------------------------------------ dsp
function biquad() {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(type, f, q = 0.707) {
      const w = (TAU * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
      if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
      else { b0 = al; b1 = 0; b2 = -al; }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0;
      return this;
    },
    run(x) { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; },
  };
}
const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
function saw() { let ph = rnd(); return (f) => { const dt = f / SR; ph += dt; if (ph >= 1) ph -= 1; return 2 * ph - 1 - blep(ph, dt); }; }
function norm(o, peak = 1) { let m = 0; for (const v of o) m = Math.max(m, Math.abs(v)); if (m) for (let i = 0; i < o.length; i++) o[i] *= peak / m; return o; }

// ------------------------------------------------------------------ voices
// Karplus-Strong string: noise burst into a tuned, damped delay loop (fractional allpass tuning)
function ks(f, dur = 2, bright = 0.5, fb = 0.996) {
  const o = buf(dur), P = SR / f - 0.5, N = Math.floor(P), fr = P - N, C = (1 - fr) / (1 + fr);
  const y = new Float32Array(o.length + N + 2), hp = biquad().set('hp', 30);
  let ax = 0, ay = 0, lp = 0;
  for (let i = 0; i < o.length; i++) {
    let x = 0; if (i < N) { lp += (noise() - lp) * bright; x = lp; }
    const k = i + N + 2, avg = 0.5 * (y[k - N] + y[k - N - 1]), ap = C * avg + ax - C * ay; ax = avg; ay = ap;
    y[k] = x + fb * ap;
    o[i] = hp.run(y[k]) * Math.min(1, (dur - i / SR) / 0.05);
  }
  return norm(o);
}
function kick(vel = 1) {
  const o = buf(0.55); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, f = 46 + 120 * Math.exp(-t * 30) + 70 * Math.exp(-t * 420);
    ph += (TAU * f) / SR;
    o[i] = (Math.tanh(1.8 * Math.sin(ph)) * Math.exp(-t * 7) + noise() * 0.15 * Math.exp(-t * 500)) * vel;
  }
  return o;
}
function clap(vel = 1) {
  const o = buf(0.35), bp = biquad().set('bp', 1400, 0.8), hp = biquad().set('hp', 650);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, e = t < 0.03 ? 1 - (t % 0.01) / 0.01 : Math.exp(-(t - 0.03) * 16);
    o[i] = hp.run(bp.run(noise())) * e * 2.2 * vel;
  }
  return o;
}
function hat(open = false, vel = 1) {
  const o = buf(open ? 0.35 : 0.06), h1 = biquad().set('hp', 7200), h2 = biquad().set('hp', 9800);
  for (let i = 0; i < o.length; i++) o[i] = h2.run(h1.run(noise())) * Math.exp(-(i / SR) * (open ? 9 : 75)) * vel;
  return o;
}
function boom(size = 1) {
  const o = buf(3.5), lp = biquad().set('lp', 2200); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, f = 30 + 80 * Math.exp(-t * 3.2);
    ph += (TAU * f) / SR;
    o[i] = Math.tanh(1.7 * Math.sin(ph) * Math.exp(-t / (0.8 * size)) + 0.9 * lp.run(noise()) * Math.exp(-t * 24));
  }
  return o;
}
function crash(dur = 2.2) {
  const o = buf(dur), hp = biquad().set('hp', 3800), lp = biquad().set('lp', 12500);
  for (let i = 0; i < o.length; i++) o[i] = lp.run(hp.run(noise())) * Math.exp(-(i / SR) * (6.9 / dur));
  return o;
}
function bell(f, dur = 2, bright = 1, ratio = 3.5) { // FM glass
  const o = buf(dur); let pc = 0, pm = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, idx = bright * 2.2 * Math.exp(-t * 4);
    pm += (TAU * f * ratio) / SR; pc += (TAU * f) / SR;
    o[i] = Math.sin(pc + idx * Math.sin(pm)) * Math.min(1, t / 0.002) * Math.exp(-t * (6.9 / dur));
  }
  return o;
}
function pluck(f, dur = 0.4, cut = 2600, q = 1.2) {
  const o = buf(dur), s1 = saw(), s2 = saw(), lp = biquad();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    if (i % 16 === 0) lp.set('lp', 180 + cut * Math.exp(-t * 16), q);
    o[i] = lp.run(0.5 * s1(f) + 0.5 * s2(f * 1.007)) * Math.exp(-t * (6.9 / dur)) * Math.min(1, t / 0.002);
  }
  return o;
}
function bassNote(f, dur, cut = 900, q = 2.5, sub = 0.7, att = 0.004) {
  const o = buf(dur + 0.03), s = saw(), lp = biquad(); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    if (i % 16 === 0) lp.set('lp', 90 + cut * Math.exp(-t * 10), q);
    ph += (TAU * f) / SR;
    const env = Math.min(1, t / att) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.03));
    o[i] = (lp.run(s(f)) * 0.6 + Math.sin(ph) * sub) * env;
  }
  return o;
}
function pad(notes, dur, att = 0.5, rel = 0.8, cut = 1600) {
  const o = buf(dur + rel), lp = biquad(), lp2 = biquad();
  const osc = notes.flatMap((m) => [0.994, 1, 1.007].map((d) => [saw(), mtof(m) * d]));
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    if (i % 32 === 0) { const c = cut * (0.8 + 0.2 * Math.sin(t * 1.7)); lp.set('lp', c, 0.7); lp2.set('lp', c, 0.7); }
    let v = 0; for (const [s, f] of osc) v += s(f);
    const env = Math.min(1, t / att) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel));
    o[i] = lp2.run(lp.run(v / Math.sqrt(osc.length))) * env;
  }
  return o;
}
function riser(dur, f0 = 300, f1 = 9000, q = 2.4, tone = 0.25) {
  const o = buf(dur), bp = biquad(); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, u = t / dur;
    if (i % 16 === 0) bp.set('bp', f0 * (f1 / f0) ** (u * u), q);
    ph += (TAU * (70 + 1000 * u * u * u)) / SR;
    o[i] = (bp.run(noise()) * 1.3 + Math.sin(ph) * tone * u) * u * u;
  }
  return o;
}
function whoosh(dur, f0, f1, q = 1.5) {
  const o = buf(dur), bp = biquad();
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length;
    if (i % 16 === 0) bp.set('bp', f0 * (f1 / f0) ** u, q);
    o[i] = bp.run(noise()) * Math.sin(Math.PI * u) ** 1.5 * 1.6;
  }
  return o;
}
function glide(dur, f0, f1, decay = 2, shape = (u) => u) {
  const o = buf(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; ph += (TAU * f0 * (f1 / f0) ** shape(t / dur)) / SR;
    o[i] = Math.sin(ph) * Math.exp(-t * decay) * Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.02);
  }
  return o;
}
function tick(f = 3000, len = 0.03) {
  const o = buf(len), bp = biquad().set('bp', f, 3);
  for (let i = 0; i < o.length; i++) o[i] = bp.run(noise()) * Math.exp(-(i / SR) * 260) * 3;
  return o;
}
function blip(f, dur = 0.1) {
  const o = buf(dur); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; ph += (TAU * f) / SR;
    o[i] = (Math.sin(ph) + 0.25 * Math.sin(3 * ph)) * Math.exp(-t * 38) * Math.min(1, t / 0.001);
  }
  return o;
}
function chatter(dur) { // scramble-decode chirps
  const o = buf(dur), lp = biquad().set('lp', 5200); let ph = 0, f = 2000;
  const step = Math.round(SR * 0.026);
  for (let i = 0; i < o.length; i++) {
    if (i % step === 0) f = 1300 + rnd() * 3200;
    ph += (TAU * f) / SR;
    o[i] = lp.run(Math.sign(Math.sin(ph)) * 0.5 * (i % step < SR * 0.014 ? 1 : 0));
  }
  return o;
}
function knock(f = 170) { // a weight landing on a wooden beam
  const o = buf(0.3), bp = biquad().set('bp', 900, 1.2); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; ph += (TAU * f * (1 + 1.2 * Math.exp(-t * 70))) / SR;
    o[i] = Math.sin(ph) * Math.exp(-t * 26) + bp.run(noise()) * 1.2 * Math.exp(-t * 180);
  }
  return o;
}
function whirr(dur, rate0) { // the diamond's spin: 4 faces per turn, decelerating
  const o = buf(dur), bp = biquad().set('bp', 1800, 0.9); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length; ph += (TAU * rate0 * (1 - u) ** 2) / SR;
    o[i] = bp.run(noise()) * (0.55 + 0.45 * Math.sin(ph)) * Math.min(1, u * 12) * (1 - u) ** 0.6 * 1.7;
  }
  return o;
}
function bend(dur, m0, m1, shape) { // a sustained string bent up in pitch as the line bends into a ring
  const o = buf(dur), s1 = saw(), s2 = saw(), lp = biquad();
  for (let i = 0; i < o.length; i++) {
    const u = i / o.length, f = mtof(lerp(m0, m1, shape(u)));
    if (i % 16 === 0) lp.set('lp', 700 + 2600 * shape(u), 1.4);
    o[i] = lp.run(0.5 * s1(f) + 0.5 * s2(f * 1.004)) * Math.min(1, u * 20) * Math.min(1, (1 - u) * 6);
  }
  return o;
}
const rev = (o) => Float32Array.from(o).reverse();
function suck(dur) { const o = whoosh(dur, 6000, 300, 1.2); for (let i = 0; i < o.length; i++) o[i] *= (i / o.length) ** 1.5; return o; }

// ------------------------------------------------------------------ helpers
const range = (a, b, step) => { const r = []; for (let t = a; t < b - 1e-6; t += step) r.push(+t.toFixed(5)); return r; };
const K = (t, vel = 1, g = 0.62) => { KICKS.push(t); place(kick(vel), t, { gain: g, to: 'DRUM' }); };
const CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [48, 53, 57], C: [48, 52, 55], Gm: [43, 46, 50], A: [45, 49, 52], D: [50, 54, 57] };
const ROOT = { Dm: 38, Bb: 34, F: 41, C: 36, Gm: 31, A: 33, D: 38 };
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91, 93, 96]; // D minor pentatonic from D4
function bass(t0, t1, ch, { gain = 0.3, cut = 850 } = {}) { // house offbeats + a sub on the one
  place(bassNote(mtof(ROOT[ch]), B * 0.3, 300, 1, 0.9), t0, { gain: gain * 0.8, to: 'MUS' });
  range(t0 + B / 2, t1, B).forEach((t, k) => place(bassNote(mtof(ROOT[ch] + (k % 2 ? 12 : 0)), B * 0.38, cut, 3), t, { gain, to: 'MUS' }));
}
function stab(t, ch, g = 0.07, oct = 12) { CH[ch].concat(CH[ch][0] + 12).forEach((m, j) => place(pluck(mtof(m + oct), 0.5, 3800, 0.9), t + j * 0.004, { gain: g, pan: (j - 1.5) * 0.3, rev: 0.3, dly: 0.2, to: 'MUS' })); }
const padAt = (t, dur, ch, g = 0.05, o = {}) => place(pad(CH[ch].map((m) => m - 12).concat(CH[ch]), dur, o.att ?? 0.25, o.rel ?? 0.5, o.cut ?? 1500), t, { gain: g, rev: 0.35, to: 'MUS' });
function groove(t0, t1, { claps = true, h16 = true, open = true, vel = 1 } = {}) {
  range(t0, t1, B).forEach((t) => K(t, vel));
  if (claps) range(t0 + B, t1, 2 * B).forEach((t) => place(clap(), t, { gain: 0.26, rev: 0.18, to: 'DRUM' }));
  range(t0, t1, h16 ? B / 4 : B / 2).forEach((t, k) => place(hat(false, k % 2 ? 0.5 : 0.9), t + (h16 ? 0 : B / 2), { gain: 0.07, pan: 0.25, to: 'DRUM' }));
  if (open) range(t0 + B / 2, t1, B).forEach((t) => place(hat(true, 0.55), t, { gain: 0.045, pan: -0.2, to: 'DRUM' }));
}
const hit = (t, size = 1, g = 0.8) => { place(boom(size), t, { gain: g, rev: 0.05, to: 'DRUM' }); place(crash(1.8 + size), t, { gain: 0.11, rev: 0.3 }); };
const slot = (t) => [0, 0.03, 0.06].forEach((d, i) => place(tick(4200 - 700 * i, 0.02), t + d, { gain: 0.07, pan: -0.55, rev: 0.05 })); // caption word rolls

// ================================================================== bar 1: point → line → the drop (0 – 1.875)
place(pad([38, 45, 50, 52, 57], 1.95, 1.0, 0.2, 800), 0, { gain: 0.1, rev: 0.4, to: 'MUS' });
place(glide(0.35, 70, 45, 9), T.pop, { gain: 0.3 }); // the point: a soft sub thump
place(blip(1175, 0.14), T.pop, { gain: 0.15, rev: 0.35, dly: 0.2 }); place(tick(5200, 0.02), T.pop, { gain: 0.08 });
place(whoosh(0.6, 400, 5000, 1.4), T.line - 0.02, { gain: 0.12, pan: -0.6, rev: 0.2 });
place(whoosh(0.6, 420, 5200, 1.4), T.line - 0.02, { gain: 0.12, pan: 0.6, rev: 0.2 });
place(glide(0.7, 147, 294, 1.5, (u) => 1 - (1 - u) ** 4), T.line, { gain: 0.07, rev: 0.3 });
for (let x = 120, i = 0; x <= 1800; x += 40, i++) { // ruler ticks, spreading outward in stereo
  const d = Math.abs(x - 960) / 860, tt = T.line + 0.55 * (1 - (1 - Math.min(d, 0.999)) ** 0.25);
  place(tick(i % 5 === 3 ? 2600 : 5200, 0.02), tt, { gain: i % 5 === 3 ? 0.11 : 0.06, pan: panX(x) });
}
place(rev(ks(mtof(62), 0.47, 0.6, 0.997)), T.hit - 0.47, { gain: 0.2, rev: 0.3 }); // the fall: the pluck, backwards
place(glide(0.46, 1400, 380, 0.5, (u) => u * u), T.fall, { gain: 0.025, rev: 0.2 });
// the first landing: the string, low D
place(ks(mtof(38), 3.4, 0.55, 0.9985), T.hit, { gain: 0.42, rev: 0.25 });
place(ks(mtof(50), 2.2, 0.7, 0.997), T.hit, { gain: 0.16, pan: 0.15, rev: 0.35, dly: 0.2 });
place(boom(0.5), T.hit, { gain: 0.34, to: 'DRUM' }); place(tick(1800, 0.03), T.hit, { gain: 0.1 });
place(blip(2349, 0.07), T.hit + 0.05, { gain: 0.04, pan: 0.3, rev: 0.3 }); place(chatter(0.14), T.hit + 0.05, { gain: 0.018, pan: 0.3 }); // SETTLED

// ================================================================== bars 2–3: we believe … (1.875 – 5.625)
const beliefs = [[T.b1, 'Dm'], [T.b2, 'Bb'], [T.b3, 'F'], [T.b4, 'C']];
beliefs.forEach(([t, ch], i) => {
  slot(t); stab(t, ch, 0.05); padAt(t, 2 * B, ch, 0.04);
  bass(t, t + 2 * B, ch, { cut: 650 + 150 * i });
});
range(T.b1, T.b4 + B * 1.5, B).forEach((t) => K(t, 0.95));
range(T.b1, T.b4 + B * 1.5, B / 2).forEach((t, k) => place(hat(false, k % 2 ? 0.9 : 0.35), t, { gain: 0.07, pan: 0.25, to: 'DRUM' }));
range(T.b3, T.b4 + B * 1.5, B).forEach((t) => place(hat(true, 0.5), t + B / 2, { gain: 0.04, pan: -0.2, to: 'DRUM' }));
// credible neutrality: fulcrum drawn, two weights, level
place(whoosh(0.3, 1500, 5000, 2.5), T.b1 + 0.02, { gain: 0.05, pan: 0.1 });
SY.TW.forEach((t, i) => { place(knock(i ? 190 : 160), t, { gain: 0.3, pan: i ? 0.45 : -0.45, rev: 0.15 }); place(whoosh(0.18, 3000, 900, 1.4), t - 0.16, { gain: 0.04, pan: i ? 0.45 : -0.45 }); });
place(bell(mtof(81), 1.4, 0.4), SY.TW[1] + 0.3, { gain: 0.05, rev: 0.4, dly: 0.2 }); // level
// ETH: weights flung, fulcrum flips, spin, the logo stamps in on the beat
place(whoosh(0.35, 800, 6000, 1.2), T.b2, { gain: 0.06, pan: -0.6 }); place(whoosh(0.35, 850, 6200, 1.2), T.b2, { gain: 0.06, pan: 0.6 });
place(whoosh(0.25, 3000, 700, 1.3), T.b2 + 0.02, { gain: 0.05 });
place(whirr(0.3, 48), SY.T3D, { gain: 0.1, rev: 0.15 });
place(rev(bell(mtof(74), 0.28, 0.5)), T.b2 + B - 0.28, { gain: 0.05, rev: 0.2 });
const FILL = T.b2 + B;
place(kick(0.9), FILL, { gain: 0.28, to: 'DRUM' }); place(tick(1500, 0.03), FILL, { gain: 0.12 });
[58, 62, 65, 70].forEach((m, j) => place(bell(mtof(m + 12), 1.8, 0.7, 2), FILL + j * 0.006, { gain: 0.05, pan: (j - 1.5) * 0.25, rev: 0.45 }));
// DeFi: the chart swings into place, curves draw, a swap slides down x·y = k
place(whoosh(0.45, 500, 4000, 1.2), T.b3, { gain: 0.07, rev: 0.2 });
[0, 1, 2, 3].forEach((i) => place(glide(0.3, mtof(72 + 3 * i), mtof(79 + 3 * i), 3), T.b3 + 0.06 + 0.04 * i, { gain: 0.025, pan: -0.3 + 0.2 * i, rev: 0.3 }));
place(pluck(mtof(81), 0.3, 3000), T.b3 + 0.46, { gain: 0.05, rev: 0.3, dly: 0.25, to: 'MUS' });
place(glide(0.36, mtof(81), mtof(74), 2.5, (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)), T.b3 + 0.46, { gain: 0.04, pan: 0.2, rev: 0.3 });
place(blip(1760, 0.06), T.b3 + 0.34, { gain: 0.035, pan: 0.3 });
// adoption: every doubling climbs an arpeggio; a roll and a riser pull into the drop
place(suck(0.2), T.b4 - 0.08, { gain: 0.06 });
const ARP = [60, 64, 67, 72, 76, 79, 84, 88, 91];
SY.SPLIT.forEach((t, i) => {
  place(pluck(mtof(ARP[i]), 0.25, 2400 + 400 * i, 1.1), t, { gain: 0.05 + 0.004 * i, pan: i % 2 ? 0.4 : -0.4, rev: 0.25, dly: 0.2, to: 'MUS' });
  place(tick(2500 + 500 * i, 0.02), t, { gain: 0.05, pan: i % 2 ? 0.4 : -0.4 });
});
range(T.b4 + B, SY.SPLIT[8], B / 4).concat(range(SY.SPLIT[8], T.drop - 0.09, B / 8)).forEach((t, k) => place(clap(0.3 + k * 0.05), t, { gain: 0.12, rev: 0.12, to: 'DRUM' }));
place(riser(T.drop - 0.07 - T.b4, 250, 11000, 2.2, 0.35), T.b4, { gain: 0.3, rev: 0.2 });
place(glide(T.drop - T.b4 - 0.07, mtof(36), mtof(48), 0.2, (u) => u * u), T.b4, { gain: 0.06 });

// ================================================================== bar 4: the drop — the settlement layer (5.625 – 7.5)
hit(T.drop, 1.1, 0.85);
[38, 50, 53, 57, 62].forEach((m, j) => place(ks(mtof(m), 2.4, 0.6, 0.998), T.drop + j * 0.01, { gain: j ? 0.07 : 0.2, pan: (j - 2) * 0.25, rev: 0.3 }));
padAt(T.drop, 2 * B, 'Dm', 0.06, { att: 0.02 }); padAt(T.drop + 2 * B, 2 * B, 'Bb', 0.055);
groove(T.drop, T.bend + 4 * B - 0.3);
bass(T.drop, T.drop + 2 * B, 'Dm'); bass(T.drop + 2 * B, T.bend, 'Bb');
for (const [t, x] of SY.drops) place(tick(2500 + 5000 * rnd(), 0.018), t, { gain: 0.013, pan: panX(x), rev: 0.05 }); // 512 drops of rain
place(ks(mtof(81), 1.2, 0.8, 0.996), SY.period, { gain: 0.11, pan: 0.6, rev: 0.3, dly: 0.25 }); // the red full stop
place(chatter(0.45), T.drop + 0.25, { gain: 0.014, pan: -0.4 });
// the letters play the string as they land (D minor pentatonic: up for "The settlement", home for "layer")
const RUN = [0, 2, 4, 1, 3, 5, 7, 6, 8, 10, 9, 11, 12, 10, 8, 7, 5, 5];
SY.letters.forEach(([t, x], i) => {
  const m = PENTA[RUN[i]];
  place(ks(mtof(m), 0.9, 0.65, 0.994), t, { gain: 0.085, pan: panX(x), rev: 0.22, dly: 0.12 });
  place(tick(1200, 0.02), t, { gain: 0.04, pan: panX(x) });
});
place(whoosh(0.5, 2500, 600, 1.2), 6.95, { gain: 0.06, rev: 0.2 }); // camera pulls back

// ================================================================== bar 5: ring → globe → dive (7.5 – 9.375)
place(bend(0.66, 62, 69, (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)), T.bend, { gain: 0.07, rev: 0.35, to: 'MUS' });
padAt(T.bend, 2 * B, 'F', 0.055); padAt(T.bend + 2 * B, 2 * B - 0.3, 'C', 0.05);
bass(T.bend, T.bend + 2 * B, 'F'); bass(T.bend + 2 * B, T.dive, 'C');
place(bell(mtof(81), 1.6, 0.6, 2), T.bend + 0.62, { gain: 0.07, rev: 0.45, dly: 0.2 }); stab(T.bend + 0.62, 'F', 0.045); // the ring closes
place(chatter(0.4), T.bend + 0.25, { gain: 0.012, pan: 0.4 });
place(whoosh(0.7, 300, 3200, 1.1), T.bend + 0.5, { gain: 0.07, pan: -0.3, rev: 0.25 }); // meridians sweep in
SY.globe.filter((_, i) => i % 3 === 0).forEach((t, i) => place(bell(mtof(PENTA[5 + (i * 3) % 9]), 0.5, 0.4), t, { gain: 0.018, pan: Math.sin(i * 2.3) * 0.7, rev: 0.4 }));
SY.arcs.forEach((t, i) => place(glide(0.3, mtof(69 + 2 * i), mtof(81 + 2 * i), 5), t, { gain: 0.022, pan: -0.5 + 0.14 * i, rev: 0.35, dly: 0.15 }));
// the dive into the red node
const DIVE = T.dive;
place(riser(T.net - DIVE, 400, 14000, 2.6, 0.5), DIVE, { gain: 0.34, rev: 0.1 });
place(rev(crash(0.6)), T.net - 0.6, { gain: 0.12 });
range(DIVE, T.net - 0.02, B / 8).forEach((t, k) => place(clap(0.4 + 0.08 * k), t, { gain: 0.1, to: 'DRUM' }));
place(suck(0.33), DIVE, { gain: 0.09 });

// ================================================================== bar 6: full red — one node in a much larger network (9.375 – 11.25)
hit(T.net, 1.5, 0.95);
[38, 50, 57, 62, 65, 69, 74].forEach((m, j) => place(bell(mtof(m + 12), 2.4, 0.9, 2), T.net + j * 0.008, { gain: 0.04, pan: (j - 3) * 0.2, rev: 0.5 }));
place(pad([38, 45, 50, 53, 57, 62], 2 * B, 0.01, 0.4, 2600), T.net, { gain: 0.09, rev: 0.4, to: 'MUS' });
place(ks(mtof(38), 2.2, 0.5, 0.998), T.net, { gain: 0.25, rev: 0.25 });
place(whoosh(0.6, 5000, 300, 1.1), T.net + 0.03, { gain: 0.1, rev: 0.25 }); // pulling out of the node
groove(T.net + B, T.home - 0.2, { claps: true, open: false });
bass(T.net, T.net + 2 * B, 'Dm'); bass(T.net + 2 * B, T.home, 'Bb');
padAt(T.net + 2 * B, 2 * B, 'Bb', 0.05);
for (const [t, x] of SY.net) place(blip(mtof(PENTA[3 + Math.floor(rnd() * 9)]), 0.07), t, { gain: 0.013, pan: clamp(x / 1780, -1, 1) * 0.8, rev: 0.25 });
place(chatter(0.6), 10.0, { gain: 0.012, pan: 0.3 });
place(pluck(mtof(74), 0.4, 3000), 9.52, { gain: 0.04, rev: 0.3, dly: 0.25, to: 'MUS' }); // "One node"
place(pluck(mtof(77), 0.4, 3000), 10.22, { gain: 0.035, rev: 0.3, dly: 0.25, to: 'MUS' });

// ================================================================== bar 7: into the contributors circle; ethlabs.org rebuilds (11.25 – 13.125)
place(whoosh(1.0, 4000, 250, 1.0), 10.95, { gain: 0.1, rev: 0.25 });
padAt(T.home, 2 * B, 'Gm', 0.05); padAt(T.home + 2 * B, 2 * B - 0.1, 'A', 0.055, { cut: 2200 });
bass(T.home, T.home + 2 * B, 'Gm'); bass(T.home + 2 * B, T.land - 0.1, 'A');
range(T.home, T.land - 0.1, B).forEach((t) => K(t, 0.9));
range(T.home + B, T.lock, 2 * B).forEach((t) => place(clap(), t, { gain: 0.24, rev: 0.18, to: 'DRUM' }));
range(T.home + B / 2, T.land - 0.1, B).forEach((t) => place(hat(true, 0.55), t, { gain: 0.045, pan: -0.2, to: 'DRUM' }));
range(T.home, T.land - 0.1, B / 4).forEach((t, k) => place(hat(false, 0.35 + 0.02 * k), t, { gain: 0.06, pan: 0.25, to: 'DRUM' }));
place(glide(0.55, 600, 2400, 1, (u) => u), 11.3, { gain: 0.02, pan: -0.4 }); // the rule draws
place(whoosh(0.8, 700, 4200, 1.3), 11.4, { gain: 0.06, pan: 0.3 }); // bowl + triangle
place(whoosh(0.5, 900, 2500, 1.5), 11.28, { gain: 0.04, pan: -0.6 }); // circle
SY.names.forEach((t, i) => { place(tick(3600 - 150 * i, 0.02), t, { gain: 0.05, pan: 0.45 }); place(blip(mtof(PENTA[6 + (i % 5)]), 0.05), t, { gain: 0.016, pan: 0.45, rev: 0.2 }); });
place(chatter(0.45), 11.55, { gain: 0.014, pan: 0.6 }); place(chatter(0.4), 11.8, { gain: 0.012, pan: -0.5 });
[0, 1, 2, 3, 4, 5, 6].forEach((i) => place(pluck(mtof([55, 58, 62, 67, 70, 74, 79][i]), 0.3, 3000), 11.5 + i * 0.045, { gain: 0.03, pan: -0.6 + 0.1 * i, rev: 0.25, to: 'MUS' })); // wordmark rises
// the lock-up: everything retracts, the dot falls one last time
place(suck(0.35), T.lock - 0.02, { gain: 0.09 });
place(riser(T.land - 12.15, 300, 12000, 2.4, 0.35), 12.15, { gain: 0.26, rev: 0.15 });
range(12.19, T.land - 0.06, B / 4).concat(range(12.66, T.land - 0.06, B / 8)).forEach((t, k) => place(clap(0.25 + 0.03 * k), t, { gain: 0.09, to: 'DRUM' }));
place(rev(ks(mtof(62), 0.62, 0.6, 0.997)), T.land - 0.62, { gain: 0.13, rev: 0.3 });

// ================================================================== bar 8: it lands. D major. (13.125 – 15)
hit(T.land, 1.3, 0.8);
place(ks(mtof(38), 3.6, 0.55, 0.9988), T.land, { gain: 0.45, rev: 0.3 });
[50, 54, 57, 62, 66, 69].forEach((m, j) => place(ks(mtof(m), 2.8, 0.6, 0.998), T.land + j * 0.012, { gain: 0.06, pan: (j - 2.5) * 0.25, rev: 0.4, dly: 0.15 }));
[62, 66, 69, 74, 78, 81].forEach((m, j) => place(bell(mtof(m + 12), 2.6, 0.7, 2), T.land + 0.04 + j * 0.05, { gain: 0.03, pan: -0.5 + 0.2 * j, rev: 0.55, dly: 0.2 }));
place(pad([38, 45, 50, 54, 57, 62, 66], 1.9, 0.02, 0.6, 2400), T.land, { gain: 0.09, rev: 0.45, to: 'MUS' });
place(bassNote(mtof(26), 1.6, 220, 1, 1), T.land, { gain: 0.26, to: 'MUS' });
place(chatter(0.5), T.land + 0.2, { gain: 0.012 }); place(blip(2349, 0.1), T.land + 0.7, { gain: 0.03, rev: 0.4, dly: 0.3 }); // ETHLABS.ORG

// ================================================================== mix
function freeverb(inL, inR, room = 0.85, damp = 0.3) {
  const sc = SR / 44100, combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const mk = (off) => ({ combs: combT.map((n) => ({ b: new Float32Array(Math.round((n + off) * sc)), i: 0, f: 0 })),
    aps: apT.map((n) => ({ b: new Float32Array(Math.round((n + off) * sc)), i: 0 })) });
  const run = (ch, x) => {
    let y = 0;
    for (const c of ch.combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; if (++c.i >= c.b.length) c.i = 0; y += o; }
    for (const a of ch.aps) { const bo = a.b[a.i]; a.b[a.i] = y + bo * 0.5; if (++a.i >= a.b.length) a.i = 0; y = bo - y; }
    return y;
  };
  const L = mk(0), R = mk(23), oL = new Float32Array(NS), oR = new Float32Array(NS);
  for (let k = 0; k < NS; k++) { const x = (inL[k] + inR[k]) * 0.015; oL[k] = run(L, x); oR[k] = run(R, x); }
  return [oL, oR];
}
function pingpong(inL, inR, time = 0.75 * B, fb = 0.36) {
  const d = Math.round(time * SR), oL = new Float32Array(NS), oR = new Float32Array(NS);
  const lpL = biquad().set('lp', 3800), lpR = biquad().set('lp', 3800);
  for (let k = d; k < NS; k++) {
    oL[k] = lpL.run((inL[k - d] + inR[k - d]) * 0.5 + oR[k - d] * fb);
    oR[k] = lpR.run(oL[k - d] * fb);
  }
  return [oL, oR];
}
const [rvL, rvR] = freeverb(REV[0], REV[1]), [dlL, dlR] = pingpong(DLY[0], DLY[1]);
const duck = new Float32Array(NS).fill(1);
for (const kt of KICKS) {
  const s0 = Math.round(kt * SR);
  for (let i = 0; i < SR * 0.4 && s0 + i < NS; i++) {
    const t = i / SR, g = 1 - 0.55 * Math.min(1, t / 0.004) * Math.exp(-t / 0.1);
    duck[s0 + i] = Math.min(duck[s0 + i], g);
  }
}
// a breath before the drop: everything but the riser tail drops out for the last 16th
const gap = (t) => (t > T.drop - 0.075 && t < T.drop ? 0.15 : 1);
const out = [new Float32Array(NS), new Float32Array(NS)];
let peak = 0;
const FADE = 14.2;
for (let k = 0; k < NS; k++) {
  const t = k / SR, fade = t < FADE ? 1 : Math.max(0, 1 - (t - FADE) / (DUR - FADE - 0.02)) ** 1.6, g = gap(t);
  for (let c = 0; c < 2; c++) {
    const v = DRUM[c][k] * g + MUS[c][k] * duck[k] * g + FX[c][k] + (c ? rvR[k] : rvL[k]) * 2.3 + (c ? dlR[k] : dlL[k]) * 0.7;
    out[c][k] = Math.tanh(v * 0.85) * fade;
    peak = Math.max(peak, Math.abs(out[c][k]));
  }
}
const normk = 0.89 / peak; // -1 dBFS
if (process.env.STEMS) {
  const rms = (x, a, b) => { let s = 0; for (let k = Math.round(a * SR); k < b * SR; k++) s += (x[k] * normk) ** 2; return (10 * Math.log10(s / ((b - a) * SR) + 1e-12)).toFixed(1); };
  for (const [a, b] of [[0, 1.4], [1.4, 1.875], [1.875, 5.625], [5.625, 7.5], [7.5, 9.375], [9.375, 11.25], [11.25, 13.125], [13.125, 15]]) console.log(a, b, 'dB', rms(out[0], a, b));
}

// ------------------------------------------------------------------ wav (float32)
const data = Buffer.alloc(NS * 8);
for (let k = 0; k < NS; k++) { data.writeFloatLE(out[0][k] * normk, k * 8); data.writeFloatLE(out[1][k] * normk, k * 8 + 4); }
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24);
hdr.writeUInt32LE(SR * 8, 28); hdr.writeUInt16LE(8, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
const file = path.join(DIR, 'out/audio.wav');
fs.writeFileSync(file, Buffer.concat([hdr, data]));
console.log(file, 'peak before norm', peak.toFixed(3));
