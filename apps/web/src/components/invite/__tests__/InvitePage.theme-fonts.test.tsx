// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fontFamilyStack } from "@/lib/fonts";
import { InvitePage } from "../InvitePage";

const settings = { showBadge: true };

describe("InvitePage theme font CSS variables", () => {
  it("sets --font-heading/--font-body from theme.headingFont/bodyFont via fontFamilyStack, on the data-invite-root element", () => {
    const document = createDefaultDocument();
    document.theme.headingFont = "Dancing Script";
    document.theme.bodyFont = "Inter";

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const root = container.querySelector("[data-invite-root]") as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.getPropertyValue("--font-heading")).toBe(fontFamilyStack("Dancing Script"));
    expect(root.style.getPropertyValue("--font-body")).toBe(fontFamilyStack("Inter"));
  });

  it("still renders a usable stack for an unrecognized font name instead of crashing", () => {
    const document = createDefaultDocument();
    document.theme.headingFont = "Some Legacy Font";

    const { container } = render(
      <InvitePage document={document} guestName={null} settings={settings} isPreview={false} />,
    );

    const root = container.querySelector("[data-invite-root]") as HTMLElement;
    expect(root.style.getPropertyValue("--font-heading")).toBe('"Some Legacy Font", sans-serif');
  });
});
