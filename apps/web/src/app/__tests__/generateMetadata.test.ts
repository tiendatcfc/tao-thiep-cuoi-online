import { describe, expect, it } from "vitest";
import { generateMetadata } from "../page";

describe("generateMetadata (app/page.tsx)", () => {
  it("returns a Vietnamese title/description and a matching OpenGraph block for /", () => {
    const result = generateMetadata();

    expect(typeof result.title).toBe("string");
    expect(result.title).toMatch(/HPWD/);
    expect(result.title).toMatch(/miễn phí/i);
    expect(typeof result.description).toBe("string");
    expect((result.description as string).length).toBeGreaterThan(0);

    expect(result.openGraph).toMatchObject({
      title: result.title,
      description: result.description,
      url: "/",
      type: "website",
      locale: "vi_VN",
    });
  });
});
