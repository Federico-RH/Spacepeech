// lab/plugins/VTablePlugin.js
// Plugin de la tabla virtual: una tabla de cientos de miles de filas con solo ~36 filas en el DOM.
// Es la técnica de "ventana + buffer" de los juegos: un scroll con un espaciador del alto total, un conjunto fijo de nodos
// que se reutilizan (buffer circular) y escrituras al DataStore únicamente de las filas que entran en la ventana.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: VTablePlugin }]);
// Opciones:  { base: 'vt', containerId: 'vt-scroll', rows: 500000, rowH: 28, overscan: 6, slots: 36 }
// El framework no tiene evento scroll ni teclado: el plugin se engancha al elemento del contenedor y a `document`
// (solo mientras ese elemento exista en la página).
//
// Acciones:  vt.select { slot, col } · vt.selectCol { col } · vt.selectAll · vt.clear · vt.copy · vt.goto
// Teclado:   flechas (Mayús extiende), Re Pág / Av Pág, Inicio / Fin, Ctrl+A, Ctrl+C, Escape
// Escribe:   <b>.s<N>.{y,cls,c1..c8,k1..k8} · <b>.totalPx · <b>.ui.{window,dom,sel,ms,writes}
import { Events } from "../core/Events.js";
import { COLS, rowCells, statusClass, visibleRange, plan, slotOf, fmt } from "./vtable-engine.js";
import * as S from "./selection.js";

export const VTablePlugin = {
  name: "vtable-plugin",

  async install(app, options = {}) {
    const b = options.base || "vt";
    const ROWS = options.rows || 500000;
    const ROW_H = options.rowH || 28;
    const OVER = options.overscan ?? 6;
    const SLOTS = options.slots || 36;
    const NC = COLS.length;
    const containerId = options.containerId || "vt-scroll";
    const getEl = options.getContainer || (() => (typeof document !== "undefined" ? document.getElementById(containerId) : null));
    const raf = options.raf || ((fn) => window.requestAnimationFrame(fn));
    const now = options.now || (() => performance.now());
    const keyTarget = options.keyTarget || (typeof document !== "undefined" ? document : null);
    const clickTarget = options.clickTarget || keyTarget;
    const ds = app.dataStore;

    const slotRows = new Array(SLOTS).fill(-1);
    const sel = S.createSelection();
    let mods = { shift: false, ctrl: false };
    let writes = 0;
    const shown = {};
    const put = (p, v) => { if (shown[p] !== v) { shown[p] = v; writes++; ds.set(`${b}.${p}`, v); } };

    // ── Dibujo ──────────────────────────────────────────────────────────────
    const cellClass = (row1, c, extra = "") => {
      const a = S.active(sel);
      const state = a && a.r === row1 && a.c === c && S.isSelected(sel, row1, c) ? "act" : S.isSelected(sel, row1, c) ? "sel" : "";
      return `${state} ${extra}`.trim();
    };
    const paintSelection = () => {
      for (let s = 0; s < SLOTS; s++) {
        const r = slotRows[s];
        if (r < 0) continue;
        const cells = rowCells(r);
        for (let c = 1; c <= NC; c++) put(`s${s}.k${c}`, cellClass(r + 1, c, c === 6 ? statusClass(cells[5]) : ""));
      }
      put("ui.sel", S.label(sel));
    };
    const writeRow = (s, r) => {
      const cells = rowCells(r);
      put(`s${s}.y`, r * ROW_H);
      put(`s${s}.cls`, r % 2 ? "odd" : "even");
      for (let c = 1; c <= NC; c++) {
        put(`s${s}.c${c}`, cells[c - 1]);
        put(`s${s}.k${c}`, cellClass(r + 1, c, c === 6 ? statusClass(cells[5]) : ""));
      }
    };

    const update = () => {
      const el = getEl();
      if (!el) return;
      const t0 = now();
      writes = 0;
      const { first, last } = visibleRange(el.scrollTop, el.clientHeight || 560, ROW_H, ROWS, OVER);
      for (const { slot, row } of plan(slotRows, first, last, SLOTS)) { slotRows[slot] = row; writeRow(slot, row); }
      put("totalPx", ROWS * ROW_H);
      put("ui.window", `filas ${fmt(first + 1)} – ${fmt(last + 1)} de ${fmt(ROWS)}`);
      put("ui.dom", `${SLOTS} filas en el DOM (${(100 * SLOTS / ROWS).toFixed(4)} % del total)`);
      put("ui.ms", `${(now() - t0).toFixed(2)} ms`);
      put("ui.writes", `${writes} escrituras`);
    };
    let pending = false;
    const schedule = () => { if (pending) return; pending = true; raf(() => { pending = false; update(); }); };

    // ── Selección ───────────────────────────────────────────────────────────
    const refresh = () => { paintSelection(); put("ui.writes", `${writes} escrituras`); };
    const rowOfSlot = (slot) => slotRows[slot] + 1; // fila 1-based
    const ensureVisible = (row1) => {
      const el = getEl();
      if (!el) return;
      const top = (row1 - 1) * ROW_H;
      const h = el.clientHeight || 560;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_H > el.scrollTop + h) el.scrollTop = top + ROW_H - h;
    };

    const act = (name, fn) => app.actionManager.register(`vt.${name}`, async (params) => { writes = 0; fn(params || {}); refresh(); });
    act("select", ({ slot, col }) => { const r = rowOfSlot(slot); if (r > 0) S.select(sel, r, col, mods); });
    act("selectCol", ({ col }) => S.selectColumn(sel, col, ROWS, mods));
    act("selectAll", () => S.selectAll(sel, ROWS, NC));
    act("clear", () => S.clear(sel));
    app.actionManager.register("vt.copy", async () => {
      const tsv = S.toTSV(sel, (r, c) => rowCells(r - 1)[c - 1], 100000);
      put("ui.sel", tsv === null ? "Rango demasiado grande para copiar (máx. 100.000 celdas)" : `${S.label(sel)} — copiado`);
      if (tsv && typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(tsv);
      return tsv;
    });
    app.actionManager.register("vt.goto", async () => {
      const el = getEl();
      const row = Math.min(ROWS, Math.max(1, Math.floor(Number(ds.get(`${b}.gotoRow`)) || 1)));
      if (el) el.scrollTop = (row - 1) * ROW_H;
      writes = 0; S.select(sel, row, 1); update(); refresh();
    });

    // ── Enganche al DOM (el framework no expone scroll ni teclado) ──────────────
    let attached = null;
    const attach = (tries = 0) => {
      const el = getEl();
      if (!el) { if (tries < 40) setTimeout(() => attach(tries + 1), 50); return; }
      if (attached === el) return;
      attached = el;
      el.addEventListener("scroll", schedule, { passive: true });
      update();
    };

    const onKey = (e) => {
      if (!getEl()) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const mod = e.ctrlKey || e.metaKey;
      const h = Math.max(1, Math.floor(((getEl().clientHeight || 560) / ROW_H) - 1));
      const nav = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], PageDown: [h, 0], PageUp: [-h, 0] }[e.key];
      let handled = true;
      writes = 0;
      if (nav) { const cur = S.move(sel, nav[0], nav[1], ROWS, NC, e.shiftKey); ensureVisible(cur.r); }
      else if (e.key === "Home") { const cur = S.move(sel, 0, -NC, ROWS, NC, e.shiftKey); ensureVisible(cur.r); }
      else if (e.key === "End") { const cur = S.move(sel, 0, NC, ROWS, NC, e.shiftKey); ensureVisible(cur.r); }
      else if (mod && e.key.toLowerCase() === "a") S.selectAll(sel, ROWS, NC);
      else if (mod && e.key.toLowerCase() === "c") copyNow();
      else if (e.key === "Escape") S.clear(sel);
      else handled = false;
      if (handled) { e.preventDefault(); schedule(); refresh(); }
    };
    const copyNow = () => { const tsv = S.toTSV(sel, (r, c) => rowCells(r - 1)[c - 1], 100000); if (tsv && typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(tsv); put("ui.sel", tsv === null ? "Rango demasiado grande para copiar" : `${S.label(sel)} — copiado`); };
    keyTarget?.addEventListener?.("keydown", onKey);
    // Los modificadores (Mayús, Ctrl) se anotan en la fase de captura: la acción del framework corre después, durante el burbujeo.
    // Se escucha en todo el documento para que también valgan en los encabezados, que están fuera del contenedor con scroll.
    clickTarget?.addEventListener?.("click", (e) => { mods = { shift: !!e.shiftKey, ctrl: !!(e.ctrlKey || e.metaKey) }; }, true);

    app.eventBus.on(Events.STATE_CHANGED, () => {
      for (const k of Object.keys(shown)) delete shown[k];
      slotRows.fill(-1);
      attached = null;
      setTimeout(() => attach(), 0);
    });
    attach();
  },
};
