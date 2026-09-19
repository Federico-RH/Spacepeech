// ==========================================
// ARCHIVO: test/plugins/HydrationPlugin.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { HydrationPlugin } from "../../src/plugins/HydrationPlugin.js";

function makeFakeRenderer() {
  const calls = [];
  return {
    calls,
    setHydrationMode(enabled) {
      calls.push(enabled);
    }
  };
}

describe("HydrationPlugin — install()", () => {
  test("con app._mergedConfig.mode === 'website' y renderer presente, activa el modo hidratación", () => {
    const renderer = makeFakeRenderer();
    const app = { _mergedConfig: { mode: "website" }, renderer };

    HydrationPlugin.install(app);

    assert.deepEqual(renderer.calls, [true]);
  });

  test("con options.mode === 'website' (override explícito), también lo activa", () => {
    const renderer = makeFakeRenderer();
    const app = { _mergedConfig: { mode: "dashboard" }, renderer };

    HydrationPlugin.install(app, { mode: "website" });

    assert.deepEqual(renderer.calls, [true]);
  });

  test("sin 'website' en config ni en options, NO toca el renderer", () => {
    const renderer = makeFakeRenderer();
    const app = { _mergedConfig: { mode: "dashboard" }, renderer };

    HydrationPlugin.install(app);

    assert.deepEqual(renderer.calls, []);
  });

  test("sin _mergedConfig en absoluto (app recién construida), no lanza y no activa nada", () => {
    const renderer = makeFakeRenderer();
    const app = { renderer };

    assert.doesNotThrow(() => HydrationPlugin.install(app));
    assert.deepEqual(renderer.calls, []);
  });

  test("mode: 'website' pero sin app.renderer todavía, no lanza (no hay a quién avisarle)", () => {
    const app = { _mergedConfig: { mode: "website" } };

    assert.doesNotThrow(() => HydrationPlugin.install(app));
  });

  test("sin options (segundo argumento omitido), usa el default {} y no lanza", () => {
    const renderer = makeFakeRenderer();
    const app = { _mergedConfig: { mode: "website" }, renderer };

    assert.doesNotThrow(() => HydrationPlugin.install(app));
    assert.deepEqual(renderer.calls, [true]);
  });

  test("declara su nombre como 'hydration' (para el catálogo de DEFAULT_PLUGINS)", () => {
    assert.equal(HydrationPlugin.name, "hydration");
  });
});
