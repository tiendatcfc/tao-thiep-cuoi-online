// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageField } from "../ImageField";

/**
 * The "Xoá nền" control. The route and the worker have their own suites;
 * what is pinned here is the editor's half — that it asks with the URL it
 * actually holds, waits without blocking the couple, swaps the image only
 * on success, and never leaves them without a photo when it fails.
 */

const IMAGE_URL = "https://cdn.test/u/user-1/asset-1-800.webp";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderField(value = IMAGE_URL) {
  const onChange = vi.fn();
  render(<ImageField label="Ảnh bìa" value={value} onChange={onChange} />);
  return { onChange };
}

/** Queues the responses `fetch` returns, in order. */
function stubFetch(responses: { ok?: boolean; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({ ok: response.ok ?? true, json: async () => response.body });
  }
  // Anything beyond the queued responses keeps returning the last one, so a
  // poll loop does not fall off the end mid-test.
  const last = responses.at(-1);
  if (last) fetchMock.mockResolvedValue({ ok: last.ok ?? true, json: async () => last.body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ImageField — background removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the control only once there is a photo to work on", () => {
    renderField("");
    expect(screen.queryByRole("button", { name: "Xoá nền" })).toBeNull();

    cleanup();
    renderField();
    expect(screen.getByRole("button", { name: "Xoá nền" })).toBeInTheDocument();
  });

  it("asks for the cut-out using the URL the field currently holds", () => {
    // The document stores URLs, not asset ids — sending anything else would
    // make the button work only until the page is reloaded.
    const fetchMock = stubFetch([{ body: { assetId: "new-asset", status: "processing" } }]);
    renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/images/background-removal",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ url: IMAGE_URL }) }),
    );
  });

  it("swaps the image only when the cut-out is ready", async () => {
    const cutoutUrl = "https://cdn.test/u/user-1/new-asset-nobg.png";
    stubFetch([
      { body: { assetId: "new-asset", status: "processing" } },
      { body: { status: "processing", url: null } },
      { body: { status: "ready", url: cutoutUrl } },
    ]);
    const { onChange } = renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));

    // Still the original while the worker is running: a field that blanked
    // itself would look like the photo had been deleted.
    await waitFor(() => expect(screen.getByRole("button", { name: "Đang xoá nền…" })).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(cutoutUrl), { timeout: 8000 });
  }, 12000);

  it("shows a Vietnamese message and keeps the original when the job fails", async () => {
    stubFetch([
      { body: { assetId: "new-asset", status: "processing" } },
      { body: { status: "failed", url: null } },
    ]);
    const { onChange } = renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));

    await waitFor(() => expect(screen.getByText(/Ảnh gốc vẫn được giữ nguyên/)).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    // And the control is usable again rather than stuck on "Đang xoá nền…".
    expect(screen.getByRole("button", { name: "Xoá nền" })).toBeEnabled();
  });

  it("surfaces the server's own refusal instead of a generic one", async () => {
    stubFetch([{ ok: false, body: { error: "Ảnh chưa xử lý xong, vui lòng thử lại sau." } }]);
    const { onChange } = renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));

    await waitFor(() => expect(screen.getByText("Ảnh chưa xử lý xong, vui lòng thử lại sau.")).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the control while it is working, so two jobs cannot race", async () => {
    stubFetch([
      { body: { assetId: "new-asset", status: "processing" } },
      { body: { status: "processing", url: null } },
    ]);
    renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Đang xoá nền…" })).toBeDisabled());
  });

  it("stops polling when the field unmounts mid-job", async () => {
    // Switching to another section unmounts the whole panel tree. A poll
    // that kept running would write state on an unmounted component and
    // leak a timer per abandoned job.
    const fetchMock = stubFetch([
      { body: { assetId: "new-asset", status: "processing" } },
      { body: { status: "processing", url: null } },
    ]);
    renderField();

    fireEvent.click(screen.getByRole("button", { name: "Xoá nền" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    cleanup();
    const callsAtUnmount = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 2600));

    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount);
  }, 10000);
});
