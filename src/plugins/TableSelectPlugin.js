// lab/plugins/TableSelectPlugin.js
// Selección de celdas, filas y columnas en tablas GENERADAS por el Renderer (data.headers / data.rows / data.matrix).
//
// Esas tablas crean <tr>/<td> sin id, y el Renderer solo despacha acciones por id de nodo; además no escucha teclado ni
// entrega los modificadores del clic. Este plugin se engancha al documento: escucha el clic sobre cualquier
// `table.selectable`, calcula fila y columna desde el DOM y mantiene la selección con el modelo de selection.js.
//
// Uso en el documento: una tabla con la clase "selectable" y un id (el id es la clave de los datos):
//   { "id": "ventas", "type": "table", "class": "selectable", "data": { "headers": [...], "rows": [[...]] } }
// Registro:  spacepeechInit('canvas', config, [{ plugin: TableSelectPlugin }]);   // opciones: { base: 'tsel', selector }
// Escribe:   <base>.<id>.{label,count,last,active,text}
// Acciones:  table.copy { id } · table.clear { id } · table.selectAll { id }
// Estilo:    el plugin marca las celdas con las clases sp-sel (en la selección) y sp-act (celda activa);
//            se vuelven a marcar solas si la tabla se vuelve a generar (MutationObserver).
// Mouse:     click = celda · Mayús+click = rango · Ctrl/Cmd+click = sumar · click en encabezado = columna
// Teclado:   flechas (Mayús extiende) · Ctrl+A · Ctrl+C · Escape
import * as S from "./selection.js";

export const TableSelectPlugin = {
  name: "table-select-plugin",

  async install(app, options = {}) {
    const b = options.base || "tsel";
    const selector = options.selector || "table.selectable";
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    const ds = app.dataStore;
    const entries = new Map(); // id -> { table, sel, observer }
    let current = null; // id de la tabla con la que se interactuó por última vez

    const bodyRows = (t) => [...(t.tBodies[0]?.rows || [])];
    const dims = (t) => { const rows = bodyRows(t); return { rows: rows.length, cols: Math.max(0, ...rows.map((r) => r.cells.length)) }; };
    const cellText = (t, r, c) => bodyRows(t)[r - 1]?.cells[c - 1]?.textContent ?? "";

    const paint = (entry) => {
      const { table, sel } = entry;
      const a = S.active(sel);
      bodyRows(table).forEach((tr, ri) => {
        [...tr.cells].forEach((td, ci) => {
          const on = S.isSelected(sel, ri + 1, ci + 1);
          td.classList.toggle("sp-sel", on);
          td.classList.toggle("sp-act", on && !!a && a.r === ri + 1 && a.c === ci + 1);
        });
      });
    };

    const publish = (id, entry) => {
      const { table, sel } = entry;
      const q = sel.rects[sel.rects.length - 1];
      const a = S.active(sel);
      ds.set(`${b}.${id}.label`, S.label(sel));
      ds.set(`${b}.${id}.count`, S.count(sel));
      ds.set(`${b}.${id}.last`, q ? S.rectLabel(q) : "");
      ds.set(`${b}.${id}.active`, a ? `${S.colLetter(a.c)}${a.r}` : "");
      ds.set(`${b}.${id}.text`, a ? cellText(table, a.r, a.c) : "");
    };
    const refresh = (id) => { const e = entries.get(id); if (e) { paint(e); publish(id, e); } };

    const entryFor = (table) => {
      const id = table.id || "table";
      let e = entries.get(id);
      if (!e || e.table !== table) {
        e?.observer?.disconnect();
        e = { table, sel: S.createSelection(), observer: null };
        const Obs = (doc.defaultView || globalThis).MutationObserver;
        if (Obs) { e.observer = new Obs(() => paint(e)); e.observer.observe(table, { childList: true, subtree: true }); }
        entries.set(id, e);
      }
      return { id, entry: e };
    };

    // ── Mouse ───────────────────────────────────────────────────────────────
    doc.addEventListener("click", (ev) => {
      const cell = ev.target?.closest?.("td, th");
      const table = cell?.closest?.(selector);
      if (!table) return;
      const { id, entry } = entryFor(table);
      current = id;
      const { rows, cols } = dims(table);
      const mods = { shift: !!ev.shiftKey, ctrl: !!(ev.ctrlKey || ev.metaKey) };
      const ci = cell.cellIndex + 1;
      if (cell.tagName === "TH" && cell.closest("thead")) S.selectColumn(entry.sel, ci, rows, mods);
      else if (cell.closest("tbody")) S.select(entry.sel, cell.parentElement.sectionRowIndex + 1, ci, mods);
      else return;
      refresh(id);
    });

    // ── Teclado ─────────────────────────────────────────────────────────────
    doc.addEventListener("keydown", (e) => {
      const entry = current && entries.get(current);
      if (!entry || !entry.table.isConnected) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const { rows, cols } = dims(entry.table);
      const mod = e.ctrlKey || e.metaKey;
      const nav = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
      let handled = true;
      if (nav) S.move(entry.sel, nav[0], nav[1], rows, cols, e.shiftKey);
      else if (mod && e.key.toLowerCase() === "a") S.selectAll(entry.sel, rows, cols);
      else if (mod && e.key.toLowerCase() === "c") copy(current);
      else if (e.key === "Escape") S.clear(entry.sel);
      else handled = false;
      if (handled) { e.preventDefault(); refresh(current); }
    });

    // ── Acciones ────────────────────────────────────────────────────────────
    const copy = async (id) => {
      const e = entries.get(id);
      if (!e) return null;
      const tsv = S.toTSV(e.sel, (r, c) => cellText(e.table, r, c));
      const nav = doc.defaultView?.navigator || globalThis.navigator;
      if (tsv && nav?.clipboard) await nav.clipboard.writeText(tsv);
      ds.set(`${b}.${id}.label`, `${S.label(e.sel)}${tsv ? " — copiado" : ""}`);
      return tsv;
    };
    const idOf = (p) => p?.id || current;
    app.actionManager.register("table.copy", async (p) => copy(idOf(p)));
    app.actionManager.register("table.clear", async (p) => { const e = entries.get(idOf(p)); if (e) { S.clear(e.sel); refresh(idOf(p)); } });
    app.actionManager.register("table.selectAll", async (p) => {
      const e = entries.get(idOf(p));
      if (e) { const { rows, cols } = dims(e.table); S.selectAll(e.sel, rows, cols); refresh(idOf(p)); }
    });
  },
};
