"use client";

import type { CSSProperties } from "react";
import type { Opening } from "@hpwd/schema";
import { formatVietnameseDate } from "@/lib/date";
import type { OpeningIdentity } from "./types";

/**
 * The typography every opening effect shows, in one place.
 *
 * Before this existed, each of the five variants hand-rolled the same
 * three lines (monogram, "Kính mời: <name>", a filled pill) with slightly
 * different sizes and weights, and every one of them showed nothing at all
 * for the common case: `createDefaultDocument` leaves `monogram` empty and
 * a guest name only exists on a personalised `?g=` link, so most couples'
 * guests met a blank screen with one button on it. The couple's names and
 * wedding date are always known — they come from the cover section — so
 * this block leads with those and treats the monogram as an optional
 * flourish rather than as the only content.
 *
 * Everything renders as `<span>`. `EnvelopeOpening` makes the entire
 * composition one `<button>` (the largest possible tap target on a phone),
 * and a button's content model only permits phrasing content, so a `<p>`
 * or `<div>` anywhere in here would be invalid markup. `block`/`flex`
 * classes give back the layout behaviour.
 */

/** Wide-tracked small caps on a coloured panel need a different ink than the same text on paper; nothing else about the block changes. */
export type OpeningTone = "ink" | "onColor";

interface ToneClasses {
  overline: string;
  display: string;
  amp: string;
  rule: string;
  caption: string;
  guestLabel: string;
  guestName: string;
}

const TONES: Record<OpeningTone, ToneClasses> = {
  ink: {
    overline: "text-[var(--ink-faint)]",
    display: "text-[var(--primary)]",
    amp: "text-[var(--secondary)]",
    rule: "bg-[var(--hairline)]",
    caption: "text-[var(--ink-soft)]",
    guestLabel: "text-[var(--ink-faint)]",
    guestName: "text-[var(--ink)]",
  },
  onColor: {
    // 75%, not 60%: `CurtainOpening`'s two panels are the couple's primary
    // AND secondary, and the secondary is usually the pale one — a label
    // that reads correctly on the dark half disappears on the light one.
    overline: "text-white/75",
    display: "text-white",
    amp: "text-white/70",
    rule: "bg-white/35",
    caption: "text-white/85",
    guestLabel: "text-white/75",
    guestName: "text-white",
  },
};

/*
 * Written in sentence case and uppercased with CSS, never typed in caps.
 * Two reasons, both real: VoiceOver and TalkBack spell all-caps strings
 * out letter by letter ("T-H-I-Ệ-P"), and the existing gate tests match
 * on the literal label text ("Mở thiệp"), which is also what a guest
 * would search for. `text-transform` changes the pixels and nothing else.
 */
const OVERLINE = "Thiệp cưới";
const GUEST_LABEL = "Kính mời";
const CTA_LABEL = "Mở thiệp";

/**
 * `12 · 10 · 2026`. Built on `formatVietnameseDate` rather than its own
 * `Intl` call so the Vietnam timezone rule stays in exactly one place (a
 * morning ceremony stored as a UTC instant renders a day early without
 * it), then respaced: at this size and tracking, slashes crowd the digits
 * and middots read as an invitation rather than as a form field.
 * `formatVietnameseDate` returns `""` for an unparseable date, which
 * becomes `null` here so the caller omits the line entirely.
 */
export function formatOpeningDate(iso: string): string | null {
  const formatted = formatVietnameseDate(iso);
  return formatted ? formatted.replaceAll("/", " · ") : null;
}

/**
 * The first letter of each person's GIVEN name, which in Vietnamese is the
 * last word of the full name ("Nguyễn Hoàng Nam" → "N"), joined as
 * `N & A`. `toLocaleUpperCase("vi")` rather than `toUpperCase()` so a name
 * beginning with đ/ơ/ư uppercases correctly.
 */
export function coupleInitials(identity: OpeningIdentity): string | null {
  const initials = [identity.groomName, identity.brideName].map((name) => {
    const given = name.trim().split(/\s+/).at(-1) ?? "";
    return Array.from(given)[0]?.toLocaleUpperCase("vi") ?? "";
  });
  if (initials.some((initial) => initial === "")) return null;
  return initials.join(" & ");
}

/**
 * What goes inside the wax seal / medallion: the couple's own monogram if
 * they wrote one, otherwise their initials, otherwise nothing (the caller
 * draws a plain ornament instead). Never falls back to placeholder text —
 * an empty seal is better than a wrong one.
 */
export function openingSigil(opening: Opening, identity: OpeningIdentity | null): string | null {
  const monogram = opening.monogram.trim();
  if (monogram) return monogram;
  return identity ? coupleInitials(identity) : null;
}

export interface OpeningCaptionProps {
  opening: Opening;
  guestName: string | null;
  identity: OpeningIdentity | null;
  tone?: OpeningTone;
  className?: string;
}

export function OpeningCaption({
  opening,
  guestName,
  identity,
  tone = "ink",
  className = "",
}: OpeningCaptionProps) {
  const c = TONES[tone];
  const date = identity ? formatOpeningDate(identity.date) : null;
  const showGuest = opening.showGuestName && Boolean(guestName);
  const monogram = opening.monogram.trim();

  const displayStyle: CSSProperties = {
    fontFamily: "var(--font-heading, inherit)",
    fontSize: "var(--text-display)",
    lineHeight: "var(--leading-display)",
    letterSpacing: "var(--tracking-display)",
  };

  return (
    <span className={`flex flex-col items-center text-center ${className}`.trim()}>
      <span
        className={`block uppercase ${c.overline}`}
        style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
      >
        {OVERLINE}
      </span>

      {identity ? (
        <span className="mt-5 flex flex-col items-center">
          <span className={`block ${c.display}`} style={displayStyle}>
            {identity.groomName}
          </span>
          <span
            className={`my-0.5 block ${c.amp}`}
            style={{ fontFamily: "var(--font-heading, inherit)", fontSize: "var(--text-lead)" }}
          >
            &amp;
          </span>
          <span className={`block ${c.display}`} style={displayStyle}>
            {identity.brideName}
          </span>
        </span>
      ) : monogram ? (
        /* No cover section to read names from — the editor's preview of a
           document that has not got one yet, and the older tests. The
           monogram is then the only thing this couple has given us. */
        <span className={`mt-5 block ${c.display}`} style={displayStyle}>
          {monogram}
        </span>
      ) : null}

      {date ? (
        <span className="mt-6 flex flex-col items-center gap-3">
          <span aria-hidden="true" className={`block h-px w-12 ${c.rule}`} />
          <span
            className={`block ${c.caption}`}
            style={{ fontSize: "var(--text-caption)", letterSpacing: "var(--tracking-caption)" }}
          >
            {date}
          </span>
        </span>
      ) : null}

      {showGuest ? (
        <span className="mt-7 flex flex-col items-center gap-1.5">
          <span
            className={`block uppercase ${c.guestLabel}`}
            style={{ fontSize: "var(--text-overline)", letterSpacing: "var(--tracking-overline)" }}
          >
            {GUEST_LABEL}
          </span>
          <span className={`block ${c.guestName}`} style={{ fontSize: "var(--text-lead)" }}>
            {guestName}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The gate's call to action. A hairline outline rather than a filled,
 * drop-shadowed pill: on a page whose accent is a colour the couple chose,
 * a solid block of that colour is the loudest thing on screen and pulls
 * the eye off the names. The outline keeps the same 44px-plus tap height.
 *
 * Rendered as a `<span>` and NOT as a `<button>`: `EnvelopeOpening` nests
 * it inside its own single full-composition button, and nested buttons are
 * invalid. The variants where this is the only control wrap it in their
 * own `<button>`.
 */
export function OpeningCta({ tone = "ink", className = "" }: { tone?: OpeningTone; className?: string }) {
  const onColor = tone === "onColor";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border uppercase px-9 py-3.5 transition-colors ${
        onColor ? "text-white" : "text-[var(--primary)]"
      } ${className}`.trim()}
      style={{
        fontSize: "var(--text-overline)",
        letterSpacing: "var(--tracking-overline)",
        // `color-mix` rather than a fixed tint: `--primary` is whatever the
        // couple picked, so a hardcoded rgba outline would be invisible on
        // a pale theme and harsh on a dark one.
        borderColor: onColor ? "rgba(255,255,255,0.45)" : "color-mix(in oklab, var(--primary) 32%, transparent)",
        backgroundColor: onColor ? "rgba(255,255,255,0.08)" : "color-mix(in oklab, var(--primary) 5%, transparent)",
      }}
    >
      {CTA_LABEL}
    </span>
  );
}
