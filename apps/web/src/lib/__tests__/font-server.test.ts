import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FontParseError, describeParsedFont, parseAndConvertFont } from "../font-server";

/**
 * A real TTF, not a hand-rolled stub: the whole point of `font-server.ts`
 * is that `fontkit` is the authority on whether a buffer is a font, and a
 * fake cannot test that.
 *
 * Next ships a 27KB Latin subset of Noto Sans (SIL Open Font License) for
 * its OpenGraph image renderer, so the fixture costs the repository
 * nothing and needs no network. It is resolved through `next`'s own
 * package entry rather than by a hard-coded `node_modules/.pnpm/...` path,
 * which encodes the exact version in the directory name.
 *
 * If a future Next release drops this file, these tests FAIL rather than
 * skip — a skipped font test would be a green suite asserting nothing,
 * exactly the trap the ffmpeg suite fell into in Phase 2. The fix is to
 * point `FIXTURE` at any other permissively-licensed font.
 */
const require = createRequire(import.meta.url);
const FIXTURE = path.join(
  path.dirname(require.resolve("next/package.json")),
  "dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf",
);

function notoSans(): Buffer {
  return readFileSync(FIXTURE);
}

describe("parseAndConvertFont — a real font file", () => {
  it("reads the family name out of the file's own metadata", async () => {
    const result = await parseAndConvertFont(notoSans(), ".ttf");

    expect(result.family).toBe("Noto Sans");
  });

  it("converts TTF to WOFF2, and the output really is WOFF2", async () => {
    const source = notoSans();
    const result = await parseAndConvertFont(source, ".ttf");

    // `wOF2` is the format's magic number; asserting the four bytes rather
    // than trusting the library's return type means a silent pass-through
    // would fail here.
    expect(result.woff2.subarray(0, 4).toString("latin1")).toBe("wOF2");
    expect(result.woff2.byteLength).toBeLessThan(source.byteLength);
  });

  it("reports the Vietnamese glyphs a Latin-only subset is missing", async () => {
    // This fixture is the `latin` subset, so it carries â/ê/ô but not
    // ă/đ/ơ/ư or any of the Ă tone marks — precisely the failure a couple
    // would otherwise only discover when their own names rendered as
    // boxes on the published invitation.
    const result = await parseAndConvertFont(notoSans(), ".ttf");

    expect(result.missingGlyphs).toBe("ăđơưẮẰẲẴẶ");
    expect(result.missingGlyphs).not.toContain("â");
  });

  it("passes an already-WOFF2 upload straight through instead of re-compressing it", async () => {
    // `wawoff2.compress` throws on WOFF2 input ("ConvertTTFToWOFF2
    // failed"), so a missing branch here is an upload that fails for every
    // user who picks the one format the app recommends.
    const alreadyWoff2 = (await parseAndConvertFont(notoSans(), ".ttf")).woff2;

    const result = await parseAndConvertFont(alreadyWoff2, ".woff2");

    expect(result.family).toBe("Noto Sans");
    expect(result.woff2.equals(alreadyWoff2)).toBe(true);
  });

  it("rejects a buffer that is not a font at all", async () => {
    await expect(parseAndConvertFont(Buffer.from("definitely not a font"), ".ttf")).rejects.toBeInstanceOf(
      FontParseError,
    );
  });

  it("rejects a truncated font — half a real file is not a font either", async () => {
    const half = notoSans().subarray(0, 4_000);

    await expect(parseAndConvertFont(half, ".ttf")).rejects.toBeInstanceOf(FontParseError);
  });

  it("explains the refusal in Vietnamese, since the message reaches the couple", async () => {
    await expect(parseAndConvertFont(Buffer.from("nope"), ".ttf")).rejects.toThrow(/không đọc được|không phải/i);
  });
});

describe("describeParsedFont — branches that need a shape fontkit only produces for exotic files", () => {
  /** What `fontkit.create` returns for a single font: the fields actually read. */
  function fakeFont(overrides: Record<string, unknown> = {}) {
    return {
      familyName: "Fake Family",
      fullName: "Fake Family Regular",
      postscriptName: "FakeFamily-Regular",
      hasGlyphForCodePoint: () => true,
      ...overrides,
    };
  }

  it("refuses a font collection (.ttc), which carries several families at once", () => {
    // `fontkit.create` returns a FontCollection with no `familyName` for a
    // .ttc. A single `@font-face` rule can only name one family, so
    // accepting one would store a font whose name came from nowhere.
    expect(() => describeParsedFont({ fonts: [fakeFont(), fakeFont()] })).toThrow(FontParseError);
  });

  it("falls back through fullName and postscriptName when familyName is absent", () => {
    expect(describeParsedFont(fakeFont({ familyName: undefined })).family).toBe("Fake Family Regular");
    expect(describeParsedFont(fakeFont({ familyName: undefined, fullName: undefined })).family).toBe(
      "FakeFamily-Regular",
    );
  });

  it("refuses a font whose every name is unusable once sanitized", () => {
    // Not a hypothetical: the name lives in the file and an attacker picks
    // it. If sanitizing leaves nothing, there is no family to write.
    expect(() =>
      describeParsedFont(fakeFont({ familyName: '{};"', fullName: "", postscriptName: undefined })),
    ).toThrow(FontParseError);
  });

  it("sanitizes the family before it ever reaches the caller", () => {
    expect(describeParsedFont(fakeFont({ familyName: 'Evil"; } body {' })).family).toBe("Evil body");
  });

  it("reports no missing glyphs when the font covers the whole sample", () => {
    expect(describeParsedFont(fakeFont()).missingGlyphs).toBe("");
  });

  it("reports every missing glyph when the font covers none of them", () => {
    expect(describeParsedFont(fakeFont({ hasGlyphForCodePoint: () => false })).missingGlyphs).toBe(
      "ăâđêôơưẮẰẲẴẶ",
    );
  });
});
