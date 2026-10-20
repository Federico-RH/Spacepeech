// lab/plugins/mixer-engine.js
// Funciones puras de la mesa de mezclas: mapeo de controles (0..100) a parámetros de audio y de señal a medidores.

export const freqFromKnob = (v) => 55 * 16 ** (clamp(v, 0, 100) / 100); // 55 Hz .. 880 Hz (4 octavas)
export const knobFromFreq = (hz) => Math.round((Math.log(hz / 55) / Math.log(16)) * 1000) / 10;
export const panFromKnob = (v) => (clamp(v, 0, 100) - 50) / 50; // -1 .. 1
export const gainFromFader = (v) => (clamp(v, 0, 100) / 100) ** 2 * 0.5; // curva cuadrática con margen
export const cutoffFromKnob = (v) => 200 * 60 ** (clamp(v, 0, 100) / 100); // 200 Hz .. 12 kHz

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, Number(v) || 0)); }

export function hzLabel(v) {
  const hz = freqFromKnob(v);
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(1)} Hz`;
}

export function panLabel(v) {
  const p = Math.round(panFromKnob(v) * 100);
  return p === 0 ? "C" : p < 0 ? `L ${-p}` : `R ${p}`;
}

/** RMS de una señal (-1..1) a un nivel de medidor 0..100 (escala en dB de -60 a 0). */
export function rmsToLevel(rms) {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return clamp(Math.round(((db + 60) / 60) * 100), 0, 100);
}

/** Suavizado con ataque rápido y caída lenta, como un medidor real. */
export function smooth(prev, next, attack = 0.7, decay = 0.18) {
  const k = next > prev ? attack : decay;
  return prev + (next - prev) * k;
}

/**
 * Agrupa un espectro de bytes (0..255) en N bandas espaciadas en forma logarítmica.
 * @returns {number[]} valores 0..100
 */
export function spectrumBands(freqData, sampleRate, bands = 16, fMin = 60, fMax = 12000) {
  const nyquist = sampleRate / 2;
  const binHz = nyquist / freqData.length;
  const out = [];
  for (let b = 0; b < bands; b++) {
    const f0 = fMin * (fMax / fMin) ** (b / bands);
    const f1 = fMin * (fMax / fMin) ** ((b + 1) / bands);
    const i0 = Math.max(0, Math.floor(f0 / binHz));
    const i1 = Math.min(freqData.length - 1, Math.max(i0, Math.ceil(f1 / binHz)));
    let max = 0;
    for (let i = i0; i <= i1; i++) if (freqData[i] > max) max = freqData[i];
    out.push(Math.round((max / 255) * 100));
  }
  return out;
}

export const NOTES = { C3: 130.81, E3: 164.81, G3: 196.0, C4: 261.63, A2: 110.0, C2: 65.41, G2: 98.0 };

export const PRESETS = {
  major: { label: "Acorde mayor", freq: [NOTES.C3, NOTES.E3, NOTES.G3, NOTES.C4], wave: ["sine", "triangle", "sine", "triangle"] },
  minor: { label: "Acorde menor", freq: [NOTES.A2, NOTES.C3, NOTES.E3 , NOTES.A2 * 2], wave: ["sawtooth", "triangle", "triangle", "sine"] },
  drone: { label: "Bordón", freq: [NOTES.C2, NOTES.G2, NOTES.C3, NOTES.G2 * 2], wave: ["sawtooth", "sawtooth", "square", "triangle"] },
};
