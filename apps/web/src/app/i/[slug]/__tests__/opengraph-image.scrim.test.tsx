import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { COVER_SCRIM_STYLE, size } from "../opengraph-image";

/*
 * The scrim behind the couple's names on the share card had never once been
 * drawn. It was styled with `inset: 0`, which every browser honours and
 * **satori silently ignores** — not an error, just a property it does not
 * implement — leaving the element with no box. So white text was painted
 * straight onto whatever cover photo the couple uploaded, and on a pale
 * photo it was close to invisible.
 *
 * Nothing but the rendered pixels could catch that: the JSX reads
 * correctly, the types are fine, and the route returns a perfectly valid
 * PNG either way. These tests render real PNGs and compare them.
 */

/*
 * Rendered at the card's real dimensions, and `COVER_SCRIM_STYLE` is used
 * **verbatim** — no spreading in a width/height of our own. An earlier
 * version of this test did exactly that, and so kept passing when the
 * style was reverted to `inset: 0`: the override supplied the box the
 * style had stopped providing, and the test proved nothing.
 */
const { width: WIDTH, height: HEIGHT } = size;

/** A pale background, which is the case where a missing scrim actually hurts. */
const PALE = "#F3D9DE";

function card(withScrim: boolean) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: PALE,
      }}
    >
      {withScrim ? <div style={COVER_SCRIM_STYLE} /> : null}
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontSize: 64,
        }}
      >
        Thu Hà
      </div>
    </div>
  );
}

async function renderHash(withScrim: boolean): Promise<string> {
  const response = new ImageResponse(card(withScrim), { width: WIDTH, height: HEIGHT });
  return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
}

describe("share-card scrim", () => {
  it(
    "actually changes the rendered pixels — a style satori ignores would not",
    async () => {
      const [without, With] = await Promise.all([renderHash(false), renderHash(true)]);
      expect(With).not.toBe(without);
    },
    30_000,
  );

  /*
   * Pins the cause, not just the symptom. `inset` is the one property that
   * looks right, type-checks, works in the browser preview, and does
   * nothing here — so it must not come back, in this element or any other
   * absolutely-positioned one on this card.
   */
  it("gives every edge explicitly instead of relying on the `inset` shorthand", () => {
    expect(COVER_SCRIM_STYLE).not.toHaveProperty("inset");
    expect(COVER_SCRIM_STYLE.top).toBe(0);
    expect(COVER_SCRIM_STYLE.right).toBe(0);
    expect(COVER_SCRIM_STYLE.bottom).toBe(0);
    expect(COVER_SCRIM_STYLE.left).toBe(0);
  });
});
