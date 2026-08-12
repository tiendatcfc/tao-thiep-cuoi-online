import { describe, expect, it } from "vitest";
import { buildGuestLink, normalizeGuestName } from "../guest-links";

describe("buildGuestLink", () => {
  it("nối origin, slug và token", () => {
    expect(buildGuestLink("https://hpwd.vn", "an-binh", "tok123")).toBe(
      "https://hpwd.vn/i/an-binh?g=tok123",
    );
  });
  it("bỏ dấu / thừa ở cuối origin", () => {
    expect(buildGuestLink("https://hpwd.vn/", "an-binh", "tok123")).toBe(
      "https://hpwd.vn/i/an-binh?g=tok123",
    );
  });
  it("mã hoá token an toàn cho URL", () => {
    expect(buildGuestLink("https://hpwd.vn", "a", "a b&c")).toContain("g=a%20b%26c");
  });
});

describe("normalizeGuestName", () => {
  it("gộp khoảng trắng và cắt hai đầu", () => {
    expect(normalizeGuestName("  Nguyễn   Văn  An  ")).toBe("Nguyễn Văn An");
  });
  it("bỏ ký tự điều khiển", () => {
    // BAT BUOC dung escape sequence. Khong bao gio dan byte dieu khien that vao
    // source — mot implementer Phase 1 da lam vay va phai sua lai hai lan.
    expect(normalizeGuestName("An\u0000 Nguyễn")).toBe("An Nguyễn");
    expect(normalizeGuestName("A\u0007B")).toBe("AB");
  });
  it("cắt ở 120 ký tự", () => {
    expect(normalizeGuestName("x".repeat(200))).toHaveLength(120);
  });
  it("không để lại khoảng trắng ở cuối khi ranh giới cắt rơi đúng vào một dấu cách", () => {
    // "A B " repeated 50 times is 200 chars: "A B A B A B ...". After the
    // control-strip (no-op) and whitespace-collapse (no-op, already single
    // spaces) steps, trimming the trailing space leaves a 199-char string
    // whose index 119 is still a space (199 % 4 !== the position that got
    // trimmed) — slicing to 120 chars right there, before a final trim,
    // would leave that space dangling at the end of the result.
    const raw = "A B ".repeat(50);
    const result = normalizeGuestName(raw);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(/\s$/.test(result)).toBe(false);
  });
});
