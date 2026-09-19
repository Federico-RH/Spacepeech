import { DomAccess } from "../infra/domAccess.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg", "path", "circle", "rect", "line", "polyline",
  "polygon", "g", "text", "tspan", "defs", "use",
  "clippath", "lineargradient", "radialgradient", "stop", "mask"
]);

/**
 * DomFacade — src/adapters/DomFacade.js
 *
 * Safe access facade for DOM elements and APIs.
 * Transparently creates HTML or SVG elements based on tag name.
 */
export class DomFacade {
  constructor(domManager) {
    if (!domManager) throw new Error("DomFacade: domManager is required.");
    this.dom = domManager;
    this._htmlElCache = new Map();
    this._queryRoot = this.dom.doc;
  }

  setQueryRoot(root) {
    this._queryRoot = root || this.dom.doc;
  }

  getHtmlEl(nodeId) {
    if (!nodeId) return null;
    if (this._htmlElCache.has(nodeId)) {
      const cached = this._htmlElCache.get(nodeId);
      if (cached?.isConnected) return cached;
      this._htmlElCache.delete(nodeId);
    }
    const root = this._queryRoot || this.dom.doc;
    const htmlEl = root.getElementById(nodeId);
    if (htmlEl) this._htmlElCache.set(nodeId, htmlEl);
    return htmlEl;
  }

  querySelector(selector) {
    if (!selector) return null;
    const root = this._queryRoot || this.dom.doc;
    return root.querySelector(selector);
  }

  clearElCache() {
    this._htmlElCache.clear();
  }

  createHtmlEl(tag, className = "", props = {}) {
    if (!tag) throw new Error("DomFacade.createHtmlEl: tag is required.");

    const isSvg = SVG_TAGS.has(tag.toLowerCase());
    const element = isSvg
      ? this.dom.createElementNS(SVG_NAMESPACE, tag.toLowerCase())
      : this.dom.createElement(tag);

    if (className) {
      if (isSvg) {
        element.setAttribute("class", className);
      } else {
        element.className = className;
      }
    }

    const { style, dataset, children, ...rest } = props;

    for (const [key, val] of Object.entries(rest)) {
      if (val === undefined || val === null) continue;
      if (isSvg || key.includes("-") || key === "viewBox") {
        element.setAttribute(key, String(val));
      } else {
        element[key] = val;
      }
    }

    if (style && typeof style === "object") {
      Object.assign(element.style, style);
    }

    if (dataset && typeof dataset === "object" && !isSvg) {
      Object.assign(element.dataset, dataset);
    }

    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child == null) return;
        element.appendChild(
          typeof child === "string" ? this.dom.createTextNode(child) : child
        );
      });
    }

    return element;
  }

  selectAll(selector) {
    return this.dom.querySelectorAll(selector);
  }

  createDocumentFragment() {
    return this.dom.createDocumentFragment();
  }

  createTextNode(text) {
    return this.dom.createTextNode(text);
  }

  appendToHead(el) {
    return this.dom.appendToHead(el);
  }

  getActiveElement() {
    return this.dom.getActiveElement();
  }

  setTitle(title) {
    if (typeof title === "string") {
      this.dom.setTitle(title);
    }
  }

  requestFrame(callback) {
    return this.dom.requestFrame(callback);
  }

  cancelFrame(id) {
    return this.dom.cancelFrame(id);
  }

  getUrlParam(param) {
    return this.dom.getUrlParam(param);
  }

  getInjectedState(key) {
    return this.dom.getInjectedState(key);
  }

  navigate(url) {
    this.dom.navigate(url);
  }

  async copyToClipboard(text) {
    return this.dom.copyToClipboard(text);
  }

  async toggleFullscreen() {
    return this.dom.toggleFullscreen();
  }

  getTheme() {
    return this.dom.getRootElement().getAttribute("data-theme") || "light";
  }
}

export const dom = new DomFacade(new DomAccess());
