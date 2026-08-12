const MAX_GUEST_NAME_LENGTH = 120;

/** Personalized link for one guest. Origin comes from NEXT_PUBLIC_SITE_URL at the call site. */
export function buildGuestLink(origin: string, slug: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/i/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`;
}

/** Guest name typed by hand or imported from a file — normalized before storing. */
export function normalizeGuestName(raw: string): string {
  return raw
    // no-control-regex isn't enabled in this repo's eslint config, so no
    // disable directive is needed here — see the "Critical: control
    // characters in source" note in the task brief for why this range is
    // written as escape sequences, never literal bytes.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_GUEST_NAME_LENGTH)
    // A cut at the length cap can land right after an already-collapsed
    // internal space, leaving it dangling at the end of the result — trim
    // once more after slicing to catch that case (the first `.trim()` above
    // only handles leading/trailing whitespace on the pre-slice string).
    .trim();
}
