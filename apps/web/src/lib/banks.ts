export interface Bank {
  /** NAPAS bank BIN (used in the VietQR merchant account info, tag 38-01-00). */
  bin: string;
  /** Short display name, e.g. dropdown labels next to a bank logo. */
  shortName: string;
  /** Full registered name. */
  name: string;
  /**
   * Former or colloquial names, matched by the picker's search but never
   * displayed. A bank that has been renamed is still known to its customers
   * by the old name for years, and a couple who types the name on their own
   * card and gets "no results" concludes their bank is unsupported.
   */
  aliases?: string[];
}

// NAPAS member bank BINs — same list/convention as VietQR.io's bank directory.
// Sorted by shortName. Only banks whose BIN is well-established are listed;
// anything uncertain was left out rather than guessed.
export const BANKS: Bank[] = [
  { bin: "970425", shortName: "ABBANK", name: "Ngân hàng TMCP An Bình" },
  { bin: "970416", shortName: "ACB", name: "Ngân hàng TMCP Á Châu" },
  {
    bin: "970405",
    shortName: "Agribank",
    name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam",
  },
  { bin: "970409", shortName: "BacABank", name: "Ngân hàng TMCP Bắc Á" },
  { bin: "970438", shortName: "BaoVietBank", name: "Ngân hàng TMCP Bảo Việt" },
  {
    bin: "970418",
    shortName: "BIDV",
    name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
  },
  { bin: "970454", shortName: "BVBank", name: "Ngân hàng TMCP Bản Việt" },
  { bin: "546034", shortName: "CAKE", name: "Ngân hàng số CAKE by VPBank" },
  {
    bin: "970444",
    shortName: "CBBank",
    name: "Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam",
  },
  { bin: "970406", shortName: "DongABank", name: "Ngân hàng TMCP Đông Á" },
  {
    bin: "970431",
    shortName: "Eximbank",
    name: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam",
  },
  {
    bin: "970408",
    shortName: "GPBank",
    name: "Ngân hàng TM TNHH MTV Dầu Khí Toàn Cầu",
  },
  {
    bin: "970437",
    shortName: "HDBank",
    name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh",
  },
  {
    bin: "668888",
    shortName: "KBank",
    name: "Ngân hàng Đại chúng TNHH Kasikornbank",
  },
  { bin: "970452", shortName: "KienLongBank", name: "Ngân hàng TMCP Kiên Long" },
  { bin: "970449", shortName: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam" },
  { bin: "970422", shortName: "MBBank", name: "Ngân hàng TMCP Quân đội" },
  {
    // Renamed from Oceanbank on 18/12/2024, when it became wholly owned by
    // MB and was re-registered as Ngân hàng TNHH MTV Việt Nam Hiện Đại
    // (Modern Bank of Vietnam). The BIN is unchanged by a rename, so every
    // QR already printed on an invitation keeps working — only the label a
    // couple picks from needed updating.
    bin: "970414",
    shortName: "MBV",
    name: "Ngân hàng TNHH MTV Việt Nam Hiện Đại",
    aliases: ["Oceanbank", "Ocean Bank", "Đại Dương"],
  },
  { bin: "970426", shortName: "MSB", name: "Ngân hàng TMCP Hàng Hải Việt Nam" },
  { bin: "970428", shortName: "NamABank", name: "Ngân hàng TMCP Nam Á" },
  { bin: "970419", shortName: "NCB", name: "Ngân hàng TMCP Quốc Dân" },
  { bin: "970448", shortName: "OCB", name: "Ngân hàng TMCP Phương Đông" },
  {
    bin: "970430",
    shortName: "PGBank",
    name: "Ngân hàng TMCP Thịnh vượng và Phát triển",
  },
  {
    bin: "970412",
    shortName: "PVcomBank",
    name: "Ngân hàng TMCP Đại Chúng Việt Nam",
  },
  {
    bin: "970403",
    shortName: "Sacombank",
    name: "Ngân hàng TMCP Sài Gòn Thương Tín",
  },
  {
    bin: "970400",
    shortName: "SaigonBank",
    name: "Ngân hàng TMCP Sài Gòn Công Thương",
  },
  { bin: "970429", shortName: "SCB", name: "Ngân hàng TMCP Sài Gòn" },
  { bin: "970440", shortName: "SeABank", name: "Ngân hàng TMCP Đông Nam Á" },
  { bin: "970443", shortName: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội" },
  {
    bin: "970407",
    shortName: "Techcombank",
    name: "Ngân hàng TMCP Kỹ Thương Việt Nam",
  },
  { bin: "963388", shortName: "Timo", name: "Ngân hàng số Timo" },
  { bin: "970423", shortName: "TPBank", name: "Ngân hàng TMCP Tiên Phong" },
  { bin: "546035", shortName: "Ubank", name: "Ngân hàng số Ubank by VPBank" },
  { bin: "970441", shortName: "VIB", name: "Ngân hàng TMCP Quốc tế Việt Nam" },
  { bin: "970427", shortName: "VietABank", name: "Ngân hàng TMCP Việt Á" },
  {
    bin: "970433",
    shortName: "VietBank",
    name: "Ngân hàng TMCP Việt Nam Thương Tín",
  },
  {
    bin: "970436",
    shortName: "Vietcombank",
    name: "Ngân hàng TMCP Ngoại Thương Việt Nam",
  },
  {
    bin: "970415",
    shortName: "VietinBank",
    name: "Ngân hàng TMCP Công Thương Việt Nam",
  },
  {
    bin: "970432",
    shortName: "VPBank",
    name: "Ngân hàng TMCP Việt Nam Thịnh Vượng",
  },
  { bin: "970421", shortName: "VRB", name: "Ngân hàng Liên doanh Việt - Nga" },
];
