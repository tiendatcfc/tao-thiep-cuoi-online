// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvitePage } from "../InvitePage";

const settings = { showBadge: true };

describe("InvitePage / SectionRenderer", () => {
  it("renders the default document's groom and bride names", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    // Both the cover and couple sections mention the groom's name in the
    // default document, so this scopes to the cover section specifically
    // rather than asserting on `screen` (which would be ambiguous).
    const cover = container.querySelector('[data-section="cover"]');
    if (!cover) throw new Error("cover section did not render");
    expect(within(cover as HTMLElement).getByText(/Ngọc Hải/)).toBeInTheDocument();
    expect(within(cover as HTMLElement).getByText(/Hồng Thắm/)).toBeInTheDocument();
  });

  it("does not render a section whose visible flag is false", () => {
    const document = createDefaultDocument();
    const events = document.sections.find((s) => s.type === "events");
    if (!events) throw new Error("fixture missing events section");
    events.visible = false;

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    expect(container.querySelector('[data-section="events"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Lễ Vu Quy")).not.toBeInTheDocument();
  });

  it("renders sections sorted by order, not by array position", () => {
    const document = createDefaultDocument();
    const cover = document.sections.find((s) => s.type === "cover");
    const couple = document.sections.find((s) => s.type === "couple");
    if (!cover || !couple) throw new Error("fixture missing cover/couple sections");

    // Swap the `order` values (array position is left untouched: cover is
    // still sections[0], couple is still sections[1]) so this only passes if
    // the renderer actually sorts by `order` instead of trusting array order.
    const coverOrder = cover.order;
    cover.order = couple.order;
    couple.order = coverOrder;

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const renderedTypes = Array.from(container.querySelectorAll("[data-section]")).map((el) =>
      el.getAttribute("data-section"),
    );
    const coverIndex = renderedTypes.indexOf("cover");
    const coupleIndex = renderedTypes.indexOf("couple");

    expect(coupleIndex).toBeGreaterThanOrEqual(0);
    expect(coverIndex).toBeGreaterThanOrEqual(0);
    expect(coupleIndex).toBeLessThan(coverIndex);
  });

  it("shows a 'Kính mời' line with the guest name when one is provided", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage
        document={document}
        guestName="Nguyễn Văn An"
        settings={settings}
        isPreview={false}
      />,
    );

    // Scoped to the cover section: the default document's opening effect
    // ('envelope') also shows its own "Kính mời: {guestName}" line on the
    // still-closed envelope overlay, so an unscoped query would match twice.
    const cover = container.querySelector('[data-section="cover"]');
    if (!cover) throw new Error("cover section did not render");
    expect(within(cover as HTMLElement).getByText(/Kính mời/)).toBeInTheDocument();
    expect(within(cover as HTMLElement).getByText(/Nguyễn Văn An/)).toBeInTheDocument();
  });

  it("omits the 'Kính mời' line when there is no guest name", () => {
    const document = createDefaultDocument();

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const cover = container.querySelector('[data-section="cover"]');
    if (!cover) throw new Error("cover section did not render");
    expect(within(cover as HTMLElement).queryByText(/Kính mời/)).not.toBeInTheDocument();
  });

  it("shows the HPWD badge only when settings.showBadge is true", () => {
    const document = createDefaultDocument();

    const { rerender } = render(
      <InvitePage document={document} guestName={null} settings={{ showBadge: true }} isPreview={false} />,
    );
    expect(screen.getByText(/Tạo miễn phí tại HPWD/)).toBeInTheDocument();

    rerender(
      <InvitePage document={document} guestName={null} settings={{ showBadge: false }} isPreview={false} />,
    );
    expect(screen.queryByText(/Tạo miễn phí tại HPWD/)).not.toBeInTheDocument();
  });
});
