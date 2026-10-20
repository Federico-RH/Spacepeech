// lab/plugins/life-engine.js
// Motor puro del juego de la vida de Conway sobre una grilla de bytes (0 = muerta, 1 = viva).

export const SIZE = { W: 40, H: 40 };

export const emptyGrid = (W = SIZE.W, H = SIZE.H) => new Uint8Array(W * H);

/** Una generación. wrap = grilla toroidal. Devuelve la grilla siguiente, los índices que cambiaron y la población. */
export function stepGrid(cells, W = SIZE.W, H = SIZE.H, wrap = true) {
  const next = new Uint8Array(cells.length);
  const changed = [];
  let pop = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (wrap) { nx = (nx + W) % W; ny = (ny + H) % H; } else if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          n += cells[ny * W + nx];
        }
      }
      const i = y * W + x;
      const alive = cells[i] ? n === 2 || n === 3 : n === 3;
      next[i] = alive ? 1 : 0;
      if (alive) pop++;
      if (next[i] !== cells[i]) changed.push(i);
    }
  }
  return { next, changed, pop };
}

export const population = (cells) => cells.reduce((a, c) => a + c, 0);

export function randomGrid(W, H, density, rng = Math.random) {
  const g = emptyGrid(W, H);
  for (let i = 0; i < g.length; i++) g[i] = rng() * 100 < density ? 1 : 0;
  return g;
}

const fromAscii = (rows) => rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [[x, y]] : [])));

export const PATTERNS = {
  glider: { label: "Planeador", cells: fromAscii([".#.", "..#", "###"]) },
  blinker: { label: "Parpadeador", cells: fromAscii(["###"]) },
  pulsar: { label: "Púlsar", cells: fromAscii([
    "..###...###..", ".............", "#....#.#....#", "#....#.#....#", "#....#.#....#", "..###...###..", ".............",
    "..###...###..", "#....#.#....#", "#....#.#....#", "#....#.#....#", ".............", "..###...###.." ]) },
  gun: { label: "Cañón de Gosper", cells: [
    [1, 5], [1, 6], [2, 5], [2, 6],
    [11, 5], [11, 6], [11, 7], [12, 4], [12, 8], [13, 3], [13, 9], [14, 3], [14, 9], [15, 6], [16, 4], [16, 8], [17, 5], [17, 6], [17, 7], [18, 6],
    [21, 3], [21, 4], [21, 5], [22, 3], [22, 4], [22, 5], [23, 2], [23, 6], [25, 1], [25, 2], [25, 6], [25, 7],
    [35, 3], [35, 4], [36, 3], [36, 4] ] },
  rpentomino: { label: "R-pentominó", cells: fromAscii([".##", "##.", ".#."]) },
  acorn: { label: "Bellota", cells: fromAscii([".#.....", "...#...", "##..###"]) },
};

/** Coloca un patrón en la grilla (modifica y devuelve cells). Sin ox/oy lo centra. */
export function stamp(cells, W, H, name, ox, oy) {
  const p = PATTERNS[name];
  if (!p) return cells;
  const maxX = Math.max(...p.cells.map((c) => c[0]));
  const maxY = Math.max(...p.cells.map((c) => c[1]));
  const x0 = ox ?? Math.floor((W - maxX - 1) / 2);
  const y0 = oy ?? Math.floor((H - maxY - 1) / 2);
  for (const [x, y] of p.cells) {
    const xx = x + x0;
    const yy = y + y0;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H) cells[yy * W + xx] = 1;
  }
  return cells;
}
