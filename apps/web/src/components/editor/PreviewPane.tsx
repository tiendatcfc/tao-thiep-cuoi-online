"use client";

import { Component, type MouseEvent, type ReactNode } from "react";
import { InvitePage } from "@/components/invite/InvitePage";
import { useEditorStore } from "@/stores/editor-store";

/**
 * The document being edited is user-authored and can transiently be in a
 * shape one of the section components doesn't expect (e.g. mid-edit in
 * Task 16's property panels, before validation catches up). Without this,
 * a single bad prop would unmount the whole editor via React's default
 * "throw to the nearest boundary" behavior — there is none above this
 * point, so the entire page would go blank instead of just the preview.
 *
 * `resetKey` is the live `document` from the store: once caught, the next
 * document change (the couple fixing whatever caused the crash) flips
 * `hasError` back off so `render()` attempts the children again, instead of
 * being stuck on the fallback for the rest of the session. Plain React
 * error boundary state never clears itself on new props, so this reset has
 * to be done by hand.
 */
class PreviewErrorBoundary extends Component<
  { children: ReactNode; resetKey: unknown },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("PreviewPane: InvitePage threw while rendering", error);
  }

  componentDidUpdate(prevProps: { resetKey: unknown }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[400px] items-center justify-center p-6 text-center text-sm text-gray-500">
          Không thể hiển thị xem trước
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Live phone-frame preview of the document being edited: same `InvitePage`
 * component the public route renders, in the same React tree (no iframe),
 * so any store mutation shows up immediately. Clicking a section in the
 * preview selects it in the store for Task 16's property panel — sections
 * are found by walking up from the click target to the nearest
 * `[data-section-id]`, the attribute every `SectionWrapper` renders.
 */
export function PreviewPane() {
  const document = useEditorStore((state) => state.document);
  const selectSection = useEditorStore((state) => state.selectSection);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const sectionEl = target.closest("[data-section-id]");
    const id = sectionEl?.getAttribute("data-section-id");
    if (id) selectSection(id);
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-gray-100 p-6">
      <div
        data-testid="preview-pane"
        onClick={handleClick}
        className="h-[780px] w-[390px] overflow-y-auto rounded-[2rem] border border-gray-300 bg-white shadow-lg"
      >
        <PreviewErrorBoundary resetKey={document}>
          <InvitePage
            document={document}
            guestName="Nguyễn Văn An"
            settings={{ showBadge: true }}
            isPreview
            slug={null}
          />
        </PreviewErrorBoundary>
      </div>
    </div>
  );
}
