// ==========================================
// FILE: src/infra/DataService.js
// ==========================================

import { NetworkError } from "../core/AppError.js";

/**
 * DataService.js — src/infra/DataService.js
 *
 * Centralized HTTP communication abstraction for Spacepeech.
 * Supports remote sources (API) and local/static sources (JSON files on disk).
 */
export class DataService {
  /**
   * @param {string|object} [config=""] — Server base URL or full configuration.
   */
  constructor(config = "") {
    if (typeof config === "string") {
      this._base = config.replace(/\/$/, "");
      this._source = "api";
      this._staticPath = "./pages";
    } else {
      this._base = (config.baseUrl || "").replace(/\/$/, "");
      this._source = config.source || "api"; // "api" | "static" | "local"
      this._staticPath = (config.staticPath || "./pages").replace(/\/$/, "");
    }
  }

  get source() {
    return this._source;
  }

  get baseUrl() {
    return this._base;
  }

  // ─── Pages ─────────────────────────────────────────────────────────────────

  async loadPage(pageId) {
    if (!pageId) throw new Error("DataService.loadPage: pageId is required.");

    if (this._source === "static" || this._source === "local") {
      return this._get(`${this._staticPath}/${encodeURIComponent(pageId)}.json`);
    }

    return this._get(`/api/page/${encodeURIComponent(pageId)}`);
  }

  /**
   * Requests a random data patch from the server for a specific node.
   * @param {string} nodeId
   */
  async pingNode(nodeId) {
    if (!nodeId) throw new Error("DataService.pingNode: nodeId is required.");
    return this._get(`/api/card/${encodeURIComponent(nodeId)}/ping`);
  }

  /**
   * Sends client specifications to the backend (initial Handshake).
   * @param {string} endpoint
   * @param {object} payload
   */
  async sendHandshake(endpoint, payload) {
    if (!endpoint) return null;
    return this._post(endpoint, payload);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  async _get(path) {
    const url = path.startsWith("http") || path.startsWith("./") || path.startsWith("/") && !this._base
      ? path
      : `${this._base}${path}`;

    let response;
    try {
      response = await fetch(url);
    } catch (networkErr) {
      throw new NetworkError(`DataService: network error on GET ${url} — ${networkErr.message}`, {
        context: { path: url }, cause: networkErr
      });
    }
    return this._handleResponse(response, `GET ${url}`);
  }

  async _post(path, bodyData) {
    const url = path.startsWith("http") ? path : `${this._base}${path}`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });
    } catch (networkErr) {
      throw new NetworkError(`DataService: network error on POST ${url} — ${networkErr.message}`, {
        context: { path: url }, cause: networkErr
      });
    }
    return this._handleResponse(response, `POST ${url}`);
  }

  async _handleResponse(response, context) {
    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody.error || JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new NetworkError(`DataService: ${context} failed (${response.status}) — ${detail}`, {
        context: { httpStatus: response.status, detail }
      });
    }
    return response.json();
  }
}
