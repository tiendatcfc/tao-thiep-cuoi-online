"use client";

import { useState } from "react";
import type { GiftProps, Section } from "@hpwd/schema";
import QRCode from "react-qr-code";
import { buildVietQRPayload } from "@/lib/vietqr";
import { SectionWrapper } from "./SectionWrapper";

const SIDE_LABEL: Record<GiftProps["accounts"][number]["side"], string> = {
  groom: "Nhà trai",
  bride: "Nhà gái",
};

const COPY_CONFIRMATION_MS = 2000;

/**
 * C8: renders `value` grouped into 4s for readability (like "0987 6543 21")
 * WITHOUT any literal space character in the DOM text — every digit is its
 * own `<span>`, and the visual gap between groups is a CSS margin on every
 * 4th one, not a text node. That matters because guests without a working
 * "Sao chép STK" button (unsupported clipboard API — see `handleCopy`) fall
 * back to manually selecting and copying this text, and most Vietnamese
 * banking apps reject a pasted account number that contains spaces. A plain
 * `"0123 4567 89"` string would copy those spaces along with the digits;
 * this never puts them in the copyable text at all, so a manual
 * select-and-copy always yields pure digits, matching exactly what
 * `handleCopy`'s `navigator.clipboard.writeText` already sends.
 */
function GroupedAccountNumber({ value }: { value: string }) {
  return (
    <p className="font-mono text-sm text-gray-700">
      {value.split("").map((digit, index) => {
        const isGroupEnd = (index + 1) % 4 === 0 && index !== value.length - 1;
        return (
          <span key={index} style={isGroupEnd ? { marginRight: "0.4em" } : undefined}>
            {digit}
          </span>
        );
      })}
    </p>
  );
}

function GiftAccountCard({ account }: { account: GiftProps["accounts"][number] }) {
  const [copied, setCopied] = useState(false);
  // Checked once at render time rather than made reactive — whether the
  // clipboard API exists doesn't change over a page's lifetime.
  const clipboardAvailable =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  const payload = buildVietQRPayload({
    bankBin: account.bankBin,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    message: "Mung cuoi",
  });

  async function handleCopy() {
    // In-app WebViews (Zalo, Facebook Messenger) frequently don't expose
    // `navigator.clipboard` at all — calling `.writeText` unguarded throws
    // synchronously in the click handler and, with no error boundary above
    // this component, blanks the whole invite page. There's no reliable
    // fallback copy mechanism worth adding for this (execCommand is
    // deprecated and unreliable in the same WebViews), so this just no-ops.
    if (!navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(account.accountNumber);
      // Only claim success once the copy actually resolved — showing "Đã
      // sao chép!" after a rejected promise would be a false positive.
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    } catch {
      // Permission denied or otherwise unsupported — leave the button as-is
      // rather than lying about success.
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--secondary)] bg-white p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--secondary)]">
        {SIDE_LABEL[account.side]}
      </p>
      <p className="text-base font-semibold text-[var(--primary)]">{account.bankName}</p>
      <div data-testid="vietqr" className="rounded-lg bg-white p-2">
        <QRCode value={payload} size={168} />
      </div>
      <GroupedAccountNumber value={account.accountNumber} />
      <p className="text-sm text-gray-600">{account.accountName.toUpperCase()}</p>
      {clipboardAvailable ? (
        <button
          type="button"
          onClick={handleCopy}
          className="mt-1 rounded-full border border-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white"
        >
          {copied ? "Đã sao chép!" : "Sao chép STK"}
        </button>
      ) : (
        // C8: in-app WebViews (Zalo, Facebook Messenger) frequently don't
        // expose `navigator.clipboard` at all — the copy button would just
        // silently no-op there with no feedback. Tell the guest how to copy
        // manually instead of leaving them with a dead button.
        <p className="mt-1 text-xs text-gray-400">
          Vui lòng bôi đen và sao chép số tài khoản ở trên.
        </p>
      )}
    </div>
  );
}

/**
 * One VietQR card per gift account, laid out two-up from 360px wide and
 * stacked below it. Renders nothing when the couple hasn't configured any
 * accounts yet, same as `AlbumSection` with an empty gallery.
 */
export function GiftSection({ section }: { section: Extract<Section, { type: "gift" }> }) {
  const { title, description, accounts } = section.props;
  // GiftAccountSchema requires non-empty bankBin/accountNumber for anything
  // that's actually been through validation (saved/published), but this
  // component also renders the editor's live, in-progress draft document
  // (see InvitePage's docstring) — an account the couple is still filling in
  // can transiently be `{ bankBin: "", accountNumber: "", ... }` in memory,
  // never having round-tripped through the schema yet. A blank bankBin or
  // accountNumber would make buildVietQRPayload's tlv() throw (an empty
  // NAPAS bank-transfer TLV) and take the whole section down with it, so
  // half-filled accounts are filtered out here rather than trusted.
  const completeAccounts = accounts.filter((account) => account.bankBin && account.accountNumber);
  if (completeAccounts.length === 0) return null;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold text-[var(--primary)]">{title}</h2>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>
      <div className="grid w-full grid-cols-1 gap-4 min-[360px]:grid-cols-2">
        {completeAccounts.map((account, index) => (
          // Accounts have no stable id in the schema (whole-list replace from
          // the editor), same rationale as EventsSection's index key.
          <GiftAccountCard key={index} account={account} />
        ))}
      </div>
    </SectionWrapper>
  );
}
