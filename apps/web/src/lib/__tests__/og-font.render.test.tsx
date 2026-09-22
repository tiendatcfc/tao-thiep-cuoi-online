import { ImageResponse } from "next/og";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOgHeadingFont } from "../og-font";

/*
 * These tests render real PNGs through the same `ImageResponse` the OG
 * route uses, against the real committed font files. They exist because
 * every cheaper check passed while the actual behaviour was wrong:
 *
 * satori's bundled fallback face is Noto Sans **latin**, which has no ế ặ
 * ữ Đ. For any character no registered font covers it calls out to
 * `fonts.googleapis.com/css2?family=Noto+Sans&text=<the missing
 * characters>` at render time and downloads a face from
 * `fonts.gstatic.com`. So the share image looked perfectly correct in
 * development — it was quietly putting the couple's own name characters in
 * a query string to Google on every render, in an app that otherwise makes
 * no third-party request at all, and rendering empty boxes on any host
 * where that call fails.
 *
 * A screenshot cannot tell those two apart. Counting outbound requests can.
 */

const VIETNAMESE_NAME = "Nguyễn Đặng & Trường Hạnh";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Rejects rather than passing through: no test may depend on Google being
  // reachable, and a request that is made is a failure whether or not it
  // would have succeeded.
  fetchSpy = vi.fn(async (input: unknown) => {
    throw new Error(`unexpected outbound request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function card(text: string, fontFamily: string) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 52,
        fontWeight: 700,
        fontFamily,
        background: "#FBF7F5",
        color: "#A62B45",
      }}
    >
      {text}
    </div>
  );
}

type ImageResponseOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>;

async function render(text: string, fontFamily: string, fonts?: ImageResponseOptions["fonts"]) {
  const response = new ImageResponse(card(text, fontFamily), { width: 900, height: 200, fonts });
  return Buffer.from(await response.arrayBuffer());
}

function googleRequests(): string[] {
  return fetchSpy.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes("googleapis.com") || url.includes("gstatic.com"));
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("OG heading font, rendered", () => {
  it(
    "renders a Vietnamese name without making a single outbound request",
    async () => {
      const font = await loadOgHeadingFont("Playfair Display");
      expect(font, "the committed WOFF1 pair must be readable from public/fonts/").not.toBeNull();

      const png = await render(VIETNAMESE_NAME, font!.fontFamily, font!.fonts);

      expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    30_000,
  );

  /*
   * The control for the test above. Without it, that assertion would still
   * pass if `ImageResponse` had simply stopped fetching fonts altogether
   * (a dependency upgrade, a bundler change), and the protection would be
   * gone with no test going red. This pins the leak as real and reachable:
   * remove the fonts and the request comes straight back.
   */
  it(
    "control: the same name WITHOUT our fonts does reach for Google, which is what we removed",
    async () => {
      await render(VIETNAMESE_NAME, "sans-serif");

      expect(googleRequests().length).toBeGreaterThan(0);
      expect(googleRequests()[0]).toContain("fonts.googleapis.com");
    },
    30_000,
  );

  /*
   * Pure ASCII is fully covered by satori's bundled latin face, so no
   * fetch happens even with no fonts registered. Without this, the control
   * above could be misread as "any render calls Google" — it is
   * specifically the Vietnamese characters that trigger it.
   */
  it(
    "control: a pure-ASCII name never triggers the fetch, so it really is the diacritics",
    async () => {
      await render("Khang and Ha", "sans-serif");
      expect(googleRequests()).toEqual([]);
    },
    30_000,
  );
});
