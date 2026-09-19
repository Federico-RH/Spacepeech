// ==========================================
// FILE: src/adapters/StyleManager.js
// ==========================================

import { Events } from "../core/Events.js";

/**
 * StyleManager — src/adapters/StyleManager.js
 *
 * Manages generation and injection of CSS styles (global and per-node) into <head>.
 * Directly converts JSON CSS properties to native rules without intermediate parsers.
 */

const STYLE_IDS = Object.freeze({
  GLOBAL: "dynamic-global-css",
  NODES: "dynamic-nodes-css",
});

export class StyleManager {
  #nodeStylesCache = new Map();
  #flushFrameId = null;

  /**
   * @param {import("../core/EventBus.js").EventBus} eventBus
   * @param {import("./DomFacade.js").DomFacade} dom
   * @param {import("../core/ErrorReporter.js").ErrorReporter} errorReporter
   */
  constructor(eventBus, dom, errorReporter) {
    if (!eventBus) throw new Error("StyleManager: eventBus is required.");
    if (!dom) throw new Error("StyleManager: dom is required.");

    this.eventBus = eventBus;
    this.dom = dom;
    this.errorReporter = errorReporter;

    // 1. Full state loading or reset
    this.eventBus.on(Events.STATE_CHANGED, ({ state }) => {
      if (state?.css !== undefined) this.injectGlobalCss(state.css);
      this._rebuildNodeStyles(state?.root);
    });

    // 2. Dynamic insertion of new branches (Infinite Scroll / Pagination)
    this.eventBus.on(Events.NODE_INSERTED, ({ jsonNode }) => {
      if (jsonNode?.id) {
        this._updateNodeStyle(jsonNode);
      }
    });

    // 3. Style mutation of an existing node
    this.eventBus.on(Events.NODE_UPDATED, ({ jsonNode }) => {
      if (jsonNode?.id) {
        this._updateNodeStyle(jsonNode);
      }
    });

    // 4. Node removal
    this.eventBus.on(Events.NODE_REMOVED, ({ nodeId }) => {
      if (this.#nodeStylesCache.delete(nodeId)) {
        this._scheduleFlush();
      }
    });
  }

  // ─── Global CSS ────────────────────────────────────────────────────────────

  injectGlobalCss(cssString) {
    let styleTag = this.dom.getHtmlEl(STYLE_IDS.GLOBAL);
    if (!styleTag) {
      styleTag = this.dom.createHtmlEl("style");
      styleTag.id = STYLE_IDS.GLOBAL;
      this.dom.appendToHead(styleTag);
    }
    styleTag.textContent = cssString || "";
  }

  // ─── Per-Node CSS ──────────────────────────────────────────────────────────

  _rebuildNodeStyles(rootNode) {
    this.#nodeStylesCache.clear();
    if (rootNode) this._collectStylesRecursively(rootNode);
    this._scheduleFlush();
  }

  _updateNodeStyle(node) {
    if (!node?.id) return;
    this._collectStylesRecursively(node);
    this._scheduleFlush();
  }

  _collectStylesRecursively(node) {
    if (!node || typeof node !== "object") return;

    if (node.id && node.style) {
      const { hover, disabled, ...baseStyle } = node.style;
      this.#nodeStylesCache.set(node.id, {
        base: this._objectToCssRules(baseStyle),
        hover: hover ? this._objectToCssRules(hover) : null,
        disabled: disabled ? this._objectToCssRules(disabled) : null,
      });
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this._collectStylesRecursively(child);
      }
    }
  }

  _objectToCssRules(styleObj) {
    if (!styleObj || typeof styleObj !== "object") return "";
    const rules = [];
    for (const [prop, val] of Object.entries(styleObj)) {
      if (val === undefined || val === null || val === "") continue;
      // Converts camelCase to kebab-case for standard CSS compatibility
      const cssProp = prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      rules.push(`${cssProp}: ${val};`);
    }
    return rules.join(" ");
  }

  _scheduleFlush() {
    if (this.#flushFrameId !== null) return;
    this.#flushFrameId = this.dom.requestFrame(() => {
      this.#flushFrameId = null;
      this._flushToDom();
    });
  }

  _flushToDom() {
    const cssLines = [];

    for (const [id, rules] of this.#nodeStylesCache) {
      if (rules.base) {
        cssLines.push(`#${id} { ${rules.base} }`);
      }
      if (rules.hover) {
        cssLines.push(`#${id}:hover, #${id}.force-hover { ${rules.hover} }`);
      }
      if (rules.disabled) {
        cssLines.push(`#${id}:disabled, #${id}[disabled], #${id}.disabled { ${rules.disabled} }`);
      }
    }

    let styleTag = this.dom.getHtmlEl(STYLE_IDS.NODES);
    if (!styleTag) {
      styleTag = this.dom.createHtmlEl("style");
      styleTag.id = STYLE_IDS.NODES;
      this.dom.appendToHead(styleTag);
    }
    styleTag.textContent = cssLines.join("\n");
  }
}
