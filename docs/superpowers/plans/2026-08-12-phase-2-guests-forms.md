# HPWD Phase 2 — Khách mời, Form builder, Nhạc riêng, Video, Rich text

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ thiệp quản lý danh sách khách mời và gửi link cá nhân hóa cho từng người, tự thiết kế biểu mẫu ngoài RSVP và xuất CSV, tải nhạc riêng lên, nhúng video YouTube, và soạn văn bản có định dạng — trên nền Phase 1 đã chạy.

**Architecture:** Bổ sung `apps/worker` (BullMQ + ffmpeg) cho việc nặng chạy nền; mọi thứ còn lại mở rộng các điểm mở rộng đã có sẵn từ Phase 1: bảng `Guest` (đã có schema, đã có đường đọc `?g=`, chưa có nơi ghi), engine form schema-driven (`buildFormSchema`), enum `AssetKind` (đã có `audio`), registry section, và `sanitizeHtml`.

**Tech Stack:** Next.js 15, Prisma 6, BullMQ 5 + ioredis, ffmpeg (fluent-ffmpeg không dùng — gọi trực tiếp qua `execFile`), exceljs (parse .xlsx phía client), TipTap 2, lite-youtube-embed, vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-wedding-invitation-builder-design.md` — mục 2 (bảng tính năng) và mục 7 (lộ trình).
**Nền Phase 1:** `docs/superpowers/plans/2026-08-10-phase-0-1-mvp.md`, và ledger `.superpowers/sdd/2026-08-10-phase-0-1-mvp/progress.md` (các mục hoãn).

## Global Constraints

- Node ≥ 22, pnpm ≥ 9. TypeScript `strict: true` toàn repo.
- Mọi copy hiển thị cho người dùng bằng **tiếng Việt**.
- Mọi đọc/ghi InvitationDocument đi qua `InvitationDocumentSchema` từ `@hpwd/schema`. **Bất biến:** mọi hành động trong editor phải để document còn `parse` được — nếu không, autosave im lặng ngừng lưu toàn bộ thiệp (đây là blocker B1 của Phase 1).
- Route thuộc sở hữu chủ thiệp dùng `findOwnedInvitation` từ `@/lib/ownership`: 401 khi chưa đăng nhập, **404 cho cả "không tồn tại" và "không phải của bạn"** (không rò rỉ sự tồn tại). Không route nào được trả 403.
- Không `next/font/google` (proxy công ty chặn fonts.gstatic.com). Không tắt xác thực TLS; nếu tải binary lỗi chứng chỉ thì thêm `NODE_EXTRA_CA_CERTS=$REPO/.certs/corp-ca.pem`.
- Không đọc capability chỉ có ở trình duyệt (`navigator.*`, `window.matchMedia`) trong lúc render — chỉ trong `useEffect`. Vi phạm điều này gây hydration mismatch (đã xảy ra 3 lần ở Phase 1).
- Test: `pnpm exec turbo test`. Route test import handler trực tiếp, dựng `new Request(...)` và truyền `{ params: Promise.resolve({...}) }`; dùng Postgres dev thật, dọn dữ liệu ở `afterEach`/`afterAll`. Test `.tsx` cần docblock `// @vitest-environment jsdom` dòng đầu và `afterEach(cleanup)`.
- **Test phải có sức bắt lỗi.** Nếu một test là bằng chứng chính cho một yêu cầu, chứng minh nó fail khi gỡ hành vi ra (revert → đỏ → khôi phục → xanh) và dán output vào báo cáo.
- Commit tiếng Anh, conventional commits.

---

## Cấu trúc file

```
apps/worker/                         MỚI — tiến trình nền
  package.json                       @hpwd/worker
  src/index.ts                       bootstrap: kết nối Redis, khởi động các worker
  src/queues.ts                      định nghĩa queue + tên job dùng chung với apps/web
  src/audio-worker.ts                xử lý job transcode nhạc
  src/ffmpeg.ts                      bọc lời gọi ffmpeg (execFile, không phụ thuộc lib)

packages/db/prisma/schema.prisma     MODIFY — thêm MediaAsset.status/meta cho job, Guest không đổi

apps/web/src/lib/
  queues.ts                          MỚI — phía web đẩy job (dùng chung tên với worker)
  guest-links.ts                     MỚI — dựng URL khách mời, chuẩn hoá tên
  guest-import.ts                    MỚI — parse CSV/XLSX phía client → GuestDraft[]
  csv.ts                             MỚI — serialize CSV (export phản hồi)
  audio.ts                           MỚI — hằng số & validate cho upload nhạc

apps/web/src/app/api/
  invitations/[id]/guests/route.ts             MỚI — GET danh sách, POST thêm (1 hoặc nhiều)
  invitations/[id]/guests/[guestId]/route.ts   MỚI — PATCH sửa, DELETE xoá
  invitations/[id]/submissions/export/route.ts MỚI — GET tải CSV phản hồi
  uploads/audio/route.ts                       MỚI — ký URL upload nhạc
  media/[assetId]/route.ts                     MỚI — GET trạng thái xử lý của asset
  media/[assetId]/process/route.ts             MỚI — POST báo đã PUT xong, đẩy job vào hàng đợi
  media/[assetId]/blur/route.ts                MỚI — POST sinh blur placeholder cho ảnh (Task 10)

apps/web/src/app/(dashboard)/dashboard/[id]/khach-moi/
  page.tsx                           MỚI — server component, tải danh sách khách
  GuestTable.tsx                     MỚI — bảng khách, sửa/xoá/copy link
  GuestImportDialog.tsx              MỚI — dialog nhập từ file, xem trước, xác nhận

apps/web/src/components/editor/panels/
  MusicPanel.tsx                     MODIFY — thêm nhánh "Tải lên"
  TextPanel.tsx                      MODIFY — thay textarea bằng TipTap
  FormPanel.tsx                      MODIFY — cho phép sắp xếp lại field, đổi isRsvp
  OpeningPanel.tsx                   MODIFY — thêm 2 hiệu ứng mới

apps/web/src/components/editor/
  RichTextEditor.tsx                 MỚI — bọc TipTap, xuất HTML hợp allowlist

apps/web/src/components/invite/
  sections/VideoSection.tsx          MODIFY — render lite-youtube-embed
  sections/CoverSection.tsx          MODIFY — tôn trọng opening.showGuestName
  opening/RevealOpening.tsx          MỚI — hiệu ứng mở màn "hé lộ"
  opening/PetalsOpening.tsx          MỚI — hiệu ứng mở màn "cánh hoa"

apps/web/src/lib/sanitize.ts         MODIFY — mở rộng allowlist cho output TipTap
packages/schema/src/invitation.ts    MODIFY — opening.effect thêm 2 giá trị; video giữ nguyên
```

---

## Task 1: Guest API — CRUD có kiểm soát sở hữu

**Files:**
- Create: `apps/web/src/lib/guest-links.ts`
- Create: `apps/web/src/app/api/invitations/[id]/guests/route.ts`
- Create: `apps/web/src/app/api/invitations/[id]/guests/[guestId]/route.ts`
- Test: `apps/web/src/app/api/__tests__/guests.test.ts`, `apps/web/src/lib/__tests__/guest-links.test.ts`

**Interfaces:**
- Consumes: `findOwnedInvitation(id, userId)` và `NOT_FOUND_MESSAGE` từ `@/lib/ownership`; `prisma` từ `@hpwd/db`; `auth()` từ `@/auth`.
- Produces:
  - `buildGuestLink(origin: string, slug: string, token: string): string` → `${origin}/i/${slug}?g=${token}`
  - `normalizeGuestName(raw: string): string` — trim, gộp khoảng trắng liên tiếp, bỏ ký tự điều khiển, cắt 120 ký tự
  - `GET /api/invitations/[id]/guests` → `{ guests: { id, name, group, note, token, viewedAt, createdAt }[] }` (mới nhất trước)
  - `POST /api/invitations/[id]/guests` body `{ guests: { name, group?, note? }[] }` → 201 `{ created: number, guests: [...] }`
  - `PATCH /api/invitations/[id]/guests/[guestId]` body `{ name?, group?, note? }` → 200 `{ guest }`
  - `DELETE /api/invitations/[id]/guests/[guestId]` → 200 `{ ok: true }`

- [ ] **Step 1: Viết test cho `guest-links.ts`**

```ts
// apps/web/src/lib/__tests__/guest-links.test.ts
import { describe, expect, it } from "vitest";
import { buildGuestLink, normalizeGuestName } from "../guest-links";

describe("buildGuestLink", () => {
  it("nối origin, slug và token", () => {
    expect(buildGuestLink("https://hpwd.vn", "an-binh", "tok123")).toBe(
      "https://hpwd.vn/i/an-binh?g=tok123",
    );
  });
  it("bỏ dấu / thừa ở cuối origin", () => {
    expect(buildGuestLink("https://hpwd.vn/", "an-binh", "tok123")).toBe(
      "https://hpwd.vn/i/an-binh?g=tok123",
    );
  });
  it("mã hoá token an toàn cho URL", () => {
    expect(buildGuestLink("https://hpwd.vn", "a", "a b&c")).toContain("g=a%20b%26c");
  });
});

describe("normalizeGuestName", () => {
  it("gộp khoảng trắng và cắt hai đầu", () => {
    expect(normalizeGuestName("  Nguyễn   Văn  An  ")).toBe("Nguyễn Văn An");
  });
  it("bỏ ký tự điều khiển", () => {
    // BAT BUOC dung escape sequence. Khong bao gio dan byte dieu khien that vao
    // source — mot implementer Phase 1 da lam vay va phai sua lai hai lan.
    expect(normalizeGuestName("An\u0000 Nguyễn")).toBe("An Nguyễn");
    expect(normalizeGuestName("A\u0007B")).toBe("AB");
  });
  it("cắt ở 120 ký tự", () => {
    expect(normalizeGuestName("x".repeat(200))).toHaveLength(120);
  });
});
```

- [ ] **Step 2: Chạy test → FAIL** (`pnpm --filter @hpwd/web exec vitest run src/lib/__tests__/guest-links.test.ts`), lỗi module không tồn tại.

- [ ] **Step 3: Implement `guest-links.ts`**

```ts
const MAX_GUEST_NAME_LENGTH = 120;

/** Link cá nhân hoá của một khách. Origin lấy từ NEXT_PUBLIC_SITE_URL ở phía gọi. */
export function buildGuestLink(origin: string, slug: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/i/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`;
}

/** Tên khách nhập tay hoặc import từ file — chuẩn hoá trước khi lưu. */
export function normalizeGuestName(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex -- ký tự điều khiển phải bị loại trước khi lưu
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_GUEST_NAME_LENGTH);
}
```

- [ ] **Step 4: Chạy test → PASS.**

- [ ] **Step 5: Viết test cho route khách mời**

Theo đúng khuôn mẫu `apps/web/src/app/api/__tests__/invitations-id.test.ts`: `vi.hoisted` + `vi.mock("@/auth")` **trước** import route; dựng `new Request(...)`; truyền `{ params: Promise.resolve({ id, guestId }) }`; dùng Postgres thật; dọn ở `afterEach`.

```ts
// apps/web/src/app/api/__tests__/guests.test.ts (trích các ca bắt buộc)
it("401 khi chưa đăng nhập", async () => { /* authMock trả null → expect(res.status).toBe(401) */ });
it("404 khi thiệp không tồn tại", async () => { /* id lạ → 404 */ });
it("404 (không phải 403) khi thiệp của người khác, và body giống hệt ca không tồn tại", async () => {
  // tạo invitation của user khác; gọi GET; expect(res.status).toBe(404)
  // expect(await res.json()).toEqual(missingBody)  ← chứng minh không rò rỉ sự tồn tại
});
it("POST tạo nhiều khách một lần, mỗi khách có token duy nhất", async () => {
  // POST { guests: [{name:"Nguyễn Văn An"},{name:"Trần Thị Bình"}] } → 201, created === 2
  // expect(new Set(guests.map(g => g.token)).size).toBe(2)
});
it("POST chuẩn hoá tên trước khi lưu", async () => {
  // POST { guests: [{ name: "  Lê   Văn  C  " }] } → tên trong DB là "Lê Văn C"
});
it("POST từ chối tên rỗng sau chuẩn hoá với thông báo tiếng Việt", async () => {
  // POST { guests: [{ name: "   " }] } → 400, body.error chứa "tên"
});
it("POST từ chối quá 500 khách một lần", async () => { /* 501 phần tử → 400 */ });
it("PATCH sửa tên và giữ nguyên token", async () => { /* token trước === sau */ });
it("PATCH 404 khi guestId thuộc thiệp khác", async () => {
  // guest của invitation B, gọi PATCH dưới invitation A → 404, không sửa gì
});
it("DELETE xoá khách và 404 khi guestId thuộc thiệp khác", async () => { /* ... */ });
it("GET trả khách mới nhất trước", async () => { /* createdAt desc */ });
```

- [ ] **Step 6: Chạy test → FAIL.**

- [ ] **Step 7: Implement `apps/web/src/app/api/invitations/[id]/guests/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { NOT_FOUND_MESSAGE, findOwnedInvitation } from "@/lib/ownership";
import { normalizeGuestName } from "@/lib/guest-links";

const MAX_GUESTS_PER_REQUEST = 500;

const guestInputSchema = z.object({
  name: z.string(),
  group: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});
const createGuestsSchema = z.object({
  guests: z.array(guestInputSchema).min(1).max(MAX_GUESTS_PER_REQUEST),
});

const GUEST_SELECT = {
  id: true, name: true, group: true, note: true,
  token: true, viewedAt: true, createdAt: true,
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

  const guests = await prisma.guest.findMany({
    where: { invitationId: id },
    select: GUEST_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ guests });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const { id } = await params;
  const invitation = await findOwnedInvitation(id, session.user.id);
  if (!invitation) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  const parsed = createGuestsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Danh sách khách không hợp lệ (tối đa ${MAX_GUESTS_PER_REQUEST} khách mỗi lần).` },
      { status: 400 },
    );
  }

  const rows = parsed.data.guests.map((g) => ({
    invitationId: id,
    name: normalizeGuestName(g.name),
    group: g.group?.trim() || null,
    note: g.note?.trim() || null,
  }));
  if (rows.some((r) => r.name.length === 0)) {
    return NextResponse.json({ error: "Tên khách không được để trống." }, { status: 400 });
  }

  await prisma.guest.createMany({ data: rows });
  const guests = await prisma.guest.findMany({
    where: { invitationId: id },
    select: GUEST_SELECT,
    orderBy: { createdAt: "desc" },
    take: rows.length,
  });
  return NextResponse.json({ created: rows.length, guests }, { status: 201 });
}
```

- [ ] **Step 8: Implement `[guestId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hpwd/db";
import { auth } from "@/auth";
import { NOT_FOUND_MESSAGE, findOwnedInvitation } from "@/lib/ownership";
import { normalizeGuestName } from "@/lib/guest-links";

const updateGuestSchema = z.object({
  name: z.string().optional(),
  group: z.string().max(80).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Trả guest chỉ khi nó thuộc đúng thiệp mà session user sở hữu. */
async function findOwnedGuest(invitationId: string, guestId: string, userId: string) {
  const invitation = await findOwnedInvitation(invitationId, userId);
  if (!invitation) return null;
  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.invitationId !== invitationId) return null;
  return guest;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const { id, guestId } = await params;
  const guest = await findOwnedGuest(id, guestId, session.user.id);
  if (!guest) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  const parsed = updateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Thông tin khách không hợp lệ." }, { status: 400 });
  }

  const data: { name?: string; group?: string | null; note?: string | null } = {};
  if (parsed.data.name !== undefined) {
    const name = normalizeGuestName(parsed.data.name);
    if (!name) return NextResponse.json({ error: "Tên khách không được để trống." }, { status: 400 });
    data.name = name;
  }
  if (parsed.data.group !== undefined) data.group = parsed.data.group?.trim() || null;
  if (parsed.data.note !== undefined) data.note = parsed.data.note?.trim() || null;

  const updated = await prisma.guest.update({
    where: { id: guestId },
    data,
    select: { id: true, name: true, group: true, note: true, token: true, viewedAt: true, createdAt: true },
  });
  return NextResponse.json({ guest: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  const { id, guestId } = await params;
  const guest = await findOwnedGuest(id, guestId, session.user.id);
  if (!guest) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });

  await prisma.guest.delete({ where: { id: guestId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: Chạy test → PASS.** Chạy `pnpm exec turbo test`, `turbo lint`, `tsc --noEmit`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/guest-links.ts apps/web/src/app/api/invitations/'[id]'/guests apps/web/src/lib/__tests__/guest-links.test.ts apps/web/src/app/api/__tests__/guests.test.ts
git commit -m "feat(guests): owner-scoped guest CRUD api with personalized link builder"
```

---

## Task 2: Trang quản lý khách mời + link cá nhân hoá

**Files:**
- Create: `apps/web/src/app/(dashboard)/dashboard/[id]/khach-moi/page.tsx`, `GuestTable.tsx`
- Modify: `apps/web/src/components/invite/sections/CoverSection.tsx` (tôn trọng `opening.showGuestName`)
- Modify: `apps/web/src/components/invite/InvitePage.tsx` (truyền `showGuestName` xuống context)
- Modify: `apps/web/src/components/invite/InviteContext.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/InvitationCard.tsx` (thêm link "Khách mời")
- Test: `apps/web/src/app/(dashboard)/dashboard/[id]/khach-moi/__tests__/GuestTable.test.tsx`, `apps/web/src/components/invite/__tests__/CoverSection.guestName.test.tsx`

**Interfaces:**
- Consumes: API Task 1; `buildGuestLink`; `useInviteContext()`.
- Produces: `InviteContextValue` mở rộng thành `{ guestName: string | null; showGuestName: boolean; isPreview: boolean; slug: string | null }`.

- [ ] **Step 1: Viết test cho `CoverSection` — hiện đang BỎ QUA `showGuestName`**

```tsx
// apps/web/src/components/invite/__tests__/CoverSection.guestName.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createDefaultDocument } from "@hpwd/schema";
import { InviteContext } from "../InviteContext";
import { CoverSection } from "../sections/CoverSection";

afterEach(cleanup);

function renderCover(showGuestName: boolean) {
  const cover = createDefaultDocument().sections.find((s) => s.type === "cover")!;
  return render(
    <InviteContext.Provider
      value={{ guestName: "Nguyễn Văn An", showGuestName, isPreview: false, slug: "demo" }}
    >
      <CoverSection section={cover as Extract<typeof cover, { type: "cover" }>} />
    </InviteContext.Provider>,
  );
}

describe("CoverSection và opening.showGuestName", () => {
  it("hiện tên khách khi showGuestName bật", () => {
    renderCover(true);
    expect(screen.getByText(/Kính mời: Nguyễn Văn An/)).toBeTruthy();
  });
  it("KHÔNG hiện tên khách khi showGuestName tắt", () => {
    renderCover(false);
    expect(screen.queryByText(/Kính mời/)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy → FAIL ở ca thứ hai** (hiện `CoverSection` chỉ kiểm tra `guestName`, không biết cờ này).

- [ ] **Step 3: Mở rộng context và sửa `CoverSection`**

Trong `InviteContext.tsx` thêm `showGuestName: boolean` vào `InviteContextValue` (mặc định `true` khi tạo giá trị ở `InvitePage`). Trong `InvitePage.tsx` truyền `showGuestName: document.opening.showGuestName`. Trong `CoverSection.tsx` đổi dòng render tên khách thành:

```tsx
const { guestName, showGuestName } = useInviteContext();
// ...
{showGuestName && guestName ? (
  <p className="text-sm text-gray-700">Kính mời: {guestName}</p>
) : null}
```

Cập nhật mọi nơi khác đang dựng `InviteContext.Provider` trong test cho khớp kiểu mới.

- [ ] **Step 4: Chạy → PASS.**

- [ ] **Step 5: Viết test cho `GuestTable`**

```tsx
// (trích các ca bắt buộc)
it("hiện tên, nhóm và trạng thái 'Chưa xem' / 'Đã xem' theo viewedAt", () => {});
it("nút 'Sao chép link' gọi clipboard với đúng link cá nhân hoá", () => {
  // fetch được mock; assert writeText nhận `${origin}/i/${slug}?g=${token}`
});
it("không đổ vỡ khi navigator.clipboard không tồn tại và hiện hướng dẫn sao chép tay", () => {
  // giống bài học GiftSection: KHÔNG đọc navigator lúc render — kiểm tra trong useEffect
});
it("xoá khách hỏi xác nhận rồi gọi DELETE và bỏ dòng khỏi bảng", () => {});
it("hiện trạng thái rỗng bằng tiếng Việt khi chưa có khách nào", () => {});
```

- [ ] **Step 6: Chạy → FAIL. Step 7: Implement `page.tsx` + `GuestTable.tsx`.**

`page.tsx` là server component: `auth()` → `findOwnedInvitation` → `notFound()` nếu không sở hữu → đọc `prisma.guest.findMany` và `invitation.slug`, `invitation.status` → render `<GuestTable>` (client) với `initialGuests`, `slug`, `origin={process.env.NEXT_PUBLIC_SITE_URL ?? ""}`.

`GuestTable.tsx` (`"use client"`): bảng có cột Tên / Nhóm / Trạng thái / Thao tác; form thêm nhanh một khách (tên + nhóm); nút "Sao chép link" (dùng `buildGuestLink`, kiểm tra clipboard **trong `useEffect`**, có hướng dẫn sao chép tay khi không hỗ trợ); nút "Chia sẻ Zalo" mở `https://zalo.me/share/link?url=<encoded>` ở tab mới với `rel="noopener noreferrer"`; nút sửa (inline) và xoá (có `window.confirm`). Khi thiệp chưa xuất bản, hiện cảnh báo tiếng Việt rằng link chỉ hoạt động sau khi xuất bản.

- [ ] **Step 8: Thêm link "Khách mời" vào `InvitationCard.tsx`** trỏ `/dashboard/{id}/khach-moi`, cạnh "Lời chúc" và "Phản hồi".

- [ ] **Step 9: Chạy → PASS + toàn bộ suite, lint, tsc, build.**

- [ ] **Step 10: Kiểm chứng thật:** chạy dev server, seed sẵn `demo-guest-token`; `curl -s "http://localhost:3000/i/demo?g=demo-guest-token" | grep -c "Kính mời"` ≥ 1, và với `showGuestName: false` trong document thì bằng 0. Tắt server.

- [ ] **Step 11: Commit**

```bash
git commit -am "feat(guests): guest management page with personalized links and cover-name toggle"
```

---

## Task 3: Nhập khách mời từ CSV/Excel (parse phía client)

**Files:**
- Create: `apps/web/src/lib/guest-import.ts`, `apps/web/src/app/(dashboard)/dashboard/[id]/khach-moi/GuestImportDialog.tsx`
- Test: `apps/web/src/lib/__tests__/guest-import.test.ts`

**Interfaces:**
- Consumes: `normalizeGuestName`; API `POST /api/invitations/[id]/guests`.
- Produces: `parseGuestFile(file: File): Promise<GuestImportResult>` với

```ts
export interface GuestDraft { name: string; group?: string; note?: string }
export interface GuestImportResult { rows: GuestDraft[]; skipped: number; warnings: string[] }
```

**Quyết định thiết kế:** file **không bao giờ được gửi lên server** — parse hoàn toàn ở trình duyệt rồi POST danh sách JSON đã xem trước. Bỏ hẳn một lớp bề mặt tấn công (server không parse file người lạ) và không cần route upload mới.

- [x] **Step 1: Viết test cho `parseGuestFile` với CSV**

```ts
it("đọc CSV có tiêu đề tiếng Việt: Tên, Nhóm, Ghi chú", async () => {
  const csv = "Tên,Nhóm,Ghi chú\nNguyễn Văn An,Nhà trai,Bạn đại học\nTrần Thị Bình,Nhà gái,\n";
  const result = await parseGuestFile(new File([csv], "khach.csv", { type: "text/csv" }));
  expect(result.rows).toEqual([
    { name: "Nguyễn Văn An", group: "Nhà trai", note: "Bạn đại học" },
    { name: "Trần Thị Bình", group: "Nhà gái" },
  ]);
});
it("chấp nhận tiêu đề không dấu và khác hoa thường (ten, nhom)", async () => {});
it("dùng cột đầu làm tên khi không nhận ra tiêu đề nào", async () => {});
it("bỏ qua dòng có tên rỗng và đếm vào skipped", async () => {});
it("xử lý ô có dấu phẩy trong ngoặc kép", async () => {
  // 'Nguyễn Văn An","Nhà trai, bạn thân"' → group giữ nguyên dấu phẩy
});
it("bỏ BOM ở đầu file xuất từ Excel", async () => {});
it("loại trùng theo tên đã chuẩn hoá, giữ bản đầu, ghi cảnh báo", async () => {});
it("từ chối file quá 500 dòng với cảnh báo tiếng Việt", async () => {});
```

- [x] **Step 2: Chạy → FAIL. Step 3: Implement.**

Parser CSV tự viết (không thêm phụ thuộc cho CSV): xử lý ngoặc kép, dấu phẩy trong ô, `""` escape, CRLF, BOM. Nhận diện cột theo tiêu đề đã bỏ dấu (`removeDiacritics` từ `@/lib/slug`): `ten|name|họ tên|ho ten` → name, `nhom|group` → group, `ghi chu|note` → note. Với `.xlsx`, `import("exceljs")` động (chỉ tải khi người dùng chọn file Excel) và đọc sheet đầu, rồi đi qua đúng đường xử lý như CSV.

- [x] **Step 4: Chạy → PASS.**

- [x] **Step 5: Implement `GuestImportDialog.tsx`**: chọn file → parse → bảng xem trước (tối đa 20 dòng đầu + tổng số) → hiện cảnh báo/số dòng bỏ qua → nút "Nhập N khách" gọi POST → đóng dialog và làm mới danh sách. Có Escape để đóng và focus trap, tái dùng khuôn mẫu của `PublishDialog`.

- [x] **Step 6: Kiểm chứng thật:** tạo một file `.csv` và một `.xlsx` mẫu trong thư mục scratch, nhập thử qua UI hoặc qua test tích hợp gọi `parseGuestFile` với `File` dựng từ buffer thật của exceljs. Ghi kết quả vào báo cáo.

- [x] **Step 7: Commit**

```bash
git commit -am "feat(guests): client-side csv/xlsx import with preview"
```

---

## Task 4: Form builder — sắp xếp field, form ngoài RSVP, xuất CSV

**Files:**
- Create: `apps/web/src/lib/csv.ts`, `apps/web/src/app/api/invitations/[id]/submissions/export/route.ts`
- Modify: `apps/web/src/components/editor/panels/FormPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/dashboard/[id]/phan-hoi/page.tsx` (nút tải CSV + phân trang)
- Test: `apps/web/src/lib/__tests__/csv.test.ts`, `apps/web/src/app/api/__tests__/submissions-export.test.ts`

**Interfaces:**
- Produces:
  - `toCsv(rows: Record<string, string>[], columns: string[]): string` — có BOM UTF-8 để Excel mở đúng tiếng Việt
  - `GET /api/invitations/[id]/submissions/export?sectionId=...` → `text/csv` với `Content-Disposition: attachment`

- [x] **Step 1: Viết test cho `toCsv`**

```ts
it("thêm BOM UTF-8 để Excel đọc đúng tiếng Việt", () => {
  expect(toCsv([{ a: "Đặng" }], ["a"]).startsWith("﻿")).toBe(true);
});
it("bọc ô chứa dấu phẩy, ngoặc kép hoặc xuống dòng", () => {
  expect(toCsv([{ a: 'x,y' }], ["a"])).toContain('"x,y"');
  expect(toCsv([{ a: 'say "hi"' }], ["a"])).toContain('"say ""hi"""');
});
it("giữ đúng thứ tự cột và điền rỗng cho ô thiếu", () => {});
it("chặn CSV injection: ô bắt đầu bằng = + - @ được thêm dấu nháy đơn", () => {
  expect(toCsv([{ a: "=SUM(A1)" }], ["a"])).toContain("'=SUM(A1)");
});
```

- [x] **Step 2: FAIL → Step 3: Implement `csv.ts`** (bao gồm chống CSV injection — dữ liệu do khách lạ nhập vào rồi chủ thiệp mở bằng Excel).

- [x] **Step 4: Viết test route export**: 401/404 như mọi route chủ sở hữu; 200 trả `content-type: text/csv; charset=utf-8`; header cột lấy từ `label` của field trong `publishedDocument`; có cột "Thời gian" và "Tên khách" (join `guestToken` → `Guest.name`); `sectionId` không thuộc thiệp → 404.

- [x] **Step 5: FAIL → Step 6: Implement route.**

- [x] **Step 7: Mở rộng `FormPanel`**: cho phép đổi thứ tự field (nút Lên/Xuống có sẵn trong `ListField`), cho phép bật/tắt `isRsvp` (kèm chú thích tiếng Việt rằng chỉ một biểu mẫu nên là RSVP), và cảnh báo inline khi `select`/`radio` không có lựa chọn nào. **Bất biến bắt buộc:** thêm test vào `panels.schema-integration.test.tsx` chứng minh mọi thao tác mới vẫn để document `parse` được.

- [x] **Step 8: Thêm nút "Tải CSV" và phân trang** (50 phản hồi mỗi trang) vào trang `phan-hoi`.

- [x] **Step 9: Chạy toàn bộ + kiểm chứng thật:** gửi 3 phản hồi qua API, tải CSV bằng curl, mở kiểm tra có BOM và đúng cột.

- [x] **Step 10: Commit**

```bash
git commit -am "feat(forms): field reordering, non-rsvp forms, and csv export of responses"
```

---

## Task 5: `apps/worker` — hạ tầng job nền

**Files:**
- Create: `apps/worker/package.json`, `src/index.ts`, `src/queues.ts`, `src/ffmpeg.ts`
- Create: `apps/web/src/lib/queues.ts`
- Modify: `docker-compose.dev.yml` (không đổi service, chỉ thêm chú thích), `package.json` (script `dev:worker`), `turbo.json`
- Test: `apps/worker/src/__tests__/ffmpeg.test.ts`

**Interfaces:**
- Produces:
  - `AUDIO_QUEUE_NAME = "audio-transcode"` và `interface AudioJobData { assetId: string; userId: string; sourceKey: string }` — **định nghĩa một lần trong `apps/worker/src/queues.ts` và `apps/web` import từ đó** (thêm `@hpwd/worker` vào dependencies của web) để tên queue không bao giờ lệch nhau.
  - `transcodeToAac(inputPath: string, outputPath: string): Promise<{ durationSeconds: number }>`
  - `enqueueAudioJob(data: AudioJobData): Promise<string>` (trả jobId) trong `apps/web/src/lib/queues.ts`

- [ ] **Step 1: Tạo `apps/worker`** với `package.json` (`"name": "@hpwd/worker"`, deps `bullmq`, `ioredis`, `@aws-sdk/client-s3`, `@hpwd/db`; devDeps `tsx`, `typescript`, `vitest`), `tsconfig.json` kế thừa `tsconfig.base.json`, script `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"`, `"test": "vitest run --passWithNoTests"`. Thêm root script `"dev:worker": "pnpm --filter @hpwd/worker dev"`.

- [ ] **Step 2: Viết test cho `ffmpeg.ts`** — dùng ffmpeg thật (đã có sẵn trên máy này, Task 12 Phase 1 xác nhận 8.0.1): sinh một file WAV 2 giây bằng `ffmpeg -f lavfi -i "sine=frequency=440:duration=2"`, chạy `transcodeToAac`, khẳng định file ra tồn tại, là AAC/M4A (kiểm magic bytes `ftyp`), và `durationSeconds` xấp xỉ 2 (±0.3). Nếu `ffmpeg` không có trên PATH thì `it.skip` kèm thông báo rõ ràng — **không được để test tự xanh khi ffmpeg vắng mặt**.

- [ ] **Step 3: FAIL → Step 4: Implement `ffmpeg.ts`** dùng `execFile` (không thêm phụ thuộc wrapper): `-i input -c:a aac -b:a 128k -ac 2 -ar 44100 -y output`, đọc thời lượng bằng `ffprobe -v error -show_entries format=duration -of csv=p=0`. Timeout 120s, kill tiến trình khi quá hạn, ném lỗi có thông báo rõ.

- [ ] **Step 5: Implement `queues.ts` (worker)** — export tên queue, kiểu job, và một hàm `createAudioQueue(connection)`; `index.ts` khởi động `Worker(AUDIO_QUEUE_NAME, handler, { connection })` với concurrency 2, log job bắt đầu/kết thúc/lỗi, và bắt `SIGTERM` để đóng sạch.

- [ ] **Step 6: Implement `apps/web/src/lib/queues.ts`** — kết nối ioredis dùng lại `REDIS_URL`, singleton chống hot-reload giống `@hpwd/db`, `enqueueAudioJob`. **Fail-open không áp dụng ở đây**: nếu Redis chết thì upload phải báo lỗi rõ ràng cho người dùng (khác rate-limit).

- [ ] **Step 7: Chạy test + `turbo test` (worker nằm trong workspace nên turbo phải thấy nó).**

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(worker): bullmq worker package with ffmpeg audio transcoding"
```

---

## Task 6: Upload nhạc riêng (web → storage → worker → phát được)

**Files:**
- Create: `apps/web/src/lib/audio.ts`, `apps/web/src/app/api/uploads/audio/route.ts`, `apps/web/src/app/api/media/[assetId]/route.ts`
- Create: `apps/worker/src/audio-worker.ts`
- Modify: `apps/web/src/lib/storage.ts` (mở `StorageAssetKind` sang `"audio"`), `packages/db/prisma/schema.prisma` (thêm `MediaAsset.status`), `apps/web/src/components/editor/panels/MusicPanel.tsx`
- Modify: `apps/web/src/app/(legal)/bao-mat/page.tsx` **và** `apps/web/src/app/(legal)/__tests__/page.test.tsx`
- Test: `apps/web/src/app/api/__tests__/uploads-audio.test.ts`, `apps/web/src/components/editor/panels/__tests__/MusicPanel.upload.test.tsx`

**Interfaces:**
- Consumes: `createSignedUploadUrl`, `enqueueAudioJob`, `AudioJobData`.
- Produces:
  - `MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024`, `AUDIO_CONTENT_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a"]` trong `lib/audio.ts`
  - `POST /api/uploads/audio` `{ contentType, sizeBytes }` → `{ uploadUrl, assetId }`
  - `POST /api/media/[assetId]/process` — báo đã PUT xong, enqueue job → `{ status: "processing" }`
  - `GET /api/media/[assetId]` → `{ status: "pending" | "processing" | "ready" | "failed", url: string | null }`

**Cảnh báo bắt buộc đọc:** `apps/web/src/app/(legal)/bao-mat/__tests__/page.test.tsx` hiện có test khẳng định trang bảo mật **không** nhắc tới lưu trữ nhạc — đó là chủ ý ở Phase 1 vì tính năng chưa có. Task này làm tính năng đó thành thật, nên **phải** cập nhật cả trang bảo mật lẫn test đó trong cùng commit. Không được xoá test; đổi nó thành khẳng định điều ngược lại (danh sách dữ liệu lưu trữ *có* nhắc file nhạc).

- [ ] **Step 1: Migration** thêm `status String @default("pending")` vào `MediaAsset` (giá trị: `pending|processing|ready|failed`). Chạy `prisma migrate dev --name add_media_asset_status`.

- [ ] **Step 2: Viết test route upload nhạc**: 401 chưa đăng nhập; 400 content-type không thuộc allowlist (thông báo tiếng Việt); 400 quá 15MB; 200 trả `uploadUrl`/`assetId` và tạo `MediaAsset` với `kind: "audio"`, `status: "pending"`.

- [ ] **Step 3: FAIL → Step 4: Mở rộng `storage.ts`** — `StorageAssetKind = "image" | "audio"`, thêm mapping đuôi cho `audio/mpeg→mp3`, `audio/mp4→m4a`, `audio/x-m4a→m4a`. Giữ nguyên ràng buộc ký cả `content-type` lẫn `content-length`. Implement route.

- [ ] **Step 5: Implement `audio-worker.ts`**: tải object nguồn từ S3 về thư mục tạm, `transcodeToAac`, upload kết quả về key `u/{userId}/{assetId}.m4a`, cập nhật `MediaAsset` (`status: "ready"`, `url`, `meta.durationSeconds`), xoá file tạm trong `finally`. Lỗi → `status: "failed"` kèm `meta.error` và ném lại để BullMQ ghi nhận (retry 2 lần, backoff cấp số nhân).

- [ ] **Step 6a: Implement `POST /api/media/[assetId]/process`** — xác thực asset thuộc session user (404 nếu không), đặt `status: "processing"`, gọi `enqueueAudioJob({ assetId, userId, sourceKey })`. Nếu enqueue lỗi (Redis chết): đặt lại `status: "failed"` và trả 503 với thông báo tiếng Việt "Hệ thống xử lý nhạc đang bận, vui lòng thử lại sau." — **không fail-open**, khác với rate-limit.

- [ ] **Step 6b: Implement `GET /api/media/[assetId]`** — chỉ trả asset của chính session user (404 nếu không phải, không phân biệt với không tồn tại). Trả `{ status, url }`, `url` chỉ khác `null` khi `status === "ready"`.

- [ ] **Step 7: Mở rộng `MusicPanel`** — thêm lựa chọn nguồn "Tải lên": file picker (`accept="audio/mpeg,audio/mp4,.mp3,.m4a"`), kiểm tra kích thước phía client, POST xin URL → PUT file → POST báo xử lý → poll `GET /api/media/[assetId]` mỗi 2s (tối đa 2 phút) hiện trạng thái tiếng Việt ("Đang xử lý…" / "Xong" / "Xử lý thất bại"); khi `ready` thì `updateMusic({ source: "upload", url, trackId: null })`. Dừng poll khi unmount.

- [ ] **Step 8: Cập nhật trang bảo mật và test của nó** như cảnh báo ở trên.

- [ ] **Step 9: Kiểm chứng đầu-cuối thật** (bắt buộc, không được thay bằng mock): chạy `docker compose up -d`, chạy worker, tạo file mp3 thật bằng ffmpeg, đi hết luồng bằng script node: xin URL → PUT → báo xử lý → poll tới `ready` → `curl` URL kết quả và xác nhận là file audio hợp lệ. Dán output vào báo cáo.

- [ ] **Step 10: Commit**

```bash
git commit -am "feat(music): user audio upload with background transcoding"
```

---

## Task 7: Section video YouTube

**Files:**
- Modify: `apps/web/src/components/invite/sections/VideoSection.tsx`
- Create: `apps/web/src/lib/youtube.ts`
- Modify: `apps/web/src/components/editor/panels/VideoPanel.tsx` (nhận cả URL đầy đủ)
- Test: `apps/web/src/lib/__tests__/youtube.test.ts`, `apps/web/src/components/invite/__tests__/VideoSection.test.tsx`

**Interfaces:**
- Produces: `parseYouTubeId(input: string): string | null` — chấp nhận ID trần, `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/`, có/không query thừa; trả `null` cho mọi thứ khác.

- [ ] **Step 1: Viết test `parseYouTubeId`** cho 6 dạng hợp lệ và các ca xấu: chuỗi rỗng, URL không phải YouTube, `javascript:` , ID sai độ dài, URL có `<script>`.

- [ ] **Step 2: FAIL → Step 3: Implement** — ID hợp lệ khớp `/^[A-Za-z0-9_-]{11}$/`; parse bằng `new URL()` trong `try/catch`, không dùng regex trên URL thô.

- [ ] **Step 4: Viết test `VideoSection`**: render `null` khi `youtubeId` rỗng hoặc không hợp lệ; khi hợp lệ thì render facade với `data-section="video"`, không nhúng iframe cho tới khi bấm play (khẳng định không có `<iframe>` trong DOM lúc đầu), có `caption` khi có.

- [ ] **Step 5: FAIL → Step 6: Implement** dùng `lite-youtube-embed` (thêm dependency, import CSS trong component). Chỉ nhận `youtubeId` đã qua `parseYouTubeId` — **không bao giờ nội suy thẳng props vào URL nhúng**.

- [ ] **Step 7: `VideoPanel` chấp nhận URL dán vào**, chuẩn hoá về ID khi blur, hiện lỗi tiếng Việt nếu không nhận ra. Thêm ca vào `panels.schema-integration.test.tsx`.

- [ ] **Step 8: Chạy tất cả + kiểm chứng `curl` trang `/i/demo` sau khi seed một video vào document.**

- [ ] **Step 9: Commit**

```bash
git commit -am "feat(video): youtube section with click-to-load facade"
```

---

## Task 8: Rich text (TipTap) + mở rộng sanitizer

**Files:**
- Create: `apps/web/src/components/editor/RichTextEditor.tsx`
- Modify: `apps/web/src/components/editor/panels/TextPanel.tsx`, `apps/web/src/lib/sanitize.ts`
- Test: `apps/web/src/lib/__tests__/sanitize.richtext.test.ts` (file riêng), `apps/web/src/components/editor/__tests__/RichTextEditor.test.tsx`

**Đây là task nhạy cảm nhất về bảo mật trong Phase 2.** `sanitizeHtml` hiện là bộ tokenizer một lượt, đã qua hai vòng vá bypass ở Phase 1 và là đoạn code được đánh giá tốt nhất nhánh. Mở rộng nó, **không viết lại**, và **không được thêm bất kỳ regex nào chạy trên chuỗi đã escape**.

**Interfaces:**
- Consumes: `sanitizeHtml(html: string): string`.
- Produces: allowlist mở rộng thêm các thẻ TipTap sinh ra: `<h2> <h3> <ul> <ol> <li> <blockquote> <s>` (đều không thuộc tính), giữ nguyên cơ chế anchor hiện có.

- [ ] **Step 1: Viết test bypass TRƯỚC khi mở rộng** — file riêng `sanitize.richtext.test.ts`, gồm:

```ts
// Các ca phải VẪN an toàn sau khi mở rộng allowlist:
it("<li onclick=...> bị escape nguyên vẹn", () => {});
it("<ul style=...> bị escape (thẻ có thuộc tính không nằm trong allowlist)", () => {});
it("<h2><script>alert(1)</script></h2> — script bị escape, h2 sống", () => {});
it("thẻ đóng mồ côi </li> không tạo markup sống", () => {});
it("javascript: trong href vẫn bị chặn khi nằm trong <li>", () => {});
it("idempotent: sanitize(sanitize(x)) === sanitize(x) với đầu vào có đủ thẻ mới", () => {});
// Và các ca phải HOẠT ĐỘNG:
it("giữ <ul><li>một</li><li>hai</li></ul>", () => {});
it("giữ <h2>Tiêu đề</h2> và <blockquote>trích</blockquote>", () => {});
```

- [ ] **Step 2: Chạy → các ca "phải hoạt động" FAIL (thẻ mới đang bị escape).**

- [ ] **Step 3: Mở rộng allowlist** bằng cách thêm tên thẻ vào `BARE_TAGS` — **không đổi cấu trúc tokenizer**. Chạy lại: tất cả xanh, kể cả toàn bộ `sanitize.test.ts` cũ (20 ca) không được sửa.

- [ ] **Step 4: Implement `RichTextEditor.tsx`** — TipTap `useEditor` với StarterKit (tắt các extension sinh thẻ ngoài allowlist: code block, horizontal rule, image), thêm Link (`openOnClick: false`, `HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }`). Thanh công cụ tiếng Việt: Đậm / Nghiêng / Gạch chân / Gạch ngang / Tiêu đề / Danh sách / Trích dẫn / Liên kết. `onUpdate` → `sanitizeHtml(editor.getHTML())` → đẩy vào store qua `useDebouncedField` (250ms như các field khác). **Quan trọng:** sanitize trước khi lưu, để nội dung trong document luôn ở dạng đã an toàn và `TextSection` sanitize lần nữa vẫn idempotent.

- [ ] **Step 5: Test `RichTextEditor`**: gõ văn bản → store nhận HTML đã sanitize; bấm nút Đậm → có `<strong>`; dán HTML độc (`<img src=x onerror=alert(1)>`) → store không chứa `<img`; giữ giới hạn 10.000 ký tự (`TextProps.html.max`) và chặn nhập thêm khi vượt.

- [ ] **Step 6: Thay `TextPanel`'s textarea bằng `RichTextEditor`.** Thêm ca vào `panels.schema-integration.test.tsx`.

- [ ] **Step 7: Chạy tất cả (bao gồm 20 ca sanitize cũ) + lint + tsc + build.**

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(text): tiptap rich text editor with extended sanitizer allowlist"
```

---

## Task 9: Hai hiệu ứng mở màn mới

**Files:**
- Create: `apps/web/src/components/invite/opening/RevealOpening.tsx`, `PetalsOpening.tsx`
- Modify: `packages/schema/src/invitation.ts` (`opening.effect` thêm `'reveal' | 'petals'`), `apps/web/src/components/invite/opening/OpeningGate.tsx`, `apps/web/src/components/editor/panels/OpeningPanel.tsx`
- Test: `apps/web/src/components/invite/__tests__/OpeningGate.newEffects.test.tsx`

**Interfaces:**
- Consumes: `useOpeningTap(onOpen, animationMs)` và `OpeningVariantProps` từ `opening/types.ts`.
- Produces: hai variant mới theo đúng hợp đồng hiện có `({ opening, guestName, onOpen })`.

**Bất biến bắt buộc (đã học ở Phase 1):** đường duy nhất để hiện nội dung không được là callback animation. Cả hai variant **phải** dùng `useOpeningTap`, vốn đã có lưới an toàn `setTimeout(animationMs + 400)`. Và `onOpen` phải chạy **đồng bộ ngay trong handler chạm** để nhạc phát được trên iOS WebView.

- [ ] **Step 1: Viết test** cho mỗi variant: nút "Mở thiệp" là `<button>` thật, focus được; chạm gọi `onOpen` đúng một lần; khi callback animation không bao giờ chạy thì lưới an toàn vẫn mở sau `animationMs + 400` (dùng fake timers); reduced-motion mở ngay.

- [ ] **Step 2: FAIL → Step 3: Implement.** `RevealOpening`: lớp phủ chia đôi trượt lên/xuống hé lộ nội dung (700ms). `PetalsOpening`: nền phủ mờ với cánh hoa rơi dày, chạm thì cánh hoa tụ lại và tan (750ms). Cả hai hiện `monogram` và "Kính mời: {guestName}" theo `opening.showGuestName`, y hệt ba variant cũ.

- [ ] **Step 4: Mở rộng `OpeningEffect` enum trong schema** và thêm vào bảng chọn của `OpeningPanel` (nhãn tiếng Việt "Hé lộ", "Cánh hoa"). Kiểm tra `OpeningGate` có nhánh cho mọi giá trị (dùng `never` guard để lỗi biên dịch nếu thiếu).

- [ ] **Step 5: Chạy tất cả + kiểm chứng `curl` `/i/demo` với từng effect, `grep -c "Mở thiệp"` ≥ 1.**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(opening): reveal and petals opening effects"
```

---

## Task 10: Hoàn thiện — blur thật cho ảnh, tài liệu, dọn dẹp

**Files:**
- Modify: `apps/web/src/app/api/uploads/route.ts` hoặc tạo `apps/web/src/app/api/media/[assetId]/blur/route.ts`
- Modify: `apps/web/src/components/editor/fields/ImageField.tsx`
- Modify: `.env.example`, `docs/` (ghi chú vận hành worker)
- Test: cập nhật `ImageField.test.tsx`

**Interfaces:**
- Consumes: `processImage(buffer)` — hiện là code chết, được xuất và test đầy đủ nhưng không nơi nào gọi.

- [ ] **Step 1: Viết test** cho route sinh blur: nhận `assetId` của chính mình, tải object từ storage, chạy `processImage`, trả `{ blurDataUrl, width, height }`; 404 cho asset của người khác; 400 nếu asset không phải ảnh.

- [ ] **Step 2: FAIL → Step 3: Implement** và cho `ImageField` gọi sau khi PUT xong, thay hằng `TRANSPARENT_PIXEL_DATA_URL` bằng blur thật (giữ hằng làm fallback khi route lỗi — ảnh vẫn phải hiện được).

- [ ] **Step 4: Viết `docs/operations.md`**: cách chạy worker ở production (cần ffmpeg trong image), biến môi trường bắt buộc (`REDIS_URL`, `R2_*`, `NEXT_PUBLIC_SITE_URL` phải set lúc **build**, `AUTH_URL`/`AUTH_TRUST_HOST`), và cách kiểm tra hàng đợi khi nhạc kẹt ở "Đang xử lý".

- [ ] **Step 5: Chạy toàn bộ suite, lint, tsc, build, và `next build` với DB rỗng** (bảo vệ blocker B3 của Phase 1 không tái diễn).

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(uploads): real blur placeholders and worker operations doc"
```

---

## Ngoài phạm vi Phase 2 (đã ghi ledger, để Phase 3/4)

- AI xoá nền ảnh, upload font, mẫu Premium, album masonry/carousel → **Phase 3**.
- Chống ghi đè khi mở hai tab (cột `version`), lưu lịch sử slug + chuyển hướng link cũ, CSP, cấu hình tin cậy `x-forwarded-for` sau Cloudflare, khoảng cách LCP 2.7s → **Phase 4 (hardening)**.
- Các mục HUMAN TODO còn tồn (file font, nhạc có bản quyền, email liên hệ pháp lý, OAuth thật, quét QR bằng app ngân hàng) — không phải việc code.
