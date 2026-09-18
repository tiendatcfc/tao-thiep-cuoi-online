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
