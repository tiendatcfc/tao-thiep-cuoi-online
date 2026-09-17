// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { MAX_AUDIO_SIZE_BYTES } from "@/lib/audio";
import { MusicPanel } from "../MusicPanel";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function resetStore(musicOverrides: Partial<ReturnType<typeof createDefaultDocument>["music"]> = {}) {
  const document = createDefaultDocument();
  document.music = { ...document.music, ...musicOverrides };
  useEditorStore.setState({
    document,
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
}

function audioFile(name = "bai-hat.mp3", type = "audio/mpeg", size = 1024): File {
  const file = new File(["x"], name, { type });
  // `new File([...])` reports the real byte length; the size cases below need
  // a specific one without allocating 15MB of test data.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

async function selectUploadSource() {
  fireEvent.change(screen.getByLabelText("Nguồn nhạc"), { target: { value: "upload" } });
  await waitFor(() => expect(screen.getByRole("button", { name: /Chọn file nhạc/ })).toBeInTheDocument());
}

describe("MusicPanel — tải nhạc lên", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined) as unknown as HTMLMediaElement["play"];
    window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement["pause"];
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    resetStore({ source: null, url: null, trackId: null, assetId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("offers 'Tải lên' as its own source, separate from pasting a URL", async () => {
    render(<MusicPanel />);
    await selectUploadSource();

    // The two share `source: "upload"` in the document, so the panel must
    // still present them as distinct choices.
    expect(screen.queryByLabelText("Đường dẫn tệp nhạc")).not.toBeInTheDocument();
  });

  it("reopens an uploaded track on 'Tải lên', not on the URL field", () => {
    resetStore({ source: "upload", url: "http://storage/u/1/a.m4a", assetId: "asset-1" });

    render(<MusicPanel />);

    expect(screen.getByLabelText("Nguồn nhạc")).toHaveValue("upload");
  });

  it("reopens a pasted URL on 'Đường dẫn'", () => {
    resetStore({ source: "upload", url: "https://cdn.test/song.mp3", assetId: null });

    render(<MusicPanel />);

    expect(screen.getByLabelText("Nguồn nhạc")).toHaveValue("url");
  });

  it("uploads the chosen file, polls, and stores the finished track", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { assetId: "asset-9", status: "processing" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "processing", url: null }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "ready", url: "http://storage/u/1/asset-9.m4a" }));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/uploads/audio", expect.objectContaining({ method: "POST" })));
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      const music = useEditorStore.getState().document.music;
      expect(music.source).toBe("upload");
      expect(music.url).toBe("http://storage/u/1/asset-9.m4a");
      expect(music.assetId).toBe("asset-9");
      // A library track's id must not survive onto an uploaded one, or
      // MusicPlayer would resolve the wrong URL.
      expect(music.trackId).toBeNull();
    });
  });

  it("tells the couple when the worker could not process the file", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { assetId: "asset-bad", status: "processing" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "failed", url: null }));

    render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/thất bại/i));
    // Nothing must be written to the document on a failure.
    expect(useEditorStore.getState().document.music.url).toBeNull();
  });

  it("rejects a file over 15MB in the browser, without uploading it", async () => {
    render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile("big.mp3", "audio/mpeg", MAX_AUDIO_SIZE_BYTES + 1));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/15MB/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported format in the browser, without uploading it", async () => {
    render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile("song.wav", "audio/wav"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/MP3|M4A/));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's own Vietnamese message when the upload is refused", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: "Hệ thống xử lý nhạc đang bận, vui lòng thử lại sau." }),
    );

    render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/đang bận/));
  });

  it("stops polling once the panel unmounts", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { assetId: "asset-slow", status: "processing" }))
      .mockResolvedValue(jsonResponse(200, { status: "processing", url: null }));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const view = render(<MusicPanel />);
    await selectUploadSource();
    pickFile(audioFile());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(2500);

    const callsBeforeUnmount = fetchMock.mock.calls.length;
    view.unmount();
    await vi.advanceTimersByTimeAsync(20_000);

    // A timer left running would keep polling a dead component and log
    // React state-update-after-unmount warnings for two full minutes.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
