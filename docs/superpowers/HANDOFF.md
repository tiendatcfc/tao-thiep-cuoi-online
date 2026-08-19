# HPWD — Bản giao việc (cập nhật 2026-08-13)

Website tạo thiệp cưới online miễn phí, tiếng Việt. Đọc file này trước khi làm gì.

## Trạng thái hiện tại

- Nhánh: `feat/phase-0-1-mvp`, HEAD `14ed5cc`, cây làm việc sạch, **70 commit**, chưa merge vào `main` (main chỉ có docs).
- Test: **674 (web) + 10 (db) + 7 (schema)** đều xanh; lint + `tsc --noEmit` + `next build` sạch. Kiểm bằng `pnpm exec turbo test --force`.
- **Chưa có git remote** → workflow CI (`.github/workflows/ci.yml`) chưa bao giờ chạy thật.

## Tài liệu nguồn (đọc theo thứ tự này)

1. Spec: `docs/superpowers/specs/2026-08-10-wedding-invitation-builder-design.md` — mục 2 là bảng 17 tính năng, mục 7 là lộ trình 5 phase.
2. Plan đã viết: `docs/superpowers/plans/` (Phase 0+1, Phase 2, Hardening).
3. **Ledger — quan trọng nhất**: `.superpowers/sdd/*/progress.md` (gitignored). Ghi mọi quyết định, mọi mục đã hoãn, mọi HUMAN TODO, và lý do.
4. **Đừng tin checklist trong plan** — Phase 1 còn nguyên 0/73 ô chưa tick dù code đã xong. Ledger là nguồn sự thật; code là nguồn sự thật cuối cùng.

## Đã xong

Phase 0 (nền móng), Phase 1 (MVP, 19 task + review toàn nhánh + đợt sửa 5 blocker), và một đợt hardening chống mất dữ liệu phát sinh ngoài lộ trình (cột `version` chống hai tab ghi đè; lịch sử slug + chuyển hướng 308 chống link chết và chống chiếm slug).

Phase 2 mới **2/10 task**: API khách mời + trang quản lý khách mời với link cá nhân hoá.

## CÒN THIẾU — theo thứ tự ưu tiên đề xuất

### Nhóm A — "đã hứa mà chưa giao" (nên làm trước Phase 2)

Đây là các chỗ editor lưu dữ liệu nhưng khách mời không bao giờ thấy. Cặp đôi sẽ tưởng mình đã làm được gì đó.

1. **Section video YouTube render `null`.** `apps/web/src/components/invite/sections/VideoSection.tsx:5` trả `null`. Panel editor (`VideoPanel.tsx`) lưu `youtubeId` + `caption` bình thường, schema có sẵn (`packages/schema/src/invitation.ts:126-132`), section có trong document mặc định. Cần render bằng `lite-youtube-embed` (facade, không tải iframe tới khi bấm play) và **chỉ nhận ID đã qua hàm parse**, không nội suy thẳng props vào URL nhúng.
2. **Album masonry/carousel chọn được nhưng không render.** `AlbumSection.tsx:44` hardcode `grid-cols-2`, không bao giờ đọc `section.props.layout` — trong khi `AlbumPanel.tsx:12-16` cho chọn cả 3 layout và lưu vào tài liệu.
3. **`processImage` là code chết.** `apps/web/src/lib/image.ts:34` (sharp → WebP 400/800/1600 + blur thật) đã viết và test đầy đủ nhưng không ai gọi. `ImageField.tsx:113-130` PUT ảnh gốc thẳng lên storage. Blur placeholder là `TRANSPARENT_PIXEL_DATA_URL` — một pixel trong suốt hardcode (`AlbumPanel.tsx:73`), tức ô trống chứ không phải hiệu ứng mờ.
4. **Không có UI chọn animation cho từng section.** `AnimatedSection` hỗ trợ `fade`/`slide-up`/`zoom`/`none` và có test, nhưng không panel nào expose `animation.preset`/`durationMs` → mọi section khoá cứng ở `fade`/600ms; `slide-up` và `zoom` người dùng không bao giờ với tới được.
5. **Khách tắt JavaScript bị kẹt vĩnh viễn.** `app/i/layout.tsx:13` có `<noscript>` cứu các section animation, nhưng **không cứu lớp phủ mở màn**: nút chạm bất động, thiệp nằm dưới `aria-hidden` + `inert`. Lỗi thật.
6. **Landing page nói sai một dòng, theo hướng tự hạ thấp.** `LandingPage.tsx:103-108` gắn nhãn "Sắp có" cho `guest-name-links` trong khi tính năng đó đã xong hoàn toàn — và `LandingPage.test.tsx:63-77` đang khoá giá trị sai đó, nên một test viết ra để chống quảng cáo sai lại đang bảo vệ thông tin sai. Sửa cả hai.
7. **Editor preview hardcode `showBadge: true`** (`PreviewPane.tsx:85`) → cặp đôi đã tắt badge vẫn thấy nó trong preview của chính mình.
8. **`mapUrl` vào `href` không kiểm tra scheme.** `packages/schema/src/invitation.ts:95` là `z.string()` trần, `EventsSection.tsx:36-45` render thẳng vào `href`. Hiện chưa khai thác được vì React 19 có bộ lọc `javascript:` (đã kiểm chứng trong `node_modules`), nhưng nó sống nhờ chi tiết nội bộ của React. Thêm allowlist scheme như `sanitize.ts` đang làm.

### Nhóm B — Phase 2 còn 8/10 task

Plan chi tiết đã viết sẵn: `docs/superpowers/plans/2026-08-12-phase-2-guests-forms.md`. Task 1–2 xong. Còn:

- **Task 3** — nhập khách từ CSV/Excel. Quyết định thiết kế đã chốt: **parse hoàn toàn phía client**, không gửi file lên server (bớt một lớp bề mặt tấn công); xem trước rồi mới POST danh sách JSON. `.xlsx` dùng `exceljs` import động.
- **Task 4** — form builder hoàn thiện (sắp xếp field, form ngoài RSVP) + **xuất CSV** (nhớ chống CSV injection: dữ liệu do khách lạ nhập, chủ thiệp mở bằng Excel).
- **Task 5** — dựng `apps/worker` (BullMQ + ffmpeg). Hiện `apps/` chỉ có `web`; không có bullmq/ffmpeg trong bất kỳ package.json nào.
- **Task 6** — upload nhạc riêng đầu-cuối. Hiện chỉ dán được URL. `AssetKind.audio` có trong Prisma nhưng chưa bao giờ được ghi; `StorageAssetKind = "image"` (`storage.ts:20`); uploads route chỉ nhận `z.literal("image")`. **CẢNH BÁO**: `apps/web/src/app/(legal)/bao-mat/__tests__/page.test.tsx` có test khẳng định trang bảo mật KHÔNG nhắc tới việc lưu file nhạc — đúng ở hiện tại. Task 6 làm tính năng đó thành thật thì **phải cập nhật cả trang lẫn test trong cùng commit**, không được xoá test.
- **Task 7** — section YouTube (trùng nhóm A mục 1, làm một lần).
- **Task 8** — TipTap rich text. **Nhạy cảm bảo mật**: `lib/sanitize.ts` là tokenizer một lượt, đã qua hai vòng vá bypass ở Phase 1, là đoạn code được đánh giá tốt nhất nhánh. Chỉ được **mở rộng allowlist** (thêm tên thẻ vào `BARE_TAGS`), **không viết lại**, và phải viết test bypass TRƯỚC khi mở.
- **Task 9** — thêm 2 hiệu ứng mở màn. Bắt buộc dùng `useOpeningTap` (đã có lưới an toàn) và gọi `onOpen` **đồng bộ ngay trong handler chạm** (iOS WebView mới cho phát nhạc).
- **Task 10** — blur ảnh thật (trùng nhóm A mục 3) + tài liệu vận hành worker.

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

## Môi trường (bỏ qua là mất thời gian)

- **Proxy công ty MITM `fonts.gstatic.com`** → `next/font/google` KHÔNG dùng được, sẽ hỏng ngay trên máy này. Font phải self-host.
- Tải binary lỗi chứng chỉ → thêm `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem`. **Tuyệt đối không** `NODE_TLS_REJECT_UNAUTHORIZED=0` hay `curl --insecure` (đã có subagent thử và bị chặn).
- Docker: `docker compose -f docker-compose.dev.yml up -d` → `hpwd-postgres`, `hpwd-redis`, `hpwd-minio` (bind 127.0.0.1).
- **MinIO không hỗ trợ API CORS mức bucket (501)**; local dựa vào `cors_allow_origin=*` mức server. Production R2 **phải** được `PutBucketCors` — `init-bucket.mjs` sẽ fail loud ở đó.
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

## Cách làm việc (đã dùng cho cả 70 commit, nên giữ)

Dùng skill `superpowers:subagent-driven-development`: một subagent implement mỗi task → sinh review package bằng `scripts/review-package PLAN BASE HEAD` → một subagent review độc lập (spec + chất lượng) → vòng sửa → re-review có phạm vi → ghi ledger → task tiếp.

**Bài học đắt nhất, lặp lại 4 lần liên tiếp:** phần tự đánh giá của implementer xét đúng một chiều của cuộc đua và bỏ sót chiều kia — luôn là chiều mà thành phần họ đang viết bị thua. Hãy yêu cầu tường minh trong brief: *"với mỗi tương tác, ghi rõ CẢ HAI chiều"*.

**Bài học thứ hai:** test xanh không chứng minh gì. Dự án này đã nhiều lần có test xanh trong khi code sai (nhánh guard không bao giờ chạy được, test mock hết phần cần kiểm, assertion đặt sai thời điểm). Với mỗi test là bằng chứng chính cho một yêu cầu, **gỡ hành vi ra, xem test đỏ, rồi khôi phục** — và dán output. Reviewer tốt nhất trong dự án này đã tự clone repo, tạo database tạm từ template, và đột biến từng dòng để kiểm chứng.

**Bài học thứ ba:** dùng model nhanh (haiku) chỉ cho task thuần cơ học. Một lần nó báo "không có vấn đề gì" trong khi ship một lỗi thật và hai test rỗng.
