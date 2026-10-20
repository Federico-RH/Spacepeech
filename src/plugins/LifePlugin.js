// lab/plugins/LifePlugin.js
// Plugin del Life Lab: el juego de la vida sobre una grilla de 40×40 (1600 nodos con binding de clase).
// La grilla vive en el plugin; el DataStore guarda solo la vista (life.g.<índice> = "on" | "off") y se escriben únicamente
// las celdas que cambian en cada generación. Es una prueba de cuántas actualizaciones de nodos por segundo aguanta el framework.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: LifePlugin }]);   // opciones: { base: 'life', width: 40, height: 40 }
// Acciones:  life.toggle { i } · life.step · life.play · life.random · life.clear · life.preset { name }
// Lee:       <b>.speed (generaciones/s) · <b>.density (% para "aleatorio") · <b>.wrap (grilla toroidal)
// Escribe:   <b>.g.<i> · <b>.gen · <b>.pop · <b>.changed · <b>.ms · <b>.fps · <b>.ui.{play}
import { Events } from "../core/Events.js";
import { SIZE, emptyGrid, stepGrid, population, randomGrid, stamp, PATTERNS } from "./life-engine.js";

export const LifePlugin = {
  name: "life-plugin",

  async install(app, options = {}) {
    const b = options.base || "life";
    const W = options.width || SIZE.W;
    const H = options.height || SIZE.H;
    const ds = app.dataStore;
    const raf = options.raf || ((fn) => window.requestAnimationFrame(fn));
    const now = options.now || (() => performance.now());
    const rng = options.rng || Math.random;

    let cells = emptyGrid(W, H);
    let shown = new Uint8Array(W * H).fill(2); // 2 = todavía no escrito
    let synced = false;
    let gen = 0;
    const read = (p, f) => ds.get(`${b}.${p}`) ?? f;

    const writeCell = (i) => {
      if (shown[i] === cells[i]) return;
      shown[i] = cells[i];
      ds.set(`${b}.g.${i}`, cells[i] ? "on" : "off");
    };
    const writeStats = (changedCount) => {
      ds.set(`${b}.gen`, gen);
      ds.set(`${b}.pop`, population(cells));
      ds.set(`${b}.changed`, changedCount);
    };
    // La primera vez toma como verdad lo que dice el documento (patrón inicial del JSON).
    const sync = () => {
      if (synced) return;
      synced = true;
      for (let i = 0; i < cells.length; i++) { cells[i] = ds.get(`${b}.g.${i}`) === "on" ? 1 : 0; shown[i] = cells[i]; }
    };
    const repaint = () => { for (let i = 0; i < cells.length; i++) writeCell(i); };

    // ── Simulación ─────────────────────────────────────────────────────────
    const msSamples = [];
    const advance = () => {
      sync();
      const t0 = now();
      const { next, changed } = stepGrid(cells, W, H, read("wrap", true) !== false);
      cells = next;
      gen++;
      for (const i of changed) writeCell(i);
      writeStats(changed.length);
      msSamples.push(now() - t0);
      if (msSamples.length > 20) msSamples.shift();
      ds.set(`${b}.ms`, `${(msSamples.reduce((a, c) => a + c, 0) / msSamples.length).toFixed(1)} ms/gen`);
    };

    let running = false;
    let last = 0;
    let acc = 0;
    let frames = 0;
    let fpsStart = 0;
    const loop = () => {
      if (!running) return;
      const t = now();
      acc += ((t - last) / 1000) * Math.max(1, Number(read("speed", 12)) || 12);
      last = t;
      let n = 0;
      while (acc >= 1 && n < 4) { advance(); acc -= 1; n++; } // como máximo 4 generaciones por cuadro
      if (acc > 4) acc = 0;
      frames++;
      if (t - fpsStart >= 1000) { ds.set(`${b}.fps`, `${frames} fps`); frames = 0; fpsStart = t; }
      raf(loop);
    };
    const setPlaying = (on) => {
      running = on;
      ds.set(`${b}.ui.play`, on ? "⏸ Pausar" : "▶ Iniciar");
      if (on) { sync(); last = now(); fpsStart = last; frames = 0; acc = 0; raf(loop); } else ds.set(`${b}.fps`, "—");
    };

    // ── Acciones ───────────────────────────────────────────────────────────
    const act = (name, fn) => app.actionManager.register(`life.${name}`, async (params) => fn(params || {}));
    act("play", () => setPlaying(!running));
    act("step", () => advance());
    act("toggle", ({ i }) => { sync(); cells[i] = cells[i] ? 0 : 1; writeCell(i); writeStats(1); });
    act("clear", () => { sync(); cells = emptyGrid(W, H); gen = 0; repaint(); writeStats(0); });
    act("random", () => { sync(); cells = randomGrid(W, H, Number(read("density", 30)) || 30, rng); gen = 0; repaint(); writeStats(0); });
    act("preset", ({ name }) => {
      if (!PATTERNS[name]) return;
      sync();
      cells = emptyGrid(W, H);
      // el cañón necesita espacio: se ubica arriba a la izquierda; el resto, centrado
      name === "gun" ? stamp(cells, W, H, name, 1, 1) : stamp(cells, W, H, name);
      gen = 0; repaint(); writeStats(0);
    });

    // Al cargar el documento sus datos pisan la vista: se vuelve a leer la grilla inicial y se reinicia la caché.
    app.eventBus.on(Events.STATE_CHANGED, () => { synced = false; shown.fill(2); gen = 0; });
  },
};
