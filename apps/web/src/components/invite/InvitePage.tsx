"use client";

import { useState, type CSSProperties } from "react";
import type { InvitationDocument } from "@hpwd/schema";
import Link from "next/link";
import { InviteContext } from "./InviteContext";
import { MusicPlayer } from "./MusicPlayer";
import { OpeningGate } from "./opening/OpeningGate";
import { ParticlesOverlay } from "./ParticlesOverlay";
import { SectionRenderer } from "./SectionRenderer";

export interface InvitePageSettings {
  showBadge: boolean;
}

export interface InvitePageProps {
  document: InvitationDocument;
  guestName: string | null;
  settings: InvitePageSettings;
  isPreview: boolean;
  /**
   * The invitation's public slug, needed by `WishesSection` to call the
   * public wishes API. Optional (defaults to `null`) so existing callers —
   * and the future in-editor preview, which has no published slug yet —
   * don't need to pass one.
   */
  slug?: string | null;
}

/**
 * Pure presentational renderer for a full invitation: no DB or server
 * imports, everything it needs arrives as props. The public route
 * (`app/i/[slug]/page.tsx`) fetches the published document server-side and
 * renders this; the editor's live preview (Task 15) renders the exact same
 * component client-side against the in-progress draft document.
 *
 * Theme colors are applied as CSS custom properties on the root wrapper so
 * every section can reference `var(--primary)` etc. via Tailwind arbitrary
 * values without threading the theme through props.
 */
export function InvitePage({ document, guestName, settings, isPreview, slug = null }: InvitePageProps) {
  const [opened, setOpened] = useState(false);
  const themeStyle = {
    "--primary": document.theme.primary,
    "--secondary": document.theme.secondary,
    "--background": document.theme.background,
  } as CSSProperties;

  return (
    <InviteContext.Provider value={{ guestName, isPreview, slug }}>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[var(--background)]"
        style={themeStyle}
      >
        <OpeningGate opening={document.opening} guestName={guestName} onOpened={() => setOpened(true)}>
          <SectionRenderer document={document} />
        </OpeningGate>
        {/*
         * `MusicPlayer` renders here as a sibling of `OpeningGate`, never
         * inside it, so it stays mounted for the whole lifetime of the page
         * — its rising-edge autoplay detector seeds itself from the
         * *initial* `startSignal` value, so a remount with `startSignal`
         * already `true` would silently never autoplay.
         */}
        <MusicPlayer music={document.music} startSignal={opened} />
        {opened && document.opening.particles ? <ParticlesOverlay kind={document.opening.particles} /> : null}
        {settings.showBadge ? (
          <footer className="py-6 text-center text-xs text-gray-400">
            <Link href="/" className="hover:underline">
              Tạo miễn phí tại HPWD
            </Link>
          </footer>
        ) : null}
      </div>
    </InviteContext.Provider>
  );
}
