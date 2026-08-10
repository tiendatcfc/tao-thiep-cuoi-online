import { describe, expect, it } from "vitest";
import { buildVietQRPayload, crc16ccitt } from "../vietqr";
import { removeDiacritics } from "../slug";

describe("crc16ccitt", () => {
  it("matches the standard CRC-16/CCITT-FALSE test vector", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("buildVietQRPayload", () => {
  it("produces a well-formed EMVCo payload with a self-consistent trailing CRC", () => {
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "0011001234567",
      message: "Mung cuoi",
    });

    expect(payload.startsWith("000201")).toBe(true); // payload format indicator
    expect(payload).toContain("A000000727"); // NAPAS GUID
    expect(payload).toContain("970436");
    expect(payload).toContain("QRIBFTTA"); // bank-transfer service code
    expect(payload).toContain("5303704"); // currency = VND (704)

    const body = payload.slice(0, -4); // everything up to "6304" + CRC
    expect(payload.slice(-4)).toBe(crc16ccitt(body));
  });

  it("includes the amount tag when an amount is given", () => {
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "1",
      amount: 500000,
    });

    expect(payload).toContain("5406500000"); // tag 54, length 06, value 500000
  });

  it("uses the dynamic point-of-initiation method (12) when an amount is present", () => {
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "1",
      amount: 500000,
    });

    expect(payload).toContain("010212");
  });

  it("uses the static point-of-initiation method (11) when no amount is given", () => {
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "1",
    });

    expect(payload).toContain("010211");
  });

  it("floors a non-integer amount because VND has no decimal places", () => {
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "1",
      amount: 500000.9,
    });

    expect(payload).toContain("5406500000");
  });

  it("rejects a non-positive amount", () => {
    expect(() =>
      buildVietQRPayload({ bankBin: "970436", accountNumber: "1", amount: 0 }),
    ).toThrow();
    expect(() =>
      buildVietQRPayload({ bankBin: "970436", accountNumber: "1", amount: -1 }),
    ).toThrow();
  });

  it("strips diacritics from the message and truncates it to 25 characters", () => {
    const message = "Mừng cưới Minh và Hà, chúc hai bạn trăm năm hạnh phúc";
    const payload = buildVietQRPayload({
      bankBin: "970436",
      accountNumber: "1",
      message,
    });

    const expectedFragment = removeDiacritics(message).slice(0, 25);
    expect(expectedFragment).toHaveLength(25); // sanity: source is long enough to truncate
    expect(payload).toContain(expectedFragment);
    expect(payload).not.toMatch(/[ừớạàáảãâầấẩẫậ]/i);
  });
});
