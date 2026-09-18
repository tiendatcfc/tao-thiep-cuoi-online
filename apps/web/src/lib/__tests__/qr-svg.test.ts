import { describe, expect, it } from "vitest";
import { qrMatrix, qrModulePath } from "../qr-svg";
import { buildVietQRPayload } from "../vietqr";

/**
 * Reads a path built by `qrModulePath` back into the set of modules it
 * actually paints. Anything the path can express that this does not
 * understand shows up as a parse failure rather than as a silent pass.
 */
function cellsPaintedBy(path: string): Set<string> {
  const painted = new Set<string>();
  const run = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = run.exec(path)) !== null) {
    const [whole, xs, ys, widths, backs] = match;
    expect(widths).toBe(backs);
    consumed += whole.length;
    const x = Number(xs);
    const y = Number(ys);
    for (let i = 0; i < Number(widths); i += 1) painted.add(`${x + i},${y}`);
  }
  // Every byte of the path was one of the runs above — nothing unparsed.
  expect(consumed).toBe(path.length);
  return painted;
}

function darkCellsOf(modules: readonly (readonly boolean[])[]): Set<string> {
  const dark = new Set<string>();
  modules.forEach((row, y) => row.forEach((on, x) => on && dark.add(`${x},${y}`)));
  return dark;
}

describe("qrModulePath", () => {
  it("collapses a horizontal run into one rectangle", () => {
    expect(qrModulePath([[true, true, true]])).toBe("M0 0h3v1h-3z");
  });

  it("breaks a run wherever a light module interrupts it", () => {
    expect(qrModulePath([[true, false, true, true]])).toBe("M0 0h1v1h-1zM2 0h2v1h-2z");
  });

  it("keeps rows separate", () => {
    expect(qrModulePath([[true], [true]])).toBe("M0 0h1v1h-1zM0 1h1v1h-1z");
  });

  it("emits nothing for a row with no dark modules", () => {
    expect(qrModulePath([[false, false]])).toBe("");
  });

  it("closes a run that reaches the last column", () => {
    expect(qrModulePath([[false, true, true]])).toBe("M1 0h2v1h-2z");
  });
});

// The thing that must not change is WHICH MODULES ARE DARK. Everything else
// here is byte-shaving; get this wrong and a guest's banking app either
// reads a different account or reads nothing, and no test that only counts
// bytes would notice.
describe("the path paints exactly the QR, and nothing else", () => {
  const payload = buildVietQRPayload({
    bankBin: "970436",
    accountNumber: "1234567890",
    message: "Mung cuoi",
  });

  it.each([
    ["a real VietQR payload", payload],
    ["a short ascii string", "HPWD"],
    ["a payload with Vietnamese diacritics", "Chúc mừng hạnh phúc"],
    ["a long payload that forces a bigger symbol", "x".repeat(300)],
  ])("covers every dark module and no light one: %s", (_label, value) => {
    const { modules } = qrMatrix(value);

    expect(cellsPaintedBy(qrModulePath(modules))).toEqual(darkCellsOf(modules));
  });

  it("produces a square matrix whose size the caller can use as the viewBox", () => {
    const { count, modules } = qrMatrix(payload);

    expect(modules).toHaveLength(count);
    for (const row of modules) expect(row).toHaveLength(count);
  });
});

// The reason this module exists at all. If a future change reverts to
// one-square-per-module the assertion below goes red rather than quietly
// putting 86 kB back on every invitation.
describe("the size it was written for", () => {
  it("is several times smaller than one sub-path per module", () => {
    const { modules } = qrMatrix(
      buildVietQRPayload({ bankBin: "970436", accountNumber: "1234567890", message: "Mung cuoi" }),
    );

    const perModule = modules
      .flatMap((row, y) => row.map((on, x) => (on ? `M ${x} ${y} l 1 0 0 1 -1 0 Z` : "")))
      .filter(Boolean)
      .join(" ");

    expect(qrModulePath(modules).length).toBeLessThan(perModule.length / 3);
  });
});
