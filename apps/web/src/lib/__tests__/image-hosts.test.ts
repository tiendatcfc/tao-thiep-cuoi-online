import { describe, expect, it } from "vitest";
import { getAllowedImageHosts, isAllowedImageUrl } from "../image-hosts";

const ENV_WITH_R2 = { R2_PUBLIC_URL: "https://cdn.example.com/hpwd" } as NodeJS.ProcessEnv;
const ENV_WITHOUT_R2 = {} as NodeJS.ProcessEnv;

describe("getAllowedImageHosts", () => {
  it("always includes the local dev MinIO host", () => {
    expect(getAllowedImageHosts(ENV_WITHOUT_R2)).toEqual([{ protocol: "http", hostname: "localhost", port: "9000" }]);
  });

  it("adds the R2_PUBLIC_URL host, protocol, and port when set", () => {
    expect(getAllowedImageHosts(ENV_WITH_R2)).toEqual([
      { protocol: "http", hostname: "localhost", port: "9000" },
      { protocol: "https", hostname: "cdn.example.com" },
    ]);
  });

  it("falls back to just the local-dev host when R2_PUBLIC_URL is malformed", () => {
    expect(getAllowedImageHosts({ R2_PUBLIC_URL: "not a url" } as NodeJS.ProcessEnv)).toEqual([
      { protocol: "http", hostname: "localhost", port: "9000" },
    ]);
  });
});

describe("isAllowedImageUrl (B4 SSRF guard)", () => {
  it("allows the local MinIO host", () => {
    expect(isAllowedImageUrl("http://localhost:9000/hpwd/cover.png", ENV_WITHOUT_R2)).toBe(true);
  });

  it("allows the configured R2_PUBLIC_URL host", () => {
    expect(isAllowedImageUrl("https://cdn.example.com/hpwd/cover.png", ENV_WITH_R2)).toBe(true);
  });

  it("rejects an arbitrary external host — the SSRF surface this guards against", () => {
    expect(isAllowedImageUrl("https://attacker.example.net/cover.png", ENV_WITH_R2)).toBe(false);
  });

  it("rejects a link-local/metadata-service address even though it parses as a valid URL", () => {
    expect(isAllowedImageUrl("http://169.254.169.254/latest/meta-data", ENV_WITH_R2)).toBe(false);
  });

  it("rejects a non-http(s) protocol", () => {
    expect(isAllowedImageUrl("file:///etc/passwd", ENV_WITH_R2)).toBe(false);
  });

  it("rejects an unparseable value instead of throwing", () => {
    expect(isAllowedImageUrl("not a url at all", ENV_WITH_R2)).toBe(false);
  });

  it("rejects the R2 host on a different port than configured", () => {
    expect(isAllowedImageUrl("https://cdn.example.com:8443/cover.png", ENV_WITH_R2)).toBe(false);
  });
});
