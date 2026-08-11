// @vitest-environment jsdom
import type { Music } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteContext } from "../InviteContext";
import { MusicPlayer } from "../MusicPlayer";

// jsdom doesn't implement HTMLMediaElement's playback methods (play/pause
// throw "not implemented" if called for real), so every test stubs them
// directly on the prototype rather than trying to spy on a native
// implementation that doesn't exist.
function music(overrides: Partial<Music> = {}): Music {
  return {
    source: "upload",
    url: "https://cdn.test/song.mp3",
    trackId: null,
    playAfterOpen: true,
    ...overrides,
  };
}

function provider(musicProp: Music, startSignal: boolean, isPreview: boolean) {
  return (
    <InviteContext.Provider value={{ guestName: null, isPreview, slug: null }}>
      <MusicPlayer music={musicProp} startSignal={startSignal} />
    </InviteContext.Provider>
  );
}

function renderPlayer(musicProp: Music, startSignal: boolean, isPreview = false) {
  return render(provider(musicProp, startSignal, isPreview));
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("MusicPlayer", () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playSpy = vi.fn().mockResolvedValue(undefined);
    pauseSpy = vi.fn();
    window.HTMLMediaElement.prototype.play = playSpy as unknown as HTMLMediaElement["play"];
    window.HTMLMediaElement.prototype.pause = pauseSpy as unknown as HTMLMediaElement["pause"];
    // MusicPlayer calls `load()` whenever the resolved src changes (see its
    // docstring) — jsdom doesn't implement it either, so it's stubbed here
    // too, purely to keep test output free of "Not implemented" noise.
    window.HTMLMediaElement.prototype.load = vi.fn() as unknown as HTMLMediaElement["load"];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when music.source is null", () => {
    const { container } = renderPlayer(music({ source: null, url: null }), false);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when there is no resolvable url (upload source, no url)", () => {
    const { container } = renderPlayer(music({ source: "upload", url: null }), false);
    expect(container.firstChild).toBeNull();
  });

  it("does not call play() on mount", () => {
    renderPlayer(music(), false);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("does not call play() on mount even when startSignal starts out true", () => {
    renderPlayer(music(), true);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("calls play() when startSignal flips from false to true", () => {
    const { rerender } = render(provider(music(), false, false));
    expect(playSpy).not.toHaveBeenCalled();

    rerender(provider(music(), true, false));

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-start in preview mode even when startSignal flips true", () => {
    const { rerender } = render(provider(music(), false, true));

    rerender(provider(music(), true, true));

    expect(playSpy).not.toHaveBeenCalled();
    // Still usable via its own button in preview.
    expect(screen.getByRole("button", { name: "Bật nhạc" })).toBeInTheDocument();
  });

  it("clicking the button toggles play/pause", async () => {
    renderPlayer(music(), false);
    const button = screen.getByRole("button", { name: "Bật nhạc" });

    fireEvent.click(button);
    expect(playSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tắt nhạc" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Tắt nhạc" }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Bật nhạc" })).toBeInTheDocument();
  });

  it("leaves the UI paused, without throwing, when play() rejects", async () => {
    playSpy.mockRejectedValue(new Error("NotAllowedError"));
    renderPlayer(music(), false);

    fireEvent.click(screen.getByRole("button", { name: "Bật nhạc" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Bật nhạc" })).toBeInTheDocument());
  });

  it("resolves a library track's url from GET /api/music by trackId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        tracks: [
          {
            id: "track-1",
            title: "Song 1",
            artist: "A",
            url: "https://cdn.test/track-1.m4a",
            duration: 20,
            category: "demo",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderPlayer(music({ source: "library", url: null, trackId: "track-1" }), false);

    await waitFor(() => expect(screen.getByRole("button", { name: "Bật nhạc" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/music");
  });

  it("uses music.url directly for a library source without fetching, when url is already set", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPlayer(music({ source: "library", url: "https://cdn.test/direct.m4a", trackId: "track-1" }), false);

    expect(screen.getByRole("button", { name: "Bật nhạc" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing and warns when the library track can't be resolved (not found/inactive)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tracks: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = renderPlayer(music({ source: "library", url: null, trackId: "missing" }), false);

    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing and warns when the /api/music fetch itself fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = renderPlayer(music({ source: "library", url: null, trackId: "track-1" }), false);

    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
