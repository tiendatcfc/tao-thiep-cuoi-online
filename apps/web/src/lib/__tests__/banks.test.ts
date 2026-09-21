import { describe, expect, it } from "vitest";
import { BANKS } from "../banks";

describe("BANKS", () => {
  it("includes the major NAPAS member banks with the expected BINs", () => {
    const byBin = new Map(BANKS.map((b) => [b.bin, b]));
    expect(byBin.get("970436")?.shortName).toBe("Vietcombank");
    expect(byBin.get("970422")?.shortName).toBe("MBBank");
    expect(byBin.get("970407")?.shortName).toBe("Techcombank");
    expect(byBin.get("970415")?.shortName).toBe("VietinBank");
    expect(byBin.get("970418")?.shortName).toBe("BIDV");
    expect(byBin.get("970432")?.shortName).toBe("VPBank");
    expect(byBin.get("970423")?.shortName).toBe("TPBank");
    expect(byBin.get("970403")?.shortName).toBe("Sacombank");
  });

  it("has unique BINs and a name/shortName for every entry", () => {
    const bins = BANKS.map((b) => b.bin);
    expect(new Set(bins).size).toBe(bins.length);
    for (const bank of BANKS) {
      expect(bank.bin).toMatch(/^\d{6}$/);
      expect(bank.shortName.length).toBeGreaterThan(0);
      expect(bank.name.length).toBeGreaterThan(0);
    }
  });

  it("is sorted by shortName", () => {
    const names = BANKS.map((b) => b.shortName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  // Oceanbank became MBV on 18/12/2024 (wholly owned by MB, re-registered as
  // Ngân hàng TNHH MTV Việt Nam Hiện Đại). A rename does not change a BIN —
  // and it must not, because that BIN is already encoded into every VietQR a
  // couple has printed or shared.
  it("lists 970414 under its current name, with the old one kept as a searchable alias", () => {
    const bank = BANKS.find((b) => b.bin === "970414");

    expect(bank?.shortName).toBe("MBV");
    expect(bank?.name).toContain("Việt Nam Hiện Đại");
    expect(bank?.aliases).toContain("Oceanbank");
  });

  it("shows no bank under the retired Oceanbank name", () => {
    expect(BANKS.some((b) => b.shortName === "Oceanbank")).toBe(false);
  });
});
