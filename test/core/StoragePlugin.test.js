// ==========================================
// ARCHIVO: test/plugins/StoragePlugin.test.js
// ==========================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { StoragePlugin } from "../../src/plugins/StoragePlugin.js";
import { DataStore } from "../../src/core/DataStore.js";

// ── Fakes de APIs de browser que no existen en Node ────────────────────────

class FakeStorage {
  constructor() {
    this._data = new Map();
  }
  getItem(k) {
    return this._data.has(k) ? this._data.get(k) : null;
  }
  setItem(k, v) {
    this._data.set(k, String(v));
  }
  removeItem(k) {
    this._data.delete(k);
  }
  key(i) {
    return [...this._data.keys()][i] ?? null;
  }
  get length() {
    return this._data.size;
  }
}

class FakeFileReader {
  readAsText(file) {
    this._file = file;
    FakeFileReader.lastInstance = this;
  }
}

function makeFakeDocument() {
  let cookieStr = "";
  const bodyChildren = [];
  return {
    get cookie() {
      return cookieStr;
    },
    set cookie(newPairRaw) {
      const [pair] = newPairRaw.split(";");
      const [name] = pair.split("=");
      const kept = cookieStr
        .split("; ")
        .filter(Boolean)
        .filter((c) => !c.startsWith(`${name}=`));
      cookieStr = [...kept, pair].join("; ");
    },
    body: {
      children: bodyChildren,
      appendChild(el) {
        bodyChildren.push(el);
      },
      removeChild(el) {
        const i = bodyChildren.indexOf(el);
        if (i !== -1) bodyChildren.splice(i, 1);
      }
    }
  };
}

function makeFakeDom() {
  const created = [];
  return {
    created,
    createHtmlEl(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        href: "",
        download: "",
        type: "",
        accept: "",
        onchange: null,
        clicked: false,
        click() {
          this.clicked = true;
        }
      };
      created.push(el);
      return el;
    }
  };
}

/** Instala los globals falsos, corre fn(), y siempre los restaura -- incluso
 * si fn() lanza. Evita que un fake se filtre a otros tests del archivo. */
async function withFakeBrowserEnv(fn) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalFileReader = globalThis.FileReader;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

  const objectUrlCalls = { created: [], revoked: [] };
  globalThis.window = { localStorage: new FakeStorage(), sessionStorage: new FakeStorage() };
  globalThis.document = makeFakeDocument();
  globalThis.FileReader = FakeFileReader;
  globalThis.URL.createObjectURL = (blob) => {
    objectUrlCalls.created.push(blob);
    return "blob:fake-url";
  };
  globalThis.URL.revokeObjectURL = (url) => objectUrlCalls.revoked.push(url);

  try {
    return await fn({ window: globalThis.window, document: globalThis.document, objectUrlCalls });
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.FileReader = originalFileReader;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

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

function makeApp(overrides = {}) {
  const eventBus = makeEventBus();
  const dataStore = new DataStore(eventBus);
  const registeredActions = new Map();
  const actionManager = { register: (type, fn) => registeredActions.set(type, fn) };
  const errorReporter = {
    warnings: [],
    errors: [],
    warn: (...a) => errorReporter.warnings.push(a),
    error: (...a) => errorReporter.errors.push(a)
  };
  const app = {
    dataStore,
    eventBus,
    actionManager,
    errorReporter,
    loadState: async (state) => {
      app._loadedState = state;
    },
    ...overrides
  };
  return { app, eventBus, dataStore, registeredActions, errorReporter };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("StoragePlugin — sincronización automática (syncPaths)", () => {
  test("hidrata el DataStore desde localStorage al instalar", () =>
    withFakeBrowserEnv(async ({ window }) => {
      window.localStorage.setItem("sp_usuario.nombre", JSON.stringify("Fede"));

      const { app, dataStore } = makeApp();
      await StoragePlugin.install(app, { syncPaths: ["usuario.nombre"] });

      assert.equal(dataStore.get("usuario.nombre"), "Fede");
    }));

  test("sin valor previo en localStorage, no toca el DataStore", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore } = makeApp();
      await StoragePlugin.install(app, { syncPaths: ["nada.guardado"] });

      assert.equal(dataStore.get("nada.guardado"), undefined);
    }));

  test("guarda automáticamente en localStorage cuando cambia un path sincronizado", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, dataStore } = makeApp();
      await StoragePlugin.install(app, { syncPaths: ["config.tema"] });

      dataStore.set("config.tema", "oscuro");

      assert.equal(window.localStorage.getItem("sp_config.tema"), JSON.stringify("oscuro"));
    }));

  test("NO guarda si el path cambiado no es uno de los sincronizados", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, dataStore } = makeApp();
      await StoragePlugin.install(app, { syncPaths: ["config.tema"] });

      dataStore.set("otra.cosa", "x");

      assert.equal(window.localStorage.getItem("sp_otra.cosa"), null);
    }));

  test("respeta storagePrefix custom", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, dataStore } = makeApp();
      await StoragePlugin.install(app, { syncPaths: ["x"], storagePrefix: "miapp_" });

      dataStore.set("x", 1);
      assert.equal(window.localStorage.getItem("miapp_x"), "1");
    }));
});

describe("StoragePlugin — acciones de Web Storage", () => {
  test("storage.set guarda un valor explícito", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.set")({ key: "k1", value: { a: 1 } }, { dataStore: app.dataStore });

      assert.equal(window.localStorage.getItem("sp_k1"), JSON.stringify({ a: 1 }));
    }));

  test("storage.set sin value pero con path, toma el valor del DataStore", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});
      dataStore.set("usuario.nombre", "Fede");

      await registeredActions.get("storage.set")({ key: "k2", path: "usuario.nombre" }, { dataStore });

      assert.equal(window.localStorage.getItem("sp_k2"), JSON.stringify("Fede"));
    }));

  test("storage.set sin key no hace nada", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.set")({ value: 1 }, { dataStore: app.dataStore });
      assert.equal(window.localStorage.length, 0);
    }));

  test("storage.get lee y escribe en targetPath", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, dataStore, registeredActions } = makeApp();
      window.localStorage.setItem("sp_k3", JSON.stringify(42));
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.get")({ key: "k3", targetPath: "leido" }, { dataStore });

      assert.equal(dataStore.get("leido"), 42);
    }));

  test("storage.get usa defaultValue si la clave no existe", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.get")(
        { key: "no-existe", targetPath: "leido", defaultValue: "fallback" },
        { dataStore }
      );

      assert.equal(dataStore.get("leido"), "fallback");
    }));

  test("storage.remove elimina la clave", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, registeredActions } = makeApp();
      window.localStorage.setItem("sp_k4", "1");
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.remove")({ key: "k4" }, {});
      assert.equal(window.localStorage.getItem("sp_k4"), null);
    }));

  test("storage.clear solo elimina las claves con el prefijo del plugin", () =>
    withFakeBrowserEnv(async ({ window }) => {
      const { app, registeredActions } = makeApp();
      window.localStorage.setItem("sp_a", "1");
      window.localStorage.setItem("sp_b", "2");
      window.localStorage.setItem("otra-app_c", "3");
      await StoragePlugin.install(app, {});

      await registeredActions.get("storage.clear")({}, {});

      assert.equal(window.localStorage.getItem("sp_a"), null);
      assert.equal(window.localStorage.getItem("sp_b"), null);
      assert.equal(window.localStorage.getItem("otra-app_c"), "3");
    }));
});

describe("StoragePlugin — acciones de cookies", () => {
  test("cookie.set y cookie.get redondean el mismo valor (JSON)", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("cookie.set")({ name: "pref", value: { tema: "oscuro" } }, {});
      await registeredActions.get("cookie.get")({ name: "pref", targetPath: "leida" }, { dataStore });

      assert.deepEqual(dataStore.get("leida"), { tema: "oscuro" });
    }));

  test("cookie.get usa defaultValue si la cookie no existe", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("cookie.get")(
        { name: "no-existe", targetPath: "leida", defaultValue: "x" },
        { dataStore }
      );

      assert.equal(dataStore.get("leida"), "x");
    }));

  test("cookie.set sin name no hace nada", () =>
    withFakeBrowserEnv(async ({ document }) => {
      const { app, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});

      await registeredActions.get("cookie.set")({ value: "x" }, {});
      assert.equal(document.cookie, "");
    }));
});

describe("StoragePlugin — file.downloadJson / file.uploadJson", () => {
  test("file.downloadJson crea un Blob, dispara la descarga y limpia después", () =>
    withFakeBrowserEnv(async ({ document, objectUrlCalls }) => {
      const { app, dataStore, registeredActions } = makeApp();
      dataStore.set("usuario.nombre", "Fede");
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.downloadJson")({ filename: "backup.json" }, { dataStore, dom });

      assert.equal(objectUrlCalls.created.length, 1);
      assert.equal(objectUrlCalls.revoked[0], "blob:fake-url");
      const link = dom.created.find((el) => el.tagName === "A");
      assert.equal(link.download, "backup.json");
      assert.equal(link.clicked, true);
      assert.equal(document.body.children.includes(link), false); // se agrega y se saca en el mismo tick
    }));

  test("file.downloadJson con path descarga solo esa rama, no todo el snapshot", () =>
    withFakeBrowserEnv(async ({ objectUrlCalls }) => {
      const { app, dataStore, registeredActions } = makeApp();
      dataStore.set("a", 1);
      dataStore.set("b", 2);
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.downloadJson")({ path: "a" }, { dataStore, dom });

      const [blob] = objectUrlCalls.created;
      const text = await blob.text();
      assert.equal(text, JSON.stringify(1, null, 2));
    }));

  test("file.uploadJson con JSON válido escribe en targetPath", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.uploadJson")({ targetPath: "importado" }, { dataStore, dom });

      const input = dom.created.find((el) => el.type === "file");
      assert.equal(input.accept, ".json,application/json");
      assert.equal(input.clicked, true);

      input.onchange({ target: { files: [{ name: "datos.json" }] } });
      await FakeFileReader.lastInstance.onload({ target: { result: '{"x":1}' } });

      assert.deepEqual(dataStore.get("importado"), { x: 1 });
    }));

  test("file.uploadJson con reloadState:true llama a app.loadState() en vez de dataStore.set", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.uploadJson")({ reloadState: true }, { dataStore, dom });

      const input = dom.created.find((el) => el.type === "file");
      input.onchange({ target: { files: [{ name: "estado.json" }] } });
      await FakeFileReader.lastInstance.onload({ target: { result: '{"root":{"id":"r"}}' } });

      assert.deepEqual(app._loadedState, { root: { id: "r" } });
    }));

  test("file.uploadJson con JSON inválido reporta el error, no lanza", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions, errorReporter } = makeApp();
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.uploadJson")({ targetPath: "x" }, { dataStore, dom });

      const input = dom.created.find((el) => el.type === "file");
      input.onchange({ target: { files: [{ name: "roto.json" }] } });

      await assert.doesNotReject(() =>
        FakeFileReader.lastInstance.onload({ target: { result: "{esto no es json" } })
      );
      assert.equal(errorReporter.errors.length, 1);
    }));

  test("file.uploadJson sin archivo elegido no hace nada", () =>
    withFakeBrowserEnv(async () => {
      const { app, dataStore, registeredActions } = makeApp();
      await StoragePlugin.install(app, {});
      const dom = makeFakeDom();

      await registeredActions.get("file.uploadJson")({ targetPath: "x" }, { dataStore, dom });

      const input = dom.created.find((el) => el.type === "file");
      assert.doesNotThrow(() => input.onchange({ target: { files: [] } }));
      assert.equal(dataStore.get("x"), undefined);
    }));
});
