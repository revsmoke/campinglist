// Import state and UI functions
import { moveItemState, moveSectionState } from "./state.js";
import { renderList } from "./ui.js";

/***************** DRAG UTILS *****************/

let dragId = null;
let dragSectionId = null;
let dragGhostElement = null;

/**
 * Builds an off‑screen element used as the drag image so we can control
 * the appearance of the drag‑and‑drop thumbnail (native looks ugly).
 * @param {string} t – text to show inside the ghost element
 */
function createDragGhost(text) {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = text;
  document.body.appendChild(ghost);
  return ghost;
}

function removeDragGhost() {
  if (dragGhostElement) {
    document.body.removeChild(dragGhostElement);
    dragGhostElement = null;
  }
}

function cleanupDragStyles() {
  document
    .querySelectorAll(".dragging")
    .forEach((el) => el.classList.remove("dragging"));
  document
    .querySelectorAll(".item-over")
    .forEach((el) => el.classList.remove("item-over"));
  document
    .querySelectorAll(".section-dragging")
    .forEach((el) => el.classList.remove("section-dragging"));
  document
    .querySelectorAll(".section-over")
    .forEach((el) => el.classList.remove("section-over"));
}

/***************** DRAG EVENT HANDLERS *****************/
function setupDragAndDrop() {
  const container = document.getElementById("checklistContainer");
  if (!container) return;

  // Use event delegation on the container
  container.addEventListener("dragstart", (e) => {
    // Reset drag state
    dragId = null;
    dragSectionId = null;
    removeDragGhost(); // Clean up previous ghost if any

    // Check if dragging an item handle
    if (e.target.classList.contains("handle")) {
      const li = e.target.closest("li.item");
      if (li) {
        dragId = li.dataset.id;
        li.classList.add("dragging");
        dragGhostElement = createDragGhost(li.querySelector("label").textContent);
        e.dataTransfer.setDragImage(dragGhostElement, 10, 10);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragId); // Set data for item drag
      }
    } 
    // Check if dragging a section handle
    else if (e.target.classList.contains("sectionHandle")) {
      const section = e.target.closest("section.card");
      if (section && section.dataset.group) {
        dragSectionId = section.dataset.group;
        section.classList.add("section-dragging");
        // No custom ghost for section drag needed for now
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragSectionId); // Set data for section drag
      } else {
         e.preventDefault(); // Prevent drag if section info is missing
      }
    } else {
      // Prevent dragging from other elements
      e.preventDefault();
    }
  });

  container.addEventListener("dragover", (e) => {
    // If dragging an item
    if (dragId) {
      const li = e.target.closest("li.item");
      if (li && li.dataset.id !== dragId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        document.querySelectorAll(".item-over").forEach(el => el.classList.remove("item-over")); // Clear previous
        li.classList.add("item-over");
      }
    } 
    // If dragging a section
    else if (dragSectionId) {
      const section = e.target.closest("section.card");
      if (section && section.dataset.group !== dragSectionId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        document.querySelectorAll(".section-over").forEach(el => el.classList.remove("section-over")); // Clear previous
        section.classList.add("section-over");
      } else {
        // Optionally allow dropping outside a section card within the container?
        // e.preventDefault(); // Allow dropping onto container itself? Requires different drop logic.
      }
    }
  });

  container.addEventListener("dragleave", (e) => {
    // If dragging an item
    if (dragId) {
      const li = e.target.closest("li.item");
      if (li) {
        li.classList.remove("item-over");
      }
    } 
    // If dragging a section
    else if (dragSectionId) {
        const section = e.target.closest("section.card");
        if (section) {
            section.classList.remove("section-over");
        }
    }
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault(); // Prevent default drop behavior

    // Handle item drop
    if (dragId) {
      const targetLi = e.target.closest("li.item");
      if (targetLi && targetLi.dataset.id !== dragId) {
        const targetId = targetLi.dataset.id;
        if (moveItemState(dragId, targetId)) {
          renderList();
        }
      }
    } 
    // Handle section drop
    else if (dragSectionId) {
      const targetSection = e.target.closest("section.card");
      if (targetSection && targetSection.dataset.group !== dragSectionId) {
        const targetSectionId = targetSection.dataset.group;
        if (moveSectionState(dragSectionId, targetSectionId)) {
          renderList(); 
        }
      }
    }

    // Always clean up regardless of drop target validity
    cleanupDragStyles();
    removeDragGhost();
    dragId = null;
    dragSectionId = null;
  });

  // Use document level listener for dragend as it might fire outside the container
  document.addEventListener("dragend", (e) => {
    // Clean up visual styles and state if a drag was in progress
    if (dragId || dragSectionId) {
      cleanupDragStyles();
      removeDragGhost();
      dragId = null;
      dragSectionId = null;
    }
  });
}

export { setupDragAndDrop }; 