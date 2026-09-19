// =============================================================================
// FILE: src/core/DataStore.js
// =============================================================================

import { Events } from "./Events.js";
import { ExpressionEvaluator } from "./ExpressionEvaluator.js";

// Property names that can never be written or read via dynamic paths
// ("user.__proto__.isAdmin", "constructor.prototype.x", etc.) -- prevents a
// path built from external data (e.g. an interpolated action param) from
// polluting Object.prototype.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * DataStore — src/core/DataStore.js
 *
 * In-memory single reactive state store, with template interpolation support
 * and logical/ternary expression evaluation (via ExpressionEvaluator). All internal
 * objects are created with Object.create(null) (no prototype): even literally
 * assigning to the "__proto__" key cannot escalate to Object.prototype, and that
 * specific key is explicitly blocked by FORBIDDEN_KEYS as defense-in-depth.
 */
export class DataStore {
  #eventBus;
  #data = Object.create(null);

  /**
   * @param {import("./EventBus.js").EventBus} eventBus
   */
  constructor(eventBus) {
    if (!eventBus) throw new Error("DataStore: eventBus is required.");
    this.#eventBus = eventBus;
  }

  /**
   * Replaces the entire store. Reconstructs each object level with
   * Object.create(null), not just the root level -- ensuring a nested state.data
   * loaded from JSON cannot slip in an object with a standard prototype at an
   * intermediate level.
   * @param {object} data
   */
  loadData(data = {}) {
    this.#data = DataStore.#sanitizeClone(data);
  }

  /**
   * Serializable copy of current state, for export or logging.
   * @returns {object}
   */
  getSnapshot() {
    return structuredClone(this.#data);
  }

  /**
   * @param {string} path - Dot-notation path (e.g. "user.name").
   * @returns {*}
   */
  get(path) {
    if (!path || typeof path !== "string") return undefined;

    const parts = path.split(".");
    let current = this.#data;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (FORBIDDEN_KEYS.has(part)) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * @param {string} path
   * @param {*} value
   */
  set(path, value) {
    if (!path || typeof path !== "string") return;

    const parts = path.split(".");
    if (parts.some((p) => FORBIDDEN_KEYS.has(p))) {
      // Blocked path: change is not applied and no event is emitted. Fails
      // silently on purpose (dataStore.set should never hang an action flow
      // due to a malicious path).
      return;
    }

    let current = this.#data;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
        current[part] = Object.create(null);
      }
      current = current[part];
    }

    const lastKey = parts[parts.length - 1];
    const previousValue = current[lastKey];

    if (previousValue === value) return;

    current[lastKey] = value;

    this.#eventBus.emit(Events.DATA_CHANGED, { path, value, previousValue });
  }

  /**
   * Resolves a "{{...}}" template. If template is a single pure expression
   * ("{{path}}"), returns raw value (preserves type: boolean, number, object).
   * If expression has comparison/logical operators (>, <, ===, &&, ||, ?, etc.),
   * delegates to ExpressionEvaluator. If template mixes text with one or more
   * expressions, always casts to String.
   * @param {string} templateStr
   * @returns {*}
   */
  interpolate(templateStr) {
    if (typeof templateStr !== "string" || !templateStr.includes("{{")) {
      return templateStr;
    }

    const singleMatch = templateStr.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (singleMatch) {
      const expr = singleMatch[1];
      if (this.#hasOperators(expr)) {
        return ExpressionEvaluator.evaluate(expr, this);
      }
      const directVal = this.get(expr);
      return directVal !== undefined ? directVal : "";
    }

    return templateStr.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
      if (this.#hasOperators(expr)) {
        const val = ExpressionEvaluator.evaluate(expr, this);
        return val !== undefined && val !== null ? String(val) : "";
      }
      const val = this.get(expr);
      return val !== undefined && val !== null ? String(val) : "";
    });
  }

  // Detects if an expression needs evaluation (ExpressionEvaluator) instead of
  // being resolved as a simple DataStore path. Includes '?' along with
  // comparison/logical/arithmetic operators: a "pure" ternary without other
  // operators (e.g. "power ? 'ON' : 'OFF'") contains none of the other characters
  // of this class, so without '?' here it was mistakenly treated as if
  // "power ? 'ON' : 'OFF'" were literally the name of a path in the DataStore —
  // which never existed, causing binding to render "".
  #hasOperators(str) {
    return /[!=><&|/+*?-]/.test(str);
  }

  /**
   * Deeply clones a value recreating each object level with Object.create(null)
   * (arrays and primitives are preserved as-is).
   * @param {*} value
   * @returns {*}
   */
  static #sanitizeClone(value) {
    if (Array.isArray(value)) {
      return value.map((item) => DataStore.#sanitizeClone(item));
    }
    if (value && typeof value === "object") {
      const clone = Object.create(null);
      for (const [key, val] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        clone[key] = DataStore.#sanitizeClone(val);
      }
      return clone;
    }
    return value;
  }
}
