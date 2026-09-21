// @vitest-environment jsdom
import { createSection, type Section } from "@hpwd/schema";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { panelRegistry } from "../index";

// Its own file, for the same reason AlbumSection.codeSplit.test.tsx is:
// the "not called yet" assertion only holds on the FIRST render of the
// module-level `dynamic()` value within a module registry. Once the lazy
// import resolves, later renders in the same file call through
// synchronously. Vitest gives each test file a fresh registry, so keeping
// this the only test here is what makes the assertion reliable rather than
// order-dependent.
const { tiptapSpy } = vi.hoisted(() => ({ tiptapSpy: vi.fn() }));
vi.mock("@tiptap/react", async () => {
  const actual = await vi.importActual<typeof import("@tiptap/react")>("@tiptap/react");
  return {
    ...actual,
    useEditor: (...args: unknown[]) => {
      tiptapSpy(...args);
      return null;
    },
  };
});

function textSection(): Extract<Section, { type: "text" }> {
  return createSection("text") as Extract<Section, { type: "text" }>;
}

/**
 * TipTap and the ProseMirror under it were 159 kB gzipped of the editor
 * route's first load — 47% of it — for a panel that only opens when a couple
 * adds a text section. `selectedSectionId` starts as `null`, so no panel
 * renders at all until they pick one.
 */
describe("TextPanel is code-split, so TipTap is not on the editor's first load", () => {
  it("does not reach TipTap synchronously when the text panel mounts", async () => {
    const Panel = panelRegistry.text;

    render(<Panel section={textSection()} />);

    // A static `import { TextPanel } from "./TextPanel"` would have pulled
    // TipTap into the registry module itself and called this in the same
    // tick as `render()`. `next/dynamic(..., { ssr: false })` renders the
    // loading state first and only calls through once the `import()`
    // resolves, which takes at least one microtask.
    expect(tiptapSpy).not.toHaveBeenCalled();

    // It still loads — this pins where the cost falls, not that it vanishes.
    await waitFor(() => expect(tiptapSpy).toHaveBeenCalled());
  });
});
