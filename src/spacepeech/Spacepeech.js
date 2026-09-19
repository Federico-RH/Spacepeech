// =============================================================================
// FILE: src/spacepeech/Spacepeech.js
// =============================================================================

import { dom } from "../adapters/DomFacade.js";
import { errorReporter } from "../core/ErrorReporter.js";
import { Events } from "../core/Events.js";
import { EventBus } from "../core/EventBus.js";
import { DataStore } from "../core/DataStore.js";
import { BindingEngine } from "../core/BindingEngine.js";
import { ActionManager } from "../core/ActionManager.js";
import { SystemActions } from "../core/SystemActions.js";
import { SystemAdapter } from "../adapters/SystemAdapter.js";
import { SystemDriver } from "../infra/SystemDriver.js";
import {
  findNode,
  insertNode,
  extractNode,
  replaceNode,
  resolveComponentTree,
  collectMissingModules,
} from "../core/NodeTree.js";
import { StyleManager } from "../adapters/StyleManager.js";
import { Renderer } from "../engine/Renderer.js";
import { DataService } from "../infra/DataService.js";
import { PluginManager } from "../core/PluginManager.js";
import { ValidationError, NetworkError } from "../core/AppError.js";

/**
 * Spacepeech — src/spacepeech/Spacepeech.js
 *
 * Main orchestrator of Spacepeech.
 */
export class Spacepeech {
  constructor() {
    this.dom = dom;
    this.errorReporter = errorReporter;

    this.eventBus = null;
    this.dataService = null;
    this.dataStore = null;
    this.bindingEngine = null;
    this.actionManager = null;
    this.systemAdapter = null;
    this.systemDriver = null;
    this.styleManager = null;
    this.renderer = null;
    this.pluginManager = new PluginManager(this.errorReporter);

    this.isInitialized = false;
    this._currentState = null;
    this._mergedConfig = {};
  }

  // ─── Configuration Files Loading ───────────────────────────────────────────

  static async loadConfigFile(path = "spacepeech.config.json") {
    try {
      const res = await fetch(path);
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  }

  // ─── Plugin System ─────────────────────────────────────────────────────────

  async use(plugin, options = {}) {
    await this.pluginManager.use(plugin, options, this);
    return this;
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  async init(containerId = "canvas", initialStateOrOptions = null) {
    try {
      this.dom.setQueryRoot();
      this.eventBus = new EventBus();
      this.systemDriver = new SystemDriver();

      const isDirectState = Boolean(
        initialStateOrOptions &&
        typeof initialStateOrOptions === "object" &&
        (initialStateOrOptions.root || initialStateOrOptions.version)
      );

      const options = isDirectState ? {} : (initialStateOrOptions || {});
      const initialState = isDirectState ? initialStateOrOptions : (options.initialState || null);

      let fileConfig = {};
      if (options.configUrl) {
        fileConfig = await Spacepeech.loadConfigFile(options.configUrl);
      } else {
        fileConfig = this.dom.getInjectedState("__SPACEPEECH_CONFIG__") || {};
      }

      this._mergedConfig = { ...fileConfig, ...options };

      const serverBase = this._mergedConfig.baseUrl || this.dom.getUrlParam("server") || "";
      const source = this._mergedConfig.source || this.dom.getUrlParam("source") || "api";
      const staticPath = this._mergedConfig.staticPath || "./pages";

      this.dataService = new DataService({
        baseUrl: serverBase,
        source,
        staticPath
      });

      this.dataStore = new DataStore(this.eventBus);
      this.bindingEngine = new BindingEngine(this.eventBus, this.dataStore);

      this.actionManager = new ActionManager(this.eventBus, this.dataStore, {
        dom: this.dom,
        dataService: this.dataService,
        errorReporter: this.errorReporter,
      });
      this.actionManager.registerAll(SystemActions);

      this.systemAdapter = new SystemAdapter(this.dataStore);
      this.styleManager = new StyleManager(this.eventBus, this.dom, this.errorReporter);
      this.renderer = new Renderer(containerId, this.dom, this.eventBus, this.errorReporter);

      this._bindTreeEvents();
      this.isInitialized = true;

      await this.pluginManager.flushPending(this);

      // Initial telemetry to the backend. Not critical for startup: if
      // the endpoint is down or misconfigured, the error is reported but the
      // app continues loading state and rendering normally — a failure
      // here must never prevent the dashboard from displaying.
      const clientSpecs = this.systemDriver.getClientSpecs();
      if (this._mergedConfig.handshakeEndpoint) {
        try {
          const handshakeResponse = await this.dataService.sendHandshake(
            this._mergedConfig.handshakeEndpoint,
            clientSpecs
          );
          this.eventBus.emit(Events.HANDSHAKE_COMPLETE, {
            response: handshakeResponse || {},
            clientSpecs,
          });
        } catch (err) {
          this.errorReporter?.reportError(
            err instanceof NetworkError
              ? err
              : new NetworkError(
                  `Handshake failed against "${this._mergedConfig.handshakeEndpoint}"`,
                  { cause: err }
                )
          );
        }
      }

      if (initialState) {
        await this.loadState(initialState);
      } else {
        await this._autoLoad(this._mergedConfig.defaultPage);
      }
    } catch (err) {
      this.errorReporter.error("Spacepeech.init() failed:", err);
      throw err;
    }
  }

  // ─── Asynchronous Component Loading and Resolution ─────────────────────────

  async loadState(state) {
    try {
      this._validateState(state);

      const components = { ...(state.components || {}) };
      await this._resolveRemoteComponents(state.root, components);

      const instancesData = {};
      const resolvedRoot = resolveComponentTree(state.root, components, instancesData);

      const mergedData = { ...(state.data || {}), ...instancesData };

      // 1. Load state data
      this.dataStore.loadData(mergedData);

      // 2. Inject and persist system and client metrics into DataStore
      const clientSpecs = this.systemDriver.getClientSpecs();
      this.dataStore.set("$sys.client", clientSpecs);
      this.dataStore.set("$sys.viewport", {
        w: clientSpecs.viewport.w,
        h: clientSpecs.viewport.h
      });
      this.dataStore.set("$sys.online", clientSpecs.network.online);

      // 3. Start continuous sensors (Clock, Network, Viewport)
      this.systemAdapter.start({ clock: true, mouse: false, viewport: true, network: true });

      // 4. Index and apply data-binding over the resolved tree
      this.bindingEngine.clear();
      this.bindingEngine.indexBindings(resolvedRoot);
      this.bindingEngine.applyBindings(resolvedRoot);

      this._currentState = {
        version: state.version || "1.0",
        meta: state.meta || {},
        css: state.css || "",
        data: this.dataStore.getSnapshot(),
        components,
        root: resolvedRoot,
      };

      if (state.css) {
        this.styleManager.injectGlobalCss(state.css);
      }

      this._applyDocumentMeta(this._currentState.meta);

      this.eventBus.emit(Events.STATE_CHANGED, { state: this._currentState });
    } catch (err) {
      this.errorReporter.reportError(err);
    }
  }

  async _resolveRemoteComponents(rootNode, componentsMap) {
    let missingModules = collectMissingModules(rootNode, componentsMap);

    while (missingModules.length > 0) {
      const fetchedModules = await Promise.all(
        missingModules.map(async (modId) => {
          try {
            const moduleDoc = await this.dataService.loadPage(modId);
            return { modId, moduleDoc };
          } catch (err) {
            this.errorReporter.warn(`Could not load remote module "${modId}":`, err.message);
            return { modId, moduleDoc: null };
          }
        })
      );

      for (const { modId, moduleDoc } of fetchedModules) {
        if (moduleDoc) {
          componentsMap[modId] = moduleDoc;
          if (moduleDoc.components) {
            Object.assign(componentsMap, moduleDoc.components);
          }
        } else {
          componentsMap[modId] = { root: { id: `failed-${modId}`, type: "div" } };
        }
      }

      const templateRoots = Object.values(componentsMap).map((c) => c.root || c);
      missingModules = collectMissingModules(templateRoots, componentsMap);
    }
  }

  _validateState(state) {
    if (!state || typeof state !== "object") {
      throw new ValidationError("The provided state is null or invalid.");
    }
    if (!state.root || typeof state.root !== "object" || Array.isArray(state.root)) {
      throw new ValidationError("state.root must be a valid object (single root node).");
    }
    if (!state.root.id) {
      throw new ValidationError("state.root must have a unique id.");
    }
  }

  _applyDocumentMeta(meta) {
    if (!meta || typeof meta !== "object") return;
    if (meta.title) this.dom.setTitle(meta.title);
  }

  // ─── Granular Tree Management (EventBus) ───────────────────────────────────

  _bindTreeEvents() {
    this.eventBus.on(Events.ADD_NODE, async ({ jsonNode, targetId, parentId }) => {
      if (!this._currentState?.root || !jsonNode?.id) return;
      const target = targetId ?? parentId ?? null;

      try {
        await this._resolveRemoteComponents(jsonNode, this._currentState.components);
        const instancesData = {};
        const resolvedNode = resolveComponentTree(jsonNode, this._currentState.components, instancesData);

        for (const [instKey, instVal] of Object.entries(instancesData)) {
          this.dataStore.set(instKey, instVal);
        }

        this.bindingEngine.indexBindings(resolvedNode);
        this.bindingEngine.applyBindings(resolvedNode);

        insertNode(this._currentState.root, resolvedNode, target);
        this.eventBus.emit(Events.NODE_INSERTED, { jsonNode: resolvedNode, parentId: target });
      } catch (err) {
        this.errorReporter.reportError(err);
      }
    });

    this.eventBus.on(Events.REMOVE_NODE, ({ nodeId }) => {
      if (!this._currentState?.root || !nodeId) return;

      const extracted = extractNode(this._currentState.root, nodeId);
      if (extracted) {
        this.bindingEngine.removeBindings(extracted);
        this.eventBus.emit(Events.NODE_REMOVED, { nodeId });
      }
    });

    this.eventBus.on(Events.MOVE_NODE, ({ nodeId, targetParentId }) => {
      if (!this._currentState?.root || !nodeId) return;

      const extracted = extractNode(this._currentState.root, nodeId);
      if (extracted) {
        insertNode(this._currentState.root, extracted, targetParentId);
        this.eventBus.emit(Events.NODE_MOVED, { nodeId, targetNodeId: targetParentId });
      }
    });

    this.eventBus.on(Events.UPDATE_NODE_PROP, ({ nodeId, prop, value }) => {
      if (!this._currentState?.root || !nodeId) return;

      const target = findNode(this._currentState.root, nodeId);
      if (!target) return;

      if (["type", "tag", "class", "name", "active", "disabled"].includes(prop)) {
        target[prop] = value;
      } else if (prop.startsWith("style.")) {
        const path = prop.split(".").slice(1);
        let cursor = (target.style = target.style || {});
        for (let i = 0; i < path.length - 1; i++) {
          const key = path[i];
          if (!cursor[key] || typeof cursor[key] !== "object") {
            cursor[key] = {};
          }
          cursor = cursor[key];
        }
        cursor[path[path.length - 1]] = value;
      } else if (prop.startsWith("data.")) {
        const dataProp = prop.replace("data.", "");
        target.data = target.data || {};
        target.data[dataProp] = value;
      } else {
        target[prop] = value;
      }
    });

    this.eventBus.on(Events.REPLACE_BRANCH, async ({ targetId, newBranch }) => {
      if (!this._currentState?.root || !targetId || !newBranch) return;

      try {
        await this._resolveRemoteComponents(newBranch, this._currentState.components);
        const instancesData = {};
        const resolvedBranch = resolveComponentTree(newBranch, this._currentState.components, instancesData);

        for (const [instKey, instVal] of Object.entries(instancesData)) {
          this.dataStore.set(instKey, instVal);
        }

        this.bindingEngine.indexBindings(resolvedBranch);
        this.bindingEngine.applyBindings(resolvedBranch);

        if (this._currentState.root.id === targetId) {
          this._currentState.root = resolvedBranch;
          this.eventBus.emit(Events.STATE_CHANGED, { state: this._currentState });
        } else {
          const ok = replaceNode(this._currentState.root, targetId, resolvedBranch);
          if (ok) {
            this.eventBus.emit(Events.NODE_UPDATED, { jsonNode: resolvedBranch });
          }
        }
      } catch (err) {
        this.errorReporter.reportError(err);
      }
    });
  }

  // ─── Automatic Initial Loading ─────────────────────────────────────────────

  async _autoLoad(defaultPageId = null) {
    const injectedState = this.dom.getInjectedState("__SPACEPEECH_STATE__");
    if (injectedState) {
      await this.loadState(injectedState);
      return;
    }

    const pageId = this.dom.getUrlParam("page") || defaultPageId || "default";
    const backoff = [1000, 2000, 4000];
    let lastError = null;

    for (let attempt = 0; attempt <= backoff.length; attempt++) {
      try {
        const state = await this.dataService.loadPage(pageId);
        await this.loadState(state);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < backoff.length) {
          await new Promise((res) => setTimeout(res, backoff[attempt]));
        }
      }
    }

    const networkErr = new NetworkError(`Could not load page "${pageId}" (${this.dataService.source}).`, {
      cause: lastError,
    });
    this.errorReporter.reportError(networkErr);
  }
}
