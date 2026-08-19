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
