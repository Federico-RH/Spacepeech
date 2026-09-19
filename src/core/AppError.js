/**
 * AppError — src/core/AppError.js
 *
 * Taxonomy of typed errors. Portable: maps 1:1 to typed exceptions in
 * a future Java/C++ port — without DOM, EventBus, or state dependencies.
 *
 * Rule: in new engine code, never use `throw new Error("untyped string")`.
 * Always use one of these classes, so upstream catch blocks can
 * decide (retry, show fallback, log) based on `code` without parsing text messages.
 */

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code]
   * @param {string|null} [opts.nodeId]
   * @param {object} [opts.context]
   * @param {Error|null} [opts.cause] — original caught error, if any
   */
  constructor(message, { code = "APP_ERROR", nodeId = null, context = {}, cause = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.nodeId = nodeId;
    this.context = context;
    this.cause = cause;
  }
}

/** Malformed state or node JSON. */
export class ValidationError extends AppError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: "VALIDATION_ERROR" });
  }
}

/** Failed to construct or update DOM element for a node. */
export class RenderError extends AppError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: "RENDER_ERROR" });
  }
}

/** An action or callback associated with a node threw an exception. */
export class ActionError extends AppError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: "ACTION_ERROR" });
  }
}

/** Server fetch failed (DataService). */
export class NetworkError extends AppError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: "NETWORK_ERROR" });
  }
}

/** Node config references something non-existent (type, action, CSS prop, missing moduleId). */
export class ConfigError extends AppError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: "CONFIG_ERROR" });
  }
}
