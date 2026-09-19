// ==========================================
// FILE: src/plugins/RealtimePlugin.js
// ==========================================

import { Events } from "../core/Events.js";
import { NetworkError } from "../core/AppError.js";

/**
 * RealtimePlugin — src/plugins/RealtimePlugin.js
 *
 * Real-time data channel via WebSocket. Translates incoming server messages
 * to the same EventBus events that are triggered by any user interaction
 * (ADD_NODE, REMOVE_NODE, MOVE_NODE, REPLACE_BRANCH, DataStore.set) — does not
 * require changes in Renderer or BindingEngine; the socket is simply another
 * producer on the same bus.
 *
 * Endpoint resolution priority:
 * 1. options.endpoint — explicit when registering plugin.
 * 2. Handshake response (Events.HANDSHAKE_COMPLETE), if backend returns
 *    { realtime: { endpoint, token? } }. Allows server to decide endpoint/token
 *    in handshake round-trip without a second config endpoint.
 * 3. app._mergedConfig.wsEndpoint (spacepeech.config.json / configUrl).
 * 4. Derived from baseUrl (http→ws, https→wss) + options.path (default "/ws"),
 *    if options.deriveFromBaseUrl !== false.
 *
 * If no method resolves a URL, plugin remains installed but inert — does not throw
 * errors (same "fail-open" criteria as loadConfigFile).
 */
export const RealtimePlugin = {
  name: "realtime",

  /**
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @param {object} [options={}]
   * @param {string} [options.endpoint] - Explicit ws(s):// URL, highest priority.
   * @param {string} [options.token] - Initial session token, if already known.
   * @param {string} [options.path="/ws"] - Path to use if derived from baseUrl.
   * @param {boolean} [options.deriveFromBaseUrl=true]
   * @param {number[]} [options.backoffMs=[1000,2000,4000,8000]] - Reconnection retry delays.
   * @param {boolean} [options.connectOnFirstRender=true] - Waits for STATE_CHANGED before opening socket.
   */
  async install(app, options = {}) {
    const backoff = options.backoffMs || [1000, 2000, 4000, 8000];
    const path = options.path || "/ws";
    const deriveFromBaseUrl = options.deriveFromBaseUrl !== false;
    const waitForFirstRender = options.connectOnFirstRender !== false;

    let socket = null;
    let generation = 0;
    let reconnectAttempt = 0;
    let hasRenderedOnce = !waitForFirstRender;
    let resolvedEndpoint = options.endpoint || app._mergedConfig?.wsEndpoint || null;
    let authToken = options.token || null;

    // ── URL Resolution Helpers ───────────────────────────────────────────────

    const deriveWsUrl = () => {
      const base = app._mergedConfig?.baseUrl;
      if (!base) return null;
      try {
        const httpUrl = new URL(base, window.location.href);
        httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
        httpUrl.pathname = path;
        return httpUrl.toString();
      } catch {
        return null;
      }
    };

    const buildUrl = () => {
      const url = resolvedEndpoint || (deriveFromBaseUrl ? deriveWsUrl() : null);
      if (!url) return null;
      if (!authToken) return url;
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}token=${encodeURIComponent(authToken)}`;
    };

    // ── Routing incoming messages to existing EventBus ───────────────────────

    const routeMessage = (msg) => {
      if (!msg || typeof msg !== "object" || !msg.type) return;

      switch (msg.type) {
        case "data.patch":
          if (msg.path) app.dataStore.set(msg.path, msg.value);
          break;

        case "node.insert":
          if (msg.jsonNode) {
            app.eventBus.emit(Events.ADD_NODE, {
              jsonNode: msg.jsonNode,
              targetId: msg.targetId,
              parentId: msg.parentId
            });
          }
          break;

        case "node.remove":
          if (msg.nodeId) app.eventBus.emit(Events.REMOVE_NODE, { nodeId: msg.nodeId });
          break;

        case "node.move":
          if (msg.nodeId) {
            app.eventBus.emit(Events.MOVE_NODE, {
              nodeId: msg.nodeId,
              targetParentId: msg.targetParentId
            });
          }
          break;

        case "branch.replace":
          if (msg.targetId && msg.newBranch) {
            app.eventBus.emit(Events.REPLACE_BRANCH, {
              targetId: msg.targetId,
              newBranch: msg.newBranch
            });
          }
          break;

        case "state.reload":
          if (msg.state) app.loadState(msg.state);
          break;

        default:
          // Open namespace: application messages that do not mutate the tree directly
          // (notifications, presence, etc.) are re-emitted as-is for plugins/actions.
          app.eventBus.emit(Events.REALTIME_MESSAGE, msg);
      }
    };

    // ── Connection cycle with generation-based reconnection ──────────────────
    // "generation" invalidates older socket handlers when a new one opens (e.g. backend
    // changes endpoint in a later handshake), preventing a late "close" event from the
    // previous socket from overwriting current socket state.

    const tryConnect = () => {
      const url = buildUrl();
      if (!url) return;

      const myGeneration = ++generation;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        app.errorReporter?.reportError(
          new NetworkError(`RealtimePlugin: invalid WebSocket URL "${url}"`, { cause: err })
        );
        return;
      }
      socket = ws;

      ws.addEventListener("open", () => {
        if (myGeneration !== generation) return;
        reconnectAttempt = 0;
        app.eventBus.emit(Events.REALTIME_CONNECTED, { url });
      });

      ws.addEventListener("message", (event) => {
        if (myGeneration !== generation) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          app.errorReporter?.warn("RealtimePlugin: non-JSON message discarded.", event.data);
          return;
        }
        routeMessage(msg);
      });

      ws.addEventListener("close", () => {
        if (myGeneration !== generation) return;
        socket = null;
        app.eventBus.emit(Events.REALTIME_DISCONNECTED, {});
        if (reconnectAttempt < backoff.length) {
          const delay = backoff[reconnectAttempt++];
          setTimeout(() => {
            if (myGeneration === generation) tryConnect();
          }, delay);
        }
      });

      ws.addEventListener("error", () => {
        if (myGeneration !== generation) return;
        app.errorReporter?.warn("RealtimePlugin: WebSocket connection error.");
      });
    };

    // ── Startup: wait for first render unless requested otherwise ────────────

    const onFirstRender = () => {
      hasRenderedOnce = true;
      app.eventBus.off(Events.STATE_CHANGED, onFirstRender);
      tryConnect();
    };

    if (waitForFirstRender) {
      app.eventBus.on(Events.STATE_CHANGED, onFirstRender);
    } else {
      tryConnect();
    }

    // ── Handshake: backend can resolve or update endpoint/token ──────────────

    app.eventBus.on(Events.HANDSHAKE_COMPLETE, ({ response }) => {
      const realtime = response?.realtime;
      if (!realtime) return;

      if (realtime.token) authToken = realtime.token;

      const newEndpoint = realtime.endpoint;
      if (newEndpoint && newEndpoint !== resolvedEndpoint) {
        resolvedEndpoint = newEndpoint;
        if (hasRenderedOnce) {
          generation++; // invalidates old socket before reopening with the new endpoint
          if (socket) socket.close();
          reconnectAttempt = 0;
          tryConnect();
        }
        // If there was no first render yet, the endpoint remains saved and
        // onFirstRender() connects when appropriate.
      } else if (hasRenderedOnce && !socket) {
        tryConnect();
      }
    });

    // ── Declarative actions callable from JSON ────────────────────────────────

    app.actionManager.register("ws.send", async (params) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        app.errorReporter?.warn("RealtimePlugin: ws.send discarded, the socket is not open.");
        return;
      }
      socket.send(JSON.stringify(params));
    });

    app.actionManager.register("ws.reconnect", async () => {
      generation++;
      if (socket) socket.close();
      reconnectAttempt = 0;
      tryConnect();
    });
  }
};
