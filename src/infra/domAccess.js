/**
 * DomAccess — src/infra/domAccess.js
 *
 * Low-level bridge to real DOM and browser APIs.
 * Supports standard node creation and XML namespace (SVG) nodes.
 */
export class DomAccess {
  constructor() {
    this.doc = document;
    this.win = window;
  }

  createElement = (tag) => this.doc.createElement(tag);
  createElementNS = (ns, tag) => this.doc.createElementNS(ns, tag);
  querySelectorAll = (selector) => this.doc.querySelectorAll(selector);
  getRootElement = () => this.doc.documentElement;

  createDocumentFragment = () => this.doc.createDocumentFragment();
  createTextNode = (text) => this.doc.createTextNode(text);
  appendToHead = (el) => this.doc.head?.appendChild(el);

  getActiveElement = () => this.doc.activeElement;
  setTitle = (title) => { this.doc.title = title; };

  requestFrame = (callback) => this.win.requestAnimationFrame(callback);
  cancelFrame = (id) => this.win.cancelAnimationFrame(id);

  getUrlParam = (param) => new URLSearchParams(this.win.location.search).get(param);
  getInjectedState = (key = "__SPACEPEECH_STATE__") => this.win[key] ?? null;

  navigate = (url) => { this.win.location.href = url; };
  copyToClipboard = async (text) => this.win.navigator.clipboard?.writeText(text);

  toggleFullscreen = async () => {
    if (!this.doc.fullscreenElement) {
      await this.doc.documentElement.requestFullscreen?.();
    } else {
      await this.doc.exitFullscreen?.();
    }
  };
}
