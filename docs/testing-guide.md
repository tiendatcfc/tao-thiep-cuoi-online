# HPWD — Cách tự kiểm toàn bộ tính năng

Danh sách để **người** bấm tay qua 17 tính năng trong spec, kèm trạng thái đã
kiểm trên máy dev tính đến 2026-09-21. Test tự động (1.362 cái) chứng minh
từng mảnh chạy đúng; file này là để chứng minh **chúng ghép lại thành sản
phẩm dùng được** — thứ không test tự động nào nói hộ được.

**Mỗi lần kiểm giao diện, đổi khổ màn hình ít nhất bốn lần.** Bốn lỗi nặng
nhất từng lọt qua ở dự án này đều chỉ lộ ra ở một khổ mà máy dev không mở:
thiệp thành một dải 430px trên nền trắng ở màn rộng, mục trang bìa cao bằng
cửa sổ trình duyệt bên trong khung xem trước 780px, bảng khách mời cuộn
ngang trên điện thoại, và màn mở phong bì cụt cả hai đầu khi cầm điện thoại
nằm ngang. Bộ khổ tối thiểu: **320×568, 390×844, 844×390 (nằm ngang),
820×1180, 1440×900** — cộng với chế độ tối của hệ điều hành.

Runbook sự cố nằm ở `docs/operations.md`. Đây chỉ là danh sách kiểm.

---

## 0. Khởi động — 3 lệnh

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres + redis + minio
pnpm dev                                          # web :3000 VÀ worker cùng lúc
```

`pnpm dev` chạy `turbo dev`, và cả `apps/web` lẫn `apps/worker` đều có script
`dev` — nên **một lệnh này khởi động cả hai**. Không cần `pnpm dev:worker`
riêng trừ khi muốn xem log worker ở cửa sổ khác.

Dịch vụ xoá nền chạy riêng, và **không có nó thì tính năng 15 không thử
được**:

```bash
cd services/rembg
./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 7000
```

Trên máy này venv, uvicorn và model 170 MB **đã cài sẵn**, nên lệnh trên chạy
được ngay — đã kiểm 2026-09-21: `/health` trả
`{"status":"ok","model":"isnet-general-use"}`, và POST một ảnh thật vào
`/remove-background` trả PNG 400×400 có kênh alpha với pixel góc alpha = 0,
tức là nền đã bị xoá thật chứ không chỉ trả lời được.

Không cần `SSL_CERT_FILE` nữa: bộ CA chỉ cần cho **lần đầu tải model**, mà
model đã nằm ở `~/.u2net/`. Máy mới thì đọc `services/rembg/README.md` trước.

### Kiểm mọi thứ đã sống

```bash
curl -s localhost:3000/api/health?strict=1 | python3 -m json.tool
```

Phải ra `"status": "ok"`. `backgroundRemoval` báo `"off"` là **bình thường và
không chặn gì cả**: worker tìm rembg qua `REMBG_URL` với mặc định sẵn
`http://127.0.0.1:7000`, nên tính năng 15 chạy được mà không cần đặt biến
nào. `"off"` chỉ có nghĩa là *health check của web* chưa được bảo là có rembg
mà canh. Muốn nó canh luôn thì thêm dòng này vào `apps/web/.env.local` rồi
khởi động lại dev server:

```
REMBG_URL="http://127.0.0.1:7000"
```

---

## 1. Dữ liệu đã có sẵn để test

| Thứ | Số lượng | Ghi chú |
|---|---|---|
| Mẫu thiệp | 15 | 5 Basic + 10 Premium |
| Nhạc thư viện | 3 | **là 3 tiếng bíp sine do ffmpeg sinh ra**, không phải nhạc thật |
| Tài khoản | 2 | 1 Google thật đã đăng nhập + 1 "Demo User" của seed |
| Thiệp | 3 | `/i/demo` và `/i/minh-khang-thu-ha` đã publish, 1 bản nháp |
| Khách mời | 9 | có token sẵn để thử link cá nhân hoá |

Link khách để thử tên tự động (tính năng 11):

```
http://localhost:3000/i/demo?g=demo-guest-token
```

Thiếu dữ liệu thì seed lại: `pnpm seed:templates`, `pnpm seed:music`,
`pnpm seed:dev`, và `pnpm dev:init` để tạo bucket.

---

## 2. Bảng kiểm 17 tính năng

Ký hiệu: **[máy]** làm được trên máy tính này — **[điện thoại]** bắt buộc mở
trên điện thoại thật — **[chặn]** chưa thử được, xem mục 3.

| # | Tính năng | Kiểm thế nào |
|---|---|---|
| 1 | Trình thiết kế | **[máy]** `/dashboard` → tạo thiệp → kéo thả thứ tự section ở panel trái, sửa props ở panel phải, xem preview giữa đổi theo. Ngồi im 2 giây → chữ "Đã lưu" hiện (autosave). Tải lại trang, nội dung còn nguyên. |
| 2 | Không watermark | **[máy]** Mở thiệp đã publish: chỉ có dòng "Tạo miễn phí tại HPWD" ở chân trang. Vào Cài đặt → tắt badge → publish lại → dòng đó biến mất. Không có watermark nào khác ở bất kỳ đâu. |
| 3 | Quà tặng + lời chúc | **[máy]** Mở `/i/demo`, gửi một lời chúc. Vào `/dashboard/<id>/loi-chuc` → ẩn nó → tải lại thiệp, lời chúc đã biến mất. Gửi hơn 50 lời chúc để thấy phân trang. |
| 4 | QR ngân hàng | **[máy]** Chọn ngân hàng + nhập số tài khoản trong panel Quà tặng → QR hiện ngay. **[điện thoại]** Quét bằng app ngân hàng thật — xem mục 3. |
| 5 | Hiệu ứng cuộn + mở màn | **[máy]** Đổi preset animation từng section, cuộn preview. **[điện thoại]** Cảm giác thật của hiệu ứng chỉ đánh giá được trên máy thật. |
| 6 | Mở phong bì | **[điện thoại]** Đặc biệt trên **iPhone**: chạm mở phong bì phải đồng thời khởi động nhạc. Chính sách autoplay của iOS là thứ không giả lập được. |
| 7 | Hyperlink | **[máy]** Thêm section Văn bản → bôi đen chữ → chèn link. Thử dán link rác (`javascript:`, `//evil.com`) → phải bị từ chối. Dán nội dung từ Word/Google Docs → định dạng lạ tự bị bỏ. |
| 8 | Mẫu Basic | **[máy]** `/mau-thiep` → 5 mẫu Basic, bấm "Dùng mẫu" → thiệp mới mang đúng nội dung/theme của mẫu. |
| 9 | Thư viện nhạc | **[máy]** Panel Nhạc → chọn bài → player hiện ở đáy. **Lưu ý: 3 bài hiện có là tiếng bíp.** |
| 10 | Upload nhạc riêng | **[máy]** Upload mp3 ≤15MB → trạng thái "Đang xử lý" → worker transcode → chuyển "Sẵn sàng". Xem log worker để thấy job chạy. |
| 11 | Tên khách tự động | **[máy]** `/dashboard/<id>/khach-moi` → thêm tay hoặc import Excel/CSV → copy link khách → mở link, tên khách hiện trên thiệp → cột "Đã xem" đổi trạng thái. |
| 12 | Mẫu Premium | **[máy]** `/mau-thiep?tier=premium` → 10 mẫu, mở thử vài cái. |
| 13 | Album ảnh | **[máy]** Upload vài ảnh → đổi layout grid/masonry/carousel/hero → bấm ảnh mở lightbox → thêm chú thích. **[điện thoại]** Upload 1 ảnh **chụp dọc từ camera** để xác nhận không bị xoay ngang. |
| 14 | Video YouTube | **[máy]** Dán link YouTube → ảnh đại diện hiện, iframe **chỉ tải khi bấm play**. Kiểm bằng tab Network của DevTools. |
| 15 | Xoá nền AI | **[máy]** Cần rembg đang chạy (mục 0). Upload ảnh → bấm "Xoá nền" → chờ → ảnh **mới** có nền trong suốt, ảnh gốc không bị ghi đè. |
| 16 | Font riêng | **[máy]** Upload file TTF/OTF ≤5MB → nếu thiếu glyph tiếng Việt phải có cảnh báo → font áp vào thiệp. Thử upload file không phải font → phải bị từ chối. |
| 17 | Form tuỳ chỉnh | **[máy]** Form builder → thêm đủ các loại field → publish → điền từ phía khách → `/dashboard/<id>/phan-hoi` thấy phản hồi → tải CSV. |

### Vài thứ không nằm trong bảng 17 nhưng nên thử

- **Đăng nhập Google**: đăng xuất rồi đăng nhập lại.
- **Đổi slug**: publish → đổi slug → publish lại → mở **link cũ** phải tự chuyển sang link mới (chuyển hướng 308), không được 404.
- **Hai tab**: mở cùng một thiệp ở hai tab, sửa ở cả hai → tab thứ hai phải báo xung đột chứ không được ghi đè âm thầm.
- **Giới hạn tốc độ**: gửi lời chúc liên tục >5 lần/phút → phải nhận thông báo tiếng Việt, không phải lỗi trắng.

---

## 3. Những thứ KHÔNG kiểm được bằng máy này

| Việc | Vì sao | Cần gì |
|---|---|---|
| **Ảnh share (OG) có dấu tiếng Việt** | satori không đọc được WOFF2, và các `.woff` của `@fontsource` đều đã subset | Font hiển thị trên trang **đã xong** (32 file WOFF2 trong `apps/web/public/fonts/`, sinh bằng `pnpm --filter @hpwd/web sync:fonts`). Riêng ảnh share còn cần 1 file `og-heading.ttf` đầy đủ; chưa có thì Đ, ặ, ễ, ị ra ô trắng. Đọc `apps/web/public/fonts/README.md`. |
| **Nhạc thật** | Thư viện là 3 tiếng bíp sine | Cần nhạc có bản quyền hợp lệ. Xem `docs/music-credits.md`. |
| **Quét QR** | Không quét được bằng máy tính | Mở `.superpowers/sdd/2026-08-10-phase-0-1-mvp/task-7-demo-qr.png` bằng app ngân hàng Việt Nam thật. 2 phút, chặn tính năng liên quan tới tiền. |
| **Cảm giác hiệu ứng** | Phong bì, cánh hoa rơi, cuộn — không đánh giá được qua headless | Mở thiệp trên điện thoại thật. |
| **Nhạc tự phát trên iOS** | Chính sách autoplay của WebKit không giả lập được | Mở trên iPhone thật, chạm mở phong bì. |
| **Khách tắt JavaScript** | noscript không giả lập được bằng headless | Chrome → Cài đặt trang → JavaScript → Chặn → mở `/i/demo`. Thiệp phải hiện ra, cuộn được, không kẹt sau lớp phủ. |
| **Ảnh chụp dọc** | Có test EXIF orientation-6 nhưng chưa thử ảnh camera thật | Upload 1 ảnh chụp dọc bằng điện thoại. |
| **3 image Docker** | Chưa build thành công ở đâu | Cần tạo GitHub repo + push để job `images` trong CI chạy. |
| **Backup/restore thật** | Chưa có bucket backup riêng | `docs/operations.md` mục 5c. Backup chưa từng restore thì không phải backup. |

---

## 4. Thứ tự đề xuất

1. Chạy mục 0, xác nhận `/api/health?strict=1` ra `ok` cả 5 mục.
2. Đi hết cột **[máy]** trong bảng 17 — khoảng 45–60 phút.
3. Bật rembg rồi quay lại tính năng 15.
4. Mở `/i/demo` trên **điện thoại thật** và đi hết cột **[điện thoại]** — 15 phút, và đây là phần bắt được những lỗi mà 1.347 test không bắt được.
5. Quét QR bằng app ngân hàng — 2 phút.
6. Kiểm JavaScript tắt — 2 phút.

Mục 4, 5, 6 là phần quan trọng nhất: chúng là những thứ **duy nhất** không có gì khác kiểm hộ.
