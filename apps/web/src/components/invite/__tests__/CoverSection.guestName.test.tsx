// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createDefaultDocument } from "@hpwd/schema";
import { InviteContext } from "../InviteContext";
import { CoverSection } from "../sections/CoverSection";

afterEach(cleanup);

function renderCover(showGuestName: boolean) {
  const cover = createDefaultDocument().sections.find((s) => s.type === "cover")!;
  return render(
    <InviteContext.Provider
      value={{ guestName: "Nguyễn Văn An", showGuestName, isPreview: false, slug: "demo" }}
    >
      <CoverSection section={cover as Extract<typeof cover, { type: "cover" }>} />
    </InviteContext.Provider>,
  );
}

describe("CoverSection và opening.showGuestName", () => {
  it("hiện tên khách khi showGuestName bật", () => {
    renderCover(true);
    expect(screen.getByText(/Kính mời: Nguyễn Văn An/)).toBeTruthy();
  });
  it("KHÔNG hiện tên khách khi showGuestName tắt", () => {
    renderCover(false);
    expect(screen.queryByText(/Kính mời/)).toBeNull();
  });
});
