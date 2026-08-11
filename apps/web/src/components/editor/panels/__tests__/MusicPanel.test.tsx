// @vitest-environment jsdom
import { createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { MusicPanel } from "../MusicPanel";

// jsdom doesn't implement HTMLMediaElement's playback methods for real
// (calling them throws "not implemented"), same as MusicPlayer.test.tsx.
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const TRACKS = [
  { id: "t1", title: "Bài hát A", artist: "Ca sĩ A", url: "https://cdn.test/a.mp3", duration: 180, category: "romantic" },
  { id: "t2", title: "Bài hát B", artist: "Ca sĩ B", url: "https://cdn.test/b.mp3", duration: 200, category: "romantic" },
];

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

describe("MusicPanel", () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn().mockResolvedValue(undefined);
    pauseSpy = vi.fn();
    window.HTMLMediaElement.prototype.play = playSpy as unknown as HTMLMediaElement["play"];
    window.HTMLMediaElement.prototype.pause = pauseSpy as unknown as HTMLMediaElement["pause"];
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tracks: TRACKS }));
    vi.stubGlobal("fetch", fetchMock);
    resetStore({ source: null, url: null, trackId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to 'Không có nhạc' and shows neither a URL field nor the library picker", () => {
    render(<MusicPanel />);
    expect(screen.getByLabelText("Nguồn nhạc")).toHaveValue("none");
    expect(screen.queryByLabelText("Đường dẫn tệp nhạc")).not.toBeInTheDocument();
    expect(screen.queryByText("Chọn bài hát")).not.toBeInTheDocument();
  });

  it("switching to 'Đường dẫn' reveals a URL field that maps to source: 'upload'", () => {
    render(<MusicPanel />);
    fireEvent.change(screen.getByLabelText("Nguồn nhạc"), { target: { value: "url" } });
    expect(useEditorStore.getState().document.music.source).toBe("upload");
    expect(screen.getByLabelText("Đường dẫn tệp nhạc")).toBeInTheDocument();
  });

  it("switching from 'Đường dẫn' to 'Thư viện' clears the stale url instead of leaving it playable under the wrong source", () => {
    resetStore({ source: "upload", url: "https://cdn.test/old-pasted-song.mp3", trackId: null });
    render(<MusicPanel />);

    fireEvent.change(screen.getByLabelText("Nguồn nhạc"), { target: { value: "library" } });

    const music = useEditorStore.getState().document.music;
    expect(music.source).toBe("library");
    expect(music.url).toBeNull();
  });

  it("switching to 'Thư viện' fetches /api/music and lists the tracks", async () => {
    render(<MusicPanel />);
    fireEvent.change(screen.getByLabelText("Nguồn nhạc"), { target: { value: "library" } });

    await waitFor(() => expect(screen.getByText("Bài hát A")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/music");
    expect(screen.getByText("Bài hát B")).toBeInTheDocument();
  });

  it("choosing a track sets trackId/url/source in the store", async () => {
    render(<MusicPanel />);
    fireEvent.change(screen.getByLabelText("Nguồn nhạc"), { target: { value: "library" } });
    await waitFor(() => expect(screen.getByText("Bài hát A")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole("button", { name: "Chọn" })[0]);

    const music = useEditorStore.getState().document.music;
    expect(music.source).toBe("library");
    expect(["t1", "t2"]).toContain(music.trackId);
  });

  it("playing a second preview track pauses the first (single shared <audio> element)", async () => {
    resetStore({ source: "library", url: null, trackId: null });
    render(<MusicPanel />);
    await waitFor(() => expect(screen.getByText("Bài hát A")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài hát A" }));
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Tạm dừng Bài hát A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài hát B" }));

    // pause() is called once to stop A before B starts playing.
    expect(pauseSpy).toHaveBeenCalled();
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Tạm dừng Bài hát B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nghe thử Bài hát A" })).toBeInTheDocument();
  });

  it("stops playback on unmount", async () => {
    resetStore({ source: "library", url: null, trackId: null });
    const { unmount } = render(<MusicPanel />);
    await waitFor(() => expect(screen.getByText("Bài hát A")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài hát A" }));
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    pauseSpy.mockClear();

    unmount();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it("toggles playAfterOpen", () => {
    render(<MusicPanel />);
    fireEvent.click(screen.getByRole("switch", { name: "Tự động phát sau khi mở thiệp" }));
    expect(useEditorStore.getState().document.music.playAfterOpen).toBe(false);
  });
});
