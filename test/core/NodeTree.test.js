// ==========================================
// ARCHIVO: test/core/NodeTree.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  findNode,
  insertNode,
  extractNode,
  replaceNode,
  resolveComponentTree,
  collectMissingModules
} from "../../src/core/NodeTree.js";
import { ConfigError } from "../../src/core/AppError.js";

describe("NodeTree — findNode", () => {
  test("encuentra un nodo anidado por id", () => {
    const root = { id: "root", children: [{ id: "a" }, { id: "b", children: [{ id: "c" }] }] };
    assert.equal(findNode(root, "c").id, "c");
  });

  test("devuelve null si no existe", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    assert.equal(findNode(root, "no-existe"), null);
  });

  test("devuelve null con root o nodeId inválidos, sin lanzar", () => {
    assert.equal(findNode(null, "x"), null);
    assert.equal(findNode({ id: "root" }, null), null);
  });

  test("funciona cuando root es un array de nodos de nivel superior", () => {
    const roots = [{ id: "a" }, { id: "b" }];
    assert.equal(findNode(roots, "b").id, "b");
  });
});

describe("NodeTree — replaceNode", () => {
  test("reemplaza un nodo anidado y devuelve true", () => {
    const root = { id: "root", children: [{ id: "a", type: "old" }] };
    const ok = replaceNode(root, "a", { id: "a", type: "new" });

    assert.equal(ok, true);
    assert.equal(root.children[0].type, "new");
  });

  test("devuelve false si el id no existe, no muta el árbol", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    const snapshot = JSON.stringify(root);
    const ok = replaceNode(root, "no-existe", { id: "x" });

    assert.equal(ok, false);
    assert.equal(JSON.stringify(root), snapshot);
  });

  test("funciona sobre un root que es array", () => {
    const roots = [{ id: "a", v: 1 }];
    const ok = replaceNode(roots, "a", { id: "a", v: 2 });
    assert.equal(ok, true);
    assert.equal(roots[0].v, 2);
  });
});

describe("NodeTree — extractNode", () => {
  test("extrae y muta el árbol (splice) -- el padre deja de contenerlo", () => {
    const root = { id: "root", children: [{ id: "a" }, { id: "b" }] };
    const extracted = extractNode(root, "a");

    assert.equal(extracted.id, "a");
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].id, "b");
  });

  test("devuelve null si no existe", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    assert.equal(extractNode(root, "no-existe"), null);
  });
});

describe("NodeTree — insertNode", () => {
  test("sin targetId, appendea a root.children", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    insertNode(root, { id: "b" });
    assert.deepEqual(root.children.map((c) => c.id), ["a", "b"]);
  });

  test("sin targetId y root es array, appendea directo al array", () => {
    const roots = [{ id: "a" }];
    insertNode(roots, { id: "b" });
    assert.deepEqual(roots.map((n) => n.id), ["a", "b"]);
  });

  test("con targetId existente, inserta dentro de los children de ese nodo", () => {
    const root = { id: "root", children: [{ id: "panel" }] };
    insertNode(root, { id: "widget" }, "panel");

    assert.deepEqual(root.children[0].children.map((c) => c.id), ["widget"]);
  });

  test("con targetId inexistente, cae al comportamiento de append en la raíz", () => {
    const root = { id: "root", children: [{ id: "a" }] };
    insertNode(root, { id: "b" }, "no-existe");

    assert.deepEqual(root.children.map((c) => c.id), ["a", "b"]);
  });
});

describe("NodeTree — collectMissingModules", () => {
  test("devuelve vacío si no hay moduleId sin resolver", () => {
    const root = { id: "root", moduleId: "widget-a" };
    assert.deepEqual(collectMissingModules(root, { "widget-a": {} }), []);
  });

  test("detecta moduleId faltantes recursivamente en children", () => {
    const root = {
      id: "root",
      children: [
        { id: "a", moduleId: "falta-1" },
        { id: "b", children: [{ id: "c", moduleId: "falta-2" }] }
      ]
    };
    assert.deepEqual(collectMissingModules(root, {}).sort(), ["falta-1", "falta-2"]);
  });

  test("no repite un moduleId ya visto (dedup vía Set)", () => {
    const root = { id: "root", children: [{ id: "a", moduleId: "x" }, { id: "b", moduleId: "x" }] };
    assert.deepEqual(collectMissingModules(root, {}), ["x"]);
  });

  test("lanza ConfigError si type es component-instance sin moduleId", () => {
    const root = { id: "root", type: "component-instance" };
    assert.throws(() => collectMissingModules(root, {}), ConfigError);
  });
});

describe("NodeTree — resolveComponentTree", () => {
  const components = {
    "contador-widget": {
      data: { clics: 0 },
      root: {
        id: "tpl-contador",
        type: "button",
        data: { text: "Clics: {{clics}}" },
        actions: { click: { type: "sys.increment", path: "clics", delta: 1 } },
        children: [{ id: "tpl-badge", type: "span", data: { text: "{{clics}}" } }]
      }
    }
  };

  test("resuelve una instancia contra su template, mergeando overrides", () => {
    const instance = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const resolved = resolveComponentTree(instance, components, {});

    assert.equal(resolved.type, "button");
    assert.equal(resolved.id, "contador-A");
  });

  test("namespacea los ids de los hijos con <instanceId>__", () => {
    const instance = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const resolved = resolveComponentTree(instance, components, {});

    assert.equal(resolved.children[0].id, "contador-A__tpl-badge");
  });

  test("dos instancias del mismo componente no colisionan entre sí", () => {
    const instanceA = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const instanceB = { id: "contador-B", type: "component-instance", moduleId: "contador-widget" };

    const resolvedA = resolveComponentTree(instanceA, components, {});
    const resolvedB = resolveComponentTree(instanceB, components, {});

    assert.equal(resolvedA.children[0].id, "contador-A__tpl-badge");
    assert.equal(resolvedB.children[0].id, "contador-B__tpl-badge");
  });

  test("namespacea las variables locales declaradas en components.<id>.data", () => {
    const instance = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const resolved = resolveComponentTree(instance, components, {});

    assert.equal(resolved.data.text, "Clics: {{contador-A.clics}}");
    assert.equal(resolved.children[0].data.text, "{{contador-A.clics}}");
  });

  test("namespacea el path de una acción que referencia una variable local", () => {
    const instance = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const resolved = resolveComponentTree(instance, components, {});

    assert.equal(resolved.actions.click.path, "contador-A.clics");
  });

  test("acumula el estado inicial de la variable local en accumulatedData", () => {
    const instance = { id: "contador-A", type: "component-instance", moduleId: "contador-widget" };
    const accumulated = {};
    resolveComponentTree(instance, components, accumulated);

    assert.deepEqual(accumulated["contador-A"], { clics: 0 });
  });

  test("una variable NO declarada en components.<id>.data queda global (sin namespacear)", () => {
    const comps = {
      widget: {
        data: { local: 1 },
        root: { id: "tpl", type: "div", data: { text: "{{local}} - {{$sys.time}}" } }
      }
    };
    const instance = { id: "w1", type: "component-instance", moduleId: "widget" };
    const resolved = resolveComponentTree(instance, comps, {});

    assert.equal(resolved.data.text, "{{w1.local}} - {{$sys.time}}");
  });

  test("resuelve recursivamente children que no son ellos mismos instancias", () => {
    const comps = { widget: { data: {}, root: { id: "tpl", type: "div" } } };
    const tree = {
      id: "root",
      type: "div",
      children: [{ id: "w1", type: "component-instance", moduleId: "widget" }]
    };
    const resolved = resolveComponentTree(tree, comps, {});

    assert.equal(resolved.children[0].type, "div");
  });

  test("lanza ConfigError si type es component-instance sin moduleId", () => {
    assert.throws(
      () => resolveComponentTree({ id: "x", type: "component-instance" }, {}, {}),
      ConfigError
    );
  });

  test("moduleId sin componente registrado no lanza, deja el nodo sin resolver", () => {
    const instance = { id: "w1", type: "component-instance", moduleId: "no-existe" };
    const resolved = resolveComponentTree(instance, {}, {});

    assert.equal(resolved.type, "component-instance");
    assert.equal(resolved.moduleId, "no-existe");
  });
});
