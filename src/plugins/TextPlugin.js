// lab/plugins/TextPlugin.js
// Plugin del Editor Lab: bloc de notas + teclado virtual sobre el mismo texto.
//
// Registro (en la página que arranca el framework):
//   import { TextPlugin } from './lab/plugins/TextPlugin.js';
//   spacepeechInit('canvas', config, [{ plugin: TextPlugin }]);
// Opciones: { note: 'note', kb: 'kb', storageKey: 'sp_notepad_text' }.
// Si el documento se carga como módulo, usar las rutas con el id de instancia (ej. note: 'vEditor.note').
//
// ACCIONES
//   text.key        { keyId }   agrega la etiqueta actual de la tecla (kb.k.<keyId>); apaga Shift de un solo uso
//   text.insert     { text }    agrega texto al final
//   text.backspace              borra el último carácter
//   text.clear                  vacía el texto
//   text.replaceAll             reemplaza note.find por note.replace (respeta note.matchCase)
//   text.download   { filename } descarga el texto como .txt
//   text.open                   abre un selector de archivos y carga el contenido de texto
// DATOS QUE ESCRIBE (se observa note.text, note.find, note.matchCase, kb.layout, kb.shift, kb.caps, kb.open)
//   note.stats.{words,chars,lines,matches}, note.saved, kb.k.<id>, kb.cls.{shift,caps}, kb.ui.{display,toggle}
import { Events } from "../core/Events.js";
import { keyLabels } from "./kb-layouts.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function textStats(text = "", find = "", matchCase = false) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const lines = text ? text.split("\n").length : 0;
  const matches = find ? (text.match(new RegExp(escapeRegExp(find), matchCase ? "g" : "gi")) || []).length : 0;
  return { words, chars: text.length, lines, matches };
}

export const TextPlugin = {
  name: "text-plugin",

  async install(app, options = {}) {
    const note = options.note || "note";
    const kb = options.kb || "kb";
    const storageKey = options.storageKey || "sp_notepad_text";
    const ds = app.dataStore;
    const read = (path, fallback = "") => ds.get(path) ?? fallback;

    // ── Acciones ───────────────────────────────────────────────────────────
    app.actionManager.register("text.insert", async ({ text = "" }, ctx) => {
      const store = ctx?.dataStore || ds;
      store.set(`${note}.text`, String(store.get(`${note}.text`) ?? "") + String(text));
    });

    app.actionManager.register("text.key", async ({ keyId }, ctx) => {
      const store = ctx?.dataStore || ds;
      const label = store.get(`${kb}.k.${keyId}`);
      if (label == null) return;
      store.set(`${note}.text`, String(store.get(`${note}.text`) ?? "") + String(label));
      if (store.get(`${kb}.shift`)) store.set(`${kb}.shift`, false); // Shift de un solo uso
    });

    app.actionManager.register("text.backspace", async (_, ctx) => {
      const store = ctx?.dataStore || ds;
      store.set(`${note}.text`, String(store.get(`${note}.text`) ?? "").slice(0, -1));
    });

    app.actionManager.register("text.clear", async (_, ctx) => {
      (ctx?.dataStore || ds).set(`${note}.text`, "");
    });

    app.actionManager.register("text.replaceAll", async (_, ctx) => {
      const store = ctx?.dataStore || ds;
      const find = String(store.get(`${note}.find`) ?? "");
      if (!find) return;
      const re = new RegExp(escapeRegExp(find), store.get(`${note}.matchCase`) ? "g" : "gi");
      const rep = String(store.get(`${note}.replace`) ?? "");
      store.set(`${note}.text`, String(store.get(`${note}.text`) ?? "").replace(re, () => rep));
    });

    app.actionManager.register("text.download", async ({ filename = "nota.txt" }, ctx) => {
      const store = ctx?.dataStore || ds;
      const blob = new Blob([String(store.get(`${note}.text`) ?? "")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    app.actionManager.register("text.open", async (_, ctx) => {
      const store = ctx?.dataStore || ds;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.md,.json,.csv,.js,.css,.html,text/*";
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => store.set(`${note}.text`, String(reader.result ?? ""));
        reader.readAsText(file);
      };
      input.click();
    });

    // ── Datos derivados (el framework no los calcula, los escribe este plugin) ──
    let tStats = null;
    let tSave = null;
    let tKb = null;

    const updateStats = () => {
      tStats = null;
      const s = textStats(String(read(`${note}.text`)), String(read(`${note}.find`)), !!read(`${note}.matchCase`, false));
      for (const [k, v] of Object.entries(s)) ds.set(`${note}.stats.${k}`, v);
    };

    const save = () => {
      tSave = null;
      try {
        localStorage.setItem(storageKey, String(read(`${note}.text`)));
        const d = new Date();
        const hh = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
        ds.set(`${note}.saved`, `Autoguardado ${hh}`);
      } catch (_) {
        ds.set(`${note}.saved`, "Sin autoguardado (localStorage no disponible)");
      }
    };

    const relabel = () => {
      tKb = null;
      const labels = keyLabels(String(read(`${kb}.layout`, "es")), !!read(`${kb}.shift`, false), !!read(`${kb}.caps`, false));
      for (const [id, label] of Object.entries(labels)) ds.set(`${kb}.k.${id}`, label);
      ds.set(`${kb}.cls.shift`, read(`${kb}.shift`, false) ? "on" : "off");
      ds.set(`${kb}.cls.caps`, read(`${kb}.caps`, false) ? "on" : "off");
      const open = read(`${kb}.open`, true) !== false;
      ds.set(`${kb}.ui.display`, open ? "block" : "none");
      ds.set(`${kb}.ui.toggle`, open ? "Teclado ▾" : "Teclado ▸");
    };

    app.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      if (typeof path !== "string") return;
      if (path === `${note}.text`) {
        tStats = tStats || setTimeout(updateStats, 0);
        clearTimeout(tSave);
        tSave = setTimeout(save, 400); // autoguardado con debounce
      } else if (path === `${note}.find` || path === `${note}.matchCase`) {
        tStats = tStats || setTimeout(updateStats, 0);
      } else if ([`${kb}.layout`, `${kb}.shift`, `${kb}.caps`, `${kb}.open`].includes(path)) {
        tKb = tKb || setTimeout(relabel, 0);
      }
    });

    // Restaura el texto guardado una sola vez, cuando el documento ya cargó sus datos.
    let restored = false;
    app.eventBus.on(Events.STATE_CHANGED, () => {
      if (restored) return;
      restored = true;
      setTimeout(() => {
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved !== null) ds.set(`${note}.text`, saved);
        } catch (_) { /* sin localStorage */ }
      }, 0);
    });
  },
};
