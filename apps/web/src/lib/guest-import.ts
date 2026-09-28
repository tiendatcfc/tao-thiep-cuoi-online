import { normalizeGuestName } from "./guest-links";
import { removeDiacritics } from "./slug";

export interface GuestDraft {
  name: string;
  group?: string;
  note?: string;
}

export interface GuestImportResult {
  rows: GuestDraft[];
  skipped: number;
  warnings: string[];
}

/**
 * Same cap as `MAX_GUESTS_PER_REQUEST` in the guests API route: the whole
 * preview is POSTed in one call, so a file the parser accepts but the route
 * rejects would surface as an unexplained 400 after the user already
 * confirmed. Kept as a literal on both sides — the route runs on the server
 * and must not import browser-only parsing code just to share a number.
 */
export const MAX_IMPORT_ROWS = 500;

/** Mirrors `guestInputSchema` in the guests API route. */
const MAX_GROUP_LENGTH = 80;
const MAX_NOTE_LENGTH = 500;

type Column = "name" | "group" | "note";

/**
 * Header spellings we accept, already diacritic-stripped and lowercased, so
 * "Họ tên", "HO TEN" and "ho ten" all land on the same entry. Spreadsheets
 * exported from Vietnamese tools vary a lot here and a missed header silently
 * drops a whole column, so the list is deliberately generous.
 */
const HEADER_ALIASES: Record<string, Column> = {
  ten: "name",
  "ten khach": "name",
  "ten khach moi": "name",
  "ho ten": "name",
  hoten: "name",
  "ho va ten": "name",
  name: "name",
  "full name": "name",
  fullname: "name",
  guest: "name",
  "guest name": "name",

  nhom: "group",
  "nhom khach": "group",
  group: "group",
  category: "group",
  loai: "group",

  "ghi chu": "note",
  ghichu: "note",
  note: "note",
  notes: "note",
  comment: "note",
};

function headerKey(cell: string): string {
  return removeDiacritics(cell).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Minimal RFC 4180 reader: double quotes protect commas and newlines, `""`
 * inside a quoted field is a literal quote, and both CRLF and LF end a row.
 * Written by hand rather than pulled from npm — the grammar is small, and the
 * input is a file the *owner* chose, parsed in their own browser.
 */
export function parseCsv(text: string): string[][] {
  // Excel prefixes UTF-8 exports with a BOM; left in place it would glue
  // itself to the first header cell and stop "Tên" from being recognised.
  const input = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Consume the LF of a CRLF pair so it doesn't open an extra empty row.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // A file not ending in a newline still has one last row pending.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

/**
 * Maps each column index to a field, or returns null when the row doesn't look
 * like a header at all (no cell matches a known spelling) — in which case the
 * caller must treat that row as data.
 */
function detectHeader(row: string[]): Map<number, Column> | null {
  const mapping = new Map<number, Column>();
  const taken = new Set<Column>();

  row.forEach((cell, index) => {
    const column = HEADER_ALIASES[headerKey(cell)];
    // First spelling wins: a sheet with both "Tên" and "Họ tên" should not
    // have the later column silently overwrite the earlier one.
    if (column && !taken.has(column)) {
      mapping.set(index, column);
      taken.add(column);
    }
  });

  return mapping.size > 0 ? mapping : null;
}

/**
 * Tidies an optional cell without losing what the owner typed: runs of
 * horizontal whitespace collapse, but newlines inside a quoted CSV cell are
 * kept — a two-line note is deliberate, and flattening it would silently
 * rewrite their data. Long runs of blank lines still collapse to one.
 */
function cleanOptional(raw: string | undefined, maxLength: number): string | undefined {
  const value =
    raw
      ?.replace(/[^\S\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim() ?? "";
  if (value.length === 0) return undefined;
  return value.slice(0, maxLength).trim();
}

/**
 * De-duplication key. Case- and spacing-insensitive, but deliberately NOT
 * diacritic-insensitive: "Lê Thị Hà" and "Lê Thị Hạ" are two different guests, and
 * folding them together would silently drop one of them from the wedding.
 */
function dedupeKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

function toDrafts(rows: string[][]): GuestImportResult {
  const warnings: string[] = [];
  const dataRows = rows.filter((row) => !isBlankRow(row));

  if (dataRows.length === 0) {
    return { rows: [], skipped: 0, warnings: ["File không có dòng dữ liệu nào."] };
  }

  const header = detectHeader(dataRows[0]);
  const body = header ? dataRows.slice(1) : dataRows;

  if (!header) {
    warnings.push(
      "Không nhận ra dòng tiêu đề, đã dùng cột đầu tiên làm tên khách. " +
        'Thêm dòng tiêu đề "Tên, Nhóm, Ghi chú" nếu muốn nhập cả nhóm và ghi chú.',
    );
  }

  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        `File có ${body.length} dòng, vượt quá giới hạn ${MAX_IMPORT_ROWS} khách mỗi lần nhập. ` +
          "Hãy chia nhỏ file rồi nhập lại.",
      ],
    };
  }

  const columnFor = (column: Column): number | undefined => {
    if (!header) return column === "name" ? 0 : undefined;
    for (const [index, mapped] of header) {
      if (mapped === column) return index;
    }
    return undefined;
  };

  const nameIndex = columnFor("name") ?? 0;
  const groupIndex = columnFor("group");
  const noteIndex = columnFor("note");

  const drafts: GuestDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  for (const row of body) {
    if (isBlankRow(row)) continue;

    const name = normalizeGuestName(row[nameIndex] ?? "");
    if (name.length === 0) {
      skipped++;
      continue;
    }

    const key = dedupeKey(name);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    const draft: GuestDraft = { name };
    const group = groupIndex === undefined ? undefined : cleanOptional(row[groupIndex], MAX_GROUP_LENGTH);
    const note = noteIndex === undefined ? undefined : cleanOptional(row[noteIndex], MAX_NOTE_LENGTH);
    if (group) draft.group = group;
    if (note) draft.note = note;
    drafts.push(draft);
  }

  if (duplicates > 0) {
    warnings.push(`Đã bỏ ${duplicates} dòng trùng tên, chỉ giữ lần xuất hiện đầu tiên.`);
  }
  if (drafts.length === 0 && skipped === 0 && warnings.length === 0) {
    warnings.push("File không có dòng dữ liệu nào.");
  }

  return { rows: drafts, skipped, warnings };
}

/**
 * Reads the first worksheet of an `.xlsx` file into the same raw string grid a
 * CSV produces, so both formats go through one code path.
 *
 * `exceljs` is imported dynamically: it is a large dependency and the vast
 * majority of imports are CSV, which must not pay for it.
 */
async function xlsxToGrid(file: File): Promise<string[][]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    // `row.values` is 1-based with a hole at index 0, and trailing empty cells
    // are simply absent — `cellCount` is what keeps column positions aligned.
    for (let column = 1; column <= row.cellCount; column++) {
      cells.push(cellText(row.getCell(column).value));
    }
    grid.push(cells);
  });
  return grid;
}

/**
 * Flattens one exceljs cell to plain text. A cell can hold a rich-text run
 * list, a formula result, a date, or a hyperlink object — reading `.toString()`
 * blindly would stringify those as "[object Object]".
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.richText)) {
    return record.richText.map((part) => String((part as { text?: string }).text ?? "")).join("");
  }
  if (record.text !== undefined) return String(record.text);
  if (record.result !== undefined) return String(record.result);
  if (record.hyperlink !== undefined) return String(record.hyperlink);
  return "";
}

/**
 * Parses a guest list the owner picked in their browser.
 *
 * The file is NEVER uploaded: it is read and parsed entirely client-side and
 * only the reviewed JSON rows are POSTed. That keeps the server from ever
 * parsing an untrusted spreadsheet, which removes a whole class of attack
 * surface (zip bombs, XXE in xlsx XML, formula payloads) at no cost to the
 * feature.
 *
 * Never throws: a malformed or unreadable file comes back as an empty result
 * with a Vietnamese warning the dialog can show as-is.
 */
export async function parseGuestFile(file: File): Promise<GuestImportResult> {
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith(".xlsx")) {
      return toDrafts(await xlsxToGrid(file));
    }
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      return toDrafts(parseCsv(await file.text()));
    }
    if (name.endsWith(".xls")) {
      return {
        rows: [],
        skipped: 0,
        warnings: [
          "Định dạng .xls cũ không đọc được. Hãy mở bằng Excel rồi lưu lại dưới dạng .xlsx hoặc .csv.",
        ],
      };
    }
    return {
      rows: [],
      skipped: 0,
      warnings: ["Chỉ hỗ trợ file CSV (.csv) hoặc Excel (.xlsx)."],
    };
  } catch {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Không đọc được file. Hãy kiểm tra lại định dạng hoặc lưu lại dưới dạng .csv."],
    };
  }
}
