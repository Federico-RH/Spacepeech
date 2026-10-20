// lab/plugins/DinoPlugin.js
// Plugin del Dino Lab: conecta el motor del juego (dino-engine.js) con el DataStore.
// La simulación vive en el plugin; el framework solo dibuja lo que el plugin escribe (posiciones, puntaje, mensajes),
// así que el juego es una prueba de cuántas escrituras por segundo soporta el binding.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: DinoPlugin }]);   // opciones: { base: 'dino', seed, stageId: 'stage' }
// Entrada:   acción dino.jump (click/tap sobre el escenario) y teclado: Espacio, ↑ o W saltan; ↓ cae más rápido.
//            El teclado lo captura el propio plugin porque el Renderer del framework no escucha keydown,
//            y solo mientras exista en la página el nodo con id `stageId` (el escenario).
// Escribe:   <b>.y .gx · <b>.o1..o3.{x,w,h} · <b>.c1/c2.{x,y} · <b>.legA/.legB · <b>.score .hi .msg .cls · <b>.ui.{fps,wps}
import { Events } from "../core/Events.js";
import { WORLD, createState, jump, step, fastFall, pad } from "./dino-engine.js";

const MSG = {
  ready: "Espacio, ↑ o click para saltar",
  running: "",
  over: "GAME OVER — espacio o click para reiniciar",
};

export const DinoPlugin = {
  name: "dino-plugin",

  async install(app, options = {}) {
    const b = options.base || "dino";
    const ds = app.dataStore;
    const raf = options.raf || ((fn) => window.requestAnimationFrame(fn));
    const now = options.now || (() => performance.now());
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const keyTarget = options.keyTarget || (typeof document !== "undefined" ? document : null);
    const hiKey = options.storageKey || "sp_dino_hi";

    let hi = 0;
    try { hi = Number(storage?.getItem(hiKey)) || 0; } catch (_) { /* sin storage */ }
    let state = createState(options.seed ?? Date.now() % 1e9, hi);

    const shown = {};
    let writes = 0;
    const put = (p, v) => { if (shown[p] !== v) { shown[p] = v; writes++; ds.set(`${b}.${p}`, v); } };

    const render = () => {
      put("y", Math.round(state.y));
      put("gx", Math.round(state.groundX));
      for (let i = 0; i < WORLD.slots; i++) {
        const o = state.obstacles.find((q) => q.slot === i);
        put(`o${i + 1}.x`, o ? Math.round(o.x) : -200);
        put(`o${i + 1}.w`, o ? o.w : 0);
        put(`o${i + 1}.h`, o ? o.h : 0);
      }
      state.clouds.forEach((c, i) => { put(`c${i + 1}.x`, Math.round(c.x)); put(`c${i + 1}.y`, Math.round(c.y)); });
      const running = state.phase === "running";
      const airborne = state.y > 0;
      put("legA", !running || airborne || state.frame === 0 ? "block" : "none"); // dos cuadros de carrera
      put("legB", running && !airborne && state.frame === 1 ? "block" : "none");
      put("score", pad(state.score));
      put("hi", `HI ${pad(state.hi)}`);
      put("msg", MSG[state.phase]);
      put("cls", state.phase);
    };

    let running = false;
    let last = 0;
    let frames = 0;
    let fpsStart = 0;
    let writesAtStart = 0;
    const loop = () => {
      if (!running) return;
      const t = now();
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); // un cuadro largo (pestaña oculta) no teletransporta el juego
      last = t;
      step(state, dt);
      render();
      frames++;
      if (t - fpsStart >= 1000) {
        put("ui.fps", `${frames} fps`);
        put("ui.wps", `${writes - writesAtStart} escrituras/s`);
        frames = 0; writesAtStart = writes; fpsStart = t;
      }
      if (state.phase === "over") {
        running = false;
        try { storage?.setItem(hiKey, String(state.hi)); } catch (_) { /* sin storage */ }
        return;
      }
      raf(loop);
    };

    const start = () => {
      if (running) return;
      running = true; last = now(); fpsStart = last; frames = 0; writesAtStart = writes;
      raf(loop);
    };

    const stageId = options.stageId || "stage";
    const active = () => typeof document === "undefined" || !!document.getElementById(stageId);

    const doJump = () => {
      if (state.phase === "over") { // el bucle está detenido: se avanza el reloj del juego para respetar la espera de reinicio
        const t = now();
        step(state, Math.min(1, Math.max(0, (t - last) / 1000)));
        last = t;
      }
      const r = jump(state);
      if (r === "start" || r === "restart") { render(); start(); }
      else if (r === "jump") render();
    };

    app.actionManager.register("dino.jump", async () => { doJump(); });

    if (keyTarget?.addEventListener) {
      keyTarget.addEventListener("keydown", (e) => {
        if (!active()) return; // otras páginas del lab conservan sus teclas (scroll con espacio, etc.)
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); if (!e.repeat) doJump(); }
        else if (e.code === "ArrowDown") { e.preventDefault(); fastFall(state); }
      });
    }
    if (typeof document !== "undefined" && document.addEventListener && !options.keyTarget) {
      document.addEventListener("visibilitychange", () => { if (document.hidden) last = now(); });
    }

    // Al cargar el documento sus datos reemplazan a los que escribimos al instalar: se reinicia la caché y se vuelve a dibujar.
    app.eventBus.on(Events.STATE_CHANGED, () => {
      for (const k of Object.keys(shown)) delete shown[k];
      setTimeout(render, 0);
    });

    render();
  },
};
