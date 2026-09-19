// ==========================================
// ARCHIVO: test/core/ActionManager.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ActionManager } from "../../src/core/ActionManager.js";
import { DataStore } from "../../src/core/DataStore.js";
import { Events } from "../../src/core/Events.js";
import { ActionError } from "../../src/core/AppError.js";

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

function makeErrorReporter() {
  const errors = [];
  return { errors, reportError: (err) => errors.push(err) };
}

function makeManager(services = {}) {
  const eventBus = makeEventBus();
  const dataStore = new DataStore(eventBus);
  const manager = new ActionManager(eventBus, dataStore, services);
  return { eventBus, dataStore, manager };
}

describe("ActionManager — construcción y registro", () => {
  test("lanza si falta eventBus o dataStore", () => {
    const eventBus = makeEventBus();
    const dataStore = new DataStore(eventBus);
    assert.throws(() => new ActionManager(null, dataStore), /eventBus is required/);
    assert.throws(() => new ActionManager(eventBus, null), /dataStore is required/);
  });

  test("register valida tipo string y handler función", () => {
    const { manager } = makeManager();
    assert.throws(() => manager.register(42, () => {}), /Invalid parameters/);
    assert.throws(() => manager.register("x", "no-es-función"), /Invalid parameters/);
  });

  test("registerAll registra varias acciones a la vez", async () => {
    const { manager, dataStore } = makeManager();
    manager.registerAll({
      "a.uno": async ({ v }) => dataStore.set("resultado", v)
    });

    await manager.dispatch({ type: "a.uno", v: "ok" });
    assert.equal(dataStore.get("resultado"), "ok");
  });
});

describe("ActionManager — dispatch", () => {
  test("lanza ActionError si el tipo no está registrado", async () => {
    const { manager } = makeManager();
    await assert.rejects(() => manager.dispatch({ type: "no.existe" }), ActionError);
  });

  test("dispatch de null/undefined es un no-op silencioso", async () => {
    const { manager } = makeManager();
    assert.equal(await manager.dispatch(null), undefined);
    assert.equal(await manager.dispatch(undefined), undefined);
  });

  test("el handler recibe los params y un context con dataStore/eventBus/actionManager", async () => {
    const { manager, dataStore, eventBus } = makeManager({ dom: { tag: "fake-dom" } });
    let received = null;

    manager.register("test.capture", async (params, context) => {
      received = { params, context };
    });

    await manager.dispatch({ type: "test.capture", foo: "bar" });

    assert.equal(received.params.foo, "bar");
    assert.equal(received.context.dataStore, dataStore);
    assert.equal(received.context.eventBus, eventBus);
    assert.equal(received.context.actionManager, manager);
    assert.equal(received.context.dom.tag, "fake-dom");
    assert.equal(received.context.services.dom.tag, "fake-dom");
  });

  test("interpola params string contra el DataStore antes de llamar al handler", async () => {
    const { manager, dataStore } = makeManager();
    dataStore.set("usuario.nombre", "Fede");

    let received;
    manager.register("test.echo", async (params) => {
      received = params;
    });

    await manager.dispatch({ type: "test.echo", saludo: "Hola {{usuario.nombre}}" });
    assert.equal(received.saludo, "Hola Fede");
  });

  test("interpola params anidados (objetos dentro de params)", async () => {
    const { manager, dataStore } = makeManager();
    dataStore.set("x", 5);

    let received;
    manager.register("test.echo", async (params) => {
      received = params;
    });

    await manager.dispatch({ type: "test.echo", anidado: { valor: "{{x}}" } });
    assert.equal(received.anidado.valor, 5);
  });

  test("pipeline (array) ejecuta en orden y devuelve el último resultado", async () => {
    const { manager } = makeManager();
    const orden = [];

    manager.register("a.paso", async ({ n }) => {
      orden.push(n);
      return n;
    });

    const result = await manager.dispatch([
      { type: "a.paso", n: 1 },
      { type: "a.paso", n: 2 },
      { type: "a.paso", n: 3 }
    ]);

    assert.deepEqual(orden, [1, 2, 3]);
    assert.equal(result, 3);
  });

  test('condición "if" en false salta el paso sin ejecutar el handler', async () => {
    const { manager, dataStore } = makeManager();
    dataStore.set("activo", false);
    let called = false;

    manager.register("a.condicional", async () => {
      called = true;
    });

    const result = await manager.dispatch({ type: "a.condicional", if: "activo" });

    assert.equal(called, false);
    assert.equal(result, null);
  });

  test('condición "if" en true ejecuta el handler normalmente', async () => {
    const { manager, dataStore } = makeManager();
    dataStore.set("activo", true);
    let called = false;

    manager.register("a.condicional", async () => {
      called = true;
    });

    await manager.dispatch({ type: "a.condicional", if: "activo" });
    assert.equal(called, true);
  });

  test("un error del handler se envuelve en ActionError con la causa original", async () => {
    const { manager } = makeManager();
    const original = new Error("boom");

    manager.register("a.rompe", async () => {
      throw original;
    });

    await assert.rejects(
      () => manager.dispatch({ type: "a.rompe" }),
      (err) => {
        assert.ok(err instanceof ActionError);
        assert.equal(err.cause, original);
        return true;
      }
    );
  });

  test("si el handler ya lanza un ActionError, se relanza tal cual (no se envuelve doble)", async () => {
    const { manager } = makeManager();
    const original = new ActionError("ya envuelto");

    manager.register("a.rompe2", async () => {
      throw original;
    });

    await assert.rejects(() => manager.dispatch({ type: "a.rompe2" }), (err) => err === original);
  });

  test("emite ACTION_EXECUTED con type/params/result tras una ejecución exitosa", async () => {
    const { manager, eventBus } = makeManager();
    const captured = [];
    eventBus.on(Events.ACTION_EXECUTED, (p) => captured.push(p));

    manager.register("a.ok", async () => "resultado-x");
    await manager.dispatch({ type: "a.ok" });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].type, "a.ok");
    assert.equal(captured[0].result, "resultado-x");
  });
});

describe("ActionManager — binding a Events.EXECUTE_ACTION", () => {
  test("un EXECUTE_ACTION emitido por el Renderer dispara dispatch()", async () => {
    const { manager, eventBus, dataStore } = makeManager();
    manager.register("sys.marcar", async (_, { nodeId }) => dataStore.set("ultimoNodo", nodeId));

    eventBus.emit(Events.EXECUTE_ACTION, {
      action: { type: "sys.marcar" },
      nodeId: "btn-1",
      eventPayload: { type: "click" }
    });

    // El handler del bus es async -- se le da una vuelta al microtask queue.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(dataStore.get("ultimoNodo"), "btn-1");
  });

  test("un error del handler vía EXECUTE_ACTION se reporta, no queda sin manejar", async () => {
    const errorReporter = makeErrorReporter();
    const eventBus = makeEventBus();
    const dataStore = new DataStore(eventBus);
    const manager = new ActionManager(eventBus, dataStore, { errorReporter });

    manager.register("a.rompe3", async () => {
      throw new Error("boom");
    });

    eventBus.emit(Events.EXECUTE_ACTION, {
      action: { type: "a.rompe3" },
      nodeId: "n1",
      eventPayload: {}
    });

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(errorReporter.errors.length, 1);
  });
});
