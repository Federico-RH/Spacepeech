// ==========================================
// FILE: src/infra/SystemDriver.js
// ==========================================

/**
 * SystemDriver — src/infra/SystemDriver.js
 *
 * Low-level capture engine for system environment data (Inputs).
 * Abstracts clock, pointer, window, network, and client telemetry APIs.
 */
export class SystemDriver {
  #win;
  #doc;
  #listeners = [];
  #clockTimerId = null;

  constructor(win = window, doc = document) {
    this.#win = win;
    this.#doc = doc;
  }

  // ─── Telemetry and Client Specifications ───────────────────────────────────

  getClientSpecs() {
    const nav = this.#win.navigator || {};
    const screen = this.#win.screen || {};
    const isTouch = ("ontouchstart" in this.#win) || (nav.maxTouchPoints > 0);
    const width = this.#win.innerWidth || screen.width || 0;

    let deviceType = "desktop";
    if (width < 768 || (isTouch && width < 600)) {
      deviceType = "mobile";
    } else if (width >= 768 && width <= 1024 && isTouch) {
      deviceType = "tablet";
    }

    const darkModeQuery = this.#win.matchMedia?.("(prefers-color-scheme: dark)");

    return {
      viewport: {
        w: this.#win.innerWidth || 0,
        h: this.#win.innerHeight || 0,
        pixelRatio: this.#win.devicePixelRatio || 1
      },
      screen: {
        width: screen.width || 0,
        height: screen.height || 0,
        colorDepth: screen.colorDepth || 24,
        orientation: screen.orientation?.type || "unknown"
      },
      device: {
        type: deviceType,
        isTouch,
        cores: nav.hardwareConcurrency || null,
        memory: nav.deviceMemory || null,
        language: nav.language || "en",
        platform: nav.userAgentData?.platform || nav.platform || "unknown",
        userAgent: nav.userAgent || ""
      },
      preferences: {
        darkMode: Boolean(darkModeQuery?.matches),
        reducedMotion: Boolean(this.#win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      },
      network: {
        online: nav.onLine ?? true,
        effectiveType: nav.connection?.effectiveType || "unknown",
        saveData: nav.connection?.saveData || false
      },
      timestamp: Date.now()
    };
  }

  // ─── Clock and Time Sensors ────────────────────────────────────────────────

  startClock(onTick, intervalMs = 1000) {
    this.stopClock();
    const emit = () => {
      const now = new Date();
      onTick({
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timestamp: now.getTime()
      });
    };
    emit();
    this.#clockTimerId = this.#win.setInterval(emit, intervalMs);
  }

  stopClock() {
    if (this.#clockTimerId !== null) {
      this.#win.clearInterval(this.#clockTimerId);
      this.#clockTimerId = null;
    }
  }

  // ─── Pointer (Mouse) Sensors ───────────────────────────────────────────────

  startMouseTracking(onMove, throttleMs = 30) {
    let lastTime = 0;
    const handler = (e) => {
      const now = this.#win.performance.now();
      if (now - lastTime >= throttleMs) {
        lastTime = now;
        onMove({ x: e.clientX, y: e.clientY });
      }
    };
    this.#win.addEventListener("mousemove", handler, { passive: true });
    this.#listeners.push(() => this.#win.removeEventListener("mousemove", handler));
  }

  // ─── Viewport (Screen) Sensors ─────────────────────────────────────────────

  startViewportTracking(onResize) {
    const emit = () => {
      onResize({
        w: this.#win.innerWidth,
        h: this.#win.innerHeight
      });
    };
    emit();
    this.#win.addEventListener("resize", emit, { passive: true });
    this.#listeners.push(() => this.#win.removeEventListener("resize", emit));
  }

  // ─── Connectivity Sensors ──────────────────────────────────────────────────

  startNetworkTracking(onChange) {
    const emit = () => onChange(this.#win.navigator?.onLine ?? true);
    emit();
    this.#win.addEventListener("online", emit);
    this.#win.addEventListener("offline", emit);
    this.#listeners.push(() => {
      this.#win.removeEventListener("online", emit);
      this.#win.removeEventListener("offline", emit);
    });
  }

  destroy() {
    this.stopClock();
    for (const unbind of this.#listeners) unbind();
    this.#listeners = [];
  }
}
