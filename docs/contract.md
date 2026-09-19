# Spacepeech — JSON Contract (Reference)

This is a simplified reference of how Spacepeech pages are described in JSON. It covers what you need to build a page. For plugin-specific actions and the full internal contract, see the project website.

---

## 1. Root Document

```json
{
  "version": "1.0",
  "meta": { "title": "Tab title", "description": "Optional meta description" },
  "data": {
    "user": { "name": "Nahuel", "role": "Senior Dev" },
    "counter": 0,
    "theme": { "bg": "#0b0f19", "border": "#1e293b" }
  },
  "css": "/* flat global CSS */",
  "components": { /* optional local module catalog */ },
  "root": { /* single root node */ }
}
```

## 2. Node Structure

```json
{
  "id": "unique-string-required",
  "type": "div | span | h1 | p | button | input | textarea | select | ul | ol | table | img | component-instance",
  "class": "css-class {{some.variable}}",
  "bind": "user.name",
  "style": {
    "background": "{{theme.bg}}",
    "hover": { "transform": "scale(1.05)" },
    "disabled": { "opacity": "0.5" }
  },
  "data": {
    "text": "Hello, {{user.name}}! Clicks: {{counter}}",
    "value": "Initial value"
  },
  "actions": {
    "click": { "type": "sys.increment", "path": "counter", "delta": 1 }
  },
  "children": []
}
```

`type` isn't a closed enum — plugins can register additional element types (e.g. the UI kit plugin adds `"toggle-button"`). A custom-typed node still gets `data`/`style`/`bind`/`actions` the standard way.

## 3. Data Binding & Expressions

**One-way:** `{{path.to.value}}` inside `data.*`, `style.*` (including `hover`/`disabled`) or `class`. A template that is *only* one expression (`"{{path}}"`) preserves the original type (boolean, number, object); mixing text with an expression always produces a string.

**Logical expressions:** an interpolation can also be a comparison, a logical expression, or a ternary:

```json
{ "data": { "text": "Status: {{power ? 'On' : 'Off'}}" } }
{ "class": "badge {{!auth.username ? 'badge-guest' : 'badge-user'}}" }
```

Identifiers resolve against the app's data store; the rest is a small, closed expression grammar (ternary, `&&`/`||`/`!`, comparisons, basic arithmetic). Expressions never execute as real JavaScript — there is no `Function()`/`eval()` anywhere in the evaluator, and the grammar has no rule for calling anything or accessing a live object's properties, so there is no code-execution surface to worry about even with untrusted JSON documents.

**Two-way binding:** `"bind": "path.to.value"` on `input`, `textarea`, and `select` — keeps the control in sync with the data store.

## 4. System Variables (`$sys.*`)

| Variable | Type | Description |
|---|---|---|
| `{{$sys.time}}` | string | Local time |
| `{{$sys.date}}` | string | Local date |
| `{{$sys.timestamp}}` | number | Epoch ms |
| `{{$sys.viewport.w / .h}}` | number | Viewport size |
| `{{$sys.online}}` | boolean | Network status |
| `{{$sys.mouse.x / .y}}` | number | Cursor position |

## 5. Actions

Core catalog (`sys.*`): `set`, `toggle`, `increment`, `copy`, `toggleFullscreen`, `navigate`, `pingNode`, `emit`, `setInterval`, `clearInterval`, `timeout`, `fetch`.

Any action step can carry an `"if"` expression (same grammar as section 3) — if it evaluates falsy, that step is skipped. Multiple actions can run in sequence as a list (a pipeline).

Plugins extend this catalog under their own namespace (e.g. `storage.set`, `ws.send`). See each plugin's own docs for its actions.

## 6. Composition & Components

Local components are declared under the root `components` dictionary and instantiated with `"type": "component-instance"` + a `moduleId`. Each instance gets its own `id`, and the engine automatically namespaces that instance's child ids and any locally-declared variables, so multiple instances of the same component never collide.

Remote components (a `moduleId` not found locally) are fetched asynchronously and cached.

## 7. Compound Elements (lists, selects, tables)

Instead of writing every `<option>`/`<li>`/row by hand, declare the collection in `data` and let the engine generate the markup:

- `select` + `data.options`: array of `{ value, label }`
- `ul`/`ol` + `data.items`: array of strings or sub-nodes
- `table` + `data.matrix`: array of arrays
- `table` + `data.headers` + `data.rows`

## 8. App Bootstrap (`spacepeech.config.json`)

An optional static file, loaded via `options.configUrl` on `spacepeechInit()`. If missing, startup continues with defaults.

```json
{
  "baseUrl": "https://api.example.com",
  "source": "api",
  "staticPath": "./pages",
  "defaultPage": "main-dashboard",
  "handshakeEndpoint": "/api/handshake",
  "wsEndpoint": "wss://api.example.com/ws"
}
```

Setting `"mode": "website"` here (not in the page JSON) switches the renderer into **hydration mode**: instead of painting the container from scratch, it reconciles against already-rendered static HTML by matching `id`s — useful for SEO, so crawlers see real content on first load. This is fully opt-in; nothing changes for dashboards that don't set it.
