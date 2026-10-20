// lab/plugins/vtable-engine.js
// Motor puro de la tabla virtual: datos generados por índice, ventana de filas visibles y buffer circular de nodos.

export const COLS = [
  { key: "n", title: "#", w: 84, num: true },
  { key: "name", title: "Nombre", w: 170 },
  { key: "city", title: "Ciudad", w: 130 },
  { key: "qty", title: "Cantidad", w: 100, num: true },
  { key: "price", title: "Precio", w: 110, num: true },
  { key: "status", title: "Estado", w: 100 },
  { key: "date", title: "Fecha", w: 120 },
  { key: "hash", title: "Hash", w: 110 },
];

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Facundo", "Gabriela", "Hugo", "Inés", "Julián", "Karina", "Lucas", "Marta", "Nicolás", "Olivia", "Pablo", "Quimey", "Rocío", "Sofía", "Tomás"];
const LAST = ["Acosta", "Benítez", "Castro", "Díaz", "Espósito", "Fernández", "Gómez", "Herrera", "Ibarra", "Juárez", "Luna", "Molina", "Núñez", "Ortiz", "Pereyra", "Quiroga", "Ramos", "Silva", "Torres", "Vega"];
const CITIES = ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "Salta", "Tucumán", "Neuquén", "La Plata", "Bariloche", "Mar del Plata"];
const BASE_DATE = Date.UTC(2020, 0, 1);

/** Hash entero de 32 bits (finalizador de murmur3): barato y determinista. */
export function hash32(i) {
  let h = (i + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Celdas (strings) de la fila i0 (0-based). Se calculan al vuelo: no hay datos guardados. */
export function rowCells(i0) {
  const h = hash32(i0);
  const status = (h >>> 5) % 10;
  return [
    String(i0 + 1),
    `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`,
    CITIES[(h >>> 16) % CITIES.length],
    String((h % 997) + 1),
    `$ ${(((h >>> 3) % 1000000) / 100).toFixed(2)}`,
    status < 7 ? "OK" : status < 9 ? "WARN" : "FAIL",
    new Date(BASE_DATE + (h % 2000) * 86400000).toISOString().slice(0, 10),
    h.toString(16).padStart(8, "0"),
  ];
}

export const statusClass = (text) => (text === "OK" ? "st-ok" : text === "WARN" ? "st-warn" : text === "FAIL" ? "st-fail" : "");

/** Rango de filas (0-based, inclusivo) que hay que tener en el DOM, con margen (overscan) arriba y abajo. */
export function visibleRange(scrollTop, viewportH, rowH, total, overscan = 6) {
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(total - 1, Math.ceil((scrollTop + viewportH) / rowH) + overscan);
  return { first, last };
}

/** Buffer circular: la fila r siempre usa el nodo r % slots, así al desplazar solo se reescriben las filas que entran. */
export const slotOf = (row, slots) => row % slots;

/** Qué nodos hay que reescribir para mostrar first..last, dado qué fila tiene cada nodo ahora. */
export function plan(slotRows, first, last, slots) {
  const out = [];
  for (let r = first; r <= last; r++) {
    const s = slotOf(r, slots);
    if (slotRows[s] !== r) out.push({ slot: s, row: r });
  }
  return out;
}

export const fmt = (n) => Math.round(n).toLocaleString("es-AR");
