/**
 * The wedding date, set as a plate rather than as a sentence:
 *
 *     03 │ THÁNG 01
 *        │ 2026
 *
 * A date is the one fact every guest has to carry away from the page, and
 * `formatVietnameseDate`'s "Chủ Nhật, 20/12/2026" is a form field, not an
 * announcement. The vertical hairline is doing the real work here — it is
 * what turns three numbers into a composition.
 *
 * Takes already-formatted parts rather than an ISO string so the timezone
 * rule stays in exactly one place (`VN_TIME_ZONE`, see `lib/date.ts`);
 * every caller here formats with it before calling.
 */
export interface DateBlockProps {
  day: string;
  month: string;
  year: string;
  /** Optional weekday and time line above the plate, e.g. "Thứ Bảy · 18:00". */
  caption?: string | null;
  /** The lunar date, shown in brackets underneath. Vietnamese weddings are chosen by it. */
  note?: string | null;
  className?: string;
}

export function DateBlock({ day, month, year, caption, note, className = "" }: DateBlockProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`.trim()}>
      {caption ? (
        <p
          className="uppercase opacity-80"
          style={{ fontSize: "var(--text-caption)", letterSpacing: "var(--tracking-overline)" }}
        >
          {caption}
        </p>
      ) : null}

      <div className="flex items-stretch justify-center gap-5">
        <span
          className="self-center leading-none"
          style={{
            fontFamily: "var(--font-heading, inherit)",
            fontSize: "calc(var(--text-display) * 1.5)",
            letterSpacing: "var(--tracking-display)",
          }}
        >
          {day}
        </span>
        <span aria-hidden="true" className="w-px self-stretch bg-current opacity-30" />
        <span className="flex flex-col justify-center gap-1 text-left">
          <span
            className="uppercase leading-none"
            style={{ fontSize: "var(--text-lead)", letterSpacing: "var(--tracking-caption)" }}
          >
            {month}
          </span>
          <span className="leading-none opacity-85" style={{ fontSize: "var(--text-lead)" }}>
            {year}
          </span>
        </span>
      </div>

      {note ? (
        <p className="opacity-75" style={{ fontSize: "var(--text-caption)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
