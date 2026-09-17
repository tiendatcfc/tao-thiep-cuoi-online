/**
 * Renders one submitted form value as text.
 *
 * Shared by the responses table and the CSV export so the two can never
 * disagree about what a guest actually answered — the table showing "Có" and
 * the downloaded file showing "true" for the same row would be worse than
 * either choice on its own.
 *
 * `emptyAs` differs by destination on purpose: the table wants a visible "-"
 * placeholder, while a spreadsheet wants a genuinely empty cell (a literal
 * "-" there is noise, and it is also a formula prefix that would then have to
 * be escaped).
 */
export function formatSubmissionValue(value: unknown, emptyAs: string): string {
  if (value === undefined || value === null) return emptyAs;
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : emptyAs;
  if (typeof value === "string") return value.trim() === "" ? emptyAs : value;
  return String(value);
}
