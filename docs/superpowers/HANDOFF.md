# HPWD — Bản giao việc (cập nhật 2026-09-18, sau Phase 4)

Website tạo thiệp cưới online miễn phí, tiếng Việt. Đọc file này trước khi làm gì.

## Trạng thái hiện tại

- Nhánh: `feat/phase-2-guest-import`, cây làm việc sạch, chưa merge vào `main` (main chỉ có docs).
- Test: **1256 xanh** — web 1173, worker 27, db 44, schema 12 — cộng 11 test Python của `services/rembg`. `tsc --noEmit` sạch cho web và worker; `turbo lint` chạy 2/4 package (db và schema vẫn chưa có lint). Kiểm bằng `pnpm exec turbo test lint --force`.
- `next build` sạch. **Đừng build đè lên dev server đang chạy** — cả hai dùng chung `apps/web/.next`. Dùng `HPWD_DIST_DIR=.next/prod-check pnpm build` rồi `next start -p 3100` với cùng biến đó.
- **Chưa có git remote** → workflow CI (`.github/workflows/ci.yml`) chưa bao giờ chạy thật, kể cả job `images` mới thêm. Đây là việc chặn nhiều thứ nhất.

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

Việc này đồng thời hoàn thành Phase 2 Task 7 (YouTube) và phần blur thật của Task 10.

**Phase 2 XONG toàn bộ 10/10 task (2026-09-17)** và **Phase 3 XONG toàn bộ 4/4 (2026-09-18)**.

Phase 2: Khách mời + nhập CSV/Excel, form builder + xuất CSV, `apps/worker` (BullMQ + ffmpeg), upload nhạc riêng đầu-cuối, section YouTube, rich text TipTap, hai hiệu ứng mở màn mới, và `docs/operations.md`.

## CÒN THIẾU — theo thứ tự ưu tiên đề xuất

(Nhóm A cũ — 8 mục "đã hứa mà chưa giao" — ĐÃ XONG toàn bộ 2026-08-19, xem mục "Đã xong". Các mục hoãn nhỏ + ruling nằm trong ledger của plan đó.)

### ~~Nhóm B — Phase 2~~ — XONG 10/10 (2026-09-17)

Plan: `docs/superpowers/plans/2026-08-12-phase-2-guests-forms.md`. Ledger: `.superpowers/sdd/2026-08-12-phase-2-guests-forms/progress.md`.

Ba task cuối, và những bất biến mới mà bất kỳ ai sửa vùng này phải biết:

- ~~**Task 8** — TipTap rich text~~. `BARE_TAGS` nay có thêm `s h2 h3 ul ol li blockquote`; **tokenizer không đổi một byte**, test bypass viết trước ở file riêng `sanitize.richtext.test.ts` nên 38 ca cũ không phải sửa.
  - **Bất biến mới:** TipTap phải phát `<a href="…">` trần. `BareLink` (`components/editor/rich-text.ts`) gỡ mọi thuộc tính trừ `href`; `target`/`rel` chỉ có **một** chủ sở hữu là `sanitizeHtml`. Bản gốc của TipTap render `target`/`rel` TRƯỚC `href` → sanitizer escape cả thẻ, và thiệt hại đến muộn: link lưu lần đầu vẫn tốt, chết ở lần sửa kế tiếp sau khi tải lại trang.
  - **Bẫy đã mắc:** `filterTransaction` chỉ có tác dụng trên **plugin spec** của ProseMirror. Truyền qua `editorProps` vẫn hợp lệ kiểu, chạy không cảnh báo, và **không bao giờ được gọi** — giới hạn 10.000 ký tự đã không hề tồn tại cho tới khi một test component thử vượt thật.
  - `EditorPanel` render panel **không có key** → `TextPanel` tự đặt `key={section.id}` cho editor, nếu không chuyển giữa hai section văn bản sẽ hiện nội dung của section cũ.
- ~~**Task 9** — hai hiệu ứng mở màn~~: `reveal` (700ms) và `petals` (750ms). Cả hai đi qua `useOpeningTap`.
  - `OpeningGate` nay là **bảng ánh xạ toàn phần** `Record<Exclude<Opening["effect"], "none">, …>` — thêm giá trị vào enum schema mà quên component là **lỗi biên dịch**, không còn là overlay vô hình đè lên thiệp `inert`.
  - Vị trí cánh hoa là **bảng cố định**, không `Math.random()` — random lúc render là hydration mismatch, sinh trong effect thì khung hình đầu tiên trống.
  - Nhãn `petals` là "**Mưa cánh hoa**", cố ý khác "Cánh hoa" của ô chọn *particles* — hai thiết lập độc lập.
- ~~**Task 10**~~: `docs/operations.md` (chạy worker, biến môi trường, runbook "nhạc kẹt Đang xử lý"). Blur thật đã xong từ nhóm A. Ảnh nay ghi `status: "ready"` thay vì để mặc định `pending` mãi mãi.

### ~~Nhóm C — Phase 3~~ — XONG 4/4 (2026-09-18)

Plan: `docs/superpowers/plans/2026-09-18-phase-3-nang-cao.md`. Ledger: `.superpowers/sdd/2026-09-18-phase-3-nang-cao/progress.md`.

- ~~**Font riêng**~~: `POST /api/uploads/font` (fontkit validate, wawoff2 → WOFF2, cảnh báo glyph tiếng Việt), `DELETE /api/fonts/[assetId]`, `CustomFontStyle` sinh `@font-face`. `theme.customFonts` cuối cùng đã có người đọc, và thêm `assetId` (có default).
  - **Bất biến mới:** tên font đọc từ metadata trong file người lạ tải lên rồi vào thẳng CSS. `sanitizeFontFamily`/`sanitizeFontSrcUrl` là **allowlist**, và chạy **lại lần nữa lúc render** vì document ghi đè được qua PATCH.
  - **Bẫy:** `SSL_CERT_FILE` **thay thế** kho tin cậy chứ không bổ sung.
- ~~**Album nâng cao**~~: `AlbumImageSchema.caption` (default `''`, max 200) + layout `hero`. Chú thích qua `sanitizePlainText`, hiện cả dưới ảnh lẫn trong lightbox.
  - **Bẫy đã sửa:** `AlbumPanel.onUploaded` dựng object ảnh mới → đổi ảnh là mất chú thích.
- ~~**10 mẫu Premium**~~: `templates/premium.ts`, helper chung ở `templates/builders.ts`. Gallery `/mau-thiep?tier=premium` giờ hiện thật.
  - **Bẫy:** có **hai** chỗ hardcode "chưa có mẫu Premium" (page short-circuit truy vấn, và `TemplateGallery` render dòng "sắp ra mắt"). Truy vấn nay ở `lib/templates.ts`, có test trên DB thật.
  - **Không đổi id/slug của 5 mẫu cũ** — `seed-templates.ts` upsert theo id, thumbnail suy từ slug. Có test chốt nguyên văn.
- ~~**Xoá nền AI**~~: `services/rembg` (FastAPI + rembg `isnet-general-use`, CPU) + queue `background-removal` + `POST /api/images/background-removal` + nút "Xoá nền" trong `ImageField`.
  - **Bất biến:** service **chỉ nhận bytes, không bao giờ nhận URL** (nhận URL = SSRF). Không khoá, không DB, không kho lưu trữ.
  - Kết quả là **asset MỚI**, không ghi đè ảnh gốc.
  - Route nhận **URL** chứ không phải assetId — document chỉ lưu URL.
  - Ở máy dev chạy bằng **venv** (`services/rembg/.venv`, gitignore), không kéo image Docker. Xem `services/rembg/README.md`.

### ~~Nhóm D — Phase 4 hardening~~ — XONG 8/8 (2026-09-18)

Plan: `docs/superpowers/plans/2026-09-18-phase-4-hardening-launch.md`. Ledger: `.superpowers/sdd/2026-09-18-phase-4-hardening-launch/progress.md`.

- ~~**CSP**~~: phát từ `middleware.ts` với nonce mỗi request (KHÔNG phải `headers()` trong next.config — Next đóng băng nó vào build, mà policy phải nhắc origin `R2_PUBLIC_URL`). `CSP_REPORT_ONLY=true` là cửa thoát cho lần deploy đầu.
  - **Bất biến mới:** root layout là `force-dynamic`. Trang prerender phục vụ script inline **không có nonce** trong khi response mang nonce mới → `'strict-dynamic'` chặn sạch. Đo thật trên bản production trước khi sửa: `/bao-mat` có **11 script inline không nonce**. Chỉ lộ ở `next build` + `next start`, không bao giờ lộ ở dev.
  - **Bẫy:** Next lấy nonce từ header **của REQUEST**, không phải thứ middleware trả về.
  - **Bẫy chết người:** `handleAuth` của next-auth dùng chuỗi `else if` — truyền wrapper làm nhánh chuyển hướng đăng nhập **không bao giờ chạy**. Bọc `middleware.ts` theo cách hiển nhiên sẽ mở toang `/dashboard` và `/editor`, không lỗi, không sai kiểu, không test đỏ. Cả hai nửa nay đọc chung `isProtectedPath`.
  - `style-src` cố ý giữ `'unsafe-inline'` (framer-motion ghi `style=""`, nonce không phủ được thuộc tính).
- ~~**`x-forwarded-for`**~~: đếm từ **phải sang** theo `TRUSTED_PROXY_HOPS` (mặc định 1), hoặc `CLIENT_IP_HEADER=cf-connecting-ip`. Mã cũ đọc entry ĐẦU — thứ khách tự ghi — nên rate-limit **không hề tồn tại**. Bằng chứng trước/sau nằm trong ledger.
- ~~**SEO**~~: `robots.ts`, `sitemap.ts`, canonical, JSON-LD. **`/i/[slug]` nay `noindex`** (tên khách, địa chỉ, số điện thoại, số tài khoản). `robots.txt` **cố ý không chặn `/i/`** — crawler bị chặn sẽ không đọc được `noindex`.
- ~~**Backup**~~: `pnpm backup:db` / `pnpm restore:db`, giữ 14 bản. **PHẢI dùng bucket riêng** — bucket media cho phép ẩn danh đọc **mọi key**, script từ chối chạy nếu trùng. Đã restore thử thành công, 10/10 bảng khớp.
- ~~**Giám sát**~~: `GET /api/health` (DB + Redis + storage + nhịp tim worker), `?strict=1` tính cả worker.
  - **Lỗi production tìm được nhờ nó:** mọi client Redis trả `null` trong `retryStrategy` → ioredis **ngừng kết nối lại vĩnh viễn**. Sau bất kỳ lần Redis restart nào, `rateLimit` fail open trên mọi request đến hết đời tiến trình. Đo: Redis sống lại, app vẫn `"redis":"fail"` sau 70 giây. Nay hồi phục trong 5 giây.
- ~~**LCP**~~: 1477 → ~710 ms (thiệp không ảnh bìa). Nguyên nhân: framer-motion ghi `opacity:0` vào HTML server-render nên thiệp trắng tới khi hydrate xong. `fetchPriority` và `preload` **đã thử và bỏ** vì đo không cải thiện — nghẽn thật là HTML 124 kB.
- ~~**Image + compose**~~: `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `docker-compose.prod.yml`, `deploy/Caddyfile`. **CHƯA build được ở đâu** — xem HUMAN TODO 10.
- ~~**Rate-limit**~~: 5 route tốn CPU nay có giới hạn **theo user** (ảnh 500/giờ, nhạc 10, font 10, tạo thiệp 30, xoá nền 100). Load test `/i/demo`: bão hoà ~58 req/s, **0 lỗi** tới 100 đồng thời.

### Nhóm E — 58 mục minor đã hoãn

Nằm rải trong 3 ledger, dòng có chữ `minor (deferred)`. Lấy nhanh: `grep -h 'minor (deferred)' .superpowers/sdd/*/progress.md`. Đã được triage: không mục nào chặn merge.

## VIỆC CHỈ CON NGƯỜI LÀM ĐƯỢC (chặn launch) — còn 12

1. ~~**Google OAuth**~~ — **XONG 2026-09-18.** `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` đã có trong `apps/web/.env` (và `.env.local`), chủ dự án đã đăng nhập thật: có `User` "Tiến Đạt Nguyễn" (@gmail.com) + `Account` provider `google` + ảnh đại diện, và đã tạo được thiệp. Luồng sau đăng nhập không còn là vùng chưa ai bấm.
   - **Còn cho production:** đặt `AUTH_TRUST_HOST=true` (hoặc `AUTH_URL`) — thiếu là đăng nhập Google **hỏng hoàn toàn** khi tự host sau reverse proxy; đặt `NEXT_PUBLIC_SITE_URL` lúc **build**; thêm redirect URI của tên miền thật vào Google Cloud Console.
   - **Bẫy cấu hình:** `apps/web/.env` và `apps/web/.env.local` đang **trùng nhau từng byte**. Next cho `.env.local` thắng, nên sửa `.env` sẽ không có tác dụng. Nên giữ một file.
2. **File font** — `apps/web/public/fonts/` hiện **chỉ có README.md**. Cần 16 file `.woff2` (8 họ × 400/700, subset tiếng Việt, OFL) **và** 1 file `og-heading.ttf` hoặc `.woff`. Đọc `apps/web/public/fonts/README.md`. Lưu ý: satori (dùng cho ảnh share) **không đọc được WOFF2** — thả mỗi WOFF2 vào thì CSS sửa được nhưng ảnh share vẫn hiện ô trắng thay cho Đ, ặ, ễ, ị.
3. **Nhạc có bản quyền** — thư viện hiện là 3 tiếng bíp sine do ffmpeg sinh ra. `docs/music-credits.md` ghi rõ chúng không được lên production, kèm việc cần làm.
4. **Quét thử QR** bằng app ngân hàng Việt Nam thật: `.superpowers/sdd/2026-08-10-phase-0-1-mvp/task-7-demo-qr.png`. 2 phút, chặn tính năng liên quan tới tiền.
5. **Email liên hệ + rà soát pháp lý** — `apps/web/src/app/(legal)/constants.ts` còn placeholder; hai trang có banner "chưa qua luật sư".
6. **Tạo GitHub repo + push** để CI chạy lần đầu.
7. **Xem thiệp trên điện thoại thật** — tỉ lệ phong bì, cánh hoa rơi, hiệu ứng cuộn: không kiểm được headless.
8. **Mở `/i/demo` với JavaScript TẮT trên Chrome thật** (Cài đặt trang → JavaScript → chặn) — xác nhận thiệp hiện ra, cuộn được, không còn lớp phủ. Bằng chứng hiện tại mới ở mức SSR-bytes + CSS chuẩn (noscript không giả lập headless được). 2 phút.
9. **Upload thử 1 ảnh chụp dọc từ điện thoại thật** qua editor — xác nhận ảnh đứng đúng chiều trong album (autoOrient đã có test orientation-6, nhưng chưa thử ảnh thật từ camera).
10. **Build 3 image Docker** — chưa từng thành công ở đâu. Trên máy này hỏng vì proxy TLS chặn `binaries.prisma.sh` (đã có cửa `--secret id=corp_ca`) và vì ổ chỉ còn ~10 GB, một lần thử làm **Docker Desktop sập**. Job `images` trong CI làm được việc này — nhưng cần mục 6 (tạo repo + push) trước.
11. **Tạo bucket backup riêng** (KHÔNG gắn policy công khai), đặt `BACKUP_BUCKET`, chạy `pnpm backup:db` và **diễn tập restore** theo `docs/operations.md` mục 5c. Backup chưa từng restore thì không phải backup.
12. **Cắm uptime monitor** vào `/api/health?strict=1` (60 giây/lần, báo động sau 2 lần hỏng liên tiếp) và **quyết định về theo dõi lỗi** (Sentry hay tự host) — đây sẽ là dịch vụ bên thứ ba đầu tiên nhận dữ liệu người dùng, nên là quyết định của chủ dự án.

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
