/**
 * SvgPlugin — src/plugins/SvgPlugin.js
 *
 * Dynamic SVG transformations and utilities support.
 * Provides actions to alter path attributes, gradients, and viewBox reactively.
 */
export const SvgPlugin = {
  name: "svg-plugin",

  async install(app) {
    // Action to update specific SVG element attributes
    app.actionManager.register("svg.setAttr", async ({ targetId, attr, value }, ctx) => {
      const id = targetId || ctx.nodeId;
      if (!id || !attr) return;

      const element = ctx.dom.getHtmlEl(id);
      if (element) {
        element.setAttribute(attr, String(value));
      }
    });

    // Action to animate path progress (dashoffset for circular widgets)
    app.actionManager.register("svg.setProgress", async ({ targetId, percent, circumference = 283 }, ctx) => {
      const id = targetId || ctx.nodeId;
      if (!id) return;

      const pct = Math.max(0, Math.min(100, Number(percent) || 0));
      const offset = circumference - (pct / 100) * circumference;

      const element = ctx.dom.getHtmlEl(id);
      if (element) {
        element.style.strokeDashoffset = String(offset);
      }
    });
  }
};
