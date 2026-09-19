// ==========================================
// ARCHIVO: test/core/SystemActions.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { SystemActions } from "../../src/core/SystemActions.js";
import { DataStore } from "../../src/core/DataStore.js";

function makeEventBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    emit(event, payload) {
      for (const fn of [...(handlers.get(event) || [])]) fn(payload);
    }
  };
}

function makeFakeDom() {
  const calls = { navigate: [], copyToClipboard: [], toggleFullscreen: 0 };
  return {
    calls,
    navigate: (url) => calls.navigate.push(url),
    copyToClipboard: async (text) => calls.copyToClipboard.push(text),
    toggleFullscreen: async () => { calls.toggleFullscreen++; }
  };
}

function makeContext(overrides = {}) {
  const eventBus = makeEventBus();
  const dataStore = new DataStore(eventBus);
  const dom = makeFakeDom();
  const errorReporter = { errors: [], reportError(e) { this.errors.push(e); } };
  return { eventBus, dataStore, dom, errorReporter, nodeId: "n1", ...overrides };
}

describe("SystemActions — mutaciones directas del DataStore", () => {
  test("sys.set asigna el valor en el path", async () => {
    const ctx = makeContext();
    await SystemActions["sys.set"]({ path: "x", value: 42 }, ctx);
    assert.equal(ctx.dataStore.get("x"), 42);
  });

  test("sys.set sin path no hace nada", async () => {
    const ctx = makeContext();
    await assert.doesNotReject(() => SystemActions["sys.set"]({ value: 1 }, ctx));
  });

  test("sys.toggle invierte un booleano", async () => {
    const ctx = makeContext();
    ctx.dataStore.set("flag", true);
    await SystemActions["sys.toggle"]({ path: "flag" }, ctx);
    assert.equal(ctx.dataStore.get("flag"), false);
  });

  test("sys.toggle sobre un path inexistente arranca en false y pasa a true", async () => {
    const ctx = makeContext();
    await SystemActions["sys.toggle"]({ path: "nuevo" }, ctx);
    assert.equal(ctx.dataStore.get("nuevo"), true);
  });

  test("sys.increment suma delta (default 1) a un número", async () => {
    const ctx = makeContext();
    ctx.dataStore.set("contador", 5);
    await SystemActions["sys.increment"]({ path: "contador" }, ctx);
    assert.equal(ctx.dataStore.get("contador"), 6);

    await SystemActions["sys.increment"]({ path: "contador", delta: -2 }, ctx);
    assert.equal(ctx.dataStore.get("contador"), 4);
  });

  test("sys.increment sobre un valor no-numérico lo trata como 0", async () => {
    const ctx = makeContext();
    ctx.dataStore.set("raro", "no-es-numero");
    await SystemActions["sys.increment"]({ path: "raro", delta: 3 }, ctx);
    assert.equal(ctx.dataStore.get("raro"), 3);
  });
});

describe("SystemActions — sys.navigate (superficie de seguridad)", () => {
  test("con url, se pasa TAL CUAL a dom.navigate() -- sin ninguna validación ni allowlist", async () => {
    const ctx = makeContext();
    // Caracterización deliberada: el JSON de página puede poner cualquier
    // string acá (incluido un origen externo). No hay chequeo de dominio,
    // de protocolo, ni de que sea una ruta relativa. Documentado en la
    // revisión de seguridad pendiente -- este test confirma el estado
    // actual, no lo corrige.
    await SystemActions["sys.navigate"]({ url: "https://sitio-externo.ejemplo/lo-que-sea" }, ctx);
    assert.deepEqual(ctx.dom.calls.navigate, ["https://sitio-externo.ejemplo/lo-que-sea"]);
  });

  test("con page, arma ?page=<valor> con encodeURIComponent", async () => {
    const ctx = makeContext();
    await SystemActions["sys.navigate"]({ page: "dashboard b" }, ctx);
    assert.deepEqual(ctx.dom.calls.navigate, ["?page=dashboard%20b"]);
  });

  test("url tiene prioridad sobre page si ambos están presentes", async () => {
    const ctx = makeContext();
    await SystemActions["sys.navigate"]({ url: "/x", page: "y" }, ctx);
    assert.deepEqual(ctx.dom.calls.navigate, ["/x"]);
  });

  test("sin url ni page, no navega", async () => {
    const ctx = makeContext();
    await SystemActions["sys.navigate"]({}, ctx);
    assert.deepEqual(ctx.dom.calls.navigate, []);
  });
});

describe("SystemActions — sys.copy / sys.toggleFullscreen / sys.emit", () => {
  test("sys.copy castea a string y llama a copyToClipboard", async () => {
    const ctx = makeContext();
    await SystemActions["sys.copy"]({ text: 123 }, ctx);
    assert.deepEqual(ctx.dom.calls.copyToClipboard, ["123"]);
  });

  test("sys.copy con text undefined/null no llama a copyToClipboard", async () => {
    const ctx = makeContext();
    await SystemActions["sys.copy"]({}, ctx);
    assert.deepEqual(ctx.dom.calls.copyToClipboard, []);
  });

  test("sys.toggleFullscreen delega en dom.toggleFullscreen", async () => {
    const ctx = makeContext();
    await SystemActions["sys.toggleFullscreen"]({}, ctx);
    assert.equal(ctx.dom.calls.toggleFullscreen, 1);
  });

  test("sys.emit reemite un evento arbitrario en el EventBus", async () => {
    const ctx = makeContext();
    const captured = [];
    ctx.eventBus.on("mi.evento.custom", (p) => captured.push(p));

    await SystemActions["sys.emit"]({ event: "mi.evento.custom", payload: { a: 1 } }, ctx);
    assert.deepEqual(captured, [{ a: 1 }]);
  });
});

describe("SystemActions — sys.fetch (superficie de seguridad)", () => {
  test("con targetPath, escribe el JSON de respuesta ahí", async () => {
    const ctx = makeContext();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ nombre: "Fede" }) });

    try {
      await SystemActions["sys.fetch"]({ url: "https://api.ejemplo/datos", targetPath: "resultado" }, ctx);
      assert.deepEqual(ctx.dataStore.interpolate("{{resultado}}"), { nombre: "Fede" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sin targetPath, cada clave del JSON se escribe como ruta de nivel superior", async () => {
    const ctx = makeContext();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ a: 1, b: 2 }) });

    try {
      await SystemActions["sys.fetch"]({ url: "https://api.ejemplo/datos" }, ctx);
      assert.equal(ctx.dataStore.get("a"), 1);
      assert.equal(ctx.dataStore.get("b"), 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sin url, no hace fetch", async () => {
    const ctx = makeContext();
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; };

    try {
      await SystemActions["sys.fetch"]({}, ctx);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("un fetch fallido (HTTP no-ok) se reporta, no lanza -- y la URL tampoco se valida acá", async () => {
    const ctx = makeContext();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });

    try {
      await assert.doesNotReject(() =>
        SystemActions["sys.fetch"]({ url: "http://cualquier-host-interno/", targetPath: "x" }, ctx)
      );
      assert.equal(ctx.errorReporter.errors.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("SystemActions — timers (sys.setInterval / sys.clearInterval / sys.timeout)", () => {
  // Estos tres tests mockean setInterval/clearInterval/setTimeout globales
  // en vez de esperar tiempo real -- depender del reloj real es lo que
  // causaba flakiness (en una máquina con carga variable, ni dar más
  // margen de espera garantiza que un tick real llegue a tiempo). Mockeando,
  // el resultado es determinístico sin importar qué tan rápida o lenta sea
  // la máquina donde corra.

  test("sys.setInterval registra un setInterval real con el intervalMs correcto, y el callback despacha la acción", async () => {
    const dispatched = [];
    const ctx = makeContext({
      actionManager: { dispatch: async (action) => dispatched.push(action) }
    });

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let capturedCallback = null;
    let capturedMs = null;
    globalThis.setInterval = (cb, ms) => {
      capturedCallback = cb;
      capturedMs = ms;
      return "fake-handle";
    };
    globalThis.clearInterval = () => {};

    try {
      await SystemActions["sys.setInterval"](
        { timerId: "t1", intervalMs: 15, action: { type: "sys.set", path: "x", value: 1 } },
        ctx
      );

      assert.equal(capturedMs, 15);
      assert.equal(typeof capturedCallback, "function");

      // Simulamos dos ticks a mano, sin esperar tiempo real.
      await capturedCallback();
      await capturedCallback();

      assert.equal(dispatched.length, 2);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
      await SystemActions["sys.clearInterval"]({ timerId: "t1" }, ctx);
    }
  });

  test("registrar sys.setInterval dos veces con el mismo timerId limpia el handle anterior antes de crear uno nuevo", async () => {
    const ctx = makeContext({ actionManager: { dispatch: async () => {} } });

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const createdHandles = [];
    const clearedHandles = [];
    let counter = 0;
    globalThis.setInterval = () => {
      const handle = `handle-${++counter}`;
      createdHandles.push(handle);
      return handle;
    };
    globalThis.clearInterval = (handle) => clearedHandles.push(handle);

    try {
      await SystemActions["sys.setInterval"]({ timerId: "dup", intervalMs: 15, action: { type: "x" } }, ctx);
      await SystemActions["sys.setInterval"]({ timerId: "dup", intervalMs: 15, action: { type: "x" } }, ctx);

      assert.equal(createdHandles.length, 2);
      assert.deepEqual(clearedHandles, [createdHandles[0]]);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
      // Limpieza explícita: activeTimers es un Map a nivel de módulo dentro
      // de SystemActions.js, compartido por TODOS los tests de este archivo
      // (no se resetea solo entre tests). Si no se limpia acá, "dup" queda
      // colgado y contamina al próximo test que itere sobre todos los
      // timers activos (ej. "sys.clearInterval sin timerId").
      await SystemActions["sys.clearInterval"]({ timerId: "dup" }, ctx);
    }
  });

  test("sys.clearInterval sin timerId limpia TODOS los timers activos registrados", async () => {
    const ctx = makeContext({ actionManager: { dispatch: async () => {} } });

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let counter = 0;
    const cleared = [];
    globalThis.setInterval = () => `h${++counter}`;
    globalThis.clearInterval = (h) => cleared.push(h);

    try {
      await SystemActions["sys.setInterval"]({ timerId: "a", intervalMs: 10, action: { type: "x" } }, ctx);
      await SystemActions["sys.setInterval"]({ timerId: "b", intervalMs: 10, action: { type: "x" } }, ctx);
      await SystemActions["sys.clearInterval"]({}, ctx);

      assert.equal(cleared.length, 2);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test("sys.timeout registra un setTimeout con el delayMs correcto, y el callback despacha la acción una vez", async () => {
    const dispatched = [];
    const ctx = makeContext({
      actionManager: { dispatch: async (action) => dispatched.push(action) }
    });

    const originalSetTimeout = globalThis.setTimeout;
    let capturedCallback = null;
    let capturedMs = null;
    globalThis.setTimeout = (cb, ms) => {
      capturedCallback = cb;
      capturedMs = ms;
      return "fake-handle";
    };

    try {
      await SystemActions["sys.timeout"]({ delayMs: 15, action: { type: "sys.set" } }, ctx);

      assert.equal(capturedMs, 15);
      await capturedCallback();

      assert.equal(dispatched.length, 1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("sys.timeout usa intervalMs como alias de delayMs si delayMs no está presente", async () => {
    const ctx = makeContext({ actionManager: { dispatch: async () => {} } });

    const originalSetTimeout = globalThis.setTimeout;
    let capturedMs = null;
    globalThis.setTimeout = (cb, ms) => {
      capturedMs = ms;
      return "fake-handle";
    };

    try {
      await SystemActions["sys.timeout"]({ intervalMs: 25, action: { type: "x" } }, ctx);
      assert.equal(capturedMs, 25);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
