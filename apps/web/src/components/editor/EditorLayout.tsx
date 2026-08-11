"use client";

import type { InvitationDocument } from "@hpwd/schema";
import { createContext, useContext, useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { PreviewPane } from "./PreviewPane";
import { SectionList } from "./SectionList";
import { useAutosave } from "./useAutosave";

const PLACEHOLDER_TEXT = "Chọn một mục để chỉnh sửa";

function formatSavedAt(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function PublishButton() {
  return (
    <button
      type="button"
      disabled
      title="Sắp có"
      className="cursor-not-allowed rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-500"
    >
      Xuất bản
    </button>
  );
}

function SaveStatus() {
  const saving = useEditorStore((state) => state.saving);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const { error } = useAutosaveStatusContext();

  let text = "";
  if (saving) {
    text = "Đang lưu…";
  } else if (error) {
    text = "Lưu thất bại — sẽ thử lại";
  } else if (lastSavedAt) {
    text = `Đã lưu lúc ${formatSavedAt(lastSavedAt)}`;
  }

  return (
    <span role="status" className="text-xs text-gray-500">
      {text}
    </span>
  );
}

/**
 * `useAutosave`'s `{ error }` isn't in the store (see the hook's own
 * comment for why), but both the desktop header and the mobile tab bar
 * need it, and mounting `useAutosave` twice would schedule two competing
 * PATCHes. This tiny context lets `EditorLayout` own the single hook
 * instance and hand the result down to both status displays.
 */
const AutosaveStatusContext = createContext<{ error: boolean }>({ error: false });
function useAutosaveStatusContext() {
  return useContext(AutosaveStatusContext);
}

function EditorPanel() {
  const selectedSectionId = useEditorStore((state) => state.selectedSectionId);
  if (!selectedSectionId) {
    return <p className="p-4 text-sm text-gray-400">{PLACEHOLDER_TEXT}</p>;
  }
  // Task 16 fills this in with the property panel for `selectedSectionId`.
  return <div className="p-4" />;
}

export interface EditorLayoutProps {
  invitationId: string;
  slug: string;
  initialDocument: InvitationDocument;
}

/**
 * Three-pane editor shell: section list, live preview, property panel
 * (placeholder until Task 16). Below 1024px the three panes collapse into
 * tabs instead of columns, since there's no room to show them side by side
 * on a phone-sized screen — which is also the size couples are most likely
 * to be editing from, alongside a laptop.
 */
export function EditorLayout({ invitationId, slug, initialDocument }: EditorLayoutProps) {
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

  return (
    <AutosaveStatusContext.Provider value={autosave}>
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <p className="truncate text-sm font-semibold text-gray-900">{slug}</p>
          <div className="flex items-center gap-4">
            <SaveStatus />
            <PublishButton />
          </div>
        </header>

        {/* ≥1024px: three columns side by side. */}
        <div className="hidden flex-1 overflow-hidden lg:grid lg:grid-cols-[280px_1fr_320px]">
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

        {/* <1024px: one pane at a time via tabs. */}
        <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
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
      </div>
    </AutosaveStatusContext.Provider>
  );
}
