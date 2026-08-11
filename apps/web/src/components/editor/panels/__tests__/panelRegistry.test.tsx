// @vitest-environment jsdom
import { createDefaultDocument, createSection, SECTION_TYPES } from "@hpwd/schema";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { panelRegistry } from "../index";

beforeEach(() => {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("panelRegistry", () => {
  it("has exactly one entry per SECTION_TYPES, no more and no fewer", () => {
    expect(Object.keys(panelRegistry).sort()).toEqual([...SECTION_TYPES].sort());
  });

  it.each(SECTION_TYPES)("renders a fresh '%s' section without throwing", (type) => {
    const section = createSection(type);
    useEditorStore.setState({ document: { ...createDefaultDocument(), sections: [section] } });
    const Panel = panelRegistry[type];
    expect(() => render(<Panel section={section as never} />)).not.toThrow();
  });
});
