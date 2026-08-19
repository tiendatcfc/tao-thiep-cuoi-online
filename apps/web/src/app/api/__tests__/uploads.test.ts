import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as every other route test in this directory: `auth()` is
// mocked because there's no real browser session when calling route
// handlers directly. `processAndStoreImage` is mocked for every case except
// the "garbage bytes" one below, which restores the real implementation to
// prove sharp's own decode failure (not a stub) drives the 400 — see that
// test for why `ImageDecodeError` still round-trips correctly through a
// module partially replaced by `vi.mock`.
const { authMock, processAndStoreImageMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  processAndStoreImageMock: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/upload")>();
  return { ...actual, processAndStoreImage: processAndStoreImageMock };
});

import { POST } from "../uploads/route";

function makeFile(name: string, type: string, bytes: Uint8Array<ArrayBuffer> | string): File {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return new File([data], name, { type });
}

function multipartRequest(file: File | null, fieldName = "file"): Request {
  const form = new FormData();
  if (file) form.append(fieldName, file);
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}

// Mirrors route.ts's MAX_UPLOAD_SIZE_BYTES (10MB) + CONTENT_LENGTH_MARGIN_BYTES
// (1MB) + 1 — the smallest declared length the content-length pre-check
// should reject.
const OVERSIZE_CONTENT_LENGTH = 11 * 1024 * 1024 + 1;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  processAndStoreImageMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/uploads", () => {
  it("401s before ever touching the body when unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(multipartRequest(makeFile("a.jpg", "image/jpeg", "x")));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Bạn cần đăng nhập để tải ảnh lên." });
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("400s a non-multipart body", async () => {
    const res = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "image" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dữ liệu gửi lên không hợp lệ." });
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("400s a multipart body with no file field", async () => {
    const res = await POST(multipartRequest(null));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dữ liệu gửi lên không hợp lệ." });
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("400s a disallowed content type", async () => {
    const res = await POST(multipartRequest(makeFile("a.gif", "image/gif", "x")));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Định dạng ảnh phải là JPEG, PNG hoặc WebP." });
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("400s a file over 10MB without ever calling processAndStoreImage", async () => {
    // Unlike ImageField's jsdom tests (which never really serialize the
    // File), this Request round-trips through actual multipart
    // encoding/parsing — a `size` override via defineProperty doesn't
    // survive that, so this needs real bytes over the cap.
    const big = makeFile("big.jpg", "image/jpeg", new Uint8Array(11 * 1024 * 1024));

    const res = await POST(multipartRequest(big));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Kích thước ảnh tối đa là 10MB." });
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("400s a too-large content-length header alone, before the multipart body is ever parsed", async () => {
    // `request.formData()` makes undici buffer the ENTIRE body into memory
    // before `file.size` can be read — so without a pre-check on the
    // declared length, an authenticated client could push an arbitrarily
    // large body into RAM before ever getting rejected. Stubbing formData()
    // to throw proves the route never calls it once this header alone is
    // enough to reject: if the mutation under test removed the pre-check,
    // this stub firing would blow up the request instead of quietly
    // returning the same 400 the real file.size check would have produced.
    const req = new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: { "content-length": String(OVERSIZE_CONTENT_LENGTH) },
    });
    const formDataSpy = vi.spyOn(req, "formData").mockImplementation(() => {
      throw new Error("formData() must never be called once the content-length pre-check rejects");
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Kích thước ảnh tối đa là 10MB." });
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(processAndStoreImageMock).not.toHaveBeenCalled();
  });

  it("does not reject a legitimate near-cap upload merely for multipart boundary overhead in content-length", async () => {
    processAndStoreImageMock.mockResolvedValue({
      url: "http://localhost:9000/hpwd/u/user-1/asset-2-1600.webp",
      width: 3000,
      height: 2000,
      blurDataUrl: "data:image/webp;base64,AAA",
      assetId: "asset-2",
    });
    // Real bytes just under the 10MB cap — the actual multipart-encoded
    // content-length (file bytes + boundary/header overhead) is a little
    // larger than this, but must still land well under the 1MB margin.
    const nearCap = makeFile("near-cap.jpg", "image/jpeg", new Uint8Array(10 * 1024 * 1024 - 1024));

    const res = await POST(multipartRequest(nearCap));

    expect(res.status).toBe(200);
    expect(processAndStoreImageMock).toHaveBeenCalled();
  });

  it("falls through to the exact file.size check (not the pre-check) when content-length is missing", async () => {
    const big = makeFile("big.jpg", "image/jpeg", new Uint8Array(11 * 1024 * 1024));
    const req = multipartRequest(big);
    // Simulate a missing/unparseable content-length header without
    // disturbing any other header lookup the real formData() parse needs.
    const originalGet = req.headers.get.bind(req.headers);
    vi.spyOn(req.headers, "get").mockImplementation((name: string) =>
      name.toLowerCase() === "content-length" ? null : originalGet(name),
    );
    const formDataSpy = vi.spyOn(req, "formData");

    const res = await POST(req);

    // Still rejected — but only because file.size caught it after a real
    // parse, proving the missing header didn't short-circuit anything.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Kích thước ảnh tối đa là 10MB." });
    expect(formDataSpy).toHaveBeenCalled();
  });

  it("400s garbage bytes that aren't a decodable image (real sharp, no mock)", async () => {
    const real = await vi.importActual<typeof import("@/lib/upload")>("@/lib/upload");
    processAndStoreImageMock.mockImplementation(real.processAndStoreImage);

    const garbage = makeFile("not-an-image.jpg", "image/jpeg", "this is definitely not image bytes");
    const res = await POST(multipartRequest(garbage));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tệp không phải là ảnh hợp lệ, vui lòng thử lại." });
  });

  it("returns url/width/height/blurDataUrl/assetId on the happy path", async () => {
    processAndStoreImageMock.mockResolvedValue({
      url: "http://localhost:9000/hpwd/u/user-1/asset-1-800.webp",
      width: 1200,
      height: 800,
      blurDataUrl: "data:image/webp;base64,AAA",
      assetId: "asset-1",
    });

    const file = makeFile("photo.jpg", "image/jpeg", "fake-bytes");
    const res = await POST(multipartRequest(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "http://localhost:9000/hpwd/u/user-1/asset-1-800.webp",
      width: 1200,
      height: 800,
      blurDataUrl: "data:image/webp;base64,AAA",
      assetId: "asset-1",
    });
    expect(processAndStoreImageMock).toHaveBeenCalledWith({
      userId: "user-1",
      buffer: expect.any(Buffer),
      sourceContentType: "image/jpeg",
    });
  });

  it("maps a non-decode failure (e.g. storage down) to a logged 500 with the generic message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    processAndStoreImageMock.mockRejectedValue(new Error("S3 unreachable"));

    const file = makeFile("photo.jpg", "image/jpeg", "fake-bytes");
    const res = await POST(multipartRequest(file));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Không thể tải ảnh lên, vui lòng thử lại." });
    expect(consoleError).toHaveBeenCalled();
  });
});
