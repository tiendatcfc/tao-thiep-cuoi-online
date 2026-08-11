// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageField } from "../ImageField";

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function makeFile(name: string, sizeBytes: number, type: string): File {
  const file = new File([new Uint8Array(Math.max(sizeBytes, 1))], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("ImageField", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the Vietnamese label and a file input accepting the allowed image types", () => {
    render(<ImageField label="Ảnh bìa" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Ảnh bìa") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  });

  it("shows a preview thumbnail when a value is already set", () => {
    render(<ImageField label="Ảnh bìa" value="https://cdn.test/cover.jpg" onChange={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Ảnh bìa" })).toHaveAttribute("src", "https://cdn.test/cover.jpg");
  });

  it("rejects a file over 10MB without ever calling fetch", async () => {
    const onChange = vi.fn();
    render(<ImageField label="Ảnh bìa" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Ảnh bìa") as HTMLInputElement;
    const big = makeFile("big.jpg", 11 * 1024 * 1024, "image/jpeg");

    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => {
      expect(screen.getByText("Kích thước ảnh tối đa là 10MB.")).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a disallowed content type without calling fetch", async () => {
    const onChange = vi.fn();
    render(<ImageField label="Ảnh bìa" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Ảnh bìa") as HTMLInputElement;
    const gif = makeFile("anim.gif", 1024, "image/gif");

    fireEvent.change(input, { target: { files: [gif] } });

    await waitFor(() => {
      expect(screen.getByText("Định dạng ảnh phải là JPEG, PNG hoặc WebP.")).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads the happy path: POST /api/uploads then PUT to the signed URL, then stores publicUrl", async () => {
    const onChange = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          uploadUrl: "https://storage.test/signed-put",
          publicUrl: "https://cdn.test/u/abc.jpg",
          assetId: "abc",
        }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    render(<ImageField label="Ảnh bìa" value="" onChange={onChange} />);
    const input = screen.getByLabelText("Ảnh bìa") as HTMLInputElement;
    const file = makeFile("cover.jpg", 1024, "image/jpeg");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://cdn.test/u/abc.jpg"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [postUrl, postInit] = fetchMock.mock.calls[0];
    expect(postUrl).toBe("/api/uploads");
    expect(JSON.parse(postInit.body)).toEqual({ kind: "image", contentType: "image/jpeg", sizeBytes: 1024 });

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe("https://storage.test/signed-put");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["Content-Type"]).toBe("image/jpeg");
    expect(putInit.body).toBe(file);
  });

  it("shows a Vietnamese failure message when the PUT fails, and does not call onChange", async () => {
    const onChange = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { uploadUrl: "https://storage.test/signed-put", publicUrl: "https://cdn.test/x.jpg", assetId: "x" }),
      )
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    render(<ImageField label="Ảnh bìa" value="" onChange={onChange} />);
    const file = makeFile("cover.jpg", 1024, "image/jpeg");
    fireEvent.change(screen.getByLabelText("Ảnh bìa"), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Không thể tải ảnh lên, vui lòng thử lại.")).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the value when the remove button is clicked", () => {
    const onChange = vi.fn();
    render(<ImageField label="Ảnh bìa" value="https://cdn.test/cover.jpg" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Xoá ảnh" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
