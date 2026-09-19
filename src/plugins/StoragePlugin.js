/**
 * StoragePlugin — src/plugins/StoragePlugin.js
 *
 * Web Storage persistence (localStorage/sessionStorage), Cookies, and JSON file handling.
 * Supports bidirectional automatic synchronization of DataStore paths and declarative actions.
 */

import { Events } from "../core/Events.js";

export const StoragePlugin = {
  name: "storage-plugin",

  /**
   * @param {import("../spacepeech/Spacepeech.js").Spacepeech} app
   * @param {object} [options={}]
   * @param {string[]} [options.syncPaths=[]] - DataStore paths to persist automatically in localStorage
   * @param {string} [options.storagePrefix="sp_"] - Storage key prefix
   */
  async install(app, options = {}) {
    const prefix = options.storagePrefix || "sp_";
    const syncPaths = options.syncPaths || [];

    const getStorage = (type) => (type === "session" ? window.sessionStorage : window.localStorage);

    // ─── 1. Automatic Synchronization (Hydrate and Watch) ────────────────────
    if (syncPaths.length > 0) {
      // Initial hydration from localStorage to DataStore
      for (const path of syncPaths) {
        try {
          const raw = window.localStorage.getItem(`${prefix}${path}`);
          if (raw !== null) {
            app.dataStore.set(path, JSON.parse(raw));
          }
        } catch {
          // If parsing fails, ignore silently
        }
      }

      // Reactive saving on each mutation
      app.eventBus.on(Events.DATA_CHANGED, ({ path, value }) => {
        for (const syncPath of syncPaths) {
          if (path === syncPath || path.startsWith(`${syncPath}.`)) {
            try {
              const fullData = app.dataStore.get(syncPath);
              window.localStorage.setItem(`${prefix}${syncPath}`, JSON.stringify(fullData));
            } catch (err) {
              app.errorReporter?.warn(`StoragePlugin: error persisting "${syncPath}"`, err);
            }
          }
        }
      });
    }

    // ─── 2. Web Storage Actions ──────────────────────────────────────────────

    // storage.set: Saves a value or snapshot to localStorage/sessionStorage
    app.actionManager.register("storage.set", async ({ key, path, value, storage = "local" }, ctx) => {
      if (!key) return;
      const storageInstance = getStorage(storage);
      const dataToSave = value !== undefined ? value : (path ? ctx.dataStore.get(path) : null);
      storageInstance.setItem(`${prefix}${key}`, JSON.stringify(dataToSave));
    });

    // storage.get: Reads from Storage and writes it to a DataStore path
    app.actionManager.register("storage.get", async ({ key, targetPath, storage = "local", defaultValue = null }, ctx) => {
      if (!key || !targetPath) return;
      const storageInstance = getStorage(storage);
      const raw = storageInstance.getItem(`${prefix}${key}`);
      const val = raw !== null ? JSON.parse(raw) : defaultValue;
      ctx.dataStore.set(targetPath, val);
    });

    // storage.remove: Removes a key from Storage
    app.actionManager.register("storage.remove", async ({ key, storage = "local" }) => {
      if (!key) return;
      getStorage(storage).removeItem(`${prefix}${key}`);
    });

    // storage.clear: Clears all storage matching the prefix
    app.actionManager.register("storage.clear", async ({ storage = "local" }) => {
      const storageInstance = getStorage(storage);
      const keysToRemove = [];
      for (let i = 0; i < storageInstance.length; i++) {
        const k = storageInstance.key(i);
        if (k?.startsWith(prefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => storageInstance.removeItem(k));
    });

    // ─── 3. Cookie Actions ───────────────────────────────────────────────────

    app.actionManager.register("cookie.set", async ({ name, value, days = 7, path = "/" }) => {
      if (!name) return;
      const exp = new Date();
      exp.setTime(exp.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(JSON.stringify(value))};expires=${exp.toUTCString()};path=${path};SameSite=Lax`;
    });

    app.actionManager.register("cookie.get", async ({ name, targetPath, defaultValue = null }, ctx) => {
      if (!name || !targetPath) return;
      const cookies = document.cookie ? document.cookie.split("; ") : [];
      let found = defaultValue;

      for (const item of cookies) {
        const [cName, cVal] = item.split("=");
        if (decodeURIComponent(cName) === name) {
          try {
            found = JSON.parse(decodeURIComponent(cVal));
          } catch {
            found = decodeURIComponent(cVal);
          }
          break;
        }
      }
      ctx.dataStore.set(targetPath, found);
    });

    // ─── 4. JSON File Download and Upload ────────────────────────────────────

    // file.downloadJson: Downloads current state or data branch to a .json file
    app.actionManager.register("file.downloadJson", async ({ filename = "state.json", path }, ctx) => {
      const payload = path ? ctx.dataStore.get(path) : ctx.dataStore.getSnapshot();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = ctx.dom.createHtmlEl("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // file.uploadJson: Opens OS picker to load JSON and write it to DataStore or reload the app
    app.actionManager.register("file.uploadJson", async ({ targetPath, reloadState = false }, ctx) => {
      const input = ctx.dom.createHtmlEl("input");
      input.type = "file";
      input.accept = ".json,application/json";

      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            if (reloadState) {
              await app.loadState(parsed);
            } else if (targetPath) {
              ctx.dataStore.set(targetPath, parsed);
            }
          } catch (err) {
            app.errorReporter?.error("StoragePlugin: invalid JSON file.", err);
          }
        };
        reader.readAsText(file);
      };

      input.click();
    });
  }
};
