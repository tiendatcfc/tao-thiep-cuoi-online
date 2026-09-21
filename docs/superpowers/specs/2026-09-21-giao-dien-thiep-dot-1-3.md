# Giao diện thiệp — đợt 1 đến 3

Ngày: 2026-09-21. Trạng thái: đã duyệt, đang làm đợt 1.

## Vì sao có tài liệu này

Chủ dự án đưa một bản tham khảo — `chungdoi.com/vi/mau-thiep/minimalism-do-dam/demo`
— và yêu cầu làm đẹp tương đương, thiếu phần nào bổ sung phần đó, kèm ảnh
demo cho sinh động.

Soi bản đó ở 5 vị trí cuộn cho ra hai nhóm khoảng cách rõ rệt: **sáu tính
năng mình chưa có**, và **năm chỗ mình có rồi nhưng họ làm kỹ hơn**. Chi
tiết ở bảng dưới.

Đây là việc **architectural**: nó thêm thành viên vào `SectionSchema`, mà
sáu nơi ánh xạ toàn phần phụ thuộc (`SectionRenderer`, `panels/index.tsx`,
`section-labels.ts`, `defaults.ts::createSection`, `templates/builders.ts`,
`seed-dev.ts`).

## Phát hiện làm việc này rẻ hơn tưởng: không cần di trú

Nỗi lo lớn nhất là phải nâng `InvitationDocumentSchema.version` và di trú
mọi `publishedDocument` đã có. **Không cần**, vì hai tính chất đã có sẵn
trong codebase:

1. `.strict()` chỉ chặn khoá **lạ**, không chặn khoá **thiếu mà có
   `.default()`**. Nếp này đã được dùng và ghi lý do ở
   `AlbumImageSchema.caption`, `MusicSchema.assetId` và
   `ThemeSchema.customFonts[].assetId`.
2. Thêm thành viên vào `z.discriminatedUnion` không ảnh hưởng tài liệu cũ.

**Bất biến của cả ba đợt: mọi trường mới đều `.default()`, không bao giờ
`.optional()` và không bao giờ bắt buộc.** Một test dựng tài liệu theo hình
dạng cũ rồi parse bằng schema mới là chốt chặn cho điều này.

## Khoảng cách so với bản tham khảo

### Thiếu hẳn tính năng

| Của họ | Mình hiện tại | Giải quyết ở |
| --- | --- | --- |
| DRESS CODE — dãy chấm màu + chú thích | không có | đợt 3 |
| LỊCH TRÌNH NGÀY CƯỚI — mốc giờ dọc kèm icon | không có | đợt 3 |
| Lịch tháng có dấu ngày cưới + "Thêm vào lịch" | không có | đợt 2 |
| Bản đồ + "Chỉ đường" | chỉ link `mapUrl` trần | đợt 2 (xem quyết định 3) |
| Ngày âm | không có | đợt 2 |
| Vai vế "TRƯỞNG NAM"/"ÚT NỮ", cha mẹ hai cột | `parents` là một dòng chữ | đợt 2 |

### Có rồi nhưng họ làm kỹ hơn

1. Nền giấy có vân + hình chìm chạy suốt trang (mình chỉ có hạt nhiễu 3%).
2. Thẻ thông tin nền màu chủ đạo, chữ kem — tạo nhịp đậm–nhạt. Mình để mọi
   mục trên cùng một nền giấy nên trang phẳng.
3. Hoa văn góc tràn ra ngoài mép thẻ.
4. Hero là phong bì mở có ảnh polaroid và dấu xi.
5. Album là carousel ló cạnh, không phải lưới.

## Ba quyết định đã chốt

### 1. Trang trí ăn màu theo theme, không phải ảnh màu cố định

Hoa văn của bản tham khảo là ảnh màu nước đỏ — đẹp, nhưng khoá cứng vào một
bảng màu. Cặp đôi ở HPWD chọn `--primary`/`--secondary`/`--background` tự
do, nên **mọi trang trí ở đây là SVG tự vẽ, tô bằng `color-mix()` từ chính
màu của họ**. Đây là lý do không tải ảnh trang trí về dùng.

### 2. Thẻ đậm lấy nền từ `--primary`, và độ tương phản được TÍNH, không phó mặc

Thẻ thông tin dùng `background: var(--primary)` với chữ kem. Rủi ro hiển
nhiên: cặp đôi chọn màu chủ đạo nhạt thì chữ kem biến mất.

Không xử lý bằng cách hy vọng. `InvitePage` đã cầm `theme.primary` dưới
dạng chuỗi trong JavaScript, nên nó tính độ sáng tương đối và đặt biến
`--on-primary` thành mực kem hoặc mực đậm cho đúng. Màu không phân tích
được (chuỗi lạ, `color()`, tên màu CSS) rơi về mực kem — cùng hành vi với
hôm nay, không tệ hơn.

### 3. KHÔNG nhúng bản đồ

Trang thiệp hiện không gọi ra bên thứ ba nào ngoài kho ảnh của chính dự án,
và `csp.ts` chỉ mở `frame-src` cho YouTube. Nhúng iframe Google Maps là mở
thêm một origin, cho Google một khung chạy trong trang và cho họ biết mọi
khách nào mở thiệp — trên một trang vốn đã cố ý `robots: noindex` vì nó
chứa danh sách khách, địa chỉ nhà và số tài khoản.

Thay vào đó: khối địa chỉ được thiết kế tử tế + nút "Chỉ đường" mở thẳng ứng
dụng bản đồ của máy. Nếu chủ dự án muốn nhúng thật, đó là một quyết định
riêng và phải kèm việc mở CSP một cách tường minh.

## Ảnh demo

`seed-dev.ts` đang sinh JPEG một màu phẳng bằng `sharp` — đó là lý do album
demo trông như bốn ô màu.

Ảnh của bản tham khảo là ảnh cưới thật, có bản quyền, **không dùng**. Thay
vào đó `buildPlaceholderJpeg` được nâng thành bộ minh hoạ tự vẽ: nền chuyển
sắc ấm, khung vòm, nhánh lá, chữ lồng — vẫn sinh bằng `sharp` từ SVG, vẫn
tải lên MinIO như cũ, vẫn im lặng bỏ qua khi không có biến môi trường R2.

Ảnh cưới thật phải là ảnh của chủ dự án. Đây là HUMAN TODO, không phải việc
code.

## Đợt 1 — lớp nhìn, không đụng schema

- `lib/contrast.ts` — độ sáng tương đối → `--on-primary`.
- `globals.css` — token vân giấy, hình chìm, cỡ hoa văn.
- `invite/decor/Ornament.tsx` — 4 biến thể nhánh hoa góc, SVG, ăn màu theme,
  `aria-hidden` + `pointer-events-none`.
- `invite/decor/PaperBackdrop.tsx` — vân giấy + hình chìm, trong cột thiệp.
- `invite/InfoCard.tsx`, `invite/DateBlock.tsx` — thẻ đậm và khối ngày lớn.
- `EventsSection`, `CoupleSection` — chuyển sang `InfoCard`.
- `CoverSection` — hero khung vòm. **Cố ý không làm phong bì**: màn mở đã là
  phong bì rồi, hai cái liền nhau là lặp.
- `AlbumSection` — carousel ló cạnh bằng CSS scroll-snap (không thêm thư
  viện), giữ nguyên lightbox đang có.
- `seed-dev.ts` — bộ ảnh minh hoạ mới.

## Đợt 2 — thêm trường vào mục sẵn có

Mọi trường đều `.default('')`:

- `CoverPropsSchema.lunarDate`
- `PersonSchema.role` — "Trưởng nam" / "Út nữ"
- `PersonSchema.parentsCity` — để xếp cha mẹ hai cột có vạch ngăn
- `EventItemSchema.guestTime` — "đón khách", tách khỏi giờ khai tiệc

Cộng hai thành phần mới:

- `WeddingCalendar` — lịch tháng của ngày cưới, đánh dấu bằng trái tim.
- "Thêm vào lịch" — sinh chuỗi `.ics` và tải xuống ngay trong trình duyệt.
  Không server, không bên thứ ba. Múi giờ theo `VN_TIME_ZONE` như mọi chỗ
  khác.

## Đợt 3 — hai loại mục mới

- `dresscode`: `{ title, note, colors: string[] }`
- `timeline`: `{ title, items: [{ time, label, icon }] }` — `icon` là enum
  các icon tự vẽ, không phải emoji và không cho tải lên.

Mỗi loại đi qua đủ sáu điểm đăng ký. Thiếu điểm nào là lỗi biên dịch, không
phải lỗi âm thầm — đó là lý do hệ thống được viết bằng ánh xạ toàn phần.

## Kiểm, cho cả ba đợt

- 1.362 test hiện có phải xanh.
- Test mới: hàm độ sáng, chuỗi `.ics`, và — quan trọng nhất — **parse một
  tài liệu hình dạng cũ bằng schema mới**, chốt bất biến "không cần di trú".
- Mỗi test mới phải chứng minh bắt được lỗi của nó: sửa hỏng cho đỏ, khôi
  phục cho xanh, dán bằng chứng vào báo cáo.
- Chụp lại 5 khổ màn hình (320×568, 390×844, 844×390, 820×1180, 1440×900) ở
  cả hai chế độ sáng/tối, theo `docs/testing-guide.md`.
