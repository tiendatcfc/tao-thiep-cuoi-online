"use client";

import Lightbox, { type LightboxExternalProps } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

/**
 * The lightbox plus the Captions plugin, in one module that `AlbumSection`
 * pulls in with `next/dynamic`.
 *
 * A plugin is a value, not a component, so it cannot be wrapped in
 * `next/dynamic` directly — without this wrapper the plugin (and its
 * stylesheet) would have to be imported statically and would land in the
 * bundle every `/i/[slug]` visitor parses before first paint, which is
 * exactly what the dynamic import of the lightbox itself exists to avoid.
 * Both stylesheets moved in here for the same reason.
 */
export default function AlbumLightbox(props: LightboxExternalProps) {
  return <Lightbox plugins={[Captions]} {...props} />;
}
