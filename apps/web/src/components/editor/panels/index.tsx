"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Section, SectionType } from "@hpwd/schema";
import { AlbumPanel } from "./AlbumPanel";
import { CoverPanel } from "./CoverPanel";
import { CouplePanel } from "./CouplePanel";
import { EventsPanel } from "./EventsPanel";
import { FormPanel } from "./FormPanel";
import { GiftPanel } from "./GiftPanel";
import { DressCodePanel } from "./DressCodePanel";
import { StoryPanel } from "./StoryPanel";
import { TimelinePanel } from "./TimelinePanel";
import { VideoPanel } from "./VideoPanel";
import { WishesPanel } from "./WishesPanel";

/**
 * TipTap, and the ProseMirror it sits on, is 159 kB gzipped — 47% of
 * everything the editor route loaded before first paint, measured from the
 * build manifest. Exactly one panel needs it, and `selectedSectionId` starts
 * as `null`, so nothing renders any panel until the couple picks a section:
 * every couple was paying for the rich-text editor up front, and only the
 * ones who add a text section ever use it.
 *
 * Same treatment as `AlbumSection`'s lightbox, for the same reason. `ssr:
 * false` because the panel is editor-only UI that never server-renders, and
 * a `loading` state because the couple should see the panel appear rather
 * than an empty box while the chunk arrives.
 */
const TextPanel = dynamic(() => import("./TextPanel").then((m) => m.TextPanel), {
  ssr: false,
  loading: () => <p className="text-sm text-gray-400">Đang tải trình soạn thảo…</p>,
});

/**
 * One property panel per `SectionType`, mirroring `SectionRenderer`'s
 * registry (Task 8): the mapped-type keeps each entry typed to exactly its
 * own section's props, so pairing e.g. `couple` with `EventsPanel` is a
 * compile error, not a runtime surprise.
 */
export const panelRegistry: { [K in SectionType]: ComponentType<{ section: Extract<Section, { type: K }> }> } = {
  cover: CoverPanel,
  couple: CouplePanel,
  story: StoryPanel,
  dresscode: DressCodePanel,
  timeline: TimelinePanel,
  events: EventsPanel,
  album: AlbumPanel,
  video: VideoPanel,
  gift: GiftPanel,
  wishes: WishesPanel,
  form: FormPanel,
  text: TextPanel,
};
