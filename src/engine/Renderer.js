// =============================================================================
// FILE: src/engine/Renderer.js
// =============================================================================

import { Events } from "../core/Events.js";
import { RenderError } from "../core/AppError.js";

const SVG_ATTRS = new Set([
  "viewBox", "d", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1",
  "x2", "y2", "points", "width", "height", "transform", "opacity"
]);

const HTML_INPUT_ATTRS = new Set([
  "min", "max", "step", "placeholder", "autocomplete", "readonly", "required", "type", "value", "selected", "checked"
]);

/**
 * Renderer — src/engine/Renderer.js
 *
 * Granular branch rendering engine with static hydration support.
 */
export class Renderer {
  #nodeActionMap = new Map();
  #customCompilers = new Map();
  #hydrationMode = false;
  #isHydrated = false;

  constructor(containerId, dom, eventBus, errorReporter) {
    if (!containerId) throw new Error("Renderer: containerId is required.");
    if (!dom) throw new Error("Renderer: dom is required.");
    if (!eventBus) throw new Error("Renderer: eventBus is required.");

    this.containerId = containerId;
    this.dom = dom;
    this.eventBus = eventBus;
    this.errorReporter = errorReporter;
    this.containerEl = null;

    this._initBusListeners();
  }

  /**
   * Enables or disables hydration mode for existing DOM.
   * @param {boolean} enabled
   */
  setHydrationMode(enabled) {
    this.#hydrationMode = Boolean(enabled);
  }

  /**
   * Registers a compiler for custom element types (e.g. "toggle-button").
   * @param {string} type
   * @param {Function} compilerFn - (jsonNode, domFacade) => HTMLElement
   */
  registerElementType(type, compilerFn) {
    if (typeof type !== "string" || typeof compilerFn !== "function") {
      throw new Error("Renderer.registerElementType: type must be a string and compilerFn a function.");
    }
    this.#customCompilers.set(type.toLowerCase(), compilerFn);
  }

  init() {
    this.containerEl = this.dom.getHtmlEl(this.containerId);
    if (!this.containerEl) {
      this.errorReporter?.warn(`Renderer: container "#${this.containerId}" not found.`);
      return;
    }
    this._bindDomEvents();
  }

  _bindDomEvents() {
    if (!this.containerEl) return;

    const handleInput = (e) => {
      const bindPath = e.target.dataset?.bind || e.target.closest("[data-bind]")?.dataset?.bind;
      if (bindPath) {
        let val;
        if (e.target.type === "checkbox") {
          val = e.target.checked;
        } else if (e.target.type === "range" || e.target.type === "number") {
          const num = Number(e.target.value);
          val = Number.isNaN(num) ? e.target.value : num;
        } else {
          val = e.target.value;
        }
        this.eventBus.emit(Events.SET_DATA_PROP, { path: bindPath, value: val });
      }
    };

    this.containerEl.addEventListener("input", handleInput);
    this.containerEl.addEventListener("change", handleInput);

    const eventTypes = ["click", "dblclick", "submit", "mouseenter", "mouseleave", "focus", "blur"];
    for (const evType of eventTypes) {
      this.containerEl.addEventListener(evType, (e) => this._handleUserInteraction(evType, e));
    }
  }

  _handleUserInteraction(eventType, e) {
    let target = e.target;
    while (target && target !== this.containerEl) {
      const nodeId = target.id || target.dataset?.nodeId;
      if (nodeId && this.#nodeActionMap.has(nodeId)) {
        const actions = this.#nodeActionMap.get(nodeId);
        const actionToRun = actions[eventType] || actions.click;

        if (actionToRun) {
          if (eventType === "submit" || (eventType === "click" && target.tagName === "A")) {
            e.preventDefault();
          }
          this.eventBus.emit(Events.EXECUTE_ACTION, {
            action: actionToRun,
            nodeId,
            eventPayload: { type: eventType, x: e.clientX, y: e.clientY }
          });
          break;
        }
      }
      target = target.parentElement;
    }
  }

  _initBusListeners() {
    this.eventBus.on(Events.STATE_CHANGED, ({ state }) => {
      if (!this.containerEl) this.init();
      if (state?.root && this.containerEl) {
        if (this.#hydrationMode && !this.#isHydrated && this.containerEl.firstElementChild) {
          this.hydrateRoot(state.root);
        } else {
          this.renderRoot(state.root);
        }
      }
    });

    this.eventBus.on(Events.NODE_UPDATED, ({ jsonNode }) => {
      this.updateSubtree(jsonNode);
    });

    this.eventBus.on(Events.NODE_INSERTED, ({ jsonNode, parentId }) => {
      this.insertBranch(jsonNode, parentId);
    });

    this.eventBus.on(Events.NODE_REMOVED, ({ nodeId }) => {
      this.removeBranch(nodeId);
    });

    this.eventBus.on(Events.NODE_MOVED, ({ nodeId, targetNodeId }) => {
      this.moveBranch(nodeId, targetNodeId);
    });

    // Granular O(1) reactivity
    this.eventBus.on(Events.UPDATE_NODE_PROP, ({ nodeId, prop, value }) => {
      this._updateNodeProp(nodeId, prop, value);
    });
  }

  _updateNodeProp(nodeId, prop, value) {
    const el = this.dom.getHtmlEl(nodeId);
    if (!el) return;

    if (prop === "disabled") {
      const isDisabled = value === true || value === "true";
      el.toggleAttribute("disabled", isDisabled);
      const innerInput = el.tagName === "INPUT" ? el : el.querySelector?.("input");
      if (innerInput) innerInput.disabled = isDisabled;
      el.classList?.toggle("disabled", isDisabled);
      return;
    }

    if (prop === "active") {
      const isActive = value === true || value === "true";
      el.toggleAttribute("active", isActive);
      return;
    }

    if (["data.options", "data.items", "data.matrix", "data.rows"].includes(prop)) {
      el.replaceChildren();
      const mockNode = {
        type: el.dataset.type || el.tagName.toLowerCase(),
        data: { [prop.replace("data.", "")]: value }
      };
      this._compileCompositeElement(el, mockNode);
      return;
    }

    if (prop === "data.value" || prop === "value" || prop === "checked") {
      const innerCheckbox = el.type === "checkbox" ? el : el.querySelector?.('input[type="checkbox"]');
      if (innerCheckbox) {
        innerCheckbox.checked = Boolean(value);
        return;
      }

      const tag = el.tagName.toLowerCase();
      if (["input", "textarea", "select", "option"].includes(tag)) {
        if (el.value !== String(value)) {
          el.value = value;
        }
      }
      return;
    }

    if (prop === "data.text" || prop === "text") {
      const textSpan = el.querySelector?.(".sp-ui-label, .sp-toggle-label");
      if (textSpan) {
        textSpan.textContent = value ?? "";
      } else {
        el.textContent = value ?? "";
      }
      return;
    }

    if (prop === "data.src" || prop === "src") {
      el.src = value ?? "";
      return;
    }

    if (prop === "data.href" || prop === "href") {
      el.href = value ?? "";
      return;
    }

    if (prop === "class") {
      el.className = value ?? "";
      return;
    }

    if (prop.startsWith("style.")) {
      const cssProp = prop.replace("style.", "");
      el.style[cssProp] = value;
      return;
    }

    if (prop.startsWith("data.")) {
      const attrKey = prop.replace("data.", "");
      el.setAttribute(attrKey, String(value));
    }
  }

  hydrateRoot(rootNode) {
    if (!this.containerEl || !rootNode) return;
    this.#nodeActionMap.clear();
    this._hydrateNodeRecursive(rootNode, this.containerEl);
    this.#isHydrated = true;
  }

  _hydrateNodeRecursive(jsonNode, parentEl) {
    if (!jsonNode || typeof jsonNode !== "object") return null;

    let el = jsonNode.id ? this.dom.getHtmlEl(jsonNode.id) : null;

    if (el) {
      this._indexNodeActions(jsonNode);

      if (jsonNode.bind) {
        el.dataset.bind = jsonNode.bind;
      }
      if (jsonNode.type) {
        el.dataset.type = jsonNode.type;
      }

      this._applyAttributes(el, jsonNode);
      this._applyData(el, jsonNode);

      if (Array.isArray(jsonNode.children)) {
        this._hydrateChildrenInOrder(jsonNode.children, el);
      }
    } else {
      el = this._compileNode(jsonNode);
      if (parentEl) parentEl.appendChild(el);
    }

    return el;
  }

  /**
   * Hydrates node children respecting the order declared in the JSON.
   *
   * _hydrateNodeRecursive, for each child, only decides whether to adopt it
   * (it already exists in static HTML) or create it from scratch -- it never decides
   * IN WHICH POSITION it ends up inside parentEl. A node created from scratch arrives
   * there via _compileNode -> appendChild, so without this step it always ended up
   * at the end of parentEl.children regardless of the actual position that node had
   * in the JSON `children` array (ordering bug).
   *
   * It traverses children in the same order they come in the JSON and, for
   * each one, checks whether it is already at the expected position inside
   * parentEl.children. If not, it relocates it with insertBefore --
   * which remounts the node if it already had a parent (never duplicating or
   * recompiling it). Array.prototype.indexOf.call is used instead of
   * parentEl.children.indexOf because in real DOM `children` is an
   * HTMLCollection, not an array, and lacks that method.
   */
  _hydrateChildrenInOrder(children, parentEl) {
    let expectedIndex = 0;

    for (const child of children) {
      const childEl = this._hydrateNodeRecursive(child, parentEl);
      if (!childEl) continue;

      const currentIndex = Array.prototype.indexOf.call(parentEl.children, childEl);
      if (currentIndex !== expectedIndex) {
        const referenceEl = parentEl.children[expectedIndex] || null;
        parentEl.insertBefore(childEl, referenceEl);
      }

      expectedIndex += 1;
    }

    this._pruneOrphans(parentEl, expectedIndex);
  }

  /**
   * Removes from the DOM any parentEl child left over after reconciling
   * against the JSON: static content that existed in the HTML but has no
   * corresponding node in the current JSON `children`. The JSON is the single
   * source of truth across the engine (updateSubtree/renderRoot already destroy
   * and rebuild seamlessly) -- hydration shouldn't be the only path where an
   * element, once in the DOM, cannot be removed via JSON.
   *
   * fromIndex is the count of already reconciled children (adopted or
   * created) and correctly positioned at the start of parentEl.children
   * by the loop above -- anything beyond that index is, by definition, orphaned.
   *
   * Important: this is only called when jsonNode.children is an array
   * (see `if (Array.isArray(...))` in _hydrateNodeRecursive). If the JSON node
   * omits `children` entirely, that subtree remains unmanaged and unpruned --
   * which is the intended way to keep a static section completely outside
   * JSON control if desired.
   */
  _pruneOrphans(parentEl, fromIndex) {
    while (parentEl.children.length > fromIndex) {
      const orphan = parentEl.children[fromIndex];
      this._clearActionMapForSubtree(orphan);
      parentEl.removeChild(orphan);
    }
  }

  renderRoot(rootNode) {
    if (!this.containerEl || !rootNode) return;
    this.#nodeActionMap.clear();
    const fragment = this.dom.createDocumentFragment();
    const rootEl = this._compileNode(rootNode);
    fragment.appendChild(rootEl);
    this.containerEl.replaceChildren(fragment);
  }

  updateSubtree(jsonNode) {
    if (!jsonNode?.id) return;
    const existingEl = this.dom.getHtmlEl(jsonNode.id);
    if (!existingEl) return;

    this._indexNodeActions(jsonNode);

    const targetTag = (jsonNode.tag || jsonNode.type || "div").toLowerCase();

    if (existingEl.tagName.toLowerCase() !== targetTag) {
      const newEl = this._compileNode(jsonNode);
      existingEl.replaceWith(newEl);
    } else {
      this._applyAttributes(existingEl, jsonNode);
      existingEl.replaceChildren();

      const isComposite = this._compileCompositeElement(existingEl, jsonNode);
      if (!isComposite && Array.isArray(jsonNode.children)) {
        const fragment = this.dom.createDocumentFragment();
        for (const child of jsonNode.children) {
          fragment.appendChild(this._compileNode(child));
        }
        existingEl.appendChild(fragment);
      }

      this._applyData(existingEl, jsonNode);
    }
  }

  insertBranch(jsonNode, parentId) {
    if (!jsonNode?.id) return;

    const parentEl = parentId ? this.dom.getHtmlEl(parentId) : this.containerEl;
    if (!parentEl) {
      this.errorReporter?.warn(`Renderer.insertBranch: parent "#${parentId}" not found.`);
      return;
    }

    const existingEl = this.dom.getHtmlEl(jsonNode.id);
    if (existingEl) {
      this.updateSubtree(jsonNode);
      return;
    }

    const newEl = this._compileNode(jsonNode);
    parentEl.appendChild(newEl);
  }

  removeBranch(nodeId) {
    if (!nodeId) return;

    const el = this.dom.getHtmlEl(nodeId);
    if (el) {
      this._clearActionMapForSubtree(el);
      el.remove();
    } else {
      this.#nodeActionMap.delete(nodeId);
    }
  }

  _clearActionMapForSubtree(rootEl) {
    if (rootEl.id) this.#nodeActionMap.delete(rootEl.id);
    if (typeof rootEl.querySelectorAll !== "function") return;
    const descendantsWithId = rootEl.querySelectorAll("[id]");
    for (const descendant of descendantsWithId) {
      this.#nodeActionMap.delete(descendant.id);
    }
  }

  moveBranch(nodeId, targetParentId) {
    const el = this.dom.getHtmlEl(nodeId);
    const targetParent = this.dom.getHtmlEl(targetParentId) || this.containerEl;
    if (el && targetParent) {
      targetParent.appendChild(el);
    }
  }

  _compileNode(jsonNode) {
    try {
      this._indexNodeActions(jsonNode);

      const nodeType = (jsonNode.type || "").toLowerCase();

      if (this.#customCompilers.has(nodeType)) {
        const customCompiler = this.#customCompilers.get(nodeType);
        const el = customCompiler(jsonNode, this.dom);

        // Unconditional assignment: JSON id is the source of truth, it is
        // literally the key by which hydrateRoot/updateSubtree/_handleUserInteraction
        // find this element later. Leaving it conditional on "if custom compiler did not
        // set its own id" (as it was) silently broke hydration, JSON updates, and
        // action bindings for any custom type whose compiler already assigned its own id.
        if (jsonNode.id) el.id = jsonNode.id;
        el.dataset.nodeId = jsonNode.id;
        el.dataset.type = jsonNode.type;

        if (jsonNode.bind) {
          el.dataset.bind = jsonNode.bind;
        }

        this._applyAttributes(el, jsonNode);
        this._applyData(el, jsonNode);

        if (Array.isArray(jsonNode.children)) {
          for (const child of jsonNode.children) {
            el.appendChild(this._compileNode(child));
          }
        }
        return el;
      }

      const tag = (jsonNode.tag || jsonNode.type || "div").toLowerCase();
      const el = this.dom.createHtmlEl(tag);

      el.id = jsonNode.id;
      this._applyAttributes(el, jsonNode);

      const isComposite = this._compileCompositeElement(el, jsonNode);

      if (!isComposite && Array.isArray(jsonNode.children)) {
        for (const child of jsonNode.children) {
          const childEl = this._compileNode(child);
          el.appendChild(childEl);
        }
      }

      this._applyData(el, jsonNode);

      return el;
    } catch (err) {
      this.errorReporter?.reportError(
        new RenderError(`Error compiling node "${jsonNode?.id}"`, { nodeId: jsonNode?.id, cause: err })
      );
      return this._createErrorPlaceholder(jsonNode?.id);
    }
  }

  _compileCompositeElement(el, jsonNode) {
    const type = (jsonNode.type || jsonNode.tag || "").toLowerCase();
    const data = jsonNode.data || {};

    if (type === "select" && Array.isArray(data.options)) {
      if (data.placeholder) {
        const placeholderOpt = this.dom.createHtmlEl("option");
        placeholderOpt.value = "";
        placeholderOpt.textContent = data.placeholder;
        placeholderOpt.disabled = true;
        placeholderOpt.selected = true;
        el.appendChild(placeholderOpt);
      }

      for (const opt of data.options) {
        const optEl = this.dom.createHtmlEl("option");
        if (typeof opt === "object" && opt !== null) {
          optEl.value = opt.value !== undefined ? String(opt.value) : String(opt.text);
          optEl.textContent = opt.text !== undefined ? String(opt.text) : String(opt.value);
          if (opt.disabled) optEl.disabled = true;
          if (opt.selected) optEl.selected = true;
        } else {
          optEl.value = String(opt);
          optEl.textContent = String(opt);
        }
        el.appendChild(optEl);
      }
      return true;
    }

    if ((type === "ul" || type === "ol") && Array.isArray(data.items)) {
      if (type === "ol") {
        if (data.start) el.setAttribute("start", data.start);
        if (data.listType) el.setAttribute("type", data.listType);
      }

      for (const item of data.items) {
        const li = this.dom.createHtmlEl("li");
        li.textContent = typeof item === "object" && item !== null ? JSON.stringify(item) : String(item);
        el.appendChild(li);
      }
      return true;
    }

    if (type === "table") {
      if (Array.isArray(data.matrix) && data.matrix.length > 0) {
        const thead = this.dom.createHtmlEl("thead");
        const trHead = this.dom.createHtmlEl("tr");
        for (const headerText of data.matrix[0]) {
          const th = this.dom.createHtmlEl("th");
          th.textContent = String(headerText);
          trHead.appendChild(th);
        }
        thead.appendChild(trHead);
        el.appendChild(thead);

        const tbody = this.dom.createHtmlEl("tbody");
        for (let i = 1; i < data.matrix.length; i++) {
          const tr = this.dom.createHtmlEl("tr");
          for (const cell of data.matrix[i]) {
            const td = this.dom.createHtmlEl("td");
            td.textContent = String(cell);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        el.appendChild(tbody);
        return true;
      }

      if (Array.isArray(data.headers) || Array.isArray(data.rows)) {
        if (Array.isArray(data.headers) && data.headers.length > 0) {
          const thead = this.dom.createHtmlEl("thead");
          const trHead = this.dom.createHtmlEl("tr");
          for (const headerText of data.headers) {
            const th = this.dom.createHtmlEl("th");
            th.textContent = String(headerText);
            trHead.appendChild(th);
          }
          thead.appendChild(trHead);
          el.appendChild(thead);
        }

        if (Array.isArray(data.rows) && data.rows.length > 0) {
          const tbody = this.dom.createHtmlEl("tbody");
          for (const row of data.rows) {
            const tr = this.dom.createHtmlEl("tr");
            const cells = Array.isArray(row) ? row : Object.values(row);
            for (const cell of cells) {
              const td = this.dom.createHtmlEl("td");
              td.textContent = String(cell);
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
          }
          el.appendChild(tbody);
        }
        return true;
      }
    }

    return false;
  }

  _indexNodeActions(node) {
    if (!node?.id) return;
    const actions = node.actions || null;
    if (actions && typeof actions === "object") {
      this.#nodeActionMap.set(node.id, actions);
    } else {
      this.#nodeActionMap.delete(node.id);
    }
  }

  _applyAttributes(el, jsonNode) {
    const isSvg = el.namespaceURI === "http://www.w3.org/2000/svg";

    if (jsonNode.class) {
      if (isSvg) {
        el.setAttribute("class", jsonNode.class);
      } else {
        el.className = jsonNode.class;
      }
    }

    if (jsonNode.type && !isSvg) el.dataset.type = jsonNode.type;
    if (jsonNode.bind && !isSvg) el.dataset.bind = jsonNode.bind;

    if (jsonNode.name) el.setAttribute("name", jsonNode.name);
    if (jsonNode.title) el.setAttribute("title", jsonNode.title);

    if (jsonNode.active !== undefined) {
      const isActive = jsonNode.active === true || jsonNode.active === "true";
      el.toggleAttribute("active", isActive);
    }

    if (jsonNode.disabled !== undefined) {
      const isDisabled = jsonNode.disabled === true || jsonNode.disabled === "true";
      el.toggleAttribute("disabled", isDisabled);
      const innerInput = el.tagName === "INPUT" ? el : el.querySelector?.("input");
      if (innerInput) innerInput.disabled = isDisabled;
    }
  }

  _applyData(el, jsonNode) {
    const data = jsonNode.data || {};
    const tag = el.tagName.toLowerCase();
    const isSvg = el.namespaceURI === "http://www.w3.org/2000/svg";

    if (data.text !== undefined && !["input", "video", "iframe", "img"].includes(tag) && !isSvg) {
      const textSpan = el.querySelector?.(".sp-ui-label, .sp-toggle-label");
      if (textSpan) {
        textSpan.textContent = data.text;
      } else {
        el.textContent = data.text;
      }
    }

    if (isSvg && (tag === "text" || tag === "tspan") && data.text !== undefined) {
      el.textContent = data.text;
    }

    if (data.src !== undefined && ["img", "iframe", "video"].includes(tag)) {
      el.src = data.src;
    }

    if (data.href !== undefined && (tag === "a" || tag === "use")) {
      if (isSvg) {
        el.setAttribute("href", data.href);
      } else {
        el.href = data.href;
      }
    }

    if (data.value !== undefined) {
      const innerCheckbox = el.type === "checkbox" ? el : el.querySelector?.('input[type="checkbox"]');
      if (innerCheckbox) {
        innerCheckbox.checked = Boolean(data.value);
      } else if (["input", "textarea", "select", "option"].includes(tag)) {
        const activeEl = this.dom.getActiveElement();
        if (activeEl !== el || el.value !== String(data.value)) {
          el.value = data.value;
        }
      }
    }

    for (const [key, val] of Object.entries(data)) {
      if (val === undefined || val === null) continue;

      if (isSvg || SVG_ATTRS.has(key)) {
        el.setAttribute(key, String(val));
      } else if (HTML_INPUT_ATTRS.has(key)) {
        el.setAttribute(key, String(val));
      }
    }
  }

  _createErrorPlaceholder(nodeId) {
    const placeholder = this.dom.createHtmlEl("div");
    if (nodeId) placeholder.id = nodeId;
    placeholder.textContent = `⚠ Render error [${nodeId || "node"}]`;
    Object.assign(placeholder.style, {
      outline: "1px dashed #ef4444",
      padding: "4px",
      fontSize: "11px",
      color: "#ef4444",
      background: "rgba(239, 68, 68, 0.05)",
    });
    return placeholder;
  }
}
