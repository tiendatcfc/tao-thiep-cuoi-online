"use client";

import { buildIcs, downloadIcs, icsFileName } from "@/lib/ics";

/**
 * "Thêm vào lịch", as a downloaded .ics rather than a link to anybody's
 * calendar service.
 *
 * A Google Calendar deep link would be one line shorter and would tell
 * Google which person opened which couple's invitation. This page already
 * refuses to make a third-party request — it carries a guest list, a home
 * address and bank details — so the file is built locally and handed to
 * whatever calendar the guest actually uses, including on a phone with no
 * Google account at all.
 *
 * `"use client"` stops here: `EventsSection` stays a server component and
 * only this button ships JavaScript.
 */
export interface AddToCalendarProps {
  /** ISO instant the event starts. */
  date: string;
  summary: string;
  location?: string;
}

/**
 * Three hours. A Vietnamese reception has a published start time and no
 * published end, so any number here is a guess; three hours is long enough
 * that the entry does not vanish from a guest's day view halfway through,
 * and short enough that it does not swallow their evening.
 */
const DEFAULT_DURATION_MINUTES = 180;

export function AddToCalendar({ date, summary, location }: AddToCalendarProps) {
  // Built here rather than on click so the button can simply not render
  // when the couple has not set a date — better than a button that does
  // nothing, or one that produces a file saying "Invalid Date".
  const ics = buildIcs({
    start: date,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    summary,
    location,
  });
  if (!ics) return null;

  return (
    <button
      type="button"
      onClick={() => downloadIcs(ics, icsFileName(summary))}
      className="underline underline-offset-4 opacity-90 transition-opacity hover:opacity-100"
      style={{ fontSize: "var(--text-caption)" }}
    >
      Thêm vào lịch
    </button>
  );
}
