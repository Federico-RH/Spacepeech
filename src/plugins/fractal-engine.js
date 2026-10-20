// lab/plugins/fractal-engine.js
// Motor puro del Fractal Lab: conjuntos de escape-time y el triángulo de Sierpinski sobre una grilla de N×N celdas.
// Cada celda termina con un índice de color 0..63 (0 = "adentro", 1..63 = posición en la paleta).

export const N = 48;
export const PAL = 64;

export const MODES = {
  mandelbrot: { label: "Mandelbrot", view: { cx: -0.5, cy: 0, half: 1.6 } },
  julia: { label: "Julia", view: { cx: 0, cy: 0, half: 1.6 } },
  ship: { label: "Burning Ship", view: { cx: -0.45, cy: -0.5, half: 1.9 } },
  tricorn: { label: "Tricorn", view: { cx: -0.2, cy: 0, half: 1.9 } },
  sierpinski: { label: "Sierpinski", view: { cx: 0, cy: 0, half: 1 } },
};

export const JULIA = {
  dendrita: { label: "Dendrita", c: [-0.8, 0.156] },
  conejo: { label: "Conejo", c: [-0.123, 0.745] },
  galaxia: { label: "Galaxia", c: [-0.4, 0.6] },
  nieve: { label: "Copo", c: [0.285, 0.01] },
};

export const PLACES = {
  completo: { label: "Completo", mode: "mandelbrot", cx: -0.5, cy: 0, half: 1.6, iter: 40 },
  caballitos: { label: "Valle de los caballitos", mode: "mandelbrot", cx: -0.7436, cy: 0.1318, half: 0.012, iter: 90 },
  elefantes: { label: "Valle de los elefantes", mode: "mandelbrot", cx: 0.275, cy: 0, half: 0.06, iter: 70 },
  mini: { label: "Mini-Mandelbrot", mode: "mandelbrot", cx: -1.7497, cy: 0, half: 0.03, iter: 80 },
};

/** Iteraciones hasta escapar (maxIter si no escapa) para el punto (x, y). */
export function escapeTime(mode, x, y, maxIter, jc = [0, 0]) {
  let zr;
  let zi;
  let cr;
  let ci;
  if (mode === "julia") { zr = x; zi = y; [cr, ci] = jc; } else { zr = 0; zi = 0; cr = x; ci = y; }
  let i = 0;
  while (i < maxIter && zr * zr + zi * zi <= 4) {
    let a = zr;
    let b = zi;
    if (mode === "ship") { a = Math.abs(a); b = Math.abs(b); }
    else if (mode === "tricorn") b = -b;
    zr = a * a - b * b + cr;
    zi = 2 * a * b + ci;
    i++;
  }
  return i;
}

/** Coordenada compleja del centro de la celda (col i, fila j); la fila 0 queda arriba. */
export const cellToPoint = (i, j, { cx, cy, half }, n = N) => [cx + ((i + 0.5) / n - 0.5) * 2 * half, cy - ((j + 0.5) / n - 0.5) * 2 * half];

/** Iteraciones de toda la grilla (para los modos de escape). */
export function computeIterations(mode, view, maxIter, jc, n = N) {
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, y] = cellToPoint(i, j, view, n);
      out[j * n + i] = escapeTime(mode, x, y, maxIter, jc);
    }
  }
  return out;
}

/** Índice de color 0..63 a partir de las iteraciones; shift rota la paleta. */
export const colorIndex = (iter, maxIter, shift = 0) => (iter >= maxIter ? 0 : 1 + ((iter * 3 + Math.floor(shift)) % (PAL - 1)));

/** Sierpinski (triángulo de Pascal módulo 2): una celda está "viva" si x AND y = 0. ox/oy desplazan la ventana. */
export const sierpinskiIndex = (i, j, shift = 0, ox = 0, oy = 0) => ((i + ox) & (j + oy)) === 0 ? 1 + (((i + ox) + (j + oy) + Math.floor(shift)) % (PAL - 1)) : 0;

export function computeIndices({ mode, view, maxIter, jc, shift = 0, n = N, ox = 0, oy = 0, iterations = null }) {
  const out = new Uint8Array(n * n);
  if (mode === "sierpinski") {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = sierpinskiIndex(i, j, shift, ox, oy);
    return out;
  }
  const it = iterations || computeIterations(mode, view, maxIter, jc, n);
  for (let k = 0; k < out.length; k++) out[k] = colorIndex(it[k], maxIter, shift);
  return out;
}

export const juliaOrbit = (angle, r = 0.7885) => [r * Math.cos(angle), r * Math.sin(angle)];

export const fmtC = ([re, im]) => `${re.toFixed(3)} ${im < 0 ? "−" : "+"} ${Math.abs(im).toFixed(3)}i`;
export const fmtView = ({ cx, cy, half }) => `centro ${cx.toFixed(5)} ${cy < 0 ? "−" : "+"} ${Math.abs(cy).toFixed(5)}i · ancho ${(2 * half).toPrecision(3)}`;
