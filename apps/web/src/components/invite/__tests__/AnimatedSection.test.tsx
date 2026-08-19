// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionRenderer } from "../SectionRenderer";
import { AnimatedSection } from "../AnimatedSection";
import { createDefaultDocument, createSection } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";

afterEach(() => {
  vi.clearAllMocks();
});

describe("AnimatedSection", () => {
  describe("preset: none", () => {
    it("renders children with no wrapper element", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "none", durationMs: 500 }}>
          <div data-testid="child">Content</div>
        </AnimatedSection>,
      );

      // Should render the child directly, no motion.div wrapping it
      expect(container.querySelector('[data-testid="child"]')).toBeInTheDocument();
      expect(container.querySelector('[data-animate]')).not.toBeInTheDocument();
    });
  });

  describe("preset: fade", () => {
    it("renders a motion wrapper with data-animate='fade'", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "fade", durationMs: 800 }}>
          <div data-testid="child">Content</div>
        </AnimatedSection>,
      );

      const wrapper = container.querySelector('[data-animate="fade"]');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.querySelector('[data-testid="child"]')).toBeInTheDocument();
    });
  });

  describe("preset: slide-up", () => {
    it("renders a motion wrapper with data-animate='slide-up'", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "slide-up", durationMs: 1000 }}>
          <div data-testid="child">Content</div>
        </AnimatedSection>,
      );

      const wrapper = container.querySelector('[data-animate="slide-up"]');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.querySelector('[data-testid="child"]')).toBeInTheDocument();
    });
  });

  describe("preset: zoom", () => {
    it("renders a motion wrapper with data-animate='zoom'", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "zoom", durationMs: 600 }}>
          <div data-testid="child">Content</div>
        </AnimatedSection>,
      );

      const wrapper = container.querySelector('[data-animate="zoom"]');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.querySelector('[data-testid="child"]')).toBeInTheDocument();
    });
  });

  describe("null children", () => {
    it("returns null when children is null (no empty wrapper in DOM)", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "fade", durationMs: 500 }}>
          {null}
        </AnimatedSection>,
      );

      // No wrapper should be created
      expect(container.querySelector('[data-animate]')).not.toBeInTheDocument();
      // Check there are no motion divs
      expect(container.innerHTML.trim()).toBe("");
    });

    it("returns null when children is false", () => {
      const { container } = render(
        <AnimatedSection animation={{ preset: "fade", durationMs: 500 }}>
          {false}
        </AnimatedSection>,
      );

      expect(container.querySelector('[data-animate]')).not.toBeInTheDocument();
      expect(container.innerHTML.trim()).toBe("");
    });
  });

  // `prefers-reduced-motion` behavior is covered in
  // `AnimatedSection.reduced-motion.test.tsx`, a dedicated file — framer-motion's
  // `useReducedMotion()` caches the `matchMedia` result once per module
  // instance, so the mock must be installed before anything in the module
  // renders, in a file vitest gives a fresh module registry (see that file's
  // top comment for the full rationale, mirrored from
  // `OpeningGate.reduced-motion.test.tsx` / `ParticlesOverlay.reduced-motion.test.tsx`).

  describe("animation duration", () => {
    it("exposes duration via data-duration attribute", () => {
      const durations = [100, 500, 1000, 3000];

      for (const durationMs of durations) {
        const { container } = render(
          <AnimatedSection animation={{ preset: "fade", durationMs }}>
            <div>Content</div>
          </AnimatedSection>,
        );

        // Assert the duration is passed through to the data attribute
        const wrapper = container.querySelector('[data-animate="fade"]');
        expect(wrapper).toBeInTheDocument();
        expect(wrapper).toHaveAttribute("data-duration", String(durationMs));
      }
    });
  });

  describe("empty wrapper behavior (null-rendering sections)", () => {
    it("collapses the AnimatedSection wrapper around a section that renders null", () => {
      // Exercised through the real SectionRenderer path (not AnimatedSection
      // in isolation): SectionRenderer always passes a truthy React element
      // as `children` — `<Component section={section} />` — even when that
      // component's *output* is null, so AnimatedSection's own
      // `if (!children) return null` early-return never fires for this case.
      // The two-section document below has no `album`/`gift` sections (whose
      // "empty" rendering depends on array-length props), keeping the
      // wrapper count deterministic: exactly one wrapper per section, one of
      // which (`video`, Phase 2's always-null placeholder) is expected to be
      // DOM-empty.
      const document = createDefaultDocument();
      const cover = document.sections.find((s) => s.type === "cover");
      if (!cover) throw new Error("fixture missing cover section");

      const video = createSection("video");
      // createSection defaults to visible:true, animation: {preset:"fade",
      // durationMs:600} — a non-"none" preset, same as `cover`'s — so both
      // sections take the motion.div branch in AnimatedSection.
      video.order = cover.order + 1;

      const { container } = render(
        <SectionRenderer document={{ ...document, sections: [cover, video] }} />,
      );

      const wrappers = Array.from(container.querySelectorAll("[data-animate]"));
      expect(wrappers).toHaveLength(2);
      const [coverWrapper, videoWrapper] = wrappers;

      // Sanity check on the positional assumption: cover (order 0) sorts
      // before video (order 1) and actually renders content.
      expect(coverWrapper.childNodes.length).toBeGreaterThan(0);

      // VideoSection renders null, so its wrapper has zero DOM children —
      // it must collapse out of layout via `empty:hidden` rather than
      // leaving a phantom, height-occupying node behind.
      expect(videoWrapper.childNodes.length).toBe(0);
      expect(videoWrapper).toHaveClass("empty:hidden");
    });
  });

  // Task 5 (renderer-direction / both-directions rule): the editor's new
  // `updateSectionAnimation` store action is only worth exposing if a
  // written preset actually reaches the rendered invitation — this proves
  // the full pipeline (store write -> document -> SectionRenderer ->
  // AnimatedSection DOM), rather than just unit-testing AnimatedSection in
  // isolation (already covered by the `preset: slide-up` describe block
  // above) or the store action in isolation (editor-store.test.ts).
  describe("store-fed preset (Task 5 renderer direction)", () => {
    it("a preset written via updateSectionAnimation renders data-animate=\"slide-up\" through SectionRenderer", () => {
      const document = createDefaultDocument();
      useEditorStore.setState({
        document,
        selectedSectionId: null,
        dirty: false,
        saving: false,
        lastSavedAt: null,
      });

      const cover = document.sections.find((s) => s.type === "cover");
      if (!cover) throw new Error("fixture missing cover section");
      expect(cover.animation.preset).toBe("fade"); // createSection's default, pre-write

      useEditorStore.getState().updateSectionAnimation(cover.id, { preset: "slide-up", durationMs: 1200 });
      const written = useEditorStore.getState().document;

      const { container } = render(<SectionRenderer document={written} />);

      const wrapper = container.querySelector('[data-animate="slide-up"]');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveAttribute("data-duration", "1200");
    });
  });
});
