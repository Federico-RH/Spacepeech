// ==========================================
// FILE: src/core/SystemActions.js
// ==========================================

import { Events } from "./Events.js";

const activeTimers = new Map();

/**
 * SystemActions — src/core/SystemActions.js
 *
 * Catalog of built-in actions (System outputs, timers, and remote queries).
 */
export const SystemActions = {
  "sys.set": async ({ path, value }, { dataStore }) => {
    if (!path) return;
    dataStore.set(path, value);
  },

  "sys.toggle": async ({ path }, { dataStore }) => {
    if (!path) return;
    const current = Boolean(dataStore.get(path));
    dataStore.set(path, !current);
  },

  "sys.increment": async ({ path, delta = 1 }, { dataStore }) => {
    if (!path) return;
    const current = Number(dataStore.get(path)) || 0;
    dataStore.set(path, current + Number(delta));
  },

  "sys.navigate": async ({ page, url }, { dom }) => {
    if (url) {
      dom.navigate(url);
    } else if (page) {
      dom.navigate(`?page=${encodeURIComponent(page)}`);
    }
  },

  "sys.copy": async ({ text }, { dom }) => {
    if (text !== undefined && text !== null) {
      await dom.copyToClipboard(String(text));
    }
  },

  "sys.toggleFullscreen": async (_, { dom }) => {
    await dom.toggleFullscreen();
  },

  "sys.pingNode": async ({ targetId }, { nodeId, dataService, eventBus }) => {
    const id = targetId || nodeId;
    if (!id) return;

    try {
      if (dataService) {
        const result = await dataService.pingNode(id);
        if (result && typeof result === "object") {
          for (const [key, val] of Object.entries(result)) {
            if (key !== "cardId" && key !== "nodeId") {
              const cssProp = key === "bgColor" ? "background" : key;
              eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: id, prop: `style.${cssProp}`, value: val });
            }
          }
          return result;
        }
      }
    } catch {
      const randomHue1 = Math.floor(Math.random() * 360);
      const randomHue2 = (randomHue1 + 60) % 360;
      const fallbackBg = `linear-gradient(135deg, hsl(${randomHue1}, 70%, 15%) 0%, hsl(${randomHue2}, 80%, 25%) 100%)`;
      eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: id, prop: "style.background", value: fallbackBg });
    }
  },

  "sys.emit": async ({ event, payload = {} }, { eventBus }) => {
    if (event) {
      eventBus.emit(event, payload);
    }
  },

  "sys.setInterval": async ({ id, timerId, intervalMs = 1000, action }, context) => {
    const key = timerId || id || `timer_${Math.random().toString(36).slice(2, 9)}`;
    if (activeTimers.has(key)) {
      clearInterval(activeTimers.get(key));
      activeTimers.delete(key);
    }

    if (!action || !context.actionManager) return;

    const intervalHandle = setInterval(async () => {
      try {
        await context.actionManager.dispatch(action, { nodeId: context.nodeId });
      } catch (err) {
        context.errorReporter?.reportError(err);
      }
    }, Number(intervalMs));

    activeTimers.set(key, intervalHandle);
  },

  "sys.clearInterval": async ({ id, timerId }) => {
    const key = timerId || id;
    if (!key) {
      for (const handle of activeTimers.values()) clearInterval(handle);
      activeTimers.clear();
      return;
    }

    if (activeTimers.has(key)) {
      clearInterval(activeTimers.get(key));
      activeTimers.delete(key);
    }
  },

  "sys.timeout": async ({ intervalMs = 1000, delayMs, action }, context) => {
    const ms = Number(delayMs ?? intervalMs);
    if (!action || !context.actionManager) return;

    setTimeout(async () => {
      try {
        await context.actionManager.dispatch(action, { nodeId: context.nodeId });
      } catch (err) {
        context.errorReporter?.reportError(err);
      }
    }, ms);
  },

  "sys.fetch": async ({ url, targetPath = "" }, { dataStore, errorReporter }) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
      const payload = await response.json();

      if (targetPath) {
        dataStore.set(targetPath, payload);
      } else if (payload && typeof payload === "object") {
        for (const [key, val] of Object.entries(payload)) {
          dataStore.set(key, val);
        }
      }
    } catch (err) {
      errorReporter?.reportError(err);
    }
  }
};
