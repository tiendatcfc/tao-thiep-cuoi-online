# Thiết kế: Website tạo thiệp cưới online miễn phí (HPWD)

**Ngày:** 2026-08-10
**Trạng thái:** Đã duyệt hướng tiếp cận (editor theo section, Next.js + Node + Postgres, self-host rembg, triển khai theo phase)

## 1. Tổng quan sản phẩm

Website cho phép cô dâu chú rể tạo thiệp cưới online **miễn phí, không watermark**: chọn mẫu → tùy chỉnh nội dung/màu sắc/nhạc/hiệu ứng → publish tại URL riêng → gửi link cá nhân hóa cho từng khách mời. Khách mở thiệp trên điện thoại (ước tính >85% lượt xem là mobile), xem thông tin lễ cưới, album, gửi lời chúc, xác nhận tham dự (RSVP), và mừng cưới qua QR ngân hàng.

**Người dùng mục tiêu:** cặp đôi Việt Nam; giao diện tiếng Việt; chia sẻ chủ yếu qua Zalo/Messenger/Facebook.

**Mô hình:** miễn phí toàn bộ 17 tính năng (khác đối thủ tính phí theo tier Basic/Premium — ở đây Basic/Premium chỉ là phân loại độ cầu kỳ của mẫu, đều free).

## 2. Mapping 17 tính năng → giải pháp kỹ thuật

| # | Tính năng (theo ảnh) | Giải pháp | Phase |
|---|---|---|---|
| 1 | Trình thiết kế website | Editor theo section: panel trái là danh sách section (kéo thả thứ tự bằng `dnd-kit`), giữa là preview mobile-first live, panel phải là form chỉnh props của section đang chọn. State bằng Zustand, autosave debounce 2s. | 1 |
| 2 | Xóa watermark | Không bao giờ chèn watermark. Badge "Tạo miễn phí tại HPWD" ở footer thiệp, có toggle tắt trong settings. | 1 |
| 3 | Tùy chỉnh hộp quà tặng và lời chúc | Section `gift` và `wishes` có props tùy chỉnh đầy đủ: tiêu đề, mô tả, ảnh nền, icon, màu. Lời chúc của khách lưu DB, chủ thiệp duyệt/ẩn từng lời chúc. | 1–2 |
| 4 | Hộp mừng (QR ngân hàng) | Sinh QR chuẩn VietQR (EMVCo payload theo spec NAPAS) **client-side** bằng lib `vietqr` + `qrcode` — không phụ thuộc dịch vụ ngoài. Hỗ trợ 2 tài khoản (cô dâu / chú rể), danh sách ngân hàng theo BIN chuẩn. | 1 |
| 5 | Hiệu ứng chuyển động, hiệu ứng mở màn | `framer-motion` + IntersectionObserver: mỗi section chọn preset animation (fade/slide-up/zoom/none) khi cuộn tới. Hiệu ứng mở màn chọn được: rèm kéo, fade, zoom; overlay hạt rơi (cánh hoa/kim tuyến) vẽ bằng canvas. | 1–2 |
| 6 | Hiệu ứng mở phong bì thư | Overlay phong bì (CSS 3D transform + framer-motion): khách chạm để mở nắp phong bì → thiệp trượt ra. Cú chạm này đồng thời là user-gesture hợp lệ để **bắt đầu phát nhạc** (giải quyết autoplay policy của trình duyệt). | 1 |
| 7 | Thêm hyperlink vào các phần tử | Text dùng rich-text editor TipTap (extension Link); button và image có prop `href` tùy chọn. | 2 |
| 8 | Mẫu thiệp Basic | Template = bản ghi DB chứa InvitationDocument JSON mặc định + theme + thumbnail. 5 mẫu basic ở Phase 1. | 1 |
| 9 | Thư viện nhạc phổ biến | Bảng `MusicTrack` chứa nhạc không bản quyền / đã có quyền sử dụng, stream từ R2 qua CDN, player sticky đáy màn hình. **Lưu ý pháp lý:** không tự ý dùng nhạc thương mại "phổ biến" — chọn nguồn royalty-free (Pixabay Music, Free Music Archive) hoặc mua license. | 1 |
| 10 | Upload nhạc riêng | Upload mp3/m4a ≤ 15MB qua signed URL → worker transcode ffmpeg về AAC 128kbps → R2. | 2 |
| 11 | Tên khách mời tự động | Trang quản lý khách: thêm tay hoặc import Excel/CSV (SheetJS). Mỗi khách có token → link `/i/{slug}?g={token}` render "Trân trọng kính mời: {tên khách}" tại vị trí cấu hình được. Copy link hàng loạt, nút share Zalo, đánh dấu đã xem (track `viewedAt`). | 2 |
| 12 | Mẫu thiệp Premium | 10+ mẫu cầu kỳ (parallax, layout album phức tạp, typography riêng) — vẫn miễn phí. | 3 |
| 13 | Album ảnh chuyên nghiệp | Layout grid / masonry / carousel; lightbox (`yet-another-react-lightbox`); pipeline ảnh bằng `sharp`: resize đa kích thước, WebP, blur placeholder, lazy load. | 1 (cơ bản) / 3 (nâng cao) |
| 14 | Nhúng video YouTube | Section `video`: paste URL → parse videoId → render `lite-youtube-embed` (không tải iframe YouTube cho tới khi bấm play). | 2 |
| 15 | Xóa nền ảnh tự động (AI) | Microservice Python FastAPI + `rembg` (model `isnet-general-use`), chạy CPU trong Docker. Editor gửi ảnh → API enqueue BullMQ → worker gọi rembg → PNG có alpha lưu R2 → editor nhận kết quả (polling/SSE). | 3 |
| 16 | Tải lên font chữ tùy chỉnh | Upload TTF/OTF/WOFF2 ≤ 5MB → validate bằng `fontkit`, cảnh báo nếu thiếu glyph tiếng Việt (kiểm tra mẫu "ăâđêôơư ẮẰẲẴẶ") → convert sang WOFF2 (`wawoff2`) → R2 → inject `@font-face` động vào thiệp. | 3 |
| 17 | Form tùy chỉnh | Form builder: field types text, textarea, select, radio, checkbox, number, date; schema JSON lưu trong section props; submission lưu bảng `FormSubmission`; export CSV. RSVP là form dựng sẵn từ chính engine này. | 2 |

## 3. Kiến trúc hệ thống

```
Monorepo (pnpm workspaces + Turborepo)
├── apps/web        Next.js 15 App Router — landing, dashboard, editor, trang thiệp /i/[slug]
├── apps/worker     Node + BullMQ — transcode nhạc, xử lý ảnh, gọi rembg
├── services/rembg  Python FastAPI + rembg (Docker, CPU)
├── packages/schema Zod schemas + TypeScript types dùng chung (InvitationDocument…)
└── packages/db     Prisma schema + client (PostgreSQL)
```

- **DB:** PostgreSQL 16 (Prisma ORM). **Queue/cache:** Redis 7 + BullMQ.
- **Storage:** Cloudflare R2 (S3-compatible, egress free) + Cloudflare CDN trước toàn bộ site.
- **Auth:** Auth.js (NextAuth v5) — Google OAuth + email magic link.
- **Trang thiệp public:** SSR + full-route cache, revalidate theo tag khi chủ thiệp bấm publish. OG image sinh động bằng `next/og` (satori) để share đẹp trên Zalo/Facebook.
- **Deploy:** Docker Compose trên VPS (4 vCPU / 8GB RAM đủ cho toàn bộ stack gồm rembg CPU). CI: GitHub Actions build image → SSH deploy.

**Luồng dữ liệu chính:** Editor (client) giữ InvitationDocument trong Zustand → autosave PATCH `/api/invitations/:id` (draft) → bấm Publish → server validate bằng Zod, snapshot document, set `status=published`, revalidateTag → khách truy cập `/i/[slug]` được SSR từ snapshot đã publish (draft không bao giờ lộ ra ngoài).

## 4. Data model (Prisma — rút gọn)

```prisma
model User          { id, email @unique, name, image, createdAt; invitations Invitation[]; assets MediaAsset[] }
model Template      { id, name, tier (basic|premium), category, thumbnailUrl, document Json, isActive }
model Invitation    { id, userId, slug @unique, templateId, document Json, publishedDocument Json?,
                      status (draft|published), publishedAt, settings Json, viewCount Int @default(0) }
model Guest         { id, invitationId, name, token @unique, group, note, viewedAt?; @@index([invitationId]) }
model Wish          { id, invitationId, guestName, message, isHidden @default(false), createdAt }
model FormSubmission{ id, invitationId, sectionId, data Json, guestToken?, createdAt }
model MediaAsset    { id, userId, kind (image|audio|font), url, meta Json, createdAt }
model MusicTrack    { id, title, artist, url, duration, category, isActive }
```

`document` và `publishedDocument` tách riêng để chỉnh sửa draft không ảnh hưởng thiệp đang publish.

## 5. InvitationDocument schema (Zod — packages/schema)

```ts
InvitationDocument = {
  version: 1,
  theme: {
    primary: string, secondary: string, background: string,
    headingFont: string, bodyFont: string,
    customFonts: { family: string, url: string }[]
  },
  music: { source: 'library' | 'upload' | null, url: string | null,
           trackId: string | null, playAfterOpen: boolean },
  opening: { effect: 'envelope' | 'curtain' | 'fade' | 'none',
             particles: 'petals' | 'confetti' | null,
             monogram: string, showGuestName: boolean },
  sections: Section[]  // discriminated union theo `type`
}

Section (chung): { id: string, type: SectionType, order: number, visible: boolean,
                   animation: { preset: 'none'|'fade'|'slide-up'|'zoom', durationMs: number } }

SectionType và props riêng:
- cover  : { groomName, brideName, date, coverImage, tagline }
- couple : { groom: {name, photo, intro, parents}, bride: {...} }
- story  : { items: {date, title, text, image}[] }
- events : { items: {name, time, date, address, mapUrl}[] }   // lễ vu quy, tiệc cưới…
- album  : { layout: 'grid'|'masonry'|'carousel', images: {url, width, height, blurDataUrl}[] }
- video  : { youtubeId: string, caption }
- gift   : { title, description, accounts: {side:'groom'|'bride', bankBin, bankName, accountNumber, accountName}[] }
- wishes : { title, description, requireApproval: boolean }
- form   : { title, fields: FormField[], submitLabel, isRsvp: boolean }
- text   : { html: string }   // TipTap output, hỗ trợ hyperlink
```

Mọi đọc/ghi document đều đi qua `InvitationDocumentSchema.parse()` — một nguồn sự thật duy nhất cho editor, API và renderer.

## 6. Yêu cầu phi chức năng

- **Hiệu năng:** LCP < 2.5s trên 4G cho trang thiệp; ảnh qua pipeline sharp (max 10MB/ảnh upload, tối đa 200 ảnh/thiệp); nhạc và ảnh serve qua CDN.
- **Bảo mật/chống phá:** rate-limit (Redis) cho gửi lời chúc + form submission theo IP; upload qua signed URL có giới hạn content-type/size; lời chúc có chế độ duyệt trước khi hiện; slug do user đặt phải bỏ dấu tiếng Việt, regex `[a-z0-9-]{3,60}`, check trùng.
- **Autoplay nhạc:** không bao giờ autoplay trước tương tác; nhạc bắt đầu khi khách chạm mở phong bì / mở màn.
- **Backup:** pg_dump hằng đêm đẩy lên R2, giữ 14 bản.
- **Analytics:** đếm view thiệp (tăng `viewCount` + đánh dấu guest `viewedAt`), không dùng tracker bên thứ ba.

## 7. Lộ trình (1 dev full-time, ~12 tuần)

| Phase | Thời gian | Kết quả |
|---|---|---|
| 0 — Nền móng | tuần 1 | Monorepo chạy được: auth, DB, storage, CI/CD, deploy skeleton |
| 1 — MVP | tuần 2–5 | Tạo và publish thiệp hoàn chỉnh: 5 mẫu basic, editor section, cover/couple/events/album/gift QR/wishes/RSVP, nhạc thư viện, phong bì + hiệu ứng, OG share, không watermark |
| 2 — Khách mời & form | tuần 6–8 | Link khách cá nhân hóa + import Excel + tracking, form builder, upload nhạc, YouTube, hyperlink (TipTap), thêm hiệu ứng mở màn |
| 3 — Nâng cao | tuần 9–11 | AI xóa nền (rembg), font tùy chỉnh, album chuyên nghiệp, 10 mẫu premium |
| 4 — Hardening & launch | tuần 12 | Rate-limit, moderation, backup, SEO, đo hiệu năng, launch |

Mỗi phase có plan thực thi riêng trong `docs/superpowers/plans/`; phase sau chỉ viết plan chi tiết khi phase trước xong (tránh plan bị lỗi thời).
