"use client";

import { useEffect } from "react";
import type { Section } from "@hpwd/schema";
import "lite-youtube-embed/src/lite-yt-embed.css";
import { parseYoutubeId, youtubeWatchUrl } from "@/lib/youtube";
import { SectionWrapper } from "./SectionWrapper";

/**
 * YouTube facade via lite-youtube-embed: SSR emits the <lite-youtube> tag
 * (plus a real watch-page link for no-JS guests and assistive tech); the
 * custom-element definition is imported only on the client, only when there
 * is a video — it touches HTMLElement at module scope, so importing it
 * during SSR would crash, and the iframe itself only loads when the guest
 * taps play (that's the whole point of the facade).
 *
 * SECURITY: `videoid` is ALWAYS the output of parseYoutubeId (11-char
 * allowlisted charset) — never the raw stored string, which is unvalidated
 * user input (bare z.string() in the schema, by design: tightening the
 * schema would break autosave for existing documents).
 */
export function VideoSection({ section }: { section: Extract<Section, { type: "video" }> }) {
  const { youtubeId, caption } = section.props;
  const videoId = parseYoutubeId(youtubeId);

  useEffect(() => {
    // lite-youtube-embed ships no type declarations, and — because the bare
    // specifier resolves to a real, on-disk JS file — TypeScript refuses a
    // `declare module` ambient shim for it too ("resolves to an untyped
    // module ... cannot be augmented"). Side-effect import only: it just
    // needs to run once on the client to register the custom element.
    // @ts-expect-error -- no type declarations published for this package
    if (videoId) void import("lite-youtube-embed");
  }, [videoId]);

  if (!videoId) return null;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-4">
      <h2 className="text-center text-2xl font-semibold text-[var(--primary)]">Video cưới</h2>
      <figure className="flex w-full flex-col gap-2">
        <lite-youtube
          videoid={videoId}
          playlabel={caption ? `Phát video: ${caption}` : "Phát video cưới"}
          className="w-full overflow-hidden rounded-lg"
        >
          <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer" className="lyt-visually-hidden">
            Xem video trên YouTube
          </a>
        </lite-youtube>
        <noscript>
          <a
            href={youtubeWatchUrl(videoId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-sm font-medium text-[var(--primary)] underline"
          >
            Xem video trên YouTube
          </a>
        </noscript>
        {caption ? <figcaption className="text-center text-sm text-gray-600">{caption}</figcaption> : null}
      </figure>
    </SectionWrapper>
  );
}
