// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestImportDialog } from "../GuestImportDialog";

const CSV = "Tên,Nhóm\nNguyễn Văn An,Nhà trai\nTrần Thị Bình,Nhà gái\n";

function renderDialog(overrides: Partial<Parameters<typeof GuestImportDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const utils = render(
    <GuestImportDialog
      invitationId="inv-1"
      open
      onClose={onClose}
      onImported={onImported}
      {...overrides}
    />,
  );
  return { ...utils, onClose, onImported };
}

/** Drives the visually-hidden input the way the real file picker does. */
async function pickFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText(/Sẽ nhập/)).toBeInTheDocument());
}

describe("GuestImportDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = renderDialog({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The file input is `sr-only`, so if it stayed in the tab order a keyboard
   * user would hit an invisible stop before reaching the visible "Chọn file"
   * button. Regressing this is silent — nothing looks wrong on screen.
   */
  it("keeps the visually-hidden file input out of the tab order", () => {
    const { container } = renderDialog();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    expect(input).not.toBeNull();
    expect(input.tabIndex).toBe(-1);
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Chọn file" })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const { onClose } = renderDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the parsed preview and the file name before anything is sent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = renderDialog();

    await pickFile(container, new File([CSV], "khach.csv", { type: "text/csv" }));

    expect(screen.getByText("khach.csv")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn An")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nhập 2 khách" })).toBeEnabled();
    // Nothing leaves the browser until the owner confirms.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the parsed rows and hands the created guests back", async () => {
    const created = [{ id: "g1", name: "Nguyễn Văn An", group: "Nhà trai", token: "t1", viewedAt: null, createdAt: "x" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ created: 1, guests: created }), { status: 201 }),
    );
    const { container, onImported, onClose } = renderDialog();

    await pickFile(container, new File([CSV], "khach.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 khách" }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(created));
    expect(onClose).toHaveBeenCalled();

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/invitations/inv-1/guests");
    expect(JSON.parse(String(init.body))).toEqual({
      guests: [
        { name: "Nguyễn Văn An", group: "Nhà trai" },
        { name: "Trần Thị Bình", group: "Nhà gái" },
      ],
    });
  });

  it("surfaces the server's own error message and keeps the dialog open", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Danh sách khách không hợp lệ." }), { status: 400 }),
    );
    const { container, onClose, onImported } = renderDialog();

    await pickFile(container, new File([CSV], "khach.csv", { type: "text/csv" }));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 khách" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Danh sách khách không hợp lệ."),
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the parser's warning and leaves the import button disabled when nothing is usable", async () => {
    const { container } = renderDialog();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "khach.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });

    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText(/Chỉ hỗ trợ file CSV/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Nhập khách" })).toBeDisabled();
  });
});
