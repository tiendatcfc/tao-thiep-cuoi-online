# HPWD — Vận hành

Dành cho người triển khai và trực sự cố HPWD trên môi trường thật. Không phải tài liệu
phát triển: nếu bạn đang viết code, đọc `docs/superpowers/HANDOFF.md` trước.

Mọi đường dẫn file trong tài liệu này tính từ gốc repo.

---

## 1. Các tiến trình phải chạy

| Tiến trình | Là gì | Bắt buộc? |
|---|---|---|
| `apps/web` | Next.js — phục vụ thiệp, dashboard, API | Có |
| `apps/worker` | BullMQ consumer — chuyển mã nhạc (ffmpeg) và xoá nền ảnh | Có, nếu cho phép tải nhạc riêng hoặc xoá nền |
| `services/rembg` | FastAPI + rembg (CPU) — chỉ worker gọi | Có, nếu cho phép xoá nền ảnh |
| PostgreSQL 16 | Toàn bộ dữ liệu | Có |
| Redis 7 | Rate-limit **và** hàng đợi BullMQ | Có |
| Lưu trữ S3 (Cloudflare R2) | Ảnh + nhạc | Có |

**Web và worker phải trỏ vào CÙNG một Redis và CÙNG một `BULLMQ_PREFIX`.** Nếu lệch,
web vẫn đẩy job thành công, worker vẫn chạy bình thường, và job nằm lại trong một hàng
đợi không ai đọc — không có lỗi nào được ghi ở bất kỳ đâu. Triệu chứng duy nhất là nhạc
của người dùng kẹt mãi ở "Đang xử lý". Đây là lỗi cấu hình dễ mắc nhất của hệ thống này.

Không có worker thì phần còn lại của web vẫn chạy đủ; chỉ upload nhạc riêng là hỏng.

---

## 2. Biến môi trường

Danh sách đầy đủ kèm giải thích nằm trong `.env.example`. Phần này chỉ nói những điều
`.env.example` không nói được: cái nào bắt buộc ở đâu, và cái nào phải có mặt lúc **build**.

### 2.1. Đặt lúc BUILD, không phải lúc chạy

```
NEXT_PUBLIC_SITE_URL=https://ten-mien-that.vn
```

Mọi biến `NEXT_PUBLIC_*` được Next **nhúng thẳng vào bundle lúc `next build`**. Đặt nó
trong môi trường container lúc khởi động là vô tác dụng: giá trị đã đóng băng trong file
JavaScript từ lúc build. Với Docker, đặt bằng `--build-arg` / `ENV` **trước** khi
`next build` chạy.

Quên biến này không làm gì đổ vỡ lúc build. Hậu quả chỉ lộ ra khi ai đó dán link thiệp
lên Zalo/Facebook/iMessage: ảnh xem trước và `og:url` trỏ về `http://localhost:3000`.

### 2.2. Bắt buộc cho `apps/web` lúc chạy

| Biến | Ghi chú |
|---|---|
| `DATABASE_URL` | |
| `REDIS_URL` | Dùng cho cả rate-limit lẫn hàng đợi |
| `BULLMQ_PREFIX` | Phải trùng với worker. Để rỗng nếu chỉ có một môi trường |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Không có thì không ai đăng nhập được |
| `AUTH_TRUST_HOST=true` **hoặc** `AUTH_URL` | **Bắt buộc khi tự host sau reverse proxy/CDN.** `@auth/core` mặc định `trustHost: false` ở production; thiếu nó thì đăng nhập Google hỏng hoàn toàn. Vercel không cần (đã ngầm định) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` | |

### 2.2b. Xác định IP khách — đặt SAI là mất rate-limit

`x-forwarded-for` là một **danh sách người gọi tự mở đầu được**, mỗi proxy chỉ
*nối thêm* vào cuối. Ai cũng gửi được `X-Forwarded-For: 1.2.3.4`, nên entry đầu
tiên là do kẻ tấn công chọn. `lib/client-ip.ts` vì thế đếm **từ phải sang**, mỗi
hop một entry, và deployment phải tự khai mình đứng sau mấy lớp — `Request` của
Web không mang địa chỉ TCP nên không cách nào đoán được.

| Hạ tầng | Đặt | Hệ quả |
|---|---|---|
| Chạy trần, không proxy | `TRUSTED_PROXY_HOPS=0` | Không tin gì cả; mọi khách chung một bucket. Đúng về an toàn nhưng một kẻ phá là cả đám bị chặn — **đừng chạy public kiểu này** |
| Sau 1 reverse proxy | `TRUSTED_PROXY_HOPS=1` | Mặc định. Đúng với `docker-compose.prod.yml` |
| Cloudflare + proxy | `CLIENT_IP_HEADER=cf-connecting-ip` | Tốt hơn đếm hop: Cloudflare **ghi đè** header này mỗi request thay vì nối thêm |

**Cách kiểm sau khi deploy** — gửi một header giả và xem nó có bị tin không:

```bash
# Gửi 1 entry giả; sau 1 proxy thật, proxy sẽ nối IP thật vào SAU nó.
curl -s -X POST https://ten-mien-that.vn/api/invites/<slug>/wishes \
  -H 'content-type: application/json' -H 'x-forwarded-for: 1.2.3.4' \
  -d '{"name":"test","message":"test"}' -o /dev/null -w '%{http_code}\n'
```

Lặp lại quá hạn mức (xem `WISH_RATE_LIMIT`). Nếu **không bao giờ** bị `429` dù đổi
giá trị `x-forwarded-for` mỗi lần, cấu hình đang sai và rate-limit coi như không có.

### 2.3. Bắt buộc cho `apps/worker`

`DATABASE_URL`, `REDIS_URL`, `BULLMQ_PREFIX`, cả 5 biến `R2_*`, và `REMBG_URL`
(mặc định `http://127.0.0.1:7000`).

Worker **không** cần biến `AUTH_*` hay `NEXT_PUBLIC_*`.

### 2.4. `services/rembg`

Không cần biến nào. `U2NET_HOME` đổi được nơi cache model; Dockerfile đã đặt
sẵn `/app/models` và nướng model vào image.

---

## 3. Chạy worker trên production

### 3.1. Image phải có ffmpeg

Worker gọi `ffmpeg` và `ffprobe` qua `execFile`, tìm theo `PATH`. Image Node chính thức
**không** có sẵn hai binary này.

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

Kiểm tra nhanh trong container đang chạy:

```bash
ffmpeg -version && ffprobe -version
```

Thiếu ffmpeg, mọi job đều thất bại sau 3 lần thử và người dùng thấy thông báo lỗi —
không phải kẹt "Đang xử lý", nên hai triệu chứng này phân biệt được với nhau.

### 3.2. Phải exec trực tiếp, KHÔNG qua `pnpm start`

```dockerfile
CMD ["npx", "tsx", "src/index.ts"]
```

Lý do: `apps/worker/src/index.ts` bắt SIGTERM và đóng worker êm — chờ job đang chạy dở
kết thúc, tối đa 30 giây, rồi mới thoát. Việc đó chỉ xảy ra **nếu SIGTERM đến được đúng
tiến trình Node đó**.

Đã kiểm bằng tay: gửi tín hiệu thẳng cho tiến trình node thì handler chạy và thoát sạch;
`tsx` cũng chuyển tiếp tín hiệu gửi cho CLI wrapper của nó. Nhưng một lớp `pnpm start`
chen giữa thì **không** chuyển tiếp đáng tin cậy. Hậu quả: mỗi lần deploy, một ca chuyển
mã đang dở bị SIGKILL, job đó phải chạy lại từ đầu.

### 3.3. Đồng thời và tài nguyên

Một tiến trình worker phục vụ **hai** hàng đợi:

| Hàng đợi | Đồng thời | Vì sao |
|---|---|---|
| `audio-transcode` | 2 | ffmpeg bị giới hạn bởi CPU; rộng hơn chỉ làm mọi job chậm đi |
| `background-removal` | 1 | Suy luận ONNX đã tự trải trên nhiều lõi. Chạy hai ảnh cùng lúc không xong sớm hơn, chỉ nhân đôi bộ nhớ đỉnh (riêng model đã vài trăm MB) |

Mỗi job nhạc là một tiến trình ffmpeg con, giới hạn 120 giây và 4 MB buffer đầu ra.
Mỗi job xoá nền là một lời gọi HTTP sang `services/rembg`, cũng giới hạn 120 giây.
Cần thông lượng cao hơn thì chạy thêm tiến trình worker — chúng chia nhau cùng
hàng đợi, không cần cấu hình gì thêm.

Worker cần **đĩa tạm ghi được**: mỗi job tải file nguồn xuống một thư mục tạm, chuyển mã,
tải kết quả lên, rồi xoá thư mục đó trong khối `finally`. Ước lượng dung lượng cao điểm:
`2 × (file nguồn + file đã chuyển mã)` mỗi tiến trình.

---

## 4. Vòng đời một file nhạc

```
Người dùng chọn file
  → POST /api/uploads/audio
      ghi object nguồn:  u/{userId}/{assetId}-source.{mp3|m4a}
      tạo MediaAsset:    status = "pending"
      đẩy job vào queue "audio-transcode"
      đổi:               status = "processing"
  → worker nhận job
      tải nguồn về đĩa tạm
      ffmpeg → AAC 128 kbps, 2 kênh, 44.1 kHz, container .m4a
      ghi object đích:   u/{userId}/{assetId}.m4a
      đổi:               status = "ready", meta.durationSeconds
      XOÁ object nguồn   (chỉ khi thành công)
  → trình duyệt hỏi GET /api/media/{assetId} mỗi 2 giây, tối đa 120 giây
      status = "ready" → trả về url, phát được
```

Ý nghĩa cột `MediaAsset.status`:

| Giá trị | Nghĩa |
|---|---|
| `pending` | Đã ghi vào storage, chưa đẩy job được (hoặc vừa mới đẩy) |
| `processing` | Job đã nằm trong hàng đợi hoặc đang chạy |
| `ready` | Đã chuyển mã xong, `url` phát được |
| `failed` | Đã thử đủ 3 lần và thất bại; lý do nằm ở `meta.error` |

Ảnh **không** đi qua worker và được ghi thẳng với `status = "ready"`. Nếu cơ sở dữ liệu
của bạn có sẵn từ trước bản vá này, chạy một lần để dọn:

```sql
UPDATE "MediaAsset" SET status = 'ready' WHERE kind = 'image' AND status = 'pending';
```

Bỏ qua bước này thì truy vấn tìm asset kẹt ở mục 6 sẽ báo nhầm mọi ảnh cũ.

**File nguồn bị xoá sau khi chuyển mã thành công.** `meta.sourceKey` vẫn còn để
tra cứu, nhưng object tương ứng đã không còn — đó là bình thường, không phải mất
dữ liệu. Job **thất bại** thì nguồn được giữ lại, vì lần thử lại cần đọc nó.

`meta.error` **không bao giờ** được trả cho trình duyệt — nó có thể chứa đường dẫn nội bộ
và thông điệp của ffmpeg. Muốn đọc thì query thẳng database.

Job dùng 3 lần thử, backoff luỹ thừa từ 5 giây. Lịch sử giữ 100 job thành công gần nhất
và 500 job thất bại gần nhất — thất bại giữ lâu hơn vì đó là thứ duy nhất có người cần
đọc lại.

---

## 5. Sự cố: nhạc kẹt ở "Đang xử lý"

Người dùng báo đã tải nhạc lên nhưng mãi không phát được. Chạy theo thứ tự này.

### Bước 1 — Asset đang ở trạng thái nào?

```sql
SELECT id, "userId", status, meta->>'error' AS error, "createdAt"
FROM "MediaAsset"
WHERE kind = 'audio'
ORDER BY "createdAt" DESC
LIMIT 20;
```

- `failed` → **không phải kẹt**, đã thất bại thật. Đọc cột `error`, sang bước 5.
- `pending` → web không đẩy job vào hàng đợi được. Redis không thông từ phía web.
- `processing` mà không bao giờ đổi → job nằm trong hàng đợi nhưng không ai xử lý. Tiếp bước 2.

### Bước 2 — Worker có sống không?

```bash
# Log của worker khi khoẻ mạnh, mỗi job một dòng:
#   [worker] job 42 started queue=audio-transcode asset=... attempt=1
#   [worker] job 42 finished in 3184ms
```

Không có dòng nào kể từ lúc khởi động → worker chưa kết nối được Redis, hoặc đang xem một
prefix khác. Tiếp bước 3.

### Bước 3 — Web và worker có nhìn cùng một hàng đợi không?

Đây là nguyên nhân hay gặp nhất. So `BULLMQ_PREFIX` (và `REDIS_URL`) của **cả hai** tiến
trình — không phải file cấu hình, mà biến môi trường thật của tiến trình đang chạy.

```bash
# Liệt kê mọi hàng đợi thật sự tồn tại trong Redis:
redis-cli --scan --pattern '*:audio-transcode:*' | \
  sed 's/:audio-transcode:.*//' | sort -u
```

Kết quả trả về **hai** prefix khác nhau là xác nhận đúng bệnh: một bên đẩy, một bên đọc.
Sửa cấu hình cho khớp rồi khởi động lại cả hai. Job cũ trong prefix sai sẽ được xử lý
ngay khi có worker xem đúng prefix đó.

### Bước 4 — Hàng đợi đang chứa gì?

```bash
PREFIX=${BULLMQ_PREFIX:-bull}
redis-cli LLEN   "$PREFIX:audio-transcode:wait"    # chờ tới lượt
redis-cli LLEN   "$PREFIX:audio-transcode:active"  # đang chạy
redis-cli ZCARD  "$PREFIX:audio-transcode:failed"
redis-cli ZCARD  "$PREFIX:audio-transcode:delayed" # đang chờ retry
```

- `wait` lớn và không giảm → không đủ worker, hoặc worker chết. Xem lại bước 2.
- `active` lớn hơn `2 × số tiến trình worker` → có job "mồ côi": worker bị giết giữa chừng
  và không kịp trả job lại. BullMQ sẽ tự thu hồi sau khi hết hạn khoá; nếu không, khởi
  động lại worker.
- `delayed` lớn → đang backoff, tức là đang thất bại rồi thử lại. Sang bước 5.

Đọc chi tiết một job thất bại:

```bash
redis-cli ZREVRANGE "$PREFIX:audio-transcode:failed" 0 4          # lấy job id
redis-cli HGETALL   "$PREFIX:audio-transcode:<jobId>"             # xem failedReason
```

### Bước 5 — Đọc lý do thất bại

```sql
SELECT id, meta->>'error' FROM "MediaAsset" WHERE status = 'failed' ORDER BY "createdAt" DESC LIMIT 10;
```

Các lý do thường gặp:

| Dấu hiệu trong lỗi | Nguyên nhân |
|---|---|
| `ENOENT` / `spawn ffmpeg` | Image thiếu ffmpeg — mục 3.1 |
| `Invalid data found when processing input` | File người dùng không phải audio, hoặc hỏng. Đây là lỗi hợp lệ, không phải sự cố hệ thống |
| Hết 120 giây | File quá dài hoặc quá lớn. Cap upload là 15 MB |
| Lỗi từ S3/R2 | Sai khoá, sai bucket, hoặc storage đang gián đoạn |

### Bước 6 — Chạy lại một asset

Không có nút "thử lại" trong giao diện. Cách nhanh nhất là bảo người dùng tải lại file —
nó tạo asset mới và không đụng gì tới bản hỏng. Đừng sửa tay `status` về `processing`:
không có job nào trong hàng đợi tương ứng, nó sẽ kẹt mãi.

---

## 5b. Sự cố: ảnh kẹt ở "Đang xoá nền"

Song song với mục 5, nhưng có thêm một tiến trình nữa trong chuỗi.

### Bước 1 — `services/rembg` có sống không?

```bash
curl -s http://127.0.0.1:7000/health
# {"status":"ok","model":"isnet-general-use"}
```

Không trả lời → worker sẽ báo `ECONNREFUSED` trong `meta.error` sau 3 lần thử.
Trả lời nhưng **sai model** → ai đó đặt `REMBG_MODEL`; kết quả cắt sẽ khác.

### Bước 2 — worker có trỏ đúng địa chỉ không?

Log lúc khởi động của worker in ra địa chỉ nó sẽ gọi:

```
[worker] listening prefix=bull redis=... | "audio-transcode" concurrency=2, "background-removal" concurrency=1 (rembg at http://127.0.0.1:7000)
```

### Bước 3 — hàng đợi

Giống hệt mục 5 bước 4, chỉ đổi tên hàng đợi:

```bash
PREFIX=${BULLMQ_PREFIX:-bull}
redis-cli LLEN  "$PREFIX:background-removal:wait"
redis-cli LLEN  "$PREFIX:background-removal:active"
redis-cli ZCARD "$PREFIX:background-removal:failed"
```

### Bước 4 — đọc lý do

```sql
SELECT id, meta->>'error'
FROM "MediaAsset"
WHERE kind = 'image' AND status = 'failed'
ORDER BY "createdAt" DESC LIMIT 10;
```

| Dấu hiệu | Nguyên nhân |
|---|---|
| `ECONNREFUSED` / `fetch failed` | Service không chạy, hoặc `REMBG_URL` sai |
| `returned 400: not a decodable image` | File nguồn hỏng |
| `returned 413: image has too many pixels` | Ảnh vượt 24 megapixel |
| `The operation was aborted` | Quá 120 giây — service quá tải hoặc bị treo |
| `libGL.so.1` trong log của service | Image thiếu `libgl1` (xem Dockerfile) |

**Ảnh gốc luôn còn nguyên.** Xoá nền ghi ra một `MediaAsset` MỚI và không bao
giờ động vào bản gốc, nên một job hỏng không làm mất ảnh của ai cả — cặp đôi chỉ
cần bấm lại.

---

## 5c. Backup database và đường về

`pnpm backup:db` chạy `pg_dump --format=custom` rồi đẩy lên object storage,
giữ lại 14 bản mới nhất. `pnpm restore:db` là chiều ngược lại.

### Bucket riêng — không thương lượng

Bản dump **phải** nằm ở bucket khác bucket media, và script **từ chối chạy**
nếu `BACKUP_BUCKET` trùng `R2_BUCKET`. Lý do: `apps/web/scripts/init-bucket.mjs`
gắn policy cho phép ẩn danh `s3:GetObject` lên `<bucket>/*` — **mọi key**, không
phải theo tiền tố — vì trang thiệp nhúng thẳng URL ảnh và nhạc. Một file
pg_dump đặt trong đó là toàn bộ bảng `User`, mọi danh sách khách, mọi số điện
thoại và mọi số tài khoản ngân hàng, ai đoán trúng một tên file là tải được.
Không có tiền tố nào an toàn bên trong bucket đó.

Tạo bucket backup (một lần) và **đừng gắn policy công khai cho nó**. Kiểm lại
bằng cách tải thử không kèm khoá — phải ra `403`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$R2_ENDPOINT/$BACKUP_BUCKET/backups/<ten-file>.dump"
```

### Chạy hằng đêm

```cron
# 02:30 mỗi ngày, giờ máy chủ
30 2 * * * cd /srv/hpwd && /usr/bin/pnpm backup:db >> /var/log/hpwd-backup.log 2>&1
```

Script thoát **khác 0** khi hỏng, để cron gửi mail cho người trực. Ba tình
huống nó **không** upload gì và **không** xoá bản cũ nào:

- `pg_dump` thoát khác 0 (sai credential, DB chết).
- File tạo ra không bắt đầu bằng `PGDMP` — `pg_dump` có thể thoát 0 mà vẫn cho
  ra thứ vô dụng (dump nhầm database rỗng, hoặc luồng bị cắt). Một file **trông
  có vẻ đúng** trong bucket tệ hơn là không có file: đó chính là file người ta
  sẽ với tay lấy lúc sự cố, sau nhiều tháng được báo "backup vẫn chạy tốt".
- Xoá bản cũ chỉ chạy **SAU** khi upload thành công. Ngược lại thì một lần mạng
  chập làm mất bản cũ nhất mà không có bản mới thay thế.

### Khôi phục

```bash
pnpm restore:db --list                      # xem có những bản nào
pnpm restore:db backups/hpwd-....dump "postgresql://user:pass@host:5432/db_dich"
```

Đích **phải gõ tay**, không lấy từ `DATABASE_URL`. `pg_restore --clean` xoá rồi
tạo lại mọi object nó chạm tới; lấy mặc định từ môi trường nghĩa là một lần
chạy đãng trí xoá sạch production.

### Diễn tập — làm ít nhất một lần, trước khi cần

**Backup chưa từng restore thì không phải backup.** Vòng kiểm đầy đủ, an toàn
vì nó không đụng vào database đang chạy:

```bash
# 1. Tạo database nháp
psql "$DATABASE_URL" -c 'CREATE DATABASE hpwd_restore_check;'

# 2. Restore bản mới nhất vào đó
pnpm restore:db <key> "postgresql://postgres:postgres@localhost:5432/hpwd_restore_check"

# 3. So số hàng với bản gốc — phải khớp từng bảng
for db in hpwd hpwd_restore_check; do
  psql "postgresql://postgres:postgres@localhost:5432/$db" -t -A -c \
    'SELECT '"'"'User'"'"', count(*) FROM "User" UNION ALL SELECT '"'"'Invitation'"'"', count(*) FROM "Invitation";'
done

# 4. Xoá database nháp
psql "$DATABASE_URL" -c 'DROP DATABASE hpwd_restore_check;'
```

Đếm hàng thôi chưa đủ — mở thử một bản ghi có dấu tiếng Việt (một lời chúc
chẳng hạn) để chắc chắn encoding không bị hỏng.

---

## 5d. Giám sát

### `GET /api/health`

```json
{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok","worker":"ok","backgroundRemoval":"ok"}}
```

Mỗi mục đều **chạm thật** vào thứ nó gọi tên: `SELECT 1`, Redis `PING`,
`HeadBucket`, nhịp tim của worker, và `GET {REMBG_URL}/health`. Một endpoint trả `{"ok":true}` mà không
gọi gì là tệ hơn không có: nó báo xanh suốt sự cố mà người ta dựng nó lên để
bắt, và được tin tưởng chính vì có người đã nhớ thêm nó vào.

Body **không** chứa chi tiết lỗi (chuỗi kết nối, thông điệp driver, phiên bản)
— endpoint này không cần đăng nhập. Chi tiết nằm ở log máy chủ.

| Mã | Nghĩa |
|---|---|
| `200` | Instance này phục vụ được |
| `503` | DB, Redis hoặc storage hỏng |

**`backgroundRemoval` có ba giá trị, không phải hai:**

| Giá trị | Nghĩa | Có làm hỏng `?strict=1` không |
|---|---|---|
| `ok` | `REMBG_URL` đã đặt và service trả 2xx | Không |
| `fail` | `REMBG_URL` đã đặt nhưng service không trả lời | **Có** |
| `off` | `REMBG_URL` **không** đặt — bản deploy này không chạy rembg | Không |

`off` là cố ý. Máy dev chạy rembg bằng venv chứ không qua compose, và một bản
deploy nhỏ có quyền không chạy nó. Nếu thăm dò một service không ai cài thì
bảng điều khiển đỏ vĩnh viễn — và một monitor lúc nào cũng đỏ là monitor không
ai đọc. Khi `REMBG_URL` trống, health check **không gửi request nào cả**.

Muốn bật theo dõi rembg ở production thì đặt `REMBG_URL` cho **cả service
`web`** chứ không chỉ `worker` (`docker-compose.prod.yml` đã làm sẵn). Web
không bao giờ gọi rembg để làm việc — worker mới gọi — nhưng nó là tiến trình
duy nhất có endpoint cho monitor cắm vào.

**Hai người dùng, hai câu hỏi khác nhau:**

- **Readiness probe của container** → dùng `/api/health`. Worker chết **không**
  phải lý do để khởi động lại web.
- **Uptime monitor** → dùng `/api/health?strict=1`. Cờ này tính cả worker, vì
  worker chết là thứ **im lặng nhất** trong hệ: web vẫn xanh hoàn toàn, chỉ có
  mọi file upload nằm mãi ở "Đang xử lý" / "Đang xoá nền", và người báo đầu
  tiên là cặp đôi có bản nhạc không bao giờ hiện ra.

Worker ghi nhịp tim vào Redis mỗi 15 giây, hạn 60 giây (gấp 4 lần, để một bản
transcode dài hoặc một lần Redis chập không bị coi là chết). Lúc tắt sạch nó
**xoá** key luôn, nên một lần deploy không bị báo như sự cố.

Cấu hình monitor: gọi `/api/health?strict=1` mỗi 60 giây, báo động sau **2 lần
liên tiếp** hỏng (một lần đơn lẻ thường là lúc deploy).

### Những gì health check KHÔNG bắt được

Quan trọng không kém phần nó bắt được:

- **Hàng đợi ùn**. Worker sống nhưng chậm hơn tốc độ job đổ vào thì mọi mục đều
  xanh. Kiểm tay: `docker exec hpwd-redis redis-cli LLEN bull:audio-transcode:wait`.
- **`services/rembg` chết.** Không nằm trong health check. Triệu chứng là job
  xoá nền hỏng sau 120 giây timeout — xem mục 5b.
- **Đĩa đầy, chứng chỉ hết hạn, tên miền hết hạn.**
- **Dữ liệu sai.** Database trả lời không có nghĩa là nội dung đúng.

### Log

Log hiện ở dạng **người đọc được**, một dòng có tiền tố (`[worker] job <id> …`,
`[health] <mục> check failed: …`), đi ra stdout/stderr để `docker logs` hoặc
journald thu.

**Cố ý chưa chuyển sang JSON.** Log JSON chỉ đáng giá khi có thứ gì đó phân tích
nó; dự án chưa có hệ thống gom log nào, nên đổi bây giờ chỉ làm khó đúng người
đang đọc thật (con người, qua `docker logs`) để phục vụ một người dùng chưa tồn
tại. Khi nào chọn được nơi gom log thì đổi cùng lúc.

**Theo dõi lỗi (Sentry và tương tự) chưa có** — cần chủ dự án quyết, vì dự án
tới giờ tự host mọi thứ và đây sẽ là dịch vụ bên thứ ba đầu tiên nhận dữ liệu
của người dùng.

---

## 5e. Rate-limit: cái gì đang được giới hạn

| Route | Khoá theo | Giới hạn | Vì sao con số đó |
|---|---|---|---|
| `POST /api/invites/[slug]/wishes` | IP + slug | 5 / 60s | Khách ẩn danh |
| `POST /api/invites/[slug]/submissions` | IP + slug + section | 3 / 60s | Khách ẩn danh |
| `POST /api/uploads` (ảnh) | **user** | 500 / giờ | Spec cho 200 ảnh mỗi thiệp; phải lọt cả một album đầy, gấp đôi, mà cặp đôi không hề biết có giới hạn |
| `POST /api/uploads/audio` | **user** | 10 / giờ | Mỗi thiệp một bản nhạc; mỗi upload là một tiến trình ffmpeg |
| `POST /api/uploads/font` | **user** | 10 / giờ | Chạy file nhị phân lạ qua fontkit + wawoff2 |
| `POST /api/invitations` | **user** | 30 / giờ | Rẻ, nhưng vòng lặp vô hạn là một bảng không ai đọc nổi |
| `POST /api/images/background-removal` | **user** | 100 / giờ | rembg chạy concurrency 1 — đây là route duy nhất một người dùng có thể làm đói job của tất cả người khác |

Bốn route cuối **trước Phase 4 không có giới hạn nào**. "Đã đăng nhập" không
phải rào cản: tài khoản Google miễn phí và vô hạn.

Khoá theo **user chứ không theo IP** với các route đã đăng nhập: sau NAT của
nhà mạng — chuyện mặc định ở Việt Nam — khoá theo IP khiến hai cặp đôi không
quen biết dùng chung hạn mức.

Tất cả đều **fail open** khi Redis lỗi. Đây là ảnh cưới của chính họ; một lần
hạ tầng chập không được phép chặn họ làm thiệp.

### Trần TỔNG mỗi tài khoản — khác với giới hạn theo giờ

Bảng trên giới hạn **tốc độ**. Nó không giới hạn **tổng**: 500 ảnh/giờ là
12.000 ảnh/ngày, mỗi ngày, mãi mãi. Dự án này tự lưu trữ object storage nên
hoá đơn rơi vào người vận hành.

| Loại | Trần | Vì sao con số đó |
|---|---|---|
| ảnh | 5.000 | Mười album 200 ảnh đầy, cộng phần thay ảnh (ảnh cũ không bị xoá) và "Xoá nền" (luôn tạo asset MỚI, không ghi đè) |
| nhạc | 100 | Mỗi thiệp một bản, mỗi bản tối đa 15MB |
| font | 50 | Hai họ font × hai độ đậm đã là dư dả |

Kiểm trước khi đọc body, trên cả 4 route tạo `MediaAsset` — kể cả
background-removal, vốn không mang tên "upload" nhưng làm số asset tăng y hệt.

Hai điều nó **cố ý không phải**:

- **Không chính xác tuyệt đối.** Hai upload chạy song song có thể cùng đọc
  `trần - 1` và cùng lọt. Làm cho chính xác cần transaction trên đường đi
  nóng của mọi upload; trần này để chặn vòng lặp vô hạn, lệch vài cái không
  thay đổi điều đó.
- **Không fail open.** Khác `rateLimitUser`. Nó đếm hàng trong **đúng database**
  mà upload sắp ghi `MediaAsset` vào — nuốt lỗi chỉ dời thất bại sang chỗ khó
  hiểu hơn.

Thông điệp nói **đúng con số** và chỉ đề nghị việc người ta làm được. Hiện
**không có route nào xoá ảnh đã upload**, nên thông điệp ảnh không gợi ý xoá
ảnh (có test chặn điều này). Font thì có, vì `DELETE /api/fonts/[assetId]` tồn
tại. Muốn nới trần: sửa `USER_ASSET_CAPS` trong
`apps/web/src/lib/storage-quota.ts`.

Mã trả về là `429` chứ không phải `403`, vì bất biến của dự án là không route
nào trả 403, và `429` là thứ client đã xử lý sẵn cho các route này.

**Cách kiểm nhanh** (thay `<cookie>` bằng session thật):

```bash
for i in $(seq 1 33); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST https://ten-mien/api/invitations \
    -H "Cookie: authjs.session-token=<cookie>" -H 'content-type: application/json' -d 'not-json'
done
```

Đúng 30 lần `400` (body sai, giới hạn kiểm TRƯỚC khi parse nên không tạo gì)
rồi `429`. Nếu không bao giờ thấy `429`, giới hạn đang không chạy.

---

## 5f. Load test trang thiệp

Đo ngày 2026-09-18, `next start` bản production, `/i/demo`, **máy đo và máy
chạy là một** (MacBook, dev stack Docker cùng chỗ). Con số để so sánh tương
đối, **không phải để hứa với ai**.

| Đồng thời | req/s | p50 | p95 | p99 | lỗi |
|---|---|---|---|---|---|
| 10 | 47.8 | 192 ms | 337 ms | 531 ms | 0 |
| 25 | 59.1 | 425 ms | 476 ms | 533 ms | 0 |
| 50 | 58.3 | 841 ms | 1139 ms | 1365 ms | 0 |
| 100 | 57.1 | 1726 ms | 2050 ms | 2470 ms | 0 |

Đọc bảng này:

- **Bão hoà quanh 58–59 req/s** và không nhúc nhích dù tăng đồng thời — nghẽn
  ở CPU render, không phải ở kết nối.
- **Không có request nào hỏng** ở mọi mức, kể cả 100 đồng thời. Quá điểm bão
  hoà thì độ trễ tăng tuyến tính chứ không đổ vỡ.
- Điểm gãy nằm quanh **đồng thời 20–25**. Trên mức đó khách vẫn xem được
  thiệp, chỉ chậm hơn.
- Để dễ hình dung: 300 khách cùng mở thiệp trong một phút ≈ **5 req/s**. Còn
  rất xa giới hạn. 3.000 người trong một phút ≈ 50 req/s, tức là sát.

Chạy lại:

```bash
node scripts/loadtest.mjs http://127.0.0.1:3100/i/demo 25 400
```

---

## 5g. Hiệu năng trang thiệp — những con số và lý do

Trang khách (`/i/[slug]`) là thứ 300 người tải trong một buổi chiều. Mọi mục
dưới đây đã đo thật, và mục nào đo ra **không cải thiện** thì cũng ghi lại
đúng như vậy để người sau khỏi thử lại.

### Ảnh: `deviceSizes` gắn với cột 430px

Thiệp là một cột rộng tối đa **430px**, và mọi `sizes` trong app đều bị chặn
bởi nó. Nên số pixel lớn nhất một trình duyệt cần là 430 × 3 = **1290**.

Thang mặc định của Next nhảy 1200 → 1920. Máy 430px ở DPR3 (iPhone Pro Max)
cần 1290 nên phải lấy 1920. Đo trên ảnh nguồn 1600×1600 (840.264 byte):

| Nấc | Byte | Ai dùng |
|---|---|---|
| 1200 | 152.036 | máy 390px @3x — đã đủ, không đổi |
| **1440** | **244.346** | **nấc mới: máy 430px @3x** |
| 1920 | 593.014 | trước đây máy 430px phải lấy cái này |

`processImage` cắt ảnh lưu ở 1600px và bộ tối ưu **không phóng to**, nên
1920 / 2048 / 3840 là ba tên gọi của cùng một thứ — đã bỏ 2048 và 3840.

**Sửa `deviceSizes` khi và chỉ khi bố cục đổi chiều rộng.** Thêm nấc thừa là
thêm biến thể server phải sinh và lưu.

### Ảnh: `minimumCacheTTL` 31 ngày

Ảnh đã upload là **bất biến**: `/api/uploads` ghi object mới với key mới mỗi
lần, đổi ảnh là đổi URL trong document chứ không ghi đè byte, xoá nền tạo
asset MỚI. Nên biến thể trong cache không bao giờ cũ được, và mặc định 60
giây của Next đang vứt đi đúng thứ nó sắp phải làm lại.

    resize ảnh 1600×1600:  248 ms lạnh  →  2,8 ms ấm   (90×)
    LCP cùng trang:       1343 ms lạnh  →   722 ms ấm

**Cảnh báo triển khai:** cache ảnh nằm trong `.next/cache/images` **bên
trong container**. `docker compose down` là mất sạch, và người khách đầu
tiên sau mỗi lần deploy trả lại 248 ms đó. Nếu điều này thành vấn đề thì gắn
volume cho thư mục ấy.

### Ảnh bìa là phần tử LCP

`CoverSection` đặt `priority` **và** `fetchPriority="high"`. Cần cả hai:
`priority` bỏ lazy-load và sinh preload, nhưng **Next 15.5 không đặt
`fetchpriority` lên link preload lẫn thẻ `<img>`** — Chrome báo đó là một
kiểm tra thất bại và request đi ra ở mức ưu tiên Low.

### Mã QR

`react-qr-code` vẽ **một sub-path cho mỗi ô**, cả ô đen lẫn ô trắng. Hai mã
QR ngân hàng từng là 70% trang. Nay là `<rect>` + path mã hoá độ dài chạy
(`lib/qr-svg.ts`): `/i/demo` thô 123.212 → 49.354 byte, gzip 21.111 → 12.566.

### Truy vấn

`/i/[slug]` đọc database **một lần** mỗi lượt xem, không phải hai:
`generateMetadata` và page component dùng chung `loadInvitationBySlug` bọc
trong `cache()` của React. Đó là gộp theo REQUEST, không phải cache — hai
khách khác nhau vẫn đọc mới.

### Những thứ ĐÃ THỬ VÀ BỎ (đừng làm lại)

| Thử | Kết quả đo |
|---|---|
| `fetchPriority="high"` trên `<img>` ảnh bìa (Phase 4) | Không đổi — nhưng phép thử chạy trên `/i/demo` **không có ảnh bìa**, nên vô nghĩa. Nay đã làm lại cho đúng. |
| `<link rel=preload>` ảnh bìa thủ công (Phase 4) | 1223 → 1238 ms, không cải thiện |
| Thu nhỏ HTML mã QR 60% | LCP 723 → 753 ms, **không đổi** — QR nằm cuối tài liệu, byte của nó về sau khi LCP đã vẽ |
| `priority` + `fetchPriority` ảnh bìa | LCP 722 → 746 ms, không đổi trên localhost; nhưng kiểm tra LCP-discovery của Chrome từ 1/3 thất bại thành đạt cả 3 |

### Tách mã: TipTap ra khỏi lượt tải đầu của editor

Đo từ build manifest chứ không đoán: `/editor/[id]` tải **341 kB** trước khi
vẽ, và **159 kB** trong đó là TipTap + ProseMirror, nằm rải ở ba chunk.

Đúng **một** trong mười panel cần nó, và `selectedSectionId` khởi đầu là
`null` nên không panel nào render cho tới khi cặp đôi bấm chọn một section.

    /editor/[id]   342 kB -> 213 kB First Load JS   (-38%)
    riêng trang    180 kB -> 51,7 kB
    chunk tiptap trong lượt tải đầu:  3 -> 0

Trang khách **không bị ảnh hưởng và chưa bao giờ bị**: `TextSection` chỉ ghi
HTML đã sanitize, không đụng TipTap.

`ParticlesOverlay` cũng tách tương tự (chỉ render **sau khi** khách mở
thiệp): `/i/[slug]` 162 → 161 kB. Một kilobyte — giữ vì nó miễn phí và đúng
về kiến trúc, không phải vì nó là thành tựu.

### Nén: `encode zstd gzip` trong Caddyfile gần như VÔ TÁC DỤNG

Next có `compress: true` mặc định và tự gzip mọi response, còn Caddy **không
nén lại** body đã có `Content-Encoding`. Nên khách nhận gzip của Next, và
dòng đó chỉ áp cho những gì Caddy phục vụ trực tiếp.

Đo trên JavaScript lượt tải đầu của trang khách (526.197 byte chưa nén):

| Cách nén | Byte | |
|---|---|---|
| gzip -9 | 161.710 | Next đang gửi cái này |
| zstd -3 | 166.776 | mặc định nhanh của Caddy — **TO HƠN** gzip |
| zstd -9 | 153.490 | |
| zstd -19 | 147.980 | |

Nên thay đổi hiển nhiên là **sai**: bỏ nén ở Next để Caddy nén, ở mức mặc
định, sẽ làm response **to hơn**. Muốn lấy 8 kB kia cần **cả hai**:
`compress: false` trong `next.config.ts` **và** `encode zstd 9` ở đây — hai
thiết lập ở hai file phải khớp nhau, mà lệch nhau nghĩa là mọi response đi ra
**không nén** kể từ ngày ai đó deploy container web mà không có proxy này.
Không đáng đổi lấy 5%.

### Đòn bẩy còn lại: 161 kB JavaScript

Sau tất cả, LCP còn ~530–570 ms **load delay** — ảnh xếp hàng sau JavaScript
trên đường truyền hẹp. Đó là vấn đề JS, không phải vấn đề ảnh.

    /i/[slug] First Load JS   161 kB
      React core              54,2 kB
      chunk chung Next        46,3 kB
      framer-motion           36,9 kB   <- 23%
      mã ứng dụng             23,6 kB

framer-motion chỉ làm fade/slide/zoom khi cuộn và 5 hiệu ứng mở màn — CSS
transition làm được hết. **Nhưng kết quả của việc đó không kiểm được bằng
máy**: chất lượng hiệu ứng là mục "chỉ người làm được" trong HANDOFF, và
đường mở màn là nơi một lỗi nghĩa là khách không mở được thiệp. Có một bẫy
đã biết: `transitionend` **không bắn** khi duration = 0, tức là đúng nhánh
`prefers-reduced-motion`. Làm thì làm riêng, có người cầm điện thoại thật
kiểm.

## 6. Vài lệnh hay dùng

```bash
# Số asset theo trạng thái
psql "$DATABASE_URL" -c "SELECT status, count(*) FROM \"MediaAsset\" WHERE kind='audio' GROUP BY status;"

# Asset pending/processing quá 10 phút — gần như chắc chắn là kẹt
psql "$DATABASE_URL" -c "SELECT id, status, \"createdAt\" FROM \"MediaAsset\" WHERE kind='audio' AND status IN ('pending','processing') AND \"createdAt\" < now() - interval '10 minutes';"

# Redis đang phục vụ ai (rate-limit và hàng đợi dùng chung một instance)
redis-cli INFO keyspace
```

---

## 6b. Image và compose production

```
apps/web/Dockerfile        multi-stage, output standalone, chạy bằng user không phải root
apps/worker/Dockerfile     có sẵn ffmpeg, exec thẳng tsx (không qua pnpm)
services/rembg/Dockerfile  đã có từ Phase 3, nướng sẵn model
docker-compose.prod.yml    web + worker + rembg + postgres + redis + Caddy
deploy/Caddyfile           TLS tự động, ghi đè x-forwarded-for
```

Khác `docker-compose.dev.yml` ở ba điểm **không phải chỉ đổi mật khẩu**:

1. **Chỉ reverse proxy mở cổng.** Postgres, Redis, rembg nằm trong mạng nội bộ,
   không bind ra host. File dev bind `127.0.0.1` cho tiện; ở đây thì không có gì cả.
2. **Caddy GHI ĐÈ `x-forwarded-for`** (`header_up X-Forwarded-For {remote_host}`)
   chứ không nối thêm. Đây chính là điều làm `TRUSTED_PROXY_HOPS=1` trở thành
   **đúng**: danh sách chỉ có một entry và nó do ta ghi. Mặc định của Caddy là
   giữ lại phần khách gửi rồi nối vào, tức là để lại giá trị kẻ tấn công chọn.
3. **Không có mật khẩu mặc định nào.** Thiếu biến là compose **báo lỗi ngay**,
   không âm thầm chạy với giá trị rỗng.

### Build

```bash
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_SITE_URL=https://ten-mien-that.vn \
  --secret id=corp_ca,src=.certs/corp-ca.pem \
  -t hpwd-web .
```

`--secret id=corp_ca` **chỉ cần trên máy sau proxy TLS của công ty**:
`prisma generate` tải engine từ `binaries.prisma.sh` và sẽ lỗi "self-signed
certificate in certificate chain". Cách đúng là **tin CA của proxy trong đúng
lệnh đó** — tuyệt đối không tắt xác thực. Dùng secret mount nên chứng chỉ
không nằm lại trong bất kỳ layer nào của image; máy không có proxy thì bỏ cờ
này đi, build vẫn chạy.

### ⚠️ Image CHƯA từng build thành công ở đâu cả

Viết xong nhưng **chưa chứng minh**. Trên máy dev, lần thử đã:

- ăn 6 GB đĩa vì repo **không có `.dockerignore`** (nay đã có: `node_modules`
  và `.pnpm-store` đi thẳng vào build context);
- vẫn tốn ~3 GB mỗi lần thử sau đó, và **làm Docker Desktop sập** khi đĩa
  xuống 4 GB. Ổ dữ liệu máy này thường chỉ còn trên dưới 10 GB.

CI (`.github/workflows/ci.yml`, job `images`) build cả ba image — runner có đủ
đĩa và không có proxy TLS. **Nhưng repo chưa có remote nên CI chưa bao giờ
chạy.** Đừng coi Dockerfile là đã kiểm cho tới khi thấy job đó xanh.

---

## 7. Điểm cần biết trước khi deploy lần đầu

- **Migration**: chạy `prisma migrate deploy` trước khi khởi động web bản mới.
- **Ảnh**: không có worker nào tham gia. `/api/uploads` xử lý sharp ngay trong tiến trình
  web — sinh WebP 400/800/1600 và ảnh blur thật — nên tiến trình web cần đủ RAM cho sharp
  (cap upload 10 MB + 1 MB margin).
- **Bucket phải cho đọc công khai**: thiệp trỏ thẳng vào `R2_PUBLIC_URL`. Nhạc đã chuyển
  mã cũng vậy — bất kỳ ai có link thiệp đều tải được file nhạc. Điều này đã nêu trong
  chính sách bảo mật.
- **Rate-limit fail-open**: mất Redis thì rate-limit cho qua hết thay vì chặn hết. Web vẫn
  chạy, nhưng form công khai không còn được bảo vệ — cảnh báo khi Redis down.
