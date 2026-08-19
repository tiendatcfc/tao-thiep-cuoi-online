/**
 * A YouTube video id is exactly 11 chars of [A-Za-z0-9_-]. This is the ONLY
 * shape that may ever be interpolated into embed markup — everything else
 * in this module funnels down to this check, so a raw user-typed string can
 * never reach an attribute/URL (HANDOFF group A item 1's security rule).
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
const PATH_PREFIX_RE = /^\/(?:embed|shorts|live|v)\/([^/?]+)/;

export function parseYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    candidate = url.pathname === "/watch" ? url.searchParams.get("v") : (PATH_PREFIX_RE.exec(url.pathname)?.[1] ?? null);
  }
  return candidate !== null && YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
