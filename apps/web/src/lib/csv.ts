/**
 * Byte-order mark. Excel on Windows assumes the system ANSI codepage for a
 * `.csv` without one, which turns every Vietnamese diacritic into mojibake
 * ("Äáº·ng" instead of "Đặng"). One U+FEFF at the front is what makes it
 * read the file as UTF-8.
 */
export const CSV_BOM = "\ufeff";

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than
 * text. Tab and carriage return are in the list because Excel and Google
 * Sheets skip leading whitespace before deciding, so `\t=cmd|...` is still
 * executed.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralises spreadsheet formula injection.
 *
 * Submissions are typed by wedding GUESTS — anyone who has the link — and
 * downloaded and opened by the couple in Excel. Without this, a guest who
 * answers `=HYPERLINK("http://evil","Click")` or a DDE payload gets it
 * executed on the couple's machine. Prefixing with an apostrophe is the
 * standard defence: Excel shows the original text and never evaluates it.
 */
function neutralizeFormula(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

/** RFC 4180 quoting: wrap when the cell holds a delimiter, quote or newline; double any inner quote. */
function quoteCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function encodeCell(value: string): string {
  // Order matters: neutralise first so the apostrophe ends up INSIDE the
  // quotes for a formula that also contains a comma. Quoting first would
  // produce `'"=SUM(A1,B1)"`, which Excel reads as a stray apostrophe
  // followed by a quoted formula.
  return quoteCell(neutralizeFormula(value));
}

/**
 * Makes a header list safe to use as object keys.
 *
 * Question labels are free text the couple types in the form builder, so two
 * questions can legitimately share one label. Used directly as keys, the
 * second would overwrite the first and a whole column of answers would
 * vanish from the export with nothing to indicate it.
 */
export function uniqueHeaders(labels: string[]): string[] {
  const used = new Set<string>();
  return labels.map((label, index) => {
    const base = label.trim() === "" ? `Cột ${index + 1}` : label.trim();
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let suffix = 2;
    while (used.has(`${base} (${suffix})`)) suffix++;
    const unique = `${base} (${suffix})`;
    used.add(unique);
    return unique;
  });
}

/**
 * Serialises rows to a CSV string Excel opens correctly in Vietnamese.
 *
 * `columns` is both the key looked up in each row and the header written out,
 * in order; a row missing a key gets an empty cell. Headers are escaped the
 * same way as data — they come from user-supplied question labels too.
 */
export function toCsv(rows: Record<string, string>[], columns: string[]): string {
  const lines = [columns.map(encodeCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => encodeCell(row[column] ?? "")).join(","));
  }
  // Trailing CRLF: a final newline is what most tools expect, and Excel
  // ignores it rather than adding a blank row.
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
