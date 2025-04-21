 /***************** CONFIG & STATE *****************/
 // LocalStorage key for the main checklist array
 const STORAGE_LIST = "campChecklist_data";
 // LocalStorage key for the trip‑meta object (destination / dates / notes)
 const STORAGE_META = "campChecklist_meta";
 // Remote JSON template fetched on first load (or when user resets)
 const REMOTE_JSON = "camplist.json";
 // Minimal hard‑coded list used if remote fetch fails (guarantees the UI always has something to render)
 const FALLBACK_LIST = [
   {
     id: "general",
     title: "General",
     items: [{ id: "tent", text: "Tent", checked: false, note: "" }],
   },
 ];
 const DEFAULT_META = {
   destination: "",
   startDate: "",
   endDate: "",
   notes: "",
 };
 let data = [],
   meta = { ...DEFAULT_META };
 /***************** UTILS *****************/
 const $ = (id) => document.getElementById(id);
 // Quick & simple sanitizer – escapes opening angle brackets to mitigate XSS when rendering user text
 const sanitize = (s) => s.replace(/</g, "&lt;");
 /**
  * Builds an off‑screen element used as the drag image so we can control
  * the appearance of the drag‑and‑drop thumbnail (native looks ugly).
  * @param {string} t – text to show inside the ghost element
  */
 const ghost = (t) => {
   const g = document.createElement("div");
   g.className = "drag-ghost";
   g.textContent = t;
   document.body.appendChild(g);
   return g;
 };
 /***************** LOAD *****************/
 async function fetchDefaultList() {
   // Fetches camplist.json with no‑cache to ensure fresh copy on each reset
   try {
     const r = await fetch(REMOTE_JSON, { cache: "no-store" });
     if (!r.ok) throw 0;
     return await r.json();
   } catch {
     // Network failed or bad JSON → fall back to minimal hard‑coded list
     return structuredClone(FALLBACK_LIST);
   }
 }
 async function loadAll() {
   // Load checklist from localStorage or remote template
   const lsRaw = localStorage.getItem(STORAGE_LIST);
   data = lsRaw ? JSON.parse(lsRaw) : await fetchDefaultList();
   if (!lsRaw) localStorage.setItem(STORAGE_LIST, JSON.stringify(data));
   const metaRaw = localStorage.getItem(STORAGE_META);
   meta = metaRaw ? JSON.parse(metaRaw) : { ...DEFAULT_META };
   if (!metaRaw) localStorage.setItem(STORAGE_META, JSON.stringify(meta));
 }
 function saveList() {
   // Persist current checklist state
   localStorage.setItem(STORAGE_LIST, JSON.stringify(data));
 }
 function saveMeta() {
   // Persist trip meta info
   localStorage.setItem(STORAGE_META, JSON.stringify(meta));
 }
 /***************** RENDER META PANEL *****************/
 /**
  * Renders the "Trip Info" card (destination / dates / notes) and wires
  * the Edit button to open the `dialog`.
  */
 function renderMeta() {
   const html = `<section class="card meta-card"><h2 style="cursor:default">Trip Info</h2><div class="meta-grid"><div class="label">Destination</div><div>${
     sanitize(meta.destination) || "–"
   }</div><div class="label">Start Date</div><div>${
     meta.startDate || "–"
   }</div><div class="label">End Date</div><div>${
     meta.endDate || "–"
   }</div><div class="label">Notes</div><div>${
     sanitize(meta.notes) || "–"
   }</div></div><button id="editMetaBtn" class="secondary" style="margin-top:1rem">Edit Trip Info</button></section>`;
   $("metaContainer").innerHTML = html;
   $("editMetaBtn").onclick = openMetaDialog;
 }
 // Pre‑fill dialog inputs with current meta values and show modal
 function openMetaDialog() {
   const dlg = $("metaDialog");
   const f = $("metaForm");
   f.destination.value = meta.destination;
   f.startDate.value = meta.startDate;
   f.endDate.value = meta.endDate;
   f.notes.value = meta.notes;
   dlg.showModal();
 }
 $("metaForm").addEventListener("submit", (e) => {
   e.preventDefault();
   const fd = new FormData(e.target);
   meta = {
     destination: fd.get("destination").trim(),
     startDate: fd.get("startDate"),
     endDate: fd.get("endDate"),
     notes: fd.get("notes").trim(),
   };
   saveMeta();
   renderMeta();
   $("metaDialog").close();
 });
 $("metaDialog").addEventListener("reset", () => $("metaDialog").close());
 /***************** RENDER CHECKLIST *****************/
 // Helper to build the `<details>` block for an item's note (if present)
 function noteHTML(n) {
   return n
     ? `<details class="details-note"><summary>Notes</summary><div>${sanitize(
         n
       )}</div></details>`
     : "";
 }
 /**
  * Builds the full checklist markup from `data` and injects into DOM.
  * Re‑renders from scratch for simplicity (acceptable for moderate list sizes).
  */
 function renderList() {
   const html = data
     .map(
       (g) =>
         `<section class="card" data-group="${
           g.id
         }"><h2><span class="sectionHandle" draggable="true">☰</span>${sanitize(
           g.title
         )}<span class="chevron">▾</span></h2><ul class="checklist">${g.items
           .map((it) => {
             const hasNote = !!it.note;
             return `<li class="item ${
               it.checked ? "checked" : ""
             }" data-id="${
               it.id
             }"><span class="handle" draggable="true">☰</span>${(()=>{const cbId=`cb-${it.id}`;return `<input type="checkbox" id="${cbId}" ${it.checked?"checked":""}>`})()}<div class="item-body"><label for="cb-${it.id}">${sanitize(
               it.text
             )}</label>${noteHTML(
               it.note
             )}</div><span class="actions"><button class="btnNote ${
               hasNote ? "has-note" : ""
             }">🗒︎</button><button class="btnEdit">✎</button><button class="btnDel">✕</button></span></li>`;
           })
           .join("")}</ul><form class="addItem" data-group="${
           g.id
         }"><input type="text" placeholder="Add new item..." required><button type="submit">Add</button></form></section>`
     )
     .join("");
   $("checklistContainer").innerHTML = html;
 }
 /***************** EVENT HANDLERS *****************/
 // Toggle checkmark – updates `checked` state and applies strike‑through style
 document.addEventListener("change", (e) => {
   if (e.target.type === "checkbox") {
     const id = e.target.closest("li").dataset.id;
     for (const g of data) {
       const item = g.items.find((i) => i.id === id);
       if (item) {
         item.checked = e.target.checked;
         break;
       }
     }
     saveList();
     e.target.closest("li").classList.toggle("checked", e.target.checked);
   }
 });
 // Add new item through inline form
 document.addEventListener("submit", (e) => {
   if (e.target.matches("form.addItem")) {
     e.preventDefault();
     const gId = e.target.dataset.group;
     const txt = e.target.querySelector("input").value.trim();
     if (!txt) return;
     data
       .find((g) => g.id === gId)
       .items.push({
         id: `${gId}-${Date.now()}`,
         text: txt,
         checked: false,
         note: "",
       });
     saveList();
     renderList();
   }
 });
 // Handle Edit/Delete/Note buttons + section collapse chevrons
 document.addEventListener("click", (e) => {
   const li = e.target.closest("li.item");
   if (e.target.classList.contains("btnDel") && li) {
     if (confirm("Delete item?")) {
       const id = li.dataset.id;
       for (const g of data) {
         const idx = g.items.findIndex((i) => i.id === id);
         if (idx > -1) {
           g.items.splice(idx, 1);
           break;
         }
       }
       saveList();
       renderList();
     }
   } else if (e.target.classList.contains("btnEdit") && li) {
     const id = li.dataset.id;
     for (const g of data) {
       const it = g.items.find((i) => i.id === id);
       if (it) {
         const t = prompt("Edit item text", it.text);
         if (t !== null && t.trim()) it.text = t.trim();
         break;
       }
     }
     saveList();
     renderList();
   } else if (e.target.classList.contains("btnNote") && li) {
     const id = li.dataset.id;
     for (const g of data) {
       const it = g.items.find((i) => i.id === id);
       if (it) {
         const n = prompt("Add/edit note", it.note || "");
         if (n !== null) it.note = n.trim();
         break;
       }
     }
     saveList();
     renderList();
   } else if (e.target.classList.contains("chevron")) {
     e.target.parentElement.nextElementSibling.classList.toggle(
       "collapsed"
     );
     e.target.textContent = e.target.textContent === "▾" ? "▸" : "▾";
   }
 });
 /***************** DRAG‑N‑DROP (items only for brevity) *****************/
 // Item drag‑and‑drop implementation – sets drag image, handles re‑ordering, and cleans up
 let dragId = null,
   dragGhost = null;
 document.addEventListener("dragstart", (e) => {
   if (e.target.classList.contains("handle")) {
     const li = e.target.closest("li.item");
     dragId = li.dataset.id;
     li.classList.add("dragging");
     dragGhost = ghost(li.querySelector("label").textContent);
     e.dataTransfer.setDragImage(dragGhost, 10, 10);
   }
 });
 document.addEventListener("dragover", (e) => {
   if (!dragId) return;
   const li = e.target.closest("li.item");
   if (li && li.dataset.id !== dragId) {
     e.preventDefault();
     li.classList.add("item-over");
   }
 });
 document.addEventListener("dragleave", (e) => {
   const li = e.target.closest("li.item");
   if (li) li.classList.remove("item-over");
 });
 document.addEventListener("drop", (e) => {
   if (!dragId) return;
   const tgt = e.target.closest("li.item");
   if (tgt && tgt.dataset.id !== dragId) {
     const srcCtx = findItem(dragId);
     const tgtCtx = findItem(tgt.dataset.id);
     if (srcCtx && tgtCtx) {
       srcCtx.g.items.splice(srcCtx.idx, 1);
       tgtCtx.g.items.splice(tgtCtx.idx, 0, srcCtx.item);
       saveList();
       renderList();
     }
   }
 });
 document.addEventListener("dragend", () => {
   document
     .querySelectorAll(".dragging")
     .forEach((el) => el.classList.remove("dragging"));
   document
     .querySelectorAll(".item-over")
     .forEach((el) => el.classList.remove("item-over"));
   if (dragGhost) document.body.removeChild(dragGhost);
   dragId = null;
   dragGhost = null;
 });
 function findItem(id) {
   for (const g of data) {
     const idx = g.items.findIndex((i) => i.id === id);
     if (idx > -1) return { g, idx, item: g.items[idx] };
   }
   return null;
 }
 /***************** RESET & PRINT *****************/
 // Reset localStorage & reload remote template – then re‑render everything
 $("btnReset").onclick = async () => {
   if (!confirm("Reset checklist and trip info?")) return;
   localStorage.removeItem(STORAGE_LIST);
   localStorage.removeItem(STORAGE_META);
   data = await fetchDefaultList();
   meta = { ...DEFAULT_META };
   saveList();
   saveMeta();
   renderMeta();
   renderList();
 };
 // Native print dialog
 $("btnPrint").onclick = () => window.print();
 /***************** BOOT *****************/
 // Initial app bootstrap
 (async () => {
   await loadAll();
   renderMeta();
   renderList();
 })();