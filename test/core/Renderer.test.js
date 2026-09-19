// ==========================================
// ARCHIVO: test/engine/Renderer.test.js
// ==========================================

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

/** Monta un Renderer con contenedor "canvas" ya presente en el DOM falso. */
function makeMountedRenderer() {
  const dom = makeFakeDom();
  const container = dom.createHtmlEl("div");
  container.id = "canvas";
  dom._root.appendChild(container);

  const eventBus = makeEventBus();
  const errorReporter = makeErrorReporter();
  const renderer = new Renderer("canvas", dom, eventBus, errorReporter);
  renderer.init();

  return { dom, eventBus, errorReporter, renderer, container };
}

describe("Renderer — construcción", () => {
  test("lanza si falta containerId, dom o eventBus", () => {
    const dom = makeFakeDom();
    const eventBus = makeEventBus();
    assert.throws(() => new Renderer(null, dom, eventBus), /containerId is required/);
    assert.throws(() => new Renderer("canvas", null, eventBus), /dom is required/);
    assert.throws(() => new Renderer("canvas", dom, null), /eventBus is required/);
  });

  test("init() sin contenedor en el DOM avisa (warn) y no lanza", () => {
    const dom = makeFakeDom();
    const eventBus = makeEventBus();
    const errorReporter = makeErrorReporter();
    const renderer = new Renderer("no-existe", dom, eventBus, errorReporter);

    assert.doesNotThrow(() => renderer.init());
    assert.equal(errorReporter.warnings.length, 1);
  });
});

describe("Renderer — registerElementType", () => {
  test("valida tipo y función", () => {
    const { renderer } = makeMountedRenderer();
    assert.throws(() => renderer.registerElementType(42, () => {}), /type must be a string/);
    assert.throws(() => renderer.registerElementType("x", null), /compilerFn a function/);
  });

  test("un tipo custom registrado se compila con el compilador provisto", () => {
    const { renderer, eventBus, container } = makeMountedRenderer();

    renderer.registerElementType("toggle-button", (jsonNode, dom) => {
      const el = dom.createHtmlEl("label");
      el.className = "sp-toggle";
      return el;
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "t1", type: "toggle-button", data: { text: "Activo" } } }
    });

    const compiled = container.children[0];
    assert.equal(compiled.tagName, "LABEL");
    assert.equal(compiled.id, "t1");
    assert.equal(compiled.dataset.nodeId, "t1");
    assert.equal(compiled.dataset.type, "toggle-button");
  });
});

describe("Renderer — renderRoot vía Events.STATE_CHANGED", () => {
  test("compila el árbol y lo monta en el contenedor", () => {
    const { eventBus, container } = makeMountedRenderer();

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [{ id: "hijo", type: "span", data: { text: "hola" } }]
        }
      }
    });

    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].id, "root");
    assert.equal(container.children[0].children[0].textContent, "hola");
  });

  test("un compilador custom que lanza produce un placeholder de error, no rompe el render", () => {
    const { renderer, eventBus, errorReporter, container } = makeMountedRenderer();

    renderer.registerElementType("roto", () => {
      throw new Error("fallo intencional");
    });

    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "n1", type: "roto" } }
    });

    assert.equal(errorReporter.errors.length, 1);
    assert.equal(container.children[0].id, "n1");
    assert.match(container.children[0].textContent, /Render error/);
  });
});

describe("Renderer — elementos compuestos (select / ul / table)", () => {
  test("select con data.options genera <option>", () => {
    const { eventBus, container } = makeMountedRenderer();

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "sel",
          type: "select",
          data: { options: [{ value: "ar", text: "Argentina" }, "Brasil"] }
        }
      }
    });

    const select = container.children[0];
    assert.equal(select.children.length, 2);
    assert.equal(select.children[0].value, "ar");
    assert.equal(select.children[0].textContent, "Argentina");
    assert.equal(select.children[1].value, "Brasil");
  });

  test("ul con data.items genera <li>", () => {
    const { eventBus, container } = makeMountedRenderer();

    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "lista", type: "ul", data: { items: ["uno", "dos"] } } }
    });

    const ul = container.children[0];
    assert.equal(ul.children.length, 2);
    assert.equal(ul.children[0].textContent, "uno");
  });

  test("table con headers+rows genera thead/tbody", () => {
    const { eventBus, container } = makeMountedRenderer();

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "tabla",
          type: "table",
          data: { headers: ["Nombre", "Edad"], rows: [["Fede", 30]] }
        }
      }
    });

    const table = container.children[0];
    const [thead, tbody] = table.children;
    assert.equal(thead.tagName, "THEAD");
    assert.equal(thead.children[0].children[0].textContent, "Nombre");
    assert.equal(tbody.children[0].children[1].textContent, "30");
  });

  test("un select sin data.options no se trata como compuesto (usa children normales)", () => {
    const { eventBus, container } = makeMountedRenderer();

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "sel2",
          type: "select",
          children: [{ id: "opt-manual", type: "option", data: { text: "manual" } }]
        }
      }
    });

    assert.equal(container.children[0].children[0].id, "opt-manual");
  });
});

describe("Renderer — delegación de eventos DOM", () => {
  test("input con data-bind emite SET_DATA_PROP con el valor del input", () => {
    const { eventBus, container } = makeMountedRenderer();
    const events = [];
    eventBus.on(Events.SET_DATA_PROP, (p) => events.push(p));

    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "campo", type: "input", bind: "usuario.nombre" } }
    });

    const inputEl = container.children[0];
    inputEl.value = "Fede";
    inputEl.dispatch("input", {});

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { path: "usuario.nombre", value: "Fede" });
  });

  test("click en un nodo con actions.click emite EXECUTE_ACTION", () => {
    const { eventBus, container } = makeMountedRenderer();
    const captured = [];
    eventBus.on(Events.EXECUTE_ACTION, (p) => captured.push(p));

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "btn",
          type: "button",
          actions: { click: { type: "sys.increment", path: "x" } }
        }
      }
    });

    const btnEl = container.children[0];
    btnEl.dispatch("click", { clientX: 1, clientY: 2 });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].nodeId, "btn");
    assert.deepEqual(captured[0].action, { type: "sys.increment", path: "x" });
  });

  test("el click burbujea hasta encontrar un ancestro con acción registrada", () => {
    const { eventBus, container } = makeMountedRenderer();
    const captured = [];
    eventBus.on(Events.EXECUTE_ACTION, (p) => captured.push(p));

    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "card",
          type: "div",
          actions: { click: { type: "sys.set", path: "clicked", value: true } },
          children: [{ id: "icono-interno", type: "span" }]
        }
      }
    });

    const innerEl = container.children[0].children[0];
    innerEl.dispatch("click", {});

    assert.equal(captured.length, 1);
    assert.equal(captured[0].nodeId, "card");
  });
});

describe("Renderer — _updateNodeProp (reactividad granular)", () => {
  function mountSimpleNode() {
    const ctx = makeMountedRenderer();
    ctx.eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "n1", type: "div", data: { text: "inicial" } } }
    });
    return ctx;
  }

  test("prop 'disabled' hace toggleAttribute + toggle de clase", () => {
    const { eventBus, container } = mountSimpleNode();
    eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: "n1", prop: "disabled", value: true });

    const el = container.children[0];
    assert.equal(el.hasAttribute("disabled"), true);
    assert.equal(el.classList.contains("disabled"), true);
  });

  test("prop 'class' reemplaza className", () => {
    const { eventBus, container } = mountSimpleNode();
    eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: "n1", prop: "class", value: "nueva-clase" });
    assert.equal(container.children[0].className, "nueva-clase");
  });

  test("prop 'style.color' asigna en el objeto style", () => {
    const { eventBus, container } = mountSimpleNode();
    eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: "n1", prop: "style.color", value: "#f00" });
    assert.equal(container.children[0].style.color, "#f00");
  });

  test("prop 'data.text' actualiza textContent", () => {
    const { eventBus, container } = mountSimpleNode();
    eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: "n1", prop: "data.text", value: "actualizado" });
    assert.equal(container.children[0].textContent, "actualizado");
  });

  test("prop sobre un nodeId inexistente no lanza (no-op)", () => {
    const { eventBus } = mountSimpleNode();
    assert.doesNotThrow(() =>
      eventBus.emit(Events.UPDATE_NODE_PROP, { nodeId: "no-existe", prop: "class", value: "x" })
    );
  });
});

describe("Renderer — insertBranch / removeBranch / moveBranch", () => {
  test("insertBranch agrega un nodo nuevo bajo el padre indicado", () => {
    const { eventBus, container } = makeMountedRenderer();
    eventBus.emit(Events.STATE_CHANGED, { state: { root: { id: "panel", type: "div" } } });

    eventBus.emit(Events.NODE_INSERTED, {
      jsonNode: { id: "nuevo", type: "span", data: { text: "hola" } },
      parentId: "panel"
    });

    assert.equal(container.children[0].children[0].id, "nuevo");
  });

  test("removeBranch saca el nodo del DOM", () => {
    const { eventBus, container } = makeMountedRenderer();
    eventBus.emit(Events.STATE_CHANGED, {
      state: { root: { id: "root", type: "div", children: [{ id: "a", type: "span" }] } }
    });

    eventBus.emit(Events.NODE_REMOVED, { nodeId: "a" });

    assert.equal(container.children[0].children.length, 0);
  });

  test("moveBranch reubica un nodo existente bajo otro padre", () => {
    const { eventBus, container } = makeMountedRenderer();
    eventBus.emit(Events.STATE_CHANGED, {
      state: {
        root: {
          id: "root",
          type: "div",
          children: [
            { id: "origen", type: "div", children: [{ id: "movido", type: "span" }] },
            { id: "destino", type: "div" }
          ]
        }
      }
    });

    eventBus.emit(Events.NODE_MOVED, { nodeId: "movido", targetNodeId: "destino" });

    const [origen, destino] = container.children[0].children;
    assert.equal(origen.children.length, 0);
    assert.equal(destino.children[0].id, "movido");
  });
});
