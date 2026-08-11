import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import { loadOgHeadingFont, OG_HEADING_FONT_NAME } from "../og-font";

const mockedReadFile = vi.mocked(readFile);

afterEach(() => {
  mockedReadFile.mockReset();
});

describe("loadOgHeadingFont", () => {
  it("returns null (never throws) when no candidate file exists", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT: no such file"));
    expect(await loadOgHeadingFont()).toBeNull();
  });

  it("returns a font descriptor when og-heading.ttf has a valid TrueType signature", async () => {
    const ttfBytes = Buffer.from([0x00, 0x01, 0x00, 0x00, 0xaa, 0xbb, 0xcc]);
    mockedReadFile.mockResolvedValueOnce(ttfBytes);

    const font = await loadOgHeadingFont();

    expect(font).toEqual({ name: OG_HEADING_FONT_NAME, data: ttfBytes, weight: 700, style: "normal" });
  });

  it("accepts an OTTO (CFF/OpenType) signature", async () => {
    mockedReadFile.mockResolvedValueOnce(Buffer.from("OTTOrestofthefile"));
    expect((await loadOgHeadingFont())?.name).toBe(OG_HEADING_FONT_NAME);
  });

  it("accepts a WOFF1 ('wOFF') signature", async () => {
    mockedReadFile.mockResolvedValueOnce(Buffer.from("wOFFrestofthefile"));
    expect((await loadOgHeadingFont())?.name).toBe(OG_HEADING_FONT_NAME);
  });

  // The exact human-error this whole module exists to catch: a WOFF2 file
  // (the format `public/fonts/README.md` asks for, for the CSS @font-face
  // rules) accidentally saved under the OG-image-specific `.ttf` name.
  // satori can't parse WOFF2 at all — this must degrade to "no custom font"
  // rather than crash the renderer.
  it("treats a WOFF2-signed ('wOF2') file as absent rather than a valid font", async () => {
    mockedReadFile.mockResolvedValueOnce(Buffer.from("wOF2restofthefile")); // og-heading.ttf: wrong format
    mockedReadFile.mockRejectedValueOnce(new Error("ENOENT")); // og-heading.woff: doesn't exist either
    expect(await loadOgHeadingFont()).toBeNull();
  });

  it("falls back to the .woff candidate when .ttf is missing", async () => {
    mockedReadFile.mockRejectedValueOnce(new Error("ENOENT")); // og-heading.ttf
    mockedReadFile.mockResolvedValueOnce(Buffer.from("wOFFrestofthefile")); // og-heading.woff

    const font = await loadOgHeadingFont();

    expect(font).not.toBeNull();
    expect(mockedReadFile).toHaveBeenCalledTimes(2);
  });

  it("returns null when the file is too short to contain a signature", async () => {
    mockedReadFile.mockResolvedValueOnce(Buffer.from([0x00, 0x01])); // og-heading.ttf: too short
    mockedReadFile.mockRejectedValueOnce(new Error("ENOENT")); // og-heading.woff: doesn't exist either
    expect(await loadOgHeadingFont()).toBeNull();
  });
});
