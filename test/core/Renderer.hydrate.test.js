// ==========================================
// ARCHIVO: test/engine/Renderer.hydrate.test.js
// ==========================================
//
// Cubre dos huecos detectados en la implementación de hidratación
// (HydrationPlugin.js + Renderer#hydrateRoot / _hydrateNodeRecursive):
//
// 1) Bug de orden: un nodo del JSON sin contraparte en el HTML estático
//    se creaba con _compileNode y se anexaba con parentEl.appendChild,
//    que siempre lo deja al final, sin importar la posición real que
//    tenía en el arreglo `children` del JSON.
//
// 2) Sin cobertura: modificar por JSON (texto, acciones) un nodo que fue
//    ANEXADO durante la hidratación (no existía en el HTML estático), y
//    verificar que el click en ese nodo dispare la acción correcta.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { Renderer } from "../../src/engine/Renderer.js";
import { Events } from "../../src/core/Events.js";
import { makeFakeDom } from "../helpers/fakeDom.js";

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

function makeErrorReporter() {
  const errors = [];
  const warnings = [];
  return {
    errors,
    warnings,
    reportError: (err) => errors.push(err),
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args)
  };
}

/**
 * Monta un Renderer con modo hidratación activo y un contenedor "canvas"
 * que ya trae, como HTML estático previo, la estructura que arme
 * `buildStaticTree(dom)`. Simula el caso real: el HTML llega servido
 * desde afuera, y recién después arranca el JS y dispara STATE_CHANGED.
 */
function makeHydratingRenderer(buildStaticTree) {
  const dom = makeFakeDom();
  const container = dom.createHtmlEl("div");
  container.id = "canvas";
  dom._root.appendChild(container);

  if (buildStaticTree) buildStaticTree(dom, container);

  const eventBus = makeEventBus();
  const errorReporter = makeErrorReporter();
  const renderer = new Renderer("canvas", dom, eventBus, errorReporter);
  renderer.setHydrationMode(true);
  renderer.init();

  return { dom, eventBus, errorReporter, renderer, container };
}

describe("Renderer — hidratación: orden de anexado", () => {
  test("un hijo nuevo (sin contraparte estática) se ubica en su posición del JSON, no al final", () => {
    // HTML estático: <div id="root"><span id="a"/><span id="c"/></div>
    // (falta "b", que el JSON declara en el medio)
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const a = dom.createHtmlEl("span");
      a.id = "a";
      const c = dom.createHtmlEl("span");
      c.id = "c";
      root.appendChild(a);
      root.appendChild(c);
      canvas.appendChild(root);
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            { id: "a", type: "span", data: { text: "A" } },
            { id: "b", type: "span", data: { text: "B" } },
            { id: "c", type: "span", data: { text: "C" } }
          ]
        }
      }
    });

    const root = container.children[0];
    const ids = root.children.map((el) => el.id);
    assert.deepEqual(ids, ["a", "b", "c"]);
  });

  test("un hijo nuevo al principio del JSON se antepone, no se anexa al final", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const b = dom.createHtmlEl("span");
      b.id = "b";
      root.appendChild(b);
      canvas.appendChild(root);
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            { id: "a", type: "span", data: { text: "A" } },
            { id: "b", type: "span", data: { text: "B" } }
          ]
        }
      }
    });

    const root = container.children[0];
    const ids = root.children.map((el) => el.id);
    assert.deepEqual(ids, ["a", "b"]);
  });
});

describe("Renderer — hidratación: modificar por JSON un nodo anexado", () => {
  test("un botón anexado (no existía en el HTML estático) dispara su acción al clickearlo", () => {
    // <div id="root"></div> -- vacío, "root" se adopta pero no tiene hijos estáticos
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      canvas.appendChild(root);
    });

    const executed = [];
    eventBus.on(Events.EXECUTE_ACTION, (payload) => executed.push(payload));

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            {
              id: "btn-login",
              type: "button",
              data: { text: "Iniciar sesión" },
              actions: { click: [{ type: "sys.increment", path: "contador", delta: 1 }] }
            }
          ]
        }
      }
    });

    const root = container.children[0];
    assert.equal(root.children.length, 1);
    const btn = root.children[0];
    assert.equal(btn.id, "btn-login");
    assert.equal(btn.tagName, "BUTTON");
    assert.equal(btn.textContent, "Iniciar sesión");

    btn.dispatch("click", { clientX: 1, clientY: 1 });

    assert.equal(executed.length, 1);
    assert.equal(executed[0].nodeId, "btn-login");
    assert.deepEqual(executed[0].action, [{ type: "sys.increment", path: "contador", delta: 1 }]);
  });

  test("NODE_UPDATED sobre ese mismo botón anexado actualiza texto y acción en el mismo elemento (sin duplicarlo)", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      canvas.appendChild(root);
    });

    const executed = [];
    eventBus.on(Events.EXECUTE_ACTION, (payload) => executed.push(payload));

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            {
              id: "btn-login",
              type: "button",
              data: { text: "Iniciar sesión" },
              actions: { click: [{ type: "sys.increment", path: "contador", delta: 1 }] }
            }
          ]
        }
      }
    });

    const root = container.children[0];
    const btnBeforeUpdate = root.children[0];

    // Actualización posterior por JSON: cambia texto y acción del nodo
    // que fue anexado (no adoptado) durante la hidratación.
    eventBus.emit(Events.NODE_UPDATED, {
      jsonNode: {
        id: "btn-login",
        type: "button",
        data: { text: "Sesión iniciada (1)" },
        actions: { click: [{ type: "sys.navigate", path: "/dashboard" }] }
      }
    });

    assert.equal(root.children.length, 1, "no debe duplicar el nodo, solo actualizarlo");
    const btnAfterUpdate = root.children[0];
    assert.equal(btnAfterUpdate, btnBeforeUpdate, "debe seguir siendo el mismo elemento (mismo tag → in-place)");
    assert.equal(btnAfterUpdate.textContent, "Sesión iniciada (1)");

    btnAfterUpdate.dispatch("click", { clientX: 1, clientY: 1 });

    assert.equal(executed.length, 1);
    assert.deepEqual(executed[0].action, [{ type: "sys.navigate", path: "/dashboard" }]);
  });
});

describe("Renderer — hidratación: poda de huérfanos", () => {
  test("un hijo estático sin contraparte en el JSON se elimina del DOM", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const a = dom.createHtmlEl("span"); a.id = "a";
      const b = dom.createHtmlEl("span"); b.id = "b";
      const c = dom.createHtmlEl("span"); c.id = "c";
      root.appendChild(a);
      root.appendChild(b);
      root.appendChild(c);
      canvas.appendChild(root);
    });

    // El JSON solo declara "a" -- "b" y "c" son huérfanos estáticos
    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [{ id: "a", type: "span", data: { text: "A" } }]
        }
      }
    });

    const root = container.children[0];
    assert.deepEqual(root.children.map((el) => el.id), ["a"]);
  });

  test("children: [] (array vacío explícito) poda TODOS los hijos estáticos", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const a = dom.createHtmlEl("span"); a.id = "a";
      const b = dom.createHtmlEl("span"); b.id = "b";
      root.appendChild(a);
      root.appendChild(b);
      canvas.appendChild(root);
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "root", type: "div", children: [] } }
    });

    const root = container.children[0];
    assert.equal(root.children.length, 0);
  });

  test("children OMITIDO (no es un array) deja ese subárbol estático intacto -- válvula de escape", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const widget = dom.createHtmlEl("div"); widget.id = "widget-terceros";
      const inner = dom.createHtmlEl("span"); inner.id = "inner-terceros";
      widget.appendChild(inner);
      root.appendChild(widget);
      canvas.appendChild(root);
    });

    // El nodo "root" se adopta, pero no declara `children` -- no debe tocar nada debajo
    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "root", type: "div" } }
    });

    const root = container.children[0];
    assert.deepEqual(root.children.map((el) => el.id), ["widget-terceros"]);
    assert.equal(root.children[0].children[0].id, "inner-terceros");
  });

  test("poda combinada con anexado y reorden: estático [a, c], JSON [a, b] -- c se poda, b se ancla en su lugar", () => {
    const { eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      const a = dom.createHtmlEl("span"); a.id = "a";
      const c = dom.createHtmlEl("span"); c.id = "c";
      root.appendChild(a);
      root.appendChild(c);
      canvas.appendChild(root);
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            { id: "a", type: "span" },
            { id: "b", type: "span" }
          ]
        }
      }
    });

    const root = container.children[0];
    assert.deepEqual(root.children.map((el) => el.id), ["a", "b"]);
  });

});

describe("Renderer — hidratación: una segunda STATE_CHANGED después de ya hidratado", () => {
  test("la segunda vez NO vuelve a hidratar -- hace un render normal (destructivo) del nuevo árbol", () => {
    const { eventBus, dom, container } = makeHydratingRenderer((fakeDom, canvas) => {
      const root = fakeDom.createHtmlEl("div");
      root.id = "root";
      const saludo = fakeDom.createHtmlEl("p");
      saludo.id = "saludo";
      root.appendChild(saludo);
      canvas.appendChild(root);
    });

    // 1er STATE_CHANGED: hidrata sobre el estático
    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "root", type: "div", children: [{ id: "saludo", type: "p", data: { text: "Hola" } }] } }
    });
    assert.equal(container.children[0].id, "root");

    // 2do STATE_CHANGED: simula una navegación SPA o un state.reload de RealtimePlugin,
    // con un árbol totalmente distinto (otra página)
    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "otra-pagina", type: "div", children: [{ id: "x", type: "span", data: { text: "Nueva página" } }] } }
    });

    // El contenedor fue reemplazado por completo -- ya no queda nada del árbol hidratado
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].id, "otra-pagina");
    assert.equal(container.children[0].children[0].textContent, "Nueva página");
    assert.equal(dom.getHtmlEl("saludo"), null);
    assert.equal(dom.getHtmlEl("root"), null);
  });
});

describe("Renderer — hidratación: tipos custom (asignación de id)", () => {
  test("un tipo custom que hidrata/anexa un elemento sin id propio queda igualmente indexado por jsonNode.id", () => {
    const { renderer, eventBus, container } = makeHydratingRenderer((dom, canvas) => {
      const root = dom.createHtmlEl("div");
      root.id = "root";
      canvas.appendChild(root);
    });

    renderer.registerElementType("toggle-button", (jsonNode, dom) => {
      // Compilador custom que NO asigna id propio (caso real: solo arma
      // la estructura visual y delega el resto en Renderer._compileNode).
      const el = dom.createHtmlEl("label");
      el.className = "sp-toggle";
      return el;
    });

    const executed = [];
    eventBus.on(Events.EXECUTE_ACTION, (payload) => executed.push(payload));

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            {
              id: "t1",
              type: "toggle-button",
              data: { text: "Activo" },
              actions: { click: [{ type: "sys.toggle", path: "activo" }] }
            }
          ]
        }
      }
    });

    const toggle = container.children[0].children[0];
    assert.equal(toggle.id, "t1");

    toggle.dispatch("click", {});
    assert.equal(executed.length, 1);
    assert.equal(executed[0].nodeId, "t1");
  });
});
