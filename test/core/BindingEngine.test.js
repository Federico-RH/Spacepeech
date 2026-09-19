// ==========================================
// ARCHIVO: test/core/BindingEngine.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { BindingEngine } from "../../src/core/BindingEngine.js";
import { DataStore } from "../../src/core/DataStore.js";
import { Events } from "../../src/core/Events.js";

/**
 * EventBus de prueba mínimo (pub/sub real, no solo un espía) -- BindingEngine
 * depende de que on()/emit() efectivamente disparen handlers.
 */
function makeEventBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    off(event, fn) {
      const list = handlers.get(event);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    },
    emit(event, payload) {
      for (const fn of [...(handlers.get(event) || [])]) fn(payload);
    }
  };
}

/**
 * Arma un engine con una DataStore real -- BindingEngine delega toda la
 * resolución de valores en dataStore.get()/interpolate(), así que probarlo
 * con un fake reimplementaría esa lógica dos veces sin agregar confianza.
 */
function makeEngine() {
  const eventBus = makeEventBus();
  const dataStore = new DataStore(eventBus);
  const engine = new BindingEngine(eventBus, dataStore);
  return { eventBus, dataStore, engine };
}

function captureUpdates(eventBus) {
  const updates = [];
  eventBus.on(Events.UPDATE_NODE_PROP, (payload) => updates.push(payload));
  return updates;
}

describe("BindingEngine — indexBindings + reactividad en data.*", () => {
  test("una expresión en data.* notifica UPDATE_NODE_PROP al cambiar el dato", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "n1", type: "p", data: { text: "Clics: {{contador}}" } });
    dataStore.set("contador", 3);

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], { nodeId: "n1", prop: "data.text", value: "Clics: 3" });
  });

  test("una expresión pura en data.* preserva el tipo del dato (no la stringifica)", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "n1", type: "input", data: { checked: "{{aceptaTerminos}}" } });
    dataStore.set("aceptaTerminos", false);

    assert.equal(updates.length, 1);
    assert.equal(updates[0].value, false);
  });

  test("recorre children recursivamente al indexar", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({
      id: "root",
      type: "div",
      children: [{ id: "hijo", type: "span", data: { text: "{{msg}}" } }]
    });
    dataStore.set("msg", "hola");

    assert.equal(updates.length, 1);
    assert.equal(updates[0].nodeId, "hijo");
  });
});

describe("BindingEngine — two-way binding (bind)", () => {
  test("indexa bind con targetProp data.value y notifica al cambiar la ruta", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "input-1", type: "input", bind: "usuario.nombre" });
    dataStore.set("usuario.nombre", "Fede");

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], { nodeId: "input-1", prop: "data.value", value: "Fede" });
  });

  test("SET_DATA_PROP (evento de UI) actualiza el DataStore y dispara la reactividad", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "input-1", type: "input", bind: "usuario.nombre" });
    eventBus.emit(Events.SET_DATA_PROP, { path: "usuario.nombre", value: "Ana" });

    assert.equal(dataStore.get("usuario.nombre"), "Ana");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].value, "Ana");
  });
});

describe("BindingEngine — class y style", () => {
  test("class con template mixto notifica con el string interpolado", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "badge", type: "span", class: "badge badge-{{estado}}" });
    dataStore.set("estado", "ok");

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], { nodeId: "badge", prop: "class", value: "badge badge-ok" });
  });

  test("style anidado (ej. hover) se indexa con el path completo", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({
      id: "card",
      type: "div",
      style: { color: "{{color}}", hover: { background: "{{bgHover}}" } }
    });

    dataStore.set("color", "#111");
    dataStore.set("bgHover", "#222");

    assert.equal(updates.length, 2);
    assert.deepEqual(updates[0], { nodeId: "card", prop: "style.color", value: "#111" });
    assert.deepEqual(updates[1], { nodeId: "card", prop: "style.hover.background", value: "#222" });
  });
});

describe("BindingEngine — cascada de notificación por rutas padre/hijo", () => {
  test("cambiar un path padre notifica a dependencias de sus hijos", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "n1", type: "p", data: { text: "{{usuario.nombre}}" } });
    dataStore.set("usuario", { nombre: "Fede" });

    assert.equal(updates.length, 1);
    assert.equal(updates[0].nodeId, "n1");
  });

  test("cambiar un path hijo notifica a dependencias del padre", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "n1", type: "p", data: { resumen: "{{usuario}}" } });
    dataStore.set("usuario.nombre", "Fede");

    assert.equal(updates.length, 1);
    assert.equal(updates[0].nodeId, "n1");
  });
});

describe("BindingEngine — applyBindings", () => {
  test("aplica el bind inicial a data.value si el dato existe", () => {
    const { dataStore, engine } = makeEngine();
    dataStore.set("usuario.nombre", "Fede");

    const node = { id: "input-1", type: "input", bind: "usuario.nombre" };
    engine.applyBindings(node);

    assert.equal(node.data.value, "Fede");
  });

  test("no toca data.value si el dato bindeado todavía no existe", () => {
    const { engine } = makeEngine();
    const node = { id: "input-1", type: "input", bind: "no.existe" };
    engine.applyBindings(node);

    assert.equal(node.data?.value, undefined);
  });

  test("resuelve expresiones en data.* preservando tipo cuando son puras", () => {
    const { dataStore, engine } = makeEngine();
    dataStore.set("activo", true);

    const node = { id: "n1", type: "input", data: { checked: "{{activo}}" } };
    engine.applyBindings(node);

    assert.equal(node.data.checked, true);
  });

  test("aplica recursivamente sobre children", () => {
    const { dataStore, engine } = makeEngine();
    dataStore.set("msg", "hola");

    const node = {
      id: "root",
      type: "div",
      children: [{ id: "hijo", type: "span", data: { text: "{{msg}}" } }]
    };
    engine.applyBindings(node);

    assert.equal(node.children[0].data.text, "hola");
  });
});

describe("BindingEngine — clear() y removeBindings()", () => {
  test("clear() elimina todas las dependencias indexadas", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    engine.indexBindings({ id: "n1", type: "p", data: { text: "{{msg}}" } });
    engine.clear();
    dataStore.set("msg", "hola");

    assert.equal(updates.length, 0);
  });

  test("removeBindings() solo saca al nodo indicado -- otros suscriptores del mismo path siguen activos", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    const nodeA = { id: "a", type: "p", data: { text: "{{msg}}" } };
    const nodeB = { id: "b", type: "p", data: { text: "{{msg}}" } };
    engine.indexBindings(nodeA);
    engine.indexBindings(nodeB);

    engine.removeBindings(nodeA);
    dataStore.set("msg", "hola");

    assert.equal(updates.length, 1);
    assert.equal(updates[0].nodeId, "b");
  });

  test("removeBindings() recorre children recursivamente", () => {
    const { eventBus, dataStore, engine } = makeEngine();
    const updates = captureUpdates(eventBus);

    const node = {
      id: "root",
      type: "div",
      children: [{ id: "hijo", type: "span", data: { text: "{{msg}}" } }]
    };
    engine.indexBindings(node);
    engine.removeBindings(node);
    dataStore.set("msg", "hola");

    assert.equal(updates.length, 0);
  });
});
