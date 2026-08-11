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

/** "0123456789" -> "0123 4567 89" — purely cosmetic, doesn't touch the value that gets copied/encoded. */
function formatAccountNumber(accountNumber: string): string {
  return accountNumber.match(/.{1,4}/g)?.join(" ") ?? accountNumber;
}

function GiftAccountCard({ account }: { account: GiftProps["accounts"][number] }) {
  const [copied, setCopied] = useState(false);

  const payload = buildVietQRPayload({
    bankBin: account.bankBin,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    message: "Mung cuoi",
  });

  function handleCopy() {
    navigator.clipboard.writeText(account.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
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
      <p className="font-mono text-sm text-gray-700">{formatAccountNumber(account.accountNumber)}</p>
      <p className="text-sm text-gray-600">{account.accountName.toUpperCase()}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 rounded-full border border-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white"
      >
        {copied ? "Đã sao chép!" : "Sao chép STK"}
      </button>
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
  if (accounts.length === 0) return null;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold text-[var(--primary)]">{title}</h2>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>
      <div className="grid w-full grid-cols-1 gap-4 min-[360px]:grid-cols-2">
        {accounts.map((account, index) => (
          // Accounts have no stable id in the schema (whole-list replace from
          // the editor), same rationale as EventsSection's index key.
          <GiftAccountCard key={index} account={account} />
        ))}
      </div>
    </SectionWrapper>
  );
}
