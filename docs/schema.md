# Schema.md

# Architecture and System Design — Spacepeech Library
Spacepeech is a modular, lightweight library for dynamically rendering web interfaces (dashboards, websites) from JSON documents. It is written in vanilla JavaScript using OOP and designed to be easily portable to Java or C++.

## 1. Architecture Principles
* **Decoupled State and Data:** The JSON structure tree and the reactive `DataStore` are the single source of truth in memory.
* **O(1) Dependency Mapping:** `BindingEngine` builds a static subscription graph at load time. Variable mutations update only the affected nodes, without scanning the DOM or diffing a Virtual DOM.
* **Expressions Without an External Engine:** `ExpressionEvaluator` resolves comparisons, logical operators and ternaries inside `{{...}}` (e.g. `{{power ? 'ON' : 'OFF'}}`), resolving each identifier against `DataStore` before evaluating — without adding any external parsing dependency.
* **Total Isolation from the DOM and the OS:** No core component interacts directly with browser globals (`window`, `document`, `location`, `requestAnimationFrame`). All operations are channeled through `DomFacade` and `infra/DomAccess`. (Plugins are exempt from this rule when they need a browser API with no equivalent in `DomFacade` — e.g. `StoragePlugin` with `localStorage`, `RealtimePlugin` with `WebSocket` — they are leaf modules, not part of the portable core.)
* **Decoupled, Non-Blocking Bootstrapping:** Resolving the configuration (`spacepeech.config.json`) and the initial handshake with the backend are best-effort steps — a failure in either one is reported through `ErrorReporter` but never prevents the app from loading its state and rendering. See section 3, step 1.
* **Clear System Inputs and Outputs:**
  * **Inputs (Sensors):** `SystemDriver` and `SystemAdapter` supply continuous ambient data (`$sys.time`, `$sys.viewport.*`, `$sys.online`) to the `DataStore`.
  * **Outputs (Actions):** `ActionManager` interprets interactive commands (`sys.set`, `sys.copy`, `sys.toggleFullscreen`, `sys.navigate`, `sys.setInterval`/`sys.timeout`, `sys.fetch`, custom plugins) triggered by node events, with per-step condition support (`"if"`).
* **Plugin-Extensible Architecture:** `PluginManager` lets you register middlewares, custom actions, custom UI element types and external integrations without touching the core.
* **Asynchronous Module Resolution:** Automatic detection and download of submodules and remote dependencies before compilation.
* **Granular Branch Rendering:** The DOM is not fully redrawn when something changes. Changes are synchronized atomically by ID using `replaceWith`, `appendChild` or `remove`. This includes compiling data-driven collections (`select`/`ul`/`ol`/`table`) from `data.options`/`items`/`matrix`/`headers`+`rows`.
* **Strict KISS & YAGNI:** No heavy Virtual DOM or intermediate parsers.

---

## 2. System Layers

```
[ Hardware / OS / Browser ]  [ Server / Network ]
 │                            │
 (Inputs: Mouse/Clock)        (JSON Modules, Config, WebSocket)
 ▼                            ▼
 [ SystemDriver ]            [ DataService ]
 │                            │
 [ SystemAdapter ]            │
 │  (Writes $sys.*)           ▼
 ▼                        [ Spacepeech ] ◄─── [ PluginManager ]
 [ DataStore ] ◄─────────────────────────────────┼───────────────────────────┐
 │        ▲                  │                    │
 │        (uses)              │                    │
 │  [ExpressionEvaluator]     │                    │
 (DATA_CHANGED)  ▼            (EventBus) ▼
 │        [ StyleManager ]         [ ErrorReporter ]
 ▼        (Injects <style>)        (Error handling)
 [ BindingEngine ]            │            ▲
 │                            ▼            │
 (UPDATE_NODE_PROP)       [ DomFacade ]     │
 ▼                            │            │
 [ Renderer ] ──(Events.EXECUTE_ACTION)──► [ ActionManager ] ────────────────┘
 (DOM + Events)           (Runs commands, evaluates "if" with ExpressionEvaluator)
```

## 3. Data Flow and Lifecycle
1. Bootstrapping and Initialization (spacepeechInit / Spacepeech.init):
Before the core is instantiated, the startup configuration is resolved by combining (in increasing priority) `spacepeech.config.json` (via `Spacepeech.loadConfigFile`, if `options.configUrl` was passed), the injected state `__SPACEPEECH_CONFIG__`, and the `options` passed directly to `init()`. From these come `baseUrl`, `source`, `staticPath`, `defaultPage`, `handshakeEndpoint` and `wsEndpoint`. Loading the config file fails open: if it does not exist or the fetch fails, startup continues with `{}`.
DomFacade, EventBus, DataService, DataStore, BindingEngine, ActionManager, SystemAdapter, StyleManager, Renderer and PluginManager are instantiated.
PluginManager.flushPending() installs the previously registered plugins (in the default catalog this includes UiKitPlugin and RealtimePlugin — see section 4).
If `_mergedConfig.handshakeEndpoint` is defined, the client specifications (`SystemDriver.getClientSpecs()`) are sent through `DataService.sendHandshake()`. This is a best-effort telemetry step: a network failure is reported through `ErrorReporter` but **does not interrupt startup**. If it succeeds, `Events.HANDSHAKE_COMPLETE` is emitted with the server's full response — any plugin can listen to it to receive configuration negotiated by the backend (e.g. `RealtimePlugin` reads `response.realtime.endpoint`/`token` from it).
2. Module Loading and Resolution (loadState):
Structural validation of the JSON (_validateState).
NodeTree.collectMissingModules() scans the tree for remote moduleIds.
Spacepeech._resolveRemoteComponents() recursively downloads all missing submodules in parallel through DataService.
NodeTree.resolveComponentTree() expands the templates and applies overrides and local namespacing.
DataStore.loadData() loads the reactive state (state.data + local instance data).
BindingEngine.indexBindings() generates the O(1) map of {{...}} expressions and bind directives.
BindingEngine.applyBindings() evaluates the initial values (delegating to ExpressionEvaluator when the expression has operators).
SystemAdapter.start() activates the environment sensors ($sys.*).
Events.STATE_CHANGED is emitted.
3. Styles: StyleManager injects the global state.css and compiles the per-node rules into #dynamic-nodes-css.
4. Rendering and Interaction:
Renderer compiles the HTML tree inside the container, including composite elements (select/ul/ol/table) generated from their collections in data, and custom element types registered by plugins through `renderer.registerElementType(type, compilerFn)` (see section 4 and UiKitPlugin.txt).
Renderer delegates DOM events (click, input, submit, etc.) to ActionManager and EventBus.
5. Reactive Data-Binding and Actions:
User input ➔ Renderer emits Events.SET_DATA_PROP.
Click on an action ➔ Renderer emits Events.EXECUTE_ACTION ➔ ActionManager.dispatch() evaluates the step's "if" condition (if it has one) and runs the handler (standard or plugin).
DataStore.set() updates the value and emits Events.DATA_CHANGED.
BindingEngine notifies only the dependent nodes with Events.UPDATE_NODE_PROP.
6. Real-Time Channel (optional, RealtimePlugin): if a WebSocket endpoint is resolved (by handshake or by config), after the first Events.STATE_CHANGED the plugin opens the connection and translates the incoming server messages into the same events as in step 5 (ADD_NODE, REMOVE_NODE, MOVE_NODE, REPLACE_BRANCH, DataStore.set) — there is no separate rendering path for pushed data versus pulled data. See RealtimePlugin.txt.


## 4. Plugin System and Extensions
Any ancillary functionality is decoupled through plugins:
Contract: Every plugin exports { name: string, install(app, options): Promise<void>|void }.
Plugin Capabilities:
Register actions with app.actionManager.register(actionType, handler).
Register custom UI element types with app.renderer.registerElementType(type, compilerFn) — the compiler receives (jsonNode, domFacade) and returns the root HTMLElement; the Renderer applies the standard attributes/data-binding to it just as it does to any other node. This is the generic mechanism behind UiKitPlugin (see UiKitPlugin.txt) and is available to any plugin, not only to it.
Listen to/emit on app.eventBus — this includes lifecycle events such as Events.HANDSHAKE_COMPLETE, in addition to the existing ones (STATE_CHANGED, DATA_CHANGED, etc.) and those added by RealtimePlugin (REALTIME_CONNECTED, REALTIME_DISCONNECTED, REALTIME_MESSAGE).
Interact with app.dataStore, app.dom, app.systemAdapter or app._mergedConfig (the already-resolved startup config, available to any plugin installed from the default catalog).
Each action handler receives (params, context) — context exposes dom, dataStore, dataService, errorReporter, eventBus and actionManager as flat properties (plus a nested copy under context.services), so it can dispatch other actions (e.g. sys.setInterval re-invoking context.actionManager.dispatch) or touch the DOM (e.g. context.dom.getHtmlEl(id)).
Plugins currently installed (default catalog in spacepeech-loader.js): UiKitPlugin, DebugPlugin, IconPlugin, SvgPlugin, InteractiveControlsPlugin, FormPlugin, CalculatorPlugin, ObserverPlugin, StoragePlugin, RealtimePlugin — see src/plugins/docs/ for the details of each one. All of them, including UiKitPlugin, can be disabled individually with `enabled: false` in the catalog without touching the core.
