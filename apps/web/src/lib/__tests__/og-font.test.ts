import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import {
  loadOgHeadingFont,
  OG_HEADING_FONT_NAME,
  OG_HEADING_VIETNAMESE_FONT_NAME,
} from "../og-font";

const mockedReadFile = vi.mocked(readFile);

/** A buffer whose first four bytes are a signature satori accepts. */
const woff1 = (tag = "wOFF") => Buffer.from(`${tag}rest-of-the-file`);

/** Resolves every read with a valid WOFF1, so only the filenames are under test. */
function everythingReadable() {
  mockedReadFile.mockResolvedValue(woff1());
}

function pathsRead(): string[] {
  return mockedReadFile.mock.calls.map((call) => String(call[0]));
}

afterEach(() => {
  mockedReadFile.mockReset();
});

describe("loadOgHeadingFont", () => {
  it("returns null (never throws) when the font files are missing", async () => {
    mockedReadFile.mockRejectedValue(new Error("ENOENT: no such file"));
    expect(await loadOgHeadingFont("Playfair Display")).toBeNull();
  });

  it("reads the latin and vietnamese WOFF1 pair for the requested family", async () => {
    everythingReadable();

    await loadOgHeadingFont("Lora");

    expect(pathsRead().map((p) => p.split("/").pop()).sort()).toEqual([
      "lora-latin-700.woff",
      "lora-vietnamese-700.woff",
    ]);
  });

  /*
   * The whole reason this module exists. satori keys its font store by
   * name and returns exactly ONE file per name/weight/style, so two
   * subsets registered under the same name means the second is silently
   * discarded and every diacritic goes missing. `og-font.render.test.ts`
   * proves that at the pixel level; this pins the contract cheaply.
   */
  it("registers the two subsets under DIFFERENT names, or satori would drop one", async () => {
    everythingReadable();

    const font = await loadOgHeadingFont("Playfair Display");

    const names = font!.fonts.map((f) => f.name);
    expect(new Set(names).size).toBe(2);
    expect(names).toEqual([OG_HEADING_FONT_NAME, OG_HEADING_VIETNAMESE_FONT_NAME]);
  });

  it("names both subsets in the font stack, latin first so it wins for shared characters", async () => {
    everythingReadable();

    const font = await loadOgHeadingFont("Playfair Display");

    expect(font!.fontFamily).toContain(OG_HEADING_FONT_NAME);
    expect(font!.fontFamily).toContain(OG_HEADING_VIETNAMESE_FONT_NAME);
    expect(font!.fontFamily.indexOf(OG_HEADING_FONT_NAME)).toBeLessThan(
      font!.fontFamily.indexOf(OG_HEADING_VIETNAMESE_FONT_NAME),
    );
  });

  it("falls back to the default preset for a family the picker does not offer", async () => {
    everythingReadable();

    // Legacy rows and `theme.customFonts` can both put an arbitrary string
    // in `theme.headingFont`; there is no enum on `ThemeSchema`.
    await loadOgHeadingFont("Comic Sans MS");

    expect(pathsRead().every((p) => p.includes("playfair-display-"))).toBe(true);
  });

  it("falls back to the default preset for an empty family (no theme font set)", async () => {
    everythingReadable();
    await loadOgHeadingFont("");
    expect(pathsRead().every((p) => p.includes("playfair-display-"))).toBe(true);
  });

  /*
   * The exact mistake the magic-byte check exists to catch: `sync-fonts.mjs`
   * copying the WOFF2 under the WOFF1 name. satori cannot parse WOFF2 at
   * all, and it would throw inside the stream `ImageResponse` renders in,
   * where nothing upstream can catch it.
   */
  it("treats a WOFF2-signed file as absent rather than handing satori something it will throw on", async () => {
    mockedReadFile.mockResolvedValue(woff1("wOF2"));
    expect(await loadOgHeadingFont("Playfair Display")).toBeNull();
  });

  it("accepts a bare TrueType signature as well as WOFF1", async () => {
    mockedReadFile.mockResolvedValue(Buffer.from([0x00, 0x01, 0x00, 0x00, 0xaa, 0xbb]));
    expect(await loadOgHeadingFont("Playfair Display")).not.toBeNull();
  });

  it("returns null when a file is too short to carry a signature", async () => {
    mockedReadFile.mockResolvedValue(Buffer.from([0x00, 0x01]));
    expect(await loadOgHeadingFont("Playfair Display")).toBeNull();
  });

  /*
   * Half a pair is treated as no pair: the two files are generated
   * together and pinned by `font-files.test.ts`, so one missing means a
   * broken checkout — and a latin-only load would quietly reintroduce the
   * Google fetch for the diacritics, which is the thing this replaced.
   */
  it("returns null when only the latin half of the pair is readable", async () => {
    mockedReadFile.mockImplementation(async (path) =>
      String(path).includes("-latin-") ? woff1() : Promise.reject(new Error("ENOENT")),
    );
    expect(await loadOgHeadingFont("Playfair Display")).toBeNull();
  });
});
