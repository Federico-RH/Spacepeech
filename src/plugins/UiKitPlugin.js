// ==========================================
// FILE: src/plugins/UiKitPlugin.js
// ==========================================

/**
 * UiKitPlugin — src/plugins/UiKitPlugin.js
 *
 * Registers specialized UI elements (toggle-button) and injects its dedicated
 * stylesheet using DomFacade to avoid being overwritten by dynamic CSS.
 */
export class UiKitPlugin {
  static get name() {
    return "ui-kit";
  }

  static install(app) {
    // 1. CSS injection into a dedicated independent tag (<style id="sp-uikit-css">)
    const uiStyles = `
      .sp-toggle-wrapper {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
        font-family: inherit;
      }
      .sp-toggle-wrapper[disabled],
      .sp-toggle-wrapper.disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
      }
      .sp-toggle-input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        margin: 0;
        pointer-events: none;
      }
      .sp-toggle-track {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        background-color: rgba(148, 163, 184, 0.25);
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 9999px;
        transition: background-color 0.2s ease, border-color 0.2s ease;
        flex-shrink: 0;
      }
      .sp-toggle-track::before {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        background-color: #ffffff;
        border-radius: 50%;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      }
      .sp-toggle-input:checked + .sp-toggle-track {
        background-color: #38bdf8;
        border-color: #0284c7;
      }
      .sp-toggle-input:checked + .sp-toggle-track::before {
        transform: translateX(20px);
      }
      .sp-toggle-input:focus-visible + .sp-toggle-track {
        outline: 2px solid #38bdf8;
        outline-offset: 2px;
      }
      .sp-toggle-label {
        font-size: 14px;
        color: inherit;
      }
    `;

    if (app.dom) {
      const existingStyle = app.dom.getHtmlEl("sp-uikit-css");
      if (!existingStyle) {
        const styleEl = app.dom.createHtmlEl("style");
        styleEl.id = "sp-uikit-css";
        styleEl.textContent = uiStyles;
        app.dom.appendToHead(styleEl);
      }
    }

    // 2. Compiler registration for type: "toggle-button"
    if (app.renderer && typeof app.renderer.registerElementType === "function") {
      app.renderer.registerElementType("toggle-button", (jsonNode, domFacade) => {
        const wrapper = domFacade.createHtmlEl("label");
        wrapper.id = jsonNode.id;
        wrapper.className = `sp-toggle-wrapper ${jsonNode.class || ""}`.trim();

        const input = domFacade.createHtmlEl("input");
        input.type = "checkbox";
        input.className = "sp-toggle-input";
        input.dataset.nodeId = jsonNode.id;

        if (jsonNode.bind) {
          input.dataset.bind = jsonNode.bind;
        }

        if (jsonNode.disabled) {
          input.disabled = true;
          wrapper.toggleAttribute("disabled", true);
        }

        const track = domFacade.createHtmlEl("span");
        track.className = "sp-toggle-track";

        wrapper.appendChild(input);
        wrapper.appendChild(track);

        const labelText = jsonNode.data?.text || jsonNode.data?.label;
        if (labelText !== undefined) {
          const textSpan = domFacade.createHtmlEl("span");
          textSpan.className = "sp-toggle-label";
          textSpan.textContent = labelText;
          wrapper.appendChild(textSpan);
        }

        return wrapper;
      });
    }
  }
}
