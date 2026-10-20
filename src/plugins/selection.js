// lab/plugins/selection.js
// Modelo de selección de una grilla (filas y columnas 1-based), sin DOM: clic, Mayús (rango), Ctrl/Cmd (suma),
// columnas y filas completas, conteo de celdas únicas y copia como TSV. Lo usan VTablePlugin y TableSelectPlugin.

export const createSelection = () => ({ anchor: null, rects: [] });

const norm = (r0, c0, r1, c1) => ({ r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) });
const inRect = (q, r, c) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1;
const same = (a, b) => a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1;

/** Clic sobre una celda. mods = { shift, ctrl }. */
export function select(sel, r, c, mods = {}) {
  if (mods.shift && sel.anchor) {
    const last = norm(sel.anchor.r, sel.anchor.c, r, c);
    if (sel.rects.length) sel.rects[sel.rects.length - 1] = last; else sel.rects.push(last);
  } else if (mods.ctrl) {
    const single = norm(r, c, r, c);
    const at = sel.rects.findIndex((q) => same(q, single));
    if (at >= 0) sel.rects.splice(at, 1); else sel.rects.push(single); // Ctrl sobre una celda ya elegida la quita
    sel.anchor = { r, c };
  } else {
    sel.rects = [norm(r, c, r, c)];
    sel.anchor = { r, c };
  }
  return sel;
}

export function selectColumn(sel, c, rows, mods = {}) {
  const q = norm(1, c, rows, c);
  if (mods.ctrl) sel.rects.push(q); else sel.rects = [q];
  sel.anchor = { r: 1, c };
  return sel;
}

export function selectRow(sel, r, cols, mods = {}) {
  const q = norm(r, 1, r, cols);
  if (mods.ctrl) sel.rects.push(q); else sel.rects = [q];
  sel.anchor = { r, c: 1 };
  return sel;
}

export function selectAll(sel, rows, cols) {
  sel.rects = [norm(1, 1, rows, cols)];
  sel.anchor = { r: 1, c: 1 };
  return sel;
}

export const clear = (sel) => { sel.rects = []; sel.anchor = null; return sel; };

export const isSelected = (sel, r, c) => sel.rects.some((q) => inRect(q, r, c));

/** La celda "activa" es la última tocada (anchor); se usa para el foco y para moverse con el teclado. */
export const active = (sel) => sel.anchor;

/** Cantidad de celdas únicas (unión de rectángulos, sin recorrer celda por celda). */
export function count(sel) {
  const rs = sel.rects;
  if (!rs.length) return 0;
  const xs = [...new Set(rs.flatMap((q) => [q.r0, q.r1 + 1]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i], xs[i + 1]];
    // columnas cubiertas por algún rectángulo que contenga esta franja de filas
    const spans = rs.filter((q) => q.r0 <= a && q.r1 + 1 >= b).map((q) => [q.c0, q.c1 + 1]).sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let end = -Infinity;
    for (const [s, e] of spans) { const from = Math.max(s, end); if (e > from) covered += e - from; end = Math.max(end, e); }
    total += (b - a) * covered;
  }
  return total;
}

export const colLetter = (c) => { let s = ""; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** "B3:D7" o "B3" para un rectángulo. */
export const rectLabel = (q) => (q.r0 === q.r1 && q.c0 === q.c1 ? `${colLetter(q.c0)}${q.r0}` : `${colLetter(q.c0)}${q.r0}:${colLetter(q.c1)}${q.r1}`);

export function label(sel) {
  if (!sel.rects.length) return "Sin selección";
  const n = count(sel);
  const last = sel.rects[sel.rects.length - 1];
  const extra = sel.rects.length > 1 ? ` (+${sel.rects.length - 1} rango${sel.rects.length > 2 ? "s" : ""})` : "";
  return `${rectLabel(last)}${extra} · ${n.toLocaleString("es-AR")} celda${n === 1 ? "" : "s"}`;
}

/** Texto separado por tabulaciones del último rango (como copia una planilla). getCell(r, c) devuelve el texto de la celda. */
export function toTSV(sel, getCell, maxCells = 200000) {
  const q = sel.rects[sel.rects.length - 1];
  if (!q) return "";
  if ((q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1) > maxCells) return null; // demasiado grande para copiar
  const lines = [];
  for (let r = q.r0; r <= q.r1; r++) {
    const cells = [];
    for (let c = q.c0; c <= q.c1; c++) cells.push(String(getCell(r, c) ?? "").replace(/[\t\r\n]+/g, " "));
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/** Mueve la celda activa con el teclado; con shift extiende el rango. Devuelve la nueva celda activa. */
export function move(sel, dr, dc, rows, cols, shift = false) {
  const a = sel.anchor || { r: 1, c: 1 };
  const cur = shift && sel.rects.length ? sel.focus || a : a;
  const r = Math.min(rows, Math.max(1, cur.r + dr));
  const c = Math.min(cols, Math.max(1, cur.c + dc));
  if (shift) {
    const q = norm(a.r, a.c, r, c);
    if (sel.rects.length) sel.rects[sel.rects.length - 1] = q; else sel.rects.push(q);
    sel.focus = { r, c };
  } else {
    sel.rects = [norm(r, c, r, c)];
    sel.anchor = { r, c };
    sel.focus = null;
  }
  return { r, c };
}
