"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface UseTemplateButtonProps {
  templateId: string;
}

/**
 * The authenticated path of "Dùng mẫu này": creates a draft invitation from
 * this template (`POST /api/invitations`) and navigates straight into its
 * editor on success. Kept as its own small client component so the gallery
 * page/`TemplateGallery` itself can stay a plain, easily-testable function —
 * only this one button needs client-side interactivity.
 */
export function UseTemplateButton({ templateId }: UseTemplateButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        setError("Không thể tạo thiệp từ mẫu này, vui lòng thử lại.");
        setIsSubmitting(false);
        return;
      }
      const body: { id: string } = await res.json();
      router.push(`/editor/${body.id}`);
    } catch {
      setError("Không thể tạo thiệp từ mẫu này, vui lòng thử lại.");
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {isSubmitting ? "Đang tạo..." : "Dùng mẫu này"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
