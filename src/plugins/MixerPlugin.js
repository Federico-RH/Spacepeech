// lab/plugins/MixerPlugin.js
// Plugin del Mixer Lab: 4 osciladores + master (filtro pasabajos), con medidores y espectro hacia el DataStore.
//
// Registro:  spacepeechInit('canvas', config, [{ plugin: MixerPlugin }]);   // opción: { base: 'mix' }
// Observa:   <b>.c1..c4.{wave,freq,pan,gain,mute} · <b>.master.{gain,cutoff}
// Escribe:   <b>.cN.{hz,panLabel,level,mask,muteCls} · <b>.master.{cutHz,level,mask} · <b>.spec.b1..b16 · <b>.ui.{status,start,fps}
// Acciones:  mix.start · mix.stop · mix.preset { name }
//
// Los medidores se actualizan ~30 veces por segundo y solo se escribe lo que cambió (valores enteros):
// es también una prueba de cuántas escrituras por segundo aguanta la reactividad del framework.
import { Events } from "../core/Events.js";
import { freqFromKnob, panFromKnob, gainFromFader, cutoffFromKnob, hzLabel, panLabel, rmsToLevel, smooth, spectrumBands, knobFromFreq, PRESETS } from "./mixer-engine.js";

const CHANNELS = [1, 2, 3, 4];
const BANDS = 16;

export const MixerPlugin = {
  name: "mixer-plugin",

  async install(app, options = {}) {
    const b = options.base || "mix";
    const ds = app.dataStore;
    const Ctx = options.audioContext || window.AudioContext || window.webkitAudioContext;
    const raf = options.raf || ((fn) => window.requestAnimationFrame(fn));
    const now = options.now || (() => performance.now());
    const read = (p, f) => ds.get(`${b}.${p}`) ?? f;

    let ctx = null;
    let graph = null; // { osc[], gain[], pan[], an[], master, filter, masterAn }
    let running = false;
    const shown = {}; // últimos valores escritos, para no repetir escrituras
    const lvl = {}; // niveles suavizados
    const put = (path, v) => { if (shown[path] !== v) { shown[path] = v; ds.set(`${b}.${path}`, v); } };

    // ── Parámetros → audio ─────────────────────────────────────────────────
    const T = () => ctx.currentTime;
    const applyChannel = (n) => {
      if (!graph) return;
      const i = n - 1;
      const o = graph.osc[i];
      o.type = String(read(`c${n}.wave`, "sine"));
      o.frequency.setTargetAtTime(freqFromKnob(read(`c${n}.freq`, 30)), T(), 0.02);
      graph.pan[i].pan.setTargetAtTime(panFromKnob(read(`c${n}.pan`, 50)), T(), 0.02);
      const g = read(`c${n}.mute`, false) ? 0 : gainFromFader(read(`c${n}.gain`, 50));
      graph.gain[i].gain.setTargetAtTime(g, T(), 0.02);
    };
    const applyMaster = () => {
      if (!graph) return;
      graph.master.gain.setTargetAtTime(gainFromFader(read("master.gain", 35)) * 2, T(), 0.02);
      graph.filter.frequency.setTargetAtTime(cutoffFromKnob(read("master.cutoff", 80)), T(), 0.02);
    };

    // ── Etiquetas derivadas (funcionan aunque el audio no esté iniciado) ────
    const labels = (n) => {
      put(`c${n}.hz`, hzLabel(read(`c${n}.freq`, 30)));
      put(`c${n}.panLabel`, panLabel(read(`c${n}.pan`, 50)));
      put(`c${n}.muteCls`, read(`c${n}.mute`, false) ? "on" : "off");
    };
    const masterLabels = () => put("master.cutHz", `${Math.round(cutoffFromKnob(read("master.cutoff", 80)))} Hz`);

    // ── Construcción del grafo ─────────────────────────────────────────────
    const build = () => {
      ctx = new Ctx();
      const master = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      const masterAn = ctx.createAnalyser();
      masterAn.fftSize = 1024;
      masterAn.smoothingTimeConstant = 0.6;
      master.connect(filter); filter.connect(masterAn); masterAn.connect(ctx.destination);
      graph = { osc: [], gain: [], pan: [], an: [], master, filter, masterAn };
      for (const n of CHANNELS) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const p = ctx.createStereoPanner();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        g.gain.value = 0;
        o.connect(g); g.connect(an); g.connect(p); p.connect(master);
        o.start();
        graph.osc.push(o); graph.gain.push(g); graph.pan.push(p); graph.an.push(an);
      }
      CHANNELS.forEach(applyChannel);
      applyMaster();
    };

    // ── Medidores y espectro ────────────────────────────────────────────────
    const rms = (an) => {
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };
    const meter = (key, raw) => {
      const v = Math.round((lvl[key] = smooth(lvl[key] ?? 0, raw)));
      put(`${key}.level`, v);
      put(`${key}.mask`, 100 - v);
    };

    let last = 0;
    let frames = 0;
    let fpsStart = 0;
    const loop = () => {
      if (!running) return;
      const t = now();
      if (t - last >= 33) {
        last = t;
        CHANNELS.forEach((n) => meter(`c${n}`, rmsToLevel(rms(graph.an[n - 1]))));
        meter("master", rmsToLevel(rms(graph.masterAn)));
        const data = new Uint8Array(graph.masterAn.frequencyBinCount);
        graph.masterAn.getByteFrequencyData(data);
        spectrumBands(data, ctx.sampleRate, BANDS).forEach((v, i) => {
          const k = `spec.b${i + 1}`;
          put(k, Math.round((lvl[k] = smooth(lvl[k] ?? 0, v, 0.6, 0.2))));
        });
        frames++;
        if (t - fpsStart >= 1000) { put("ui.fps", `${frames} act/s`); frames = 0; fpsStart = t; }
      }
      raf(loop);
    };

    const zeroMeters = () => {
      for (const k of [...CHANNELS.map((n) => `c${n}`), "master"]) { lvl[k] = 0; put(`${k}.level`, 0); put(`${k}.mask`, 100); }
      for (let i = 1; i <= BANDS; i++) { lvl[`spec.b${i}`] = 0; put(`spec.b${i}`, 0); }
      put("ui.fps", "—");
    };

    // ── Acciones ────────────────────────────────────────────────────────────
    app.actionManager.register("mix.start", async () => {
      if (!Ctx) { put("ui.status", "✗ Este navegador no soporta WebAudio"); return; }
      if (!ctx) build();
      if (ctx.state === "suspended") await ctx.resume();
      if (!running) { running = true; last = 0; frames = 0; fpsStart = now(); raf(loop); }
      put("ui.status", "● Audio activo");
      put("ui.start", "on");
    });

    app.actionManager.register("mix.stop", async () => {
      running = false;
      if (ctx && ctx.state === "running") await ctx.suspend();
      zeroMeters();
      put("ui.status", "○ Audio detenido");
      put("ui.start", "off");
    });

    app.actionManager.register("mix.preset", async ({ name }, c) => {
      const p = PRESETS[name];
      if (!p) return;
      const store = c?.dataStore || ds;
      CHANNELS.forEach((n, i) => {
        store.set(`${b}.c${n}.freq`, knobFromFreq(p.freq[i]));
        store.set(`${b}.c${n}.wave`, p.wave[i]);
      });
    });

    // ── Observación de cambios ──────────────────────────────────────────────
    app.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      if (typeof path !== "string" || !path.startsWith(`${b}.`)) return;
      const m = /^c([1-4])\.(wave|freq|pan|gain|mute)$/.exec(path.slice(b.length + 1));
      if (m) { labels(Number(m[1])); applyChannel(Number(m[1])); return; }
      if (path === `${b}.master.gain` || path === `${b}.master.cutoff`) { masterLabels(); applyMaster(); }
    });

    CHANNELS.forEach(labels);
    masterLabels();
  },
};
