import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../public/js/ui.js", () => ({
  showErrorDialog: vi.fn(),
  updateUndoRedoButtons: vi.fn(),
}));

const classicTemplate = {
  id: "camplist-classic",
  sections: [
    {
      title: "Shelter",
      items: [
        { text: "Tent", required: true },
        { text: "Pillow", required: false, note: "comfort" },
      ],
    },
    {
      title: "Kitchen",
      items: [{ text: "Stove", required: true, permitRequired: true }],
    },
  ],
};

function mockFetch(template = classicTemplate) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => structuredClone(template),
  }));
}

async function freshState() {
  vi.resetModules();
  return import("../../public/js/state.js");
}

describe("state.js", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  it("creates a default list from the template on first run", async () => {
    const state = await freshState();
    await state.loadAllState();
    expect(state.getLists()).toHaveLength(1);
    expect(state.getActiveList().name).toBe("My CampList");
    expect(state.data).toHaveLength(2);
    expect(state.data[0].items[0]).toMatchObject({
      text: "Tent",
      optional: false,
      checked: false,
    });
    expect(state.data[0].items[1]).toMatchObject({
      text: "Pillow",
      optional: true,
      note: "comfort",
    });
    expect(state.data[1].items[0].permitRequired).toBe(true);
    // Legacy keys are mirrored for the guest namespace.
    expect(JSON.parse(localStorage.getItem("campChecklist_data"))).toHaveLength(2);
  });

  it("migrates legacy single-list data without deleting it", async () => {
    localStorage.setItem(
      "campChecklist_data",
      JSON.stringify([
        {
          id: "g",
          title: "Legacy",
          items: [{ id: "a", text: "Old item", checked: true }],
        },
      ])
    );
    localStorage.setItem(
      "campChecklist_meta",
      JSON.stringify({ destination: "Yosemite", bogus: 1 })
    );
    localStorage.setItem("campChecklist_collapsedSections", JSON.stringify(["g"]));
    const state = await freshState();
    await state.loadAllState();
    expect(fetch).not.toHaveBeenCalled();
    expect(state.data[0].title).toBe("Legacy");
    expect(state.data[0].items[0]).toMatchObject({
      text: "Old item",
      checked: true,
      weight: 0,
      optional: false,
    });
    expect(state.meta.destination).toBe("Yosemite");
    expect(state.meta.bogus).toBeUndefined();
    expect(state.collapsedSections.has("g")).toBe(true);
    expect(state.getActiveList().migratedFromLegacy).toBe(true);
    expect(localStorage.getItem("campChecklist_data")).not.toBeNull();
  });

  it("falls back to a built-in list when the template cannot be fetched", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    const state = await freshState();
    await state.loadAllState();
    expect(state.data[0].title).toBe("General");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("supports item and section CRUD with undo/redo", async () => {
    const state = await freshState();
    await state.loadAllState();
    const section = state.addSectionState("  New Section ");
    expect(section.title).toBe("New Section");
    const item = state.addItemState(section.id, "Headlamp");
    expect(item.text).toBe("Headlamp");
    expect(state.updateItemCheckedState(item.id, true)).toBe(true);
    expect(state.updateItemNoteState(item.id, "spare batteries")).toBe(true);
    expect(
      state.updateItemDetailsState(item.id, {
        weight: "120",
        cost: "19.99",
        optional: true,
        packed: true,
      })
    ).toBe(true);
    expect(state.findItemState(item.id).item).toMatchObject({
      weight: 120,
      cost: 19.99,
      optional: true,
      packed: true,
    });
    expect(state.canUndo()).toBe(true);
    state.undoState();
    expect(state.findItemState(item.id).item.weight).toBe(0);
    state.redoState();
    expect(state.findItemState(item.id).item.weight).toBe(120);
    expect(state.deleteItemState(item.id)).toBe(true);
    expect(state.findItemState(item.id)).toBeNull();
    expect(state.deleteSectionState(section.id)).toBe(true);
    expect(state.data.find((g) => g.id === section.id)).toBeUndefined();
    // Persisted
    const stored = JSON.parse(
      localStorage.getItem(`campList.v2.guest.list.${state.getActiveList().id}`)
    );
    expect(stored.data).toHaveLength(2);
  });

  it("rejects empty text and clamps long text", async () => {
    const state = await freshState();
    await state.loadAllState();
    expect(state.addSectionState("   ")).toBeNull();
    expect(state.addItemState(state.data[0].id, "")).toBeNull();
    const long = state.addItemState(state.data[0].id, "x".repeat(2000));
    expect(long.text).toHaveLength(500);
  });

  it("moves items and sections", async () => {
    const state = await freshState();
    await state.loadAllState();
    const [shelter, kitchen] = state.data;
    expect(state.moveItemState(shelter.items[0].id, kitchen.items[0].id)).toBe(true);
    expect(state.data[1].items[0].text).toBe("Tent");
    expect(state.moveSectionState(state.data[1].id, state.data[0].id)).toBe(true);
    expect(state.data[0].title).toBe("Kitchen");
  });

  it("validates meta and only allows http(s) permit links", async () => {
    const state = await freshState();
    await state.loadAllState();
    state.updateMetaState({
      destination: "Zion",
      permitUrl: "javascript:alert(1)",
      startDate: "2026-07-01",
    });
    expect(state.meta.permitUrl).toBe("");
    expect(state.meta.destination).toBe("Zion");
    state.updateMetaState({ permitUrl: "https://recreation.gov/x" });
    expect(state.meta.permitUrl).toBe("https://recreation.gov/x");
  });

  it("manages multiple lists", async () => {
    const state = await freshState();
    await state.loadAllState();
    const first = state.getActiveList().id;
    const created = state.createList({
      name: "Zion trip",
      data: [{ title: "Permits", items: [{ text: "Permit" }] }],
    });
    expect(state.getActiveList().id).toBe(created.id);
    expect(state.data[0].items[0].text).toBe("Permit");
    expect(state.getLists()).toHaveLength(2);
    expect(state.renameList(created.id, "Zion 2027")).toBe(true);
    expect(state.getActiveList().name).toBe("Zion 2027");
    expect(state.switchList(first)).toBe(true);
    expect(state.data[0].items[0].text).toBe("Tent");
    await state.deleteList(first);
    expect(state.getLists()).toHaveLength(1);
    expect(state.getActiveList().id).toBe(created.id);
    await state.deleteList(created.id);
    // Never leaves the user without a list.
    expect(state.getLists()).toHaveLength(1);
    expect(state.getActiveList().name).toBe("My CampList");
  });

  it("switches namespaces and copies lists between them", async () => {
    const state = await freshState();
    await state.loadAllState();
    state.addSectionState("Edited by guest");
    expect(state.namespaceHasEditedLists("guest")).toBe(true);
    expect(state.namespaceHasData("google_1")).toBe(false);
    expect(state.copyListsBetweenNamespaces("guest", "google_1")).toBe(1);
    await state.switchNamespace("google_1");
    expect(state.getNamespace()).toBe("google_1");
    expect(state.data.some((g) => g.title === "Edited by guest")).toBe(true);
    state.addSectionState("Edited by account");
    await state.switchNamespace("guest");
    expect(state.data.some((g) => g.title === "Edited by account")).toBe(false);
  });

  it("produces snapshots, digests and parses imports", async () => {
    const state = await freshState();
    await state.loadAllState();
    const snap = state.getListSnapshot();
    expect(snap).toMatchObject({ schema: 2, app: "camplist.guide", name: "My CampList" });
    const d1 = state.getContentDigest();
    state.addSectionState("More");
    expect(state.getContentDigest()).not.toBe(d1);
    const parsed = state.parseImportedList(JSON.stringify(snap));
    expect(parsed.name).toBe("My CampList");
    expect(parsed.data).toHaveLength(2);
    expect(() => state.parseImportedList('{"nope":1}')).toThrow(/CampList export/);
    expect(
      state.parseImportedList([{ title: "Raw", items: [{ text: "x" }] }]).data[0].title
    ).toBe("Raw");
    const v1 = state.parseImportedList({
      data: [{ title: "V1", items: [] }],
      meta: { destination: "A" },
      theme: "dark",
    });
    expect(v1.theme).toBe("dark");
    state.replaceActiveListContent(parsed);
    expect(state.data).toHaveLength(2);
    expect(state.canUndo()).toBe(true);
  });

  it("stores sync metadata per list and provider", async () => {
    const state = await freshState();
    await state.loadAllState();
    const id = state.getActiveList().id;
    expect(state.getListSync(id, "google")).toBeNull();
    state.setListSync(id, "google", { fileId: "abc", digest: "123" });
    expect(state.getListSync(id, "google")).toMatchObject({ fileId: "abc" });
    state.setListSync(id, "google", null);
    expect(state.getListSync(id, "google")).toBeNull();
  });

  it("notifies listeners on content changes", async () => {
    const state = await freshState();
    const events = [];
    state.onStateChange((e) => events.push(e.type + ":" + (e.reason || "")));
    await state.loadAllState();
    state.addSectionState("A");
    expect(events).toContain("content:load");
    expect(events).toContain("content:save");
  });

  it("copies template and new lists between namespaces, leaving only the untouched default", async () => {
    const state = await freshState();
    await state.loadAllState();
    expect(state.namespaceHasUserLists("guest")).toBe(false);
    state.createList({
      name: "From template",
      data: [{ title: "A", items: [{ text: "x" }] }],
      pristine: true,
      source: { type: "template", templateId: "t" },
    });
    state.createList({ name: "Empty new list", data: [], pristine: true });
    expect(state.namespaceHasUserLists("guest")).toBe(true);
    expect(state.namespaceHasEditedLists("guest")).toBe(false);
    expect(
      state.copyListsBetweenNamespaces("guest", "acct", { skipUntouchedDefault: true })
    ).toBe(2);
    expect(state.copyListsBetweenNamespaces("guest", "acct2")).toBe(3);
  });

  it("digestOfSnapshot matches getContentDigest and ignores view state", async () => {
    const state = await freshState();
    await state.loadAllState();
    const snap = state.getListSnapshot();
    expect(state.digestOfSnapshot(snap)).toBe(state.getContentDigest());
    state.updateCollapsedState(state.data[0].id, true);
    expect(state.getContentDigest()).toBe(state.digestOfSnapshot(snap));
    state.addSectionState("Changed");
    expect(state.getContentDigest()).not.toBe(state.digestOfSnapshot(snap));
  });

  it("regenerates ids that are unsafe for attributes and selectors", async () => {
    const state = await freshState();
    const out = state.normalizeData([
      {
        id: 'g"><img src=x>',
        title: "T",
        items: [
          { id: "ok-1", text: "a" },
          { id: "bad id'", text: "b" },
        ],
      },
    ]);
    expect(out[0].id).toMatch(/^section-/);
    expect(out[0].items[0].id).toBe("ok-1");
    expect(out[0].items[1].id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("reports a failed namespace copy instead of a partial success", async () => {
    const state = await freshState();
    await state.loadAllState();
    state.addSectionState("Keep me");
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("campList.v2.full.")) {
        const error = new DOMException("quota", "QuotaExceededError");
        throw error;
      }
      return originalSetItem.call(this, key, value);
    };
    try {
      expect(state.copyListsBetweenNamespaces("guest", "full")).toBe(false);
      expect(state.namespaceHasData("full")).toBe(false);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    expect(state.copyListsBetweenNamespaces("guest", "ok")).toBe(1);
  });

  it("rolls back a partly failed namespace copy so a retry does not duplicate lists", async () => {
    const state = await freshState();
    await state.loadAllState();
    state.addSectionState("Keep me");
    state.createList({ name: "Second", data: [{ title: "B", items: [{ text: "y" }] }] });
    const originalSetItem = Storage.prototype.setItem;
    let listWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("campList.v2.full.list.") && ++listWrites === 2) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    try {
      expect(state.copyListsBetweenNamespaces("guest", "full")).toBe(false);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    const targetKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("campList.v2.full.")) targetKeys.push(key);
    }
    expect(targetKeys).toEqual([]);
    expect(state.namespaceHasData("full")).toBe(false);
    // The retry succeeds and holds each list exactly once.
    expect(state.copyListsBetweenNamespaces("guest", "full")).toBe(2);
    const index = JSON.parse(localStorage.getItem("campList.v2.full.index"));
    expect(index.lists.map((l) => l.name).sort()).toEqual(["My CampList", "Second"]);
  });

  it("reloads the current namespace on request so merged lists become visible", async () => {
    const state = await freshState();
    await state.loadAllState();
    await state.switchNamespace("other");
    state.createList({ name: "Theirs", data: [{ title: "B", items: [] }] });
    await state.switchNamespace("guest");
    expect(
      state.copyListsBetweenNamespaces("other", "guest", { skipUntouchedDefault: true })
    ).toBe(1);
    expect(state.getLists().map((l) => l.name)).not.toContain("Theirs");
    await state.switchNamespace("guest");
    expect(state.getLists().map((l) => l.name)).not.toContain("Theirs");
    await state.switchNamespace("guest", { reload: true });
    expect(state.getLists().map((l) => l.name)).toContain("Theirs");
  });
});
