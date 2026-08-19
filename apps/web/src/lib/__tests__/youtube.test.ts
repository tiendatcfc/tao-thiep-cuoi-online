import { describe, expect, it } from "vitest";
import { parseYoutubeId, youtubeWatchUrl } from "../youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeId", () => {
  it.each([
    [ID, ID],
    [`  ${ID}  `, ID],
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`http://youtube.com/watch?v=${ID}&t=42s`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=abc123`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/live/${ID}`, ID],
    [`https://www.youtube-nocookie.com/embed/${ID}`, ID],
  ])("extracts the id from %s", (input, expected) => {
    expect(parseYoutubeId(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    ["not a video"],
    ["dQw4w9WgXc"], // 10 chars
    ["dQw4w9WgXcQQ"], // 12 chars
    ['dQw4w9WgXc"'], // invalid charset
    ["javascript:alert(1)"],
    [`javascript:alert(1)//${ID}`],
    [`https://evil.com/watch?v=${ID}`], // wrong host
    [`https://youtube.com.evil.com/watch?v=${ID}`], // host suffix trick
    [`https://www.youtube.com/watch?v=<script>`],
    [`ftp://youtube.com/watch?v=${ID}`],
    ["https://www.youtube.com/watch"], // no v param
  ])("rejects %s", (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});

describe("youtubeWatchUrl", () => {
  it("builds the canonical watch URL", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
