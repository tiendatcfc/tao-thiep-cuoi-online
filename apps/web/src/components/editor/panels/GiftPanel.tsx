"use client";

import { useId, useState } from "react";
import type { Bank } from "@/lib/banks";
import { BANKS } from "@/lib/banks";
import { removeDiacritics } from "@/lib/slug";
import { buildVietQRPayload } from "@/lib/vietqr";
import type { GiftProps, Section } from "@hpwd/schema";
import { QrCode } from "@/components/QrCode";
import { useEditorStore } from "@/stores/editor-store";
import { ListField } from "../fields/ListField";
import { SelectField } from "../fields/SelectField";
import { TextAreaField } from "../fields/TextAreaField";
import { TextField } from "../fields/TextField";

type GiftAccount = GiftProps["accounts"][number];

const SIDE_OPTIONS = [
  { value: "groom", label: "Nhà trai" },
  { value: "bride", label: "Nhà gái" },
];

function normalize(s: string): string {
  return removeDiacritics(s).toLowerCase();
}

/**
 * Searchable bank combobox over the 40-entry `BANKS` list. `onSelect`
 * always hands back a whole `Bank` from that static list, so
 * `bankBin`/`bankName` are correct and `bankBin` matches
 * `GiftAccountSchema`'s `/^\d{4,8}$/` by construction — there is no path
 * for a freeform bin to reach the store.
 */
function BankPicker({ bankBin, onSelect }: { bankBin: string; onSelect: (bank: Bank) => void }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const listId = useId();
  const selected = BANKS.find((b) => b.bin === bankBin);
  const filtered = query
    ? BANKS.filter((b) => normalize(`${b.shortName} ${b.name}`).includes(normalize(query)))
    : BANKS;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500" htmlFor={inputId}>
        Ngân hàng
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={query.length > 0}
        aria-controls={listId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={selected ? `${selected.shortName} — ${selected.name}` : "Tìm ngân hàng…"}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none"
      />
      {query ? (
        <ul id={listId} role="listbox" className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-400">Không tìm thấy ngân hàng phù hợp.</li>
          ) : (
            filtered.map((bank) => (
              <li key={bank.bin}>
                <button
                  type="button"
                  role="option"
                  aria-selected={bank.bin === bankBin}
                  onClick={() => {
                    onSelect(bank);
                    setQuery("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-rose-50"
                >
                  {bank.shortName} — {bank.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : selected ? (
        <p className="text-sm text-gray-700">{selected.shortName} — {selected.name}</p>
      ) : (
        <p className="text-xs text-amber-600">Chưa chọn ngân hàng.</p>
      )}
    </div>
  );
}

function GiftAccountFields({ account, onChange }: { account: GiftAccount; onChange: (next: GiftAccount) => void }) {
  let qrPayload: string | null = null;
  if (account.bankBin && account.accountNumber) {
    try {
      // Same fixed message `GiftSection` (the real, guest-facing renderer)
      // embeds, so this preview matches exactly what the QR guests scan
      // will actually encode.
      qrPayload = buildVietQRPayload({
        bankBin: account.bankBin,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        message: "Mung cuoi",
      });
    } catch {
      qrPayload = null;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label="Bên"
        value={account.side}
        onChange={(v) => onChange({ ...account, side: v as GiftAccount["side"] })}
        options={SIDE_OPTIONS}
      />
      <BankPicker bankBin={account.bankBin} onSelect={(bank) => onChange({ ...account, bankBin: bank.bin, bankName: bank.shortName })} />
      <TextField
        label="Số tài khoản"
        value={account.accountNumber}
        maxLength={30}
        sanitize={(raw) => raw.replace(/\D/g, "")}
        onChange={(v) => onChange({ ...account, accountNumber: v })}
      />
      <TextField
        label="Tên chủ tài khoản"
        value={account.accountName}
        maxLength={50}
        sanitize={(raw) => removeDiacritics(raw).toUpperCase()}
        onChange={(v) => onChange({ ...account, accountName: v })}
      />
      {qrPayload ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-3">
          <QrCode value={qrPayload} size={140} />
          <p className="text-xs text-gray-400">Xem trước mã QR chuyển khoản</p>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Chọn ngân hàng và nhập số tài khoản để xem mã QR.</p>
      )}
    </div>
  );
}

export function GiftPanel({ section }: { section: Extract<Section, { type: "gift" }> }) {
  const updateSectionProps = useEditorStore((state) => state.updateSectionProps);
  const { title, description, accounts } = section.props;

  function patch(next: Partial<GiftProps>) {
    updateSectionProps(section.id, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Tiêu đề" value={title} onChange={(v) => patch({ title: v })} />
      <TextAreaField label="Mô tả" value={description} onChange={(v) => patch({ description: v })} />
      <ListField<GiftAccount>
        label="Tài khoản nhận mừng cưới"
        items={accounts}
        onChange={(next) => patch({ accounts: next })}
        // `GiftAccountSchema` requires a `bankBin` matching `/^\d{4,8}$/` and
        // a non-empty `accountNumber` (see the schema comment) — seeding
        // `""` for either used to make the freshly-added item fail
        // `InvitationDocumentSchema.parse` immediately, which made
        // `useAutosave` treat the WHOLE document as invalid and silently
        // stop persisting ANY further edit anywhere (see the
        // panels.schema-integration test, which now exercises exactly this
        // "+ Thêm" and re-renders to catch it). Seeding a real bank
        // (Vietcombank, the first NAPAS BIN in `BANKS`) and a minimal valid
        // account number keeps the document schema-valid the instant the
        // couple clicks "+ Thêm" — they're expected to overwrite both via
        // the bank picker / account number field right after.
        createItem={() => ({
          side: "groom",
          bankBin: "970436",
          bankName: "Vietcombank",
          accountNumber: "0",
          accountName: "",
        })}
        itemLabel={(account, i) => account.bankName || `Tài khoản ${i + 1}`}
        emptyMessage="Chưa có tài khoản nào."
        renderItem={(account, _index, update) => <GiftAccountFields account={account} onChange={update} />}
      />
    </div>
  );
}
