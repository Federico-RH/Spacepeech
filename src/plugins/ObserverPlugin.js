// ==========================================
// FILE: src/plugins/ObserverPlugin.js
// ==========================================

import { Events } from "../core/Events.js";

/**
 * ObserverPlugin — src/plugins/ObserverPlugin.js
 *
 * Manages on-screen visibility detection using IntersectionObserver.
 * Auto-detects nodes with "observe: true" and provides infinite scroll and lazy loading actions.
 */
export const ObserverPlugin = {
  name: "observer-plugin",

  async install(app, options = {}) {
    const observerConfig = {
      root: null,
      rootMargin: options.rootMargin || "150px", // Preventive margin to preload before reaching the end
      threshold: options.threshold !== undefined ? options.threshold : 0.1,
    };

    const observedNodes = new Map();

    const intersectionCallback = (entries) => {
      for (const entry of entries) {
        const targetId = entry.target.id;
        if (!targetId || !observedNodes.has(targetId)) continue;

        const config = observedNodes.get(targetId);

        if (entry.isIntersecting) {
          if (config.onEnter) {
            app.actionManager.dispatch(config.onEnter, {
              nodeId: targetId,
              event: { type: "intersection.enter", ratio: entry.intersectionRatio },
            });
          }

          if (config.once) {
            observer.unobserve(entry.target);
            observedNodes.delete(targetId);
          }
        } else if (config.onExit) {
          app.actionManager.dispatch(config.onExit, {
            nodeId: targetId,
            event: { type: "intersection.exit", ratio: entry.intersectionRatio },
          });
        }
      }
    };

    const observer = new IntersectionObserver(intersectionCallback, observerConfig);

    // ─── Auto-scanning tree on state load or node additions ──────────────────

    const scanAndObserve = (node) => {
      if (!node || typeof node !== "object") return;

      if (node.id && (node.observe || node.data?.observe)) {
        const actions = node.actions?.intersect || node.actions?.enter || node.actions?.click;
        if (actions) {
          const isOnce = node.observeOnce !== undefined ? node.observeOnce : true;
          // Wait for next animation frame to ensure element is in the DOM
          app.dom.requestFrame(() => {
            const el = app.dom.getHtmlEl(node.id);
            if (el) {
              observedNodes.set(node.id, { onEnter: actions, once: isOnce });
              observer.observe(el);
            }
          });
        }
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(scanAndObserve);
      }
    };

    app.eventBus.on(Events.STATE_CHANGED, ({ state }) => {
      if (state?.root) scanAndObserve(state.root);
    });

    app.eventBus.on(Events.NODE_INSERTED, ({ jsonNode }) => {
      if (jsonNode) scanAndObserve(jsonNode);
    });

    app.eventBus.on(Events.NODE_REMOVED, ({ nodeId }) => {
      if (observedNodes.has(nodeId)) {
        const el = app.dom.getHtmlEl(nodeId);
        if (el) observer.unobserve(el);
        observedNodes.delete(nodeId);
      }
    });

    // ─── Action Registration ─────────────────────────────────────────────────

    app.actionManager.register("observer.observe", async ({ targetId, onEnter, onExit, once = true }, ctx) => {
      const id = targetId || ctx.nodeId;
      if (!id) return;

      const element = ctx.dom.getHtmlEl(id);
      if (!element) return;

      observedNodes.set(id, { onEnter, onExit, once: Boolean(once) });
      observer.observe(element);
    });

    app.actionManager.register("observer.unobserve", async ({ targetId }, ctx) => {
      const id = targetId || ctx.nodeId;
      if (!id) return;

      const element = ctx.dom.getHtmlEl(id);
      if (element) observer.unobserve(element);
      observedNodes.delete(id);
    });

    app.actionManager.register("pagination.appendBatch", async ({ containerId, nodes = [], nextIndicatorId }, ctx) => {
      const targetContainer = containerId || ctx.nodeId;
      if (!targetContainer || !Array.isArray(nodes)) return;

      for (const node of nodes) {
        app.eventBus.emit(Events.ADD_NODE, {
          jsonNode: node,
          parentId: targetContainer,
        });
      }

      if (nextIndicatorId) {
        app.dom.requestFrame(() => {
          const el = ctx.dom.getHtmlEl(nextIndicatorId);
          if (el && observedNodes.has(nextIndicatorId)) {
            observer.observe(el);
          }
        });
      }
    });
  }
};
