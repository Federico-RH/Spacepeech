import { SystemDriver } from "../infra/SystemDriver.js";

/**
 * SystemAdapter — src/adapters/SystemAdapter.js
 *
 * Connects environment sensors (SystemDriver) to DataStore
 * publishing reactive variables under the '$sys' namespace.
 */
export class SystemAdapter {
  #driver;
  #dataStore;

  /**
   * @param {import("../core/DataStore.js").DataStore} dataStore
   * @param {SystemDriver} [driver]
   */
  constructor(dataStore, driver = new SystemDriver()) {
    if (!dataStore) throw new Error("SystemAdapter: dataStore is required.");
    this.#dataStore = dataStore;
    this.#driver = driver;
  }

  /**
   * Starts selected environment sensors.
   * @param {object} [config]
   */
  start(config = { clock: true, mouse: false, viewport: true, network: true }) {
    if (config.clock) {
      this.#driver.startClock((timeData) => {
        this.#dataStore.set("$sys.time", timeData.time);
        this.#dataStore.set("$sys.date", timeData.date);
        this.#dataStore.set("$sys.timestamp", timeData.timestamp);
      });
    }

    if (config.mouse) {
      this.#driver.startMouseTracking((pos) => {
        this.#dataStore.set("$sys.mouse.x", pos.x);
        this.#dataStore.set("$sys.mouse.y", pos.y);
      });
    }

    if (config.viewport) {
      this.#driver.startViewportTracking((vp) => {
        this.#dataStore.set("$sys.viewport.w", vp.w);
        this.#dataStore.set("$sys.viewport.h", vp.h);
      });
    }

    if (config.network) {
      this.#driver.startNetworkTracking((isOnline) => {
        this.#dataStore.set("$sys.online", isOnline);
      });
    }
  }

  destroy() {
    this.#driver.destroy();
  }
}
