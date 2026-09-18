import { describe, expect, it } from "vitest";
import { isProtectedPath, signInUrlFor } from "../protected-paths";

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/dashboard/abc", "/dashboard/abc/khach-moi", "/editor/abc"])(
    "protects %s",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(true);
    },
  );

  // Every one of these is reachable by a guest holding nothing but a link.
  // Protecting one by accident would put a wedding invitation behind a
  // Google sign-in on the wedding day.
  it.each(["/", "/i/demo", "/mau-thiep", "/dang-nhap", "/bao-mat", "/dieu-khoan", "/api/music"])(
    "leaves %s public",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );
});

describe("signInUrlFor", () => {
  it("sends the visitor to the sign-in page", () => {
    expect(signInUrlFor(new URL("http://localhost:3000/editor/abc")).pathname).toBe("/dang-nhap");
  });

  // `next` is what /dang-nhap actually reads (via sanitizeNextPath).
  // Auth.js's own redirect used `callbackUrl`, which that page has never
  // looked at, so signing in always dumped the user on /dashboard.
  it("remembers where the visitor was going, in the parameter the page reads", () => {
    const url = signInUrlFor(new URL("http://localhost:3000/dashboard/abc/khach-moi?tab=all"));
    expect(url.searchParams.get("next")).toBe("/dashboard/abc/khach-moi?tab=all");
    expect(url.searchParams.get("callbackUrl")).toBeNull();
  });

  // sanitizeNextPath rejects anything that is not a single-slash-prefixed
  // relative path, so an absolute URL here would be silently downgraded to
  // /dashboard — the exact bug being fixed.
  it("produces a value sanitizeNextPath will accept", () => {
    const next = signInUrlFor(new URL("http://localhost:3000/editor/abc")).searchParams.get("next");
    expect(next?.startsWith("/")).toBe(true);
    expect(next?.startsWith("//")).toBe(false);
  });
});
