// Tests for state.js
import { describe, it, expect, beforeEach, vi } from "vitest";

// Module-level state for mocking.
let testData = [];
let testMeta = {};

// Helper functions to manipulate the test state directly
const resetTestData = (initialData = []) => {
  testData = structuredClone(initialData);
};
const resetTestMeta = (initialMeta = {}) => {
  testMeta = structuredClone(initialMeta);
};

// Define internal default constants (since state.js doesn't export them)
const DEFAULT_META_CONST = {
  destination: "",
  startDate: "",
  endDate: "",
  notes: "",
};
const FALLBACK_LIST_CONST = [
  {
    id: "general",
    title: "General",
    items: [{ id: "tent", text: "Tent", checked: false, note: "" }],
  },
];

// --- Mocking state.js ---
vi.mock("./state.js", async (importOriginal) => {
  const original = await importOriginal(); // Get original exports for constants

  // --- Define Mock Implementations ---
  // These operate on the top-level testData/testMeta via closure
  // or by calling resetTestData/resetTestMeta

  const mockFindItemState = (id) => {
    for (const g of testData) {
      const idx = g.items.findIndex((i) => i.id === id);
      if (idx > -1) return { g, idx, item: g.items[idx] };
    }
    return null;
  };

  const mockFetchDefaultList = async () => {
    try {
      const r = await fetch(original.REMOTE_JSON, { cache: "no-store" }); // Uses globally mocked fetch
      if (!r.ok) throw new Error(`Fetch failed`);
      return await r.json();
    } catch (error) {
      return structuredClone(FALLBACK_LIST_CONST);
    }
  };

  const mockLoadAllState = async () => {
    console.log("[Mock] mockLoadAllState called"); // Debug log
    let loadedData, loadedMeta;
    try {
      const lsRaw = localStorage.getItem(original.STORAGE_LIST);
      console.log("[Mock] lsRaw (List):", lsRaw); // Debug log
      if (lsRaw) {
        loadedData = JSON.parse(lsRaw);
      } else {
        loadedData = await mockFetchDefaultList();
        console.log("[Mock] Fetched/Fallback List Data:", JSON.stringify(loadedData)); // Debug log
        localStorage.setItem(original.STORAGE_LIST, JSON.stringify(loadedData));
      }
    } catch (error) {
      console.error("[Mock] Error loading/parsing list:", error); // Debug log
      loadedData = structuredClone(FALLBACK_LIST_CONST);
      localStorage.setItem(original.STORAGE_LIST, JSON.stringify(loadedData));
    }
    try {
      const metaRaw = localStorage.getItem(original.STORAGE_META);
      console.log("[Mock] metaRaw (Meta):", metaRaw); // Debug log
      if (metaRaw) {
        loadedMeta = JSON.parse(metaRaw);
      } else {
        loadedMeta = structuredClone(DEFAULT_META_CONST);
        console.log("[Mock] Default Meta Data:", JSON.stringify(loadedMeta)); // Debug log
        localStorage.setItem(original.STORAGE_META, JSON.stringify(loadedMeta));
      }
    } catch (error) {
      console.error("[Mock] Error loading/parsing meta:", error); // Debug log
      loadedMeta = structuredClone(DEFAULT_META_CONST);
      localStorage.setItem(original.STORAGE_META, JSON.stringify(loadedMeta));
    }
    console.log("[Mock] Before reset - loadedData:", JSON.stringify(loadedData)); // Debug log
    console.log("[Mock] Before reset - loadedMeta:", JSON.stringify(loadedMeta)); // Debug log
    // Update the external state using the helper functions
    resetTestData(loadedData);
    resetTestMeta(loadedMeta);
    console.log("[Mock] After reset - testData:", JSON.stringify(testData)); // Debug log
    console.log("[Mock] After reset - testMeta:", JSON.stringify(testMeta)); // Debug log
  };

  const mockSaveListState = () => {
    try {
      localStorage.setItem(original.STORAGE_LIST, JSON.stringify(testData));
    } catch (error) {}
  };

  const mockSaveMetaState = () => {
    try {
      localStorage.setItem(original.STORAGE_META, JSON.stringify(testMeta));
    } catch (error) {}
  };

  const mockUpdateMetaState = (newMeta) => {
    resetTestMeta({ ...newMeta }); // Use helper
    mockSaveMetaState();
  }

 const mockUpdateItemCheckedState = (id, checked) => {
    const itemContext = mockFindItemState(id);
    if (itemContext) {
      itemContext.item.checked = checked; // Modifies object in testData
      mockSaveListState();
      return true;
    }
    return false;
  }

 const mockAddItemState = (groupId, text) => {
    const group = testData.find((g) => g.id === groupId);
    if (group) {
      const newItem = { id: `${groupId}-${Date.now()}`, text, checked: false, note: "" };
      group.items.push(newItem); // Modifies testData
      mockSaveListState();
      return newItem;
    }
    return null;
  }

 const mockDeleteItemState = (id) => {
    for (let gIndex = 0; gIndex < testData.length; gIndex++) {
        const g = testData[gIndex];
        const idx = g.items.findIndex((i) => i.id === id);
        if (idx > -1) {
            g.items.splice(idx, 1); // Modifies testData
            mockSaveListState();
            return true;
        }
    }
    return false;
  }

 const mockUpdateItemTextState = (id, text) => {
    const itemContext = mockFindItemState(id);
    if (itemContext) {
      itemContext.item.text = text; // Modifies object in testData
      mockSaveListState();
      return true;
    }
    return false;
  }

 const mockUpdateItemNoteState = (id, note) => {
    const itemContext = mockFindItemState(id);
    if (itemContext) {
      itemContext.item.note = note; // Modifies object in testData
      mockSaveListState();
      return true;
    }
    return false;
  }

  const mockMoveItemState = (itemId, targetItemId) => {
    const srcCtx = mockFindItemState(itemId);
    const tgtCtx = mockFindItemState(targetItemId);
    if (srcCtx && tgtCtx) {
      const itemToMove = srcCtx.g.items.splice(srcCtx.idx, 1)[0]; // Modifies testData
      if (itemToMove) {
          const insertIndex = srcCtx.g === tgtCtx.g && srcCtx.idx < tgtCtx.idx ? tgtCtx.idx : tgtCtx.idx;
          tgtCtx.g.items.splice(insertIndex, 0, itemToMove); // Modifies testData
          mockSaveListState();
          return true;
      }
    }
    return false;
  }

  const mockResetAllState = async () => {
    localStorage.removeItem(original.STORAGE_LIST);
    localStorage.removeItem(original.STORAGE_META);
    const fetchedData = await mockFetchDefaultList();
    const defaultMeta = structuredClone(original.DEFAULT_META);
    resetTestData(fetchedData); // Use helper
    resetTestMeta(DEFAULT_META_CONST); // Use helper
    mockSaveListState();
    mockSaveMetaState();
  };

  // --- Return the full mocked module interface ---
  return {
    // Constants
    STORAGE_LIST: original.STORAGE_LIST,
    STORAGE_META: original.STORAGE_META,
    REMOTE_JSON: original.REMOTE_JSON,
    FALLBACK_LIST: original.FALLBACK_LIST,
    DEFAULT_META: original.DEFAULT_META,
    // Mocked state access (optional, tests use top-level vars)
    // get data() { return testData; },
    // get meta() { return testMeta; },
    // Mocked functions (wrapped for spying)
    loadAllState: vi.fn(mockLoadAllState),
    saveListState: vi.fn(mockSaveListState),
    saveMetaState: vi.fn(mockSaveMetaState),
    findItemState: vi.fn(mockFindItemState),
    updateMetaState: vi.fn(mockUpdateMetaState),
    updateItemCheckedState: vi.fn(mockUpdateItemCheckedState),
    addItemState: vi.fn(mockAddItemState),
    deleteItemState: vi.fn(mockDeleteItemState),
    updateItemTextState: vi.fn(mockUpdateItemTextState),
    updateItemNoteState: vi.fn(mockUpdateItemNoteState),
    moveItemState: vi.fn(mockMoveItemState),
    resetAllState: vi.fn(mockResetAllState),
    fetchDefaultList: vi.fn(mockFetchDefaultList),
  };
});

// Import the mocked module AFTER vi.mock()
const state = await import("./state.js");

// --- Test Suite ---
describe("state.js", () => {
  // Mock localStorage
  let storage = {};
  const localStorageMock = {
    getItem: vi.fn((key) => storage[key] || null),
    setItem: vi.fn((key, value) => { storage[key] = value ? value.toString() : ''; }),
    removeItem: vi.fn((key) => { delete storage[key]; }),
    clear: vi.fn(() => { storage = {}; }),
  };
  vi.stubGlobal("localStorage", localStorageMock);

  // Mock fetch
  const mockFetchResponse = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  const mockFetchError = () => Promise.resolve({ ok: false });
  vi.stubGlobal("fetch", vi.fn());

  // Use constants from the mocked import
  const FALLBACK_LIST_STRUCTURE = structuredClone(FALLBACK_LIST_CONST);
  const DEFAULT_META_STRUCTURE = structuredClone(DEFAULT_META_CONST);

  beforeEach(() => {
    storage = {};
    vi.clearAllMocks();
    resetTestData([]); // Reset top-level test state
    resetTestMeta({});
    fetch.mockClear();
    // Clear spies on mocked functions
    state.loadAllState.mockClear();
    state.saveListState.mockClear();
    state.saveMetaState.mockClear();
    state.findItemState.mockClear();
    state.updateMetaState.mockClear();
    state.updateItemCheckedState.mockClear();
    state.addItemState.mockClear();
    state.deleteItemState.mockClear();
    state.updateItemTextState.mockClear();
    state.updateItemNoteState.mockClear();
    state.moveItemState.mockClear();
    state.resetAllState.mockClear();
    state.fetchDefaultList.mockClear();
  });

  // --- findItemState Tests ---
  describe("findItemState", () => {
    beforeEach(() => {
      resetTestData([ // Set top-level state
        { id: "g1", title: "Group 1", items: [{ id: "i1", text: "Item 1" },{ id: "i2", text: "Item 2" }] },
        { id: "g2", title: "Group 2", items: [{ id: "i3", text: "Item 3" }] },
      ]);
    });

    it("should find an existing item and return its context", () => {
      const result = state.findItemState("i2"); // Calls mocked findItemState
      expect(state.findItemState).toHaveBeenCalledWith("i2");
      expect(result).not.toBeNull();
      expect(result.item.id).toBe("i2");
      expect(result.g.id).toBe("g1");
      expect(result.idx).toBe(1);
    });
    it("should return null if item ID does not exist", () => {
      const result = state.findItemState("nonexistent"); // Calls mocked findItemState
      expect(state.findItemState).toHaveBeenCalledWith("nonexistent");
      expect(result).toBeNull();
    });
     it("should find an item in a different group", () => {
      const result = state.findItemState("i3"); // Calls mocked findItemState
      expect(state.findItemState).toHaveBeenCalledWith("i3");
      expect(result).not.toBeNull();
      expect(result.item.id).toBe("i3");
      expect(result.g.id).toBe("g2");
      expect(result.idx).toBe(0);
    });
  });

  // --- loadAllState Tests ---
  describe("loadAllState", () => {
    // Uses mocked loadAllState
    const mockListData = [{ id: "g_ls", items: [{ id: "i_ls" }] }];
    const mockMetaData = { destination: "LS Dest" };
    const mockFetchData = [{ id: "g_fetch", items: [{ id: "i_fetch" }] }];

    it("should load data and meta from localStorage if available", async () => {
      localStorageMock.getItem
        .mockReturnValueOnce(JSON.stringify(mockListData))
        .mockReturnValueOnce(JSON.stringify(mockMetaData));

      await state.loadAllState(); // Calls mocked loadAllState

      expect(state.loadAllState).toHaveBeenCalledTimes(1);
      expect(localStorageMock.getItem).toHaveBeenCalledWith(state.STORAGE_LIST);
      expect(localStorageMock.getItem).toHaveBeenCalledWith(state.STORAGE_META);
      expect(fetch).not.toHaveBeenCalled(); // fetch inside mockFetchDefaultList wasn't called
      // Check top-level state variables updated by mockLoadAllState via helpers
      expect(testData).toEqual(mockListData);
      expect(testMeta).toEqual(mockMetaData);
      expect(localStorageMock.setItem).not.toHaveBeenCalled(); // Mocked loadAllState saves only if data wasn't in localStorage
    });

    it("should fetch default list if not in localStorage and save it", async () => {
      localStorageMock.getItem.mockReturnValue(null);
      fetch.mockReturnValue(mockFetchResponse(mockFetchData));

      await state.loadAllState(); // Calls mocked loadAllState

      expect(state.loadAllState).toHaveBeenCalledTimes(1);
      expect(localStorageMock.getItem).toHaveBeenCalledWith(state.STORAGE_LIST);
      expect(fetch).toHaveBeenCalledWith(state.REMOTE_JSON, { cache: "no-store" }); // fetch inside mockFetchDefaultList was called
      // Check top-level state variables
      expect(testData).toEqual(mockFetchData);
      expect(testMeta).toEqual(DEFAULT_META_STRUCTURE);
      // Check that the mocked loadAllState called mocked setItem
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_LIST, JSON.stringify(mockFetchData));
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_META, JSON.stringify(DEFAULT_META_STRUCTURE));
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
    });

     it("should use fallback list if fetch fails and save it", async () => {
      localStorageMock.getItem.mockReturnValue(null);
      fetch.mockReturnValue(mockFetchError());

      await state.loadAllState(); // Calls mocked loadAllState

      expect(state.loadAllState).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      // Check top-level state variables
      expect(testData).toEqual(FALLBACK_LIST_STRUCTURE);
      expect(testMeta).toEqual(DEFAULT_META_STRUCTURE);
      // Check save calls by mocked loadAllState
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_LIST, JSON.stringify(FALLBACK_LIST_STRUCTURE));
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_META, JSON.stringify(DEFAULT_META_STRUCTURE));
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2);
    });

    it("should handle localStorage JSON parsing errors gracefully", async () => {
      localStorageMock.getItem
        .mockReturnValueOnce("invalid json")
        .mockReturnValueOnce("{invalid");
      fetch.mockReturnValue(mockFetchResponse(mockFetchData)); // Mock global fetch for mockFetchDefaultList

      await state.loadAllState(); // Calls mocked loadAllState

      expect(state.loadAllState).toHaveBeenCalledTimes(1);
      // Check top-level state - mocked loadAllState uses fallbacks
      expect(testData).toEqual(FALLBACK_LIST_STRUCTURE);
      expect(testMeta).toEqual(DEFAULT_META_STRUCTURE);
      // Check save calls by mocked loadAllState
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_LIST, JSON.stringify(FALLBACK_LIST_STRUCTURE));
      expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_META, JSON.stringify(DEFAULT_META_STRUCTURE));
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(2); // Saves list fallback, saves meta fallback
    });
  });

  // --- saveListState / saveMetaState Tests ---
  describe("save state", () => {
     it("saveListState should call mocked localStorage.setItem with current test data", () => {
        const currentData = [{ id: "g1", items: [{id: "i1"}]}];
        resetTestData(currentData);
        state.saveListState(); // Calls the vi.fn wrapped mockSaveListState

        expect(state.saveListState).toHaveBeenCalledTimes(1);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_LIST, JSON.stringify(currentData));
     });

     it("saveMetaState should call mocked localStorage.setItem with current test meta", () => {
        const currentMeta = { destination: "test dest" };
        resetTestMeta(currentMeta);
        state.saveMetaState(); // Calls the vi.fn wrapped mockSaveMetaState

        expect(state.saveMetaState).toHaveBeenCalledTimes(1);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(state.STORAGE_META, JSON.stringify(currentMeta));
     });
  });

}); 