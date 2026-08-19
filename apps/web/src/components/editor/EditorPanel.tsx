"use client";

import { Component, useState, type ReactNode } from "react";
import type { ComponentType } from "react";
import type { Section } from "@hpwd/schema";
import { useEditorStore } from "@/stores/editor-store";
import { AnimationControl } from "./AnimationControl";
import { MusicPanel } from "./panels/MusicPanel";
import { OpeningPanel } from "./panels/OpeningPanel";
import { panelRegistry } from "./panels";
import { ThemePanel } from "./panels/ThemePanel";
import { SECTION_TYPE_LABELS } from "./section-labels";

type DocumentTab = "theme" | "music" | "opening";

const DOCUMENT_TABS: { key: DocumentTab; label: string }[] = [
  { key: "theme", label: "Giao diện" },
  { key: "music", label: "Nhạc nền" },
  { key: "opening", label: "Hiệu ứng mở màn" },
];

/**
 * The document being edited is user-authored and can transiently violate a
 * section's own prop expectations mid-edit (same rationale as
 * `PreviewPane`'s error boundary — see its docstring). Without this, one
 * bad access in a panel would blank the whole editor chrome via React's
 * default "throw to the nearest boundary" behaviour, since there is none
 * above this point in `EditorLayout`. Resets whenever the live `document`
 * changes (`resetKey`), so fixing the offending field tries the panel
 * again instead of being stuck on the fallback for the rest of the
 * session.
 */
class PanelErrorBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("EditorPanel: a property panel threw while rendering", error);
  }

  componentDidUpdate(prevProps: { resetKey: unknown }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center text-sm text-gray-500">Không thể hiển thị bảng chỉnh sửa cho mục này.</div>
      );
    }
    return this.props.children;
  }
}

function DocumentTabs() {
  const [tab, setTab] = useState<DocumentTab>("theme");

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" className="flex border-b border-gray-200">
        {DOCUMENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm ${
              tab === t.key ? "border-b-2 border-rose-500 font-medium text-rose-600" : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "theme" && <ThemePanel />}
        {tab === "music" && <MusicPanel />}
        {tab === "opening" && <OpeningPanel />}
      </div>
    </div>
  );
}

/**
 * Right pane of the editor (Task 15's placeholder): the selected section's
 * property panel, looked up in `panelRegistry` — or, when nothing is
 * selected (or the selected id no longer exists, e.g. just deleted), the
 * document-level tabs for theme/music/opening.
 */
export function EditorPanel() {
  const selectedSectionId = useEditorStore((state) => state.selectedSectionId);
  const section = useEditorStore((state) => state.document.sections.find((s) => s.id === selectedSectionId));
  const document = useEditorStore((state) => state.document);

  if (!section) {
    return (
      <PanelErrorBoundary resetKey={document}>
        <DocumentTabs />
      </PanelErrorBoundary>
    );
  }

  const Panel = panelRegistry[section.type] as ComponentType<{ section: Section }>;

  return (
    <div className="flex h-full flex-col">
      <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
        {SECTION_TYPE_LABELS[section.type]}
      </h2>
      <div className="flex-1 overflow-y-auto p-4">
        <PanelErrorBoundary resetKey={document}>
          <Panel section={section} />
          <AnimationControl section={section} />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
