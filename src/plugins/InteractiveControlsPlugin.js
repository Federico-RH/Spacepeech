/**
 * InteractiveControlsPlugin — src/plugins/InteractiveControlsPlugin.js
 *
 * Interactive handling of high-precision controls:
 * - Neumorphic/Glassmorphic rotary dials with angular rotation.
 * - Stepped sliders with bounds.
 * - Toggle for floating panels / dropdowns.
 */
export const InteractiveControlsPlugin = {
  name: "interactive-controls-plugin",

  async install(app) {
    // Rotates a dial adding degrees and mapping it to a 0..100 value in DataStore
    app.actionManager.register("controls.rotateDial", async ({ path, step = 15, maxAngle = 270, targetIndicatorId }, ctx) => {
      if (!path) return;

      const currentValue = Number(ctx.dataStore.get(path)) || 0;
      const nextValue = (currentValue + step) % (maxAngle + 1);
      ctx.dataStore.set(path, nextValue);

      if (targetIndicatorId) {
        const knob = ctx.dom.getHtmlEl(targetIndicatorId);
        if (knob) {
          knob.style.transform = `rotate(${nextValue}deg)`;
        }
      }
    });

    // Step control for sliders / step bounds
    app.actionManager.register("controls.sliderStep", async ({ path, step = 1, min = 0, max = 100 }, ctx) => {
      if (!path) return;

      const current = Number(ctx.dataStore.get(path)) || 0;
      const updated = Math.min(Number(max), Math.max(Number(min), current + Number(step)));
      ctx.dataStore.set(path, updated);
    });

    // Visibility toggle for dropdowns or modals
    app.actionManager.register("controls.toggleDropdown", async ({ path, openClass = "open", targetId }, ctx) => {
      if (path) {
        const isOpen = Boolean(ctx.dataStore.get(path));
        ctx.dataStore.set(path, !isOpen);
      }

      const id = targetId || ctx.nodeId;
      if (id) {
        const el = ctx.dom.getHtmlEl(id);
        if (el) {
          el.classList.toggle(openClass);
        }
      }
    });
  }
};
