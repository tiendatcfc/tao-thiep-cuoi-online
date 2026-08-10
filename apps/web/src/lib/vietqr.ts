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

/** EMVCo TLV: 2-digit tag + 2-digit length + value. */
const tlv = (tag: string, value: string): string =>
  tag + String(value.length).padStart(2, "0") + value;

export interface BuildVietQRPayloadOptions {
  bankBin: string;
  accountNumber: string;
  /** Reserved for on-screen display next to the QR; not embedded in the payload. */
  accountName?: string;
  /** VND amount. Must be a positive number; non-integers are floored (VND has no decimals). */
  amount?: number;
  /** Transfer message / purpose. Diacritics are stripped and it's truncated to 25 chars. */
  message?: string;
}

export function buildVietQRPayload(opts: BuildVietQRPayloadOptions): string {
  let amount: number | undefined;
  if (opts.amount !== undefined) {
    if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
      throw new Error("VietQR amount must be a positive number");
    }
    amount = Math.floor(opts.amount);
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
    const purpose = removeDiacritics(opts.message).slice(0, MESSAGE_MAX_LENGTH);
    payload += tlv("62", tlv("08", purpose));
  }

  payload += "6304"; // CRC tag + fixed length, value appended below
  return payload + crc16ccitt(payload);
}
