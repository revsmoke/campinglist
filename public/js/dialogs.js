// dialogs.js — accessible confirm/prompt/alert dialogs and toast notifications.
// Replaces window.confirm()/prompt() so behaviour is consistent, keyboard friendly and testable.

let activeDialog = null;
let previouslyFocused = null;

function ensureDialog() {
  if (activeDialog) return activeDialog;
  const dlg = document.createElement("dialog");
  dlg.id = "appDialog";
  dlg.className = "app-dialog";
  dlg.setAttribute("aria-labelledby", "appDialogTitle");
  dlg.innerHTML = `
    <form method="dialog" id="appDialogForm">
      <h3 id="appDialogTitle"></h3>
      <p id="appDialogMessage" class="app-dialog-message"></p>
      <label id="appDialogFieldWrap" class="app-dialog-field" hidden>
        <span id="appDialogLabel"></span>
        <input type="text" id="appDialogInput" autocomplete="off" />
      </label>
      <menu>
        <button type="button" class="secondary" id="appDialogCancel" value="cancel">Cancel</button>
        <button type="submit" id="appDialogConfirm" value="confirm">OK</button>
      </menu>
    </form>`;
  document.body.appendChild(dlg);
  activeDialog = dlg;
  return dlg;
}

function openDialog({ title, message, confirmText, cancelText, danger, input }) {
  const dlg = ensureDialog();
  const titleEl = dlg.querySelector("#appDialogTitle");
  const msgEl = dlg.querySelector("#appDialogMessage");
  const wrap = dlg.querySelector("#appDialogFieldWrap");
  const label = dlg.querySelector("#appDialogLabel");
  const inputEl = dlg.querySelector("#appDialogInput");
  const cancelBtn = dlg.querySelector("#appDialogCancel");
  const confirmBtn = dlg.querySelector("#appDialogConfirm");

  titleEl.textContent = title || "";
  msgEl.textContent = message || "";
  msgEl.hidden = !message;
  confirmBtn.textContent = confirmText || "OK";
  confirmBtn.classList.toggle("danger", Boolean(danger));
  cancelBtn.textContent = cancelText || "Cancel";
  cancelBtn.hidden = cancelText === null;

  if (input) {
    wrap.hidden = false;
    label.textContent = input.label || "";
    inputEl.value = input.value || "";
    inputEl.maxLength = input.maxLength || 500;
    inputEl.placeholder = input.placeholder || "";
    inputEl.required = Boolean(input.required);
  } else {
    wrap.hidden = true;
    inputEl.value = "";
    inputEl.required = false;
  }

  previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    const form = dlg.querySelector("#appDialogForm");
    const cleanup = () => {
      form.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onCancel);
      dlg.removeEventListener("close", onClose);
      dlg.removeEventListener("cancel", onNativeCancel);
    };
    let result = null;
    const onSubmit = (e) => {
      e.preventDefault();
      if (input && input.required && !inputEl.value.trim()) {
        inputEl.focus();
        return;
      }
      result = input ? inputEl.value : true;
      dlg.close();
    };
    const onCancel = () => {
      result = input ? null : false;
      dlg.close();
    };
    const onNativeCancel = () => {
      result = input ? null : false;
    };
    const onClose = () => {
      cleanup();
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
      resolve(result);
    };
    form.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onCancel);
    dlg.addEventListener("close", onClose);
    dlg.addEventListener("cancel", onNativeCancel);
    dlg.showModal();
    if (input) {
      inputEl.focus();
      inputEl.select();
    } else {
      confirmBtn.focus();
    }
  });
}

/** Asks a yes/no question. Resolves true when confirmed. */
export function confirmDialog(message, options = {}) {
  return openDialog({
    title: options.title || "Please confirm",
    message,
    confirmText: options.confirmText || "OK",
    cancelText: options.cancelText === undefined ? "Cancel" : options.cancelText,
    danger: options.danger,
  });
}

/** Shows a message with a single OK button. */
export function alertDialog(message, options = {}) {
  return openDialog({
    title: options.title || "Notice",
    message,
    confirmText: options.confirmText || "OK",
    cancelText: null,
  });
}

/** Asks for a line of text. Resolves with the string, or null when cancelled. */
export function promptDialog(label, options = {}) {
  return openDialog({
    title: options.title || "Enter a value",
    message: options.message || "",
    confirmText: options.confirmText || "Save",
    cancelText: "Cancel",
    input: {
      label,
      value: options.value || "",
      maxLength: options.maxLength || 500,
      placeholder: options.placeholder || "",
      required: options.required !== false,
    },
  });
}

/***************** TOASTS *****************/
let toastContainer = null;

function ensureToastContainer() {
  if (toastContainer && toastContainer.isConnected) return toastContainer;
  toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toastContainer";
    document.body.appendChild(toastContainer);
  }
  toastContainer.setAttribute("role", "status");
  toastContainer.setAttribute("aria-live", "polite");
  return toastContainer;
}

/**
 * Shows a transient message. `type` is one of info | success | warning | error.
 * Returns a function that dismisses the toast early.
 */
export function showToast(message, duration = 3000, type = "info") {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  // Force a reflow so the transition runs.
  void toast.offsetHeight;
  toast.classList.add("show");
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.classList.remove("show");
    const finalize = () => {
      if (toast.parentNode === container) container.removeChild(toast);
    };
    toast.addEventListener("transitionend", finalize, { once: true });
    setTimeout(finalize, 400);
  };
  if (duration > 0) setTimeout(remove, duration);
  return remove;
}
