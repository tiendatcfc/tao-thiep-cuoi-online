# Group A — "Promised but not delivered" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 8 gaps in HANDOFF group A where the editor saves data guests never see (video section, album layouts, real image processing/blur, no-JS opening-gate trap, per-section animation UI, landing-page mislabels, preview badge hardcode, mapUrl scheme hole).

**Architecture:** All changes live in `apps/web` (Next.js 15 app router, React 19) with zero schema-shape changes to `packages/schema` (only reading fields that already exist — the schema already supports everything these tasks render). The image task replaces the presign+browser-PUT upload flow with a server-side multipart route that runs the existing `processImage` (sharp) pipeline. All other tasks are render/editor wiring.

**Tech Stack:** Next.js 15.5, React 19.1, zod 4, zustand 5, framer-motion 13, sharp 0.35, vitest 4 + @testing-library/react, `lite-youtube-embed@0.3.4` (new dependency, Task 1).

**Spec:** `docs/superpowers/HANDOFF.md` — section "Nhóm A" (items 1–8). Ledgers in `.superpowers/sdd/*/progress.md` carry binding precedent (rulings, invariants).

## Global Constraints

These bind EVERY task. Violating any of them has already caused real blockers in this repo (see HANDOFF "BẤT BIẾN").

1. **Never read browser-only capabilities (`navigator.*`, `window.matchMedia`, `window.*`) during render** — only inside `useEffect`. Caused 3 hydration bugs.
2. **Every editor action must leave the document passing `InvitationDocumentSchema.parse`**, or autosave silently stops saving the WHOLE invitation. Corollary: **no schema tightening that could invalidate existing stored documents** (e.g. never add `.refine`/`.regex` to `mapUrl` or `youtubeId` — old documents contain arbitrary strings there).
3. Owner routes: 401 unauthenticated (`UNAUTHENTICATED_MESSAGE` from `@/lib/ownership`), 404 for both missing and not-owned via `findOwnedInvitation`. Never 403. Error shape is always `NextResponse.json({ error: "<Vietnamese>" }, { status: N })`.
4. Opening effects must call `onOpen` synchronously in the tap handler path via `useOpeningTap` (iOS WebView audio). Task 4 must not alter `useOpeningTap` or the tap→open flow semantics.
5. `publish` deliberately does NOT participate in the `version` check. Do not touch it.
6. `/i/[slug]` must stay dynamically rendered (no `export const dynamic`, no caching) — 308 slug-redirect safety depends on it.
7. No watermark, ever. The footer badge is controlled by `settings.showBadge` only.
8. All user-facing copy is Vietnamese.
9. **Test evidence rule:** for every test that is primary evidence of a requirement, the implementer must demonstrate failure power — revert/disable the behavior, run the test, paste the RED output, restore, paste the GREEN output. A test that never went red proves nothing (this repo shipped vacuous tests three times).
10. **Both-directions rule:** the implementer's self-review must explicitly describe BOTH directions of every interaction it touches (e.g. editor writes → guest renders AND guest-render assumptions → editor writes; JS-on AND JS-off; save wins AND save loses). Single-direction analysis missed real bugs 4 times in a row in this repo.
11. Tests live in `__tests__/` directories (vitest `include` glob requires it). Component tests start with `// @vitest-environment jsdom` and use explicit imports from `vitest` — no globals. Run one file: `cd apps/web && pnpm vitest run <path relative to apps/web>`. Full gate before commit: `cd apps/web && pnpm vitest run && pnpm lint && pnpm exec tsc --noEmit`.
12. Env quirks: corporate proxy MITMs `fonts.gstatic.com` (never add `next/font/google`); binary downloads need `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem`; NEVER `NODE_TLS_REJECT_UNAUTHORIZED=0`. `pnpm add` for pure-JS packages works normally.

---

### Task 1: Render the YouTube video section (parse-then-render, lite-youtube-embed facade)

**Files:**
- Create: `apps/web/src/lib/youtube.ts`
- Create: `apps/web/src/lib/__tests__/youtube.test.ts`
- Create: `apps/web/src/types/lite-youtube.d.ts`
- Modify: `apps/web/src/components/invite/sections/VideoSection.tsx` (currently 7 lines, returns null)
- Create: `apps/web/src/components/invite/sections/__tests__/VideoSection.test.tsx`
- Modify: `apps/web/src/components/editor/panels/VideoPanel.tsx` (accept URL-or-ID, warn on unparseable)
- Modify: `apps/web/src/components/editor/panels/__tests__/VideoPanel.test.tsx`
- Modify: `apps/web/src/components/invite/SectionRenderer.tsx` (stale docblock only: remove "`video` renders `null` (Phase 2); `wishes`/`form` are placeholder shells…")
- Modify: `apps/web/package.json` (add `lite-youtube-embed`)

**Interfaces:**
- Consumes: `VideoPropsSchema { youtubeId: z.string(), caption: z.string() }` (`packages/schema/src/invitation.ts:126-132` — unchanged); `SectionWrapper`; panel `patch()` convention.
- Produces: `parseYoutubeId(input: string): string | null` and `youtubeWatchUrl(id: string): string` in `@/lib/youtube` (Task 6 flips the landing-page `youtube-embed` flag on the strength of this task).

**Security requirement (from HANDOFF verbatim):** only a value that has passed the parse function may ever reach the embed markup. Raw `section.props.youtubeId` must NEVER be interpolated into any URL or attribute.

- [ ] **Step 1: Install the dependency**

```bash
cd apps/web && pnpm add lite-youtube-embed
```

Verify `lite-youtube-embed` appears in `apps/web/package.json` dependencies and the lockfile updated. (Pure JS package, no postinstall binary — no CA cert needed.)

- [ ] **Step 2: Write the failing parser tests**

`apps/web/src/lib/__tests__/youtube.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseYoutubeId, youtubeWatchUrl } from "../youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeId", () => {
  it.each([
    [ID, ID],
    [`  ${ID}  `, ID],
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`http://youtube.com/watch?v=${ID}&t=42s`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=abc123`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/live/${ID}`, ID],
    [`https://www.youtube-nocookie.com/embed/${ID}`, ID],
  ])("extracts the id from %s", (input, expected) => {
    expect(parseYoutubeId(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["not a video"],
    ["dQw4w9WgXc"], // 10 chars
    ["dQw4w9WgXcQQ"], // 12 chars
    ['dQw4w9WgXc"'], // invalid charset
    ["javascript:alert(1)"],
    [`javascript:alert(1)//${ID}`],
    [`https://evil.com/watch?v=${ID}`], // wrong host
    [`https://youtube.com.evil.com/watch?v=${ID}`], // host suffix trick
    [`https://www.youtube.com/watch?v=<script>`],
    [`ftp://youtube.com/watch?v=${ID}`],
    ["https://www.youtube.com/watch"], // no v param
  ])("rejects %s", (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});

describe("youtubeWatchUrl", () => {
  it("builds the canonical watch URL", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `cd apps/web && pnpm vitest run src/lib/__tests__/youtube.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement the parser**

`apps/web/src/lib/youtube.ts`:

```ts
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
```

- [ ] **Step 5: Run parser tests to green**, then commit: `feat(video): YouTube id parser (allowlist shape, URL forms)`

- [ ] **Step 6: Write the failing VideoSection tests**

`apps/web/src/components/invite/sections/__tests__/VideoSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { Section } from "@hpwd/schema";
import { createSection } from "@hpwd/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoSection } from "../VideoSection";

// The web-component module registers a custom element and pulls CSS — both
// meaningless under jsdom. The component imports it lazily in useEffect; mock
// it so the dynamic import resolves without side effects.
vi.mock("lite-youtube-embed", () => ({}));

const ID = "dQw4w9WgXcQ";

function videoSection(props: { youtubeId: string; caption: string }): Extract<Section, { type: "video" }> {
  const base = createSection("video") as Extract<Section, { type: "video" }>;
  return { ...base, props };
}

describe("VideoSection", () => {
  it("renders nothing when youtubeId is empty", () => {
    const { container } = render(<VideoSection section={videoSection({ youtubeId: "", caption: "" })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when youtubeId cannot be parsed (never interpolates raw input)", () => {
    const { container } = render(
      <VideoSection section={videoSection({ youtubeId: 'javascript:alert(1)"', caption: "x" })} />,
    );
    expect(container.firstChild).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
  });

  it("renders a lite-youtube facade carrying the PARSED id when the stored value is a full URL", () => {
    const { container } = render(
      <VideoSection section={videoSection({ youtubeId: `https://youtu.be/${ID}?si=tracker`, caption: "" })} />,
    );
    const embed = container.querySelector("lite-youtube");
    expect(embed).not.toBeNull();
    expect(embed?.getAttribute("videoid")).toBe(ID);
    // Raw stored value must not leak into any attribute of the embed.
    expect(container.innerHTML).not.toContain("si=tracker");
  });

  it("renders a lite-youtube facade for a bare id, with a watch-page fallback link", () => {
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);
    expect(container.querySelector("lite-youtube")?.getAttribute("videoid")).toBe(ID);
    const link = screen.getByRole("link", { name: /Xem video trên YouTube/ });
    expect(link).toHaveAttribute("href", `https://www.youtube.com/watch?v=${ID}`);
  });

  it("renders the caption when present, and no figcaption when empty", () => {
    render(<VideoSection section={videoSection({ youtubeId: ID, caption: "Video cưới của chúng tôi" })} />);
    expect(screen.getByText("Video cưới của chúng tôi")).toBeInTheDocument();
    const { container } = render(<VideoSection section={videoSection({ youtubeId: ID, caption: "" })} />);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
```

- [ ] **Step 7: Run to verify failure** (component still returns null) — paste RED output.

- [ ] **Step 8: Implement VideoSection**

`apps/web/src/types/lite-youtube.d.ts`:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lite-youtube": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        videoid: string;
        playlabel?: string;
      };
    }
  }
}
```

`apps/web/src/components/invite/sections/VideoSection.tsx`:

```tsx
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
```

Note: if React 19 renders `className` on the custom element as a `className` attribute instead of `class` (check the DOM in the test), switch to `class=` via the `.d.ts` (add `class?: string`) — verify in jsdom output rather than assuming. If the `getByRole("link")` query fails because there are two links (visually-hidden + noscript), scope with `container.querySelector('lite-youtube a')` — adjust the test, keeping both links asserted.

- [ ] **Step 9: Run VideoSection tests to green.** Paste output. Then failure-power check (Global Constraint 9): temporarily change `videoid={videoId}` to `videoid={youtubeId}` — the full-URL test and the javascript: test must go RED; restore; paste both outputs.

- [ ] **Step 10: Update VideoPanel to accept URL-or-ID and warn on unparseable input**

Replace the `youtubeId` TextField block in `apps/web/src/components/editor/panels/VideoPanel.tsx`:

```tsx
"use client";

import type { Section, VideoProps } from "@hpwd/schema";
import { parseYoutubeId } from "@/lib/youtube";
import { useEditorStore } from "@/stores/editor-store";
import { TextField } from "../fields/TextField";

export function VideoPanel({ section }: { section: Extract<Section, { type: "video" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { youtubeId, caption } = section.props;

  function patch(next: Partial<VideoProps>) {
    updateSectionProps(section.id, next);
  }

  const unparseable = youtubeId !== "" && parseYoutubeId(youtubeId) === null;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Video YouTube"
        value={youtubeId}
        // A pasted URL is normalized to the bare id; anything unparseable is
        // stored as typed (schema allows any string — see Global Constraint 2)
        // and flagged below instead of silently dropped mid-typing.
        onChange={(v) => patch({ youtubeId: parseYoutubeId(v) ?? v })}
        hint="Dán liên kết YouTube (youtube.com/watch?v=…, youtu.be/…) hoặc mã video 11 ký tự, ví dụ dQw4w9WgXcQ"
      />
      {unparseable ? (
        <p className="text-xs text-red-500" role="alert">
          Không nhận diện được video — video sẽ không hiển thị trên thiệp cho tới khi liên kết hợp lệ.
        </p>
      ) : null}
      <TextField label="Chú thích" value={caption} onChange={(v) => patch({ caption: v })} />
    </div>
  );
}
```

Add panel tests (extend `VideoPanel.test.tsx`): pasting `https://youtu.be/dQw4w9WgXcQ` stores `dQw4w9WgXcQ` in the store; typing garbage stores it verbatim AND shows the `role="alert"` warning; a valid id shows no warning. Check how `TextField` debounces/fires onChange (see the existing test's blur pattern) and follow it.

- [ ] **Step 11: Update the stale SectionRenderer docblock** (registry comment claims `video` renders null and wishes/form are placeholders — say instead that all ten types render real content).

- [ ] **Step 12: Full gate + commit.** `cd apps/web && pnpm vitest run && pnpm lint && pnpm exec tsc --noEmit` — all green (also confirm `pnpm build` passes since a new CSS import + custom element are involved). Commit: `feat(video): render YouTube section via lite-youtube-embed facade, parse-then-render only`

---

### Task 2: AlbumSection renders the chosen layout (grid / masonry / carousel)

**Files:**
- Modify: `apps/web/src/components/invite/sections/AlbumSection.tsx` (lines 28–82; the hardcoded `grid w-full grid-cols-2 gap-2` at line 44)
- Modify: `apps/web/src/components/invite/__tests__/AlbumSection.test.tsx`

**Interfaces:**
- Consumes: `AlbumPropsSchema { layout: z.enum(['grid','masonry','carousel']), images }` — already saved by `AlbumPanel` (`LAYOUT_OPTIONS` grid/masonry/carousel = Lưới/Xếp tầng/Băng chuyền).
- Produces: `data-album-layout="<layout>"` attribute on the image container (test hook, mirrors the existing `data-animate` convention).

Requirements:
- `grid` must render EXACTLY the current markup (fixed 2-col, `aspect-square` tiles, `fill` images) — zero visual regression for every existing invitation.
- `masonry`: CSS columns (`columns-2 gap-2`), tiles keep natural aspect ratio — use `next/image` with intrinsic `width`/`height` (schema guarantees positive ints) and `className="h-auto w-full"`, wrapper `mb-2 break-inside-avoid`.
- `carousel`: horizontal scroll-snap (`flex snap-x snap-mandatory overflow-x-auto`), each tile `w-4/5 shrink-0 snap-center aspect-[3/4]` with `fill` images, `sizes="(max-width: 430px) 80vw, 344px"`.
- Lightbox behavior identical in all three layouts (click index N → lightbox opens at N; `slides` memoization untouched).
- Update the component docblock (it currently documents the fixed-grid shortcut).

- [ ] **Step 1: Write the failing layout tests** (extend `AlbumSection.test.tsx`; the existing `albumSection()` helper hardcodes `layout: "grid"` — generalize it to accept a layout param, defaulting to `"grid"` so existing tests stay untouched):

```tsx
it.each(["grid", "masonry", "carousel"] as const)(
  "renders the container for layout=%s with its distinguishing classes",
  (layout) => {
    const { container } = render(<AlbumSection section={albumSection(images, layout)} />);
    const el = container.querySelector(`[data-album-layout="${layout}"]`);
    expect(el).not.toBeNull();
    if (layout === "grid") expect(el?.className).toContain("grid-cols-2");
    if (layout === "masonry") expect(el?.className).toContain("columns-2");
    if (layout === "carousel") expect(el?.className).toContain("snap-x");
  },
);

it("opens the lightbox at the clicked index under the carousel layout too", () => {
  render(<AlbumSection section={albumSection(images, "carousel")} />);
  fireEvent.click(screen.getAllByRole("img")[2]);
  expect(lightboxSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, index: 2 }));
});

it("never renders a layout container other than the selected one", () => {
  const { container } = render(<AlbumSection section={albumSection(images, "masonry")} />);
  expect(container.querySelectorAll("[data-album-layout]")).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify RED** (no `data-album-layout` exists today). Paste output.

- [ ] **Step 3: Implement.** Destructure `layout` from `section.props`. Keep one shared click handler and one memoized `slides`. Suggested structure — a small `tileFor(image, index)` per layout or three explicit branches; either is fine as long as the grid branch's markup is byte-identical to today's (same classes, same `sizes`, same placeholder/blur logic) plus the new `data-album-layout="grid"` attribute. Masonry branch uses intrinsic sizing:

```tsx
<Image
  src={image.url}
  alt={`Ảnh cưới ${index + 1}`}
  width={image.width}
  height={image.height}
  sizes="(max-width: 430px) 50vw, 215px"
  placeholder={image.blurDataUrl ? "blur" : "empty"}
  blurDataURL={image.blurDataUrl || undefined}
  className="h-auto w-full"
  loading="lazy"
/>
```

- [ ] **Step 4: Run all AlbumSection tests to green** (including the pre-existing 4 + codeSplit). Failure-power: revert the container to the old hardcoded grid div for all layouts — masonry/carousel tests must go RED; restore. Paste outputs.

- [ ] **Step 5: Full gate + commit:** `feat(album): render the masonry and carousel layouts the editor already saves`

---

### Task 3: Wire `processImage` — real WebP variants + real blur placeholders, server-side upload

**Files:**
- Create: `apps/web/src/lib/upload.ts` (orchestration: processImage → storage PUTs → MediaAsset row)
- Create: `apps/web/src/lib/__tests__/upload.test.ts`
- Modify: `apps/web/src/lib/storage.ts` (replace `createSignedUploadUrl` with a plain `putObject`; delete the presigner import)
- Modify: `apps/web/src/app/api/uploads/route.ts` (JSON-presign exchange → multipart file upload)
- Modify: that route's existing tests under `apps/web/src/app/api/uploads/__tests__/` (locate them; update to the new contract)
- Modify: `apps/web/src/components/editor/fields/ImageField.tsx` (FormData POST; consume server-measured dims + blurDataUrl; delete `readImageDimensions`)
- Modify: `apps/web/src/components/editor/fields/__tests__/ImageField.test.tsx` (locate; update)
- Modify: `apps/web/src/components/editor/panels/AlbumPanel.tsx` (real `blurDataUrl` from upload result instead of `TRANSPARENT_PIXEL_DATA_URL` at line 73; line 27's empty-row placeholder KEEPS the transparent pixel)
- Modify: `apps/web/package.json` (remove `@aws-sdk/s3-request-presigner` if nothing else imports it — grep first)

**Interfaces:**
- Consumes: `processImage(buffer): Promise<{ variants: {width, buffer}[], blurDataUrl, width, height }>` from `@/lib/image` (UNCHANGED — this task's whole point is to finally call it); `AlbumImageSchema { url, width: int>0, height: int>0, blurDataUrl }`.
- Produces: `POST /api/uploads` accepting `multipart/form-data` with field `file`, responding `{ url, width, height, blurDataUrl, assetId }`; `ImageUploadedMeta` gains `blurDataUrl: string`.

**Design decisions (already ruled — do not re-litigate, but flag genuine conflicts):**
- The browser no longer PUTs to storage at all. This kills the browser→storage CORS dependence (MinIO has no bucket-level CORS API; R2 needed PutBucketCors) for images entirely. `scripts` like `init-bucket.mjs` stay untouched.
- The server uploads EVERY variant `processImage` returns, keyed `u/{userId}/{assetId}-{width}.webp`, and the canonical `url` returned to the client is the LARGEST variant. `width`/`height` in the response are the SOURCE dimensions (aspect ratio identical across variants — document this in a comment).
- `MediaAsset.meta` (untyped Json) stores `{ contentType: "image/webp", sourceContentType, sourceSizeBytes, width, height, blurDataUrl, variants: [{ width, url }] }`. No Prisma migration.
- `createSignedUploadUrl` and its tests are DELETED (its only caller was this route; leaving it would recreate the exact dead-code disease this task exists to cure). Phase 2 Task 6 (audio) can resurrect it from git history.
- Size cap stays 10MB, enforced on `file.size` after `request.formData()` AND pre-checked client-side as today. A body that isn't a decodable image → 400 `"Tệp không phải là ảnh hợp lệ, vui lòng thử lại."` (sharp failing to decode IS the magic-byte check — declared MIME is only a UX pre-filter).

- [ ] **Step 1: Write the failing upload-lib tests**

`apps/web/src/lib/__tests__/upload.test.ts` — follow `image.test.ts`'s pattern of generating a real PNG with sharp; mock the S3 client and prisma:

```ts
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendSpy, createSpy } = vi.hoisted(() => ({ sendSpy: vi.fn(), createSpy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return { ...actual, S3Client: class { send = sendSpy; } };
});
vi.mock("@hpwd/db", () => ({ prisma: { mediaAsset: { create: createSpy } } }));

import { processAndStoreImage } from "../upload";

beforeEach(() => {
  sendSpy.mockReset().mockResolvedValue({});
  createSpy.mockReset().mockResolvedValue({});
  process.env.R2_ENDPOINT = "http://localhost:9000";
  process.env.R2_ACCESS_KEY_ID = "k";
  process.env.R2_SECRET_ACCESS_KEY = "s";
  process.env.R2_BUCKET = "hpwd";
  process.env.R2_PUBLIC_URL = "http://localhost:9000/hpwd";
});

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 120 } } })
    .png()
    .toBuffer();
}

describe("processAndStoreImage", () => {
  it("uploads one object per variant and returns the largest as the canonical url", async () => {
    const result = await processAndStoreImage({ userId: "u1", buffer: await pngBuffer(1200, 800), sourceContentType: "image/png" });
    // 1200-wide source → variants 400 + 800 (processImage never upscales)
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(result.url).toMatch(/-800\.webp$/);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("records a MediaAsset row whose meta carries dimensions, blur and every variant url", async () => {
    await processAndStoreImage({ userId: "u1", buffer: await pngBuffer(1200, 800), sourceContentType: "image/png" });
    const data = createSpy.mock.calls[0][0].data;
    expect(data.kind).toBe("image");
    expect(data.meta.width).toBe(1200);
    expect(data.meta.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(data.meta.variants).toHaveLength(2);
  });

  it("throws (and uploads nothing) for a buffer that is not an image", async () => {
    await expect(
      processAndStoreImage({ userId: "u1", buffer: Buffer.from("not an image"), sourceContentType: "image/png" }),
    ).rejects.toThrow();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
```

Adjust the S3 mock to whatever `storage.ts` actually ends up exporting (the point is: N PutObject sends, then one MediaAsset create, ordered so a storage failure leaves no orphan DB row — same ordering rationale as the deleted presign code's docblock).

- [ ] **Step 2: RED run.** Paste output.

- [ ] **Step 3: Implement `upload.ts` + reshape `storage.ts`.**

`storage.ts` keeps: `requireEnv`, `getS3Client`, `EXTENSION_BY_CONTENT_TYPE` (may shrink), and gains:

```ts
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = requireEnv("R2_BUCKET");
  const publicBaseUrl = requireEnv("R2_PUBLIC_URL");
  const client = getS3Client();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength }));
  return `${publicBaseUrl}/${key}`;
}
```

`upload.ts`:

```ts
import { randomUUID } from "crypto";
import { prisma } from "@hpwd/db";
import { processImage } from "./image";
import { putObject } from "./storage";

export interface ProcessAndStoreImageParams {
  userId: string;
  buffer: Buffer;
  sourceContentType: string;
}

export interface ProcessAndStoreImageResult {
  url: string;
  width: number;
  height: number;
  blurDataUrl: string;
  assetId: string;
}

/**
 * The server-side image pipeline: decode+resize via processImage (which
 * doubles as the magic-byte check — a non-image buffer throws before
 * anything is written), upload every WebP variant, then record ONE
 * MediaAsset row. Storage writes happen before the DB row for the same
 * reason the old presign code ordered env validation first: a failure must
 * never leave a MediaAsset row pointing at objects that don't exist.
 *
 * `width`/`height` are the SOURCE dimensions; the canonical `url` is the
 * largest generated variant. Every variant shares the source aspect ratio,
 * which is all next/image needs them for.
 */
export async function processAndStoreImage(params: ProcessAndStoreImageParams): Promise<ProcessAndStoreImageResult> {
  const { userId, buffer, sourceContentType } = params;
  const { variants, blurDataUrl, width, height } = await processImage(buffer);
  const assetId = randomUUID();

  const uploaded = [];
  for (const variant of variants) {
    const url = await putObject(`u/${userId}/${assetId}-${variant.width}.webp`, variant.buffer, "image/webp");
    uploaded.push({ width: variant.width, url });
  }
  const canonical = uploaded[uploaded.length - 1];

  await prisma.mediaAsset.create({
    data: {
      id: assetId,
      userId,
      kind: "image",
      url: canonical.url,
      meta: { contentType: "image/webp", sourceContentType, sourceSizeBytes: buffer.byteLength, width, height, blurDataUrl, variants: uploaded },
    },
  });

  return { url: canonical.url, width, height, blurDataUrl, assetId };
}
```

(`processImage` returns variants in ascending width order — `TARGET_WIDTHS` is `[400, 800, 1600]` filtered; verify with a quick read before relying on `uploaded[uploaded.length - 1]`, or `Math.max` over widths.)

Delete `createSignedUploadUrl`, its interfaces, `SIGNED_UPLOAD_TTL_SECONDS`, the presigner import, and its test cases.

- [ ] **Step 4: Rewrite the route.**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { processAndStoreImage } from "@/lib/upload";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập để tải ảnh lên." }, { status: 401 });
  }

  let file: File;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
    }
    file = candidate;
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Định dạng ảnh phải là JPEG, PNG hoặc WebP." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "Kích thước ảnh tối đa là 10MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processAndStoreImage({ userId: session.user.id, buffer, sourceContentType: file.type });
  } catch (err) {
    // sharp failing to decode means the bytes are not a real image, whatever
    // the declared MIME said — a client error, not a server one.
    if (isImageDecodeError(err)) {
      return NextResponse.json({ error: "Tệp không phải là ảnh hợp lệ, vui lòng thử lại." }, { status: 400 });
    }
    console.error("processAndStoreImage failed:", err);
    return NextResponse.json({ error: "Không thể tải ảnh lên, vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json(processed);
}
```

For `isImageDecodeError`: the clean implementation is a dedicated error class — have `upload.ts` wrap the `processImage` call in try/catch and rethrow `new ImageDecodeError(...)` (exported), so the route's check is `err instanceof ImageDecodeError`, with the decode-vs-storage boundary unit-tested in `upload.test.ts` (decode failure → ImageDecodeError; S3 send failure → NOT ImageDecodeError). Update the route tests: 401; non-form body 400; oversize 400; bad MIME 400; garbage bytes 400 (real sharp, no mock); happy path (mock `@/lib/upload`) returns url/width/height/blurDataUrl.

- [ ] **Step 5: Update `ImageField.tsx`.** Delete `readImageDimensions` (server measures now). `ImageUploadedMeta` gains `blurDataUrl: string`. Upload body:

```ts
const formData = new FormData();
formData.append("file", file);
const res = await fetch("/api/uploads", { method: "POST", body: formData });
if (!res.ok) throw new Error(`POST /api/uploads failed with status ${res.status}`);
const meta = (await res.json()) as { url: string; width: number; height: number; blurDataUrl: string };
setStatus("idle");
onChange(meta.url);
onUploaded?.(meta);
```

Keep: the client-side type/size pre-checks, the input reset, the uploading-disabled state, the error copy (all unchanged). Update `ImageField` tests to the single-fetch contract (no more PUT; assert FormData body carries the file).

- [ ] **Step 6: Update `AlbumPanel.tsx`** — in the `onUploaded` callback replace `blurDataUrl: TRANSPARENT_PIXEL_DATA_URL` with `blurDataUrl: meta.blurDataUrl`. The `createEmptyImage()` (line 27) placeholder row keeps the transparent pixel (there is no real image yet). Update `TRANSPARENT_PIXEL_DATA_URL`'s docblock in `ImageField.tsx` — its "HUMAN TODO / Phase 2" paragraph is now done; the constant survives only for empty placeholder rows. Add/extend an AlbumPanel test: simulated upload result with a real-looking blurDataUrl lands in the store row (and round-trips `InvitationDocumentSchema.parse`).

- [ ] **Step 7: Failure-power passes.** (a) Revert AlbumPanel to the transparent pixel → the new blur test goes RED. (b) In `upload.ts`, skip the MediaAsset create → the meta test goes RED. (c) In the route, drop the size check → oversize test RED. Restore each; paste outputs.

- [ ] **Step 8: Manual end-to-end smoke** (MinIO is running): `cd apps/web && pnpm dev` + `curl -s -X POST -F "file=@<some real jpg>" http://localhost:3000/api/uploads` → expect 401 (unauthenticated — proves multipart reaches the handler). Full gate (`vitest run`, `lint`, `tsc --noEmit`, `pnpm build`) + grep that `s3-request-presigner` has no remaining imports before removing it from package.json. Commit: `feat(uploads): process images server-side (WebP variants + real blur), retire browser-PUT presign flow`

---

### Task 4: Guests with JavaScript disabled must not be trapped behind the opening overlay

**Files:**
- Modify: `apps/web/src/components/invite/opening/OpeningGate.tsx` (the `<div aria-hidden={!opened} inert={...}>` wrapper at line ~100)
- Modify: `apps/web/src/app/i/layout.tsx` (extend the existing `<noscript><style>` block)
- Create: `apps/web/src/components/invite/opening/__tests__/OpeningGate.nojs.test.tsx`
- Modify: existing `OpeningGate` tests if the deferred-attributes change breaks their assumptions (check `apps/web/src/components/invite/__tests__/`)

**Interfaces:**
- Consumes: `useOpeningTap` (UNTOUCHED — Global Constraint 4), `InviteContext`'s `isPreview`.
- Produces: `data-opening-overlay` attribute wrapping the overlay variants; the noscript CSS rule that hides it.

**The mechanism (already ruled):** `inert` is an HTML attribute — no noscript CSS can remove it. So the SSR HTML must NOT carry `inert`/`aria-hidden`; they are applied client-side after hydration (a `hydrated` state flipped in `useEffect`). With JS: attributes appear one paint after hydration (the opaque fixed overlay already covers the content visually in that window, and body-scroll-lock is already an effect). Without JS: content is reachable, and the overlay — which would cover it — is hidden by noscript CSS. Music stays silent without JS (fine — `<audio>` has `preload="none"` and the player button is already withdrawn when `!interactive`).

- [ ] **Step 1: Write the failing no-JS tests**

`OpeningGate.nojs.test.tsx` (jsdom is fine — `renderToString` just needs React, not a DOM):

```tsx
// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultDocument } from "@hpwd/schema";
import { OpeningGate } from "../OpeningGate";
import { InviteProvider } from "../../InviteContext"; // use the real provider export — check its name/props in InviteContext.tsx

function gate(effect: "envelope" | "curtain" | "fade") {
  const opening = { ...createDefaultDocument().opening, effect };
  return (
    <InviteProvider isPreview={false} /* other required context values — copy from an existing OpeningGate test */>
      <OpeningGate opening={opening} guestName={null} onOpened={() => {}}>
        <p>NỘI DUNG THIỆP</p>
      </OpeningGate>
    </InviteProvider>
  );
}

describe("OpeningGate without JavaScript (SSR markup only)", () => {
  it.each(["envelope", "curtain", "fade"] as const)(
    "SSR HTML for effect=%s carries neither inert nor aria-hidden on the content, and marks the overlay for the noscript CSS",
    (effect) => {
      const html = renderToString(gate(effect));
      expect(html).toContain("NỘI DUNG THIỆP");
      expect(html).not.toContain("inert");
      expect(html).not.toContain('aria-hidden="true"');
      expect(html).toContain("data-opening-overlay");
    },
  );
});

describe("OpeningGate with JavaScript (after hydration)", () => {
  it("re-applies inert + aria-hidden to the content once mounted, while still closed", () => {
    const { container } = render(gate("fade"));
    const wrapper = container.querySelector("[data-opening-content]");
    expect(wrapper?.hasAttribute("inert")).toBe(true);
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });
});
```

(Add `data-opening-content` to the content wrapper so both tests address it precisely. Copy the exact `InviteContext` provider setup from the existing OpeningGate tests — do not invent one.)

Layout test (extend or create the layout's test file):

```tsx
it("ships noscript CSS that hides the opening overlay for no-JS guests", () => {
  const html = renderToString(<InviteLayout>{null}</InviteLayout>);
  expect(html).toContain("data-opening-overlay]{display:none");
});
```

- [ ] **Step 2: RED run** (SSR HTML today contains `inert` and there is no `data-opening-overlay`). Paste output.

- [ ] **Step 3: Implement.** In `OpeningGate`:

```tsx
const [hydrated, setHydrated] = useState(false);

// The gate attributes are deliberately NOT server-rendered: `inert` is a
// real HTML attribute no noscript stylesheet can remove, so SSRing it would
// permanently trap a no-JS guest (the overlay button needs JS to work).
// Applying it here, one paint after hydration, keeps the guarantees for
// JS-enabled guests — the opaque fixed overlay already covers the content
// visually during that window.
useEffect(() => {
  setHydrated(true);
}, []);
```

Content wrapper becomes:

```tsx
<div
  data-opening-content
  aria-hidden={hydrated && !opened ? true : undefined}
  inert={hydrated && !opened ? true : undefined}
>
  {children}
</div>
```

Wrap the three variant conditionals in ONE `<div data-opening-overlay>` (plain div, no positioning — the variants are `position: fixed` themselves).

In `app/i/layout.tsx`, extend the noscript style (and its docblock: it now rescues BOTH mechanisms):

```tsx
<noscript>
  <style>{`[data-animate]{opacity:1 !important;transform:none !important;}[data-opening-overlay]{display:none !important;}`}</style>
</noscript>
```

- [ ] **Step 4: Green run** of the new file + ALL existing opening/InvitePage tests (`pnpm vitest run src/components/invite`). If an existing test asserted `inert` on first render, it now needs the post-mount reading — @testing-library's `render` runs effects, so most will pass unchanged; fix only what genuinely broke and say so in the report.

- [ ] **Step 5: Failure-power.** (a) Restore the old always-on `inert={opened ? undefined : true}` → the SSR test goes RED. (b) Remove the new noscript rule → layout test RED. Restore both; paste outputs.

- [ ] **Step 6: Manual verification with a real browser** (this is the bug's actual medium): `pnpm build && pnpm start`, load `/i/demo` with Chrome DevTools "Disable JavaScript" — the invitation content must be visible and scrollable, no overlay. Re-enable JS — envelope overlay works exactly as before. Paste what you observed.

- [ ] **Step 7: Full gate + commit:** `fix(opening): no-JS guests are no longer trapped — gate attributes applied post-hydration, overlay hidden via noscript`

---

### Task 5: Per-section animation controls (expose what AnimatedSection already implements)

**Files:**
- Modify: `apps/web/src/stores/editor-store.ts` (new action `updateSectionAnimation`)
- Modify: `apps/web/src/stores/__tests__/editor-store.test.ts`
- Create: `apps/web/src/components/editor/AnimationControl.tsx`
- Create: `apps/web/src/components/editor/__tests__/AnimationControl.test.tsx`
- Modify: `apps/web/src/components/editor/EditorPanel.tsx` (render the control below `<Panel section={section} />`, inside `PanelErrorBoundary`)

**Interfaces:**
- Consumes: `AnimationSchema { preset: 'none'|'fade'|'slide-up'|'zoom', durationMs: int 100–3000 }` (`invitation.ts:27-31`); `SelectField`/`NumberField` from `components/editor/fields/` (read their prop signatures before use — `NumberField` is used by `AlbumPanel` with a clamp helper, follow that pattern); store-action style of `updateSectionProps`/`toggleSectionVisible`.
- Produces: `updateSectionAnimation(id: string, patch: Partial<Section["animation"]>)` store action; `clampDurationMs(value: number): number` exported for tests.

- [ ] **Step 1: Failing store test** (extend `editor-store.test.ts`, following its existing reset/fixture pattern):

```ts
it("updateSectionAnimation patches only the target section's animation and keeps the document schema-valid", () => {
  // seed a document with two sections via the store's own addSection
  const { addSection, updateSectionAnimation } = useEditorStore.getState();
  addSection("story");
  addSection("text");
  const [a, b] = useEditorStore.getState().document.sections;
  updateSectionAnimation(a.id, { preset: "slide-up", durationMs: 1200 });
  const next = useEditorStore.getState().document;
  expect(next.sections[0].animation).toEqual({ preset: "slide-up", durationMs: 1200 });
  expect(next.sections[1].animation).toEqual(b.animation);
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(() => InvitationDocumentSchema.parse(next)).not.toThrow();
});
```

- [ ] **Step 2: RED run**, then implement the action (mirror `updateSectionProps` exactly):

```ts
updateSectionAnimation(id, patch) {
  set((state) => ({
    document: {
      ...state.document,
      sections: state.document.sections.map((section) =>
        section.id === id ? { ...section, animation: { ...section.animation, ...patch } } : section,
      ),
    },
    dirty: true,
  }));
},
```

(Type it `Partial<Section["animation"]>` in `EditorState`.) GREEN run, commit: `feat(editor): store action for per-section animation`

- [ ] **Step 3: Failing AnimationControl tests** — render with a section fixture (`createSection("story")`), store reset in `beforeEach` like panel tests:

```tsx
it("changes the preset through the store and the document stays parseable", ...);      // select "Trượt lên" → store preset "slide-up"
it("clamps durationMs into [100, 3000] and rounds to an integer", ...);                // clampDurationMs(50)=100, (5000)=3000, (642.7)=643 — unit-test the export, plus one through-the-field case
it("hides the duration field when preset is 'none'", ...);
it("shows the control for every section type via EditorPanel", ...);                   // render EditorPanel with a selected album section; assert "Hiệu ứng xuất hiện" appears alongside the album panel
```

- [ ] **Step 4: RED run, then implement**

`AnimationControl.tsx`:

```tsx
"use client";

import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { NumberField } from "./fields/NumberField";
import { SelectField } from "./fields/SelectField";

const PRESET_OPTIONS: { value: Section["animation"]["preset"]; label: string }[] = [
  { value: "fade", label: "Mờ dần" },
  { value: "slide-up", label: "Trượt lên" },
  { value: "zoom", label: "Phóng to" },
  { value: "none", label: "Không có" },
];

const MIN_DURATION_MS = 100;
const MAX_DURATION_MS = 3000;

/** Keeps durationMs inside AnimationSchema's bounds — an out-of-range write would make the whole document unparseable and silently kill autosave (Global Constraint 2). */
export function clampDurationMs(value: number): number {
  if (!Number.isFinite(value)) return 600;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(value)));
}

export function AnimationControl({ section }: { section: Section }) {
  const updateSectionAnimation = useEditorStore((state) => state.updateSectionAnimation);
  const { preset, durationMs } = section.animation;

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-gray-200 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Hiệu ứng xuất hiện</h3>
      <SelectField
        label="Kiểu hiệu ứng"
        value={preset}
        onChange={(v) => updateSectionAnimation(section.id, { preset: v as Section["animation"]["preset"] })}
        options={PRESET_OPTIONS}
      />
      {preset !== "none" ? (
        <NumberField
          label="Thời lượng (ms)"
          value={durationMs}
          onChange={(v) => updateSectionAnimation(section.id, { durationMs: clampDurationMs(v) })}
        />
      ) : null}
    </div>
  );
}
```

(Adapt `SelectField`/`NumberField` calls to their REAL prop signatures — read the files first.) In `EditorPanel.tsx`, inside the existing boundary:

```tsx
<PanelErrorBoundary resetKey={document}>
  <Panel section={section} />
  <AnimationControl section={section} />
</PanelErrorBoundary>
```

- [ ] **Step 5: GREEN + failure-power** (remove the clamp → clamp test RED; restore). Renderer direction (both-directions rule): one test asserting a document whose section has `preset: "slide-up"` renders `data-animate="slide-up"` through `SectionRenderer` — if `AnimatedSection.test.tsx` already covers preset-to-DOM, extending it with one store-fed case satisfies this; cite it either way.

- [ ] **Step 6: Full gate + commit:** `feat(editor): per-section animation preset + duration controls`

---

### Task 6: Honest landing page + preview badge respects settings

**Files:**
- Modify: `apps/web/src/app/LandingPage.tsx` (FEATURES: `guest-name-links` → `shipped: true`; `youtube-embed` → `shipped: true` — Task 1 shipped it)
- Modify: `apps/web/src/app/__tests__/LandingPage.test.tsx` (the hardcoded coming-soon id array drops both ids)
- Modify: `apps/web/src/stores/editor-store.ts` (new slice: `showBadge: boolean` + `setShowBadge(v: boolean)` — does NOT touch `dirty`; settings persist through their own `saveSettings` writer, and marking the document dirty would fire a pointless document autosave)
- Modify: `apps/web/src/components/editor/EditorLayout.tsx` (seed `setShowBadge(initialShowBadge)` where it already seeds `setDocument` — find that call and mirror it)
- Modify: `apps/web/src/components/editor/PublishDialog.tsx` (replace the private `useState(initialShowBadge)` with the store slice; keep `saveSettings` persistence and the dialog's open-reset semantics EXACTLY — read the current code first; if the dialog currently reverts the toggle on save failure, preserve that by reverting the store value)
- Modify: `apps/web/src/components/editor/PreviewPane.tsx:85` (`settings={{ showBadge: true }}` → `settings={{ showBadge }}` from the store)
- Modify/extend: existing PublishDialog + PreviewPane tests

**Depends on:** Task 1 (the `youtube-embed` flip is only honest once the video section renders).

- [ ] **Step 1: Failing tests.**

Landing (edit the expected array in `LandingPage.test.tsx`):

```ts
expect(comingSoonIds.sort()).toEqual(
  ["custom-music-upload", "text-hyperlinks", "ai-background-removal", "custom-font-upload", "premium-templates"].sort(),
);
```

RED against current FEATURES (still `shipped: false`). The badge-count test recalculates itself.

PreviewPane (extend its test file; follow its store-seeding pattern):

```tsx
it("hides the footer badge in the preview when the couple turned it off", () => {
  useEditorStore.setState({ showBadge: false });
  render(<PreviewPane />);
  expect(screen.queryByText("Tạo miễn phí tại HPWD")).toBeNull();
});

it("shows the footer badge in the preview when it is on", () => {
  useEditorStore.setState({ showBadge: true });
  render(<PreviewPane />);
  expect(screen.getByText("Tạo miễn phí tại HPWD")).toBeInTheDocument();
});
```

PublishDialog: adapt its existing toggle test to assert the STORE value flips (and `saveSettings` still called) — both directions: dialog toggle → preview sees it; store seed → dialog checkbox reflects it.

- [ ] **Step 2: RED runs** for all three files. Paste.

- [ ] **Step 3: Implement** (flip the two FEATURES flags; add the store slice with default `true`; seed in EditorLayout; rewire PublishDialog + PreviewPane). Description text for the two flipped features stays accurate — reread them once flipped.

- [ ] **Step 4: GREEN + failure-power** (restore `settings={{ showBadge: true }}` hardcode → the hides-badge test goes RED; restore).

- [ ] **Step 5: Full gate + commit:** `fix(editor,landing): preview honours showBadge; landing stops underselling shipped features`

---

### Task 7: mapUrl scheme allowlist at render (and a warning in the editor)

**Files:**
- Modify: `apps/web/src/lib/sanitize.ts` (export `isSafeHref(href: string): boolean` delegating to the existing private `SAFE_HREF_RE` at line 76 — do NOT touch the tokenizer, do NOT widen/change the regex)
- Modify: `apps/web/src/lib/__tests__/sanitize.test.ts` (unit cases for the new export)
- Modify: `apps/web/src/components/invite/sections/EventsSection.tsx` (lines 36–45: render the anchor only when `isSafeHref(item.mapUrl)`)
- Modify: `apps/web/src/components/invite/sections/__tests__/EventsSection.test.tsx`
- Modify: `apps/web/src/components/editor/panels/EventsPanel.tsx` (hint + warning under the "Liên kết bản đồ" field when the value won't render)
- Modify: `apps/web/src/components/editor/panels/__tests__/EventsPanel.test.tsx`

**Ruled (do not re-litigate):** NO schema change — `EventItemSchema.mapUrl` stays a bare `z.string()`. Existing documents contain arbitrary text there; any refine would make them unparseable and silently kill autosave (Global Constraint 2). The guard lives at render, exactly like `sanitize.ts` already does for rich-text hrefs. Note for the both-directions self-review: a scheme-less value like `maps.app.goo.gl/xyz` is TODAY a broken relative link (`/i/maps.app.goo.gl/xyz` → 404); after this task it renders no link at all and the editor warns — strictly better, but say it out loud.

- [ ] **Step 1: Failing tests.**

sanitize.test.ts additions:

```ts
describe("isSafeHref", () => {
  it.each([["https://maps.google.com/x"], ["http://example.com"], ["/local/path"], ["mailto:a@b.vn"], ["HTTPS://UPPER.CASE/ok"]])(
    "accepts %s",
    (href) => expect(isSafeHref(href)).toBe(true),
  );
  it.each([["javascript:alert(1)"], ["data:text/html,x"], ["vbscript:x"], ["maps.app.goo.gl/xyz"], [" javascript:alert(1)"], [""]])(
    "rejects %s",
    (href) => expect(isSafeHref(href)).toBe(false),
  );
});
```

EventsSection tests (build a real events section fixture via `createSection("events")` + props override; note the existing test file only covers `formatEventDate`):

```tsx
it("renders the map link for an https URL", ...);              // anchor present, href intact, target/rel intact
it.each(["javascript:alert(1)", "data:text/html,x", "maps.app.goo.gl/xyz"])(
  "renders NO anchor for unsafe or scheme-less mapUrl %s — the rest of the event still renders",
  ...,
);                                                              // queryByRole("link") null; event name/address still visible
```

EventsPanel test: an item with `mapUrl: "javascript:alert(1)"` shows the warning text; with `https://...` it doesn't.

- [ ] **Step 2: RED runs.** Paste.

- [ ] **Step 3: Implement.** sanitize.ts:

```ts
/**
 * Scheme allowlist for user-supplied plain hrefs rendered as real anchors
 * outside the rich-text sanitizer (today: EventsSection's mapUrl). Same
 * allowlist the sanitizer applies to rich-text anchors — one list, two
 * enforcement points that can't drift.
 */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF_RE.test(href);
}
```

EventsSection: `{item.mapUrl && isSafeHref(item.mapUrl) ? ( <a …existing markup unchanged…> ) : null}`.

EventsPanel — after the mapUrl TextField (give it a hint too):

```tsx
<TextField
  label="Liên kết bản đồ"
  value={item.mapUrl}
  onChange={(v) => update({ ...item, mapUrl: v })}
  hint="Bắt đầu bằng https:// — ví dụ liên kết chia sẻ từ Google Maps"
/>
{item.mapUrl && !isSafeHref(item.mapUrl) ? (
  <p className="text-xs text-red-500" role="alert">
    Liên kết phải bắt đầu bằng https:// hoặc http:// — liên kết hiện tại sẽ không hiển thị trên thiệp.
  </p>
) : null}
```

- [ ] **Step 4: GREEN + failure-power** (drop the `isSafeHref` guard in EventsSection → the javascript: test goes RED; restore; paste both).

- [ ] **Step 5: Full gate + commit:** `fix(events): mapUrl renders only through the scheme allowlist; editor warns on non-https links`

---

## Self-Review (done at planning time)

- Spec coverage: HANDOFF items 1→Task 1, 2→Task 2, 3→Task 3, 4→Task 5, 5→Task 4, 6→Task 6, 7→Task 6, 8→Task 7. All 8 covered.
- Type consistency: `parseYoutubeId`/`youtubeWatchUrl` (T1) reused nowhere else; `ImageUploadedMeta.blurDataUrl` (T3) consumed only by AlbumPanel (T3); `updateSectionAnimation`/`clampDurationMs` (T5) self-contained; `isSafeHref` (T7) self-contained; `showBadge` slice (T6) self-contained. No cross-task signature references beyond T1→T6 (feature flag flip), which is ordering, not typing.
- Known reality checks baked in: HANDOFF wrongly claims the default document contains a video section (it does not — tests build their own fixtures); `youtubeId`/`mapUrl` stay bare `z.string()` on purpose; `EditorPanel` is the panel choke point; `useEditorStore` has no settings slice yet.
