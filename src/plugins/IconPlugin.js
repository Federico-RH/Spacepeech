/**
 * IconPlugin — src/plugins/IconPlugin.js
 *
 * Dictionary and renderer for clean SVG vector icons.
 * Allows using `icon: "power"`, `icon: "play"`, `icon: "slider"`, etc.
 */
const ICON_CATALOG = {
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  stop: '<rect x="4" y="4" width="16" height="16" fill="currentColor"/>',
  forward: '<polygon points="13 19 22 12 13 5 13 19" fill="currentColor"/><polygon points="2 19 11 12 2 5 2 19" fill="currentColor"/>',
  backward: '<polygon points="11 19 2 12 11 5 11 19" fill="currentColor"/><polygon points="22 19 13 12 22 5 22 19" fill="currentColor"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  sun: '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>',
  music: '<path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  gps: '<polygon points="3 11 22 2 13 21 11 13 3 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
};

export const IconPlugin = {
  name: "icon-plugin",

  async install(app, options = {}) {
    const catalog = { ...ICON_CATALOG, ...(options.customIcons || {}) };

    app.actionManager.register("icon.set", async ({ targetId, name }, ctx) => {
      const id = targetId || ctx.nodeId;
      if (!id || !name) return;

      const element = ctx.dom.getHtmlEl(id);
      const iconMarkup = catalog[name];

      if (element && iconMarkup) {
        element.innerHTML = iconMarkup;
      }
    });
  }
};
