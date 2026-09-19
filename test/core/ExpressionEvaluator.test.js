// ==========================================
// ARCHIVO: test/core/ExpressionEvaluator.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ExpressionEvaluator } from "../../src/core/ExpressionEvaluator.js";

function makeFakeDataStore(data = {}) {
  return {
    get(path) {
      return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
    }
  };
}

describe("ExpressionEvaluator.evaluate", () => {
  test("valores no-string se devuelven tal cual", () => {
    assert.equal(ExpressionEvaluator.evaluate(42, makeFakeDataStore()), 42);
    assert.equal(ExpressionEvaluator.evaluate(null, makeFakeDataStore()), null);
    assert.equal(ExpressionEvaluator.evaluate(undefined, makeFakeDataStore()), undefined);
  });

  test("string vacío o solo espacios resuelve a false", () => {
    assert.equal(ExpressionEvaluator.evaluate("", makeFakeDataStore()), false);
    assert.equal(ExpressionEvaluator.evaluate("   ", makeFakeDataStore()), false);
  });

  test("resuelve un identificador simple contra el dataStore", () => {
    const ds = makeFakeDataStore({ contador: 5 });
    assert.equal(ExpressionEvaluator.evaluate("contador > 3", ds), true);
  });

  test("resuelve una ruta anidada con puntos", () => {
    const ds = makeFakeDataStore({ usuario: { edad: 30 } });
    assert.equal(ExpressionEvaluator.evaluate("usuario.edad >= 18", ds), true);
  });

  test("ternario", () => {
    const ds = makeFakeDataStore({ power: true });
    assert.equal(ExpressionEvaluator.evaluate("power ? 'ON' : 'OFF'", ds), "ON");
  });

  test("negación lógica", () => {
    const ds = makeFakeDataStore({ auth: { username: "" } });
    assert.equal(
      ExpressionEvaluator.evaluate("!auth.username ? 'guest' : 'user'", ds),
      "guest"
    );
  });

  test("operadores lógicos && / ||", () => {
    const ds = makeFakeDataStore({ a: true, b: false });
    assert.equal(ExpressionEvaluator.evaluate("a && b", ds), false);
    assert.equal(ExpressionEvaluator.evaluate("a || b", ds), true);
  });

  test("aritmética básica", () => {
    const ds = makeFakeDataStore({ contador: 10 });
    assert.equal(ExpressionEvaluator.evaluate("contador + 5", ds), 15);
    assert.equal(ExpressionEvaluator.evaluate("contador * 2 - 3", ds), 17);
  });

  test("identificador no definido en el dataStore se resuelve como null", () => {
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("no_existe ? 'a' : 'b'", ds), "b");
  });

  test("palabras reservadas (true/false) no se buscan en el dataStore", () => {
    const ds = makeFakeDataStore({ true: "no-debería-usarse-esto" });
    assert.equal(ExpressionEvaluator.evaluate("true && false", ds), false);
  });

  test("literales string se preservan tal cual (no se interpretan como rutas)", () => {
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("'hola.mundo'", ds), "hola.mundo");
  });

  test("una expresión con sintaxis inválida devuelve false, no lanza", () => {
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("&& ||", ds), false);
    assert.equal(ExpressionEvaluator.evaluate("({{{", ds), false);
  });

  test("no puede leer globals reales del entorno -- todo identificador pasa por el dataStore", () => {
    // "process" no está en el dataStore fake -> se sustituye por null antes
    // de ejecutarse, así que la expresión nunca ve el "process" real de Node
    // (ni "window" en un navegador). Esto es lo que hace que evaluar JSON de
    // un tercero no sea, en la práctica, una vía directa al entorno host.
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("process", ds), null);
  });
});

describe("ExpressionEvaluator — seguridad: intentos de escape del sandbox", () => {
  // Estos tests documentan un hallazgo real de la revisión de seguridad
  // (confirmado con un PoC fuera de la suite antes de escribir el fix):
  // la sustitución de identificadores por JSON.stringify(valor) SOLO
  // intercepta identificadores sueltos ("palabra.palabra"). Antes del fix,
  // una expresión con bracket notation y comillas ("['constructor']...")
  // evitaba esa sustitución por completo -- las comillas dentro de los
  // corchetes se tratan como literales de string, nunca pasan por el
  // dataStore -- y llegaba a ejecutar código en el scope global REAL del
  // proceso (no un sandbox). El fix bloquea '[', ']' y '`' antes de
  // evaluar, ya que ninguna sintaxis documentada los necesita.

  test("REGRESIÓN: bracket notation con string literals ya no escapa al scope global real", () => {
    const ds = makeFakeDataStore({});
    globalThis.__test_marker_no_deberia_leerse = "fuga-real-si-esto-aparece";

    try {
      const result = ExpressionEvaluator.evaluate(
        "''['constructor']['constructor']('return globalThis.__test_marker_no_deberia_leerse')()",
        ds
      );
      assert.equal(result, false);
    } finally {
      delete globalThis.__test_marker_no_deberia_leerse;
    }
  });

  test("bare identifier \"constructor.constructor\" ya estaba bloqueado por FORBIDDEN_KEYS de DataStore", () => {
    // Este caso en particular ya no dependía del fix de corchetes -- lo
    // bloqueaba la protección de DataStore contra __proto__/constructor/
    // prototype (ver DataStore.test.js). Se deja como test de regresión
    // acá también porque es la misma familia de ataque.
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("''.constructor.constructor('return 1')()", ds), false);
  });

  test("cualquier expresión con corchetes se rechaza de entrada, aunque no sea maliciosa", () => {
    const ds = makeFakeDataStore({ items: [1, 2, 3] });
    // No es una limitación pensada para JSON legítimo -- la sintaxis
    // documentada del sistema nunca usa corchetes dentro de una expresión
    // {{...}}, así que esto no debería quitarle cobertura a ningún caso de
    // uso real, solo cerrar la vía de escape.
    assert.equal(ExpressionEvaluator.evaluate("items[0]", ds), false);
  });

  test("una expresión con comillas invertidas también se rechaza", () => {
    const ds = makeFakeDataStore({});
    assert.equal(ExpressionEvaluator.evaluate("`texto`", ds), false);
  });

test("REGRESIÓN: dot-chain hacia constructor no escapa (no hay regla de llamada en la gramática)", () => {
  const ds = makeFakeDataStore({ usuario: {} });
  assert.equal(
    ExpressionEvaluator.evaluate("usuario.constructor.constructor('return 1')()", ds),
    false
  );
});
});
