// ==========================================
// FILE: src/plugins/CalculatorPlugin.js
// ==========================================

/**
 * CalculatorPlugin — src/plugins/CalculatorPlugin.js
 *
 * Decoupled arithmetic calculation engine for Spacepeech.
 * Maintains state in DataStore (calc.display, calc.prev, calc.op, calc.history).
 */
export const CalculatorPlugin = {
  name: "calculator-plugin",

  async install(app) {
    // 1. Digit and Decimal Point Entry
    app.actionManager.register("calc.digit", async ({ char, resetOnNext = false }, ctx) => {
      let current = String(ctx.dataStore.get("calc.display") ?? "0");
      const shouldReset = Boolean(ctx.dataStore.get("calc.resetNext"));

      if (current === "0" && char !== "." || shouldReset) {
        current = char === "." ? "0." : String(char);
        ctx.dataStore.set("calc.resetNext", false);
      } else {
        if (char === "." && current.includes(".")) return;
        current += String(char);
      }

      ctx.dataStore.set("calc.display", current);
    });

    // 2. Operator Selection (+, -, *, /)
    app.actionManager.register("calc.operator", async ({ op }, ctx) => {
      const current = Number(ctx.dataStore.get("calc.display")) || 0;
      const prev = ctx.dataStore.get("calc.prev");
      const existingOp = ctx.dataStore.get("calc.op");

      if (prev !== null && prev !== undefined && existingOp && !ctx.dataStore.get("calc.resetNext")) {
        // Resolves previous accumulator if the user chains operations
        const result = calculate(Number(prev), current, existingOp);
        ctx.dataStore.set("calc.display", String(result));
        ctx.dataStore.set("calc.prev", result);
        ctx.dataStore.set("calc.history", `${result} ${op}`);
      } else {
        ctx.dataStore.set("calc.prev", current);
        ctx.dataStore.set("calc.history", `${current} ${op}`);
      }

      ctx.dataStore.set("calc.op", op);
      ctx.dataStore.set("calc.resetNext", true);
    });

    // 3. Result Execution (=)
    app.actionManager.register("calc.equals", async (_, ctx) => {
      const prev = ctx.dataStore.get("calc.prev");
      const op = ctx.dataStore.get("calc.op");
      const current = Number(ctx.dataStore.get("calc.display")) || 0;

      if (prev === null || prev === undefined || !op) return;

      const result = calculate(Number(prev), current, op);
      ctx.dataStore.set("calc.history", `${prev} ${op} ${current} =`);
      ctx.dataStore.set("calc.display", String(result));
      ctx.dataStore.set("calc.prev", null);
      ctx.dataStore.set("calc.op", null);
      ctx.dataStore.set("calc.resetNext", true);
    });

    // 4. Clear (C)
    app.actionManager.register("calc.clear", async (_, ctx) => {
      ctx.dataStore.set("calc.display", "0");
      ctx.dataStore.set("calc.prev", null);
      ctx.dataStore.set("calc.op", null);
      ctx.dataStore.set("calc.history", "");
      ctx.dataStore.set("calc.resetNext", false);
    });

    // 5. Single Deletion (Backspace / DEL)
    app.actionManager.register("calc.delete", async (_, ctx) => {
      const current = String(ctx.dataStore.get("calc.display") ?? "0");
      if (current.length <= 1 || current === "0") {
        ctx.dataStore.set("calc.display", "0");
      } else {
        ctx.dataStore.set("calc.display", current.slice(0, -1));
      }
    });

    // 6. Sign Inversion (±)
    app.actionManager.register("calc.toggleSign", async (_, ctx) => {
      const current = Number(ctx.dataStore.get("calc.display")) || 0;
      ctx.dataStore.set("calc.display", String(current * -1));
    });
  },
};

function calculate(a, b, op) {
  switch (op) {
    case "+": return Number((a + b).toFixed(8));
    case "-": return Number((a - b).toFixed(8));
    case "×":
    case "*": return Number((a * b).toFixed(8));
    case "÷":
    case "/": return b !== 0 ? Number((a / b).toFixed(8)) : "Error";
    case "%": return Number(((a * b) / 100).toFixed(8));
    default: return b;
  }
}
