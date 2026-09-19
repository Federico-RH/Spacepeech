// ==========================================
// FILE: src/spacepeech-loader.js
// ==========================================

import { Spacepeech } from "./spacepeech/Spacepeech.js";
import { HydrationPlugin } from "./plugins/HydrationPlugin.js";
import { UiKitPlugin } from "./plugins/UiKitPlugin.js";
import { DebugPlugin } from "./plugins/DebugPlugin.js";
import { SvgPlugin } from "./plugins/SvgPlugin.js";
import { IconPlugin } from "./plugins/IconPlugin.js";
import { InteractiveControlsPlugin } from "./plugins/InteractiveControlsPlugin.js";
import { StoragePlugin } from "./plugins/StoragePlugin.js";
import { ObserverPlugin } from "./plugins/ObserverPlugin.js";
import { CalculatorPlugin } from "./plugins/CalculatorPlugin.js";
import { FormPlugin } from "./plugins/FormPlugin.js";
import { RealtimePlugin } from "./plugins/RealtimePlugin.js";

/**
 * System plugin catalog with instant enable/disable flag.
 */
const DEFAULT_PLUGINS = [
  { plugin: HydrationPlugin, enabled: true }, // Progressive adoption of static HTML/SSR
  { plugin: UiKitPlugin, enabled: true },
  { plugin: DebugPlugin, options: { logMutations: true, ignoreSystem: true }, enabled: true },
  { plugin: SvgPlugin, enabled: true },
  { plugin: IconPlugin, enabled: true },
  { plugin: InteractiveControlsPlugin, enabled: true },
  { plugin: StoragePlugin, enabled: true },
  { plugin: ObserverPlugin, enabled: true },
  { plugin: FormPlugin, enabled: true },
  { plugin: CalculatorPlugin, enabled: true },
  { plugin: RealtimePlugin, enabled: false }
];

/**
 * Unified entry point for the Spacepeech library.
 *
 * @param {string} [containerId="canvas"]
 * @param {object|null} [initialState=null]
 * @param {Array<{plugin: object|Function, options?: object, enabled?: boolean}>} [customPlugins=[]]
 * @returns {Promise<Spacepeech>}
 */
export async function spacepeechInit(containerId = "canvas", initialState = null, customPlugins = []) {
  const app = new Spacepeech();

  const allPlugins = [...DEFAULT_PLUGINS, ...customPlugins];

  for (const item of allPlugins) {
    if (item?.enabled === false || item?.disabled === true) {
      continue;
    }

    if (item?.plugin) {
      await app.use(item.plugin, item.options || {});
    } else if (item) {
      await app.use(item);
    }
  }

  await app.init(containerId, initialState);
  return app;
}

export {
  Spacepeech,
  HydrationPlugin,
  UiKitPlugin,
  SvgPlugin,
  IconPlugin,
  InteractiveControlsPlugin,
  DebugPlugin,
  StoragePlugin,
  ObserverPlugin,
  CalculatorPlugin,
  FormPlugin,
  RealtimePlugin
};
