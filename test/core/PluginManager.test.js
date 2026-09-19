// ==========================================
// ARCHIVO: test/core/PluginManager.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { PluginManager } from "../../src/core/PluginManager.js";
import { ConfigError } from "../../src/core/AppError.js";

function makeErrorReporter() {
  const warnings = [];
  const errors = [];
  return {
    warnings,
    errors,
    warn: (...args) => warnings.push(args),
    reportError: (err) => errors.push(err)
  };
}

describe("PluginManager — use()", () => {
  test("lanza ConfigError si el plugin es nulo/indefinido", async () => {
    const pm = new PluginManager(makeErrorReporter());
    await assert.rejects(() => pm.use(null, {}, { isInitialized: true }), ConfigError);
  });

  test("sin app o con app.isInitialized=false, encola en vez de instalar", async () => {
    const pm = new PluginManager(makeErrorReporter());
    let installed = false;
    const plugin = { name: "p1", install: async () => { installed = true; } };

    await pm.use(plugin, {}, { isInitialized: false });
    assert.equal(installed, false);

    await pm.use(plugin); // sin app en absoluto
    assert.equal(installed, false);
  });

  test("con app.isInitialized=true, instala inmediatamente", async () => {
    const pm = new PluginManager(makeErrorReporter());
    let installed = false;
    const plugin = { name: "p1", install: async (app, opts) => { installed = { app, opts }; } };

    const app = { isInitialized: true };
    await pm.use(plugin, { foo: "bar" }, app);

    assert.ok(installed);
    assert.equal(installed.app, app);
    assert.equal(installed.opts.foo, "bar");
  });

  test("enabled:false salta la instalación por completo (no queda ni encolado)", async () => {
    const pm = new PluginManager(makeErrorReporter());
    let installed = false;
    const plugin = { name: "p1", install: async () => { installed = true; } };

    await pm.use(plugin, { enabled: false }, { isInitialized: false });
    await pm.flushPending({ isInitialized: true });

    assert.equal(installed, false);
  });

  test("disabled:true tiene el mismo efecto que enabled:false", async () => {
    const pm = new PluginManager(makeErrorReporter());
    let installed = false;
    const plugin = { name: "p1", install: async () => { installed = true; } };

    await pm.use(plugin, { disabled: true }, { isInitialized: true });
    assert.equal(installed, false);
  });

  test("un plugin ya instalado (mismo objeto o mismo nombre) se omite con un warning", async () => {
    const errorReporter = makeErrorReporter();
    const pm = new PluginManager(errorReporter);
    let installCount = 0;
    const plugin = { name: "p1", install: async () => { installCount++; } };
    const app = { isInitialized: true };

    await pm.use(plugin, {}, app);
    await pm.use(plugin, {}, app);

    assert.equal(installCount, 1);
    assert.equal(errorReporter.warnings.length, 1);
  });

  test("un plugin function-style se invoca directamente como función", async () => {
    const pm = new PluginManager(makeErrorReporter());
    let received = null;
    async function myPlugin(app, opts) {
      received = { app, opts };
    }

    const app = { isInitialized: true };
    await pm.use(myPlugin, { x: 1 }, app);

    assert.ok(received);
    assert.equal(received.app, app);
    assert.equal(received.opts.x, 1);
  });

  test("un plugin sin install() ni ser función lanza ConfigError", async () => {
    const pm = new PluginManager(makeErrorReporter());
    const app = { isInitialized: true };
    await assert.rejects(() => pm.use({ name: "sin-install" }, {}, app), ConfigError);
  });

  test("si install() lanza, se envuelve en ConfigError, se reporta y se relanza", async () => {
    const errorReporter = makeErrorReporter();
    const pm = new PluginManager(errorReporter);
    const original = new Error("fallo interno del plugin");
    const plugin = {
      name: "roto",
      install: async () => {
        throw original;
      }
    };

    await assert.rejects(
      () => pm.use(plugin, {}, { isInitialized: true }),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.cause, original);
        return true;
      }
    );
    assert.equal(errorReporter.errors.length, 1);
  });
});

describe("PluginManager — flushPending()", () => {
  test("instala todos los plugins encolados, en orden, cuando la app ya está inicializada", async () => {
    const pm = new PluginManager(makeErrorReporter());
    const orden = [];
    const pluginA = { name: "a", install: async () => orden.push("a") };
    const pluginB = { name: "b", install: async () => orden.push("b") };

    await pm.use(pluginA, {}, { isInitialized: false });
    await pm.use(pluginB, {}, { isInitialized: false });

    assert.deepEqual(orden, []);

    await pm.flushPending({ isInitialized: true });

    assert.deepEqual(orden, ["a", "b"]);
  });
});

describe("PluginManager — has() / getInstalled()", () => {
  test("has() y getInstalled() reflejan lo instalado por nombre", async () => {
    const pm = new PluginManager(makeErrorReporter());
    const plugin = { name: "mi-plugin", install: async () => {} };

    await pm.use(plugin, {}, { isInitialized: true });

    assert.equal(pm.has("mi-plugin"), true);
    assert.equal(pm.has("no-instalado"), false);

    const installed = pm.getInstalled();
    assert.equal(installed.length, 1);
    assert.equal(installed[0].name, "mi-plugin");
  });
});
