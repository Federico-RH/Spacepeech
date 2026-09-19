export class EventBus {
  constructor() {
    this.listeners = {};
  }
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  emit(event, payload = {}) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(payload));
    }
  }
  off(event, callbackToRemove) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callbackToRemove);
  }
}
