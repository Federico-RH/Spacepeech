/**
 * ErrorReporter — core/ErrorReporter.js
 *
 * Single responsibility: centralized error reporting + logging.
 * Does not touch the DOM at all, which is why it lives in core/ and not in adapters/:
 * it is as portable as EventBus/AppError.
 *
 * Single error reporting point for Spacepeech (see AppError.js). Currently
 * only logs structured output to console — progressively replacing scattered
 * console.warn/error from other modules. Changing implementation here
 * (e.g. POST /api/errors) does not require touching any call-site.
 */
export class ErrorReporter {
  /**
   * @param {import("./AppError.js").AppError} error
   */
  reportError(error) {
    console.error(`[${error.code}]`, error.message, {
      nodeId: error.nodeId,
      context: error.context,
      cause: error.cause,
    });
  }

  warn(...args) {
    console.warn("[Spacepeech]", ...args);
  }

  error(...args) {
    console.error("[Spacepeech]", ...args);
  }
}

export const errorReporter = new ErrorReporter();
