# Bản quyền nhạc nền

## Trạng thái: 7 bản nhạc thật, Public domain hoặc CC0

Ba "bản nhạc" sóng sine do ffmpeg sinh ra đã **bị xoá khỏi catalogue** (không phải
ẩn đi — `seed-music.ts` xoá hẳn các dòng `music-demo-*`). Thay vào đó là bảy bản thu
thật, tải từ Wikimedia Commons bằng `pnpm seed:music`.

Tất cả đều là nhạc cổ điển **không lời** — cố ý: trang thiệp có thể đang được đọc
to lên trong lễ, lời bài hát sẽ chọi với nội dung thiệp.

## Bảng giấy phép

Ngày kiểm: **2026-09-28**. Cột `Giấy phép` là chuỗi **nguyên văn** do Wikimedia
Commons API trả về (`extmetadata.LicenseShortName`), không phải tôi diễn giải.

| Bài | Soạn giả | Người trình bày / tải lên | Giấy phép | Bắt buộc ghi công? | Dài |
|---|---|---|---|---|---|
| Air on the G String | J. S. Bach | Composition: Johann Sebastian Bach; Performance: United States Air For | **Public domain** | không | 3:03 |
| Jesu, Joy of Man’s Desiring | J. S. Bach | Orchestra Gli Armonici | **CC0** | không | 3:22 |
| Nocturne Op. 9 No. 2 | Chopin | Frédéric Chopin / Frank Lévy | **Public domain** | không | 4:32 |
| Clair de Lune | Debussy | Claude Debussy | **Public domain** | không | 5:04 |
| Rêverie | Debussy | Claude Debussy | **Public domain** | không | 4:52 |
| Gymnopédie No. 1 | Satie | Teknopazzo | **CC0** | không | 3:25 |
| Träumerei | Schumann | Robert Schumann (1810-1856) (see Musopen for performance author inform | **Public domain** | không | 3:23 |

### Trang nguồn (kiểm lại được bất cứ lúc nào)

- **Air on the G String** — https://commons.wikimedia.org/wiki/File:Air_-_Air_Force_Strings_-_United_States_Air_Force_Band.mp3
- **Jesu, Joy of Man’s Desiring** — https://commons.wikimedia.org/wiki/File:Bach,_BWV_147,_10._Jesus_bleibet_meine_Freude.ogg
- **Nocturne Op. 9 No. 2** — https://commons.wikimedia.org/wiki/File:Chopin_-_Nocturne_No._2_in_E-flat_major,_Op._9_No._2_(Frank_Levy).flac
- **Clair de Lune** — https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg
- **Rêverie** — https://commons.wikimedia.org/wiki/File:Reverie.ogg
- **Gymnopédie No. 1** — https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg
- **Träumerei** — https://commons.wikimedia.org/wiki/File:Robert_Schumann_-_scenes_from_childhood,_op._15_-_vii._dreaming.ogg

## Tôi đã kiểm được gì, và chưa kiểm được gì

**Đã kiểm bằng máy:**

- Giấy phép từng file, đọc thẳng từ Commons API chứ không dựa vào danh tiếng của trang.
  Chỉ giữ lại `Public domain` và `CC0`; đã loại bỏ toàn bộ `CC BY-SA`/`CC BY` (trong
  95 file khảo sát có 29 bản CC BY-SA 4.0 — dùng chúng sẽ kéo theo nghĩa vụ ghi công
  và chia sẻ tương tự).
- Commons báo `AttributionRequired: false` cho cả bảy. Dù vậy trang này vẫn ghi đầy đủ
  nguồn — ghi công là phép lịch sự, không chỉ là nghĩa vụ pháp lý.
- File tải về nguyên vẹn, đúng độ dài, phát được qua URL công khai.

**CHƯA kiểm được — cần bạn:**

1. **Tôi không nghe được.** Tôi xác minh được giấy phép, độ dài, độ to, tần số lấy mẫu
   — nhưng không đánh giá được bản thu *nghe có hay không*. Bạn phải nghe thử cả bảy.
   Riêng `Gymnopédie No. 1` có tần số lấy mẫu **22.050 Hz** (các bài khác 44.100 Hz),
   tức là không có dải cao trên 11 kHz — nghe có thể hơi đục. Đây là bài đáng nghe kỹ nhất.
2. **Public domain của *bản thu* khác với của *bản nhạc*.** Bản nhạc thì chắc chắn hết
   hạn (Bach, Chopin, Debussy, Satie, Schumann đều mất trước 1918). Nhưng bản *thu âm*
   có quyền riêng của người trình bày. Với `Clair de Lune`, `Rêverie` và `Träumerei`,
   Commons chỉ ghi tên soạn giả, không ghi người trình bày — trang Schumann còn ghi
   "see Musopen for performance author information". Commons khẳng định PD, và tôi ghi
   lại khẳng định đó nguyên văn; nhưng **khẳng định của Commons không phải là bảo hành**.
3. **Dùng thương mại.** Sản phẩm này miễn phí, nhưng nếu sau này có gói trả phí thì nên
   để luật sư đọc lại mục 2.

## Chuẩn hoá âm lượng

Bảy file gốc có độ to rất lệch nhau — đo bằng EBU R128:

| Bài | Gốc (LUFS) | Đỉnh gốc (dBFS) |
|---|---|---|
| Air on the G String | -12.0 | **+0.3 — đã cắt đỉnh** |
| Jesu, Joy of Man's Desiring | -16.6 | -0.8 |
| Gymnopédie No. 1 | -19.1 | -0.5 |
| Nocturne Op. 9 No. 2 | -20.1 | 0.0 |
| Clair de Lune | -22.4 | -0.9 |
| Rêverie | -26.4 | -3.8 |
| Träumerei | -29.5 | -12.8 |

Chênh **17,5 LU** giữa bài to nhất và nhỏ nhất: khách đổi từ Bach sang Schumann sẽ từ
vừa tai thành gần như không nghe thấy. `seed-music.ts` chuẩn hoá tất cả về **-16 LUFS,
trần -1,5 dBTP** bằng `loudnorm` hai lượt (lượt một đo, lượt hai áp — lượt đơn chỉ ước
lượng và lệch vài LU). Sau khi chuẩn hoá: -15,8 đến -16,4 LUFS, đỉnh cao nhất -1,1 dBFS.

## Chạy lại

```bash
NODE_EXTRA_CA_CERTS=$PWD/.certs/corp-ca.pem pnpm seed:music
```

Biến `NODE_EXTRA_CA_CERTS` cần trên máy có proxy chặn TLS (script sẽ tự nói câu này nếu
gặp lỗi chứng chỉ). **Không bao giờ tắt xác thực chứng chỉ để đi vòng.**

File audio **không** nằm trong repo — script tải một lần vào `packages/db/.music-cache/`
(đã gitignore), chuẩn hoá, rồi đẩy lên object store. Đưa 30 MB nhị phân vào git chỉ để
seed dev là cái giá không đáng, khi URL nguồn ổn định và đã ghi ngay trong script.

## Muốn đổi bài

Sửa mảng `TRACKS` trong `packages/db/scripts/seed-music.ts`. Nếu lấy bài mới từ Commons,
**đọc `extmetadata.LicenseShortName` của đúng file đó** trước khi thêm — mỗi file một
giấy phép riêng, cùng một bản nhạc có thể có bản thu CC BY-SA nằm cạnh bản thu PD.
