# HPWD — Bản giao việc (cập nhật 2026-08-19)

Website tạo thiệp cưới online miễn phí, tiếng Việt. Đọc file này trước khi làm gì.

## Trạng thái hiện tại

- Nhánh: `feat/phase-0-1-mvp`, HEAD `b1bfc29` (+1 commit docs sau đó), cây làm việc sạch, **84 commit**, chưa merge vào `main` (main chỉ có docs).
- Test: **775 (web) + 10 (db) + 7 (schema)** đều xanh; lint + `tsc --noEmit` + `next build` sạch. Kiểm bằng `pnpm exec turbo test --force`.
- **Chưa có git remote** → workflow CI (`.github/workflows/ci.yml`) chưa bao giờ chạy thật.

## Tài liệu nguồn (đọc theo thứ tự này)

1. Spec: `docs/superpowers/specs/2026-08-10-wedding-invitation-builder-design.md` — mục 2 là bảng 17 tính năng, mục 7 là lộ trình 5 phase.
2. Plan đã viết: `docs/superpowers/plans/` (Phase 0+1, Phase 2, Hardening).
3. **Ledger — quan trọng nhất**: `.superpowers/sdd/*/progress.md` (gitignored). Ghi mọi quyết định, mọi mục đã hoãn, mọi HUMAN TODO, và lý do.
4. **Đừng tin checklist trong plan** — Phase 1 còn nguyên 0/73 ô chưa tick dù code đã xong. Ledger là nguồn sự thật; code là nguồn sự thật cuối cùng.

## Đã xong

Phase 0 (nền móng), Phase 1 (MVP, 19 task + review toàn nhánh + đợt sửa 5 blocker), một đợt hardening chống mất dữ liệu (cột `version` chống hai tab ghi đè; lịch sử slug + chuyển hướng 308), và **toàn bộ nhóm A "đã hứa mà chưa giao" (8 mục, 7 task, 2026-08-19)** — chi tiết + mọi ruling trong ledger `.superpowers/sdd/2026-08-19-group-a-promised-not-delivered/progress.md`:

1. Section video YouTube render thật qua `lite-youtube-embed` (facade, iframe chỉ tải khi bấm play). **Bất biến mới: chỉ giá trị đã qua `parseYoutubeId` (`apps/web/src/lib/youtube.ts`) được vào markup nhúng** — không bao giờ nội suy `props.youtubeId` thô.
2. Album render đủ 3 layout grid/masonry/carousel theo `props.layout`.
3. `processImage` đã sống: `/api/uploads` giờ nhận **multipart trực tiếp**, xử lý sharp phía server (WebP 400/800/1600 + blur thật + **autoOrient EXIF** — ảnh điện thoại chụp dọc không còn bị xoay ngang), trả `{url, width, height, blurDataUrl}`. Luồng presign + browser-PUT đã XOÁ (khôi phục từ git history nếu Phase 2 Task 6 cần cho audio). Route **bắt buộc content-length hữu hạn** (chặn chunked) và cap 10MB + 1MB margin TRƯỚC khi parse body.
4. UI chọn animation cho từng section (AnimationControl trong EditorPanel + `updateSectionAnimation`; clamp durationMs [100,3000] để không bao giờ làm document mất parse được).
5. Khách tắt JS hết bị kẹt: `inert`/`aria-hidden` chỉ gắn SAU hydration (SSR không mang), lớp phủ bị ẩn bằng noscript CSS `[data-opening-overlay]`.
6. Landing hết tự hạ thấp (guest-name-links + youtube-embed → shipped) — test array đã sửa kèm.
7. PreviewPane đọc `showBadge` từ store slice mới (seed một lần ở EditorLayout; **PublishDialog không được reseed store khi mở lại dialog** — đã có test chốt).
8. `mapUrl` chỉ render qua `isSafeHref` (export mới từ `sanitize.ts`, dùng đúng `SAFE_HREF_RE` cũ — tokenizer không đổi 1 byte); panel cảnh báo link không hợp lệ.

Việc này đồng thời hoàn thành Phase 2 Task 7 (YouTube) và nửa Task 10 (blur thật — còn thiếu tài liệu vận hành worker).

Phase 2 mới **2/10 task**: API khách mời + trang quản lý khách mời với link cá nhân hoá.

## CÒN THIẾU — theo thứ tự ưu tiên đề xuất

(Nhóm A cũ — 8 mục "đã hứa mà chưa giao" — ĐÃ XONG toàn bộ 2026-08-19, xem mục "Đã xong". Các mục hoãn nhỏ + ruling nằm trong ledger của plan đó.)

### Nhóm B — Phase 2 còn 7/10 task

Plan chi tiết đã viết sẵn: `docs/superpowers/plans/2026-08-12-phase-2-guests-forms.md`. Task 1–2 xong. Còn:

- **Task 3** — nhập khách từ CSV/Excel. Quyết định thiết kế đã chốt: **parse hoàn toàn phía client**, không gửi file lên server (bớt một lớp bề mặt tấn công); xem trước rồi mới POST danh sách JSON. `.xlsx` dùng `exceljs` import động.
- **Task 4** — form builder hoàn thiện (sắp xếp field, form ngoài RSVP) + **xuất CSV** (nhớ chống CSV injection: dữ liệu do khách lạ nhập, chủ thiệp mở bằng Excel).
- **Task 5** — dựng `apps/worker` (BullMQ + ffmpeg). Hiện `apps/` chỉ có `web`; không có bullmq/ffmpeg trong bất kỳ package.json nào.
- **Task 6** — upload nhạc riêng đầu-cuối. Hiện chỉ dán được URL. `AssetKind.audio` có trong Prisma nhưng chưa bao giờ được ghi; `StorageAssetKind = "image"` (`storage.ts:20`); uploads route chỉ nhận `z.literal("image")`. **CẢNH BÁO**: `apps/web/src/app/(legal)/bao-mat/__tests__/page.test.tsx` có test khẳng định trang bảo mật KHÔNG nhắc tới việc lưu file nhạc — đúng ở hiện tại. Task 6 làm tính năng đó thành thật thì **phải cập nhật cả trang lẫn test trong cùng commit**, không được xoá test.
- ~~**Task 7** — section YouTube~~ — XONG (nhóm A mục 1, 2026-08-19).
- **Task 8** — TipTap rich text. **Nhạy cảm bảo mật**: `lib/sanitize.ts` là tokenizer một lượt, đã qua hai vòng vá bypass ở Phase 1, là đoạn code được đánh giá tốt nhất nhánh. Chỉ được **mở rộng allowlist** (thêm tên thẻ vào `BARE_TAGS`), **không viết lại**, và phải viết test bypass TRƯỚC khi mở.
- **Task 9** — thêm 2 hiệu ứng mở màn. Bắt buộc dùng `useOpeningTap` (đã có lưới an toàn) và gọi `onOpen` **đồng bộ ngay trong handler chạm** (iOS WebView mới cho phát nhạc).
- **Task 10** — ~~blur ảnh thật~~ (XONG — nhóm A mục 3); còn lại: tài liệu vận hành worker.

### Nhóm C — Phase 3 (chưa bắt đầu, chưa viết plan)

AI xoá nền ảnh (self-host `rembg` trong Docker, quyết định đã chốt là **không dùng API trả phí**), upload font tùy chỉnh (`theme.customFonts` có trong schema nhưng **không ai đọc**), 10 mẫu Premium (hiện `tier: 'basic'` hardcode ở `definitions.ts:108`), album chuyên nghiệp.

### Nhóm D — Phase 4 hardening (chưa bắt đầu)

CSP (hiện `next.config.ts` không có `headers()` nào, dù có 1 điểm `dangerouslySetInnerHTML` và ảnh do người dùng nhập); cấu hình tin cậy `x-forwarded-for` (`lib/client-ip.ts:12` tin entry đầu vô điều kiện → rate-limit vô hiệu nếu deploy không có Cloudflare đứng trước); khoảng cách LCP 2.7s vs mục tiêu 2.5s; backup pg_dump; monitoring; SEO.

### Nhóm E — 58 mục minor đã hoãn

Nằm rải trong 3 ledger, dòng có chữ `minor (deferred)`. Lấy nhanh: `grep -h 'minor (deferred)' .superpowers/sdd/*/progress.md`. Đã được triage: không mục nào chặn merge.

## VIỆC CHỈ CON NGƯỜI LÀM ĐƯỢC (chặn launch)

1. **Google OAuth** — `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` trong `apps/web/.env.local` đang **rỗng**. Toàn bộ luồng sau đăng nhập (editor, dashboard, duyệt lời chúc, xem phản hồi, quản lý khách) chưa từng được bấm thử như người dùng thật. Redirect URI: `http://localhost:3000/api/auth/callback/google`.
2. **File font** — `apps/web/public/fonts/` hiện **chỉ có README.md**. Cần 16 file `.woff2` (8 họ × 400/700, subset tiếng Việt, OFL) **và** 1 file `og-heading.ttf` hoặc `.woff`. Đọc `apps/web/public/fonts/README.md`. Lưu ý: satori (dùng cho ảnh share) **không đọc được WOFF2** — thả mỗi WOFF2 vào thì CSS sửa được nhưng ảnh share vẫn hiện ô trắng thay cho Đ, ặ, ễ, ị.
3. **Nhạc có bản quyền** — thư viện hiện là 3 tiếng bíp sine do ffmpeg sinh ra. `docs/music-credits.md` ghi rõ chúng không được lên production, kèm việc cần làm.
4. **Quét thử QR** bằng app ngân hàng Việt Nam thật: `.superpowers/sdd/2026-08-10-phase-0-1-mvp/task-7-demo-qr.png`. 2 phút, chặn tính năng liên quan tới tiền.
5. **Email liên hệ + rà soát pháp lý** — `apps/web/src/app/(legal)/constants.ts` còn placeholder; hai trang có banner "chưa qua luật sư".
6. **Tạo GitHub repo + push** để CI chạy lần đầu.
7. **Xem thiệp trên điện thoại thật** — tỉ lệ phong bì, cánh hoa rơi, hiệu ứng cuộn: không kiểm được headless.
8. **Mở `/i/demo` với JavaScript TẮT trên Chrome thật** (Cài đặt trang → JavaScript → chặn) — xác nhận thiệp hiện ra, cuộn được, không còn lớp phủ. Bằng chứng hiện tại mới ở mức SSR-bytes + CSS chuẩn (noscript không giả lập headless được). 2 phút.
9. **Upload thử 1 ảnh chụp dọc từ điện thoại thật** qua editor — xác nhận ảnh đứng đúng chiều trong album (autoOrient đã có test orientation-6, nhưng chưa thử ảnh thật từ camera).

## Môi trường (bỏ qua là mất thời gian)

- **Proxy công ty MITM `fonts.gstatic.com`** → `next/font/google` KHÔNG dùng được, sẽ hỏng ngay trên máy này. Font phải self-host.
- Tải binary lỗi chứng chỉ → thêm `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem`. **Tuyệt đối không** `NODE_TLS_REJECT_UNAUTHORIZED=0` hay `curl --insecure` (đã có subagent thử và bị chặn).
- Docker: `docker compose -f docker-compose.dev.yml up -d` → `hpwd-postgres`, `hpwd-redis`, `hpwd-minio` (bind 127.0.0.1).
- **MinIO không hỗ trợ API CORS mức bucket (501)**; local dựa vào `cors_allow_origin=*` mức server. **Từ 2026-08-19 upload ảnh KHÔNG cần CORS nữa** (đi multipart qua server, không còn browser-PUT); `init-bucket.mjs` vẫn set CORS (vô hại, để dành cho upload trực tiếp tương lai — audio Phase 2). Chỉ khi nào quay lại presign/browser-PUT thì R2 mới cần `PutBucketCors`.
- Seed: `pnpm seed:dev`, `pnpm seed:templates`, `pnpm seed:music`. Bucket: `pnpm dev:init`.
- `NEXT_PUBLIC_SITE_URL` được inline lúc **build**, không đọc lúc chạy — deploy self-host phải set trong môi trường build.

## BẤT BIẾN — vi phạm là gây ra blocker (đã xảy ra thật)

1. **Không đọc capability chỉ có ở trình duyệt (`navigator.*`, `window.matchMedia`) trong lúc render** — chỉ trong `useEffect`. Đã gây hydration mismatch 3 lần.
2. **Mọi thao tác editor phải để document còn `InvitationDocumentSchema.parse` được**, nếu không autosave **im lặng ngừng lưu toàn bộ thiệp**.
3. **Route thuộc sở hữu**: 401 chưa đăng nhập, **404 cho cả "không tồn tại" và "không phải của bạn"** qua `findOwnedInvitation`. Không route nào trả 403.
4. **Hiệu ứng mở màn phải gọi `onOpen` đồng bộ trong handler chạm** (iOS WebView) và phải dùng lưới an toàn của `useOpeningTap` (callback animation trượt là khách bị kẹt sau lớp phủ).
5. **`publish` CỐ TÌNH không tham gia kiểm tra `version`** (nó ghi các cột khác). "Publish cũng nên tăng version" là thay đổi nghe hợp lý nhưng sẽ làm autosave hỏng ngay.
6. **An toàn của chuyển hướng 308 phụ thuộc vào việc `/i/[slug]` giữ nguyên render động.** Thêm cache vào route đó sẽ âm thầm tái tạo bẫy "trình duyệt nhớ chuyển hướng cũ". Không có gì trong code ghi lại điều này ngoài ledger.
7. **Không bao giờ có watermark.** Badge footer tắt được qua `settings.showBadge`.
8. **Chỉ output của `parseYoutubeId` được vào markup nhúng video**; `mapUrl` chỉ render qua `isSafeHref`. `sanitize.ts` chỉ được MỞ RỘNG allowlist, không bao giờ viết lại tokenizer.
9. **`/api/uploads` bắt buộc content-length hữu hạn + dương** trước khi parse body (chặn chunked đẩy RAM); mọi ảnh được sharp re-encode WebP với `autoOrient: true` — bỏ autoOrient là ảnh điện thoại chụp dọc xoay ngang trở lại.
10. **Store slice `showBadge` seed đúng MỘT lần ở EditorLayout, không set `dirty`, và PublishDialog không được reseed khi mở lại dialog** (reseed = preview hiện ngược với server sau toggle→lưu→mở lại; đã có test chốt).
11. **Gate mở màn: `inert`/`aria-hidden` chỉ gắn sau hydration** — SSR mang sẵn `inert` là nhốt vĩnh viễn khách tắt JS (noscript CSS không gỡ được attribute).

## Cách làm việc (đã dùng cho cả 70 commit, nên giữ)

Dùng skill `superpowers:subagent-driven-development`: một subagent implement mỗi task → sinh review package bằng `scripts/review-package PLAN BASE HEAD` → một subagent review độc lập (spec + chất lượng) → vòng sửa → re-review có phạm vi → ghi ledger → task tiếp.

**Bài học đắt nhất, lặp lại 4 lần liên tiếp:** phần tự đánh giá của implementer xét đúng một chiều của cuộc đua và bỏ sót chiều kia — luôn là chiều mà thành phần họ đang viết bị thua. Hãy yêu cầu tường minh trong brief: *"với mỗi tương tác, ghi rõ CẢ HAI chiều"*.

**Bài học thứ hai:** test xanh không chứng minh gì. Dự án này đã nhiều lần có test xanh trong khi code sai (nhánh guard không bao giờ chạy được, test mock hết phần cần kiểm, assertion đặt sai thời điểm). Với mỗi test là bằng chứng chính cho một yêu cầu, **gỡ hành vi ra, xem test đỏ, rồi khôi phục** — và dán output. Reviewer tốt nhất trong dự án này đã tự clone repo, tạo database tạm từ template, và đột biến từng dòng để kiểm chứng.

**Bài học thứ ba:** dùng model nhanh (haiku) chỉ cho task thuần cơ học. Một lần nó báo "không có vấn đề gì" trong khi ship một lỗi thật và hai test rỗng.
