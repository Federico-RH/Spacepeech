// ==========================================
// ARCHIVO: test/helpers/fakeDom.js
// ==========================================

/**
 * DOM falso mínimo, sin dependencias externas (nada de jsdom). Implementa
 * únicamente lo que Renderer.js efectivamente usa a través de la fachada
 * `dom`: createHtmlEl, createDocumentFragment, getHtmlEl, getActiveElement.
 * No es un motor de CSS ni un parser de selectores general -- querySelector/
 * querySelectorAll solo soportan los patrones puntuales que Renderer.js
 * necesita (".clase1, .clase2", 'input[type="checkbox"]', "input", "[id]").
 */

export class FakeElement {
  constructor(tagName, namespaceURI = null) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = namespaceURI;
    this.id = "";
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.type = "";
    this.href = "";
    this.src = "";
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentElement = null;

    this._attrs = new Map();
    this._classes = new Set();
    this._listeners = new Map();

    this.classList = {
      toggle: (cls, force) => {
        const has = this._classes.has(cls);
        const shouldHave = force === undefined ? !has : Boolean(force);
        if (shouldHave) this._classes.add(cls);
        else this._classes.delete(cls);
        return shouldHave;
      },
      add: (cls) => this._classes.add(cls),
      remove: (cls) => this._classes.delete(cls),
      contains: (cls) => this._classes.has(cls)
    };
  }

  setAttribute(name, value) {
    this._attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }

  hasAttribute(name) {
    return this._attrs.has(name);
  }

  removeAttribute(name) {
    this._attrs.delete(name);
  }

  toggleAttribute(name, force) {
    const has = this._attrs.has(name);
    const shouldHave = force === undefined ? !has : Boolean(force);
    if (shouldHave) this._attrs.set(name, "");
    else this._attrs.delete(name);
    return shouldHave;
  }

  appendChild(child) {
    if (child instanceof FakeFragment) {
      for (const c of [...child.children]) this.appendChild(c);
      child.children = [];
      return child;
    }
    // El DOM real MUEVE el nodo: si ya tenía padre, primero lo desacopla de
    // ahí. Sin esto, moveBranch() quedaba "duplicando" el nodo en ambos
    // padres en vez de reubicarlo.
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  /**
   * Inserta newNode inmediatamente antes de referenceNode dentro de este
   * elemento, o al final si referenceNode es null/undefined -- igual que
   * Node.insertBefore en el DOM real. Necesario para que la hidratación
   * pueda reubicar un nodo recién creado (o adoptado desde otro lugar del
   * árbol) en la posición que le corresponde según el JSON, en vez de
   * quedar siempre al final vía appendChild.
   */
  insertBefore(newNode, referenceNode) {
    if (newNode.parentElement) {
      newNode.parentElement.removeChild(newNode);
    }
    newNode.parentElement = this;

    if (referenceNode == null) {
      this.children.push(newNode);
      return newNode;
    }

    const idx = this.children.indexOf(referenceNode);
    if (idx === -1) {
      this.children.push(newNode);
    } else {
      this.children.splice(idx, 0, newNode);
    }
    return newNode;
  }

  /**
   * Renderer._initBusListeners() usa containerEl.firstElementChild para
   * decidir si hay HTML estático previo que hidratar. Sin esta propiedad
   * (ausente en la versión anterior de este helper) esa condición siempre
   * da falsy y el motor cae siempre en renderRoot (destructivo) aunque el
   * modo hidratación esté activo -- cualquier test de hidratación quedaba
   * validando código que en realidad nunca se ejecutaba.
   */
  get firstElementChild() {
    return this.children[0] || null;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }

  replaceWith(newEl) {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx !== -1) {
      this.parentElement.children[idx] = newEl;
      newEl.parentElement = this.parentElement;
      this.parentElement = null;
    }
  }

  replaceChildren(...nodes) {
    for (const c of this.children) c.parentElement = null;
    this.children = [];
    for (const n of nodes) this.appendChild(n);
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(handler);
  }

  /** No es parte de la API real del DOM -- helper de test para simular un
   * evento con burbujeo (bubbling) hasta los ancestros, igual que un click
   * real en el navegador. Renderer delega TODOS los eventos en un único
   * listener puesto en el contenedor (ver Renderer._bindDomEvents), así que
   * sin burbujeo estos tests no dispararían nada. event.target queda fijo
   * en el elemento original en el que se llamó dispatch(), como en el DOM
   * real -- solo cambia qué listeners de qué ancestro se ejecutan. */
  dispatch(type, evtProps = {}) {
    const event = { target: this, preventDefault() {}, ...evtProps };
    let current = this;
    while (current) {
      const handlers = current._listeners.get(type) || [];
      for (const h of [...handlers]) h(event);
      current = current.parentElement;
    }
    return event;
  }

  querySelector(selector) {
    const selectors = selector.split(",").map((s) => s.trim());
    const matchOne = (el, sel) => {
      if (sel.startsWith(".")) return el._classes.has(sel.slice(1));
      const attrMatch = sel.match(/^([a-zA-Z]+)\[([a-zA-Z]+)="([^"]+)"\]$/);
      if (attrMatch) {
        const [, tag, attr, val] = attrMatch;
        if (el.tagName !== tag.toUpperCase()) return false;
        return attr === "type" ? el.type === val : el.getAttribute(attr) === val;
      }
      return el.tagName === sel.toUpperCase();
    };
    const search = (el) => {
      for (const child of el.children) {
        if (selectors.some((s) => matchOne(child, s))) return child;
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(this);
  }

  querySelectorAll(selector) {
    const results = [];
    const matches = (el) => selector === "[id]" && Boolean(el.id);
    const search = (el) => {
      for (const child of el.children) {
        if (matches(child)) results.push(child);
        search(child);
      }
    };
    search(this);
    return results;
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (selector === "[data-bind]" && cur.dataset?.bind) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
}

class FakeFragment {
  constructor() {
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

/**
 * Crea una fachada de dom falsa + un elemento raíz al que hay que "montar"
 * el contenedor de la app (ver ejemplo de uso en Renderer.test.js) para que
 * getHtmlEl(id) pueda encontrar cualquier nodo ya insertado en el árbol,
 * igual que document.getElementById en un DOM real.
 */
export function makeFakeDom() {
  const root = new FakeElement("fake-root");

  const findById = (el, id) => {
    if (el.id === id) return el;
    for (const child of el.children) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  };

  return {
    _root: root,
    createHtmlEl: (tag) => new FakeElement(tag),
    createDocumentFragment: () => new FakeFragment(),
    getActiveElement: () => null,
    setTitle: () => {},
    getHtmlEl: (id) => findById(root, id)
  };
}
