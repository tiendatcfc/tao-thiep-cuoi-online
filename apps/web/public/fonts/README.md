# Invitation fonts

The 32 `.woff2` files beside this README are the eight preset typefaces the
editor's font-pair picker offers (`FONT_OPTIONS` in
`apps/web/src/lib/fonts.ts`), each in two subsets (`latin`, `vietnamese`)
at two weights (400, 700). They are **committed**, and they are
**generated** — do not hand-edit or hand-rename them:

```
pnpm --filter @hpwd/web sync:fonts
```

copies them out of the installed `@fontsource/*` packages and rewrites
`apps/web/src/app/fonts.generated.css` to match. Re-run it when a family is
added to `FONT_OPTIONS` or a `@fontsource` package is upgraded, and commit
the result. `src/lib/__tests__/font-files.test.ts` fails if the committed
files, the generated stylesheet and the script's manifest ever drift apart,
including if a file goes missing — a 404 here is otherwise invisible,
because the browser silently falls back to Georgia/system-sans and the page
still renders perfectly, just in the wrong typeface. That is exactly what
happened for months.

## Why not `next/font/google`

Unchanged, and still the rule: this machine sits behind a corporate TLS
proxy that MITMs `fonts.gstatic.com`, so `next/font/google` and any direct
download from Google Fonts fail here — every attempt gets a proxy-signed
certificate instead of Google's, and TLS verification must never be
disabled to work around it.

What changed is only the transport. `@fontsource/*` publishes the
byte-identical Google Fonts WOFF2 subsets to the **npm registry**, which
the proxy passes through like any other package. So the files arrive over
npm, get committed like any other asset, and are served same-origin from
`/fonts/`. Nothing here contacts Google at build time or at runtime.

(That was not true of the whole app until recently: the share-preview image
renderer was reaching out to `fonts.googleapis.com` on every render. See
"The WOFF1 copies" below — it is fixed, and there is a test that keeps it
fixed.)

## Subsets, and why there are two files per weight

`latin` alone does not contain a single Vietnamese tone mark; `vietnamese`
alone contains the marks and none of the letters to put them on. Both are
needed, and both carry an explicit `unicode-range` in the generated
stylesheet — two `@font-face` rules with the same family, weight and style
but no range are **not** additive, the last declaration simply wins. The
ranges are read from each package's own `unicode.json` rather than
hardcoded, because Google revises them.

The upside of doing it properly: a guest only downloads the Vietnamese file
when the page actually uses a Vietnamese character.

`latin-ext` and `cyrillic` ship in these packages too and are deliberately
skipped — no Vietnamese wedding invitation needs them.

## The WOFF1 copies, and the Google request they removed

Beside the 32 `.woff2` sit 16 `.woff` (WOFF1) files — the same eight
families, both subsets, weight 700 only. The same `sync:fonts` run produces
them and `font-files.test.ts` guards them the same way. **No browser ever
downloads them**; a test asserts the generated stylesheet never references
them. They exist for one consumer: the share-preview image.

`apps/web/src/app/i/[slug]/opengraph-image.tsx` is rendered by `next/og`'s
`ImageResponse`, which wraps `@vercel/og` and its bundled `satori` — not a
browser, and not the code path `fonts.generated.css` feeds. satori's font
parser (verified by reading the compiled bundle) recognises only
TrueType/OpenType/Type1/WOFF1 signatures (`\x00\x01\x00\x00`, `"true"`,
`"typ1"`, `"OTTO"`, `"wOFF"`). It has **no WOFF2 handling at all**, so none
of the `.woff2` files above help it.

This used to say a human had to download a full unsubsetted TTF from Google
Fonts, because "satori takes one file per family" and a subsetted file is
useless on its own — `latin` has no diacritics, `vietnamese` has no letters.
**That premise was wrong.** satori resolves fonts *per character*: it walks
the registered fonts and picks the first one that actually has a glyph. Two
subsets both work, as long as they are registered under **different
`name`s** — same name, same weight and same style means its font store
keeps only one of them and silently drops the other. `og-font.ts` registers
them as `HPWD OG Heading` and `HPWD OG Heading VN` for exactly that reason.

### What was actually broken

Not what the old note claimed. With no font it could read, satori fell back
to its own bundled `noto-sans-v27-latin-regular.ttf` — 226 glyphs, no ễ Đ ặ
ư ờ ạ — and then, for each character it could not cover, called out at
render time to:

```
https://fonts.googleapis.com/css2?family=Noto+Sans&text=<the missing characters>
https://fonts.gstatic.com/l/font?kit=...
```

Three outbound requests per share render, one of them carrying characters
from the couple's own names in a query string to Google — from the app
whose entire premise is that it makes no third-party request. And when that
call fails (restricted egress, or this machine's TLS proxy) the names
render as empty boxes, which is the symptom the old note described without
identifying the cause.

`src/lib/__tests__/og-font.render.test.tsx` renders a real PNG of
"Nguyễn Đặng & Trường Hạnh" and asserts **zero** outbound requests, with a
control that removes the fonts and asserts the request comes back — so the
guarantee cannot decay into a test that passes because nothing fetches any
more.

### If you add a family to `FONT_OPTIONS`

Just re-run `pnpm --filter @hpwd/web sync:fonts` and commit. Both formats
come from the one manifest; there is nothing to download by hand and no
step that talks to Google.
