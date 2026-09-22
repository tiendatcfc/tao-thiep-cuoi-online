import { VN_TIME_ZONE } from "@/lib/date";

/**
 * The wedding month, with the day marked.
 *
 * A date written as a sentence is read and forgotten; a date seen in its
 * own month is placed — a guest knows instantly that it is a Sunday, that
 * it is the weekend after payday, that it is two weeks after something
 * else they have on. Every printed Vietnamese invitation that can afford
 * the space does this, and the reference this design follows does it too.
 *
 * Pure and server-renderable: no state, no effects, no client clock. The
 * month is derived from the event's own instant in `Asia/Ho_Chi_Minh`, not
 * from `new Date()`, so it cannot disagree between the server render and
 * the guest's device.
 */

/** Vietnamese weeks start on Monday, and the last column — Chủ Nhật — is the one people actually look for. */
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export interface CalendarMonth {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31, the day to mark. */
  day: number;
}

/**
 * The event's calendar day AS SEEN IN VIETNAM.
 *
 * `formatToParts` with an explicit `timeZone`, never `getFullYear()` and
 * friends: those answer in the rendering server's own zone, and a 09:00
 * Vietnamese ceremony stored as a UTC instant lands on the previous
 * calendar day on any server west of Hanoi. That is not a hypothetical —
 * it is the same bug `CoverSection.formatVietnameseDate` carries a comment
 * about.
 */
export function calendarMonthOf(iso: string): CalendarMonth | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const [year, month, day] = [value("year"), value("month"), value("day")];
  if (![year, month, day].every(Number.isFinite)) return null;
  return { year, month, day };
}

/**
 * The cells of the month grid: leading blanks for the days before the 1st,
 * then 1..n. Built with `Date.UTC` arithmetic on a synthetic date — this is
 * calendar arithmetic, not an instant, so there is no timezone involved and
 * nothing to get wrong.
 */
export function monthGrid({ year, month }: Pick<CalendarMonth, "year" | "month">): (number | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // `getUTCDay()` is 0=Sunday; shift so 0=Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
}

export function WeddingCalendar({ date, className = "" }: { date: string; className?: string }) {
  const marked = calendarMonthOf(date);
  if (!marked) return null;
  const cells = monthGrid(marked);

  return (
    <div
      className={`w-full rounded-[var(--radius-card)] px-4 py-5 ${className}`.trim()}
      style={{
        // A paper plate laid on the filled card: mixed from the couple's own
        // background so it belongs to their palette rather than being a
        // hardcoded white panel.
        backgroundColor: "color-mix(in oklab, var(--background) 92%, white)",
        color: "var(--ink)",
      }}
    >
      <p
        className="mb-3 text-center"
        style={{ fontFamily: "var(--font-heading, inherit)", fontSize: "var(--text-lead)" }}
      >
        Tháng {marked.month} / {marked.year}
      </p>
      <div
        role="grid"
        aria-label={`Lịch tháng ${marked.month} năm ${marked.year}`}
        className="grid grid-cols-7 gap-y-1.5 text-center"
      >
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            role="columnheader"
            className="pb-1.5 text-[var(--ink-faint)]"
            style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-caption)" }}
          >
            {label}
          </span>
        ))}
        {cells.map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} role="gridcell" aria-hidden="true" />
          ) : day === marked.day ? (
            <span key={day} role="gridcell" className="flex items-center justify-center">
              {/* The marked day is a filled lozenge, not a ring: at 13px a
                  ring reads as a rendering artefact, a solid shape reads as
                  "this one". */}
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
                aria-label={`Ngày cưới, ${day}`}
              >
                <span style={{ fontSize: "var(--text-caption)" }}>{day}</span>
              </span>
            </span>
          ) : (
            <span
              key={day}
              role="gridcell"
              className="text-[var(--ink-soft)]"
              style={{ fontSize: "var(--text-caption)" }}
            >
              {day}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
