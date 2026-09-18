# services/rembg — xoá nền ảnh bằng AI

Microservice Python (FastAPI + [rembg](https://github.com/danielgatis/rembg), model
`isnet-general-use`, chạy CPU). Nhận ảnh, trả PNG có kênh alpha.

Dành cho người phát triển và người triển khai HPWD.

---

## Service này KHÔNG làm gì

Đây là điểm quan trọng nhất về bảo mật của nó, nên nói trước:

- **Không có khoá, không có database, không chạm vào kho lưu trữ.** `apps/worker`
  giữ toàn bộ những thứ đó và gọi sang đây bằng bytes thô.
- **Không nhận URL để tự tải ảnh về.** Nhận URL sẽ biến nó thành công cụ SSRF
  (tấn công yêu cầu phía máy chủ) tiếp cận được từ luồng upload công khai —
  đúng loại lỗ mà `-protocol_whitelist file` đã bịt cho worker xử lý nhạc.
- **Không được phơi ra Internet.** Chỉ worker mới được gọi; service không có
  cơ chế xác thực nào của riêng nó.

Hệ quả: kẻ chiếm được service này nhiều nhất chỉ lấy được thời gian CPU.

---

## API

| Endpoint | Việc |
|---|---|
| `GET /health` | `{"status":"ok","model":"isnet-general-use"}` |
| `POST /remove-background` | multipart, trường **`file`** → PNG có alpha |

Giới hạn (kiểm **trước** khi model chạy):

- 10 MB mỗi ảnh — khớp cap của `/api/uploads`.
- 24 megapixel — chặn "bom giải nén": một file PNG 40 KB có thể khai báo
  30000×30000 và tốn hàng gigabyte để giải mã.

Mã lỗi: `400` ảnh không giải mã được hoặc body rỗng, `413` quá lớn hoặc quá
nhiều điểm ảnh, `422` sai tên trường multipart.

---

## Chạy ở máy dev (venv, không cần Docker)

Cách này được chọn thay vì Docker vì ổ đĩa máy dev từng đầy 100%; image
PyTorch/ONNX tốn khoảng 2 GB, venv chỉ khoảng 730 MB.

```bash
cd services/rembg
python3.11 -m venv .venv          # cần Python >= 3.10
./.venv/bin/pip install -r requirements.txt
```

**Nếu máy bạn có proxy TLS của công ty**, lần chạy đầu phải tải model 170 MB từ
GitHub và sẽ lỗi chứng chỉ. **Không bao giờ tắt xác thực TLS.** Cách đúng là
ghép CA của công ty vào bộ gốc công khai (`SSL_CERT_FILE` *thay thế* bộ gốc chứ
không bổ sung, nên chỉ trỏ vào CA công ty sẽ hỏng):

```bash
./.venv/bin/python -c "
import certifi, pathlib
corp = pathlib.Path('../../.certs/corp-ca.pem').read_text()
public = pathlib.Path(certifi.where()).read_text()
pathlib.Path('.venv/combined-ca.pem').write_text(public.rstrip() + '\n' + corp)
"
export SSL_CERT_FILE=$PWD/.venv/combined-ca.pem
export REQUESTS_CA_BUNDLE=$SSL_CERT_FILE
```

Chạy:

```bash
./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 7000
```

Model được cache ở `~/.u2net/` (đổi bằng biến `U2NET_HOME`), **ngoài repo** —
xoá `.venv` không làm mất model.

Worker tìm service qua `REMBG_URL` (mặc định `http://127.0.0.1:7000`).

## Test

```bash
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python -m pytest -q
```

Test chạy **model thật**, không mock. Chậm (lần gọi đầu vài giây để nạp đồ thị
ONNX) nhưng đó là thứ duy nhất đáng kiểm ở đây: service chỉ là vài chục dòng
kiểm tra đầu vào bọc quanh `rembg`, nên mock `remove` sẽ chẳng còn gì để kiểm —
và khẳng định thật sự quan trọng, rằng nền đã trong suốt, thì không mock được.

## Production

```bash
docker build -t hpwd-rembg services/rembg
```

Dockerfile **nướng sẵn model vào image**. Nếu không, cặp đôi đầu tiên bấm
"Xoá nền" sau mỗi lần deploy phải chờ tải 170 MB, mỗi replica tải một bản, và
service chỉ cách một sự cố của GitHub là hỏng.

Chạy trên mạng nội bộ, **không map cổng ra ngoài**. Xem `docs/operations.md`
mục 5 để chẩn đoán khi ảnh kẹt ở "Đang xoá nền".
