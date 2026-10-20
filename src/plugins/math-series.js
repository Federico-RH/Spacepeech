// lab/plugins/math-series.js
// Funciones puras (sin dependencias) que calculan las curvas del Math Lab.
// Devuelve cadenas "x,y x,y ..." listas para el atributo `points` de un <polyline> SVG de 640x360.

const W = 640;
const H = 360;
const L = 24;
const T = 16;
const PW = 600; // ancho útil
const PH = 320; // alto útil

const f1 = (n) => (Math.round(n * 10) / 10).toString();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pts = (arr) => arr.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

// Mapea un rango de datos al área útil del gráfico (con el eje Y hacia arriba).
function box(x0, x1, y0, y1) {
  return (x, y) => [
    L + ((x - x0) / (x1 - x0)) * PW,
    clamp(T + (1 - (y - y0) / (y1 - y0)) * PH, T, T + PH),
  ];
}

// Mapa con proporción 1:1, centrado, para curvas paramétricas en [-1.1, 1.1].
function square(span = 1.1) {
  const s = Math.min(PW, PH) / (2 * span);
  const cx = L + PW / 2;
  const cy = T + PH / 2;
  return (x, y) => [cx + x * s, cy - y * s];
}

function sampleFunction(x0, x1, count, fn) {
  const out = [];
  for (let i = 0; i <= count; i++) {
    const x = x0 + ((x1 - x0) * i) / count;
    out.push([x, fn(x)]);
  }
  return out;
}

function stats(approx, ref) {
  let sq = 0;
  let max = 0;
  for (let i = 0; i < approx.length; i++) {
    const e = Math.abs(approx[i][1] - ref[i][1]);
    sq += e * e;
    if (e > max) max = e;
  }
  return { rms: Math.sqrt(sq / approx.length), max };
}

const TWO_PI = Math.PI * 2;

// ─── Series ────────────────────────────────────────────────────────────────

function fourierSquare(n) {
  const [x0, x1] = [-TWO_PI, TWO_PI];
  const refFn = (x) => Math.sign(Math.sin(x));
  const apFn = (x) => {
    let s = 0;
    for (let k = 1; k <= n; k++) s += Math.sin((2 * k - 1) * x) / (2 * k - 1);
    return (4 / Math.PI) * s;
  };
  const ref = sampleFunction(x0, x1, 600, refFn);
  const ap = sampleFunction(x0, x1, 600, apFn);
  const m = box(x0, x1, -1.6, 1.6);
  const e = stats(ap, ref);
  return {
    main: pts(ap.map(([x, y]) => m(x, y))),
    ref: pts(ref.map(([x, y]) => m(x, y))),
    info: `Onda cuadrada · ${n} término(s) impar(es) · RMS ${e.rms.toFixed(3)} · error máx ${e.max.toFixed(2)} (fenómeno de Gibbs) · x ∈ [−2π, 2π]`,
  };
}

function fourierSaw(n) {
  const [x0, x1] = [-TWO_PI, TWO_PI];
  const refFn = (x) => {
    const r = ((((x + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
    return r / Math.PI;
  };
  const apFn = (x) => {
    let s = 0;
    for (let k = 1; k <= n; k++) s += (k % 2 ? 1 : -1) * (Math.sin(k * x) / k);
    return (2 / Math.PI) * s;
  };
  const ref = sampleFunction(x0, x1, 600, refFn);
  const ap = sampleFunction(x0, x1, 600, apFn);
  const m = box(x0, x1, -1.6, 1.6);
  const e = stats(ap, ref);
  return {
    main: pts(ap.map(([x, y]) => m(x, y))),
    ref: pts(ref.map(([x, y]) => m(x, y))),
    info: `Diente de sierra · ${n} armónico(s) · RMS ${e.rms.toFixed(3)} · error máx ${e.max.toFixed(2)} · x ∈ [−2π, 2π]`,
  };
}

function taylorSin(n) {
  const [x0, x1] = [-TWO_PI, TWO_PI];
  const apFn = (x) => {
    let term = x;
    let s = term;
    for (let k = 0; k < n - 1; k++) {
      term = (-term * x * x) / ((2 * k + 2) * (2 * k + 3));
      s += term;
    }
    return s;
  };
  const ref = sampleFunction(x0, x1, 600, Math.sin);
  const ap = sampleFunction(x0, x1, 600, apFn);
  const m = box(x0, x1, -2.2, 2.2);
  const e = stats(ap.map(([x, y]) => [x, clamp(y, -4, 4)]), ref);
  return {
    main: pts(ap.map(([x, y]) => m(x, y))),
    ref: pts(ref.map(([x, y]) => m(x, y))),
    info: `Taylor de sin(x) · ${n} término(s), grado ${2 * n - 1} · RMS ${e.rms.toFixed(3)} · la aproximación diverge lejos del origen · x ∈ [−2π, 2π]`,
  };
}

function lissajous(a, b, phaseDeg) {
  const ph = (phaseDeg * Math.PI) / 180;
  const m = square(1.1);
  const arr = [];
  const count = 1400;
  for (let i = 0; i <= count; i++) {
    const t = (TWO_PI * i) / count;
    arr.push(m(Math.sin(a * t + ph), Math.sin(b * t)));
  }
  return {
    main: pts(arr),
    ref: "",
    info: `Lissajous · x = sin(${a}t + ${Math.round(phaseDeg)}°), y = sin(${b}t) · ${a}:${b}`,
  };
}

function lorenz(n) {
  const steps = n * 60;
  const dt = 0.01;
  const [s, r, bb] = [10, 28, 8 / 3];
  const d = ([x, y, z]) => [s * (y - x), x * (r - z) - y, x * y - bb * z];
  let p = [1, 1, 1];
  const arr = [];
  const m = box(-26, 26, 0, 52);
  for (let i = 0; i < steps + 200; i++) {
    const k1 = d(p);
    const k2 = d(p.map((v, j) => v + (dt / 2) * k1[j]));
    const k3 = d(p.map((v, j) => v + (dt / 2) * k2[j]));
    const k4 = d(p.map((v, j) => v + dt * k3[j]));
    p = p.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (i >= 200 && i % 2 === 0) arr.push(m(p[0], p[2]));
  }
  return {
    main: pts(arr),
    ref: "",
    info: `Atractor de Lorenz (σ=10, ρ=28, β=8/3) · RK4, ${steps} pasos con dt=0.01 · proyección x–z`,
  };
}

function collatz(n) {
  const start = n * 27;
  const seq = [start];
  let v = start;
  while (v !== 1 && seq.length < 2000) {
    v = v % 2 === 0 ? v / 2 : 3 * v + 1;
    seq.push(v);
  }
  const peak = Math.max(...seq);
  const m = box(0, Math.max(1, seq.length - 1), 0, Math.log10(peak) * 1.08);
  return {
    main: pts(seq.map((val, i) => m(i, Math.log10(val)))),
    ref: "",
    info: `Collatz desde ${start} · ${seq.length - 1} pasos · máximo ${peak} · eje Y en escala log10`,
  };
}

// ─── API ───────────────────────────────────────────────────────────────────

/**
 * @param {{fn:string,n:number,a:number,b:number,phase:number}} input
 * @returns {{main:string, ref:string, info:string}}
 */
export function computeCurve(input = {}) {
  const n = clamp(Math.round(Number(input.n) || 1), 1, 50);
  const a = clamp(Math.round(Number(input.a) || 1), 1, 9);
  const b = clamp(Math.round(Number(input.b) || 1), 1, 9);
  const phase = Number(input.phase) || 0;
  switch (input.fn) {
    case "fourier-saw": return fourierSaw(n);
    case "taylor-sin": return taylorSin(n);
    case "lissajous": return lissajous(a, b, phase);
    case "lorenz": return lorenz(n);
    case "collatz": return collatz(n);
    case "fourier-square":
    default: return fourierSquare(n);
  }
}

export const CHART = { W, H, L, T, PW, PH };
