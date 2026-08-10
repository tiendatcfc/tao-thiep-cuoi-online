import type { Section } from "@hpwd/schema";
import { useInviteContext } from "../InviteContext";
import { SectionWrapper } from "./SectionWrapper";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatVietnameseDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Days remaining until `iso`, computed once at render time (server-rendered,
 * not a ticking client clock — the live countdown is Task 14's job). Past or
 * unparseable dates return `null` so the caption is simply omitted.
 */
function daysRemaining(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.ceil((date.getTime() - Date.now()) / MS_PER_DAY);
  return diffDays >= 0 ? diffDays : null;
}

export function CoverSection({ section }: { section: Extract<Section, { type: "cover" }> }) {
  const { guestName } = useInviteContext();
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
        // eslint-disable-next-line @next/next/no-img-element -- editor-uploaded URL, not a static asset Next can optimize
        <img
          src={coverImage}
          alt=""
          className="h-56 w-56 rounded-full object-cover shadow-lg"
        />
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
      {guestName ? <p className="text-sm text-gray-700">Kính mời: {guestName}</p> : null}
    </SectionWrapper>
  );
}
