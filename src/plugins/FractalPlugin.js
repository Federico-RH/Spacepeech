// lab/plugins/FractalPlugin.js
// Plugin del Fractal Lab: una grilla de 48×48 celdas (2304 nodos) donde cada celda cambia de color.
// El plugin calcula el fractal y solo escribe en el DataStore las celdas cuyo color cambió (fr.k.<i> = índice 0..63).
// La paleta NO se escribe celda por celda: la grilla lleva una clase (fr.pal) y el CSS define 63 colores por paleta, así que
// cambiar de paleta es una sola escritura que recolorea 2304 nodos.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: FractalPlugin }]);   // opciones: { base: 'fr', n: 48 }
// Lee:       <b>.iter (iteraciones máx.) · <b>.speed (velocidad de animación) · <b>.cycle / <b>.morph (animaciones)
// Acciones:  fractal.mode { name } · fractal.julia { name } · fractal.place { name } · fractal.palette { name }
//            fractal.zoom { factor } · fractal.pan { dx, dy } · fractal.zoomAt { i } · fractal.reset
// Escribe:   <b>.k.<i> · <b>.pal · <b>.modeLabel · <b>.view · <b>.jc · <b>.ui.{cells,ms,fps,wps}
import { Events } from "../core/Events.js";
import { N, MODES, JULIA, PLACES, computeIterations, computeIndices, juliaOrbit, cellToPoint, fmtC, fmtView, colorIndex, sierpinskiIndex } from "./fractal-engine.js";

export const FractalPlugin = {
  name: "fractal-plugin",

  async install(app, options = {}) {
    const b = options.base || "fr";
    const n = options.n || N;
    const ds = app.dataStore;
    const raf = options.raf || ((fn) => window.requestAnimationFrame(fn));
    const now = options.now || (() => performance.now());
    const read = (p, f) => ds.get(`${b}.${p}`) ?? f;

    let mode = "mandelbrot";
    let view = { ...MODES.mandelbrot.view };
    let jc = JULIA.dendrita.c;
    let angle = 0;
    let shift = 0;
    let ox = 0;
    let oy = 0;
    let iterations = null; // se recalcula solo cuando cambia la geometría
    let shown = new Uint8Array(n * n).fill(255);
    let synced = false;
    let writes = 0;

    const maxIter = () => Math.max(5, Math.min(250, Number(read("iter", 40)) || 40));
    const paintCells = (indices) => {
      let changed = 0;
      for (let i = 0; i < indices.length; i++) if (shown[i] !== indices[i]) { shown[i] = indices[i]; ds.set(`${b}.k.${i}`, indices[i]); changed++; writes++; }
      return changed;
    };
    const labels = () => {
      ds.set(`${b}.modeLabel`, MODES[mode].label);
      ds.set(`${b}.view`, mode === "sierpinski" ? `desplazamiento (${ox}, ${oy})` : fmtView(view));
      ds.set(`${b}.jc`, mode === "julia" ? `c = ${fmtC(jc)}` : "");
    };

    // sincroniza con lo que dice el documento (valores iniciales de las celdas) la primera vez
    const sync = () => {
      if (synced) return;
      synced = true;
      for (let i = 0; i < shown.length; i++) { const v = ds.get(`${b}.k.${i}`); shown[i] = Number.isInteger(v) ? v : 255; }
    };

    // geometría nueva → recalcula iteraciones y repinta; solo color → repinta con las iteraciones guardadas
    let tMs = 0;
    const recompute = () => {
      sync();
      const t0 = now();
      if (mode !== "sierpinski") iterations = computeIterations(mode, view, maxIter(), jc, n);
      tMs = now() - t0;
      return repaint();
    };
    const repaint = () => {
      sync();
      const idx = computeIndices({ mode, view, maxIter: maxIter(), jc, shift, n, ox, oy, iterations });
      labels();
      return paintCells(idx);
    };
    const report = (changed) => {
      ds.set(`${b}.ui.cells`, `${changed} celdas cambian`);
      ds.set(`${b}.ui.ms`, `${tMs.toFixed(1)} ms de cálculo`);
    };

    // ── Animación (ciclo de paleta y/o morph de Julia) ─────────────────────
    let running = false;
    let last = 0;
    let frames = 0;
    let fpsStart = 0;
    let wStart = 0;
    const loop = () => {
      if (!running) return;
      const t = now();
      if (t - last >= 33) {
        last = t;
        const speed = Math.max(1, Number(read("speed", 30)) || 30);
        let changed;
        if (read("morph", false) && mode === "julia") {
          angle += 0.004 * speed;
          jc = juliaOrbit(angle);
          changed = recompute();
        } else if (read("cycle", false)) {
          shift += speed / 15;
          changed = repaint();
        } else { running = false; return; }
        if (read("cycle", false) && read("morph", false) && mode === "julia") shift += speed / 15; // ambos a la vez
        report(changed);
        frames++;
        if (t - fpsStart >= 1000) {
          ds.set(`${b}.ui.fps`, `${frames} fps`);
          ds.set(`${b}.ui.wps`, `${writes - wStart} escrituras/s`);
          frames = 0; wStart = writes; fpsStart = t;
        }
      }
      raf(loop);
    };
    const kick = () => { if (running) return; running = true; last = 0; frames = 0; fpsStart = now(); wStart = writes; raf(loop); };

    // ── Acciones ────────────────────────────────────────────────────────────
    const act = (name, fn) => app.actionManager.register(`fractal.${name}`, async (p) => { const changed = fn(p || {}); report(changed); });
    act("mode", ({ name }) => {
      if (!MODES[name]) return 0;
      mode = name; view = { ...MODES[name].view }; ox = 0; oy = 0;
      return recompute();
    });
    act("julia", ({ name }) => { if (!JULIA[name]) return 0; mode = "julia"; jc = JULIA[name].c; view = { ...MODES.julia.view }; return recompute(); });
    act("place", ({ name }) => {
      const p = PLACES[name];
      if (!p) return 0;
      mode = p.mode; view = { cx: p.cx, cy: p.cy, half: p.half };
      ds.set(`${b}.iter`, p.iter);
      return recompute();
    });
    act("zoom", ({ factor = 0.5 }) => { if (mode === "sierpinski") return 0; view.half = Math.min(4, Math.max(1e-13, view.half * Number(factor))); return recompute(); });
    act("pan", ({ dx = 0, dy = 0 }) => {
      if (mode === "sierpinski") { ox = Math.max(0, ox + Math.round(dx * 4)); oy = Math.max(0, oy - Math.round(dy * 4)); return repaint(); }
      view.cx += dx * view.half; view.cy += dy * view.half; return recompute();
    });
    act("zoomAt", ({ i }) => {
      if (mode === "sierpinski") return 0;
      const [x, y] = cellToPoint(i % n, Math.floor(i / n), view, n);
      view = { cx: x, cy: y, half: Math.max(1e-13, view.half * 0.5) };
      return recompute();
    });
    act("reset", () => { mode = "mandelbrot"; view = { ...MODES.mandelbrot.view }; ox = oy = 0; shift = 0; ds.set(`${b}.iter`, 40); return recompute(); });
    app.actionManager.register("fractal.palette", async ({ name }) => { ds.set(`${b}.pal`, `pal-${name}`); });

    // ── Observación de cambios ──────────────────────────────────────────────
    let timer = null;
    app.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      if (typeof path !== "string" || !path.startsWith(`${b}.`)) return;
      const p = path.slice(b.length + 1);
      if (p === "cycle" || p === "morph" || p === "speed") { if (read("cycle", false) || read("morph", false)) kick(); }
      else if (p === "iter" && mode !== "sierpinski") { clearTimeout(timer); timer = setTimeout(() => report(recompute()), 60); }
    });
    app.eventBus.on(Events.STATE_CHANGED, () => { synced = false; shown.fill(255); setTimeout(() => { sync(); labels(); }, 0); });
  },
};
