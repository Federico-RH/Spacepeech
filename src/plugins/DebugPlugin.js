// src/plugins/DebugPlugin.js

import { Events } from "../core/Events.js";

/**
 * DebugPlugin — src/plugins/DebugPlugin.js
 *
 * Debug and event logging plugin for Spacepeech.
 * Registers the "sys.log" action and monitors DataStore mutations.
 */
export const DebugPlugin = {
  name: "debug-plugin",

  /**
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @param {object} [options={}]
   * @param {boolean} [options.logMutations=true]
   * @param {boolean} [options.ignoreSystem=true] - Ignores $sys.* variables from clock/sensors
   */
  async install(app, options = {}) {
    const ignoreSys = options.ignoreSystem !== false;

    // 1. Register custom action
    app.actionManager.register("sys.log", async ({ message, data }, ctx) => {
      const output = message || data || ctx.dataStore.getSnapshot();
      console.log(
        `%c[Spacepeech:Debug]%c ${typeof output === "object" ? JSON.stringify(output, null, 2) : output}`,
        "background: #2563eb; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
        "color: #38bdf8;"
      );
    });

    // 2. Monitor mutations ignoring clock spam ($sys)
    if (options.logMutations !== false) {
      app.eventBus.on(Events.DATA_CHANGED, ({ path, value }) => {
        if (ignoreSys && path.startsWith("$sys.")) {
          return;
        }

        console.log(
          `%c[DataStore Mutation]%c ${path} ➔`,
          "background: #10b981; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
          "color: #a7f3d0;",
          value
        );
      });
    }

    // 3. Notify state load
    app.eventBus.on(Events.STATE_CHANGED, ({ state }) => {
      console.log(
        `%c[State Loaded]%c Version: ${state?.version || "1.0"} | Root node: #${state?.root?.id}`,
        "background: #8b5cf6; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold;",
        "color: #ddd6fe;"
      );
    });
  }
};
