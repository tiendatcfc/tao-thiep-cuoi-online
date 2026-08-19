# Phase 1 Hardening — Chống mất dữ liệu và link hỏng

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Đóng hai lỗ hổng đã được vòng review toàn nhánh Phase 1 xác định nhưng hoãn lại: hai tab mở cùng lúc âm thầm ghi đè nhau, và đổi slug sau khi đã phát link làm hỏng toàn bộ link cũ đồng thời để người khác chiếm được slug đó.

**Architecture:** Thêm kiểm soát đồng thời lạc quan (optimistic concurrency) bằng cột `version` trên `Invitation`, và một bảng `InvitationSlug` ghi lịch sử mọi slug từng được xuất bản để chuyển hướng link cũ và giữ chỗ chống chiếm dụng.

**Tech Stack:** Prisma 6 + PostgreSQL, Next.js 15 App Router, Zustand, vitest.

**Nguồn:** vòng review toàn nhánh Phase 1, mục "Should fix before launch" #3 và #4. Ledger: `.superpowers/sdd/2026-08-10-phase-0-1-mvp/progress.md`.

## Global Constraints

- Node ≥ 22, pnpm ≥ 9, TypeScript `strict: true`. Mọi copy người dùng thấy bằng **tiếng Việt**.
- Route thuộc sở hữu dùng `findOwnedInvitation` + `NOT_FOUND_MESSAGE` + `UNAUTHENTICATED_MESSAGE` từ `@/lib/ownership`: 401 chưa đăng nhập, **404 cho cả không tồn tại lẫn không phải của mình**. Không route nào trả 403.
- Không đọc capability chỉ có ở trình duyệt trong lúc render — chỉ trong `useEffect`.
- Mọi thao tác editor phải để document còn `InvitationDocumentSchema.parse` được.
- Test route: import handler trực tiếp, `new Request(...)`, `{ params: Promise.resolve({...}) }`, Postgres dev thật, dọn ở `afterEach`/`afterAll`. Test `.tsx` cần `// @vitest-environment jsdom` dòng đầu + `afterEach(cleanup)`.
- Test phải có sức bắt lỗi: gỡ hành vi ra → đỏ → khôi phục → xanh, dán output vào báo cáo.
- Migration chạy bằng `pnpm --filter @hpwd/db exec prisma migrate dev --name <ten>`; nếu tải engine lỗi chứng chỉ thì thêm `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem`. Không tắt xác thực TLS.
- Commit tiếng Anh, conventional commits.

---

## Task 1: Cột `version` — chống hai tab ghi đè nhau

**Vấn đề hiện tại:** `PATCH /api/invitations/[id]` ghi đè mù (`prisma.invitation.update({ where: { id }, data })`). `useAutosave` có biến `revision` nhưng nó chỉ là biến cục bộ trong module, không bao giờ được gửi lên hay đối chiếu với server. Hai tab (hoặc một tab để mở qua đêm) âm thầm phá công của nhau trong khi **cả hai đều hiện "Đã lưu"**.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration mới)
- Modify: `apps/web/src/app/api/invitations/[id]/route.ts` (GET trả `version`, PATCH kiểm tra `version`)
- Modify: `apps/web/src/stores/editor-store.ts` (giữ `version`)
- Modify: `apps/web/src/components/editor/useAutosave.ts` (gửi `version`, xử lý 409)
- Modify: `apps/web/src/components/editor/EditorLayout.tsx` (hiện trạng thái xung đột)
- Modify: `apps/web/src/app/(dashboard)/editor/[id]/page.tsx` (truyền `version` vào store)
- Test: `apps/web/src/app/api/__tests__/invitations-id.test.ts`, `apps/web/src/components/editor/__tests__/useAutosave.test.tsx`, `apps/web/src/stores/__tests__/editor-store.test.ts`

**Interfaces:**
- `Invitation.version Int @default(0)`
- `GET /api/invitations/[id]` → `{ invitation: { id, slug, status, document, settings, version } }`
- `PATCH /api/invitations/[id]` body `{ document?, settings?, version: number }` → 200 `{ savedAt, version }` | **409 `{ error, currentVersion }`** khi `version` không khớp
- `EditorState` thêm: `version: number`, `setVersion(v: number): void`; `setDocument(doc, version)` nhận thêm tham số
- `useAutosave` trả thêm `AutosaveErrorKind` mở rộng: `"network" | "invalid" | "conflict" | null`

- [ ] **Step 1: Migration.** Thêm `version Int @default(0)` vào `model Invitation`. Chạy `prisma migrate dev --name add_invitation_version`. Xác nhận bằng `docker exec hpwd-postgres psql -U postgres -d hpwd -c '\d "Invitation"'`.

- [ ] **Step 2: Viết test route TRƯỚC.** Trong `invitations-id.test.ts` thêm:

```
it("PATCH với version đúng thì lưu và trả version mới", ...)      // v0 -> 200 { version: 1 }
it("PATCH với version cũ trả 409 và KHÔNG ghi đè", ...)           // lưu v0->v1, rồi PATCH lại với version:0
                                                                   // -> 409, và document trong DB vẫn là bản v1
it("409 kèm currentVersion để client biết mình lệch bao nhiêu", ...)
it("PATCH thiếu version trả 400", ...)
it("GET trả version hiện tại", ...)
```

Ca "KHÔNG ghi đè" là ca quan trọng nhất — nó chính là lỗi mất dữ liệu. Đọc lại từ DB để khẳng định, không tin body trả về.

- [ ] **Step 3: Chạy → FAIL.**

- [ ] **Step 4: Implement route.** Thêm `version: z.number().int().min(0)` (bắt buộc) vào `patchBodySchema`. Thay `update` bằng `updateMany` có điều kiện version, rồi phân biệt kết quả:

```ts
const result = await prisma.invitation.updateMany({
  where: { id, version: parsed.data.version },
  data: { ...data, version: { increment: 1 } },
});
if (result.count === 0) {
  // Ownership đã xác nhận ở trên, nên count===0 chỉ có thể là lệch version.
  const current = await prisma.invitation.findUnique({
    where: { id }, select: { version: true },
  });
  return NextResponse.json(
    {
      error: "Thiệp đã được chỉnh sửa ở nơi khác. Hãy tải lại trang để lấy bản mới nhất.",
      currentVersion: current?.version ?? null,
    },
    { status: 409 },
  );
}
return NextResponse.json({ savedAt: Date.now(), version: parsed.data.version + 1 });
```

- [ ] **Step 5: Chạy → PASS.**

- [ ] **Step 6: Store.** Thêm `version: number` và `setVersion`. `setDocument(doc, version)` set cả hai và reset `dirty`/`lastSavedAt` như hiện tại. Cập nhật mọi nơi gọi `setDocument` (editor page, và tất cả test đang gọi nó). Thêm test: `setDocument` seed đúng version; `setVersion` không đụng `dirty`.

- [ ] **Step 7: Autosave.** Gửi `version: useEditorStore.getState().version` trong body; khi 200 thì `setVersion(body.version)` cùng lúc với `markSaved`; khi 409 thì đặt `error = "conflict"`, **dừng hẳn, không thử lại** (thử lại sẽ ghi đè đúng thứ ta đang bảo vệ), và không `markSaved`. Giữ nguyên cơ chế nối tiếp request + `AbortController` + flush khi unmount đã có.

  **Lưu ý bắt buộc:** flush lúc unmount (`keepalive`) cũng phải mang `version`, và nếu nó gặp 409 thì không có gì để làm — chấp nhận, đừng ghi đè.

- [ ] **Step 8: Test autosave.** Ca bắt buộc: server trả 409 → `error === "conflict"`, `dirty` vẫn `true`, và **không có PATCH nào tiếp theo được gửi** dù người dùng gõ thêm (chứng minh bằng số lần gọi `fetch`). Chứng minh sức bắt lỗi bằng cách bỏ nhánh 409 ra.

- [ ] **Step 9: UI.** Trong `EditorLayout`, trạng thái `conflict` hiện thông báo tiếng Việt nổi bật (khác hẳn lỗi mạng): "Thiệp đã được chỉnh sửa ở nơi khác — tải lại trang để tránh mất dữ liệu." kèm nút "Tải lại". Nút "Thử lưu lại" **phải bị ẩn** ở trạng thái này.

- [ ] **Step 10:** Chạy toàn bộ: `pnpm --filter @hpwd/web test`, `pnpm exec turbo test`, `turbo lint`, `tsc --noEmit`, `next build`.

- [ ] **Step 11: Kiểm chứng thật hai tab.** Bằng script node: GET lấy version, PATCH lần 1 (thành công), PATCH lần 2 với version cũ → khẳng định 409 và document trong DB vẫn là bản của lần 1. Dán output.

- [ ] **Step 12: Commit** — `feat(editor): optimistic concurrency so two tabs cannot silently overwrite each other`

---

## Task 2: Lịch sử slug — link cũ không chết, slug không bị chiếm

**Vấn đề hiện tại:** `publish/route.ts:76-79` ghi thẳng `slug` mới, không lưu vết. Cặp đôi xuất bản `an-va-binh`, gửi 200 thiệp qua Zalo, rồi đổi sang `an-binh-2026` → **toàn bộ link đã gửi trả 404**, và tệ hơn: cặp đôi khác có thể đăng ký chính `an-va-binh` và phục vụ đám cưới của người lạ tại URL đã phát đi. Comment ở `publish/route.ts:98-101` đã ghi nhận việc không revalidate slug cũ nhưng chưa xử lý.

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `InvitationSlug` + migration)
- Modify: `apps/web/src/app/api/invitations/[id]/publish/route.ts`
- Modify: `apps/web/src/app/i/[slug]/page.tsx` (chuyển hướng khi trúng slug cũ)
- Test: `apps/web/src/app/api/__tests__/publish.test.ts`, `apps/web/src/app/i/[slug]/__tests__/slug-redirect.test.ts` (mới)

**Interfaces:**
```prisma
model InvitationSlug {
  id           String     @id @default(cuid())
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  invitationId String
  slug         String     @unique
  createdAt    DateTime   @default(now())
  @@index([invitationId])
}
```
`Invitation` thêm `slugHistory InvitationSlug[]`.

- [ ] **Step 1: Migration** `add_invitation_slug_history`. **Backfill bắt buộc trong cùng migration:** chèn một hàng `InvitationSlug` cho mọi `Invitation` đang `status='published'` với slug hiện tại của nó — nếu không, các thiệp đã xuất bản trước khi có tính năng này sẽ mất khả năng chống chiếm slug. Viết câu `INSERT ... SELECT` vào file migration và xác nhận bằng psql.

- [ ] **Step 2: Viết test TRƯỚC** trong `publish.test.ts`:

```
it("xuất bản lần đầu ghi slug vào lịch sử", ...)
it("đổi slug giữ lại slug cũ trong lịch sử và thêm slug mới", ...)
it("409 khi slug đang nằm trong lịch sử của thiệp KHÁC", ...)   // chống chiếm dụng
it("cho phép quay lại slug cũ của CHÍNH mình", ...)             // an-binh-2026 -> an-va-binh
it("revalidate cả slug cũ lẫn slug mới khi đổi", ...)           // revalidatePath được gọi 2 lần
```

- [ ] **Step 3: FAIL → Step 4: Implement publish route.**
  - Kiểm tra chiếm dụng: ngoài `prisma.invitation.findUnique({ where: { slug } })` hiện có, thêm tra `prisma.invitationSlug.findUnique({ where: { slug } })`; nếu tồn tại và `invitationId !== id` → 409 (cùng thông báo tiếng Việt như hiện tại).
  - Trong cùng `prisma.$transaction` với `invitation.update`: `invitationSlug.upsert({ where: { slug }, create: { slug, invitationId: id }, update: {} })`.
  - Nếu slug đổi (`previousSlug !== slug`): gọi `revalidatePath` cho **cả hai**, và sửa comment ở dòng 98-101 cho khớp thực tế mới.
  - Giữ nguyên cách bắt `P2002` → 409 (giờ áp dụng cho cả hai bảng).

- [ ] **Step 5: Viết test chuyển hướng** cho `/i/[slug]`: slug cũ của một thiệp đang xuất bản → `permanentRedirect` tới slug hiện tại; slug cũ của thiệp đã chuyển về `draft` → 404 (không lộ nội dung chưa xuất bản); slug hoàn toàn lạ → 404.

- [ ] **Step 6: FAIL → Step 7: Implement.** Trong `page.tsx`, khi `findUnique({ where: { slug } })` không ra kết quả, tra `invitationSlug` kèm `include: { invitation: { select: { slug: true, status: true } } }`; nếu có và `invitation.status === 'published'` và `invitation.slug !== slug` thì `permanentRedirect(\`/i/${invitation.slug}\`)` (giữ nguyên query string `?g=` nếu có — link khách mời phải sống sót qua chuyển hướng). Ngược lại `notFound()`.

  **Quan trọng:** áp dụng cho cả `generateMetadata` lẫn component chính, và `permanentRedirect` ném ra exception — đảm bảo nó không bị nuốt bởi `try/catch` nào bao quanh.

- [ ] **Step 8:** Chạy toàn bộ suite + lint + tsc + build.

- [ ] **Step 9: Kiểm chứng thật.** Dev server: xuất bản `demo` → đổi slug sang `demo-2` → `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://localhost:3000/i/demo` phải là 308 tới `/i/demo-2`; `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/i/demo?g=demo-guest-token'` cũng chuyển hướng và giữ `?g=`. Dán output. Trả seed về trạng thái cũ sau khi thử.

- [ ] **Step 10: Commit** — `feat(publish): slug history with redirects and squatting protection`

---

## Ngoài phạm vi

CSP, cấu hình tin cậy `x-forwarded-for`, khoảng cách LCP, và 51 mục minor đã hoãn — giữ nguyên trong ledger, không đụng ở kế hoạch này.
