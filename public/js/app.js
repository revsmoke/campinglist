// app.js — application entry point.
import { loadAllState, theme } from "./state.js";
import { renderAll, setupEventListeners, applyTheme, showToast } from "./ui.js";
import { setupDragAndDrop } from "./drag.js";
import { resolveInitialNamespace, setupAuth } from "./auth/auth.js";
import { setupStorage } from "./storage/storage.js";
import { setupTemplates } from "./templates.js";
import { setupSponsors, setupAnalytics } from "./sponsors.js";

let reportedError = false;
function reportUnexpected(error) {
  console.error("Unexpected error:", error);
  if (reportedError) return;
  reportedError = true;
  try {
    showToast(
      "Something went wrong. Your data is saved in this browser; reload the page if things look off.",
      8000,
      "error"
    );
  } catch {
    /* ignore */
  }
}
window.addEventListener("error", (e) => reportUnexpected(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => reportUnexpected(e.reason));

async function initializeApp() {
  // Apply the saved theme as early as possible to avoid a flash.
  applyTheme(theme);
  // A valid local session decides which list collection to open.
  const namespace = resolveInitialNamespace();
  await loadAllState({ namespace });
  applyTheme(theme);
  renderAll();
  setupEventListeners();
  setupDragAndDrop();
  setupTemplates();
  await setupAuth();
  setupStorage();
  setupSponsors();
  setupAnalytics();
  document.body.classList.add("app-ready");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    initializeApp().catch(reportUnexpected)
  );
} else {
  initializeApp().catch(reportUnexpected);
}
