"use client";

import type { InvitationDocument } from "@hpwd/schema";
import { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { AutosaveStatusContext, useAutosaveStatusContext } from "./AutosaveStatusContext";
import { EditorPanel } from "./EditorPanel";
import { PreviewPane } from "./PreviewPane";
import { PublishDialog } from "./PublishDialog";
import { SectionList } from "./SectionList";
import { useAutosave } from "./useAutosave";
import { useMediaQuery } from "./useMediaQuery";

const DESKTOP_QUERY = "(min-width: 1024px)";

function formatSavedAt(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function PublishButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
    >
      Xuất bản
    </button>
  );
}

/**
 * C5: "Lưu thất bại — sẽ thử lại" (was "network" error's copy) was a lie —
 * `useAutosave` starts no retry loop on a network failure; without a
 * further edit (or this button), the document just sits `dirty` forever.
 * The manual retry calls the same `flush()` `PublishDialog` uses (C2) to
 * force an immediate save and surface its real outcome.
 */
function RetryButton() {
  const { flush } = useAutosaveStatusContext();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await flush();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={retrying}
      className="text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {retrying ? "Đang thử lại…" : "Thử lưu lại"}
    </button>
  );
}

function SaveStatus() {
  const saving = useEditorStore((state) => state.saving);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const { error } = useAutosaveStatusContext();

  if (saving) {
    return (
      <span role="status" className="text-xs text-gray-500">
        Đang lưu…
      </span>
    );
  }

  if (error === "invalid") {
    // Distinct from the network-failure message on purpose: whole-document
    // validation means retrying against the network can never succeed here
    // — the fix has to happen in whatever field is currently invalid, not
    // by waiting it out (so no retry button here — there's nothing a retry
    // could fix).
    return (
      <span role="status" className="text-xs font-medium text-red-700">
        Nội dung chưa hợp lệ, chưa thể lưu — vui lòng kiểm tra lại mục đang chỉnh sửa.
      </span>
    );
  }

  if (error === "network") {
    // C5: visually distinct from the (gray, unremarkable) success state
    // below — a couple silently losing edits because they never noticed a
    // gray status line change is exactly the failure mode this exists to
    // prevent.
    return (
      <span role="status" className="flex items-center gap-2 text-xs font-medium text-red-700">
        Lưu thất bại — vui lòng thử lưu lại.
        <RetryButton />
      </span>
    );
  }

  return (
    <span role="status" className="text-xs text-gray-500">
      {lastSavedAt ? `Đã lưu lúc ${formatSavedAt(lastSavedAt)}` : ""}
    </span>
  );
}

export interface EditorLayoutProps {
  invitationId: string;
  slug: string;
  initialDocument: InvitationDocument;
  initialShowBadge: boolean;
}

/**
 * Three-pane editor shell: section list, live preview, property panel
 * (`EditorPanel` — Task 16). Below 1024px the three panes collapse into
 * tabs instead of columns, since there's no room to show them side by side
 * on a phone-sized screen — which is also the size couples are most likely
 * to be editing from, alongside a laptop.
 */
export function EditorLayout({ invitationId, slug, initialDocument, initialShowBadge }: EditorLayoutProps) {
  const setDocument = useEditorStore((state) => state.setDocument);
  useEffect(() => {
    setDocument(initialDocument);
    // Seed once on mount with the document the server loaded — deliberately
    // not re-running if `initialDocument` changes identity on a later
    // parent re-render, which would clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autosave = useAutosave(invitationId);
  const [mobileTab, setMobileTab] = useState<"list" | "preview" | "edit">("preview");
  const [publishOpen, setPublishOpen] = useState(false);
  // Exactly one of the two layouts below renders — never both. Rendering
  // both simultaneously and hiding one with CSS (the previous approach)
  // mounted `PreviewPane` — and the real `InvitePage` tree inside it —
  // twice at all times, regardless of viewport, doubling up whatever side
  // effects live inside it (audio element, opening-animation timers, ...).
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return (
    <AutosaveStatusContext.Provider value={autosave}>
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{slug}</p>
          <div className="flex items-center gap-4">
            <SaveStatus />
            <PublishButton onClick={() => setPublishOpen(true)} />
          </div>
        </header>

        {isDesktop ? (
          <div className="grid flex-1 grid-cols-[280px_1fr_320px] overflow-hidden">
            <div className="overflow-y-auto border-r border-gray-200">
              <SectionList />
            </div>
            <div className="overflow-y-auto">
              <PreviewPane />
            </div>
            <div className="overflow-y-auto border-l border-gray-200">
              <EditorPanel />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex border-b border-gray-200">
              {(
                [
                  { key: "list", label: "Mục" },
                  { key: "preview", label: "Xem trước" },
                  { key: "edit", label: "Chỉnh sửa" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMobileTab(tab.key)}
                  aria-current={mobileTab === tab.key}
                  className={`flex-1 py-2 text-sm ${
                    mobileTab === tab.key
                      ? "border-b-2 border-rose-500 font-medium text-rose-600"
                      : "text-gray-500"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {mobileTab === "list" && <SectionList />}
              {mobileTab === "preview" && <PreviewPane />}
              {mobileTab === "edit" && <EditorPanel />}
            </div>
          </div>
        )}
      </div>
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        invitationId={invitationId}
        slug={slug}
        initialShowBadge={initialShowBadge}
      />
    </AutosaveStatusContext.Provider>
  );
}
