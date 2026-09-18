// @vitest-environment jsdom
import type { Section, WishesProps } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { WishesSection } from "../sections/WishesSection";

function wishesSection(props: Partial<WishesProps> = {}): Extract<Section, { type: "wishes" }> {
  const base = createSection("wishes") as Extract<Section, { type: "wishes" }>;
  return {
    ...base,
    props: {
      title: "Sổ lời chúc",
      description: "Gửi lời chúc phúc đến cô dâu chú rể",
      requireApproval: false,
      ...props,
    },
  };
}

function renderWithSlug(section: Extract<Section, { type: "wishes" }>, slug: string | null) {
  return render(
    <InviteContext.Provider value={{ guestName: null, showGuestName: true, isPreview: slug === null, slug }}>
      <WishesSection section={section} />
    </InviteContext.Provider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function fillAndSubmit(name: string, message: string) {
  fireEvent.change(screen.getByPlaceholderText("Nhập tên của bạn"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(/Gửi lời chúc phúc/), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi lời chúc" }));
}

describe("WishesSection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { wishes: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the title and description from props", () => {
    renderWithSlug(wishesSection(), "demo");

    expect(screen.getByText("Sổ lời chúc")).toBeInTheDocument();
    expect(screen.getByText("Gửi lời chúc phúc đến cô dâu chú rể")).toBeInTheDocument();
  });

  it("disables the form and shows a preview note when there is no slug (editor preview)", () => {
    renderWithSlug(wishesSection(), null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Xem trước — lời chúc sẽ hoạt động sau khi xuất bản")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhập tên của bạn")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gửi lời chúc" })).toBeDisabled();
  });

  it("fetches the wishes list from the public API on mount and renders it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        wishes: [{ id: "1", guestName: "An", message: "Chúc mừng!", createdAt: "2026-01-01T00:00:00.000Z" }],
        nextCursor: null,
      }),
    );

    renderWithSlug(wishesSection(), "demo");

    expect(await screen.findByText("An")).toBeInTheDocument();
    expect(screen.getByText("Chúc mừng!")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/invites/demo/wishes");
  });

  it("does not call fetch to submit when required fields are empty", async () => {
    renderWithSlug(wishesSection(), "demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Gửi lời chúc" }));

    // Only the initial GET happened — the browser's own required-field
    // validation blocked the submit event from ever firing.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on success: prepends the new wish, clears the form, and shows a Vietnamese confirmation", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(201, {
          wish: { id: "new-1", guestName: "Bé Na", message: "Chúc mừng nha", createdAt: "2026-01-02T00:00:00.000Z" },
        });
      }
      return jsonResponse(200, { wishes: [], nextCursor: null });
    });

    renderWithSlug(wishesSection(), "demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillAndSubmit("Bé Na", "Chúc mừng nha");

    expect(await screen.findByText("Cảm ơn bạn đã gửi lời chúc!")).toBeInTheDocument();
    expect(screen.getByText("Bé Na")).toBeInTheDocument();
    expect(screen.getByText("Chúc mừng nha")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhập tên của bạn")).toHaveValue("");
    expect(screen.getByPlaceholderText(/Gửi lời chúc phúc/)).toHaveValue("");
  });

  it("when requireApproval is on: shows the pending-approval message and does not add the wish to the list", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(201, {
          wish: { id: "new-1", guestName: "Bé Na", message: "Lời chúc chờ duyệt", createdAt: "2026-01-02T00:00:00.000Z" },
        });
      }
      return jsonResponse(200, { wishes: [], nextCursor: null });
    });

    renderWithSlug(wishesSection({ requireApproval: true }), "demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillAndSubmit("Bé Na", "Lời chúc chờ duyệt");

    expect(
      await screen.findByText("Cảm ơn bạn! Lời chúc sẽ hiển thị sau khi được duyệt."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lời chúc chờ duyệt")).not.toBeInTheDocument();
  });

  it("shows the rate-limit message on a 429 response", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(429, { error: "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút." });
      }
      return jsonResponse(200, { wishes: [], nextCursor: null });
    });

    renderWithSlug(wishesSection(), "demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillAndSubmit("G", "M");

    expect(
      await screen.findByText("Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút."),
    ).toBeInTheDocument();
  });

  it("shows the server's own message on a 400 response", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(400, { error: "Lời chúc tối đa 500 ký tự." });
      }
      return jsonResponse(200, { wishes: [], nextCursor: null });
    });

    renderWithSlug(wishesSection(), "demo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await fillAndSubmit("G", "M");

    expect(await screen.findByText("Lời chúc tối đa 500 ký tự.")).toBeInTheDocument();
  });

  it("'Xem thêm' loads the next cursor page and appends it to the list", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("cursor=")) {
        return jsonResponse(200, {
          wishes: [{ id: "2", guestName: "Page2", message: "hi2", createdAt: "2026-01-02T00:00:00.000Z" }],
          nextCursor: null,
        });
      }
      return jsonResponse(200, {
        wishes: [{ id: "1", guestName: "Page1", message: "hi1", createdAt: "2026-01-01T00:00:00.000Z" }],
        nextCursor: "1",
      });
    });

    renderWithSlug(wishesSection(), "demo");

    expect(await screen.findByText("Page1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));

    expect(await screen.findByText("Page2")).toBeInTheDocument();
    expect(screen.getByText("Page1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem thêm" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/invites/demo/wishes?cursor=1");
  });

  // The first page and the submit form both report their failures. "Xem
  // thêm" used to be the one control on this section that could fail in
  // total silence: the label went "Đang tải..." and straight back to "Xem
  // thêm" with no new wishes and no message, which reads as "there is
  // nothing more" rather than "that did not work". A guest has no way to
  // tell the two apart, so they stop pressing.
  it.each([
    ["the network drops", async () => { throw new TypeError("Failed to fetch"); }],
    ["the server answers 500", async () => jsonResponse(500, {})],
  ])("tells the guest when 'Xem thêm' fails because %s, and keeps the button so they can retry", async (_label, onCursor) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("cursor=")) return onCursor();
      return jsonResponse(200, {
        wishes: [{ id: "1", guestName: "Page1", message: "hi1", createdAt: "2026-01-01T00:00:00.000Z" }],
        nextCursor: "1",
      });
    });

    renderWithSlug(wishesSection(), "demo");
    expect(await screen.findByText("Page1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));

    expect(await screen.findByText("Có lỗi xảy ra, vui lòng thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem thêm" })).toBeEnabled();
  });

  // An `async` onClick handler whose body can reject is an unhandled
  // rejection, which in a browser surfaces to the guest's console (and to
  // any error reporter wired up later) as an uncaught error on a wedding
  // invitation page.
  it("does not leave the failed 'Xem thêm' fetch as an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("cursor=")) throw new TypeError("Failed to fetch");
        return jsonResponse(200, {
          wishes: [{ id: "1", guestName: "Page1", message: "hi1", createdAt: "2026-01-01T00:00:00.000Z" }],
          nextCursor: "1",
        });
      });

      renderWithSlug(wishesSection(), "demo");
      expect(await screen.findByText("Page1")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
      expect(await screen.findByText("Có lỗi xảy ra, vui lòng thử lại.")).toBeInTheDocument();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("clears a previous 'Xem thêm' error once a retry succeeds", async () => {
    let cursorCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("cursor=")) {
        cursorCalls += 1;
        if (cursorCalls === 1) throw new TypeError("Failed to fetch");
        return jsonResponse(200, {
          wishes: [{ id: "2", guestName: "Page2", message: "hi2", createdAt: "2026-01-02T00:00:00.000Z" }],
          nextCursor: null,
        });
      }
      return jsonResponse(200, {
        wishes: [{ id: "1", guestName: "Page1", message: "hi1", createdAt: "2026-01-01T00:00:00.000Z" }],
        nextCursor: "1",
      });
    });

    renderWithSlug(wishesSection(), "demo");
    expect(await screen.findByText("Page1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(await screen.findByText("Có lỗi xảy ra, vui lòng thử lại.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(await screen.findByText("Page2")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Có lỗi xảy ra, vui lòng thử lại.")).not.toBeInTheDocument(),
    );
  });
});
