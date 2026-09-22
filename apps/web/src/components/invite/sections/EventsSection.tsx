import type { Section } from "@hpwd/schema";
import { VN_TIME_ZONE } from "@/lib/date";
import { isSafeHref } from "@/lib/sanitize";
import { AddToCalendar } from "./AddToCalendar";
import { DateBlock } from "../decor/DateBlock";
import { WeddingCalendar } from "../decor/WeddingCalendar";
import { InfoCard } from "../decor/InfoCard";
import type { OrnamentCorner } from "../decor/Ornament";
import { SectionWrapper } from "./SectionWrapper";

/** See `CoverSection.formatVietnameseDate` for why `timeZone` is required, not optional, in this Vietnam-only app. */
export function formatEventDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIME_ZONE,
  }).format(date);
}

export interface EventDateParts {
  day: string;
  month: string;
  year: string;
  weekday: string;
}

/**
 * The same instant as `formatEventDate`, split into the pieces `DateBlock`
 * sets as a plate. Built with `formatToParts` and the Vietnam timezone —
 * NOT by reading `date.getDate()`, which would answer in the rendering
 * server's timezone and put a morning ceremony on the previous calendar
 * day whenever that server is west of Vietnam.
 */
export function eventDateParts(iso: string): EventDateParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TIME_ZONE,
  }).formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: find("day"),
    month: `Tháng ${find("month")}`,
    year: find("year"),
    weekday: find("weekday"),
  };
}

/**
 * Alternating corners, so two events in a row are not the same picture
 * twice. Printed stationery varies the spray from card to card for exactly
 * this reason.
 */
const ORNAMENT_SETS: OrnamentCorner[][] = [
  ["top-left", "bottom-right"],
  ["top-right", "bottom-left"],
];

export function EventsSection({ section }: { section: Extract<Section, { type: "events" }> }) {
  const { items } = section.props;

  return (
    <SectionWrapper section={section} className="flex flex-col gap-7">
      <header className="flex flex-col items-center gap-2 text-center">
        <p
          className="uppercase text-[var(--ink-faint)]"
          style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
        >
          Trân trọng kính mời
        </p>
        <h2 className="text-[var(--primary)]" style={{ fontSize: "var(--text-title)" }}>
          Thời gian &amp; Địa điểm
        </h2>
      </header>

      {items.map((item, index) => {
        const parts = eventDateParts(item.date);
        const caption = parts?.weekday ?? null;
        // Two times, shown as two labelled columns rather than one string:
        // a Vietnamese reception publishes when guests should arrive AND
        // when the banquet starts, and a guest who reads only the second
        // arrives as the food is going out. Collapses to a single line when
        // the couple left the arrival time blank.
        const times = [
          item.guestTime ? { label: "Đón khách", value: item.guestTime } : null,
          item.time ? { label: item.guestTime ? "Khai tiệc" : "Bắt đầu", value: item.time } : null,
        ].filter((entry): entry is { label: string; value: string } => entry !== null);
        return (
          // Event entries have no stable id in the schema; index is safe
          // here for the same reason as StorySection (whole-list replace).
          <InfoCard key={index} ornaments={ORNAMENT_SETS[index % ORNAMENT_SETS.length]}>
            {item.name ? (
              <p
                className="uppercase"
                style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
              >
                {item.name}
              </p>
            ) : null}

            {parts ? (
              <DateBlock day={parts.day} month={parts.month} year={parts.year} caption={caption} />
            ) : null}

            {times.length > 0 ? (
              <div className="flex items-start justify-center gap-8">
                {times.map((entry) => (
                  <div key={entry.label} className="flex flex-col items-center gap-1">
                    <span
                      className="uppercase opacity-70"
                      style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
                    >
                      {entry.label}
                    </span>
                    <span style={{ fontSize: "var(--text-lead)" }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {parts ? (
              <>
                <WeddingCalendar date={item.date} className="mt-1" />
                <AddToCalendar date={item.date} summary={item.name || "Lễ cưới"} location={item.address} />
              </>
            ) : null}

            {item.address ? (
              <>
                <span aria-hidden="true" className="h-px w-12 bg-current opacity-30" />
                <p className="max-w-[30ch] opacity-90" style={{ fontSize: "var(--text-body)" }}>
                  {item.address}
                </p>
              </>
            ) : null}

            {item.mapUrl && isSafeHref(item.mapUrl) ? (
              /*
               * Opens the guest's own map app rather than embedding one.
               * The invitation deliberately makes no third-party request —
               * it carries the couple's guest list, home address and bank
               * details — and `csp.ts` only opens `frame-src` for YouTube.
               * See the design spec's decision 3.
               */
              <a
                href={item.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-2 rounded-full border px-6 py-2.5 uppercase transition-colors"
                style={{
                  borderColor: "color-mix(in oklab, currentColor 40%, transparent)",
                  fontSize: "var(--text-overline)",
                  letterSpacing: "var(--tracking-overline)",
                }}
              >
                <span aria-hidden="true">➜</span>
                Chỉ đường
              </a>
            ) : null}
          </InfoCard>
        );
      })}
    </SectionWrapper>
  );
}
