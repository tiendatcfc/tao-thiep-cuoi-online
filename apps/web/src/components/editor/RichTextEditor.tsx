"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { RICH_TEXT_CONTENT_CLASS } from "@/lib/rich-text-styles";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  MAX_RICH_TEXT_HTML_LENGTH,
  RICH_TEXT_EXTENSIONS,
  RichTextLengthGuard,
  normalizeLinkHref,
} from "./rich-text";
import { useDebouncedField } from "./fields/useDebouncedField";

export interface RichTextEditorProps {
  label: string;
  /** Already-sanitized HTML from the document. Read once, at mount. */
  value: string;
  onChange: (html: string) => void;
  hint?: string;
}

const LIMIT_MESSAGE = `Nội dung đã đạt giới hạn ${MAX_RICH_TEXT_HTML_LENGTH.toLocaleString("vi-VN")} ký tự (tính cả thẻ định dạng). Hãy rút ngắn bớt.`;
const BAD_LINK_MESSAGE = "Đường dẫn không hợp lệ. Chỉ nhận http://, https://, mailto: hoặc đường dẫn bắt đầu bằng /.";

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // `aria-pressed` rather than a visual-only highlight: the toolbar is
      // the only signal of which formatting the caret currently sits in,
      // and a screen-reader user has no way to see the blue background.
      aria-pressed={active ?? false}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active ? "bg-rose-100 text-rose-700" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * TipTap editor for the `text` section's `props.html`.
 *
 * Two invariants drive the whole shape of this component:
 *
 *   1. **What reaches the store is already sanitized.** `onUpdate` pushes
 *      `sanitizeHtml(editor.getHTML())`, never the editor's raw output, so
 *      `TextSection`'s sanitize at render is a second, idempotent pass
 *      rather than the only line of defence.
 *   2. **The document must never stop being schema-valid.** Exceeding
 *      `TextPropsSchema.html`'s 10.000-character cap would make the whole
 *      invitation fail `InvitationDocumentSchema.parse` and silently stop
 *      autosaving — Phase 1's blocker B1, and the reason the limit is
 *      enforced by REFUSING the transaction rather than by truncating
 *      afterwards. Truncation would cut mid-tag and corrupt the markup.
 */
export function RichTextEditor({ label, value, onChange, hint }: RichTextEditorProps) {
  const { set, flush } = useDebouncedField(value, onChange);
  const [atLimit, setAtLimit] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // `setAtLimit` is referentially stable, so the extension list is built
  // once — rebuilding it would tear down and recreate the whole editor,
  // losing the caret on every render.
  const extensions = useMemo(
    () => [...RICH_TEXT_EXTENSIONS, RichTextLengthGuard.configure({ onLimit: setAtLimit })],
    [],
  );

  const editor = useEditor({
    extensions,
    content: value,
    // Next renders client components on the server too; letting TipTap
    // build its DOM during that render is the hydration-mismatch trap the
    // project has hit three times already.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `min-h-40 rounded-b-lg px-3 py-2 text-sm text-gray-900 focus:outline-none ${RICH_TEXT_CONTENT_CLASS}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
      },
    },
    onUpdate: ({ editor: instance }) => {
      set(sanitizeHtml(instance.getHTML()));
    },
    onBlur: () => {
      flush();
    },
  });

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            underline: instance.isActive("underline"),
            strike: instance.isActive("strike"),
            h2: instance.isActive("heading", { level: 2 }),
            h3: instance.isActive("heading", { level: 3 }),
            bulletList: instance.isActive("bulletList"),
            orderedList: instance.isActive("orderedList"),
            blockquote: instance.isActive("blockquote"),
            link: instance.isActive("link"),
          }
        : null,
  });

  function openLinkBox() {
    if (!editor) return;
    setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
    // Focus after the input exists. `requestAnimationFrame` rather than a
    // layout effect so it never runs during render.
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeLinkHref(linkDraft);
    if (!href) {
      setLinkError(BAD_LINK_MESSAGE);
      return;
    }
    if (editor.state.selection.empty) {
      // Nothing selected: insert the URL as its own linked text rather
      // than silently doing nothing. Built as a ProseMirror node, not an
      // HTML string, so the href is never concatenated into markup.
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkError(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
    setLinkError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>

      <div className="rounded-lg border border-gray-300 focus-within:border-rose-400">
        <div
          role="toolbar"
          aria-label="Định dạng văn bản"
          className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-1 py-1"
        >
          <ToolbarButton label="Đậm" active={toolbar?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Nghiêng" active={toolbar?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton label="Gạch chân" active={toolbar?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton label="Gạch ngang" active={toolbar?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <span className="line-through">S</span>
          </ToolbarButton>

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-gray-200" />

          <ToolbarButton label="Tiêu đề" active={toolbar?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolbarButton>
          <ToolbarButton label="Tiêu đề phụ" active={toolbar?.h3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </ToolbarButton>

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-gray-200" />

          <ToolbarButton label="Danh sách" active={toolbar?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            •
          </ToolbarButton>
          <ToolbarButton label="Danh sách đánh số" active={toolbar?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            1.
          </ToolbarButton>
          <ToolbarButton label="Trích dẫn" active={toolbar?.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            ❞
          </ToolbarButton>

          <span aria-hidden="true" className="mx-1 h-4 w-px bg-gray-200" />

          <ToolbarButton label="Liên kết" active={toolbar?.link} onClick={openLinkBox}>
            🔗
          </ToolbarButton>
        </div>

        {linkOpen ? (
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
            <input
              ref={linkInputRef}
              type="text"
              aria-label="Đường dẫn liên kết"
              value={linkDraft}
              placeholder="https://..."
              onChange={(event) => {
                setLinkDraft(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setLinkOpen(false);
                }
              }}
              className="min-w-40 flex-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-rose-400 focus:outline-none"
            />
            <button type="button" onClick={applyLink} className="rounded bg-rose-500 px-2 py-1 text-xs font-medium text-white hover:bg-rose-600">
              Áp dụng
            </button>
            <button type="button" onClick={removeLink} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200">
              Bỏ liên kết
            </button>
            <button type="button" onClick={() => setLinkOpen(false)} className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200">
              Huỷ
            </button>
            {linkError ? (
              <span role="alert" className="w-full text-xs text-red-500">
                {linkError}
              </span>
            ) : null}
          </div>
        ) : null}

        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          // Server render and the first client render both land here, so
          // the two agree; TipTap mounts on the effect that follows.
          <div className="min-h-40 px-3 py-2 text-sm text-gray-400">Đang tải trình soạn thảo…</div>
        )}
      </div>

      {atLimit ? (
        <span role="status" className="text-xs text-red-500">
          {LIMIT_MESSAGE}
        </span>
      ) : hint ? (
        <span className="text-xs text-gray-400">{hint}</span>
      ) : null}
    </div>
  );
}
