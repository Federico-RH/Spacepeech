// =============================================================================
// FILE: src/plugins/HydrationPlugin.js
// =============================================================================

/**
 * HydrationPlugin — src/plugins/HydrationPlugin.js
 *
 * Enables progressive adoption (SSR/Static HTML) for public websites.
 * Binds the pre-existing static DOM tree with Spacepeech reactive state and actions
 * without destroying or flickering visible content.
 */
export const HydrationPlugin = {
  name: "hydration",

  /**
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @param {object} [options={}]
   */
  install(app, options = {}) {
    const isWebsiteMode = app._mergedConfig?.mode === "website" || options.mode === "website";

    if (isWebsiteMode && app.renderer) {
      app.renderer.setHydrationMode(true);
    }
  }
};
