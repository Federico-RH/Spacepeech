// =============================================================================
// FILE: src/core/ActionManager.js
// =============================================================================

import { Events } from "./Events.js";
import { ActionError } from "./AppError.js";
import { ExpressionEvaluator } from "./ExpressionEvaluator.js";

/**
 * ActionManager — src/core/ActionManager.js
 *
 * Declarative action interpreter and runner supporting pipelines,
 * conditions ("if"), and calls to plugins or core actions.
 */
export class ActionManager {
  #registry = new Map();
  #eventBus;
  #dataStore;
  #services;

  constructor(eventBus, dataStore, services = {}) {
    if (!eventBus) throw new Error("ActionManager: eventBus is required.");
    if (!dataStore) throw new Error("ActionManager: dataStore is required.");

    this.#eventBus = eventBus;
    this.#dataStore = dataStore;
    this.#services = services;

    this._bindEvents();
  }

  /**
   * Listens to Events.EXECUTE_ACTION (emitted by Renderer on each click/submit/etc.
   * on a node with declared "actions") and dispatches the corresponding action.
   * Without this binding, clicks execute nothing — not even DOM-less actions like sys.set.
   */
  _bindEvents() {
    this.#eventBus.on(Events.EXECUTE_ACTION, async ({ action, nodeId, eventPayload }) => {
      try {
        await this.dispatch(action, { nodeId, event: eventPayload });
      } catch (err) {
        this.#services.errorReporter?.reportError(err);
      }
    });
  }

  register(actionType, handler) {
    if (typeof actionType !== "string" || typeof handler !== "function") {
      throw new Error("ActionManager.register: Invalid parameters.");
    }
    this.#registry.set(actionType, handler);
  }

  registerAll(actionsMap = {}) {
    for (const [type, handler] of Object.entries(actionsMap)) {
      this.register(type, handler);
    }
  }

  async dispatch(actionDeclaration, context = {}) {
    if (!actionDeclaration) return;

    // Sequential execution if it is an array of actions (Pipeline)
    if (Array.isArray(actionDeclaration)) {
      let lastResult;
      for (const singleAction of actionDeclaration) {
        lastResult = await this.dispatch(singleAction, context);
      }
      return lastResult;
    }

    if (typeof actionDeclaration !== "object") return;

    // 1. Execution condition evaluation ("if")
    if (actionDeclaration.if) {
      const conditionMet = ExpressionEvaluator.evaluate(actionDeclaration.if, this.#dataStore);
      if (!conditionMet) return null;
    }

    const { type, ...rawParams } = actionDeclaration;
    if (!type) return;

    const handler = this.#registry.get(type);
    if (!handler) {
      throw new ActionError(`Unregistered action: "${type}"`, { actionType: type, context });
    }

    // 2. Dynamic parameter interpolation
    const interpolatedParams = this._interpolateParams(rawParams);

    try {
      // Execution context exposes dom/dataService/errorReporter/actionManager
      // as FLAT properties (not just nested under "services"), because that is
      // how all plugins and SystemActions consume them today (e.g.
      // ctx.dom.getHtmlEl(...), ctx.actionManager.dispatch(...)).
      // Nested "services" is also kept in case new additions prefer it.
      const result = await handler(interpolatedParams, {
        ...context,
        dataStore: this.#dataStore,
        eventBus: this.#eventBus,
        actionManager: this,
        ...this.#services,
        services: this.#services
      });

      this.#eventBus.emit(Events.ACTION_EXECUTED, {
        type,
        params: interpolatedParams,
        context,
        result
      });

      return result;
    } catch (err) {
      if (err instanceof ActionError) throw err;
      throw new ActionError(`Failed to execute action "${type}"`, {
        actionType: type,
        params: interpolatedParams,
        cause: err
      });
    }
  }

  _interpolateParams(params) {
    if (!params || typeof params !== "object") return params;
    const resolved = Array.isArray(params) ? [] : {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        resolved[key] = this.#dataStore.interpolate(value);
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this._interpolateParams(value);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }
}
