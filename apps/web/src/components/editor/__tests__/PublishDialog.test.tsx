// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { PublishDialog } from "../PublishDialog";

function documentWithCoverNames(groomName: string, brideName: string) {
  const doc = createDefaultDocument();
  const cover = doc.sections.find((s): s is Extract<typeof s, { type: "cover" }> => s.type === "cover");
  if (!cover) throw new Error("default document has no cover section");
  cover.props.groomName = groomName;
  cover.props.brideName = brideName;
  return doc;
}

function resetStore(document = createDefaultDocument()) {
  useEditorStore.setState({
    document,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetStore();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseProps = {
  invitationId: "inv-1",
  slug: "test-editor-abc123",
  initialShowBadge: true,
};

describe("PublishDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<PublishDialog {...baseProps} open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prefills the slug input from the cover section's groom/bride names", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    expect(screen.getByLabelText("Đường dẫn thiệp")).toHaveValue("minh-lan");
  });

  it("falls back to toSlug(slug) when the cover names are empty", () => {
    resetStore(documentWithCoverNames("", ""));
    render(<PublishDialog {...baseProps} slug="Đám Cưới Của Tôi" open onClose={vi.fn()} />);

    expect(screen.getByLabelText("Đường dẫn thiệp")).toHaveValue("dam-cuoi-cua-toi");
  });

  it("disables the submit button and shows a Vietnamese hint for an invalid slug", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    const input = screen.getByLabelText("Đường dẫn thiệp");
    fireEvent.change(input, { target: { value: "ab" } });

    expect(screen.getByRole("button", { name: "Xuất bản" })).toBeDisabled();
    expect(
      screen.getByText(/chỉ được chứa chữ thường không dấu, số và dấu gạch ngang/i),
    ).toBeInTheDocument();
  });

  it("enables the submit button for a valid slug", () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Xuất bản" })).not.toBeDisabled();
  });

  it("shows the conflict message and keeps the dialog open on a 409 response", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Đường dẫn này đã được sử dụng cho thiệp khác, vui lòng chọn đường dẫn khác." }),
    });
    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    await waitFor(() =>
      expect(
        screen.getByText("Đường dẫn này đã được sử dụng cho thiệp khác, vui lòng chọn đường dẫn khác."),
      ).toBeInTheDocument(),
    );
    // Still on the form (dialog stayed open) — the slug input is still there.
    expect(screen.getByLabelText("Đường dẫn thiệp")).toBeInTheDocument();
  });

  it("shows the live link and copy button after a successful publish, guarding a missing clipboard", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "minh-lan", publishedAt: new Date().toISOString() }),
    });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const onUncaughtError = vi.fn();
    window.addEventListener("error", onUncaughtError);

    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    const copyButton = await screen.findByRole("button", { name: "Sao chép liên kết" });
    expect(screen.getByRole("link", { name: "Xem thiệp" })).toHaveAttribute("href", "/i/minh-lan");

    fireEvent.click(copyButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUncaughtError).not.toHaveBeenCalled();

    window.removeEventListener("error", onUncaughtError);
  });

  it("copies the live link when the clipboard is available", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ slug: "minh-lan", publishedAt: new Date().toISOString() }),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản" }));

    const copyButton = await screen.findByRole("button", { name: "Sao chép liên kết" });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/i/minh-lan")));
    expect(await screen.findByText("Đã sao chép!")).toBeInTheDocument();
  });

  it("PATCHes settings alone when the badge toggle is flipped, without calling the publish route", async () => {
    resetStore(documentWithCoverNames("Minh", "Lan"));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ savedAt: Date.now() }) });

    render(<PublishDialog {...baseProps} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/inv-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ settings: { showBadge: false } }),
      }),
    );
  });
});
