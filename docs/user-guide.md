# Spacepeech — User Guide

This guide walks through building your first page. It assumes no prior knowledge of how Spacepeech works internally — just enough to get a dashboard on screen. For the full technical reference, see `contract.md`.

## 1. The idea

You don't write HTML by hand. You describe your page as a JSON document: what's on it, where the data comes from, and what happens when someone clicks something. Spacepeech reads that document and renders it.

## 2. Setup

Copy the `spacepeech-lib` folder into your project, then load it from your page:

```html
<div id="canvas"></div>

<script type="module">
  import { spacepeechInit } from "./spacepeech-lib/src/spacepeech-loader.js";
  window.app = await spacepeechInit("canvas", { configUrl: "./spacepeech.config.json" });
</script>
```

A `spacepeech.config.json` file (optional, but recommended) tells Spacepeech where to look for your pages. A minimal one just needs a default page name — see `contract.md` section 8 for every option.

## 3. Your first page

A page is one JSON file with three parts: `data` (the values your page uses), `root` (what gets drawn), and optionally `css`.

```json
{
  "version": "1.0",
  "data": {
    "user": { "name": "Alex" },
    "clicks": 0
  },
  "root": {
    "id": "main",
    "type": "div",
    "children": [
      {
        "id": "greeting",
        "type": "h1",
        "data": { "text": "Hello, {{user.name}}!" }
      },
      {
        "id": "counter-btn",
        "type": "button",
        "data": { "text": "Clicked {{clicks}} times" },
        "actions": {
          "click": { "type": "sys.increment", "path": "clicks", "delta": 1 }
        }
      }
    ]
  }
}
```

Load it and you have a page with a live counter — no manual DOM updates, no extra code. Whenever `clicks` changes, anything referencing `{{clicks}}` updates on its own.

## 4. The three things worth understanding

**Everything is data-driven.** `{{user.name}}` reads from `data`. Change the value, and every place that references it updates automatically — text, CSS classes, inline styles, even boolean bindings like whether a checkbox is checked.

**Actions describe behavior declaratively.** Instead of writing a click handler, you describe *what* should happen (`sys.increment`, `sys.set`, `sys.navigate`, …) and Spacepeech does it. You can chain several actions on the same event, and conditionally skip a step with `"if"`.

**Expressions can be more than a single value.** `{{clicks > 10 ? 'Busy!' : 'Idle'}}` works directly inside `text`, `class`, or `style` — no separate logic needed elsewhere.

## 5. Where to go next

- `contract.md` — the full reference: every node property, the system variable list (`$sys.*`), the complete action catalog, components, and lists/tables generated from data.

