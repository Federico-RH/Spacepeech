// ==========================================
// ARCHIVO: test/core/DataStore.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DataStore } from "../../src/core/DataStore.js";
import { Events } from "../../src/core/Events.js";

/**
 * EventBus mínimo de prueba: solo implementa lo que DataStore necesita
 * (emit), y guarda cada evento emitido para poder inspeccionarlo en los
 * asserts. Se usa a propósito en vez de la EventBus real -- estos son
 * tests de unidad de DataStore, no de integración con EventBus.
 */
function makeFakeEventBus() {
  const emitted = [];
  return {
    emitted,
    emit(name, payload) {
      emitted.push({ name, payload });
    }
  };
}

/**
 * DataStore crea a propósito sus objetos internos con Object.create(null)
 * (sin prototipo) como defensa contra prototype pollution -- ver
 * FORBIDDEN_KEYS y #sanitizeClone en el propio DataStore.js. Eso es
 * intencional y deseable, pero significa que un valor devuelto desde adentro
 * del store nunca va a ser [[Prototype]]-idéntico a un objeto/array literal
 * escrito a mano en un test. assert.deepEqual de node:assert/strict SÍ
 * compara el prototipo, así que fallaría por esa diferencia aunque el
 * contenido sea exactamente el esperado. toPlain() normaliza ambos lados a
 * través de un round-trip por JSON antes de comparar: eso es exactamente lo
 * que a estos tests les interesa verificar (el contenido), no si el
 * resultado es memoria-idéntica a un literal -- esa parte ya la cubre el
 * test de "los objetos internos no heredan de Object.prototype" más abajo.
 */
function toPlain(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

describe("DataStore — construcción", () => {
  test("lanza si no se le pasa un eventBus", () => {
    assert.throws(() => new DataStore(), /eventBus is required/);
    assert.throws(() => new DataStore(null), /eventBus is required/);
  });

  test("arranca vacío", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.deepEqual(store.getSnapshot(), {});
  });
});

describe("DataStore — get/set de rutas simples y anidadas", () => {
  test("set + get de una ruta de un solo nivel", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("contador", 5);
    assert.equal(store.get("contador"), 5);
  });

  test("set crea automáticamente los niveles intermedios que falten", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("usuario.perfil.nombre", "Fede");
    assert.equal(store.get("usuario.perfil.nombre"), "Fede");
    assert.deepEqual(toPlain(store.get("usuario.perfil")), { nombre: "Fede" });
  });

  test("set pisa un nivel intermedio si no era un objeto", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("config", "no-era-un-objeto");
    store.set("config.tema", "oscuro");
    assert.equal(store.get("config.tema"), "oscuro");
  });

  test("get de una ruta inexistente devuelve undefined, no lanza", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.get("no.existe.esto"), undefined);
  });

  test("get/set con path vacío, null o no-string no hacen nada ni lanzan", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.get(""), undefined);
    assert.equal(store.get(null), undefined);
    assert.equal(store.get(42), undefined);

    assert.doesNotThrow(() => store.set("", "x"));
    assert.doesNotThrow(() => store.set(null, "x"));
    assert.equal(store.get(""), undefined);
  });
});

describe("DataStore — protección contra prototype pollution", () => {
  for (const forbidden of ["__proto__", "constructor", "prototype"]) {
    test(`get ignora rutas que contienen "${forbidden}"`, () => {
      const store = new DataStore(makeFakeEventBus());
      assert.equal(store.get(`usuario.${forbidden}.x`), undefined);
      assert.equal(store.get(forbidden), undefined);
    });

    test(`set no aplica ni emite si la ruta contiene "${forbidden}"`, () => {
      const bus = makeFakeEventBus();
      const store = new DataStore(bus);
      store.set(`usuario.${forbidden}.polluted`, true);

      assert.equal(bus.emitted.length, 0);
      assert.equal({}.polluted, undefined);
      assert.equal(Object.prototype.polluted, undefined);
    });
  }

  test("loadData descarta claves prohibidas al clonar, en cualquier nivel", () => {
    const store = new DataStore(makeFakeEventBus());
    store.loadData({
      usuario: {
        nombre: "Fede",
        __proto__: { hacked: true },
        constructor: { hacked: true }
      }
    });

    assert.equal(store.get("usuario.nombre"), "Fede");
    assert.equal(store.get("usuario.hacked"), undefined);
    assert.equal(Object.prototype.hacked, undefined);
  });

  test("los objetos internos no heredan de Object.prototype", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("usuario.nombre", "Fede");
    const nested = store.get("usuario");
    assert.equal(Object.getPrototypeOf(nested), null);
  });
});

describe("DataStore — loadData / getSnapshot", () => {
  test("loadData reemplaza el store completo (no mergea con lo anterior)", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("viejo", "dato");
    store.loadData({ nuevo: "dato" });

    assert.equal(store.get("viejo"), undefined);
    assert.equal(store.get("nuevo"), "dato");
  });

  test("loadData clona arrays preservando su tipo Array", () => {
    const store = new DataStore(makeFakeEventBus());
    store.loadData({ items: [1, 2, { x: "a" }] });

    const items = store.get("items");
    assert.ok(Array.isArray(items));
    assert.deepEqual(toPlain(items), [1, 2, { x: "a" }]);
  });

  test("getSnapshot devuelve una copia -- mutarla no afecta al store", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("contador", 1);

    const snapshot = store.getSnapshot();
    snapshot.contador = 999;

    assert.equal(store.get("contador"), 1);
  });
});

describe("DataStore — emisión de DATA_CHANGED", () => {
  test("set emite DATA_CHANGED con path, value y previousValue", () => {
    const bus = makeFakeEventBus();
    const store = new DataStore(bus);
    store.set("contador", 1);
    store.set("contador", 2);

    assert.equal(bus.emitted.length, 2);
    assert.deepEqual(bus.emitted[1], {
      name: Events.DATA_CHANGED,
      payload: { path: "contador", value: 2, previousValue: 1 }
    });
  });

  test("set con el mismo valor no emite (previousValue === value)", () => {
    const bus = makeFakeEventBus();
    const store = new DataStore(bus);
    store.set("contador", 1);
    store.set("contador", 1);

    assert.equal(bus.emitted.length, 1);
  });
});

describe("DataStore — interpolate: expresión pura (preserva tipo)", () => {
  test("una ruta simple entre {{}} devuelve el valor crudo, no un string", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("activo", true);
    store.set("contador", 42);
    store.set("config", { tema: "oscuro" });

    assert.equal(store.interpolate("{{activo}}"), true);
    assert.equal(store.interpolate("{{contador}}"), 42);
    assert.deepEqual(store.interpolate("{{config}}"), { tema: "oscuro" });
  });

  test("una ruta pura inexistente resuelve a string vacío", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.interpolate("{{no.existe}}"), "");
  });

  test("template sin {{}} se devuelve tal cual", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.interpolate("texto plano"), "texto plano");
  });

  test("valores no-string se devuelven tal cual (no son templates)", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.interpolate(42), 42);
    assert.equal(store.interpolate(null), null);
  });
});

describe("DataStore — interpolate: template mixto (siempre string)", () => {
  test("mezcla texto + expresión y castea a string", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("nombre", "Fede");
    store.set("contador", 3);

    assert.equal(
      store.interpolate("Hola {{nombre}}, van {{contador}} clics"),
      "Hola Fede, van 3 clics"
    );
  });

  test("una expresión undefined dentro de un template mixto se reemplaza por vacío", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.interpolate("Valor: {{no.existe}}."), "Valor: .");
  });
});

describe("DataStore — interpolate: expresiones con operadores (ExpressionEvaluator)", () => {
  test("comparación simple", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("sliderMusic", 90);
    assert.equal(store.interpolate("{{sliderMusic > 80 ? '#f00' : '#0f0'}}"), "#f00");
  });

  test("negación lógica", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("auth", { username: "" });
    assert.equal(
      store.interpolate("{{!auth.username ? 'badge-guest' : 'badge-user'}}"),
      "badge-guest"
    );
  });

  test("expresión aritmética simple", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("contador", 5);
    assert.equal(store.interpolate("{{contador + 1}}"), 6);
  });

  test("REGRESIÓN: ternario puro sin operador de comparación se evalúa (no queda vacío)", () => {
    const store = new DataStore(makeFakeEventBus());

    store.set("power", true);
    assert.equal(store.interpolate("{{power ? 'ON' : 'OFF'}}"), "ON");

    store.set("power", false);
    assert.equal(store.interpolate("{{power ? 'ON' : 'OFF'}}"), "OFF");
  });

  test("REGRESIÓN: mismo caso con una ruta anidada tipo $sys.online", () => {
    const store = new DataStore(makeFakeEventBus());
    store.set("$sys.online", true);
    assert.equal(
      store.interpolate("{{$sys.online ? 'con red' : 'sin red'}}"),
      "con red"
    );
  });

  test("una expresión con sintaxis inválida resuelve a false, no lanza", () => {
    const store = new DataStore(makeFakeEventBus());
    assert.equal(store.interpolate("{{ >< }}"), false);
  });
});
