// lab/plugins/dev-tools.js
// Funciones puras (sin DOM ni dependencias) del Dev Lab. Cada una devuelve datos listos para escribir en el DataStore.

// ─── JSON ────────────────────────────────────────────────────────────────────
function describe(value) {
  let keys = 0;
  let depth = 0;
  (function walk(v, d) {
    const isArr = Array.isArray(v);
    const isObj = !isArr && v && typeof v === "object";
    if (!isArr && !isObj) return; // las hojas no suman profundidad
    depth = Math.max(depth, d);
    if (isArr) v.forEach((x) => walk(x, d + 1));
    else for (const k of Object.keys(v)) { keys++; walk(v[k], d + 1); }
  })(value, 1);
  return { keys, depth };
}

// Busca la posición del primer carácter inválido cuando el motor no la informa:
// el primer prefijo cuyo error NO se debe a que el texto se cortó.
function findErrorPosition(text) {
  for (let i = 1; i <= text.length; i++) {
    try { JSON.parse(text.slice(0, i)); } catch (e) {
      const m = /position (\d+)/.exec(e.message);
      const truncated = /end of JSON input|Unterminated/.test(e.message) || (m && Number(m[1]) >= i);
      if (!truncated) return i - 1;
    }
  }
  return null;
}

function jsonError(text, err) {
  const full = err.message;
  const clean = full
    .replace(/,?\s*".*"\s+is not valid JSON$/s, "")
    .replace(/\s+in JSON at position \d+.*$/s, "")
    .replace(/\s+\(line \d+ column \d+\)$/, "");
  const lc = /\(line (\d+) column (\d+)\)/.exec(full);
  if (lc) return `✗ ${clean} — línea ${lc[1]}, columna ${lc[2]}`;
  const m = /position (\d+)/.exec(full);
  const pos = m ? Number(m[1]) : text.length <= 20000 ? findErrorPosition(text) : null;
  if (pos == null) return `✗ ${clean}`;
  const before = text.slice(0, pos).split("\n");
  return `✗ ${clean} — línea ${before.length}, columna ${before[before.length - 1].length + 1}`;
}

/** Formatea (indent > 0) o minifica (indent = 0). */
export function jsonTransform(text, indent = 2) {
  if (!text.trim()) return { ok: true, out: "", status: "Pegá un JSON para validarlo", cls: "idle" };
  try {
    const value = JSON.parse(text);
    const out = JSON.stringify(value, null, indent || undefined);
    const { keys, depth } = describe(value);
    const kind = Array.isArray(value) ? `array de ${value.length}` : typeof value === "object" && value ? "objeto" : typeof value;
    return { ok: true, out, status: `✓ JSON válido · ${kind} · ${keys} clave(s) · profundidad ${depth} · ${new Blob([out]).size} bytes`, cls: "ok" };
  } catch (err) {
    return { ok: false, out: "", status: jsonError(text, err), cls: "err" };
  }
}

// ─── Regex ───────────────────────────────────────────────────────────────────
export function regexTest(pattern, flags, text) {
  if (!pattern) return { ok: true, status: "Escribí una expresión", list: "", cls: "idle" };
  let re;
  try {
    re = new RegExp(pattern, [...new Set((flags || "").replace(/[^dgimsuvy]/g, "") + "g")].join(""));
  } catch (err) {
    return { ok: false, status: `✗ ${err.message}`, list: "", cls: "err" };
  }
  const lines = [];
  let count = 0;
  for (const m of text.matchAll(re)) {
    count++;
    if (count <= 60) {
      const groups = m.slice(1).map((g, i) => `g${i + 1}=${JSON.stringify(g)}`).join(" ");
      const named = m.groups ? " " + Object.entries(m.groups).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") : "";
      lines.push(`#${count}  [${m.index}–${m.index + m[0].length}]  ${JSON.stringify(m[0])}${groups ? "  " + groups : ""}${named}`);
    }
    if (m[0] === "") re.lastIndex++; // evita bucles con coincidencias vacías
    if (count >= 2000) break;
  }
  const more = count > 60 ? `\n… y ${count - 60} más` : "";
  return { ok: true, status: count ? `✓ ${count} coincidencia(s)` : "Sin coincidencias", list: lines.join("\n") + more, cls: count ? "ok" : "idle" };
}

// ─── Timestamps ──────────────────────────────────────────────────────────────
function relative(ms) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const units = [["año", 31557600000], ["mes", 2629800000], ["día", 86400000], ["hora", 3600000], ["minuto", 60000], ["segundo", 1000]];
  for (const [name, size] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      return diff < 0 ? `hace ${n} ${name}${n > 1 ? (name === "mes" ? "es" : "s") : ""}` : `en ${n} ${name}${n > 1 ? (name === "mes" ? "es" : "s") : ""}`;
    }
  }
  return "ahora";
}

export function timestampInfo(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: true, status: "Ingresá un timestamp (s o ms) o una fecha ISO", unixS: "", unixMs: "", iso: "", local: "", utc: "", rel: "", cls: "idle" };
  let ms;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    ms = Math.abs(n) < 1e11 ? n * 1000 : n; // < 1e11 se interpreta como segundos
  } else ms = Date.parse(raw);
  const d = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(d.getTime())) {
    return { ok: false, status: "✗ No se reconoce el valor", unixS: "", unixMs: "", iso: "", local: "", utc: "", rel: "", cls: "err" };
  }
  return {
    ok: true,
    status: /^-?\d+(\.\d+)?$/.test(raw) ? (Math.abs(Number(raw)) < 1e11 ? "✓ Interpretado como segundos" : "✓ Interpretado como milisegundos") : "✓ Interpretado como fecha",
    unixS: String(Math.floor(ms / 1000)),
    unixMs: String(Math.floor(ms)),
    iso: d.toISOString(),
    local: d.toLocaleString("es-AR", { dateStyle: "full", timeStyle: "long" }),
    utc: d.toUTCString(),
    rel: relative(ms),
    cls: "ok",
  };
}

// ─── Codificación ────────────────────────────────────────────────────────────
const toB64 = (s) => { const b = new TextEncoder().encode(s); let bin = ""; for (const x of b) bin += String.fromCharCode(x); return btoa(bin); };
const fromB64 = (s) => { const bin = atob(s.replace(/\s+/g, "")); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
const toHex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
const fromHex = (s) => {
  const clean = s.replace(/0x/gi, "").replace(/[\s,]+/g, "");
  if (!/^([0-9a-f]{2})*$/i.test(clean)) throw new Error("hex inválido");
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(clean.match(/../g) || [], (h) => parseInt(h, 16)));
};

export const ENC_MODES = [
  { value: "b64-enc", text: "Base64 · codificar" }, { value: "b64-dec", text: "Base64 · decodificar" },
  { value: "url-enc", text: "URL · codificar" }, { value: "url-dec", text: "URL · decodificar" },
  { value: "hex-enc", text: "Hex (UTF-8) · codificar" }, { value: "hex-dec", text: "Hex (UTF-8) · decodificar" },
];

export function encodeDecode(mode, text) {
  if (!text) return { ok: true, out: "", status: "Ingresá un texto", cls: "idle" };
  try {
    const fn = { "b64-enc": toB64, "b64-dec": fromB64, "url-enc": encodeURIComponent, "url-dec": decodeURIComponent, "hex-enc": toHex, "hex-dec": fromHex }[mode];
    const out = fn(text);
    return { ok: true, out, status: `✓ ${text.length} → ${out.length} caracteres`, cls: "ok" };
  } catch (err) {
    return { ok: false, out: "", status: `✗ No se pudo convertir: ${err.message}`, cls: "err" };
  }
}

export const swapMode = (mode) => (mode.endsWith("-enc") ? mode.replace("-enc", "-dec") : mode.replace("-dec", "-enc"));

// ─── Contraste WCAG ──────────────────────────────────────────────────────────
function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastInfo(fg, bg) {
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(fg) || !/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(bg)) {
    return { ratio: "—", aa: "—", aaLarge: "—", aaa: "—", verdict: "Colores inválidos", cls: "err" };
  }
  const [l1, l2] = [luminance(fg.startsWith("#") ? fg : "#" + fg), luminance(bg.startsWith("#") ? bg : "#" + bg)];
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const mark = (ok) => (ok ? "✓" : "✗");
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  return {
    ratio: `${ratio.toFixed(2)}:1`,
    aa: `${mark(aa)} AA texto normal (4.5)`,
    aaLarge: `${mark(ratio >= 3)} AA texto grande (3)`,
    aaa: `${mark(aaa)} AAA texto normal (7)`,
    verdict: aaa ? "Excelente contraste" : aa ? "Cumple AA" : ratio >= 3 ? "Solo sirve para texto grande" : "Contraste insuficiente",
    cls: aaa ? "ok" : aa ? "ok" : ratio >= 3 ? "warn" : "err",
  };
}
