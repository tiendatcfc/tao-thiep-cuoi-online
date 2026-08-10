import { removeDiacritics } from "./slug";

/**
 * VietQR / EMVCo QR Code for Payment Systems payload builder.
 *
 * Produces the plain-text payload string that goes straight into a QR
 * renderer (e.g. `<QRCode value={buildVietQRPayload(...)} />` — Task 9).
 * Field tags follow the EMVCo Merchant-Presented Mode spec as profiled by
 * NAPAS VietQR: https://vietqr.io (napas 24/7 bank-transfer QR).
 */

const NAPAS_GUID = "A000000727";
const BANK_TRANSFER_SERVICE_CODE = "QRIBFTTA";
const VND_CURRENCY_CODE = "704";
const COUNTRY_CODE = "VN";
const MESSAGE_MAX_LENGTH = 25;

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes of
 * `input`, returned as 4 uppercase hex digits — the checksum EMVCo requires
 * in the payload's trailing tag 63.
 *
 * Uses `TextEncoder` rather than `Buffer` so this module stays usable in
 * the browser (it runs client-side alongside the QR renderer).
 */
export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * EMVCo TLV: 2-digit tag + 2-digit length + value. The length is the UTF-8
 * *byte* length (not JS string/UTF-16 length) — EMVCo decoders read raw
 * bytes, so a value containing any multi-byte character would otherwise get
 * a length prefix that under-counts it and corrupts everything after it.
 */
const tlv = (tag: string, value: string): string => {
  const byteLength = new TextEncoder().encode(value).length;
  if (byteLength > 99) {
    throw new Error(`VietQR TLV value for tag ${tag} exceeds 99 bytes (${byteLength})`);
  }
  return tag + String(byteLength).padStart(2, "0") + value;
};

export interface BuildVietQRPayloadOptions {
  bankBin: string;
  accountNumber: string;
  /** Reserved for on-screen display next to the QR; not embedded in the payload. */
  accountName?: string;
  /** VND amount. Floored (VND has no decimals) then validated as >= 1; throws RangeError otherwise. */
  amount?: number;
  /** Transfer message / purpose. Diacritics are stripped and it's truncated to 25 chars. */
  message?: string;
}

export function buildVietQRPayload(opts: BuildVietQRPayloadOptions): string {
  let amount: number | undefined;
  if (opts.amount !== undefined) {
    // Floor first, then validate the floored value: validating opts.amount
    // before flooring would let e.g. 0.5 (not <= 0) through, only to floor
    // to 0 and silently emit a static, amount-less QR instead of erroring.
    const floored = Math.floor(opts.amount);
    if (!Number.isFinite(floored) || floored < 1) {
      throw new RangeError("VietQR amount must be a positive integer (>= 1 VND)");
    }
    amount = floored;
  }

  const merchantAccountInfo =
    tlv("00", NAPAS_GUID) +
    tlv("01", tlv("00", opts.bankBin) + tlv("01", opts.accountNumber)) +
    tlv("02", BANK_TRANSFER_SERVICE_CODE);

  let payload =
    tlv("00", "01") + // payload format indicator
    tlv("01", amount ? "12" : "11") + // point of initiation: dynamic vs static
    tlv("38", merchantAccountInfo) +
    tlv("53", VND_CURRENCY_CODE);

  if (amount) payload += tlv("54", String(amount));

  payload += tlv("58", COUNTRY_CODE);

  if (opts.message) {
    // Banking-app parsers for tag 62/08 expect plain ASCII. removeDiacritics
    // handles Vietnamese text, but anything it doesn't touch (emoji, other
    // scripts) is stripped here too as defense-in-depth, since a stray
    // multi-byte character would otherwise desync the UTF-8 byte length tlv()
    // computes from the truncated JS-length slice below.
    const purpose = removeDiacritics(opts.message)
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, MESSAGE_MAX_LENGTH);
    payload += tlv("62", tlv("08", purpose));
  }

  payload += "6304"; // CRC tag + fixed length, value appended below
  return payload + crc16ccitt(payload);
}
