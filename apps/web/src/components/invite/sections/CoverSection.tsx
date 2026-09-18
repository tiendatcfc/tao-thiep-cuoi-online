import type { Section } from "@hpwd/schema";
import { VN_TIME_ZONE } from "@/lib/date";
import { useInviteContext } from "../InviteContext";
import Image from "next/image";
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
  const { groomName, brideName, coverImage, date, tagline } = section.props;
  const formattedDate = formatVietnameseDate(date);
  const days = daysRemaining(date);

  return (
    <SectionWrapper
      section={section}
      fullBleed
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 py-14 text-center"
    >
      {coverImage ? (
        /*
         * `next/image`, not a bare `<img>`. The box is 224x224 CSS; the
         * upload pipeline stores photos at up to 1600px wide, so a raw
         * `<img>` made every guest download the full-resolution photo to
         * paint a thumbnail. `sizes` tells the browser the real box so it
         * picks a source scaled for its own device pixel ratio.
         *
         * `fill` because the document stores a URL and nothing else — there
         * are no dimensions on `coverImage` the way there are on an album
         * image — so the parent box supplies the geometry instead.
         */
        <div className="relative h-56 w-56">
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="224px"
            /*
             * `next/image` lazy-loads by default, which for the one image
             * at the very top of the invitation means the browser does not
             * even discover it until React has hydrated and the observer
             * has run. Measured on a published invitation with a cover
             * photo (Slow 4G, 4x CPU, 390x844 @3x): LCP 1343 ms, of which
             * 634 ms was load DELAY — more than the 574 ms it took to
             * download the image once it was finally asked for.
             *
             * `priority` makes Next emit a `<link rel="preload">` for it in
             * the document head, so the request starts with the HTML
             * instead of after hydration. It belongs on this image and no
             * other: everything below the fold should stay lazy, and
             * preloading several images at once just makes them compete.
             *
             * Phase 4 tried `fetchPriority="high"` here and removed it
             * again for measuring as nothing. That experiment ran against
             * /i/demo, which has NO cover image — there was no element to
             * prioritise. This one is measured on a page that has one.
             */
            priority
            /*
             * `priority` alone drops `loading="lazy"` and emits the preload,
             * but Next 15.5 puts `fetchpriority` on NEITHER the preload link
             * nor the `<img>`. Chrome's own LCP-discovery audit reports that
             * as a failed check, and the request goes out at Low priority,
             * queued behind the JS chunks — 530 ms of load delay even with
             * the preload sitting in the head and the image already cached.
             * Passing it explicitly is what actually raises the priority.
             */
            fetchPriority="high"
            className="rounded-full object-cover shadow-lg"
          />
        </div>
      ) : null}
      {tagline ? (
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--secondary)]">{tagline}</p>
      ) : null}
      <h1 className="text-4xl font-semibold text-[var(--primary)]">
        {groomName} &amp; {brideName}
      </h1>
      {formattedDate ? <p className="text-base text-gray-600">{formattedDate}</p> : null}
      {days !== null ? (
        <p className="text-sm text-gray-500">
          {days === 0 ? "Hôm nay" : `Còn ${days} ngày nữa`}
        </p>
      ) : null}
      {showGuestName && guestName ? (
        <p className="text-sm text-gray-700">Kính mời: {guestName}</p>
      ) : null}
    </SectionWrapper>
  );
}
