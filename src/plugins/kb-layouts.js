// lab/plugins/kb-layouts.js
// Disposiciones del teclado virtual (sin dependencias). Cada layout son 4 filas de 10 teclas.
// Los ids de tecla son r<fila>c<columna> (r1c1 ... r4c10); lo que cambia entre layouts es solo la etiqueta.

export const LAYOUTS = {
  es: { name: "Español (QWERTY)", rows: ["1234567890", "qwertyuiop", "asdfghjklñ", "zxcvbnm,.-"] },
  en: { name: "English (QWERTY)", rows: ["1234567890", "qwertyuiop", "asdfghjkl;", "zxcvbnm,./"] },
  dvorak: { name: "Dvorak", rows: ["1234567890", "',.pyfgcrl", "aoeuidhtns", ";qjkxbmwvz"] },
};

// Símbolos que produce Shift sobre teclas que no son letras.
const SHIFT = {
  es: { 1: "!", 2: '"', 3: "·", 4: "$", 5: "%", 6: "&", 7: "/", 8: "(", 9: ")", 0: "=", ",": ";", ".": ":", "-": "_" },
  en: { 1: "!", 2: "@", 3: "#", 4: "$", 5: "%", 6: "^", 7: "&", 8: "*", 9: "(", 0: ")", ";": ":", ",": "<", ".": ">", "/": "?" },
  dvorak: { 1: "!", 2: "@", 3: "#", 4: "$", 5: "%", 6: "^", 7: "&", 8: "*", 9: "(", 0: ")", "'": '"', ",": "<", ".": ">", ";": ":" },
};

const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase();

/**
 * Etiquetas de todas las teclas para un estado dado.
 * Las letras van en mayúscula si shift XOR caps; el resto de los símbolos cambia solo con shift.
 * @returns {Record<string,string>} { r1c1: "1", r2c1: "q", ... }
 */
export function keyLabels(layoutKey = "es", shift = false, caps = false) {
  const layout = LAYOUTS[layoutKey] || LAYOUTS.es;
  const table = SHIFT[layoutKey] || SHIFT.es;
  const out = {};
  layout.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      let label = ch;
      if (isLetter(ch)) label = shift !== caps ? ch.toUpperCase() : ch;
      else if (shift && table[ch]) label = table[ch];
      out[`r${r + 1}c${c + 1}`] = label;
    });
  });
  return out;
}

export const KEY_IDS = Object.keys(keyLabels("es"));
