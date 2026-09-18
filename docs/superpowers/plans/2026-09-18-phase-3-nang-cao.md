# HPWD Phase 3 — Font tùy chỉnh, album nâng cao, 10 mẫu Premium, AI xoá nền

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bốn tính năng "nâng cao" còn lại của spec (mục 12, 13-nâng-cao, 15, 16), trên nền Phase 2 đã xong 10/10.

**Spec:** `docs/superpowers/specs/2026-08-10-wedding-invitation-builder-design.md` — hàng 12, 13, 15, 16 của bảng tính năng; mục 7 (lộ trình) xếp cả bốn vào Phase 3.
**Nền:** `docs/superpowers/HANDOFF.md`, ledger `.superpowers/sdd/2026-08-12-phase-2-guests-forms/progress.md`.

## Global Constraints

Kế thừa nguyên văn từ Phase 2, nhắc lại những điều dễ quên nhất:

- Mọi copy hiển thị bằng **tiếng Việt**. TypeScript `strict`. Node ≥ 22, pnpm ≥ 9.
- **Bất biến B1:** mọi hành động trong editor phải để `InvitationDocumentSchema.parse` còn chạy được. Hỏng là autosave im lặng ngừng lưu **toàn bộ** thiệp.
- Route thuộc sở hữu dùng `findOwnedInvitation`: 401 khi chưa đăng nhập, **404 cho cả "không tồn tại" lẫn "không phải của bạn"**. Không route nào trả 403.
- **Không tắt xác thực TLS.** Cần chứng chỉ thì `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem` (Node) hoặc `PIP_CERT`/`REQUESTS_CA_BUNDLE` (Python).
- `lib/sanitize.ts` chỉ được mở rộng bằng cách thêm tên thẻ vào `BARE_TAGS`. Không viết lại tokenizer.
- Không đọc capability chỉ có ở trình duyệt trong lúc render — chỉ trong `useEffect`.
- Test phải có sức bắt lỗi: gỡ hành vi ra → đỏ → khôi phục → xanh, dán bằng chứng vào báo cáo.
- Commit tiếng Anh, conventional commits.

**Ràng buộc riêng của Phase 3:**

- **Đĩa.** Ổ dữ liệu của máy dev từng chạm 100%. Task 4 cài `rembg` vào **venv Python trong repo** (`services/rembg/.venv`, gitignore) chứ không kéo image Docker — quyết định của chủ dự án ngày 2026-09-18. Dockerfile vẫn viết cho production nhưng không build thử trên máy này.
- **Font.** 16 file `.woff2` của các font dựng sẵn vẫn thiếu (HUMAN TODO cũ). Task 1 **không** phụ thuộc vào chúng: font người dùng tự tải lên đi đường khác hoàn toàn. Nhưng khi kiểm chứng bằng mắt, nhớ rằng font dựng sẵn vẫn đang fallback.

---

## Cấu trúc file

```
services/rembg/                      MỚI — microservice Python
  main.py                            FastAPI: POST /remove-background
  requirements.txt
  Dockerfile                         cho production (không build ở máy dev)
  README.md                          cách chạy venv ở dev

apps/web/src/lib/
  font.ts                            MỚI — hằng số, validate, glyph tiếng Việt
  queues.ts                          MODIFY — thêm queue xoá nền

apps/web/src/app/api/
  uploads/font/route.ts              MỚI — upload + validate + convert + lưu
  fonts/[assetId]/route.ts           MỚI — trạng thái/xoá font của chính mình
  images/background-removal/route.ts MỚI — đẩy job xoá nền

apps/web/src/components/editor/panels/
  ThemePanel.tsx                     MODIFY — mục "Font riêng"
  AlbumPanel.tsx                     MODIFY — caption từng ảnh + layout mới

apps/web/src/components/editor/fields/
  FontUploadField.tsx                MỚI
  ImageField.tsx                     MODIFY — nút "Xoá nền"

apps/web/src/components/invite/
  CustomFontStyle.tsx                MỚI — inject @font-face cho thiệp
  sections/AlbumSection.tsx          MODIFY — caption + layout mới

apps/worker/src/
  queues.ts                          MODIFY — queue + job type xoá nền
  background-removal-worker.ts       MỚI
  index.ts                           MODIFY — khởi động worker thứ hai

packages/schema/src/invitation.ts    MODIFY — AlbumImage.caption, layout mới
packages/db/scripts/templates/
  definitions.ts                     MODIFY — 10 mẫu premium
  premium.ts                         MỚI (nếu definitions.ts quá dài)
```

---

## Task 1: Upload font chữ tùy chỉnh

**Files:**
- Create: `apps/web/src/lib/font.ts`, `apps/web/src/app/api/uploads/font/route.ts`, `apps/web/src/app/api/fonts/[assetId]/route.ts`, `apps/web/src/components/editor/fields/FontUploadField.tsx`, `apps/web/src/components/invite/CustomFontStyle.tsx`
- Modify: `apps/web/src/components/editor/panels/ThemePanel.tsx`, `apps/web/src/app/i/[slug]/page.tsx` (hoặc layout tương ứng)
- Test: `apps/web/src/lib/__tests__/font.test.ts`, `apps/web/src/app/api/__tests__/uploads-font.test.ts`, `apps/web/src/components/invite/__tests__/CustomFontStyle.test.tsx`

**Đã có sẵn:** `ThemeSchema.customFonts: { family, url }[]` (mặc định `[]`, **chưa ai đọc**). `AssetKind` đã có `font`. `MediaAsset.status` đã có.

**Interfaces:**
- Consumes: `putObject` (`lib/storage.ts`), `findOwnedInvitation` không cần (font thuộc user, không thuộc thiệp).
- Produces: `MediaAsset{ kind: 'font', meta: { family, format, glyphWarning } }`; `theme.customFonts` được ThemePanel ghi vào.

- [x] **Step 1: Viết test cho `lib/font.ts` TRƯỚC.** Gồm: cap 5MB; allowlist `font/ttf|font/otf|font/woff2` + đuôi `.ttf/.otf/.woff2`; `VIETNAMESE_SAMPLE` chứa đủ `ăâđêôơư` và `ẮẰẲẴẶ`; `missingVietnameseGlyphs(font)` trả về danh sách ký tự thiếu; tên family được **làm sạch** trước khi vào CSS (xem Step 3).

- [x] **Step 2: FAIL → Step 3: Implement.**
  **Bảo mật — điểm nguy hiểm nhất của task này:** `family` lấy từ metadata trong file font do người lạ tải lên, rồi được nội suy vào CSS `@font-face { font-family: "..." }`. Một family chứa `"` hoặc `}` thoát ra khỏi khối CSS. **Phải có allowlist ký tự** (chữ, số, khoảng trắng, gạch ngang) và cắt độ dài, không phải denylist. Viết test bypass trước, giống cách `sanitize.richtext.test.ts` làm ở Task 8.

- [x] **Step 4: Route `POST /api/uploads/font`.** 401 → pre-check content-length (cap + margin) → formData → allowlist type → `file.size` → parse bằng `fontkit` (đây mới là kiểm tra thật "có phải font không", giống cách `processImage` là magic-byte check cho ảnh) → cảnh báo glyph tiếng Việt (**cảnh báo, không chặn** — người dùng có thể cố ý dùng font chỉ để hiện tên tiếng Anh) → convert TTF/OTF sang WOFF2 bằng `wawoff2` (WOFF2 sẵn thì giữ nguyên) → `putObject` → `MediaAsset` `status: 'ready'` (không có worker nào xử lý tiếp — xem bài học Task 10).

- [x] **Step 5: `DELETE /api/fonts/[assetId]`** — 404 cho cả không tồn tại lẫn không phải của mình. Xoá cả object lẫn hàng DB.

- [x] **Step 6: `FontUploadField` + mục "Font riêng" trong `ThemePanel`.** Tải lên → thêm vào `theme.customFonts` → family mới xuất hiện trong bảng chọn font tiêu đề/nội dung cùng với 8 font dựng sẵn. Hiện cảnh báo glyph bằng tiếng Việt nếu có.

- [x] **Step 7: `CustomFontStyle`** — render `<style>` với `@font-face` cho từng `theme.customFonts`, trên cả trang thiệp lẫn preview trong editor. Dùng `fontFamilyStack` hiện có làm fallback.

- [x] **Step 8: Chạy tất cả + lint + tsc + build. Kiểm chứng trình duyệt**: tải một font thật lên, đặt làm font tiêu đề, `curl /i/{slug}` thấy `@font-face` và file font tải được.

- [x] **Step 9: Commit** `feat(fonts): custom font upload with vietnamese glyph check`

---

## Task 2: Album nâng cao

**Files:**
- Modify: `packages/schema/src/invitation.ts`, `apps/web/src/components/invite/sections/AlbumSection.tsx`, `apps/web/src/components/editor/panels/AlbumPanel.tsx`
- Test: cập nhật `AlbumSection.test.tsx`, `AlbumPanel.test.tsx`, thêm ca vào `panels.schema-integration.test.tsx`

**Đã có sẵn (Phase 1 + nhóm A):** 3 layout `grid|masonry|carousel`, lightbox `yet-another-react-lightbox`, pipeline sharp (WebP 400/800/1600 + blur thật + autoOrient EXIF), sắp xếp Lên/Xuống qua `ListField`. **Phần "cơ bản" của mục 13 đã xong** — task này chỉ làm phần "nâng cao".

**Interfaces:**
- Produces: `AlbumImageSchema` thêm `caption: z.string().default('')`; `AlbumPropsSchema.layout` thêm `'hero'`.

- [ ] **Step 1: Viết test trước** cho: `caption` mặc định `''` nên document cũ vẫn parse; caption hiển thị dưới ảnh ở cả 3 layout cũ; caption đi vào lightbox; layout `hero` (ảnh đầu tràn rộng + lưới bên dưới) render đúng số ảnh.

- [ ] **Step 2: FAIL → Step 3: Implement.** `caption` phải `.default('')` chứ **không** `.optional()` — cùng lý do `MusicSchema.assetId` đã chọn `.default(null)` ở Task 6: tài liệu lưu trước khi có trường này vẫn phải parse được, và kiểu đầu ra không được thành `string | undefined` làm hỏng các file test hiện có.

- [ ] **Step 4: Caption đi qua `sanitizePlainText`** khi render, không phải `sanitizeHtml` — đây là text thuần, không phải markup.

- [ ] **Step 5: Chạy tất cả + lint + tsc + build + kiểm chứng trình duyệt cả 4 layout.**

- [ ] **Step 6: Commit** `feat(album): per-photo captions and hero layout`

---

## Task 3: 10 mẫu thiệp Premium

**Files:**
- Modify: `packages/db/scripts/templates/definitions.ts` (hoặc tách `premium.ts`), `packages/db/scripts/seed-templates.ts`
- Test: cập nhật `packages/db/__tests__/templates.test.ts` (hoặc tên tương đương)

**Đã có sẵn:** `TemplateTier = 'basic' | 'premium'`, gallery `/mau-thiep` **đã có bộ lọc tier và tab "Premium"** — hiện bấm vào là danh sách rỗng. `buildTemplate` hardcode `tier: 'basic'`.

**Interfaces:**
- Consumes: `createDefaultDocument()`, `createSection()`, `buildTheme`, `buildOpening`, `withSequentialOrder`.
- Produces: 10 `TemplateDefinition` với `tier: 'premium'`.

- [ ] **Step 1: Cho `buildTemplate` nhận `tier`** (mặc định `'basic'` để 5 mẫu cũ không đổi một byte). Test chốt: 5 mẫu cũ vẫn `tier: 'basic'`, id/slug không đổi — **đổi id là mất thiệp của người đã dùng mẫu đó**, vì `seed-templates.ts` upsert theo id cố định.

- [ ] **Step 2: Viết test cho bộ 10 mẫu premium TRƯỚC khi viết dữ liệu:** đúng 10 mẫu `tier: 'premium'`; mọi id/slug là duy nhất trên toàn bộ 15 mẫu; **mọi `document` parse được bằng `InvitationDocumentSchema`**; mỗi mẫu dùng ít nhất một thứ mà mẫu basic không dùng (hiệu ứng mở màn mới, layout album mới, section video/story/text); không mẫu nào dùng font ngoài `FONT_OPTIONS` trừ khi cố ý.

- [ ] **Step 3: FAIL → Step 4: Viết 10 mẫu.** Spec nói mẫu premium khác ở "parallax, layout album phức tạp, typography riêng". Parallax chưa tồn tại như một tính năng — **không** tự ý thêm; dùng những gì đã có: 6 hiệu ứng mở màn (kể cả `reveal`/`petals` mới), 4 layout album (kể cả `hero` mới), rich text, video, hạt rơi, và các cặp font khác nhau. Nếu muốn parallax thì phải là một task riêng, có test riêng.
  Nội dung mẫu bằng **tiếng Việt thật**, không lorem ipsum — theo đúng chuẩn 5 mẫu cũ.

- [ ] **Step 5: `seed-templates.ts` sinh thumbnail cho cả 15 mẫu** (đã idempotent sẵn; kiểm rằng nhãn tier trên thumbnail hiện đúng "Premium").

- [ ] **Step 6: Chạy seed thật + `curl /mau-thiep?tier=premium`** thấy đủ 10 mẫu; bấm "Dùng mẫu này" tạo được thiệp parse được.

- [ ] **Step 7: Commit** `feat(templates): ten premium templates`

---

## Task 4: AI xoá nền ảnh (rembg)

**Files:**
- Create: `services/rembg/{main.py,requirements.txt,Dockerfile,README.md}`, `apps/worker/src/background-removal-worker.ts`, `apps/web/src/app/api/images/background-removal/route.ts`
- Modify: `apps/worker/src/queues.ts`, `apps/worker/src/index.ts`, `apps/web/src/lib/queues.ts`, `apps/web/src/components/editor/fields/ImageField.tsx`, `.env.example`, `docs/operations.md`
- Test: `apps/worker/src/__tests__/background-removal-worker.test.ts`, `apps/web/src/app/api/__tests__/background-removal.test.ts`, `services/rembg/test_main.py`

**Interfaces:**
- Consumes: `createAudioQueue`/`createAudioWorker` làm khuôn mẫu (đổi tên cho tổng quát nếu cần), `downloadToFile`/`uploadFile` (`apps/worker/src/storage.ts`), `MediaAsset.status`.
- Produces: `POST /api/images/background-removal { assetId } -> { assetId }` (asset MỚI, `status: 'processing'`); polling qua `GET /api/media/[assetId]` **đã có sẵn từ Task 6**.

**Quyết định đã chốt:** self-host, **không dùng API trả phí**. Ở máy dev chạy bằng venv Python trong `services/rembg/.venv` (gitignore), không kéo image Docker — ổ đĩa đã từng đầy 100%.

- [ ] **Step 1: Dựng service trước, độc lập với Node.** `services/rembg/main.py`: FastAPI, `POST /remove-background` nhận multipart ảnh, trả PNG có alpha; `GET /health`. Model `isnet-general-use`. Ràng buộc bắt buộc:
  - Giới hạn kích thước ảnh vào và **timeout**, giống cách `ffmpeg.ts` đã làm (`TIMEOUT_MS`, `MAX_BUFFER_BYTES`).
  - **Không bao giờ nhận URL để tự tải về** — chỉ nhận bytes. Nhận URL là mở SSRF, đúng lỗi mà `-protocol_whitelist file` của ffmpeg đã chặn.
  - Service **không** nói chuyện với Postgres hay R2. Nó là hàm thuần ảnh-vào/ảnh-ra; worker Node giữ toàn bộ quyền truy cập dữ liệu.
  - Nghe trên loopback ở dev; ở production không expose ra ngoài.

- [ ] **Step 2: `services/rembg/test_main.py`** — dùng `TestClient` của FastAPI: ảnh thật vào → PNG ra, có kênh alpha, kích thước khớp; file không phải ảnh → 400; ảnh quá lớn → 413.

- [ ] **Step 3: Queue + worker.** `queues.ts` thêm `BG_REMOVAL_QUEUE_NAME`, `BgRemovalJobData { sourceAssetId, targetAssetId, userId, sourceKey }`, cùng `AUDIO_JOB_OPTIONS` (3 lần thử, backoff luỹ thừa). `index.ts` khởi động worker thứ hai — **kiểm rằng SIGTERM đóng cả hai**.

- [ ] **Step 4: `background-removal-worker.ts`** — tải object nguồn → POST sang service → nhận PNG → `uploadFile` key `u/{userId}/{assetId}-nobg.png` → cập nhật `MediaAsset` `status: 'ready'`. Lỗi: chỉ đánh `failed` ở **lần thử cuối** (`job.attemptsMade + 1 >= attempts`), rồi rethrow — đúng khuôn `audio-worker.ts`. `meta` phải **đọc-rồi-trộn**, vì Prisma Json update **thay thế** cả cột.

- [ ] **Step 5: Route `POST /api/images/background-removal`** — 401; asset nguồn phải thuộc về người gọi (404 nếu không); phải là `kind: 'image'` (400 nếu không); tạo `MediaAsset` mới `status: 'pending'` → enqueue → `processing`; enqueue hỏng thì đặt `failed` + 503, **không fail-open** (khuôn Task 6).

- [ ] **Step 6: `ImageField` thêm nút "Xoá nền"** — chỉ hiện khi đã có ảnh; poll `GET /api/media/{assetId}` mỗi 2s, tối đa 120s (khuôn `MusicPanel`); xong thì thay URL ảnh. Giữ ảnh gốc: **không xoá asset nguồn**, người dùng phải hoàn tác được.

- [ ] **Step 7: `.env.example` + `docs/operations.md`** — `REMBG_URL`, cách chạy service, và thêm một mục runbook "ảnh kẹt ở Đang xoá nền" song song với mục nhạc đã có.

- [ ] **Step 8: Chạy tất cả + kiểm chứng đầu-cuối bằng ảnh thật**: ảnh có nền → PNG kết quả có pixel alpha=0 ở góc và alpha=255 ở chủ thể (kiểm bằng sharp, không qua mắt thường).

- [ ] **Step 9: Commit** `feat(images): self-hosted ai background removal`

---

## Ngoài phạm vi Phase 3

- **Parallax** — spec nhắc trong mô tả mẫu Premium nhưng chưa từng được định nghĩa như một tính năng. Cần task riêng (và phải cân nhắc `prefers-reduced-motion` + hiệu năng cuộn trên máy yếu).
- Mọi mục Phase 4 (CSP, `x-forwarded-for`, LCP, backup, monitoring, SEO).
- 16 file `.woff2` còn thiếu và các HUMAN TODO khác — không phải việc code.
