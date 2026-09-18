// @vitest-environment jsdom
import { createSection } from "@hpwd/schema";
import type { Section } from "@hpwd/schema";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoupleSection } from "../sections/CoupleSection";
import { CoverSection } from "../sections/CoverSection";
import { StorySection } from "../sections/StorySection";
import { InviteContext } from "../InviteContext";

/**
 * `/api/uploads` stores every photo at up to 1600px wide. Three sections
 * used to render that straight into a bare `<img>`:
 *
 *   CoverSection    224x224 circle
 *   CoupleSection   128x128 circle, twice per invitation
 *   StorySection    ~430x160 strip, once per story entry
 *
 * Measured against a real 1600x1600 photo (840 kB) served through this
 * app's own optimizer: 1,682 bytes at w=384, which is what a 128px circle
 * needs on a 3x phone. The bare `<img>` downloaded all 840 kB for it.
 *
 * These tests pin the mechanism rather than the byte count: the src has to
 * go through the optimizer, and it has to carry a `sizes` that describes
 * the real box — without `sizes` the browser assumes 100vw and picks a
 * source far larger than the element, which is most of the waste back.
 */
const PHOTO = "http://localhost:9000/hpwd/seed/photo.webp";

function renderWithContext(ui: React.ReactElement) {
  return render(
    <InviteContext.Provider value={{ guestName: null, showGuestName: false, isPreview: false, slug: "demo" }}>
      {ui}
    </InviteContext.Provider>,
  );
}

function imagesOf(container: HTMLElement) {
  return [...container.querySelectorAll("img")];
}

describe("photos render at the size they are displayed, not at upload resolution", () => {
  it("CoverSection's 224px circle goes through the optimizer with a 224px hint", () => {
    const base = createSection("cover") as Extract<Section, { type: "cover" }>;
    const section = { ...base, props: { ...base.props, coverImage: PHOTO } };

    const { container } = renderWithContext(<CoverSection section={section} />);
    const [img] = imagesOf(container);

    expect(img?.getAttribute("src")).toContain("/_next/image");
    expect(img?.getAttribute("sizes")).toBe("224px");
  });

  it("CoupleSection's two 128px circles each go through the optimizer with a 128px hint", () => {
    const base = createSection("couple") as Extract<Section, { type: "couple" }>;
    const section = {
      ...base,
      props: {
        ...base.props,
        bride: { ...base.props.bride, name: "Thu Hà", photo: PHOTO },
        groom: { ...base.props.groom, name: "Minh Khang", photo: PHOTO },
      },
    };

    const { container } = renderWithContext(<CoupleSection section={section} />);
    const imgs = imagesOf(container);

    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toContain("/_next/image");
      expect(img.getAttribute("sizes")).toBe("128px");
    }
  });

  it("StorySection's strip goes through the optimizer with the invitation column width", () => {
    const base = createSection("story") as Extract<Section, { type: "story" }>;
    const section = {
      ...base,
      props: { ...base.props, items: [{ ...base.props.items[0]!, title: "Gặp nhau", image: PHOTO }] },
    };

    const { container } = renderWithContext(<StorySection section={section} />);
    const [img] = imagesOf(container);

    expect(img?.getAttribute("src")).toContain("/_next/image");
    expect(img?.getAttribute("sizes")).toBe("(max-width: 430px) 100vw, 430px");
  });

  // The placeholders must survive: a couple who has not uploaded a photo yet
  // should still see the grey circle, not a broken image.
  it("renders no <img> at all when there is no photo", () => {
    const base = createSection("couple") as Extract<Section, { type: "couple" }>;
    const { container } = renderWithContext(<CoupleSection section={base} />);

    expect(imagesOf(container)).toHaveLength(0);
  });
});
