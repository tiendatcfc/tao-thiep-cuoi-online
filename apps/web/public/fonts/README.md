# HUMAN TODO — self-hosted invitation fonts

This directory is intentionally empty in git except for this file. The
editor's font-pair picker (`ThemePanel`, backed by `FONT_OPTIONS` in
`apps/web/src/lib/fonts.ts`) and the `@font-face` rules in
`apps/web/src/app/fonts.css` both assume the 16 files below exist here.
Until someone adds them, every font falls back to its CSS fallback stack
(Georgia/system-sans/cursive) — the preview still renders correctly, just
not in the "real" typeface yet.

## Why this isn't already done

The machine this task was implemented on sits behind a corporate TLS proxy
that MITMs `fonts.gstatic.com` (and Google Fonts generally), so neither
`next/font/google` nor a plain `curl`/`fetch` to Google Fonts works from
here — every attempt gets a proxy-signed certificate instead of Google's,
which fails TLS verification (and verification must never be disabled to
work around it). Fetching these files requires a machine/network without
that interception.

## What to download

All 8 families are Google Fonts, OFL-licensed, with a Vietnamese subset.
For each, get the **regular (400)** and **bold (700)** static weights as
**WOFF2**, and name them exactly as listed (matching `FONT_OPTIONS[].file`
in `src/lib/fonts.ts`):

| Family              | Files                                                          |
| ------------------- | --------------------------------------------------------------- |
| Playfair Display    | `playfair-display-400.woff2`, `playfair-display-700.woff2`     |
| Cormorant Garamond   | `cormorant-garamond-400.woff2`, `cormorant-garamond-700.woff2` |
| Lora                 | `lora-400.woff2`, `lora-700.woff2`                              |
| Be Vietnam Pro       | `be-vietnam-pro-400.woff2`, `be-vietnam-pro-700.woff2`         |
| Quicksand            | `quicksand-400.woff2`, `quicksand-700.woff2`                    |
| Dancing Script       | `dancing-script-400.woff2`, `dancing-script-700.woff2`         |
| Merriweather         | `merriweather-400.woff2`, `merriweather-700.woff2`             |
| Inter                | `inter-400.woff2`, `inter-700.woff2`                            |

## How to get them (from a machine without the proxy)

Easiest path — [google-webfonts-helper](https://gwfh.mranftl.com/fonts)
(a well-known static mirror of the Google Fonts catalog):

1. Open `https://gwfh.mranftl.com/fonts/<font-slug>` (e.g. `playfair-display`).
2. Under "Charsets", make sure **vietnamese** is checked (in addition to
   latin) — this is what makes the font actually render Vietnamese
   diacritics correctly.
3. Under "Styles", select **regular (400)** and **700**.
4. Download the "Modern Browsers" (WOFF2-only) package.
5. Rename the two files to match the table above and drop them directly in
   this directory (`apps/web/public/fonts/`) — no subfolders.

Alternative: download directly from
`https://fonts.google.com/specimen/<Font+Name>` ("Download family", which
gives TTFs) and convert to WOFF2 with a tool like `fonttools`
(`fonttools varLib.instancer` / `woff2_compress`), keeping only the
400/700 static instances.

## Verifying

Once the files are in place, no code changes are needed — `fonts.css`'s
`@font-face` `src: url("/fonts/<file>-<weight>.woff2")` rules will resolve
instead of 404ing, and `ThemePanel`'s preview (and the real invitation
render) will pick up the actual typeface automatically.
