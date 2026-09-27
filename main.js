/* ETHLABS — a 15 s motion piece for ethlabs.org (2026-09-27).
 * One hairline runs through the film: point → line → balance → diamond → curve → dots → "the settlement layer" →
 * globe → network → the ethlabs.org homepage → logo. Palette straight from the site: #fff paper, #111 ink, one red.
 * The line is a damped string: whatever lands on it plucks it, and synth.mjs plucks along.
 * 128 BPM: beat B = 0.46875 s, bar = 1.875 s, 8 bars = 15 s. Deterministic: window.seek(t) draws time t (s).
 */
(() => {
'use strict';
const W = 1920, H = 1080, FPS = 60, DURATION = 15, TAU = Math.PI * 2, D2R = Math.PI / 180;
const B = 60 / 128; // one beat
const RENDER = location.search.includes('render');

// ---------------------------------------------------------------- math + easing
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const pOut = (k) => (t) => 1 - (1 - t) ** k, pIn = (k) => (t) => t ** k;
const pInOut = (k) => (t) => (t < 0.5 ? (2 * t) ** k / 2 : 1 - (2 - 2 * t) ** k / 2);
const xOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)), xIn = (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10));
const back = (s) => (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const o2 = pOut(2), o3 = pOut(3), o4 = pOut(4), i2 = pIn(2), i3 = pIn(3), io2 = pInOut(2), io3 = pInOut(3), io4 = pInOut(4), bk = back(1.7);
const P = (t, t0, d, e) => (e ? e(inv(t0, t0 + d, t)) : inv(t0, t0 + d, t)); // eased progress through [t0, t0 + d]
function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
const vl = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

// ---------------------------------------------------------------- score (s)
const T = {
  pop: 0.06, line: 0.26, fall: 2 * B, hit: 3 * B,                             // bar 1: point → line → first drop
  b1: 4 * B, b2: 6 * B, b3: 8 * B, b4: 10 * B,                                 // bars 2–3: we believe …
  drop: 12 * B, word: 13 * B, bend: 16 * B, globe: 17 * B, dive: 19.3 * B,   // bars 4–5: the settlement layer
  net: 20 * B, home: 24 * B, lock: 27 * B, land: 28 * B,                        // bars 6–8: network → home → logo
};
const SPLIT = [1, 2, 3, 4].map((k) => T.b4 + (k * B) / 4).concat([1, 2, 3, 4, 5].map((k) => T.b4 + B + (k * B) / 8)); // 1 → 512
window.DURATION = DURATION;
window.SCORE = { ...T, B, SPLIT };

// ---------------------------------------------------------------- palette, canvas, camera
const INK = [17, 17, 17], MUTED = [143, 143, 140], RED = [229, 57, 43], PAPER = [255, 255, 255];
const rgba = (col, a = 1) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
const out = document.getElementById('cv'), octx = out.getContext('2d', { alpha: false });
const cnv = Object.assign(document.createElement('canvas'), { width: W, height: H });
const c = cnv.getContext('2d', { alpha: false });
let CZ = 1; // current camera zoom (hairlines stay hairlines)
function cam(k) {
  const co = Math.cos(k.r || 0) * k.z, si = Math.sin(k.r || 0) * k.z;
  c.setTransform(co, si, -si, co, W / 2 - (co * k.x - si * k.y), H / 2 - (si * k.x + co * k.y));
  CZ = k.z;
}
function screen() { c.setTransform(1, 0, 0, 1, 0, 0); CZ = 1; }
const lw = (px) => px / CZ;

// ---------------------------------------------------------------- drawing
function stroke(w, col = INK, a = 1) { c.lineWidth = lw(w); c.strokeStyle = rgba(col, a); c.stroke(); }
function line(x1, y1, x2, y2, w = 2, col = INK, a = 1) {
  if (a <= 0.002) return;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); stroke(w, col, a);
}
function dot(x, y, r, col = INK, a = 1) {
  if (a <= 0.002 || r <= 0) return;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = rgba(col, a); c.fill();
}
function circle(x, y, r, w = 2, col = INK, a = 1, f = 1, a0 = -Math.PI / 2) {
  if (a <= 0.002 || r <= 0 || f <= 0) return;
  c.beginPath(); c.arc(x, y, r, a0, a0 + TAU * f); stroke(w, col, a);
}
function polyLen(p) { let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return L; }
function poly(p, f1 = 1, w = 2, col = INK, a = 1, f0 = 0, L = polyLen(p), close = false) { // draw [f0, f1] of a polyline's length
  if (a <= 0.002 || f1 <= f0) return;
  if (f0 <= 0 && f1 >= 1) {
    c.beginPath(); c.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
    if (close) c.closePath();
    return stroke(w, col, a);
  }
  const s0 = f0 * L, s1 = f1 * L; let s = 0, on = false;
  c.beginPath();
  for (let i = 2; i < p.length; i += 2) {
    const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1], d = Math.hypot(x1 - x0, y1 - y0);
    if (s + d >= s0) {
      const u0 = d ? clamp((s0 - s) / d) : 0, u1 = d ? clamp((s1 - s) / d) : 1;
      if (!on) { c.moveTo(lerp(x0, x1, u0), lerp(y0, y1, u0)); on = true; }
      c.lineTo(lerp(x0, x1, u1), lerp(y0, y1, u1));
    }
    s += d;
    if (s >= s1) break;
  }
  stroke(w, col, a);
}
const pts = (...v) => v.flatMap((q) => [q.x, q.y]);
function fillPoly(p, col, a) { c.beginPath(); c.moveTo(p[0].x, p[0].y); for (const q of p.slice(1)) c.lineTo(q.x, q.y); c.closePath(); c.fillStyle = rgba(col, a); c.fill(); }

// ---------------------------------------------------------------- type
function font(size, wt = 400, ls = 0) { c.font = `${wt} ${size}px Outfit`; c.letterSpacing = `${ls}px`; }
function txt(s, x, y, { size = 20, wt = 400, ls = 0, col = INK, a = 1, align = 'left' } = {}) {
  if (a <= 0.002 || !s) return;
  font(size, wt, ls); c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = rgba(col, a); c.fillText(s, x, y);
}
const measure = (s, size, wt = 400, ls = 0) => (font(size, wt, ls), c.measureText(s).width);
const GL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@';
let TF = 0; // the frame's own time: text content never changes between motion-blur sub-frames
function scramble(s, p, seed) { // decode left → right; p <= 0 = gone
  if (p <= 0) return '';
  if (p >= 1) return s;
  const n = s.length, rev = Math.floor(p * n), fr = Math.floor(TF * 30); let o = '';
  for (let i = 0; i < Math.min(n, rev + 4); i++) o += i < rev || s[i] === ' ' ? s[i] : GL[(hash(i + seed * 31, fr) * GL.length) | 0];
  return o;
}

// ---------------------------------------------------------------- the string: a plucked, damped line (modal synthesis)
const NM = 40;
function mkString(x0, x1, y0, f1 = 1.6, damp = 2.4) { return { x0, x1, y0, f1, damp, imps: [], M: new Float64Array(NM + 1), mt: NaN }; }
// A strike = a hammer blow of width w (px): a trough of depth a opens under it and its walls run out to the ends and back.
function pluck(s, t, x, a, w = 40) { s.imps.push({ t, p: clamp((x - s.x0) / (s.x1 - s.x0), 0.02, 0.98), a, w: w / (s.x1 - s.x0) }); }
function modes(s, t) {
  if (s.mt === t) return s.M;
  const M = s.M; M.fill(0);
  for (const im of s.imps) {
    const dt = t - im.t; if (dt <= 0 || dt > 4) continue;
    for (let n = 1; n <= NM; n++) {
      const kn = n * Math.PI * im.w;
      M[n] += ((4 * im.a) / (n * Math.PI)) * Math.sin(n * Math.PI * im.p) * Math.exp(-0.5 * kn * kn) * Math.sin(TAU * s.f1 * n * dt) * Math.exp(-(s.damp + 0.012 * n * n) * dt);
    }
  }
  s.mt = t; return M;
}
function sy(s, x, t) { // height of the string at x
  const u = (x - s.x0) / (s.x1 - s.x0); if (u <= 0 || u >= 1) return s.y0;
  const M = modes(s, t); let y = 0;
  for (let n = 1; n <= NM; n++) y += M[n] * Math.sin(n * Math.PI * u);
  return s.y0 + y;
}
function stringPts(s, t, x0 = s.x0, x1 = s.x1, amp = 1, extra) {
  const n = 260, p = [];
  for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); p.push(x, s.y0 + (sy(s, x, t) - s.y0) * amp + (extra ? extra(x) : 0)); }
  return p;
}

// ---------------------------------------------------------------- 3D bits (orthographic)
function rot3(p, yaw, pitch, roll = 0) {
  let { x, y, z } = p;
  let cs = Math.cos(yaw), sn = Math.sin(yaw); [x, z] = [x * cs + z * sn, -x * sn + z * cs];
  cs = Math.cos(pitch); sn = Math.sin(pitch); [y, z] = [y * cs - z * sn, y * sn + z * cs];
  cs = Math.cos(roll); sn = Math.sin(roll); [x, y] = [x * cs - y * sn, x * sn + y * cs];
  return { x, y, z };
}

// ================================================================ layouts (built after fonts load)
const K = 1920 / 1366; // ethlabs.org homepage viewBox → frame
const Lz = {};
function layout() {
  // --- the mission line: "The settlement layer" + a red full stop, sitting on the string at y = 660
  const MT = 'The settlement layer';
  const fs = Math.round((1440 / measure(MT, 100, 600, -1)) * 100);
  const tw = measure(MT, fs, 600, -fs * 0.01), pr = Math.round(fs * 0.072), pgap = fs * 0.07;
  const xs = Math.round(960 - (tw + pgap + 2 * pr) / 2);
  const letters = [];
  let k = 0;
  for (let i = 0; i < MT.length; i++) {
    if (MT[i] === ' ') continue;
    const x = xs + measure(MT.slice(0, i), fs, 600, -fs * 0.01), w = measure(MT[i], fs, 600, 0);
    letters.push({ ch: MT[i], x, w, xc: x + w / 2, tl: T.word + (k++ * B) / 8 });
  }
  Lz.fs = fs; Lz.xs = xs; Lz.letters = letters; Lz.period = { x: xs + tw + pgap + pr, r: pr };
  Lz.capH = fs * 0.7;

  // --- B4 grid: 32 × 16 leaves; the right-most column lands exactly on the full stop
  const X0 = xs + 6, X1 = (Lz.period.x - X0 / 64) * (64 / 63);
  Lz.grid = { X0, X1, Y0: 118, Y1: 598 };

  // --- the ring: "The settlement layer · of the global economy · " around R
  const R = 280, f1 = 'The settlement layer', f2 = 'of the global economy', SEP = 0.62; // separator = gap · dot · gap (em)
  const em1 = measure(f1, 100, 600, -1) / 100, em2 = measure(f2, 100, 600, -1) / 100;
  const fr = (TAU * R) / (em1 + em2 + 2 * SEP);
  const ring = [];
  let a = 0;
  const addText = (s, part) => {
    for (let i = 0; i < s.length; i++) {
      const w = measure(s[i], fr, 600, 0), x = a + measure(s.slice(0, i), fr, 600, -fr * 0.01);
      if (s[i] !== ' ') ring.push({ ch: s[i], ac: x + w / 2, w, part });
    }
    a += measure(s, fr, 600, -fr * 0.01);
  };
  addText(f1, 1); const sep1 = a + (SEP * fr) / 2; a += SEP * fr;
  addText(f2, 2); const sep2 = a + (SEP * fr) / 2; a += SEP * fr;
  const mid1 = measure(f1, fr, 600, -fr * 0.01) / 2;
  Lz.ring = { R, fr, glyphs: ring, sep1: sep1 - mid1, sep2: sep2 - mid1, mid1, total: a };
  ring.forEach((g) => { g.s = g.ac - mid1; });
  // pair flat letters with their ring glyphs (part 1)
  const p1 = ring.filter((g) => g.part === 1);
  letters.forEach((l, i) => { l.ring = p1[i]; });

  // --- homepage (ethlabs.org, desktop viewBox 1366×768 → ×K)
  const svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0'); document.body.appendChild(svg);
  const sample = (d, n) => {
    const el = document.createElementNS(svgNS, 'path'); el.setAttribute('d', d); svg.appendChild(el);
    const L = el.getTotalLength(), p = [];
    for (let i = 0; i <= n; i++) { const q = el.getPointAtLength((L * i) / n); p.push(q.x * K, q.y * K); }
    return p;
  };
  Lz.curve = sample(BRAND.curve, 1400);
  Lz.curveL = polyLen(Lz.curve);
  Lz.rule = [95.74 * K, 208.41 * K, 1254.97 * K, 208.41 * K, 1254.97 * K, 96 * K];
  Lz.circ = { x: 283.71 * K, y: 483 * K, r: 117.35 * K };
  Lz.wm = BRAND.wordmark.map((d) => new Path2D(d));
  Lz.wmX = [63, 184, 276, 410, 455, 608, 765]; // glyph left edges (wordmark units)
  Lz.names = BRAND.names.map(([x, y, s]) => ({ x: x * K, y: y * K, s }));
}

// ---------------------------------------------------------------- the network (world units; red node = Ethlabs at 0,0)
const NETC = { x: -250, y: 40 }, KAPPA = 0.082;
const NET = (() => {
  const nodes = [{ x: 0, y: 0, r: 64, red: true }];
  for (let i = -8; i <= 8; i++) for (let j = -5; j <= 5; j++) {
    const x = i * 245 + (hash(i + 20, j + 40) - 0.5) * 170 + NETC.x, y = j * 225 + (hash(j + 60, i + 80) - 0.5) * 150 + NETC.y;
    if (((x - NETC.x) / 1780) ** 2 + ((y - NETC.y) / 1040) ** 2 > 1 || Math.hypot(x, y) < 210) continue;
    nodes.push({ x, y, r: 9 + 22 * hash(i + 3, j + 7) ** 2 });
  }
  nodes.forEach((n) => { n.d = Math.hypot(n.x, n.y); });
  const LABELS = ['USERS', 'APPLICATIONS', 'WALLETS', 'L2S', 'INFRASTRUCTURE', 'INSTITUTIONS', 'ETH HOLDERS', 'CORE DEVS', 'RESEARCHERS'];
  const near = nodes.slice(1).sort((a, b) => a.d - b.d).slice(0, 9).sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  near.forEach((n, i) => { n.label = LABELS[i]; n.r = 30 + 10 * hash(i, 5); });
  const edges = [], seen = new Set();
  const link = (a, b) => { const key = a < b ? a + ':' + b : b + ':' + a; if (a !== b && !seen.has(key)) { seen.add(key); edges.push([a, b]); } };
  nodes.forEach((n, a) => {
    const by = nodes.map((m, b) => [Math.hypot(m.x - n.x, m.y - n.y), b]).sort((p, q) => p[0] - q[0]);
    const k = a === 0 ? 10 : 2 + (hash(a, 9) > 0.6 ? 1 : 0);
    for (let q = 1; q <= k; q++) link(a, by[q][1]);
  });
  const W0 = 20.8 * B; // the wave leaves the red node here and travels outward
  nodes.forEach((n) => { n.ta = W0 + n.d / 2600; });
  return { nodes, edges, W0 };
})();

// ---------------------------------------------------------------- globe nodes + settlement arcs
const GLOBE = (() => {
  const nodes = [];
  for (let i = 0; i < 46; i++) { // golden-angle sphere, thinned toward the poles
    const y = 1 - (2 * (i + 0.5)) / 46, lat = Math.asin(y * 0.86), lon = i * 2.39996 + 0.7;
    nodes.push({ lat, lon, t: 0 });
  }
  const red = { lat: 16 * D2R, lon: 0, red: true };
  return { nodes, red, arcs: [3, 9, 14, 20, 27, 33, 38, 41].map((k, i) => ({ to: nodes[k], t0: 8.62 + i * 0.045 })) };
})();
const globeYaw = (t) => -0.35 + 0.55 * (t - T.globe); // rad
GLOBE.red.lon = -globeYaw(9.3);
GLOBE.nodes.forEach((n, i) => { n.t = 8.3 + 0.012 * i; });

// ================================================================ cameras
function stageCam(t) {
  let z = 1, x = W / 2, y = H / 2 + 36 * (P(t, T.b1, 0.5, io3) - P(t, T.drop, 0.3, io3)), r = 0;
  const about = (px, py, zz) => { x = px + (x - px) / zz; y = py + (y - py) / zz; z *= zz; }; // zoom keeping (px, py) fixed on screen
  // slow push-ins, reset by a kick on each section change
  const PUSH = [[0.9, T.b1, 1.0, 1.035], [T.b1, T.b2, 1.0, 1.02], [T.b2, T.b3, 1.0, 1.02], [T.b3, T.b4, 1.0, 1.02], [T.bend, T.dive, 1.0, 1.06]];
  for (const [a, b, z0, z1] of PUSH) if (t >= a && t < b) z = lerp(z0, z1, P(t, a, b - a, io2));
  if (t >= T.b1 && t < T.b4) z *= lerp(1, 1.08, P(t, T.b1, 0.5, io3)); // bars 2–3 sit a little closer
  if (t < 0.9) z = lerp(3.4, 1, P(t, 0.12, 0.78, io3)); // macro on the point, pull out as it becomes a line
  if (t >= T.b2 && t < T.b3) r = -0.12 * Math.sin(Math.PI * P(t, T3D - 0.06, 0.42)); // roll with the spin
  if (t >= T.b4 && t < T.drop) { // push onto the seed dot, pull back as it multiplies
    const G = Lz.grid, gz = lerp(1, 1.55, P(t, T.b4 + 0.06, 0.11, io3)) / lerp(1, 1.55, P(t, SPLIT[0], SPLIT[8] - SPLIT[0] + 0.08, o2));
    about((G.X0 + G.X1) / 2, (G.Y0 + G.Y1) / 2, gz * lerp(1, 1.04, P(t, SPLIT[8], T.drop - SPLIT[8])));
  }
  if (t >= T.drop && t < T.bend) { // dolly along the landing letters, then reveal the whole line
    const zi = P(t, 5.82, 0.3, io3), zo = P(t, 6.95, 0.45, io3), tr = P(t, 5.9, 1.08, io2);
    const zz = lerp(1, lerp(1.42, 1, zo), zi);
    x = lerp(960, lerp(lerp(640, 1290, tr), 960, zo), zi); y = lerp(540, lerp(598, 540, zo), zi); z = zz;
  }
  for (const [tk, amt] of [[T.hit, 0.02], [T.b1, 0.025], [T.b2, 0.015], [T.b3, 0.015], [T.b4, 0.015], [T.drop, 0.04]]) {
    const dt = t - tk; if (dt >= 0 && dt < 0.8) z *= 1 + amt * Math.exp(-dt / 0.1);
  }
  // shake on the heavy landings
  let sh = 0;
  for (const [tk, amt] of [[T.hit, 5], [T.drop + 0.24, 7]]) { const dt = t - tk; if (dt >= 0 && dt < 0.6) sh += amt * Math.exp(-dt / 0.08); }
  const f = Math.floor(t * FPS);
  x += sh * (hash(f, 1) - 0.5); y += sh * (hash(f, 2) - 0.5);
  // the dive into the red node
  if (t >= T.dive) {
    const e = P(t, T.dive, T.net - T.dive), g = globeProj(t, GLOBE.red);
    const zz = Math.exp(Math.log(400) * i3(e)); // red fills the frame a frame before the cut
    x = lerp(x, g.x, o3(e)); y = lerp(y, g.y, o3(e)); z *= zz; r = -0.2 * i2(e);
  }
  return { x, y, z, r };
}
function hcCam(t) { // homepage coordinates (1920×1080 frame of ethlabs.org); the network lives inside the CONTRIBUTORS circle
  const C = Lz.circ, toHC = (f, zn) => ({ x: C.x + KAPPA * (f.x - NETC.x), y: C.y + KAPPA * (f.y - NETC.y), z: zn / KAPPA });
  const F1 = { x: -140, y: 30 }, F2 = { x: NETC.x, y: NETC.y + 200 }, Z2 = 0.42; // F2: the network sits above the caption
  if (t < 10.0) { // inside the red node (a full-red flash) → pull back
    const e = P(t, 9.4, 0.6, o3);
    return { ...toHC(vl({ x: 0, y: 0 }, F1, e), Math.exp(lerp(Math.log(26), Math.log(0.9), e))), r: lerp(-0.2, 0, P(t, T.net, 0.5, o3)) };
  }
  if (t < 10.95) return toHC(vl(F1, F2, P(t, 10.0, 0.95, io2)), lerp(0.9, Z2, P(t, 10.0, 0.95, io2)));
  if (t < 12.0) { // zoom out until the network is the texture inside the CONTRIBUTORS circle
    const e = P(t, 10.95, 1.05, io3), k0 = toHC(F2, Z2), Z = Math.exp(lerp(Math.log(k0.z), 0, e));
    const s0 = { x: 960 + k0.z * (C.x - k0.x), y: 540 + k0.z * (C.y - k0.y) }, s = vl(s0, C, e); // the circle's screen position glides home
    return { x: C.x - (s.x - 960) / Z, y: C.y - (s.y - 540) / Z, z: Z };
  }
  // lock-up: push into the wordmark
  const e = P(t, T.lock + 0.01, 0.3, io4), dr = P(t, T.lock + 0.31, 3, o2);
  return { x: lerp(960, 395, e), y: lerp(540, 255, e), z: lerp(1, 1.5, e) * (1 + 0.025 * dr) };
}

// ================================================================ bar 1–2: point → line → drop → beam
const S1 = mkString(100, 1820, 540);
pluck(S1, T.hit, 960, 44);
const DR = 10; // red dot radius
const G1 = (2 * (540 - DR + 40)) / (T.hit - T.fall) ** 2;
const TW = [T.b1 + B / 4, T.b1 + (3 * B) / 4]; // the two weights land on 16ths
function beamAngle(t) {
  let th = 0;
  TW.forEach((tw, i) => { const dt = t - tw; if (dt > 0) th += (i ? 1 : -1) * 8 * D2R * Math.exp(-dt / 0.35) * Math.sin(TAU * 2.3 * dt); });
  if (t > TW[1]) th *= Math.exp(-(t - TW[1]) / 0.1); // the second weight evens it out: settles level
  return th * (1 - P(t, T.b2, 0.16));
}
const pivotY = (t) => lerp(540, 520, P(t, T.b2, 0.2, io3));
function drawLine(t) {
  if (t >= T3D) return;
  const hl = 860 * P(t, T.line, 0.55, o4);
  // the point
  if (hl < 8) { dot(960, 540, 7 * P(t, T.pop, 0.22, bk), INK); return; }
  const th = lerp(14, 2, P(t, T.line, 0.3, o3));
  const sag = (x) => (t > T.hit && t < T.b1 + 0.2 ? 5 * P(t, T.hit, 0.08) * (1 - P(t, T.b1, 0.14)) * Math.max(0, 1 - Math.abs(x - 960) / 860) : 0);
  // ruler ticks under the line
  const ta = 1 - P(t, T.b1 - 0.1, 0.25);
  for (let x = 120, i = 0; x <= 1800; x += 40, i++) {
    const g = clamp((hl - Math.abs(x - 960)) / 70), h = (i % 5 === 3 ? 16 : 7) * o3(g);
    if (g > 0 && ta > 0) { const y = sy(S1, x, t) + sag(x); line(x, y + 9, x, y + 9 + h, 1.2, MUTED, ta); }
  }
  if (t < T.b1 + 0.14) { // the string (stiffens into a beam from b1)
    if (th > 2.1) { c.lineCap = 'round'; line(960 - hl, 540, 960 + hl, 540, th); c.lineCap = 'butt'; }
    else poly(stringPts(S1, t, 960 - hl, 960 + hl, 1 - P(t, T.b1, 0.14, o2), sag), 1, 2);
  } else { // the beam
    const a = beamAngle(t), py = pivotY(t), hb = lerp(lerp(860, 520, P(t, T.b1, 0.35, o4)), 140, P(t, T.b2, 0.2, io3));
    line(960 - hb * Math.cos(a), py - hb * Math.sin(a), 960 + hb * Math.cos(a), py + hb * Math.sin(a), 2);
  }
  // the first annotation: what just happened
  const la = P(t, T.hit + 0.04, 0.14) - P(t, T.b1 + 0.02, 0.08) * 2;
  if (la > -1) {
    const dy = sy(S1, 960, t) + sag(960) - 2 * DR, g = P(t, T.hit + 0.03, 0.18, o3) * (1 - P(t, T.b1, 0.1));
    line(960 + 9, dy - 9, 960 + 9 + 40 * g, dy - 9 - 40 * g, 1.2, INK, g);
    txt(scramble('SETTLED', la, 4), 960 + 58, dy - 54, { size: 17, wt: 400, ls: 4 });
  }
  // impact ripples
  for (const [d, amp] of [[0, 1], [0.12, 0.6]]) {
    const e = P(t, T.hit + d, 1.0);
    if (e > 0 && e < 1) { const r = 40 + 560 * o3(e); c.beginPath(); c.ellipse(960, 540, r, r * 0.14, 0, 0, TAU); stroke(1.3, INK, 0.45 * amp * (1 - e)); }
  }
}
function drawBalance(t) {
  if (t < T.b1 || t > T.b2 + 0.4) return;
  const a = beamAngle(t), py = pivotY(t), ca = Math.cos(a), sa = Math.sin(a);
  // weights: fall, ride the beam, get flung off at b2
  TW.forEach((tw, i) => {
    const s = i ? 1 : -1, d = 380, side = 46, fl = P(t, T.b2, 0.26);
    let cx = 960 + s * d * ca + 24 * sa, cy = py + s * d * sa - 24 * ca, rr = a;
    if (t < tw) { const u = tw - t; cy -= 0.5 * 9000 * u * u; if (cy < -60) return; }
    if (fl > 0) { cx += s * 1100 * o2(fl); cy -= 900 * o2(fl); rr += s * 6 * fl; }
    c.save(); c.translate(cx, cy); c.rotate(rr);
    c.beginPath(); c.rect(-side / 2, -side / 2, side, side); c.fillStyle = rgba(PAPER); c.fill(); stroke(2, INK, 1 - fl);
    c.restore();
  });
  // the fulcrum (drawDiamond takes it over at b2)
  if (t < T.b2) poly(pts({ x: 960, y: py + 2 }, { x: 1022, y: py + 112 }, { x: 898, y: py + 112 }, { x: 960, y: py + 2 }), P(t, T.b1 + 0.02, 0.3, o3), 2);
  // readout: level reference, angle arc, degrees
  const ra = P(t, TW[0], 0.15) * (1 - P(t, T.b2 - 0.08, 0.12));
  if (ra > 0) {
    c.setLineDash([lw(6), lw(7)]); line(960 - 600, py, 960 + 600, py, 1, MUTED, ra); c.setLineDash([]);
    const th = beamAngle(TF) / D2R, deg = Math.abs(th) < 0.2 ? '0.00' : th.toFixed(2).replace('-', '−');
    c.beginPath(); c.arc(960, py, 150, Math.min(0, a), Math.max(0, a)); stroke(1.5, INK, ra);
    txt(deg + '°', 960 + 176, py - 22, { size: 22, wt: 400, ls: 1, col: INK, a: ra });
    txt('LEVEL', 960 + 176, py + 34, { size: 15, wt: 400, ls: 3, col: MUTED, a: ra * (Math.abs(beamAngle(TF)) < 0.2 * D2R && TF > TW[1] ? 1 : 0) });
  }
}

function drawPaper(t) { // engineering paper under the thesis bars; moves with the camera
  const a = 0.22 * P(t, T.b1, 0.35) * (1 - P(t, T.b4 - 0.12, 0.12)); if (a <= 0) return;
  c.fillStyle = rgba(MUTED, a);
  for (let x = 0; x <= 1920; x += 48) for (let y = 12; y <= 1068; y += 48) {
    const d = Math.hypot(x - 960, y - 520) / 900; // vignette toward the edges
    if (d < 1) { c.globalAlpha = 1 - d * d; c.fillRect(x - lw(1.1), y - lw(1.1), lw(2.2), lw(2.2)); }
  }
  c.globalAlpha = 1;
}

// ================================================================ bars 2–3: ETH (the octahedron / favicon)
const OW = 140, OHT = 283, OHB = 261, OG = 33, OPITCH = Math.asin(18 / 31), OY = 520;
const T3D = T.b2 + 0.22;
function octa(t) {
  const yaw = TAU * P(t, T3D, 0.25, o3), pitch = OPITCH * P(t, T3D, 0.22, io3), g = OG * P(t, T3D + 0.06, 0.18, o3);
  const V3 = {
    ta: { x: 0, y: OHT + g / 2, z: 0 }, tl: { x: -OW, y: g / 2, z: 0 }, tr: { x: OW, y: g / 2, z: 0 }, tf: { x: 0, y: g / 2, z: OW }, tb: { x: 0, y: g / 2, z: -OW },
    bl: { x: -OW, y: -g / 2, z: 0 }, br: { x: OW, y: -g / 2, z: 0 }, bf: { x: 0, y: -g / 2, z: OW }, bb: { x: 0, y: -g / 2, z: -OW }, ba: { x: 0, y: -OHB - g / 2, z: 0 },
  };
  const S = {};
  for (const k in V3) { const q = rot3(V3[k], yaw, pitch); S[k] = { x: 960 + q.x, y: OY - q.y, z: q.z }; }
  return S;
}
const OEDGES = [['ta', 'tl'], ['ta', 'tr'], ['ta', 'tf'], ['ta', 'tb'], ['tl', 'tf'], ['tf', 'tr'], ['tr', 'tb'], ['tb', 'tl'],
  ['bl', 'bf'], ['bf', 'br'], ['br', 'bb'], ['bb', 'bl'], ['bl', 'ba'], ['br', 'ba'], ['bf', 'ba'], ['bb', 'ba']];
function drawDiamond(t) {
  if (t < T.b2 || t > T.b3 + 0.2) return;
  const py = pivotY(t);
  if (t < T3D) { // 2D: the fulcrum flips into the lower pyramid, the upper one grows out of the beam
    const e = P(t, T.b2, 0.18, io3), g = P(t, T.b2 + 0.08, 0.14, o4);
    const A = vl({ x: 960, y: py + 2 }, { x: 960, y: OY + OHB }, e), L = vl({ x: 898, y: py + 112 }, { x: 960 - OW, y: OY }, e), R = vl({ x: 1022, y: py + 112 }, { x: 960 + OW, y: OY }, e);
    poly(pts(A, R, L, A), 1, 2);
    if (g > 0) poly(pts({ x: 960 - OW, y: OY }, { x: 960, y: OY - OHT * g }, { x: 960 + OW, y: OY }), 1, 2);
    return;
  }
  const S = octa(t), fill = t >= T.b2 + B && t < T.b3 - 0.1, fade = 1 - P(t, T.b3 - 0.13, 0.08);
  const keep = (e) => (e[1] === 'ba' && (e[0] === 'bl' || e[0] === 'br')); // the chevron's outer edges survive into DeFi
  const shrink = P(t, T.b3 - 0.14, 0.13, i3);
  const inner = P(t, T3D, 0.1);
  if (!fill) {
    for (const e of OEDGES) {
      const a = S[e[0]], b = S[e[1]];
      if (keep(e) && t >= T.b3) continue; // handed over to drawAMM
      const zc = (a.z + b.z) / 2, back = zc < -5;
      const flat = (e[0] === 'ta' && (e[1] === 'tf' || e[1] === 'tb')) || (e[1] === 'ba' && (e[0] === 'bf' || e[0] === 'bb')) ? inner : 1; // edge-on in the side view: fade in
      const k = keep(e) ? 0 : shrink, m = vl(a, b, 0.5), A = vl(a, m, k), Bq = vl(b, m, k);
      if (k < 1) line(A.x, A.y, Bq.x, Bq.y, back ? 1.2 : 2, back ? MUTED : INK, (back ? 0.6 : 1) * (back ? inner : 1) * flat);
    }
  } else {
    fillPoly([S.ta, S.tr, S.tf, S.tl], INK, 0.9 * fade);
    fillPoly([S.bl, S.bf, S.br, S.ba], INK, 0.55 * fade);
  }
}

// ================================================================ bar 3: DeFi — x · y = k
const KS = [0.045, 0.1, 0.18, 0.29], KMAIN = 1;
function ammFrame(t) {
  const e = P(t, T.b3 + 0.02, 0.42, o3), rho = lerp(45, 0, e) * D2R;
  const S = octa(T.b3), OV = S.ba;
  return { O: vl(OV, { x: 690, y: 800 }, e), sc: lerp(242, 520, e), eu: { x: Math.cos(rho), y: -Math.sin(rho) }, ev: { x: -Math.sin(rho), y: -Math.cos(rho) } };
}
const amm = (F, u, v) => ({ x: F.O.x + F.sc * (u * F.eu.x + v * F.ev.x), y: F.O.y + F.sc * (u * F.eu.y + v * F.ev.y) });
const swapU = (t) => lerp(0.22, 0.62, P(t, T.b3 + 0.46, 0.36, io3));
function drawAMM(t) {
  if (t < T.b3 || t > T.b4 + 0.25) return;
  const F = ammFrame(t), out = P(t, T.b4, 0.08, i2);
  // chevron arms → axes
  const S = octa(T.b3), m = P(t, T.b3, 0.12, io3), len = 1.08 * (1 - out);
  const uEnd = vl(S.br, amm(F, len, 0), m), vEnd = vl(S.bl, amm(F, 0, len), m);
  line(F.O.x, F.O.y, uEnd.x, uEnd.y, 2); line(F.O.x, F.O.y, vEnd.x, vEnd.y, 2);
  // the curve family
  KS.forEach((k, i) => {
    const d = P(t, T.b3 + 0.06 + i * 0.04, 0.34, io3) * (1 - out), p = [];
    for (let j = 0; j <= 80; j++) { const u = k * (1 / k) ** (j / 80); p.push(...Object.values(amm(F, u, k / u))); }
    // draw from the middle of the curve outwards
    poly(p, 0.5 + 0.5 * d, i === KMAIN ? 2 : 1.2, i === KMAIN ? INK : MUTED, 1, 0.5 - 0.5 * d);
  });
  const la = P(t, T.b3 + 0.32, 0.2) * (1 - P(t, T.b4, 0.1));
  const q = amm(F, 0.66, 0.66);
  txt('x · y = k', q.x + 20, q.y, { size: 34, wt: 300, ls: 1, a: la });
  const xe = amm(F, 1.1, 0), ye = amm(F, 0, 1.1);
  txt('x', xe.x + 14, xe.y + 8, { size: 22, wt: 400, col: MUTED, a: la }); txt('y', ye.x - 6, ye.y - 16, { size: 22, wt: 400, col: MUTED, a: la });
  // the swap: guides to both axes + tangent
  const ga = P(t, T.b3 + 0.38, 0.12) * (1 - P(t, T.b4, 0.08));
  if (ga > 0) {
    const u = swapU(t), v = KS[KMAIN] / u, p = amm(F, u, v), px = amm(F, u, 0), pyq = amm(F, 0, v);
    c.setLineDash([lw(5), lw(6)]); line(p.x, p.y, px.x, px.y, 1, MUTED, ga); line(p.x, p.y, pyq.x, pyq.y, 1, MUTED, ga); c.setLineDash([]);
    const du = 0.16, a0 = amm(F, u - du, v + (v / u) * du), a1 = amm(F, u + du, v - (v / u) * du);
    line(a0.x, a0.y, a1.x, a1.y, 1.2, INK, ga);
  }
}

// ================================================================ bar 3b: adoption — 1 → 512
function gridPos(i, j, t) {
  const G = Lz.grid;
  let L = 0; while (L < SPLIT.length && t >= SPLIT[L]) L++;
  const at = (lv) => {
    const cx = 2 ** Math.ceil(lv / 2), cy = 2 ** Math.floor(lv / 2);
    return { x: G.X0 + ((Math.floor((i * cx) / 32) + 0.5) * (G.X1 - G.X0)) / cx, y: G.Y0 + ((Math.floor((j * cy) / 16) + 0.5) * (G.Y1 - G.Y0)) / cy };
  };
  if (L === 0) return { ...at(0), r: 10 };
  const e = P(t, SPLIT[L - 1], 0.085, xOut), p = vl(at(L - 1), at(L), e);
  const jit = P(t, SPLIT[8] + 0.03, 0.14) * 2.5 * (t < T.drop ? 1 : 0), f = Math.floor(t * FPS);
  return { x: p.x + jit * (hash(i * 16 + j, f) - 0.5), y: p.y + jit * (hash(i * 16 + j, f + 7) - 0.5), r: lerp(10, 4.2, (L - 1 + e) / 9) };
}
const RL = { i: 31, j: 7 }; // the red leaf: right-most column → the full stop
const G2 = 11000, G3 = 12500; // dots, letters (px/s²)
function dotFall(i, j) { const p = gridPos(i, j, T.drop - 1e-6), td = T.drop + 0.02 * hash(i, j + 50); return { ...p, td, th: td + Math.sqrt((2 * (660 - p.r - p.y)) / G2) }; }
function drawGrid(t) {
  if (t < SPLIT[0] - 0.01 || t > T.drop + 0.5) return;
  for (let i = 0; i < 32; i++) for (let j = 0; j < 16; j++) {
    if (i === RL.i && j === RL.j) continue;
    if (t < T.drop) { const p = gridPos(i, j, t); dot(p.x, p.y, p.r, INK); continue; }
    const f = DROPS[i * 16 + j]; if (t >= f.th) continue;
    const u = Math.max(0, t - f.td), y = f.y + 0.5 * G2 * u * u;
    dot(f.x, y, f.r * (1 + Math.min(0.6, (G2 * u) / 6000)), INK); // stretch with speed (drawn round; blur does the rest)
  }
}
let DROPS = [];
function drawCount(t) {
  if (t < SPLIT[0] - 0.1 || t > T.drop + 0.1) return;
  let L = 0; while (L < SPLIT.length && TF >= SPLIT[L]) L++;
  const G = Lz.grid, a = P(t, SPLIT[0] - 0.1, 0.1) * (1 - P(t, T.drop, 0.08));
  txt(String(2 ** L), G.X1 + 6, G.Y0 - 34, { size: 44, wt: 300, ls: 1, col: INK, a, align: 'right' });
}

// ================================================================ bars 4–5: the settlement layer → the global economy → globe
const S2 = mkString(80, 1840, 660, 1.35, 3.2);
function bendMap(t) { // line → ring: returns f(s, n) → {x, y, a} for arc length s from the middle, normal offset n
  const e = P(t, T.bend, 0.62, io3), R = Lz.ring.R, L = lerp(1760, TAU * R, e), phi = TAU * e;
  const A = vl({ x: 960, y: 660 }, { x: 960, y: 540 - R }, e);
  const rot = -Math.PI * P(t, T.bend + 0.5, 1.4, io2);
  if (phi < 1e-4) return { L, e, f: (s, n) => ({ x: A.x + s, y: A.y - n, a: 0 }) };
  const Rb = L / phi;
  return { L, e, Rb, f: (s, n, spin = true) => { const th = s / Rb + (spin ? rot * e : 0); return { x: A.x + (Rb + n) * Math.sin(th), y: A.y + Rb - (Rb + n) * Math.cos(th), a: th }; } };
}
function drawMission(t) {
  if (t < T.drop || t > T.net) return;
  const bm = t >= T.bend ? bendMap(t) : null, e = bm ? bm.e : 0;
  const amp = 1 - P(t, T.bend, 0.2);
  // the line
  if (!bm) {
    const hl = 880 * P(t, T.drop, 0.09, o3);
    poly(stringPts(S2, t, 960 - hl, 960 + hl), 1, 2);
  } else if (t < T.bend + 0.63) { // the ring closes at T.bend + 0.62; the globe's outline takes over
    const p = [];
    for (let i = 0; i <= 240; i++) { const s = -bm.L / 2 + (bm.L * i) / 240, q = bm.f(s, (sy(S2, 960 + s, t) - 660) * -amp, false); p.push(q.x, q.y); }
    poly(p, 1, 2);
  }
  // label
  const lab = 'OUR MISSION IS TO MAKE ETHEREUM', lp = P(t, T.drop + 0.25, 0.45) - P(t, T.bend - 0.1, 0.25) * 2;
  txt(scramble(lab, lp, 3), Lz.xs + 4, 660 - Lz.fs * 0.98, { size: 22, wt: 400, ls: 5 });
  // the letters: fall, land, squash, ride the string — then bend into the ring
  const fs = Lz.fs, R = Lz.ring;
  for (const l of Lz.letters) {
    let x, y, a = 0, size = fs, sx = 1, syy = 1;
    if (!bm) {
      if (t < l.tl) { const u = l.tl - t; y = 660 - 0.5 * G3 * u * u; if (y < -40) continue; x = l.xc; syy = 1 + Math.min(0.25, (G3 * u) / 20000); sx = 1 / Math.sqrt(syy); }
      else { const dt = t - l.tl, sq = 0.2 * Math.exp(-dt / 0.07) * Math.cos(dt * 36); x = l.xc; y = sy(S2, l.xc, t); syy = 1 - sq; sx = 1 + 0.7 * sq; }
    } else {
      const s = lerp(l.xc - 960, l.ring.s, e), q = bm.f(s, 0);
      size = lerp(fs, R.fr, e); x = q.x; y = q.y; a = q.a;
      if (amp > 0) y += (sy(S2, l.xc, t) - 660) * amp;
    }
    c.save(); c.translate(x, y); c.rotate(a); c.scale(sx, syy);
    font(size, 600, 0); c.textAlign = 'center'; c.fillStyle = rgba(INK); c.fillText(l.ch, 0, 0);
    c.restore();
  }
  // part two of the ring settles onto it from outside
  if (bm && e > 0.6) {
    R.glyphs.forEach((g, k) => {
      if (g.part !== 2) return;
      const t0 = T.bend + 0.42 + k * 0.012 - 0.2, d = P(t, t0, 0.3, o3);
      if (d <= 0) return;
      const q = bm.f(g.s, 90 * (1 - d));
      c.save(); c.translate(q.x, q.y); c.rotate(q.a);
      font(R.fr, 600, 0); c.textAlign = 'center'; c.fillStyle = rgba(INK, d); c.fillText(g.ch, 0, 0);
      c.restore();
    });
    const q2 = bm.f(R.sep2, R.fr * 0.12), d2 = P(t, T.bend + 0.75, 0.2, bk);
    dot(q2.x, q2.y, 6 * d2, INK);
  }
}
function globeProj(t, n, lift = 1) {
  const R = Lz.ring.R, cl = Math.cos(n.lat);
  const q = rot3({ x: cl * Math.sin(n.lon) * R * lift, y: Math.sin(n.lat) * R * lift, z: cl * Math.cos(n.lon) * R * lift }, globeYaw(t), -16 * D2R, 23.4 * D2R);
  return { x: 960 + q.x, y: 540 - q.y, z: q.z };
}
function drawGlobe(t) {
  if (t < T.bend + 0.5 || t > T.net) return;
  const R = Lz.ring.R;
  if (t >= T.bend + 0.62) circle(960, 540, R, 2);
  const draw = (lat0, lat1, lon0, lon1, f, w) => {
    const front = [], back = [];
    let prev = null;
    for (let i = 0; i <= 72; i++) {
      const u = (i / 72) * f, q = globeProj(t, { lat: lerp(lat0, lat1, u), lon: lerp(lon0, lon1, u) });
      if (prev) (q.z + prev.z > 0 ? front : back).push([prev, q]);
      prev = q;
    }
    c.beginPath(); for (const [a, b] of back) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); } stroke(w * 0.7, MUTED, 0.35);
    c.beginPath(); for (const [a, b] of front) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); } stroke(w, INK, 0.85);
  };
  for (let k = 0; k < 9; k++) { // meridians sweep in
    const f = P(t, T.bend + 0.55 + k * 0.03, 0.4, o3);
    if (f > 0) draw(-Math.PI / 2, Math.PI / 2, k * 20 * D2R, k * 20 * D2R, f, 1.2);
  }
  for (let k = -2; k <= 2; k++) { // parallels
    const f = P(t, T.bend + 0.7 + Math.abs(k) * 0.04, 0.4, o3);
    if (f > 0) draw(k * 30 * D2R, k * 30 * D2R, -Math.PI, Math.PI, f, 1.2);
  }
  // nodes
  for (const n of GLOBE.nodes) {
    const q = globeProj(t, n), a = P(t, n.t, 0.12, bk);
    if (q.z > 0 && a > 0) dot(q.x, q.y, 5 * a, INK);
  }
  // settlement arcs from the red node
  for (const arc of GLOBE.arcs) {
    const d = P(t, arc.t0, 0.42, o3); if (d <= 0) continue;
    const a0 = GLOBE.red, a1 = arc.to, p = [];
    const v0 = sph(a0), v1 = sph(a1), om = Math.acos(clamp(v0.x * v1.x + v0.y * v1.y + v0.z * v1.z, -1, 1));
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, s0 = Math.sin((1 - u) * om) / Math.sin(om), s1 = Math.sin(u * om) / Math.sin(om);
      const v = { x: s0 * v0.x + s1 * v1.x, y: s0 * v0.y + s1 * v1.y, z: s0 * v0.z + s1 * v1.z }, lift = 1 + 0.32 * Math.sin(Math.PI * u) * (om / Math.PI);
      const q = globeProj(t, { lat: Math.asin(clamp(v.y, -1, 1)), lon: Math.atan2(v.x, v.z) }, lift);
      p.push(q.x, q.y);
    }
    poly(p, d, 2.2, RED, 0.95);
  }
}
const sph = (n) => ({ x: Math.cos(n.lat) * Math.sin(n.lon), y: Math.sin(n.lat), z: Math.cos(n.lat) * Math.cos(n.lon) });

// ================================================================ bars 6–8: network → ethlabs.org → logo (homepage coordinates)
const netHC = (n) => ({ x: Lz.circ.x + KAPPA * (n.x - NETC.x), y: Lz.circ.y + KAPPA * (n.y - NETC.y) });
function drawNetwork(t) {
  if (t < T.net || t > 12.3) return;
  const fade = 1 - P(t, 11.75, 0.35), N = NET.nodes;
  for (const [ia, ib] of NET.edges) {
    const a = N[ia], b = N[ib], [p, q] = a.d <= b.d ? [a, b] : [b, a], d = P(t, p.ta, 0.22, o2);
    if (d <= 0) continue;
    const A = netHC(p), Bq = netHC(q);
    line(A.x, A.y, lerp(A.x, Bq.x, d), lerp(A.y, Bq.y, d), 1.2, INK, 0.7 * fade);
  }
  // traffic: pulses run outward along live edges
  NET.edges.forEach(([ia, ib], k) => {
    if (hash(k, 77) > 0.45) return;
    const a = N[ia], b = N[ib], [p, q] = a.d <= b.d ? [a, b] : [b, a], t0 = q.ta + 0.25;
    if (t < t0) return;
    const u = ((t - t0) * 1.6 + hash(k, 78)) % 1, A = netHC(p), Bq = netHC(q);
    dot(lerp(A.x, Bq.x, u), lerp(A.y, Bq.y, u), lw(2.6), INK, fade * Math.sin(Math.PI * u) * P(t, t0, 0.2));
  });
  for (const n of N) {
    const p = netHC(n), r = n.r * KAPPA;
    if (n.red) { dot(p.x, p.y, r, RED, fade); continue; }
    const a = P(t, n.ta + 0.1, 0.2, bk); if (a <= 0) continue;
    c.beginPath(); c.arc(p.x, p.y, r * a, 0, TAU); c.fillStyle = rgba(PAPER); c.fill(); stroke(1.5, INK, fade);
  }
  // labels on top, knocked out of the drawing like a technical diagram
  const lab = (s, x, y, a, col) => {
    if (a <= 0 || !s) return;
    font(lw(15), n0 === s ? 600 : 400, lw(2.5)); const w = c.measureText(s).width;
    c.fillStyle = rgba(PAPER, Math.min(1, a * 1.2)); c.fillRect(x - lw(5), y - lw(15), w + lw(8), lw(21));
    txt(s, x, y, { size: lw(15), wt: n0 === s ? 600 : 400, ls: lw(2.5), col, a });
  };
  const n0 = 'ETHLABS';
  for (const n of N) {
    if (!n.label) continue;
    const p = netHC(n), r = n.r * KAPPA, la = P(t, n.ta + 0.18, 0.3);
    lab(scramble(n.label, la, n.label.length), p.x + r + lw(12), p.y + lw(6), fade * clamp((CZ * KAPPA - 0.2) / 0.15), INK);
  }
  // the red node's name: huge inside it while we are inside, then a label like the others
  const red = netHC(N[0]), zn = CZ * KAPPA, fsz = 10 * KAPPA, ia = clamp((zn - 1.7) / 0.9);
  txt('ETHLABS', red.x + fsz * 0.09, red.y + fsz * 0.36, { size: fsz, wt: 600, ls: fsz * 0.18, col: PAPER, a: ia, align: 'center' });
  lab('ETHLABS', red.x + 64 * KAPPA + lw(12), red.y + lw(6), (1 - ia) * P(t, 9.75, 0.25) * fade, RED);
}
const NAME_T = (i) => 11.62 + (i * B) / 10; // the team cascades down the triangle
function drawHome(t) {
  if (t < 11.2) return;
  const Z = Lz, C = Z.circ, lock = P(t, T.lock, 0.35);
  // the rule: draws left → right, turns up; at the lock-up it shrinks to the wordmark's width and drops under it
  const rd = P(t, 11.3, 0.55, io3), up = P(t, 11.78, 0.14, o3) * (1 - P(t, T.lock, 0.1, i2));
  const rx1 = lerp(Z.rule[2], 657, P(t, T.lock + 0.04, 0.3, io4)), ry = lerp(Z.rule[1], 330, P(t, T.lock + 0.1, 0.32, io3));
  const lp = LOCK_STRING(t, rx1, ry);
  if (rd > 0) {
    const p = lp.length ? lp : [Z.rule[0], ry, lerp(Z.rule[0], rx1, rd), ry];
    poly(p, 1, 1.4);
    if (up > 0) line(rx1, ry, rx1, lerp(ry, Z.rule[5], up), 1.4);
  }
  // the CONTRIBUTORS circle closes around the shrinking network
  const cd = P(t, 11.28, 0.5, io3) - P(t, T.lock, 0.22, i3);
  if (cd > 0) circle(C.x, C.y, C.r, 1.4, INK, 1, cd, -Math.PI / 2 + (t >= T.lock ? TAU * (1 - cd) : 0));
  const cl = P(t, 11.85, 0.3) - P(t, T.lock, 0.12) * 2;
  txt(scramble('CONTRIBUTORS', cl, 7), C.x, C.y + 7, { size: 14 * K, wt: 300, ls: 1 * K, align: 'center' });
  // the bowl + triangle
  const f1 = P(t, 11.4, 0.8, io3), f0 = P(t, T.lock, 0.3, i3);
  if (f1 > f0) poly(Z.curve, f1, 1.4, INK, 1, f0, Z.curveL); // draws on, then un-draws from its start at the lock-up
  // nav
  [['FUNDING', 1095, 'right'], ['THESIS', 1188, 'right'], ['WRITINGS', 1254.97, 'center']].forEach(([s, x, al], i) =>
    txt(scramble(s, P(t, 11.5 + i * 0.07, 0.3) - P(t, T.lock, 0.1) * 2, 11 + i), x * K, 50 * K, { size: 16 * K, wt: 300, ls: 1.6 * K, align: al }));
  // team + join, cascading down the triangle
  Z.names.forEach((n, i) => {
    const p = P(t, NAME_T(i), 0.22) - P(t, T.lock + 0.02 * i, 0.1) * 2;
    txt(scramble(n.s, p, 20 + i), n.x, n.y, { size: 14 * K, wt: 300, ls: 1.4 * K, col: n.s.startsWith('JOIN') ? RED : INK });
  });
  // tagline
  const tg = P(t, 11.8, 0.4);
  txt(scramble('NON-PROFIT R&D LAB FOR ETHEREUM AND ETH', tg, 5), 95 * K, 200 * K, { size: 14 * K, wt: 300, ls: 1.5 * K });
  // wordmark: glyphs rise from behind their baseline
  const s = (373 / 780) * K, ox = 95 * K, oy = 96 * K;
  c.save(); c.beginPath(); c.rect(0, -2000, 3000, oy + 204 * s - 49 * s + 1 + 2000); c.clip();
  Z.wm.forEach((p, i) => {
    const r = P(t, 11.5 + i * 0.045, 0.5, o4); if (r <= 0) return;
    c.save(); c.translate(ox, oy + (1 - r) * 165 * s); c.scale(s, s); c.translate(-63, -49);
    c.fillStyle = rgba(INK); c.fill(p); c.restore();
  });
  c.restore();
  // url
  const ua = P(t, T.land + 0.2, 0.5);
  txt(scramble('ETHLABS.ORG', ua, 9), 395, 380, { size: 14, wt: 400, ls: 4.2, align: 'center' });
}
// the final string: the rule becomes a string under the logo; the red dot lands at T.land
const S3 = mkString(133, 657, 330, 2.2, 1.5);
const XL = 391; // the gap between the wordmark's l and a
pluck(S3, T.land, XL, 26);
function LOCK_STRING(t, x1, y) {
  if (t < T.land - 0.05) return [];
  return stringPts(S3, t).map((v, i) => (i % 2 ? v - 330 + y : v));
}

// ================================================================ the red dot, start to finish
function drawRed(t) {
  if (t < T.fall) return;
  let x = 960, y, r = DR, sx = 1, syy = 1;
  if (t < T.hit) { // falling
    const u = t - T.fall, v = G1 * u; y = -40 + 0.5 * G1 * u * u; syy = 1 + Math.min(0.55, v / 5000); sx = 1 / Math.sqrt(syy);
    return blob(x, y, r, sx, syy);
  }
  if (t < T.b2) { // riding the string, then the beam's pivot
    const dt = t - T.hit, sq = 0.32 * Math.exp(-dt / 0.06) * Math.cos(dt * 48);
    const ys = t < T.b1 + 0.14 ? sy(S1, 960, t) * (1 - P(t, T.b1, 0.14, o2)) + 540 * P(t, T.b1, 0.14, o2) + 5 * P(t, T.hit, 0.08) * (1 - P(t, T.b1, 0.14)) : pivotY(t);
    return blob(960, ys - r * (1 - sq), r, 1 + 0.8 * sq, 1 - sq);
  }
  if (t < T.b3) { // into the diamond's heart (hidden while the logo is filled)
    if (t >= T.b2 + B && t < T.b3 - 0.1) return;
    const e = P(t, T.b2, 0.22, io3); return blob(960, lerp(pivotY(T.b2) - r, OY, e), r);
  }
  if (t < T.b4) { // out onto the curve, then the swap
    const F = ammFrame(t), e = P(t, T.b3 + 0.03, 0.34, io3), u = swapU(t), p = amm(F, u, KS[KMAIN] / u);
    return blob(lerp(960, p.x, e), lerp(OY, p.y, e), r);
  }
  if (t < T.drop) { // the seed of the grid: it becomes the red leaf
    const F = ammFrame(T.b4), u = swapU(T.b4), p0 = amm(F, u, KS[KMAIN] / u), g = gridPos(RL.i, RL.j, t);
    const e = P(t, T.b4, SPLIT[0] - T.b4 - 0.01, io3); return blob(lerp(p0.x, g.x, e), lerp(p0.y, g.y, e), g.r);
  }
  const f = DROPS[RL.i * 16 + RL.j], pr = Lz.period.r;
  if (t < T.bend) { // falls with the others, lands, becomes the full stop
    if (t < f.th) { const u = Math.max(0, t - f.td); return blob(f.x, f.y + 0.5 * G2 * u * u, lerp(f.r, pr, P(t, f.td, f.th - f.td))); }
    const dt = t - f.th, sq = 0.3 * Math.exp(-dt / 0.06) * Math.cos(dt * 44);
    return blob(Lz.period.x, sy(S2, Lz.period.x, t) - pr * (1 - sq), pr, 1 + 0.8 * sq, 1 - sq);
  }
  if (t < T.net) { // rides the ring as its separator, then drops onto the globe as the red node
    const bm = bendMap(t), R = Lz.ring, e = bm.e;
    const s = lerp(Lz.period.x - 960, R.sep1, e), q = bm.f(s, lerp(pr, R.fr * 0.12, e));
    const g = globeProj(t, GLOBE.red), m = P(t, 8.28, 0.3, io3);
    return blob(lerp(q.x, g.x, m), lerp(q.y, g.y, m), lerp(lerp(pr, 7, e), 7, m));
  }
}
function blob(x, y, r, sx = 1, syy = 1) {
  c.save(); c.translate(x, y); c.scale(sx, syy); dot(0, 0, r, RED); c.restore();
}
function drawRedHC(t) { // after the network: falls onto the logo's string
  if (t < T.land - 0.3) return;
  const x = XL, r = DR / 1.5, yl = 330 - r, G4 = 16900; // a 0.225 s drop through the l|a gap
  if (t < T.land) { const u = T.land - t, y = yl - 0.5 * G4 * u * u; if (y < -120) return; const s = 1 + Math.min(0.6, (G4 * u) / 6000); return blob(x, y, r, 1 / Math.sqrt(s), s); }
  const dt = t - T.land, sq = 0.32 * Math.exp(-dt / 0.06) * Math.cos(dt * 48);
  blob(x, sy(S3, x, t) - r * (1 - sq), r, 1 + 0.8 * sq, 1 - sq);
  for (const [d, amp] of [[0, 1], [0.14, 0.6]]) { // ripples
    const e = P(t, T.land + d, 1.1);
    if (e > 0 && e < 1) { const rr = 20 + 330 * o3(e); c.beginPath(); c.ellipse(x, 330, rr, rr * 0.14, 0, 0, TAU); stroke(1.2, INK, 0.4 * amp * (1 - e)); }
  }
}

// ================================================================ captions (screen space)
const BELIEFS = [[T.b1, 'credible neutrality'], [T.b2, 'ETH'], [T.b3, 'DeFi'], [T.b4, 'adoption']];
function drawCaptions(t) {
  screen();
  const x0 = 104, y0 = 974, fs = 58, lh = fs * 1.25;
  const clipLine = () => { c.save(); c.beginPath(); c.rect(0, y0 - fs * 1.05, W, fs * 1.4); c.clip(); };
  if (t >= T.b1 && t < T.drop) {
    const pin = (d) => 1 - P(t, T.b1 + d, 0.45, xOut), pout = P(t, T.drop - 0.16, 0.16, i3);
    let k = 0; while (k + 1 < BELIEFS.length && t >= BELIEFS[k + 1][0]) k++;
    const cur = BELIEFS[k][1], prev = k ? BELIEFS[k - 1][1] : null, sw = k ? P(t, BELIEFS[k][0] + 0.03, 0.2, io3) : 1;
    const wWe = measure('We believe ', fs, 300), wSp = measure(' ', fs, 300);
    const wKey = prev ? lerp(measure(prev, fs, 600), measure(cur, fs, 600), sw) : measure(cur, fs, 600);
    clipLine();
    txt('We believe', x0, y0 + lh * (pin(0) - pout), { size: fs, wt: 300 });
    if (prev && sw < 1) { // neither word ever shows under "matters." while it slides
      c.save(); c.beginPath(); c.rect(x0 + wWe, 0, wKey + wSp * 0.6, H); c.clip();
      txt(prev, x0 + wWe, y0 - lh * P(t, BELIEFS[k][0], 0.11, i2), { size: fs, wt: 600 });
      txt(cur, x0 + wWe, y0 + lh * (1 - P(t, BELIEFS[k][0] + 0.05, 0.26, o4)), { size: fs, wt: 600 });
      c.restore();
    } else txt(cur, x0 + wWe, y0 + lh * (pin(0.05) - pout), { size: fs, wt: 600 });
    txt('matters.', x0 + wWe + wKey + wSp, y0 + lh * (pin(0.1) - pout), { size: fs, wt: 300 });
    c.restore();
    // index
    txt(`0${k + 1} / 04`, W - 104, y0, { size: 18, wt: 400, ls: 3, col: MUTED, align: 'right', a: 1 - P(t, T.drop - 0.15, 0.1) });
  }
  if (t >= 9.5 && t < 11.2) {
    const pout = P(t, 11.0, 0.16, i3), w1 = measure('One node ', fs, 600);
    clipLine();
    txt('One node', x0, y0 + lh * (1 - P(t, 9.52, 0.45, xOut) - pout), { size: fs, wt: 600 });
    let x = x0 + w1;
    'in a much larger network.'.split(' ').forEach((wd, i) => {
      txt(wd, x, y0 + lh * (1 - P(t, 10.22 + i * 0.05, 0.4, xOut) - pout), { size: fs, wt: 300 });
      x += measure(wd + ' ', fs, 300);
    });
    c.restore();
  }
}

// ================================================================ frame
function draw(t) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  if (t < T.net) {
    cam(stageCam(t));
    drawPaper(t); drawLine(t); drawBalance(t); drawDiamond(t); drawAMM(t); drawGrid(t); drawCount(t); drawMission(t); drawGlobe(t); drawRed(t);
  } else {
    cam(hcCam(t));
    drawNetwork(t); drawHome(t); drawRedHC(t);
  }
  drawCaptions(t);
  drawMarks(t);
}
function drawMarks(t) { // registration marks: the frame of an instrument
  const a = P(t, T.b1, 0.3) * (1 - P(t, 11.1, 0.3)); if (a <= 0) return;
  const m = 56, l = 22 * P(t, T.b1, 0.35, o3);
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.beginPath(); c.moveTo(x, y + sy * l); c.lineTo(x, y); c.lineTo(x + sx * l, y); stroke(1.2, INK, a);
  }
}
const SHUTTER = 0.5 / FPS; // 180° shutter; more sub-frames where things whip
const subAt = (t) => (!RENDER ? 1 : (t > T.dive + 0.1 && t < 9.75) || (t > T3D && t < T3D + 0.2) || (t > SPLIT[0] - 0.02 && t < SPLIT[8] + 0.1) ? 24 : 12);
function frame(t) {
  TF = t;
  const SUB = subAt(t);
  for (let k = 0; k < SUB; k++) {
    draw(SUB === 1 ? t : clamp(t + SHUTTER * ((k + 0.5) / SUB - 0.5), 0, DURATION - 1e-4));
    octx.globalAlpha = 1 / (k + 1);
    octx.drawImage(cnv, 0, 0);
  }
  octx.globalAlpha = 1;
}
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
window.seek = (t) => { frame(t); return raf2(); };
window.ready = (async () => {
  await Promise.all([300, 400, 600].map((w) => document.fonts.load(`${w} 40px Outfit`)));
  await document.fonts.ready;
  layout();
  DROPS = [];
  for (let i = 0; i < 32; i++) for (let j = 0; j < 16; j++) {
    const f = dotFall(i, j); DROPS.push(f);
    pluck(S2, f.th, f.x, i === RL.i && j === RL.j ? 3 : 0.045, 24);
  }
  Lz.letters.forEach((l) => pluck(S2, l.tl, l.xc, 3.2, 60));
  window.SYNC = { // everything the soundtrack must hit, in seconds (+ x for panning)
    B, T, SPLIT, TW, T3D,
    drops: DROPS.map((f) => [+f.th.toFixed(4), Math.round(f.x)]),
    period: +DROPS[RL.i * 16 + RL.j].th.toFixed(4),
    letters: Lz.letters.map((l) => [+l.tl.toFixed(4), Math.round(l.xc)]),
    globe: GLOBE.nodes.map((n) => +n.t.toFixed(4)), arcs: GLOBE.arcs.map((a) => a.t0),
    net: NET.nodes.slice(1).map((n) => [+(n.ta + 0.1).toFixed(4), Math.round(n.x - NETC.x)]),
    names: Lz.names.map((n, i) => +NAME_T(i).toFixed(4)),
  };
  const q = new URLSearchParams(location.search);
  if (q.has('t')) { frame(+q.get('t')); return; }
  if (!RENDER) {
    const t0 = performance.now();
    const loop = (now) => { frame(((now - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
})();
