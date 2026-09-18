"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import { useRef, useState, type CSSProperties } from "react";
import type { InvitationDocument } from "@hpwd/schema";
import Link from "next/link";
import { fontFamilyStack } from "@/lib/fonts";
import { CustomFontStyle } from "./CustomFontStyle";
import { InviteContext } from "./InviteContext";
import { MusicPlayer, type MusicPlayerHandle } from "./MusicPlayer";
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
 * values without threading the theme through props. `--font-heading`/
 * `--font-body` follow the same convention for `ThemePanel`'s font-pair
 * picker (Task 16) — `globals.css`/`fonts.css` apply them to `h1`/`h2`/`h3`
 * and the rest of this subtree respectively via the `data-invite-root`
 * attribute below.
 */
export function InvitePage({ document, guestName, settings, isPreview, slug = null }: InvitePageProps) {
  const [opened, setOpened] = useState(false);
  const musicPlayerRef = useRef<MusicPlayerHandle>(null);

  // C1: called synchronously from the guest's raw tap on the opening gate
  // (`OpeningGate`'s `onTap`) — see `useOpeningTap`'s docstring for why
  // that synchronicity is the whole point. This is what actually starts
  // music on iOS; `startSignal` below (fired later, after the opening
  // animation) is the fallback for `effect: "none"` and anything else that
  // isn't a direct tap.
  function handleOpeningTap() {
    if (document.music.playAfterOpen) {
      musicPlayerRef.current?.play();
    }
  }

  const themeStyle = {
    "--primary": document.theme.primary,
    "--secondary": document.theme.secondary,
    "--background": document.theme.background,
    "--font-heading": fontFamilyStack(document.theme.headingFont),
    "--font-body": fontFamilyStack(document.theme.bodyFont),
  } as CSSProperties;

  return (
    /*
     * `<motion.div>` drags in framer-motion's WHOLE feature bundle —
     * animations, gestures, drag and layout projection — because the
     * component cannot know which of them a caller will use. Nothing on an
     * invitation drags anything or animates a layout change (there is no
     * `drag`, `layoutId` or `<AnimatePresence>` anywhere in this app), so
     * every guest was downloading and parsing the two features nobody uses.
     *
     * `<LazyMotion features={domAnimation}>` plus the `m` components declares
     * what is actually needed: animations + gestures, which is what
     * `whileInView` (every section) and the five opening effects run on —
     * `InViewFeature` lives in the gesture bundle, so scroll-triggered
     * animation still works exactly as before.
     *
     * `strict` is the guard: it makes any stray `motion.*` throw instead of
     * silently pulling the full bundle back in and quietly undoing this.
     */
    <LazyMotion features={domAnimation} strict>
      <InviteContext.Provider
        value={{ guestName, showGuestName: document.opening.showGuestName, isPreview, slug }}
      >
        <div
          data-invite-root
          className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[var(--background)]"
          style={themeStyle}
        >
          {/* `@font-face` for fonts this couple uploaded. Rendered here rather
              than in the route so the editor's live preview, which mounts
              this same component, declares them too — otherwise a custom font
              would look right when published and fall back while editing. */}
          <CustomFontStyle fonts={document.theme.customFonts} />
          <OpeningGate
            opening={document.opening}
            guestName={guestName}
            onOpened={() => setOpened(true)}
            onTap={handleOpeningTap}
          >
            <SectionRenderer document={document} />
          </OpeningGate>
          {/*
           * `MusicPlayer` renders here as a sibling of `OpeningGate`, never
           * inside it, so it stays mounted for the whole lifetime of the page
           * — its rising-edge autoplay detector seeds itself from the
           * *initial* `startSignal` value, so a remount with `startSignal`
           * already `true` would silently never autoplay.
           *
           * `startSignal` only rises once BOTH the gate has opened AND
           * `music.playAfterOpen` allows it — a couple can configure an
           * opening effect while still opting out of auto-starting audio,
           * leaving the player's own toggle button as the only way to start
           * it. `ref` is the C1 path (see `handleOpeningTap` above) — both
           * paths end up calling the exact same `playAudio`, just from
           * different moments; whichever gets there first wins in practice.
           *
           * `interactive` (C7 fix): this button is `fixed`/`z-50`, ABOVE the
           * opening overlay's `z-30` — without gating it on `opened`, it sat
           * fully tappable/focusable on top of the still-closed gate.
           * `isPreview` is included because `OpeningGate` never calls
           * `onOpened` in preview mode (see its own docstring), so `opened`
           * would otherwise never become `true` there and the editor's own
           * preview would lose the button.
           */}
          <MusicPlayer
            ref={musicPlayerRef}
            music={document.music}
            startSignal={opened && document.music.playAfterOpen}
            interactive={opened || isPreview}
          />
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
    </LazyMotion>
  );
}
