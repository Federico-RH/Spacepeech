// ==========================================
// FILE: src/core/PluginManager.js
// ==========================================

import { ConfigError } from "./AppError.js";

/**
 * PluginManager — src/core/PluginManager.js
 *
 * Manages registration, lifecycle, conditional activation, and installation of extensions.
 */
export class PluginManager {
  #installedPlugins = new Map();
  #pendingQueue = [];

  /**
   * @param {import("./ErrorReporter.js").ErrorReporter} errorReporter
   */
  constructor(errorReporter) {
    this.errorReporter = errorReporter;
  }

  /**
   * Registers and installs a plugin into the application.
   * @param {object|Function} plugin
   * @param {object} [options={}]
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @returns {Promise<void>}
   */
  async use(plugin, options = {}, app) {
    if (!plugin) {
      throw new ConfigError("PluginManager.use: the provided plugin is null or undefined.");
    }

    // Conditional enable / disable flag
    if (options.enabled === false || options.disabled === true) {
      return;
    }

    if (!app || !app.isInitialized) {
      this.#pendingQueue.push({ plugin, options });
      return;
    }

    const pluginName =
      plugin.name ||
      (typeof plugin === "function" ? plugin.name : null) ||
      `anonymous_${this.#installedPlugins.size + 1}`;

    if (this.#installedPlugins.has(plugin) || this.#installedPlugins.has(pluginName)) {
      this.errorReporter?.warn(`Plugin "${pluginName}" is already installed. Skipping.`);
      return;
    }

    try {
      if (typeof plugin.install === "function") {
        await plugin.install(app, options);
      } else if (typeof plugin === "function") {
        await plugin(app, options);
      } else {
        throw new ConfigError(`Plugin "${pluginName}" does not implement a function or an "install" method.`);
      }

      this.#installedPlugins.set(plugin, { name: pluginName, options });
      this.#installedPlugins.set(pluginName, { name: pluginName, options });
    } catch (err) {
      const configErr = new ConfigError(`Error installing plugin "${pluginName}": ${err.message}`, {
        context: { pluginName, options },
        cause: err,
      });
      this.errorReporter?.reportError(configErr);
      throw configErr;
    }
  }

  /**
   * Executes installation of all plugins queued during the pre-init phase.
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @returns {Promise<void>}
   */
  async flushPending(app) {
    while (this.#pendingQueue.length > 0) {
      const { plugin, options } = this.#pendingQueue.shift();
      await this.use(plugin, options, app);
    }
  }

  has(pluginOrName) {
    return this.#installedPlugins.has(pluginOrName);
  }

  getInstalled() {
    const list = [];
    for (const [key, value] of this.#installedPlugins.entries()) {
      if (typeof key === "string") {
        list.push(value);
      }
    }
    return list;
  }
}
