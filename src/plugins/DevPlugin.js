// lab/plugins/DevPlugin.js
// Plugin del Dev Lab: formateador de JSON, probador de regex, timestamps, codificación y contraste WCAG.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: DevPlugin }]);   // opción: { base: 'dev' }
// Observa:   <b>.json.in · <b>.rx.{pattern,flags,text} · <b>.ts.in · <b>.enc.{mode,in} · <b>.ct.{fg,bg} · <b>.tab
// Escribe:   <b>.json.{out,status,cls} · <b>.rx.{status,list,cls} · <b>.ts.{status,unixS,unixMs,iso,local,utc,rel,cls}
//            <b>.enc.{out,status,cls} · <b>.ct.{ratio,aa,aaLarge,aaa,verdict,cls} · <b>.ui.<tab>.{display,cls}
// Acciones:  dev.json.format · dev.json.minify · dev.ts.now · dev.enc.swap
import { Events } from "../core/Events.js";
import { jsonTransform, regexTest, timestampInfo, encodeDecode, contrastInfo, swapMode } from "./dev-tools.js";

export const TABS = ["json", "regex", "time", "enc", "contrast"];

export const DevPlugin = {
  name: "dev-plugin",

  async install(app, options = {}) {
    const b = options.base || "dev";
    const ds = app.dataStore;
    const read = (p, f = "") => ds.get(`${b}.${p}`) ?? f;
    const write = (p, obj) => { for (const [k, v] of Object.entries(obj)) ds.set(`${b}.${p}.${k}`, v); };

    const recompute = {
      json: () => { const r = jsonTransform(String(read("json.in")), 2); write("json", { out: r.out, status: r.status, cls: r.cls }); },
      rx: () => { const r = regexTest(String(read("rx.pattern")), String(read("rx.flags")), String(read("rx.text"))); write("rx", { status: r.status, list: r.list, cls: r.cls }); },
      ts: () => { const r = timestampInfo(read("ts.in")); const { ok, ...rest } = r; write("ts", rest); },
      enc: () => { const r = encodeDecode(String(read("enc.mode", "b64-enc")), String(read("enc.in"))); write("enc", { out: r.out, status: r.status, cls: r.cls }); },
      ct: () => { write("ct", contrastInfo(String(read("ct.fg", "#000000")), String(read("ct.bg", "#ffffff")))); },
      ui: () => {
        const tab = String(read("tab", "json"));
        for (const t of TABS) { ds.set(`${b}.ui.${t}.display`, t === tab ? "block" : "none"); ds.set(`${b}.ui.${t}.cls`, t === tab ? "on" : "off"); }
      },
    };

    const timers = {};
    const schedule = (key) => { timers[key] = timers[key] || setTimeout(() => { timers[key] = null; recompute[key](); }, 0); };

    app.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      if (typeof path !== "string" || !path.startsWith(`${b}.`)) return;
      const p = path.slice(b.length + 1);
      if (p === "json.in") schedule("json");
      else if (["rx.pattern", "rx.flags", "rx.text"].includes(p)) schedule("rx");
      else if (p === "ts.in") schedule("ts");
      else if (p === "enc.mode" || p === "enc.in") schedule("enc");
      else if (p === "ct.fg" || p === "ct.bg") schedule("ct");
      else if (p === "tab") schedule("ui");
    });

    app.actionManager.register("dev.json.format", async (_, ctx) => {
      const r = jsonTransform(String(read("json.in")), 2);
      if (r.ok && r.out) (ctx?.dataStore || ds).set(`${b}.json.in`, r.out);
    });
    app.actionManager.register("dev.json.minify", async (_, ctx) => {
      const r = jsonTransform(String(read("json.in")), 0);
      if (r.ok && r.out) (ctx?.dataStore || ds).set(`${b}.json.in`, r.out);
    });
    app.actionManager.register("dev.ts.now", async (_, ctx) => {
      (ctx?.dataStore || ds).set(`${b}.ts.in`, String(Date.now()));
    });
    app.actionManager.register("dev.enc.swap", async (_, ctx) => {
      const store = ctx?.dataStore || ds;
      const out = String(read("enc.out"));
      store.set(`${b}.enc.mode`, swapMode(String(read("enc.mode", "b64-enc"))));
      store.set(`${b}.enc.in`, out);
    });
  },
};
