import { createDefaultDocument, InvitationDocumentSchema, type Section } from "@hpwd/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../editor-store";

/**
 * The store is a module-level singleton (that's the point — Task 16's
 * property panels and the autosave hook both subscribe to the same
 * instance), so every test starts from a fresh, known document to avoid
 * bleeding state across tests.
 */
function resetStore() {
  useEditorStore.setState({
    document: createDefaultDocument(),
    version: 0,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

beforeEach(() => {
  resetStore();
});

function sectionIds(): string[] {
  return useEditorStore
    .getState()
    .document.sections.slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => s.id);
}

function findSection(id: string): Section {
  const section = useEditorStore.getState().document.sections.find((s) => s.id === id);
  if (!section) throw new Error(`Fixture invalid: no section with id ${id}`);
  return section;
}

describe("setDocument", () => {
  it("replaces the document and clears dirty", () => {
    useEditorStore.getState().updateTheme({ primary: "#000000" });
    expect(useEditorStore.getState().dirty).toBe(true);

    const fresh = createDefaultDocument();
    useEditorStore.getState().setDocument(fresh, 0);

    expect(useEditorStore.getState().document).toBe(fresh);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  // C6: `lastSavedAt` lives on this module-level singleton store, so
  // without resetting it here, opening invitation B (EditorLayout mounting
  // fresh, calling setDocument once) right after editing invitation A would
  // keep showing A's save time until B's own first save completes.
  it("clears lastSavedAt — opening a different invitation must not show a previous one's stale save time", () => {
    useEditorStore.getState().markSaved(123456789);
    expect(useEditorStore.getState().lastSavedAt).toBe(123456789);

    useEditorStore.getState().setDocument(createDefaultDocument(), 0);

    expect(useEditorStore.getState().lastSavedAt).toBeNull();
  });

  it("seeds version from its second argument", () => {
    useEditorStore.getState().setDocument(createDefaultDocument(), 7);

    expect(useEditorStore.getState().version).toBe(7);
  });
});

describe("setVersion", () => {
  it("updates version without touching dirty", () => {
    useEditorStore.getState().updateTheme({ primary: "#000000" });
    expect(useEditorStore.getState().dirty).toBe(true);

    useEditorStore.getState().setVersion(5);

    expect(useEditorStore.getState().version).toBe(5);
    // setVersion is used right after a successful autosave, alongside
    // markSaved — it must not itself decide dirty's value one way or the
    // other, or it could clobber whatever markSaved (or a race with it)
    // just set.
    expect(useEditorStore.getState().dirty).toBe(true);
  });
});

describe("selectSection", () => {
  it("sets selectedSectionId", () => {
    const [firstId] = sectionIds();
    useEditorStore.getState().selectSection(firstId);
    expect(useEditorStore.getState().selectedSectionId).toBe(firstId);
  });

  it("clears selection when passed null", () => {
    const [firstId] = sectionIds();
    useEditorStore.getState().selectSection(firstId);
    useEditorStore.getState().selectSection(null);
    expect(useEditorStore.getState().selectedSectionId).toBeNull();
  });
});

describe("updateSectionProps", () => {
  it("shallow-merges the patch into only the target section's props, sets dirty", () => {
    const [coverId, coupleId] = sectionIds();
    const coupleBefore = findSection(coupleId);

    useEditorStore.getState().updateSectionProps(coverId, { tagline: "Trân trọng kính mời quý khách" });

    const coverAfter = findSection(coverId);
    if (coverAfter.type !== "cover") throw new Error("Fixture invalid: expected cover section");
    expect(coverAfter.props.tagline).toBe("Trân trọng kính mời quý khách");
    // Other props on the same section are untouched.
    expect(coverAfter.props.groomName).toBe("Minh Khang");
    // The other section is byte-for-byte untouched.
    expect(findSection(coupleId)).toEqual(coupleBefore);
    expect(useEditorStore.getState().dirty).toBe(true);
  });
});

describe("updateTheme", () => {
  it("shallow-merges the patch into document.theme and sets dirty", () => {
    useEditorStore.getState().updateTheme({ primary: "#123456" });
    const { document, dirty } = useEditorStore.getState();
    expect(document.theme.primary).toBe("#123456");
    expect(document.theme.secondary).toBe("#D9A3AC"); // untouched
    expect(dirty).toBe(true);
  });
});

describe("updateOpening", () => {
  it("shallow-merges the patch into document.opening and sets dirty", () => {
    useEditorStore.getState().updateOpening({ effect: "curtain" });
    const { document, dirty } = useEditorStore.getState();
    expect(document.opening.effect).toBe("curtain");
    expect(document.opening.particles).toBe("petals"); // untouched
    expect(dirty).toBe(true);
  });
});

describe("updateMusic", () => {
  it("shallow-merges the patch into document.music and sets dirty", () => {
    useEditorStore.getState().updateMusic({ trackId: "track-1" });
    const { document, dirty } = useEditorStore.getState();
    expect(document.music.trackId).toBe("track-1");
    expect(document.music.playAfterOpen).toBe(true); // untouched
    expect(dirty).toBe(true);
  });
});

describe("reorderSections", () => {
  it("moves the active section to the over section's index and renormalises order 0..n-1", () => {
    const ids = sectionIds(); // [cover, couple, events, album, gift, wishes, form]
    const [coverId, coupleId, eventsId] = ids;

    useEditorStore.getState().reorderSections(coverId, eventsId);

    const reordered = useEditorStore
      .getState()
      .document.sections.slice()
      .sort((a, b) => a.order - b.order);

    expect(reordered.map((s) => s.id)).toEqual([coupleId, eventsId, coverId, ...ids.slice(3)]);
    // order is contiguous 0..n-1 matching array position
    reordered.forEach((s, i) => expect(s.order).toBe(i));
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("is a no-op (aside from dirty) when either id is unknown", () => {
    const before = sectionIds();
    useEditorStore.getState().reorderSections("not-a-real-id", before[0]);
    expect(sectionIds()).toEqual(before);
  });
});

describe("toggleSectionVisible", () => {
  it("flips visible and sets dirty", () => {
    const [firstId] = sectionIds();
    expect(findSection(firstId).visible).toBe(true);

    useEditorStore.getState().toggleSectionVisible(firstId);
    expect(findSection(firstId).visible).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(true);

    useEditorStore.getState().toggleSectionVisible(firstId);
    expect(findSection(firstId).visible).toBe(true);
  });
});

describe("addSection", () => {
  it("appends a new section with order = current max + 1 and selects it", () => {
    const before = useEditorStore.getState().document.sections;
    const maxOrderBefore = Math.max(...before.map((s) => s.order));

    useEditorStore.getState().addSection("text");

    const after = useEditorStore.getState().document.sections;
    expect(after).toHaveLength(before.length + 1);
    const added = after.find((s) => !before.some((b) => b.id === s.id));
    if (!added) throw new Error("addSection did not append a new section");
    expect(added.type).toBe("text");
    expect(added.order).toBe(maxOrderBefore + 1);
    expect(useEditorStore.getState().selectedSectionId).toBe(added.id);
    expect(useEditorStore.getState().dirty).toBe(true);
  });
});

describe("removeSection", () => {
  it("removes the section and sets dirty", () => {
    const [firstId] = sectionIds();
    const before = useEditorStore.getState().document.sections.length;

    useEditorStore.getState().removeSection(firstId);

    expect(useEditorStore.getState().document.sections).toHaveLength(before - 1);
    expect(useEditorStore.getState().document.sections.some((s) => s.id === firstId)).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it("clears selectedSectionId when it pointed at the removed section", () => {
    const [firstId] = sectionIds();
    useEditorStore.getState().selectSection(firstId);

    useEditorStore.getState().removeSection(firstId);

    expect(useEditorStore.getState().selectedSectionId).toBeNull();
  });

  it("leaves selectedSectionId untouched when a different section is removed", () => {
    const [firstId, secondId] = sectionIds();
    useEditorStore.getState().selectSection(firstId);

    useEditorStore.getState().removeSection(secondId);

    expect(useEditorStore.getState().selectedSectionId).toBe(firstId);
  });
});

describe("markSaved", () => {
  it("sets dirty false and records lastSavedAt", () => {
    useEditorStore.getState().updateTheme({ primary: "#000000" });
    expect(useEditorStore.getState().dirty).toBe(true);

    useEditorStore.getState().markSaved(123456789);

    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().lastSavedAt).toBe(123456789);
  });
});

describe("setSaving", () => {
  it("sets the saving flag", () => {
    useEditorStore.getState().setSaving(true);
    expect(useEditorStore.getState().saving).toBe(true);
    useEditorStore.getState().setSaving(false);
    expect(useEditorStore.getState().saving).toBe(false);
  });
});

describe("schema invariant", () => {
  it("never produces a document that fails InvitationDocumentSchema.parse, across a sequence of mutations", () => {
    const ids = sectionIds();
    const [coverId, coupleId, , , giftId] = ids;

    const store = useEditorStore.getState();
    store.addSection("text");
    const newTextId = useEditorStore.getState().selectedSectionId;
    if (!newTextId) throw new Error("addSection should have selected the new section");

    store.reorderSections(newTextId, coverId);
    store.toggleSectionVisible(coupleId);
    store.updateSectionProps(coverId, { tagline: "Mới" });
    store.removeSection(giftId);

    const finalDoc = useEditorStore.getState().document;
    expect(() => InvitationDocumentSchema.parse(finalDoc)).not.toThrow();
    expect(finalDoc.sections).toHaveLength(ids.length + 1 - 1);
  });
});
