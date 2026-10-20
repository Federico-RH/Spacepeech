// lab/plugins/MathPlugin.js
// Plugin del Math Lab: observa un árbol de datos `<base>.in` y escribe el resultado en `<base>.out`.
//
// Registro (ver lab.html):
//   spacepeechInit('canvas', config, [{ plugin: MathPlugin, options: { watch: ['m'] } }]);
//
// Cada cambio en `m.in.*` (sliders, select, dial) recalcula la curva una vez por frame y deja:
//   m.out.main  -> points del polyline principal
//   m.out.ref   -> points de la curva exacta (vacío si no aplica)
//   m.out.info  -> texto con el resumen y el error
// Si el documento se carga como módulo (component-instance con id "vMath"), usar watch: ['vMath.m'].
import { Events } from "../core/Events.js";
import { computeCurve } from "./math-series.js";

export const MathPlugin = {
  name: "math-plugin",

  async install(app, options = {}) {
    const bases = [].concat(options.watch || ["m"]);
    let scheduled = false;

    const run = () => {
      scheduled = false;
      for (const base of bases) {
        const input = app.dataStore.get(`${base}.in`);
        if (!input || typeof input !== "object") continue;
        const out = computeCurve(input);
        // Se escribe cada hoja por separado: así se notifican los bindings de cada ruta exacta.
        app.dataStore.set(`${base}.out.main`, out.main);
        app.dataStore.set(`${base}.out.ref`, out.ref);
        app.dataStore.set(`${base}.out.info`, out.info);
      }
    };

    app.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      if (typeof path !== "string") return;
      if (!bases.some((b) => path === `${b}.in` || path.startsWith(`${b}.in.`))) return;
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || setTimeout)(run);
    });
  },
};
