/**
 * Presentation for sanitized rich-text HTML, shared by the editor
 * (`RichTextEditor`) and the guest-facing renderer (`TextSection`).
 *
 * It lives in its own dependency-free module on purpose: `TextSection` is a
 * server component, and importing this from the editor's TipTap module
 * would drag ProseMirror and React into the server bundle for every
 * invitation page.
 *
 * Tailwind's preflight strips list markers and heading sizes, so without
 * these the couple would build a bulleted list in the editor and their
 * guests would see an unstyled run of lines. One constant, two call sites —
 * WYSIWYG that cannot drift.
 */
export const RICH_TEXT_CONTENT_CLASS = [
  "[&_p]:my-2",
  "[&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-900",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5 [&_li>p]:my-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:underline [&_a]:decoration-dotted",
  "[&_s]:line-through",
].join(" ");
