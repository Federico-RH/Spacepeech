// =============================================================================
// FILE: src/plugins/FormPlugin.js
// =============================================================================

/**
 * FormPlugin.js — Universal form lifecycle manager,
 * reactive validation, and HTTP transport for Spacepeech Architecture.
 */
export const FormPlugin = {
  name: "form-plugin",

  async install(app, options = {}) {
    const { actionManager, dataStore, dom } = app;

    /**
     * Validates a data object against a declarative rules schema.
     * @param {Object} formData - Form data.
     * @param {Object} rules - Validation rules map per field.
     * @returns {Object|null} Object containing errors or null if valid.
     */
    const validateData = (formData = {}, rules = {}) => {
      const errors = {};
      let hasErrors = false;

      for (const [field, rule] of Object.entries(rules)) {
        const rawValue = formData[field];
        const val = typeof rawValue === "string" ? rawValue.trim() : rawValue;

        // Rule: Required
        if (rule.required && (val === undefined || val === null || val === "")) {
          errors[field] = rule.message || "This field is required.";
          hasErrors = true;
          continue;
        }

        if (val !== undefined && val !== null && val !== "") {
          // Rule: Minimum length (string)
          if (rule.minLength !== undefined && String(val).length < rule.minLength) {
            errors[field] = rule.message || `Minimum ${rule.minLength} characters.`;
            hasErrors = true;
          }

          // Rule: Maximum length (string)
          if (rule.maxLength !== undefined && String(val).length > rule.maxLength) {
            errors[field] = rule.message || `Maximum ${rule.maxLength} characters.`;
            hasErrors = true;
          }

          // Rule: Minimum numeric value
          if (rule.min !== undefined && Number(val) < rule.min) {
            errors[field] = rule.message || `The minimum value is ${rule.min}.`;
            hasErrors = true;
          }

          // Rule: Maximum numeric value
          if (rule.max !== undefined && Number(val) > rule.max) {
            errors[field] = rule.message || `The maximum value is ${rule.max}.`;
            hasErrors = true;
          }

          // Rule: Standard email
          if (rule.type === "email" || rule.pattern === "email") {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(String(val))) {
              errors[field] = rule.message || "Invalid email format.";
              hasErrors = true;
            }
          }

          // Rule: Custom Regular Expression
          if (rule.regex) {
            const regex = typeof rule.regex === "string" ? new RegExp(rule.regex) : rule.regex;
            if (!regex.test(String(val))) {
              errors[field] = rule.message || "The value does not match the required format.";
              hasErrors = true;
            }
          }
        }
      }

      return hasErrors ? errors : null;
    };

    /**
     * Cleans internal flags (_submitting, _errors, _status) from payload
     * before sending to server.
     */
    const cleanPayload = (data = {}) => {
      if (typeof data !== "object" || data === null) return data;
      const payload = { ...data };
      delete payload._submitting;
      delete payload._errors;
      delete payload._status;
      return payload;
    };

    // =========================================================================
    // ACTION: form.submit (Submission with validation and reactive state management)
    // =========================================================================
    actionManager.register("form.submit", async (params = {}, ctx = {}) => {
      const path = params.path || "form";
      const endpoint = params.endpoint || "/api/form/submit";
      const method = (params.method || "POST").toUpperCase();
      const headers = params.headers || {};
      const replaceState = params.replaceState !== false;
      const resetOnSuccess = params.resetOnSuccess === true;

      // 1. Get current form data
      const currentData = (path ? dataStore.get(path) : dataStore.getSnapshot()) || {};

      // 2. Execute declarative validation (if defined)
      if (params.validate && typeof params.validate === "object") {
        const validationErrors = validateData(currentData, params.validate);
        if (validationErrors) {
          dataStore.set(`${path}._errors`, validationErrors);
          dataStore.set(`${path}._status`, "error");
          dataStore.set(`${path}._submitting`, false);

          if (params.onError) {
            await actionManager.dispatch(params.onError, { ...ctx, errors: validationErrors });
          }
          return { ok: false, errors: validationErrors };
        }
      }

      // 3. Activate loading state (Loading / Submitting)
      dataStore.set(`${path}._errors`, null);
      dataStore.set(`${path}._submitting`, true);
      dataStore.set(`${path}._status`, "submitting");

      try {
        const payload = cleanPayload(currentData);

        const response = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: method !== "GET" && method !== "HEAD" ? JSON.stringify(payload) : undefined
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const resultJson = await response.json().catch(() => ({}));

        // 4. Update status to success
        dataStore.set(`${path}._submitting`, false);
        dataStore.set(`${path}._status`, "success");

        if (resetOnSuccess) {
          dataStore.set(path, {
            _submitting: false,
            _errors: null,
            _status: "success"
          });
        }

        if (replaceState && resultJson?.root) {
          await app.loadState(resultJson);
        } else if (params.targetPath) {
          dataStore.set(params.targetPath, resultJson);
        }

        // Execute onSuccess callback (declarative)
        if (params.onSuccess) {
          await actionManager.dispatch(params.onSuccess, { ...ctx, result: resultJson });
        }

        return { ok: true, data: resultJson };
      } catch (error) {
        // 5. Network or server error handling
        const errorPayload = { general: error.message || "Error processing the request." };
        dataStore.set(`${path}._errors`, errorPayload);
        dataStore.set(`${path}._submitting`, false);
        dataStore.set(`${path}._status`, "error");

        if (params.onError) {
          await actionManager.dispatch(params.onError, { ...ctx, error });
        }

        return { ok: false, error };
      }
    });

    // =========================================================================
    // ACTION: form.validate (Isolated pre-validation)
    // =========================================================================
    actionManager.register("form.validate", async (params = {}) => {
      const path = params.path || "form";
      const rules = params.validate || {};
      const currentData = (path ? dataStore.get(path) : dataStore.getSnapshot()) || {};

      const validationErrors = validateData(currentData, rules);
      dataStore.set(`${path}._errors`, validationErrors);
      dataStore.set(`${path}._status`, validationErrors ? "error" : "idle");

      return { valid: !validationErrors, errors: validationErrors };
    });

    // =========================================================================
    // ACTION: form.reset (Reset to clean initial state)
    // =========================================================================
    actionManager.register("form.reset", async (params = {}) => {
      const path = params.path || "form";
      const defaultValue = params.value !== undefined ? params.value : {};
      dataStore.set(path, {
        ...defaultValue,
        _submitting: false,
        _errors: null,
        _status: "idle"
      });
    });

    // =========================================================================
    // ACTION: form.selectFile (File upload and Base64 conversion)
    // =========================================================================
    actionManager.register("form.selectFile", async (params = {}) => {
      const targetPath = params.targetPath || "form.file";
      const accept = params.accept || "*/*";
      const maxSizeMb = params.maxSizeMb || 5;

      return new Promise((resolve) => {
        let input;
        if (typeof dom?.createHtmlEl === "function") {
          input = dom.createHtmlEl("input");
        } else {
          input = document.createElement("input");
        }

        input.type = "file";
        input.accept = accept;
        input.style.display = "none";

        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }

          if (file.size > maxSizeMb * 1024 * 1024) {
            const errorMsg = `The file exceeds the ${maxSizeMb}MB limit.`;
            dataStore.set(`${targetPath}_error`, errorMsg);
            resolve(null);
            return;
          }

          const reader = new FileReader();
          reader.onload = (e) => {
            const base64Data = e.target.result;
            dataStore.set(targetPath, base64Data);
            dataStore.set(`${targetPath}_error`, null);
            resolve(base64Data);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };

        input.click();
      });
    });
  }
};
