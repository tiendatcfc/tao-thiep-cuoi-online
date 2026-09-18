# HPWD Phase 4 — Hardening & launch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa sản phẩm từ "chạy được trên máy dev" sang "dám cho người lạ dùng": CSP, xác định IP khách đúng, SEO, backup có đường khôi phục, giám sát, đóng khoảng cách LCP, image + compose production, và rà soát lại rate-limit/moderation bằng tải thật.

**Spec:** `docs/superpowers/specs/2026-08-10-wedding-invitation-builder-design.md` — mục 6 (yêu cầu phi chức năng) và mục 7 hàng "Phase 4 — Hardening & launch".
**Nền:** `docs/superpowers/HANDOFF.md` mục "Nhóm D". Phase 2 xong 10/10, Phase 3 xong 4/4.

## Global Constraints

Kế thừa nguyên văn từ Phase 2 và 3:

- Mọi copy hiển thị bằng **tiếng Việt**. TypeScript `strict`. Node ≥ 22, pnpm ≥ 9.
- **Bất biến B1:** mọi hành động trong editor phải để `InvitationDocumentSchema.parse` còn chạy được.
- Route thuộc sở hữu: 401 chưa đăng nhập, **404 cho cả "không tồn tại" lẫn "không phải của bạn"**. Không route nào trả 403.
- **Không tắt xác thực TLS.** `NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem` (Node), `REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE` ghép với certifi (Python).
- `lib/sanitize.ts` chỉ được MỞ RỘNG allowlist. Không viết lại tokenizer.
- Không đọc capability chỉ có ở trình duyệt trong lúc render.
- Test phải có sức bắt lỗi: **gỡ hành vi ra → đỏ → khôi phục → xanh**, dán bằng chứng vào báo cáo.
- Commit tiếng Anh, conventional commits.

**Ràng buộc riêng của Phase 4:**

- **Dev server của chủ dự án chạy ở cổng 3000 và dùng chung `apps/web/.next`.** Không `next build` đè lên nó (đã làm hỏng 2 lần). Muốn build thì `HPWD_DIST_DIR` hoặc xin tạm dừng.
- **Chưa có git remote, chưa có tên miền, chưa có máy chủ.** Mọi mục cần hạ tầng thật (CI deploy, uptime monitor, chứng chỉ) chỉ giao **artifact + tài liệu**, phần bấm nút ghi vào HUMAN TODO. Không giả vờ đã xong.
- **16 file font `.woff2` vẫn thiếu.** Đo LCP phải ghi rõ điều này: con số đo được là LCP khi font fallback, không phải LCP thật khi launch.
- Ổ đĩa máy dev từng đầy 100%. Image Docker của web/worker **viết nhưng không build** trên máy này trừ khi còn > 10 GB trống.

---

## Cấu trúc file

```
apps/web/src/
  middleware.ts                      MODIFY — CSP + nonce + security headers,
                                     vẫn uỷ quyền auth cho các path cũ
  lib/csp.ts                         MỚI — dựng chuỗi CSP, thuần hàm, có test
  lib/client-ip.ts                   MODIFY — tin proxy theo cấu hình, không
                                     còn tin entry đầu vô điều kiện
  lib/env-warnings.ts                MỚI — cảnh báo cấu hình sai lúc khởi động
  app/robots.ts                      MỚI
  app/sitemap.ts                     MỚI
  app/api/health/route.ts            MỚI — DB + Redis + storage + worker
  app/i/[slug]/page.tsx              MODIFY — noindex (xem Task 3)
  app/page.tsx                       MODIFY — JSON-LD + metadata đầy đủ

apps/web/next.config.ts              MODIFY — output standalone (Task 7)

packages/db/scripts/
  backup.ts                          MỚI — pg_dump → R2, giữ 14 bản
  restore.ts                         MỚI — đường về, có tài liệu

apps/worker/src/
  index.ts                           MODIFY — heartbeat vào Redis
  Dockerfile                         MỚI (docs/operations.md đang tả một image
                                     chưa hề tồn tại)

apps/web/Dockerfile                  MỚI
docker-compose.prod.yml              MỚI
.github/workflows/ci.yml             MODIFY — build image, bước deploy có cờ

docs/operations.md                   MODIFY — backup/restore, giám sát, CSP
docs/superpowers/HANDOFF.md          MODIFY — trạng thái Phase 4
```

---

## Task 1 — CSP + security headers

**Vì sao trước tiên:** mọi task sau đều thêm thứ vào trang (JSON-LD, ảnh preload, health check). Đặt hàng rào trước rồi mới thêm đồ vào trong, ngược lại sẽ phải đo lại từ đầu.

**Quyết định kiến trúc — CSP phát từ `middleware.ts`, KHÔNG phải `headers()` trong `next.config.ts`:**
`headers()` được Next đóng băng vào `routes-manifest.json` **lúc build**. CSP phải nhắc tên host của kho ảnh (`R2_PUBLIC_URL`), nên nếu phát từ config thì một lần deploy đổi host lưu trữ sẽ âm thầm sinh ra CSP tự chặn ảnh của chính mình, và không có gì cảnh báo. Middleware đọc `process.env` mỗi request.

- [ ] **Step 1:** `lib/csp.ts` — hàm thuần `buildCsp({ nonce, storageOrigin, reportOnly })` trả chuỗi. Test trước: nonce vào đúng `script-src`; origin kho ảnh vào `img-src`/`media-src`/`font-src`; `R2_PUBLIC_URL` rác (không parse được URL) **không** làm sập, chỉ bị bỏ qua.
- [ ] **Step 2:** Directive chốt, kèm lý do từng cái:
  - `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`
  - `script-src 'self' 'nonce-…' 'strict-dynamic'` — chỉ khi kiểm chứng được Next gắn nonce vào script inline của nó. Nếu không, hạ xuống `'self'` + hash và **ghi rõ** trong ledger là đã hạ.
  - `style-src 'self' 'unsafe-inline'` — **cố ý nới.** framer-motion ghi `style=""` lên từng node nó animate; nonce không phủ được thuộc tính style, và `style-src-attr` thì Safari chưa theo kịp. Giá trị an ninh của style-src nhỏ hơn script-src nhiều lần; nói thật trong comment thay vì giả vờ chặt.
  - `img-src 'self' data: blob: <storage>`, `media-src 'self' <storage>`, `font-src 'self' <storage>`
  - `frame-src https://www.youtube-nocookie.com https://www.youtube.com` — `lite-youtube-embed` chỉ chèn iframe sau khi khách bấm play.
  - `connect-src 'self'`, `form-action 'self'`, `frame-ancestors 'none'` (editor preview render `InvitePage` **trong cùng cây React, không iframe** — đã kiểm; không có gì để vỡ).
  - `upgrade-insecure-requests` chỉ khi origin là https.
- [ ] **Step 3:** Header khác: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`, HSTS **chỉ khi** request là https.
- [ ] **Step 4:** `middleware.ts` phải giữ nguyên hành vi auth cũ. Matcher mở rộng ra toàn site để phát header, nhưng `authConfig` chỉ được bảo vệ đúng `/dashboard`, `/editor` như trước. **Test chốt:** khách chưa đăng nhập vẫn mở được `/i/[slug]` và `/` sau khi đổi matcher — đây là chỗ dễ vô tình bắt cả site đăng nhập nhất.
- [ ] **Step 5:** `CSP_REPORT_ONLY=true` đổi sang `Content-Security-Policy-Report-Only`. Cửa thoát cho lần deploy đầu.
- [ ] **Step 6:** **Kiểm chứng bằng trình duyệt thật**, không phải bằng test: mở `/`, `/i/demo`, `/editor/[id]` bằng Chrome, đọc console, **0 vi phạm CSP**. Thử cả khi có section video và font riêng. Dán log.
- [ ] **Step 7:** Commit: `feat(security): content security policy and hardening headers`

## Task 2 — Tin `x-forwarded-for` theo cấu hình

**Lỗi hiện tại (`lib/client-ip.ts:12`):** lấy entry **đầu tiên** của `x-forwarded-for`. Entry đầu là thứ client tự ghi được. Ai cũng gửi được `X-Forwarded-For: <ip ngẫu nhiên>` và mỗi request rơi vào một bucket khác nhau → **rate-limit biến mất hoàn toàn**, mà mọi test vẫn xanh vì test cũng gửi header đó.

- [ ] **Step 1:** Test đỏ trước: header giả `x-forwarded-for: 1.2.3.4` từ client trực tiếp phải **không** được tin.
- [ ] **Step 2:** Lấy từ **phải sang** theo `TRUSTED_PROXY_HOPS` (mặc định `1`): entry thứ N từ cuối là do proxy gần nhất mà ta sở hữu ghi, client không chèn vào đó được. `CLIENT_IP_HEADER` (vd `cf-connecting-ip`) ưu tiên cao nhất khi được đặt — Cloudflare ghi đè header này, khách không giả được.
- [ ] **Step 3:** Cấu hình rác (`TRUSTED_PROXY_HOPS=abc`, số âm, lớn hơn số entry) phải suy biến về phía **an toàn**, kèm log. Không bao giờ ném lỗi: rate-limit hỏng không được phép làm chết request của khách.
- [ ] **Step 4:** `.env.example` + `docs/operations.md`: bảng 3 topology (chạy trần / sau 1 reverse proxy / sau Cloudflare + proxy) và giá trị đúng cho từng cái.
- [ ] **Step 5:** Commit: `fix(security): stop trusting a client-controlled x-forwarded-for`

## Task 3 — SEO

**Quyết định cần chủ dự án biết:** `/i/[slug]` sẽ **`noindex`** theo mặc định. Trang thiệp chứa tên khách (qua `?g=`), địa chỉ nhà, số điện thoại và **số tài khoản ngân hàng**. Không cặp đôi nào yêu cầu được Google đánh chỉ mục những thứ đó, và lưu lượng của họ đến từ link gửi tay chứ không từ tìm kiếm. Đảo lại chỉ là một dòng nếu chủ dự án muốn khác.

- [ ] **Step 1:** `app/robots.ts` — cho phép trang tiếp thị, chặn `/i/`, `/api/`, `/dashboard/`, `/editor/`; trỏ `sitemap`.
- [ ] **Step 2:** `app/sitemap.ts` — `/`, `/mau-thiep`, `/dieu-khoan`, `/bao-mat`. Không liệt kê thiệp.
- [ ] **Step 3:** `/i/[slug]` thêm `robots: { index: false, follow: false }` vào `generateMetadata`. **OG vẫn phải nguyên vẹn** — noindex không ảnh hưởng preview trên Zalo/Facebook; có test chốt để lần sau không ai "dọn" nhầm.
- [ ] **Step 4:** Landing: canonical, `openGraph`, `twitter`, JSON-LD `WebSite` + `Organization`. JSON-LD là script inline → **phải mang nonce của Task 1**, nếu không CSP tự chặn schema của mình.
- [ ] **Step 5:** Commit: `feat(seo): robots, sitemap, canonical and structured data`

## Task 4 — Backup pg_dump → R2, giữ 14 bản

Spec mục 6: "pg_dump hằng đêm đẩy lên R2, giữ 14 bản".

- [ ] **Step 1:** `packages/db/scripts/backup.ts` — `pg_dump` (định dạng custom `-Fc`) → nén → upload key `backups/hpwd-YYYY-MM-DDTHH-mm-ssZ.dump`.
- [ ] **Step 2:** Giữ 14: liệt kê tiền tố, sắp theo tên (tên ISO nên sắp chuỗi = sắp thời gian), xoá phần dư. **Chỉ xoá sau khi upload mới thành công** — thứ tự ngược lại biến một lần mạng chập thành mất luôn bản cũ nhất mà không có bản mới thay thế.
- [ ] **Step 3:** `pg_dump` thất bại (sai credential, DB chết) phải thoát **khác 0** và **không** xoá gì. Một backup rỗng ghi đè lịch sử là tệ hơn không backup.
- [ ] **Step 4:** `restore.ts` + runbook. **Backup chưa từng restore không phải backup.** Chứng minh vòng tròn đầy đủ: dump DB dev → tạo database tạm → restore vào đó → đếm bảng và vài hàng khớp → xoá database tạm.
- [ ] **Step 5:** `docs/operations.md`: cron mẫu, biến môi trường, cách kiểm bản backup mới nhất còn sống.
- [ ] **Step 6:** Commit: `feat(ops): nightly pg_dump backup to object storage, with a tested restore`

## Task 5 — Giám sát

- [ ] **Step 1:** `GET /api/health` — kiểm **thật** (DB `SELECT 1`, Redis `PING`, storage `HeadBucket`, worker heartbeat), trả `200`/`503` + JSON từng thành phần. Health check chỉ trả `{"ok":true}` mà không chạm gì là thứ làm uptime monitor báo xanh trong lúc DB đã chết.
- [ ] **Step 2:** Worker ghi heartbeat vào Redis theo chu kỳ; health đọc và coi là chết nếu quá hạn. Đây là thành phần **im lặng nhất** trong hệ: worker chết thì nhạc và xoá nền kẹt mãi ở "đang xử lý" mà web vẫn xanh hoàn toàn.
- [ ] **Step 3:** Health **không được** rò rỉ chi tiết (chuỗi kết nối, phiên bản, thông điệp lỗi gốc). Có test chốt.
- [ ] **Step 4:** Log lỗi có cấu trúc (JSON một dòng) cho route handler và worker, đủ để `docker logs`/journald grep được.
- [ ] **Step 5:** `docs/operations.md`: mục giám sát — cắm uptime monitor vào `/api/health` thế nào, ngưỡng cảnh báo, và **danh sách những gì health check KHÔNG bắt được**.
- [ ] **Step 6:** Commit: `feat(ops): health endpoint, worker heartbeat and structured logs`

## Task 6 — Đóng khoảng cách LCP (2.7s → < 2.5s)

- [ ] **Step 1:** **Đo trước, sửa sau.** Lighthouse mobile + throttle 4G trên `/i/demo`, ghi lại LCP/TBT/CLS và **phần tử LCP là cái gì**. Không đoán.
- [ ] **Step 2:** Ghi rõ vào ledger: 16 file font đang thiếu → trang đang chạy bằng font fallback. Con số đo được là sàn, không phải số thật lúc launch.
- [ ] **Step 3:** Sửa theo đúng thứ tự tác động đo được. Ứng viên: `priority`/`fetchPriority` cho ảnh cover, `preload` ảnh LCP, cắt JS của `/i/[slug]` (hiện **188 kB** first load; framer-motion và lightbox là hai khối lớn nhất và **cả hai đều không cần cho khung hình đầu**), `preconnect` tới host lưu trữ.
- [ ] **Step 4:** Đo lại sau **mỗi** thay đổi. Thay đổi nào không cải thiện thì bỏ đi, đừng giữ lại "cho chắc".
- [ ] **Step 5:** Nếu vẫn chưa đạt < 2.5s: **nói thẳng con số**, liệt kê cái gì còn chặn, không làm tròn xuống. Số đo thật cao hơn mục tiêu vẫn hữu ích; số đẹp mà giả thì không.
- [ ] **Step 6:** Commit: `perf(invite): close the LCP gap on the guest page`

## Task 7 — Image + compose production

**Phát hiện khi khảo sát:** `docs/operations.md` mô tả cách chạy image worker (ffmpeg nướng sẵn, `CMD ["npx","tsx","src/index.ts"]`) — **image đó chưa từng tồn tại**. Repo chỉ có đúng một Dockerfile, của `services/rembg`.

- [ ] **Step 1:** `next.config.ts` → `output: "standalone"`.
- [ ] **Step 2:** `apps/web/Dockerfile` (multi-stage, pnpm, `prisma generate`). Nhớ: `NEXT_PUBLIC_SITE_URL` phải là **build-arg**, không phải biến lúc chạy — sai chỗ này thì og:image trỏ về localhost và không có cảnh báo nào.
- [ ] **Step 3:** `apps/worker/Dockerfile` đúng như tài liệu đã hứa.
- [ ] **Step 4:** `docker-compose.prod.yml`: web, worker, rembg, postgres, redis, reverse proxy. rembg và các service dữ liệu **không map cổng ra ngoài**. Proxy ghi đè `x-forwarded-for` (khớp `TRUSTED_PROXY_HOPS=1` của Task 2).
- [ ] **Step 5:** CI: build image trong workflow. Bước deploy viết sẵn nhưng **tắt**, kèm ghi chú cần secret gì — chưa có máy chủ.
- [ ] **Step 6:** Chỉ build thử nếu ổ còn > 10 GB. Không đủ thì ghi HUMAN TODO, **không** đánh dấu xong.
- [ ] **Step 7:** Commit: `feat(ops): production images and compose`

## Task 8 — Rà soát rate-limit/moderation + load test

- [ ] **Step 1:** Kiểm kê: hiện **chỉ** wishes và submissions có rate-limit. Upload (ảnh/nhạc/font) và tạo thiệp thì không — đều là route tốn CPU/đĩa, đều sau đăng nhập nhưng đăng nhập Google là miễn phí và vô hạn.
- [ ] **Step 2:** Thêm giới hạn cho những route còn thiếu, theo **user** chứ không theo IP với route đã đăng nhập.
- [ ] **Step 3:** Kiểm lại luồng duyệt lời chúc đầu-cuối sau khi middleware đổi (Task 1 động vào mọi request).
- [ ] **Step 4:** Load test `/i/demo`: ghi p50/p95/p99 và ngưỡng vỡ. Chạy **local**, ghi rõ máy đo và máy chạy là một — con số này để so sánh tương đối, không phải để hứa với ai.
- [ ] **Step 5:** Commit: `feat(security): rate-limit the remaining expensive routes`

---

## Xong Phase 4 khi

- `pnpm exec turbo lint test --force` xanh; `tsc --noEmit` sạch; `next build` sạch (vào `HPWD_DIST_DIR` nếu dev server đang chạy).
- Chrome thật: **0 vi phạm CSP** trên landing, thiệp, editor.
- Backup đã **restore thử thành công**, không chỉ chạy thành công.
- `/api/health` trả 503 thật khi tắt Redis (đã thử tắt).
- Số LCP đo được ghi trong ledger, dù đạt hay không.
- HANDOFF cập nhật; mọi việc cần hạ tầng thật nằm trong HUMAN TODO, không giả vờ đã xong.

## Ngoài phạm vi

- Mua tên miền, dựng máy chủ, chạy deploy thật.
- Sentry/SaaS giám sát bên thứ ba — cần chủ dự án quyết (dự án tới giờ tự host mọi thứ).
- 16 file font, nhạc bản quyền, rà soát pháp lý — HUMAN TODO cũ, không thuộc Phase 4.
