import type { Section } from "@hpwd/schema";
import { VN_TIME_ZONE } from "@/lib/date";
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

export function EventsSection({ section }: { section: Extract<Section, { type: "events" }> }) {
  const { items } = section.props;

  return (
    <SectionWrapper section={section} className="flex flex-col gap-6">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Thời gian &amp; Địa điểm</h2>
      {items.map((item, index) => {
        const formattedDate = formatEventDate(item.date);
        return (
          // Event entries have no stable id in the schema; index is safe
          // here for the same reason as StorySection (whole-list replace).
          <div key={index} className="flex flex-col gap-1 rounded-xl border border-[var(--secondary)] p-4">
            {item.name ? <p className="text-lg font-semibold text-[var(--primary)]">{item.name}</p> : null}
            {item.time || formattedDate ? (
              <p className="text-sm text-gray-700">
                {[item.time, formattedDate].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {item.address ? <p className="text-sm text-gray-600">{item.address}</p> : null}
            {item.mapUrl ? (
              <a
                href={item.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-medium text-[var(--primary)] underline"
              >
                Xem bản đồ
              </a>
            ) : null}
          </div>
        );
      })}
    </SectionWrapper>
  );
}
