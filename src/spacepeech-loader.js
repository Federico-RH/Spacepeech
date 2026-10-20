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
import { MathPlugin } from "./plugins/MathPlugin.js";
import { TextPlugin } from "./plugins/TextPlugin.js";
import { DevPlugin } from "./plugins/DevPlugin.js";
import { MixerPlugin } from "./plugins/MixerPlugin.js";
import { DinoPlugin } from "./plugins/DinoPlugin.js";
import { LifePlugin } from "./plugins/LifePlugin.js";
import { VTablePlugin } from "./plugins/VTablePlugin.js";
import { TableSelectPlugin } from "./plugins/TableSelectPlugin.js";
import { FractalPlugin } from "./plugins/FractalPlugin.js";
/**
 * System plugin catalog with instant enable/disable flag.
 */
const DEFAULT_PLUGINS = [
  { plugin: HydrationPlugin, enabled: true }, // Progressive adoption of static HTML/SSR
  { plugin: UiKitPlugin, enabled: true },
  { plugin: DebugPlugin, options: { logMutations: true, ignoreSystem: true }, enabled: false },
  { plugin: SvgPlugin, enabled: true },
  { plugin: IconPlugin, enabled: true },
  { plugin: InteractiveControlsPlugin, enabled: true },
  { plugin: StoragePlugin, enabled: true },
  { plugin: ObserverPlugin, enabled: true },
  { plugin: FormPlugin, enabled: true },
  { plugin: CalculatorPlugin, enabled: true },
  { plugin: MathPlugin, options: { watch: ['m'] }, enabled: true },
  { plugin: TextPlugin, enabled: true},
{ plugin: RealtimePlugin, enabled: false },
{ plugin: DevPlugin, enabled: true },
{ plugin: MixerPlugin, enabled: true },
{ plugin: DinoPlugin, enabled: true },
{ plugin: LifePlugin, enabled: true },
{ plugin: VTablePlugin, enabled: true },
{ plugin: TableSelectPlugin, enabled: true },
{ plugin: FractalPlugin, enabled: true }
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
  RealtimePlugin,
  MathPlugin,
TextPlugin,
DevPlugin,
MixerPlugin,
DinoPlugin,
LifePlugin,
VTablePlugin,
TableSelectPlugin,
FractalPlugin
};
