/**
 * Events — src/core/Events.js
 *
 * Central system event catalog.
 */
export const Events = Object.freeze({
  // ─── Lifecycle & Render Notifications ─────────────────────────────────────
  STATE_CHANGED: "STATE_CHANGED",
  NODE_UPDATED: "NODE_UPDATED",
  NODE_INSERTED: "NODE_INSERTED",
  NODE_REMOVED: "NODE_REMOVED",
  NODE_MOVED: "NODE_MOVED",
  HANDSHAKE_COMPLETE: "HANDSHAKE_COMPLETE",

  // ─── Tree Mutation Commands ───────────────────────────────────────────────
  ADD_NODE: "ADD_NODE",
  REMOVE_NODE: "REMOVE_NODE",
  MOVE_NODE: "MOVE_NODE",
  UPDATE_NODE_PROP: "UPDATE_NODE_PROP",
  REPLACE_BRANCH: "REPLACE_BRANCH",

  // ─── Data Binding & Store ────────────────────────────────────────────────
  DATA_CHANGED: "DATA_CHANGED",
  SET_DATA_PROP: "SET_DATA_PROP",

  // ─── Action System & Interactions ─────────────────────────────────────────
  EXECUTE_ACTION: "EXECUTE_ACTION",
  ACTION_EXECUTED: "ACTION_EXECUTED",

  // ─── Realtime Channel (WebSocket) ─────────────────────────────────────────
  REALTIME_CONNECTED: "REALTIME_CONNECTED",
  REALTIME_DISCONNECTED: "REALTIME_DISCONNECTED",
  REALTIME_MESSAGE: "REALTIME_MESSAGE"
});
