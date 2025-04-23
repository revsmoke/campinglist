// App.js - Main entry point for the Camping List application

import {
  loadAllState,
  undo,
  redo,
  canUndo,
  canRedo,
  handleClearCompleted,
  handleDeleteList,
  saveListToString,
  loadListFromString,
} from "./state.js";

import {
  renderMeta,
  renderList,
  setupEventListeners,
  updateUndoRedoButtons,
  showToast,
  calculateAndDisplayWeights,
  calculateAndDisplayCosts,
} from "./ui.js";

// Initialize the application
function initApp() {
  // Load state from localStorage
  loadAllState();

  // Render UI
  renderMeta();
  renderList();

  // Set up event listeners
  setupEventListeners();

  // Handle undo/redo buttons initial state
  updateUndoRedoButtons();

  // Initialize weight totals
  calculateAndDisplayWeights();

  // Initialize cost totals
  calculateAndDisplayCosts();

  // Set up global keyboard shortcuts for undo/redo
  document.addEventListener("keydown", (e) => {
    // Check if command/ctrl key is pressed
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
      e.preventDefault();
      if (canUndo()) undo();
    }

    // Check for redo shortcut (Command+Shift+Z or Ctrl+Y)
    if (
      (e.metaKey || e.ctrlKey) &&
      ((e.shiftKey && e.key === "z") || (!e.shiftKey && e.key === "y"))
    ) {
      e.preventDefault();
      if (canRedo()) redo();
    }
  });
}

// When the DOM is fully loaded, initialize the app
document.addEventListener("DOMContentLoaded", initApp);

// For handling import/export
window.handleImport = function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    const importText = event.target.result;
    try {
      loadListFromString(importText);
      showToast("List imported successfully", 3000, "success");
      renderList();
      calculateAndDisplayWeights();
      calculateAndDisplayCosts();
    } catch (error) {
      showToast("Error importing list: " + error.message, 5000, "error");
    }
  };
  reader.readAsText(file);

  // Reset input to allow selecting the same file again
  e.target.value = "";
};

window.handleExport = function () {
  try {
    const exportText = saveListToString();
    // Create and trigger download
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .split(".")[0];

    const fileName = `camplist-${timestamp}.txt`;
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);
    showToast(`List exported as ${fileName}`, 3000, "success");
  } catch (error) {
    showToast("Error exporting list: " + error.message, 5000, "error");
  }
};

// Expose functionality to the global scope
window.undo = function () {
  undo();
  renderList();
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
};

window.redo = function () {
  redo();
  renderList();
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
};

window.clearCompleted = function () {
  if (confirm("Are you sure you want to remove all completed items?")) {
    handleClearCompleted();
    renderList();
    calculateAndDisplayWeights();
    calculateAndDisplayCosts();
  }
};

window.deleteList = function () {
  if (confirm("Are you sure you want to delete the current list?")) {
    handleDeleteList();
    renderList();
    calculateAndDisplayWeights();
    calculateAndDisplayCosts();
  }
};
