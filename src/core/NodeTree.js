/**
 * NodeTree — src/core/NodeTree.js
 *
 * Pure CRUD operations, dependency detection, and component resolution over JSON tree.
 * Applies ID namespacing and reactive scoping to component instance data and actions.
 */
import { ConfigError } from "./AppError.js";

export function findNode(root, nodeId) {
  if (!root || !nodeId) return null;

  if (Array.isArray(root)) {
    for (const node of root) {
      const found = findNode(node, nodeId);
      if (found) return found;
    }
    return null;
  }

  if (root.id === nodeId) return root;

  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }

  return null;
}

export function replaceNode(root, nodeId, newNode) {
  if (!root || !nodeId || !newNode) return false;

  if (Array.isArray(root)) {
    const idx = root.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      root[idx] = newNode;
      return true;
    }
    for (const node of root) {
      if (replaceNode(node, nodeId, newNode)) return true;
    }
    return false;
  }

  if (Array.isArray(root.children)) {
    const idx = root.children.findIndex(c => c.id === nodeId);
    if (idx !== -1) {
      root.children[idx] = newNode;
      return true;
    }
    for (const child of root.children) {
      if (replaceNode(child, nodeId, newNode)) return true;
    }
  }

  return false;
}

export function extractNode(root, nodeId) {
  if (!root || !nodeId) return null;

  if (Array.isArray(root)) {
    const idx = root.findIndex(n => n.id === nodeId);
    if (idx !== -1) return root.splice(idx, 1)[0];

    for (const node of root) {
      const extracted = extractNode(node, nodeId);
      if (extracted) return extracted;
    }
    return null;
  }

  if (Array.isArray(root.children)) {
    const idx = root.children.findIndex(c => c.id === nodeId);
    if (idx !== -1) return root.children.splice(idx, 1)[0];

    for (const child of root.children) {
      const extracted = extractNode(child, nodeId);
      if (extracted) return extracted;
    }
  }

  return null;
}

export function insertNode(root, jsonNode, targetId = null) {
  if (!root || !jsonNode) return;

  if (!targetId) {
    if (Array.isArray(root)) {
      root.push(jsonNode);
    } else {
      root.children = root.children || [];
      root.children.push(jsonNode);
    }
    return;
  }

  const target = findNode(root, targetId);
  if (target) {
    target.children = target.children || [];
    target.children.push(jsonNode);
  } else {
    if (Array.isArray(root)) {
      root.push(jsonNode);
    } else {
      root.children = root.children || [];
      root.children.push(jsonNode);
    }
  }
}

export function collectMissingModules(node, components = {}, missingSet = new Set()) {
  if (!node || typeof node !== "object") return Array.from(missingSet);

  if (Array.isArray(node)) {
    for (const item of node) {
      collectMissingModules(item, components, missingSet);
    }
    return Array.from(missingSet);
  }

  if (node.type === "component-instance" && !node.moduleId) {
    throw new ConfigError(
      `Node "${node.id || "no id"}" is type: "component-instance" but does not define moduleId.`,
      { nodeId: node.id || null }
    );
  }

  if (node.moduleId && !components[node.moduleId]) {
    missingSet.add(node.moduleId);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectMissingModules(child, components, missingSet);
    }
  }

  return Array.from(missingSet);
}

// ─── Scoping Helpers for Component Instances ─────────────────────────────────

function prefixChildIds(children, prefix) {
  if (!Array.isArray(children)) return children;
  return children.map((child) => {
    const cloned = { ...child };
    if (cloned.id && !cloned.id.startsWith(`${prefix}__`)) {
      cloned.id = `${prefix}__${cloned.id}`;
    }
    if (Array.isArray(cloned.children)) {
      cloned.children = prefixChildIds(cloned.children, prefix);
    }
    return cloned;
  });
}

function scopeText(text, localKeys, prefix) {
  if (typeof text !== "string") return text;
  // Updated regex supporting dashes
  return text.replace(/\{\{\s*([\w$.-]+)\s*\}\}/g, (match, path) => {
    const rootKey = path.split(".")[0];
    if (localKeys.has(rootKey)) {
      return `{{${prefix}.${path}}}`;
    }
    return match;
  });
}

function scopeNodeBindingsAndActions(node, localKeys, prefix) {
  if (!node || typeof node !== "object") return node;

  const cloned = { ...node };

  // 1. Two-way bind
  if (cloned.bind) {
    const rootKey = cloned.bind.split(".")[0];
    if (localKeys.has(rootKey)) {
      cloned.bind = `${prefix}.${cloned.bind}`;
    }
  }

  // 2. Data properties
  if (cloned.data && typeof cloned.data === "object") {
    const scopedData = {};
    for (const [k, v] of Object.entries(cloned.data)) {
      scopedData[k] = typeof v === "string" ? scopeText(v, localKeys, prefix) : v;
    }
    cloned.data = scopedData;
  }

  // 3. Class
  if (typeof cloned.class === "string") {
    cloned.class = scopeText(cloned.class, localKeys, prefix);
  }

  // 4. Style
  if (cloned.style && typeof cloned.style === "object") {
    cloned.style = scopeStyle(cloned.style, localKeys, prefix);
  }

  // 5. Actions
  if (cloned.actions && typeof cloned.actions === "object") {
    cloned.actions = scopeActions(cloned.actions, localKeys, prefix);
  }

  // 6. Children
  if (Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map(c => scopeNodeBindingsAndActions(c, localKeys, prefix));
  }

  return cloned;
}

function scopeStyle(styleObj, localKeys, prefix) {
  const result = {};
  for (const [k, v] of Object.entries(styleObj)) {
    if (typeof v === "string") {
      result[k] = scopeText(v, localKeys, prefix);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      result[k] = scopeStyle(v, localKeys, prefix);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function scopeActions(actionsObj, localKeys, prefix) {
  const result = {};
  for (const [event, actionDef] of Object.entries(actionsObj)) {
    if (Array.isArray(actionDef)) {
      result[event] = actionDef.map(a => scopeSingleAction(a, localKeys, prefix));
    } else if (actionDef && typeof actionDef === "object") {
      result[event] = scopeSingleAction(actionDef, localKeys, prefix);
    } else {
      result[event] = actionDef;
    }
  }
  return result;
}

function scopeSingleAction(action, localKeys, prefix) {
  const scoped = { ...action };

  if (scoped.path) {
    const rootKey = scoped.path.split(".")[0];
    if (localKeys.has(rootKey)) {
      scoped.path = `${prefix}.${scoped.path}`;
    }
  }

  if (scoped.targetId && !scoped.targetId.startsWith(`${prefix}__`)) {
    scoped.targetId = `${prefix}__${scoped.targetId}`;
  }

  for (const [key, val] of Object.entries(scoped)) {
    if (key === "type" || key === "path" || key === "targetId") continue;
    if (typeof val === "string") {
      scoped[key] = scopeText(val, localKeys, prefix);
    }
  }

  return scoped;
}

export function resolveComponentTree(node, components = {}, accumulatedData = {}) {
  if (!node || typeof node !== "object") return node;

  let resolved = { ...node };

  if (resolved.type === "component-instance" && !resolved.moduleId) {
    throw new ConfigError(
      `Node "${resolved.id || "no id"}" is type: "component-instance" but does not define moduleId.`,
      { nodeId: resolved.id || null }
    );
  }

  if (resolved.type === "component-instance" || (resolved.moduleId && components[resolved.moduleId])) {
    const template = components[resolved.moduleId];

    if (template) {
      const base = structuredClone(template.root || template);
      const instanceId = resolved.id || base.id;

      const templateData = template.data || {};
      const localKeys = new Set(Object.keys(templateData));

      if (localKeys.size > 0) {
        accumulatedData[instanceId] = {
          ...templateData,
          ...(resolved.data || {})
        };
      }

      let mergedChildren = resolved.children?.length ? resolved.children : (base.children || []);

      if (resolved.id && resolved.id !== base.id) {
        mergedChildren = prefixChildIds(mergedChildren, resolved.id);
      }

      resolved = {
        ...base,
        ...resolved,
        id: instanceId,
        type: base.type || "div",
        style: { ...(base.style || {}), ...(resolved.style || {}) },
        data: { ...(base.data || {}), ...(resolved.data || {}) },
        actions: { ...(base.actions || {}), ...(resolved.actions || {}) },
        children: mergedChildren
      };

      if (localKeys.size > 0 && resolved.id && resolved.id !== base.id) {
        resolved = scopeNodeBindingsAndActions(resolved, localKeys, instanceId);
      }
    }
  }

  if (Array.isArray(resolved.children)) {
    resolved.children = resolved.children.map(child =>
      resolveComponentTree(child, components, accumulatedData)
    );
  }

  return resolved;
}
