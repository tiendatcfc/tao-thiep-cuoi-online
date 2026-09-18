import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders, storageOriginFromEnv } from "../csp";

/**
 * Reads one directive out of a policy string. Asserting on the whole
 * serialized policy would make every test brittle to directive order; the
 * order carries no meaning to a browser.
 */
function directive(policy: string, name: string): string | undefined {
  return policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

const NONCE = "dGVzdC1ub25jZQ==";

describe("storageOriginFromEnv", () => {
  it("returns the origin of R2_PUBLIC_URL, dropping the bucket path", () => {
    expect(storageOriginFromEnv({ R2_PUBLIC_URL: "https://cdn.hpwd.vn/hpwd" })).toBe(
      "https://cdn.hpwd.vn",
    );
  });

  it("keeps a non-default port (local MinIO)", () => {
    expect(storageOriginFromEnv({ R2_PUBLIC_URL: "http://localhost:9000/hpwd" })).toBe(
      "http://localhost:9000",
    );
  });

  it("returns null when R2_PUBLIC_URL is unset", () => {
    expect(storageOriginFromEnv({})).toBeNull();
  });

  // A malformed value must not take the site down: every response goes
  // through this, so throwing here would turn one bad env var into a 500 on
  // literally every request, including the health check meant to diagnose it.
  it("returns null instead of throwing on a malformed URL", () => {
    expect(storageOriginFromEnv({ R2_PUBLIC_URL: "not a url" })).toBeNull();
  });

  it("returns null for a non-http(s) scheme", () => {
    expect(storageOriginFromEnv({ R2_PUBLIC_URL: "javascript:alert(1)" })).toBeNull();
  });
});

describe("buildCsp", () => {
  const base = { nonce: NONCE, storageOrigin: "https://cdn.hpwd.vn", https: true, development: false };

  it("locks the default fetch directive to same-origin", () => {
    expect(directive(buildCsp(base), "default-src")).toBe("default-src 'self'");
  });

  it("carries the request nonce in script-src", () => {
    expect(directive(buildCsp(base), "script-src")).toContain(`'nonce-${NONCE}'`);
  });

  it("never allows unsafe-inline scripts in production", () => {
    expect(directive(buildCsp(base), "script-src")).not.toContain("'unsafe-inline'");
  });

  // Turbopack's HMR client evaluates code it receives over the dev socket.
  // Without this the owner's `pnpm dev` breaks the moment CSP ships —
  // a self-inflicted outage that no production test would catch.
  it("allows eval and the dev websocket only in development", () => {
    const dev = buildCsp({ ...base, development: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");

    const prod = buildCsp(base);
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(prod, "connect-src")).not.toContain("ws:");
  });

  it("allows the storage origin to serve images, audio and fonts", () => {
    const policy = buildCsp(base);
    for (const name of ["img-src", "media-src", "font-src"]) {
      expect(directive(policy, name)).toContain("https://cdn.hpwd.vn");
    }
  });

  it("omits the storage origin entirely when there is none", () => {
    const policy = buildCsp({ ...base, storageOrigin: null });
    expect(policy).not.toContain("cdn.hpwd.vn");
    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob:");
  });

  // `lite-youtube-embed` inserts the real iframe only after the guest taps
  // play. If the policy forgets this, the facade still renders and the
  // thumbnail still loads — the video simply never plays, which is the
  // hardest kind of CSP breakage to notice.
  it("allows the YouTube player to be framed", () => {
    expect(directive(buildCsp(base), "frame-src")).toContain("https://www.youtube-nocookie.com");
  });

  it("forbids being framed, plugins, and a rewritten base URI", () => {
    const policy = buildCsp(base);
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'none'");
  });

  it("keeps form posts on this origin", () => {
    expect(directive(buildCsp(base), "form-action")).toBe("form-action 'self'");
  });

  // framer-motion writes `style=""` onto every node it animates, and no
  // nonce can cover a style ATTRIBUTE. Documented as a deliberate hole
  // rather than left to look like an oversight.
  it("allows inline styles, deliberately", () => {
    expect(directive(buildCsp(base), "style-src")).toContain("'unsafe-inline'");
  });

  it("upgrades insecure requests only when served over https", () => {
    expect(directive(buildCsp(base), "upgrade-insecure-requests")).toBe("upgrade-insecure-requests");
    expect(directive(buildCsp({ ...base, https: false }), "upgrade-insecure-requests")).toBeUndefined();
  });
});

describe("securityHeaders", () => {
  it("sets nosniff, a referrer policy and a permissions policy", () => {
    const headers = securityHeaders({ https: true });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  // Sending HSTS over http is at best ignored and at worst pins a
  // development machine to https for two years.
  it("sends HSTS only over https", () => {
    expect(securityHeaders({ https: true })["Strict-Transport-Security"]).toContain("max-age=");
    expect(securityHeaders({ https: false })["Strict-Transport-Security"]).toBeUndefined();
  });
});
