// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const fetchMock = vi.fn();

import { UseTemplateButton } from "../UseTemplateButton";

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("UseTemplateButton", () => {
  it("POSTs {templateId} to /api/invitations and navigates to the new invitation's editor on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "inv-123" }) });

    render(<UseTemplateButton templateId="template-toi-gian" />);
    fireEvent.click(screen.getByRole("button", { name: "Dùng mẫu này" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/editor/inv-123"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateId: "template-toi-gian" }),
      }),
    );
  });

  it("shows a Vietnamese error and does not navigate when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });

    render(<UseTemplateButton templateId="template-toi-gian" />);
    fireEvent.click(screen.getByRole("button", { name: "Dùng mẫu này" }));

    await waitFor(() =>
      expect(screen.getByText("Không thể tạo thiệp từ mẫu này, vui lòng thử lại.")).toBeInTheDocument(),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
