// @vitest-environment jsdom
import { InvitationDocumentSchema, createDefaultDocument } from "@hpwd/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editor-store";
import { ThemePanel } from "../ThemePanel";

beforeEach(() => {
  useEditorStore.setState({
    document: createDefaultDocument(),
    selectedSectionId: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
  });
});

describe("ThemePanel", () => {
  it("renders the current theme colors and fonts", () => {
    render(<ThemePanel />);
    expect(screen.getByLabelText("Mã màu Màu chủ đạo")).toHaveValue(useEditorStore.getState().document.theme.primary);
    expect(screen.getByLabelText("Font tiêu đề")).toHaveValue(useEditorStore.getState().document.theme.headingFont);
  });

  it("choosing a new heading font updates the store via updateTheme", () => {
    render(<ThemePanel />);
    fireEvent.change(screen.getByLabelText("Font tiêu đề"), { target: { value: "Dancing Script" } });
    expect(useEditorStore.getState().document.theme.headingFont).toBe("Dancing Script");
  });

  it("choosing a new body font updates the store", () => {
    render(<ThemePanel />);
    fireEvent.change(screen.getByLabelText("Font nội dung"), { target: { value: "Inter" } });
    expect(useEditorStore.getState().document.theme.bodyFont).toBe("Inter");
  });

  it("editing the primary color hex commits to the store on blur", () => {
    render(<ThemePanel />);
    const hexInput = screen.getByLabelText("Mã màu Màu chủ đạo");
    fireEvent.change(hexInput, { target: { value: "#112233" } });
    fireEvent.blur(hexInput);
    expect(useEditorStore.getState().document.theme.primary).toBe("#112233");
  });

  it("offers every FONT_OPTIONS family as a choice for both heading and body font", () => {
    render(<ThemePanel />);
    const headingSelect = screen.getByLabelText("Font tiêu đề") as HTMLSelectElement;
    const values = Array.from(headingSelect.options).map((o) => o.value);
    expect(values).toContain("Playfair Display");
    expect(values).toContain("Be Vietnam Pro");
    expect(values).toHaveLength(8);
  });
});

/**
 * Task 1 of Phase 3: the couple's own uploaded fonts. `FontUploadField`
 * talks to `/api/uploads/font`, and the delete button to
 * `/api/fonts/[assetId]`, so `fetch` is stubbed here — what these cases
 * pin is the panel's own wiring (picker contents, store writes, warning,
 * fallback on delete), not the routes, which have their own suite.
 */
describe("ThemePanel — custom fonts", () => {
  const FONT = {
    assetId: "asset-1",
    family: "Chữ Đẹp Việt",
    url: "https://cdn.test/u/1/asset-1.woff2",
    missingGlyphs: "",
  };

  function stubFetch(response: unknown, ok = true) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => response });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function uploadFont(overrides: Partial<typeof FONT> = {}) {
    const uploaded = { ...FONT, ...overrides };
    stubFetch(uploaded);
    render(<ThemePanel />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(8)], "font.ttf", { type: "font/ttf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(useEditorStore.getState().document.theme.customFonts).toHaveLength(1));
    return uploaded;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds an uploaded font to theme.customFonts with its asset id", async () => {
    await uploadFont();

    expect(useEditorStore.getState().document.theme.customFonts).toEqual([
      { family: FONT.family, url: FONT.url, assetId: FONT.assetId },
    ]);
  });

  it("offers the uploaded family in both font pickers, marked as a custom font", async () => {
    await uploadFont();

    for (const label of ["Font tiêu đề", "Font nội dung"]) {
      const select = screen.getByLabelText(label);
      expect(within(select).getByRole("option", { name: `${FONT.family} (font riêng)` })).toBeInTheDocument();
    }
  });

  it("keeps the document schema-valid after an upload", async () => {
    await uploadFont();

    expect(() => InvitationDocumentSchema.parse(useEditorStore.getState().document)).not.toThrow();
  });

  it("warns, in Vietnamese, when the font is missing Vietnamese glyphs — but still adds it", async () => {
    await uploadFont({ missingGlyphs: "ăđơư" });

    expect(screen.getByRole("status")).toHaveTextContent(/thiếu 4 ký tự tiếng Việt/i);
    expect(screen.getByRole("status")).toHaveTextContent("ăđơư");
    expect(useEditorStore.getState().document.theme.customFonts).toHaveLength(1);
  });

  it("says nothing when the font covers the whole Vietnamese sample", async () => {
    await uploadFont();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("re-uploading the same family replaces it instead of stacking a duplicate", async () => {
    await uploadFont();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    stubFetch({ ...FONT, url: "https://cdn.test/u/1/asset-2.woff2", assetId: "asset-2" });

    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(8)], "font.ttf", { type: "font/ttf" })] },
    });

    await waitFor(() =>
      expect(useEditorStore.getState().document.theme.customFonts[0].assetId).toBe("asset-2"),
    );
    expect(useEditorStore.getState().document.theme.customFonts).toHaveLength(1);
  });

  it("deleting a font removes the stored object and the theme entry", async () => {
    await uploadFont();
    const fetchMock = stubFetch({ ok: true });

    fireEvent.click(screen.getByRole("button", { name: `Xoá font ${FONT.family}` }));

    await waitFor(() => expect(useEditorStore.getState().document.theme.customFonts).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledWith(`/api/fonts/${FONT.assetId}`, { method: "DELETE" });
  });

  it("deleting the font currently in use falls back to a built-in family", async () => {
    // Otherwise the theme would keep naming a family with no `@font-face`
    // behind it, and every heading would silently render in the fallback
    // stack with no way for the couple to tell why.
    await uploadFont();
    fireEvent.change(screen.getByLabelText("Font tiêu đề"), { target: { value: FONT.family } });
    expect(useEditorStore.getState().document.theme.headingFont).toBe(FONT.family);
    stubFetch({ ok: true });

    fireEvent.click(screen.getByRole("button", { name: `Xoá font ${FONT.family}` }));

    await waitFor(() => expect(useEditorStore.getState().document.theme.headingFont).toBe("Playfair Display"));
    expect(() => InvitationDocumentSchema.parse(useEditorStore.getState().document)).not.toThrow();
  });

  it("keeps the font listed when the delete request fails", async () => {
    await uploadFont();
    stubFetch({ error: "nope" }, false);

    fireEvent.click(screen.getByRole("button", { name: `Xoá font ${FONT.family}` }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/không xoá được/i));
    expect(useEditorStore.getState().document.theme.customFonts).toHaveLength(1);
  });
});
