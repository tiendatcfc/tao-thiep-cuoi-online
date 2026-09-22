/**
 * A one-event iCalendar file, built in the browser.
 *
 * "Thêm vào lịch" is the single most useful button on a wedding
 * invitation: a guest taps it once, three months early, and the date stops
 * depending on them remembering a link. Every alternative to generating
 * the file locally is worse — a Google Calendar deep link hands a third
 * party the fact that this person was invited to this wedding, and a
 * server route would mean the invitation makes a request it currently
 * does not make at all.
 *
 * So: a Blob, an anchor, a click. No network, no dependency, no key.
 */

/** RFC 5545 §3.3.11: backslash, semicolon and comma are delimiters inside a text value, and a literal newline is written `\n`. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: content lines are folded at 75 OCTETS, with a space
 * starting each continuation.
 *
 * Octets, not characters, and that distinction is the whole reason this
 * function is careful: a Vietnamese venue name is three bytes per accented
 * letter in UTF-8, so a naive 75-character fold produces lines that are
 * comfortably over the limit, and splitting mid-character produces a file
 * that some calendar clients reject outright.
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  let start = 0;
  // 75 octets for the first line, 74 after that — the leading space of a
  // continuation counts toward its own line's limit.
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end -= 1;
    }
    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return chunks.join("\r\n ");
}

/** `YYYYMMDDTHHMMSSZ`, the UTC form. Calendar clients convert to the reader's own zone, which is what a guest travelling for the wedding needs. */
function toIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export interface IcsEvent {
  /** ISO instant the event starts. */
  start: string;
  /** How long the entry should block out. Weddings have no published end time; three hours is an honest default and the comment at the call site says so. */
  durationMinutes: number;
  summary: string;
  location?: string;
  description?: string;
  /** Injectable so the output is assertable; defaults to now. */
  now?: Date;
}

/**
 * Returns the .ics text, or `null` when `start` is not a date — a couple
 * can leave an event's date empty in the editor, and a calendar file
 * pointing at "Invalid Date" is worse than no button.
 */
export function buildIcs(event: IcsEvent): string | null {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);

  // Deterministic, not random: a guest who taps the button twice should
  // update the one entry in their calendar rather than acquire a second
  // copy of the same wedding.
  const uid = `${toIcsUtc(start)}-${escapeText(event.summary).slice(0, 40).replace(/\s+/g, "-")}@hpwd`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HPWD//Thiep cuoi//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(event.now ?? new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF throughout, including the trailing one: RFC 5545 requires it, and
  // some desktop clients refuse a file that ends without it.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Filename-safe, ASCII, and still recognisable — Vietnamese diacritics stripped rather than percent-escaped, which some download handlers mangle. */
export function icsFileName(summary: string): string {
  const ascii = summary
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${ascii || "su-kien"}.ics`;
}

/**
 * Hands the file to the browser. Split from `buildIcs` so the format can
 * be tested without a DOM, and so this half — which touches `document` and
 * `URL` — never runs anywhere but a click handler.
 */
export function downloadIcs(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Freed on the next tick rather than immediately: Safari has historically
  // cancelled the download if the object URL is revoked in the same frame
  // as the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
