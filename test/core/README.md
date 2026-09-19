# Tests unitarios — spacepeech-lib

Usa el test runner nativo de Node (`node:test` + `node:assert/strict`).
Sin dependencias externas — nada que instalar (ni para el DOM: hay un DOM
falso mínimo hecho a mano en `test/helpers/fakeDom.js`, no jsdom).

## Correr la suite

```bash
node --test
```

Node descubre automáticamente y corre TODOS los archivos `*.test.js` dentro
de `test/` (recursivo) en una sola ejecución.

## Estructura

```
test/
├── helpers/
│   └── fakeDom.js               → DOM falso compartido, usado por Renderer.test.js
├── core/
│   ├── DataStore.test.js           → src/core/DataStore.js
│   ├── ExpressionEvaluator.test.js → src/core/ExpressionEvaluator.js
│   ├── BindingEngine.test.js       → src/core/BindingEngine.js
│   ├── NodeTree.test.js            → src/core/NodeTree.js
│   ├── ActionManager.test.js       → src/core/ActionManager.js
│   ├── PluginManager.test.js       → src/core/PluginManager.js
│   └── SystemActions.test.js       → src/core/SystemActions.js
└── engine/
    └── Renderer.test.js         → src/engine/Renderer.js
```

## Plan de cobertura (orden acordado)

- [x] `DataStore`
- [x] `ExpressionEvaluator`
- [x] `BindingEngine`
- [x] `NodeTree`
- [x] `Renderer`
- [x] `ActionManager`
- [x] `PluginManager`
- [x] `SystemActions` (catálogo `sys.*`, no es una clase propia pero vive en core/)
- [ ] Plugins (`UiKitPlugin`, `RealtimePlugin`, `StoragePlugin`, etc.)

## Revisión de seguridad — estado

Cubierto con tests (no solo documentado):
- Prototype pollution en `DataStore` (`__proto__`/`constructor`/`prototype`).
- `sys.navigate` no valida la URL/dominio antes de navegar — test de
  caracterización explícito en `SystemActions.test.js`.
- `sys.fetch` no valida la URL antes de pedirla — mismo criterio.
- `PluginManager` solo instala plugins pasados por código (`app.use(...)`),
  nunca algo referenciado desde el propio documento JSON — cubierto
  indirectamente por cómo están armados los tests de `PluginManager.test.js`
  (siempre requieren una llamada explícita a `use()`).

Todavía sin cubrir:
- `ExpressionEvaluator` como límite de confianza (documentar/reforzar que
  solo debe evaluarse contra JSON de autor confiable).
- Autenticación del canal de `RealtimePlugin`.
- `sys.pingNode` (no se escribieron tests para esta acción todavía).
