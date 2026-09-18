import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "../client-ip";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/invites/demo/wishes", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getClientIp", () => {
  // THE BUG THIS FILE EXISTS FOR. `x-forwarded-for` is a list a client can
  // start: anyone may send `X-Forwarded-For: <anything>`, a proxy only
  // APPENDS to it. Reading the first entry therefore reads a value the
  // attacker chose, so every request lands in a different rate-limit
  // bucket and the limit stops existing — while every test that sends the
  // header still passes.
  it("ignores an entry the client wrote itself", () => {
    // One proxy (the default) appended 203.0.113.9; 1.2.3.4 came from the caller.
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("counts hops from the right, so a longer forged prefix changes nothing", () => {
    expect(
      getClientIp(request({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 1.2.3.4, 203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("steps back one more entry per configured hop", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    // Cloudflare appended the client IP, our own proxy appended Cloudflare's.
    expect(
      getClientIp(request({ "x-forwarded-for": "1.2.3.4, 198.51.100.7, 203.0.113.9" })),
    ).toBe("198.51.100.7");
  });

  // A request with a shorter chain than configured did not come through the
  // expected path — it reached the origin some other way, e.g. straight at
  // the container, bypassing the CDN. Its remaining entries are all
  // caller-written, so none of them may be believed.
  it("refuses to guess when the chain is shorter than configured", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "3");
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("unknown");
  });

  it("trusts nothing forwarded when told there is no proxy", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(
      getClientIp(request({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" })),
    ).toBe("unknown");
  });

  // Cloudflare overwrites CF-Connecting-IP on every request, so unlike
  // x-forwarded-for it cannot be extended by the caller.
  it("prefers the dedicated header when the CDN sets one", () => {
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(
      getClientIp(request({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" })),
    ).toBe("198.51.100.7");
  });

  it("falls back to unknown when the configured header is absent", () => {
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("unknown");
  });

  it("uses x-real-ip when there is no forwarded list but a proxy is trusted", () => {
    expect(getClientIp(request({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("handles IPv6, including the IPv4-mapped form a proxy may emit", () => {
    expect(getClientIp(request({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(getClientIp(request({ "x-real-ip": "::ffff:203.0.113.9" }))).toBe("::ffff:203.0.113.9");
  });

  // Whatever comes back is concatenated into a Redis key. An unvalidated
  // value lets a caller push megabytes into the keyspace, or shape the key
  // itself with a colon.
  it.each([
    ["not-an-ip", "not an address at all"],
    ["1.2.3.4:5678", "a port, which would split the key"],
    ["a".repeat(200), "far too long"],
    ["", "empty"],
  ])("rejects %s (%s)", (value) => {
    expect(getClientIp(request({ "x-forwarded-for": value }))).toBe("unknown");
  });

  it("returns unknown when nothing identifies the caller", () => {
    expect(getClientIp(request({}))).toBe("unknown");
  });

  // A typo in an env var must not silently disable the limiter, and must
  // not throw either: this runs inside the wish and RSVP handlers.
  it("falls back to the default hop count on unusable configuration, loudly", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("TRUSTED_PROXY_HOPS", "abc");
    expect(getClientIp(request({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(error).toHaveBeenCalled();
  });
});
