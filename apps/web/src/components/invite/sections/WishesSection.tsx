"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Section } from "@hpwd/schema";
import { formatVietnameseDate } from "@/lib/date";
import { useInviteContext } from "../InviteContext";
import { SectionWrapper } from "./SectionWrapper";

interface WishItem {
  id: string;
  guestName: string;
  message: string;
  createdAt: string;
}

interface WishesListResponse {
  wishes: WishItem[];
  nextCursor: string | null;
}

const GUEST_NAME_MAX_LENGTH = 80;
const MESSAGE_MAX_LENGTH = 500;

const RATE_LIMIT_MESSAGE = "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút.";
const GENERIC_ERROR_MESSAGE = "Có lỗi xảy ra, vui lòng thử lại.";
const PENDING_APPROVAL_MESSAGE = "Cảm ơn bạn! Lời chúc sẽ hiển thị sau khi được duyệt.";
const SUCCESS_MESSAGE = "Cảm ơn bạn đã gửi lời chúc!";
const PREVIEW_NOTE = "Xem trước — lời chúc sẽ hoạt động sau khi xuất bản";

/**
 * Guest wishes: a submit form plus a paginated list of already-approved
 * wishes. `slug` (from `InviteContext`) is `null` in the editor's preview —
 * there's no published invitation to submit against yet, so the form is
 * shown but disabled with an explanatory note instead of hitting the API.
 */
export function WishesSection({ section }: { section: Extract<Section, { type: "wishes" }> }) {
  const { title, description, requireApproval } = section.props;
  const { slug } = useInviteContext();

  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Fetches the first page once we know the real slug (never in preview).
  // A subsequent submit races this on a very fast connection — that's
  // accepted here (see report): the initial fetch reflects DB state at the
  // moment it was issued, and a wish created a moment later is still safely
  // persisted server-side even if this particular snapshot predates it.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setIsLoadingList(true);

    fetch(`/api/invites/${slug}/wishes`)
      .then((res) => (res.ok ? (res.json() as Promise<WishesListResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setWishes(data.wishes);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {
        // Leave the list empty — the form above still works regardless.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleLoadMore() {
    if (!slug || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/invites/${slug}/wishes?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) return;
      const data: WishesListResponse = await res.json();
      setWishes((prev) => [...prev, ...data.wishes]);
      setNextCursor(data.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/invites/${slug}/wishes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestName, message }),
      });

      if (res.status === 201) {
        const data: { wish: WishItem } = await res.json();
        setGuestName("");
        setMessage("");
        if (requireApproval) {
          // Held for moderation — don't show it as if it were already public.
          setFeedback({ kind: "success", text: PENDING_APPROVAL_MESSAGE });
        } else {
          setWishes((prev) => [data.wish, ...prev]);
          setFeedback({ kind: "success", text: SUCCESS_MESSAGE });
        }
        return;
      }

      if (res.status === 429) {
        setFeedback({ kind: "error", text: RATE_LIMIT_MESSAGE });
        return;
      }

      if (res.status === 400) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setFeedback({ kind: "error", text: data.error ?? GENERIC_ERROR_MESSAGE });
        return;
      }

      setFeedback({ kind: "error", text: GENERIC_ERROR_MESSAGE });
    } catch {
      setFeedback({ kind: "error", text: GENERIC_ERROR_MESSAGE });
    } finally {
      setIsSubmitting(false);
    }
  }

  const formDisabled = !slug;

  return (
    <SectionWrapper section={section} className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold text-[var(--primary)]">{title}</h2>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        {formDisabled ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">
            {PREVIEW_NOTE}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Tên của bạn
          <input
            type="text"
            required
            maxLength={GUEST_NAME_MAX_LENGTH}
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            disabled={formDisabled || isSubmitting}
            placeholder="Nhập tên của bạn"
            className="rounded-lg border border-[var(--secondary)] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--primary)] disabled:bg-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-700">
          Lời chúc
          <textarea
            required
            rows={3}
            maxLength={MESSAGE_MAX_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={formDisabled || isSubmitting}
            placeholder="Gửi lời chúc phúc đến cô dâu chú rể..."
            className="resize-none rounded-lg border border-[var(--secondary)] px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--primary)] disabled:bg-gray-100"
          />
        </label>

        <button
          type="submit"
          disabled={formDisabled || isSubmitting}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? "Đang gửi..." : "Gửi lời chúc"}
        </button>

        {feedback ? (
          <p
            role="status"
            className={
              feedback.kind === "success"
                ? "text-center text-sm text-green-600"
                : "text-center text-sm text-red-600"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </form>

      <div className="flex w-full flex-col gap-3">
        {isLoadingList ? (
          <p className="text-center text-sm text-gray-400">Đang tải lời chúc...</p>
        ) : (
          wishes.map((wish) => (
            <div key={wish.id} className="rounded-xl border border-[var(--secondary)] bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--primary)]">{wish.guestName}</p>
                <p className="text-xs text-gray-400">{formatVietnameseDate(wish.createdAt)}</p>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{wish.message}</p>
            </div>
          ))
        )}

        {!isLoadingList && wishes.length === 0 && !formDisabled ? (
          <p className="text-center text-sm text-gray-400">Chưa có lời chúc nào. Hãy là người đầu tiên!</p>
        ) : null}

        {nextCursor ? (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="mx-auto rounded-full border border-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary)] disabled:opacity-50"
          >
            {isLoadingMore ? "Đang tải..." : "Xem thêm"}
          </button>
        ) : null}
      </div>
    </SectionWrapper>
  );
}
