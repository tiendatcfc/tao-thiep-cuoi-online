"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVietnameseDate } from "@/lib/date";

export interface DashboardInvitation {
  id: string;
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  viewCount: number;
  updatedAt: string;
  coverNames: string;
}

export interface InvitationCardProps {
  invitation: DashboardInvitation;
}

const DELETE_CONFIRM_MESSAGE = "Bạn có chắc muốn xoá thiệp này? Hành động này không thể hoàn tác.";
const DELETE_ERROR_MESSAGE = "Không thể xoá thiệp, vui lòng thử lại.";

/**
 * One invitation card on `/dashboard`. A client component (not the plain
 * server-rendered list around it) purely because "Xoá" needs a confirm
 * dialog + a DELETE request + a router refresh — everything else here is
 * static given its props.
 */
export function InvitationCard({ invitation }: InvitationCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublished = invitation.status === "published";

  async function handleDelete() {
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) return;

    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${invitation.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(DELETE_ERROR_MESSAGE);
        setIsDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      setError(DELETE_ERROR_MESSAGE);
      setIsDeleting(false);
    }
  }

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{invitation.coverNames}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isPublished ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {isPublished ? "Đã xuất bản" : "Nháp"}
        </span>
      </div>

      <p className="mt-1 text-xs text-gray-400">
        Cập nhật lúc {formatVietnameseDate(invitation.updatedAt, { hour: "2-digit", minute: "2-digit" })}
        {isPublished ? ` · ${invitation.viewCount} lượt xem` : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/editor/${invitation.id}`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Chỉnh sửa
        </Link>
        {isPublished ? (
          <Link
            href={`/i/${invitation.slug}`}
            className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Xem
          </Link>
        ) : null}
        <Link
          href={`/dashboard/${invitation.id}/khach-moi`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Khách mời
        </Link>
        <Link
          href={`/dashboard/${invitation.id}/loi-chuc`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Lời chúc
        </Link>
        <Link
          href={`/dashboard/${invitation.id}/phan-hoi`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Phản hồi
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-lg border border-red-200 px-3 py-1.5 font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {isDeleting ? "Đang xoá..." : "Xoá"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </li>
  );
}
