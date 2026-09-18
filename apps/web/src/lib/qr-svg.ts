import qrcode from "qrcode-generator";

/**
 * Compact SVG rendering for the VietQR codes on an invitation.
 *
 * `react-qr-code`, which this replaces, emits ONE SUB-PATH PER MODULE — and
 * does it twice, once for the dark modules and once for the light ones:
 *
 *   M 7 0 l 1 0 0 1 -1 0 Z M 10 0 l 1 0 0 1 -1 0 Z ...
 *
 * 22 bytes to draw a single 1x1 square, times 41x41 modules, times two
 * colours, times two bank accounts. Measured on the real `/i/demo` page
 * built for production: the two QR codes were 86,070 of the page's 123,212
 * bytes, and 11.9 kB of its 19.5 kB after gzip — 60% of what a guest
 * actually downloads, for two images below the fold.
 *
 * Two changes, neither of which touches the QR content:
 *   - the light modules become one `<rect>` behind everything, because
 *     that is what they are;
 *   - the dark modules are run-length encoded along each row, so a run of
 *     five becomes `M7 0h5v1h-5z` (12 bytes) instead of five 22-byte
 *     squares.
 */

/**
 * Horizontal run-length path over `modules[y][x]`, in the 1-unit-per-module
 * coordinate space the caller puts in `viewBox`.
 *
 * Rows are independent: merging vertically as well would produce a smaller
 * path again, but needs rectangle decomposition, and the row pass already
 * removes the great majority of the bytes.
 */
export function qrModulePath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  for (let y = 0; y < modules.length; y += 1) {
    const row = modules[y]!;
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run]) run += 1;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join("");
}

/**
 * The module matrix for `value`.
 *
 * Type number 0 (choose the smallest that fits) and error-correction level
 * "L" are exactly what `react-qr-code` defaulted to, and the byte encoder
 * is set to UTF-8 for the same reason it was there: `qrcode-generator`'s
 * built-in default would mangle any payload that is not plain ASCII, and
 * `buildVietQRPayload` only strips diacritics from the transfer message —
 * it makes no promise about the rest. Changing either of these changes the
 * bytes a banking app reads, so they are pinned here rather than left to a
 * library default that could move.
 */
qrcode.stringToBytes = (value: string) => Array.from(new TextEncoder().encode(value));

export interface QrMatrix {
  /** Modules per side, including the QR's own quiet-zone-free border. */
  count: number;
  /** `modules[row][column]`, true where the module is dark. */
  modules: boolean[][];
}

export function qrMatrix(value: string): QrMatrix {
  const qr = qrcode(0, "L");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const modules = Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) => qr.isDark(row, column)),
  );
  return { count, modules };
}
