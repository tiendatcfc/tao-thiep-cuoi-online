import type { ComponentType } from "react";
import type { Section, SectionType } from "@hpwd/schema";
import { AlbumPanel } from "./AlbumPanel";
import { CoverPanel } from "./CoverPanel";
import { CouplePanel } from "./CouplePanel";
import { EventsPanel } from "./EventsPanel";
import { FormPanel } from "./FormPanel";
import { GiftPanel } from "./GiftPanel";
import { StoryPanel } from "./StoryPanel";
import { TextPanel } from "./TextPanel";
import { VideoPanel } from "./VideoPanel";
import { WishesPanel } from "./WishesPanel";

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
  events: EventsPanel,
  album: AlbumPanel,
  video: VideoPanel,
  gift: GiftPanel,
  wishes: WishesPanel,
  form: FormPanel,
  text: TextPanel,
};
