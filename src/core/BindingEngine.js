// ==========================================
// FILE: src/core/BindingEngine.js
// ==========================================

import { Events } from "./Events.js";

// Matches a template that is EXACTLY a single expression without surrounding text
// (e.g. "{{acceptTerms}}"), unlike a mixed one like "Hello {{name}}!".
// Used to decide whether to preserve original data type instead of forcing String.
const PURE_EXPRESSION_RE = /^\{\{\s*([\w$.-]+)\s*\}\}$/;

/**
 * BindingEngine — src/core/BindingEngine.js
 *
 * Manages in-memory data dependency graph (O(1) updates).
 * Indexes {{variable}} expressions and 'bind' directives supporting dashed namespaces.
 */
export class BindingEngine {
  /**
   * @param {import("./EventBus.js").EventBus} eventBus
   * @param {import("./DataStore.js").DataStore} dataStore
   */
  constructor(eventBus, dataStore) {
    this.eventBus = eventBus;
    this.dataStore = dataStore;
    this.dependencyMap = new Map();

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus.on(Events.DATA_CHANGED, ({ path }) => {
      this._notifyDependencies(path);
    });

    this.eventBus.on(Events.SET_DATA_PROP, ({ path, value }) => {
      this.dataStore.set(path, value);
    });
  }

  indexBindings(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) this.indexBindings(item);
      return;
    }

    // 1. Two-way binding on inputs / selects
    if (node.id && node.bind) {
      this._registerDependency(node.bind, {
        nodeId: node.id,
        targetProp: "data.value",
        template: `{{${node.bind}}}`
      });
    }

    // 2. One-way binding on content data (node.data)
    if (node.id && node.data) {
      for (const [key, val] of Object.entries(node.data)) {
        if (typeof val === "string") {
          this._extractExpressions(val, node.id, `data.${key}`);
        }
      }
    }

    // 3. One-way binding on class attributes (node.class)
    if (node.id && typeof node.class === "string") {
      this._extractExpressions(node.class, node.id, "class");
    }

    // 4. One-way binding on styles (node.style)
    if (node.id && node.style && typeof node.style === "object") {
      this._indexStyleBindings(node.style, node.id);
    }

    // 5. Recursive traversal of children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.indexBindings(child);
      }
    }
  }

  applyBindings(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) this.applyBindings(item);
      return;
    }

    if (node.bind) {
      node.data = node.data || {};
      const boundValue = this.dataStore.get(node.bind);
      if (boundValue !== undefined) {
        node.data.value = boundValue;
      }
    }

    if (node.data) {
      for (const [key, val] of Object.entries(node.data)) {
        if (typeof val === "string" && val.includes("{{")) {
          node.data[key] = this._resolveTemplateValue(val);
        }
      }
    }

    if (typeof node.class === "string" && node.class.includes("{{")) {
      node.class = this.dataStore.interpolate(node.class);
    }

    if (node.style && typeof node.style === "object") {
      this._applyStyleBindings(node.style);
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.applyBindings(child);
      }
    }
  }

  clear() {
    this.dependencyMap.clear();
  }

  removeBindings(node) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) this.removeBindings(item);
      return;
    }

    if (node.id) {
      for (const [dataKey, subscriptions] of this.dependencyMap.entries()) {
        const filtered = subscriptions.filter(sub => sub.nodeId !== node.id);
        if (filtered.length !== subscriptions.length) {
          if (filtered.length > 0) {
            this.dependencyMap.set(dataKey, filtered);
          } else {
            this.dependencyMap.delete(dataKey);
          }
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.removeBindings(child);
      }
    }
  }

  _indexStyleBindings(styleObj, nodeId, prefix = "style") {
    for (const [prop, val] of Object.entries(styleObj)) {
      if (typeof val === "string") {
        this._extractExpressions(val, nodeId, `${prefix}.${prop}`);
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        this._indexStyleBindings(val, nodeId, `${prefix}.${prop}`);
      }
    }
  }

  _applyStyleBindings(styleObj) {
    for (const [prop, val] of Object.entries(styleObj)) {
      if (typeof val === "string" && val.includes("{{")) {
        styleObj[prop] = this.dataStore.interpolate(val);
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        this._applyStyleBindings(val);
      }
    }
  }

  _extractExpressions(template, nodeId, targetProp) {
    const matches = template.matchAll(/\{\{\s*([\w$.-]+)\s*\}\}/g);
    for (const match of matches) {
      const dataKey = match[1];
      this._registerDependency(dataKey, { nodeId, targetProp, template });
    }
  }

  _registerDependency(dataKey, record) {
    if (!this.dependencyMap.has(dataKey)) {
      this.dependencyMap.set(dataKey, []);
    }
    const list = this.dependencyMap.get(dataKey);
    const exists = list.some(r => r.nodeId === record.nodeId && r.targetProp === record.targetProp);
    if (!exists) {
      list.push(record);
    }
  }

  _notifyDependencies(changedPath) {
    for (const [key, subscriptions] of this.dependencyMap.entries()) {
      if (changedPath === key || key.startsWith(`${changedPath}.`) || changedPath.startsWith(`${key}.`)) {
        for (const sub of subscriptions) {
          const resolvedValue = this._resolveTemplateValue(sub.template);
          this.eventBus.emit(Events.UPDATE_NODE_PROP, {
            nodeId: sub.nodeId,
            prop: sub.targetProp,
            value: resolvedValue
          });
        }
      }
    }
  }

  /**
   * Resolves final template value for a reactive notification or initial binding application.
   *
   * If template is a PURE expression (only "{{path}}", without surrounding text), returns
   * the raw DataStore value — preserving its original type (boolean, number, object). If it
   * mixes text with the expression (e.g. "Hello {{name}}!"), continues interpolating as
   * string, which is the only meaningful behavior there.
   *
   * Without this, dataStore.interpolate() ALWAYS casts with String(value) — which specifically
   * broke two-way binding checkboxes: Boolean("false") is `true` in JS (any non-empty string is truthy),
   * so upon retriggering update, a checkbox could never remain unchecked — the reactive echo
   * would re-check it in the same tick.
   * @param {string} template
   * @returns {*}
   */
  _resolveTemplateValue(template) {
    const pureMatch = PURE_EXPRESSION_RE.exec(template);
    if (pureMatch) {
      return this.dataStore.get(pureMatch[1]);
    }
    return this.dataStore.interpolate(template);
  }
}
