import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "../safe-redirect";

describe("sanitizeNextPath", () => {
  it("accepts a plain in-app relative path", () => {
    expect(sanitizeNextPath("/mau-thiep")).toBe("/mau-thiep");
  });

  it("accepts a relative path with a query string", () => {
    expect(sanitizeNextPath("/mau-thiep?tier=basic")).toBe("/mau-thiep?tier=basic");
  });

  it("falls back to /dashboard when undefined", () => {
    expect(sanitizeNextPath(undefined)).toBe("/dashboard");
  });

  it("falls back to /dashboard for an absolute external URL (open-redirect attempt)", () => {
    expect(sanitizeNextPath("https://evil.example.com")).toBe("/dashboard");
  });

  it("falls back to /dashboard for a protocol-relative URL (open-redirect attempt)", () => {
    expect(sanitizeNextPath("//evil.example.com")).toBe("/dashboard");
  });

  it("falls back to /dashboard for a javascript: URL", () => {
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("falls back to /dashboard for a path that doesn't start with /", () => {
    expect(sanitizeNextPath("mau-thiep")).toBe("/dashboard");
  });

  it("falls back to /dashboard for an empty string", () => {
    expect(sanitizeNextPath("")).toBe("/dashboard");
  });

  it("takes the first value when given an array (Next's searchParams shape)", () => {
    expect(sanitizeNextPath(["/mau-thiep", "/other"])).toBe("/mau-thiep");
  });
});
