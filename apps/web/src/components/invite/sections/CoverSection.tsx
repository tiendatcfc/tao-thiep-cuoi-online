import type { Section } from "@hpwd/schema";
import { VN_TIME_ZONE } from "@/lib/date";
import { useInviteContext } from "../InviteContext";
import { ArchPortrait, givenInitial } from "../decor/ArchPortrait";
import { SectionWrapper } from "./SectionWrapper";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Vietnam-only app (see `VN_TIME_ZONE`) — `timeZone` is required here, not
 * optional: without it, `Intl.DateTimeFormat` falls back to the rendering
 * server's local timezone, so a morning ceremony stored as a UTC instant
 * (the norm — see `DateField`) renders a calendar day early on a UTC
 * server and correctly on an ICT one, a silent SSR/guest-device mismatch.
 */
export function formatVietnameseDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIME_ZONE,
  }).format(date);
}

/** `Intl.DateTimeFormat`'s `en-CA` locale gives a stable `YYYY-MM-DD` — used only to pin a `Date` to a calendar day in `VN_TIME_ZONE`, never displayed. */
function vnCalendarDayUtcMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return Date.UTC(year, month - 1, day);
}

/**
 * Whole calendar days remaining until `iso`, both dates measured by their
 * *Vietnamese* calendar day, not by dividing a raw millisecond difference —
 * a naive `Math.ceil((target - now) / MS_PER_DAY)` gives the wrong answer
 * near local midnight (e.g. it's already the wedding's calendar day in
 * Vietnam a few hours before the raw UTC instant crosses a day boundary,
 * which would otherwise still show "còn 1 ngày nữa" instead of "Hôm nay").
 * Computed once at render time (server-rendered, not a ticking client clock
 * — the live countdown is Task 14's job); `now` is injectable for tests.
 * Past or unparseable dates return `null` so the caption is simply omitted.
 */
export function daysRemaining(iso: string, now: Date = new Date()): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.round((vnCalendarDayUtcMs(date) - vnCalendarDayUtcMs(now)) / MS_PER_DAY);
  return diffDays >= 0 ? diffDays : null;
}

export function CoverSection({ section }: { section: Extract<Section, { type: "cover" }> }) {
  const { guestName, showGuestName } = useInviteContext();
  const { groomName, brideName, coverImage, date, tagline, lunarDate } = section.props;
  const formattedDate = formatVietnameseDate(date);
  const days = daysRemaining(date);

  return (
    <SectionWrapper
      section={section}
      fullBleed
      className="flex min-h-[var(--viewport-h)] flex-col items-center justify-center gap-7 px-[var(--gutter)] py-[var(--section-y)] text-center"
    >
      <p
        className="uppercase text-[var(--ink-faint)]"
        style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
      >
        {tagline || "Save the date"}
      </p>

      <ArchPortrait
        src={coverImage}
        alt={`${groomName} & ${brideName}`}
        fallbackText={[givenInitial(groomName), givenInitial(brideName)].filter(Boolean).join(" & ")}
        width={240}
        ornamented
        priority
      />

      <h1 className="flex flex-col items-center gap-1 text-[var(--primary)]" style={{ fontSize: "var(--text-hero)" }}>
        <span>{groomName}</span>
        <span
          aria-hidden="true"
          className="text-[var(--secondary)]"
          style={{ fontSize: "var(--text-lead)" }}
        >
          &amp;
        </span>
        <span>{brideName}</span>
      </h1>

      {formattedDate ? (
        <div className="flex flex-col items-center gap-3">
          <span aria-hidden="true" className="flex items-center gap-3">
            <span className="h-px w-10 bg-[var(--hairline)]" />
            <span className="h-1.5 w-1.5 rotate-45 bg-[var(--secondary)]" />
            <span className="h-px w-10 bg-[var(--hairline)]" />
          </span>
          <p className="text-[var(--ink-soft)]" style={{ fontSize: "var(--text-lead)" }}>
            {formattedDate}
          </p>
          {lunarDate ? (
            /* Older relatives read this line first, and for many families
               it is the date that was actually chosen. Brackets and a
               lighter weight, exactly as it is printed. */
            <p className="text-[var(--ink-faint)]" style={{ fontSize: "var(--text-caption)" }}>
              ({lunarDate})
            </p>
          ) : null}
          {days !== null ? (
            <p className="text-[var(--ink-faint)]" style={{ fontSize: "var(--text-caption)" }}>
              {days === 0 ? "Hôm nay" : `Còn ${days} ngày nữa`}
            </p>
          ) : null}
        </div>
      ) : null}

      {showGuestName && guestName ? (
        <p className="mt-2 flex flex-col items-center gap-1.5">
          <span
            className="uppercase text-[var(--ink-faint)]"
            style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
          >
            Kính mời
          </span>
          <span className="text-[var(--ink)]" style={{ fontSize: "var(--text-lead)" }}>
            {guestName}
          </span>
        </p>
      ) : null}
    </SectionWrapper>
  );
}
