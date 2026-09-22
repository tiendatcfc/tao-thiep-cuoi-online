// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestTable, type Guest } from "../GuestTable";

afterEach(cleanup);

const ORIGIN = "https://hpwd.example";
const SLUG = "minh-lan";

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    name: "Nguyễn Văn An",
    group: "Họ hàng nhà trai",
    token: "tok-1",
    viewedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("GuestTable", () => {
  it("hiện tên, nhóm và trạng thái 'Chưa xem' / 'Đã xem' theo viewedAt", () => {
    const guests = [
      guest({ id: "g1", name: "Nguyễn Văn An", group: "Họ hàng nhà trai", viewedAt: null }),
      guest({
        id: "g2",
        name: "Trần Thị Bình",
        group: "Bạn bè",
        token: "tok-2",
        viewedAt: "2026-08-05T10:00:00.000Z",
      }),
    ];

    render(
      <GuestTable invitationId="inv-1" slug={SLUG} status="published" initialGuests={guests} origin={ORIGIN} />,
    );

    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.getByText("Họ hàng nhà trai")).toBeInTheDocument();
    expect(screen.getByText("Trần Thị Bình")).toBeInTheDocument();
    expect(screen.getByText("Bạn bè")).toBeInTheDocument();
    expect(screen.getByText("Chưa xem")).toBeInTheDocument();
    expect(screen.getByText("Đã xem")).toBeInTheDocument();
    expect(screen.getByText(/^2 khách/)).toBeInTheDocument();
    expect(screen.getByText(/1 đã xem thiệp/)).toBeInTheDocument();
  });

  it("mọi ô đều có nhãn cột, để bố cục xếp chồng trên điện thoại không hiện giá trị trần trụi", () => {
    // Dưới 640px, globals.css bỏ hàng tiêu đề đi và mỗi ô tự in nhãn của
    // nó từ `data-label`. Thêm một cột mới mà quên `data-label` thì trên
    // máy tính vẫn đẹp, còn trên điện thoại khách hàng thấy một giá trị
    // không biết là gì — đúng kiểu lỗi chỉ lộ ra ở khổ màn hình khác.
    const { container } = render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest()]}
        origin={ORIGIN}
      />,
    );

    const table = container.querySelector("[data-stacked-table]");
    expect(table).not.toBeNull();

    const headers = [...table!.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    const labels = [...table!.querySelectorAll("tbody td")].map((td) => td.getAttribute("data-label"));

    expect(labels).not.toContain(null);
    expect(labels).toEqual(headers);
  });

  it("giữ ngữ nghĩa bảng bằng role tường minh, vì bố cục xếp chồng đổi display", () => {
    // `display: block` xoá sạch ngữ nghĩa bảng ngầm định của thẻ
    // <table>/<tr>/<td>. Các role viết tay là thứ duy nhất còn lại cho
    // trình đọc màn hình ở khổ điện thoại.
    const { container } = render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest()]}
        origin={ORIGIN}
      />,
    );

    expect(container.querySelector('table[role="table"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr[role="row"]')).toHaveLength(1);
    expect(container.querySelectorAll('tbody td[role="cell"]')).toHaveLength(4);
  });

  it("nút 'Sao chép link' gọi clipboard với đúng link cá nhân hoá", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ token: "tok-1" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sao chép link/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/i/${SLUG}?g=tok-1`));
  });

  it("xoá khách hỏi xác nhận rồi gọi DELETE và bỏ dòng khỏi bảng", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(screen.queryByText("Nguyễn Văn An")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/inv-1/guests/g1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("không xoá khi huỷ hộp thoại xác nhận", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
  });

  it("khôi phục dòng khi DELETE thất bại (rollback)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    await waitFor(() => expect(screen.getByText(/Không thể xoá khách/)).toBeInTheDocument());
    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
  });

  it("hiện trạng thái rỗng bằng tiếng Việt khi chưa có khách nào", () => {
    render(
      <GuestTable invitationId="inv-1" slug={SLUG} status="published" initialGuests={[]} origin={ORIGIN} />,
    );

    expect(screen.getByText(/Chưa có khách mời nào/)).toBeInTheDocument();
    expect(screen.getByText(/^0 khách/)).toBeInTheDocument();
  });

  it("hiện cảnh báo tiếng Việt khi thiệp chưa xuất bản, nhưng vẫn cho sao chép link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="draft"
        initialGuests={[guest()]}
        origin={ORIGIN}
      />,
    );

    expect(screen.getByText(/chỉ hoạt động sau khi.*xuất bản/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sao chép link/ })).not.toBeDisabled();
  });

  it("thêm khách mới qua form nhanh và chèn lên đầu bảng", async () => {
    const newGuest = guest({ id: "g-new", name: "Lê Văn Cường", group: "Bạn thân", token: "tok-new" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ created: 1, guests: [newGuest] }),
    });

    render(
      <GuestTable invitationId="inv-1" slug={SLUG} status="published" initialGuests={[]} origin={ORIGIN} />,
    );

    fireEvent.change(screen.getByLabelText("Tên khách"), { target: { value: "Lê Văn Cường" } });
    fireEvent.change(screen.getByLabelText(/Nhóm/), { target: { value: "Bạn thân" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm khách" }));

    await waitFor(() => expect(screen.getByText("Lê Văn Cường")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/inv-1/guests",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ guests: [{ name: "Lê Văn Cường", group: "Bạn thân" }] }),
      }),
    );
  });

  it("sửa tên/nhóm khách qua form inline rồi PATCH, không đổi token", async () => {
    const updated = guest({ id: "g1", name: "Nguyễn Văn An (đã sửa)", group: "Bạn thân", token: "tok-1" });
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ guest: updated }) });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An", group: "Bạn bè" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    fireEvent.change(screen.getByDisplayValue("Nguyễn Văn An"), {
      target: { value: "Nguyễn Văn An (đã sửa)" },
    });
    fireEvent.change(screen.getByDisplayValue("Bạn bè"), { target: { value: "Bạn thân" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(screen.getByText("Nguyễn Văn An (đã sửa)")).toBeInTheDocument());
    expect(screen.getByText("Bạn thân")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/inv-1/guests/g1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Nguyễn Văn An (đã sửa)", group: "Bạn thân" }),
      }),
    );
  });

  it("huỷ sửa không gọi PATCH và giữ nguyên dữ liệu cũ", async () => {
    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An" })]}
        origin={ORIGIN}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    fireEvent.change(screen.getByDisplayValue("Nguyễn Văn An"), { target: { value: "Bị đổi" } });
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.queryByText("Bị đổi")).not.toBeInTheDocument();
  });

  it("hiện lỗi tiếng Việt của API khi sửa khách thất bại", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Tên khách không được để trống." }),
    });

    render(
      <GuestTable
        invitationId="inv-1"
        slug={SLUG}
        status="published"
        initialGuests={[guest({ id: "g1", name: "Nguyễn Văn An" })]}
        origin={ORIGIN}
      />,
    );

    // Note: the "Lưu" button is disabled client-side for a genuinely empty
    // name (see the `disabled` prop below), so this exercises the case
    // where the client considers the input valid but the server's own
    // `normalizeGuestName` still rejects it (e.g. control-character-only
    // input) — the Vietnamese error the (mocked) API returns must still
    // reach the guest, not get swallowed.
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    fireEvent.change(screen.getByDisplayValue("Nguyễn Văn An"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(screen.getByText("Tên khách không được để trống.")).toBeInTheDocument());
    // Still in edit mode with the old data intact, not silently reverted.
    expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
  });

  it("hiện lỗi tiếng Việt của API khi thêm khách thất bại (400)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Tên khách không được để trống." }),
    });

    render(
      <GuestTable invitationId="inv-1" slug={SLUG} status="published" initialGuests={[]} origin={ORIGIN} />,
    );

    fireEvent.change(screen.getByLabelText("Tên khách"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Tên khách"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm khách" }));

    await waitFor(() => expect(screen.getByText("Tên khách không được để trống.")).toBeInTheDocument());
  });
});

/**
 * Same hydration-safety proof as `GiftSection.test.tsx` (see its own
 * docstring for the full rationale): `navigator.clipboard` must never be
 * read during render, only inside `useEffect`, otherwise a real Node SSR
 * environment (no `navigator.clipboard`) and a real browser client (which
 * has it) disagree on whether to render the copy button or the manual-copy
 * hint — a genuine hydration mismatch React can't reconcile. Reused here for
 * `GuestTable`'s own copy button.
 */
describe("GuestTable SSR/hydration parity (clipboard capability)", () => {
  const originalClipboard = navigator.clipboard;
  const guests = [guest({ id: "g1", token: "tok-1" })];

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
  });

  function table() {
    return (
      <GuestTable invitationId="inv-1" slug={SLUG} status="published" initialGuests={guests} origin={ORIGIN} />
    );
  }

  it("server-rendered markup always shows the copy button, never the manual hint", () => {
    const html = renderToStaticMarkup(table());

    expect(html).toContain("Sao chép link");
    expect(html).not.toContain("Vui lòng bôi đen");
  });

  it("the client's own pre-effect (first) render matches SSR regardless of the real clipboard capability", () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() }, configurable: true });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = createRoot(container);
    try {
      flushSync(() => {
        root.render(table());
      });

      expect(container.textContent).toContain("Sao chép link");
      expect(container.textContent).not.toContain("Vui lòng bôi đen");
    } finally {
      root.unmount();
      container.remove();
      consoleError.mockRestore();
    }
  });

  it("hydrates with no mismatch, then swaps to the manual-copy hint once effects confirm clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const html = renderToStaticMarkup(table());
    expect(html).toContain("Sao chép link");

    // The guest's real client also lacks it (e.g. an in-app WebView).
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    try {
      await act(async () => {
        hydrateRoot(container, table(), {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors).toEqual([]);
      expect(container.textContent).toContain("Vui lòng bôi đen");
      expect(container.textContent).not.toContain("Sao chép link");
    } finally {
      container.remove();
    }
  });

  it("hydrates cleanly and keeps the button when the real client clipboard turns out to be available", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const html = renderToStaticMarkup(table());

    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn() }, configurable: true });

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverableErrors: unknown[] = [];
    try {
      await act(async () => {
        hydrateRoot(container, table(), {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors).toEqual([]);
      expect(container.textContent).toContain("Sao chép link");
      expect(container.textContent).not.toContain("Vui lòng bôi đen");
    } finally {
      container.remove();
    }
  });
});
