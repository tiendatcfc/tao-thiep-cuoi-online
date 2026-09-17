"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_IMPORT_ROWS, parseGuestFile, type GuestDraft } from "@/lib/guest-import";
import type { Guest } from "./GuestTable";

export interface GuestImportDialogProps {
  invitationId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the rows the API actually created, newest-first like the table expects. */
  onImported: (guests: Guest[]) => void;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const IMPORT_ERROR_MESSAGE = "Không thể nhập danh sách, vui lòng thử lại.";
const PREVIEW_LIMIT = 20;

interface CreateGuestResponse {
  guests?: Guest[];
  error?: string;
}

/**
 * Bulk guest import from a `.csv` / `.xlsx` the owner picks.
 *
 * The file never leaves the browser — `parseGuestFile` reads it here and only
 * the reviewed JSON rows are POSTed to the existing guests endpoint, so no new
 * upload route exists and the server never parses a spreadsheet.
 *
 * Mirrors `PublishDialog`'s shell (overlay, `role="dialog" aria-modal`, Escape
 * to close, Tab focus trap) rather than introducing a second dialog idiom.
 */
export function GuestImportDialog({ invitationId, open, onClose, onImported }: GuestImportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<GuestDraft[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset when the dialog is re-opened so a previous file's preview never
  // shows up above a newly picked one.
  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setRows([]);
    setSkipped(0);
    setWarnings([]);
    setError(null);
    setParsing(false);
    setImporting(false);
  }, [open]);

  // Focus trap + Escape, keyed on `[open]` alone for the same reason
  // `PublishDialog` is: the parent passes a fresh `onClose` closure on every
  // render, and depending on it would yank focus back on unrelated re-renders.
  useEffect(() => {
    if (!open) return;

    const dialogEl = dialogRef.current;
    Array.from(dialogEl?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .find((el) => el.tabIndex >= 0)
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogEl) return;

      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        // `tabIndex >= 0` drops the visually-hidden file input, which the
        // selector's bare `input` would otherwise trap focus onto.
        (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Re-picking the SAME file must re-parse, and a file input only fires
    // `change` when the value differs — clearing it here is what allows that.
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setError(null);
    setFileName(file.name);
    const result = await parseGuestFile(file);
    setRows(result.rows);
    setSkipped(result.skipped);
    setWarnings(result.warnings);
    setParsing(false);
  }

  async function handleImport() {
    if (rows.length === 0 || importing) return;

    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/guests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guests: rows }),
      });
      const body: CreateGuestResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" && body.error ? body.error : IMPORT_ERROR_MESSAGE);
        return;
      }
      onImported(body.guests ?? []);
      onClose();
    } catch {
      setError(IMPORT_ERROR_MESSAGE);
    } finally {
      setImporting(false);
    }
  }

  const preview = rows.slice(0, PREVIEW_LIMIT);
  const hiddenCount = rows.length - preview.length;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Nhập khách từ file"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Nhập khách từ file</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 transition hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-600">
          Chọn file CSV hoặc Excel có cột <strong>Tên</strong> (kèm <strong>Nhóm</strong> và{" "}
          <strong>Ghi chú</strong> nếu có). File được đọc ngay trên máy bạn, không tải lên máy chủ. Tối đa{" "}
          {MAX_IMPORT_ROWS} khách mỗi lần.
        </p>

        {/*
         * The native input is visually hidden and driven by the button below.
         * Two reasons, both user-visible: its built-in "Choose File / No file
         * chosen" label is supplied by the browser in ITS locale, not
         * Vietnamese; and `handleFileChange` clears `value` so the same file
         * can be picked twice, which would leave that native label stuck on
         * "No file chosen" right next to a filled-in preview. `fileName`
         * below is the honest status line instead.
         */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileChange}
          className="sr-only"
          // Taken out of the tab order on purpose: the visible button below is
          // the real control for both mouse and keyboard, and leaving this in
          // would give one control two tab stops, the first of them invisible.
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            {fileName ? "Chọn file khác" : "Chọn file"}
          </button>
          <span className="text-sm text-gray-600">{fileName ?? "Chưa chọn file nào"}</span>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {parsing && <p className="text-sm text-gray-600">Đang đọc {fileName}…</p>}

          {!parsing && warnings.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {!parsing && skipped > 0 && (
            <p className="mb-3 text-sm text-gray-600">Đã bỏ qua {skipped} dòng không có tên.</p>
          )}

          {!parsing && rows.length > 0 && (
            <>
              <p className="mb-2 text-sm font-medium text-gray-900">
                Sẽ nhập {rows.length} khách
                {hiddenCount > 0 && ` (xem trước ${preview.length} dòng đầu)`}
              </p>
              {/* Own horizontal scroller: a long unbroken note (a URL, say)
                  would otherwise push the 3-column table past a narrow phone. */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-3 py-2 font-medium">Tên</th>
                      <th className="px-3 py-2 font-medium">Nhóm</th>
                      <th className="px-3 py-2 font-medium">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={`${row.name}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{row.name}</td>
                        <td className="px-3 py-2 text-gray-600">{row.group ?? "–"}</td>
                        <td className="px-3 py-2 text-gray-600">{row.note ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hiddenCount > 0 && (
                <p className="mt-2 text-sm text-gray-500">…và {hiddenCount} khách nữa.</p>
              )}
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={rows.length === 0 || importing || parsing}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "Đang nhập…" : rows.length === 0 ? "Nhập khách" : `Nhập ${rows.length} khách`}
          </button>
        </div>
      </div>
    </div>
  );
}
