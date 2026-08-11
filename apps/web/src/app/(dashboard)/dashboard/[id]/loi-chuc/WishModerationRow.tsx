"use client";

import { useState } from "react";
import { formatVietnameseDate } from "@/lib/date";

export interface WishModerationRowProps {
  invitationId: string;
  wishId: string;
  guestName: string;
  message: string;
  createdAt: string;
  initialIsHidden: boolean;
}

/**
 * One moderation row: shows a guest wish and a button that PATCHes
 * `/api/invitations/[id]/wishes/[wishId]` to flip `isHidden`. Local state
 * updates optimistically-on-success (not before — an update that actually
 * fails shouldn't silently flip the label) rather than a full page
 * reload/server action round-trip, which felt like overkill for a single
 * boolean toggle.
 */
export function WishModerationRow({
  invitationId,
  wishId,
  guestName,
  message,
  createdAt,
  initialIsHidden,
}: WishModerationRowProps) {
  const [isHidden, setIsHidden] = useState(initialIsHidden);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setIsSaving(true);
    setError(null);
    const nextIsHidden = !isHidden;

    try {
      const res = await fetch(`/api/invitations/${invitationId}/wishes/${wishId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isHidden: nextIsHidden }),
      });
      if (!res.ok) {
        setError("Không thể cập nhật, vui lòng thử lại.");
        return;
      }
      setIsHidden(nextIsHidden);
    } catch {
      setError("Không thể cập nhật, vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li
      className={`rounded-xl border p-4 ${isHidden ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{guestName}</p>
          <p className="text-xs text-gray-400">
            {formatVietnameseDate(createdAt, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isSaving}
          className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {isSaving ? "Đang lưu..." : isHidden ? "Hiện lại" : "Ẩn"}
        </button>
      </div>
      <p className={`mt-2 whitespace-pre-line text-sm ${isHidden ? "text-gray-400" : "text-gray-700"}`}>
        {message}
      </p>
      {isHidden ? (
        <p className="mt-1 text-xs text-amber-600">Đang ẩn — không hiển thị công khai trên thiệp</p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </li>
  );
}
