"use client";

import { useEffect, useState, type FormEvent } from "react";
import { buildGuestLink } from "@/lib/guest-links";
import { GuestImportDialog } from "./GuestImportDialog";

export interface Guest {
  id: string;
  name: string;
  group: string | null;
  token: string;
  viewedAt: string | null;
  createdAt: string;
}

export interface GuestTableProps {
  invitationId: string;
  slug: string;
  status: "draft" | "published";
  initialGuests: Guest[];
  /**
   * `NEXT_PUBLIC_SITE_URL`, read server-side and passed down — often empty
   * in local dev, where that env var isn't set. When empty, this component
   * resolves the real origin from `window.location.origin` itself, but only
   * inside `useEffect` (see the state below), never during render.
   */
  origin: string;
}

const ADD_ERROR_MESSAGE = "Không thể thêm khách, vui lòng thử lại.";
const EDIT_ERROR_MESSAGE = "Không thể lưu, vui lòng thử lại.";
const DELETE_ERROR_MESSAGE = "Không thể xoá khách, vui lòng thử lại.";
const DELETE_CONFIRM_MESSAGE =
  "Bạn có chắc muốn xoá khách này? Liên kết thiệp cá nhân hoá của khách sẽ ngừng hoạt động.";
const COPY_CONFIRMATION_MS = 2000;

interface CreateGuestResponse {
  guests?: Guest[];
  error?: string;
}

interface UpdateGuestResponse {
  guest?: Guest;
  error?: string;
}

interface EditDraft {
  name: string;
  group: string;
}

/**
 * Owner-facing guest list for one invitation: quick-add form, per-guest
 * personalized link (copy-to-clipboard + "Chia sẻ Zalo"), inline delete.
 * `"use client"` because every one of those needs local state and/or a
 * `fetch` — the server component (`page.tsx`) only supplies the initial
 * data.
 */
export function GuestTable({ invitationId, slug, status, initialGuests, origin: initialOrigin }: GuestTableProps) {
  const [guests, setGuests] = useState<Guest[]>(initialGuests);
  const [origin, setOrigin] = useState(initialOrigin);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Which guest's row is currently in edit mode (name/group turned into
  // inputs) — `null` when none is. Only one row can be edited at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: "", group: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Hydration fix (same shape as `GiftSection`'s `clipboardUnavailable`,
  // see its docstring): `navigator.clipboard` must never be read during
  // render — a real Node SSR environment has no `navigator.clipboard`, a
  // real browser client does, so reading it synchronously at render time
  // makes SSR and the client's first render disagree. Assume the common
  // case (available, so the button renders) on both, then correct here
  // once the real capability is known.
  const [clipboardUnavailable, setClipboardUnavailable] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
      setClipboardUnavailable(true);
    }
  }, []);

  // `NEXT_PUBLIC_SITE_URL` may be unset locally, in which case `page.tsx`
  // passes `""`. Reading `window.location.origin` is itself a browser-only
  // capability, so — same rule as the clipboard check above — it only
  // happens here, never during render; the server and the client's first
  // render both start from the same (possibly empty) `initialOrigin`, so
  // there's nothing for them to disagree on.
  useEffect(() => {
    if (!origin && typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, [origin]);

  const originKnown = origin !== "";
  const viewedCount = guests.filter((guest) => guest.viewedAt).length;

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || adding) return;

    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/guests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          guests: [{ name: trimmedName, group: group.trim() || undefined }],
        }),
      });
      const body: CreateGuestResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(typeof body.error === "string" && body.error ? body.error : ADD_ERROR_MESSAGE);
        return;
      }
      const created = body.guests?.[0];
      if (created) {
        setGuests((prev) => [created, ...prev]);
        setName("");
        setGroup("");
      }
    } catch {
      setAddError(ADD_ERROR_MESSAGE);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(guest: Guest) {
    setEditingId(guest.id);
    setEditDraft({ name: guest.name, group: guest.group ?? "" });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  /**
   * PATCHes name/group only — the guest's `token` (and therefore every
   * personalized link already sent out) never changes. That's the whole
   * reason this exists instead of telling the couple to delete and re-add a
   * guest to fix a typo: delete+re-add would mint a fresh `token` and
   * silently break any link already shared for the old one.
   */
  async function handleSaveEdit(guestId: string) {
    const trimmedName = editDraft.name.trim();
    if (!trimmedName || editSaving) return;

    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/guests/${guestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, group: editDraft.group.trim() || null }),
      });
      const body: UpdateGuestResponse = await res.json().catch(() => ({}));
      if (!res.ok || !body.guest) {
        setEditError(typeof body.error === "string" && body.error ? body.error : EDIT_ERROR_MESSAGE);
        return;
      }
      const updated = body.guest;
      setGuests((prev) => prev.map((g) => (g.id === guestId ? updated : g)));
      setEditingId(null);
    } catch {
      setEditError(EDIT_ERROR_MESSAGE);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(guestId: string) {
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) return;

    setDeleteError(null);
    const previous = guests;
    setGuests((prev) => prev.filter((guest) => guest.id !== guestId));
    try {
      const res = await fetch(`/api/invitations/${invitationId}/guests/${guestId}`, { method: "DELETE" });
      if (!res.ok) {
        setGuests(previous);
        setDeleteError(DELETE_ERROR_MESSAGE);
      }
    } catch {
      setGuests(previous);
      setDeleteError(DELETE_ERROR_MESSAGE);
    }
  }

  async function handleCopy(guest: Guest) {
    // Same rationale as `GiftSection`'s copy button: in-app WebViews often
    // don't expose `navigator.clipboard` at all, and calling `.writeText`
    // unguarded throws synchronously in the click handler.
    if (!navigator.clipboard?.writeText) return;

    const link = buildGuestLink(origin, slug, guest.token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(guest.id);
      setTimeout(() => setCopiedId((id) => (id === guest.id ? null : id)), COPY_CONFIRMATION_MS);
    } catch {
      // Permission denied or otherwise unsupported — leave the button as-is
      // rather than lying about success.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {status !== "published" ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Thiệp chưa được xuất bản — liên kết khách mời chỉ hoạt động sau khi xuất bản. Bạn vẫn có thể
          chuẩn bị danh sách khách từ bây giờ.
        </p>
      ) : null}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="guest-name" className="text-sm font-medium text-gray-700">
            Tên khách
          </label>
          <input
            id="guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Nguyễn Văn A"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="guest-group" className="text-sm font-medium text-gray-700">
            Nhóm (không bắt buộc)
          </label>
          <input
            id="guest-group"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Họ hàng, bạn bè, ..."
          />
        </div>
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {adding ? "Đang thêm..." : "Thêm khách"}
        </button>
        {/*
         * `type="button"` matters: this lives inside the quick-add <form>, so
         * the default `type="submit"` would fire `handleAdd` as well as open
         * the dialog.
         */}
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Nhập từ file
        </button>
      </form>
      {addError ? (
        <p role="alert" className="text-sm text-red-600">
          {addError}
        </p>
      ) : null}

      {/*
       * A single string child, not `{guests.length} khách{...}` split across
       * several JSX expressions: React needs an extra hydration marker
       * (comment node) between adjacent text-producing children to tell them
       * apart, which `renderToStaticMarkup` (used by this component's own
       * hydration-safety test, mirroring `GiftSection`'s) never emits in the
       * first place — hydrating that markup back would then genuinely
       * mismatch. One combined string sidesteps the whole issue.
       */}
      <p className="text-sm text-gray-600">
        {`${guests.length} khách${viewedCount > 0 ? ` · ${viewedCount} đã xem thiệp` : ""}`}
      </p>

      {guests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-400">
          Chưa có khách mời nào. Thêm khách đầu tiên ở trên để tạo liên kết cá nhân hoá.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          {/*
           * `data-stacked-table` (see globals.css): below 640px the rows
           * stop being a four-column grid and become stacked, labelled
           * blocks. On a phone — which is where a couple actually sends
           * these links from — four columns left the names wrapping onto
           * three lines and cut every personalised link off mid-URL inside
           * a sideways scroll.
           *
           * The ARIA roles are explicit because that restyling changes
           * `display` away from the table values, which silently strips the
           * implicit table semantics; `data-label` supplies the column name
           * each stacked cell shows in place of the (then visually hidden)
           * header row.
           */}
          <table data-stacked-table role="table" className="min-w-full divide-y divide-gray-200 text-sm">
            <thead role="rowgroup" className="bg-gray-50">
              <tr role="row">
                <th role="columnheader" className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">Tên</th>
                <th role="columnheader" className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">Nhóm</th>
                <th role="columnheader" className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                  Trạng thái
                </th>
                <th role="columnheader" className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-gray-100">
              {guests.map((guest) => {
                const link = buildGuestLink(origin, slug, guest.token);
                const zaloShareUrl = `https://zalo.me/share/link?url=${encodeURIComponent(link)}`;
                const isEditing = editingId === guest.id;

                if (isEditing) {
                  return (
                    <tr key={guest.id} role="row">
                      <td role="cell" data-label="Tên" className="px-3 py-2">
                        <input
                          value={editDraft.name}
                          onChange={(event) =>
                            setEditDraft((draft) => ({ ...draft, name: event.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td role="cell" data-label="Nhóm" className="px-3 py-2">
                        <input
                          value={editDraft.group}
                          onChange={(event) =>
                            setEditDraft((draft) => ({ ...draft, group: event.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td role="cell" data-label="Trạng thái" className="whitespace-nowrap px-3 py-2 text-gray-700">
                        {guest.viewedAt ? "Đã xem" : "Chưa xem"}
                      </td>
                      <td role="cell" data-label="Thao tác" className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(guest.id)}
                              disabled={editSaving || editDraft.name.trim().length === 0}
                              className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {editSaving ? "Đang lưu..." : "Lưu"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={editSaving}
                              className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              Huỷ
                            </button>
                          </div>
                          {editError ? <p className="text-xs text-red-600">{editError}</p> : null}
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={guest.id} role="row">
                    <td role="cell" data-label="Tên" className="px-3 py-2 font-medium text-gray-900 sm:font-normal">
                      {guest.name}
                    </td>
                    <td role="cell" data-label="Nhóm" className="px-3 py-2 text-gray-700">{guest.group ?? "-"}</td>
                    <td role="cell" data-label="Trạng thái" className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {guest.viewedAt ? "Đã xem" : "Chưa xem"}
                    </td>
                    <td role="cell" data-label="Thao tác" className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {/* `max-w-full` below the breakpoint: `max-w-xs` is
                            wider than a phone's content box, so the link ran
                            past the edge and was clipped without even an
                            ellipsis to say so. */}
                        <p className="max-w-full truncate text-xs text-gray-400 sm:max-w-xs">
                          {originKnown ? link : "Đang tải liên kết…"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {clipboardUnavailable ? (
                            <p className="text-xs text-gray-400">
                              Vui lòng bôi đen và sao chép liên kết ở trên.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopy(guest)}
                              disabled={!originKnown}
                              className="rounded-full border border-rose-500 px-3 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {copiedId === guest.id ? "Đã sao chép!" : "Sao chép link"}
                            </button>
                          )}
                          <a
                            // No `href` at all (not just visual disabling)
                            // until the origin is known — before that,
                            // `link` is only a path (`/i/{slug}?g={token}`),
                            // and a share link built from it would point
                            // Zalo at a bare path with no host, meaningless
                            // once opened outside this tab.
                            href={originKnown ? zaloShareUrl : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-disabled={!originKnown}
                            onClick={(event) => {
                              if (!originKnown) event.preventDefault();
                            }}
                            className={`rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 ${
                              originKnown ? "" : "pointer-events-none opacity-50"
                            }`}
                          >
                            Chia sẻ Zalo
                          </a>
                          <button
                            type="button"
                            onClick={() => startEdit(guest)}
                            className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(guest.id)}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Xoá
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {deleteError ? (
        <p role="alert" className="text-sm text-red-600">
          {deleteError}
        </p>
      ) : null}
      <GuestImportDialog
        invitationId={invitationId}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(created) => setGuests((prev) => [...created, ...prev])}
      />
    </div>
  );
}
