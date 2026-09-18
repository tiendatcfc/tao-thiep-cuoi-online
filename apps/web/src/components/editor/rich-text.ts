import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Link } from "@tiptap/extension-link";
import { Extension, getHTMLFromFragment } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { isSafeHref, sanitizeHtml } from "@/lib/sanitize";

/**
 * Mirrors `TextPropsSchema.html`'s `.max(10_000)` in `@hpwd/schema`. The
 * limit is enforced on the SANITIZED html — the string that actually gets
 * stored — because sanitizing can grow the input (an `<a href>` gains
 * `target`/`rel`), so a check on the editor's own output could pass while
 * the stored value fails `InvitationDocumentSchema.parse`. That failure
 * mode is blocker B1 from Phase 1: the whole invitation silently stops
 * autosaving, not just this field.
 */
export const MAX_RICH_TEXT_HTML_LENGTH = 10_000;

/**
 * `<a>` the way `sanitizeHtml` recognises it.
 *
 * TipTap's stock Link stores `target`/`rel`/`class` as mark attributes and
 * renders them BEFORE `href` (`mergeAttributes(options.HTMLAttributes,
 * attrs)`). `sanitizeHtml` only accepts `<a href="…">` or its own
 * `href`-then-`target`-then-`rel` output, so every stock-TipTap link came
 * out escaped into visible text. Worse, the damage was delayed: the first
 * save looked fine, and the link was destroyed on the next edit after a
 * reload, once the editor had re-parsed `target`/`rel` out of its own
 * stored output and re-rendered them in the wrong order.
 *
 * Dropping every attribute but `href` from the mark fixes both directions:
 * the editor emits `<a href="…">`, the sanitizer accepts it and adds the
 * `target`/`rel` itself, and re-parsing that output yields the same mark
 * again. `rel`/`target` therefore have exactly one owner — the sanitizer —
 * instead of two that can disagree.
 *
 * `HTMLAttributes` must null each key rather than be set to `{}`, because
 * `Extension.configure` deep-merges options: `{}` leaves the defaults in
 * place.
 */
const BareLink = Link.extend({
  addAttributes() {
    return { href: { default: null, parseHTML: (element) => element.getAttribute("href") } };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  HTMLAttributes: { target: null, rel: null, class: null },
});

/**
 * StarterKit minus everything that emits a tag `sanitizeHtml` would escape.
 *
 * These are disabled rather than left on and cleaned up afterwards: a
 * keyboard shortcut or markdown input rule the toolbar never advertises
 * (``` for a code block, `---` for a rule, Cmd+E for inline code) would
 * otherwise let the couple build content that looks right while typing and
 * turns into visible escaped angle brackets for their guests.
 *
 * `h1` is excluded for a different reason: the invitation page owns the
 * document's single top-level heading, and a section body must not compete
 * with it for outline or SEO.
 */
export const RICH_TEXT_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
  }),
  BareLink,
];

/**
 * Length of what would actually be stored if `doc` were committed — i.e.
 * after sanitizing, matching `MAX_RICH_TEXT_HTML_LENGTH`'s contract.
 */
export function sanitizedHtmlLength(doc: ProseMirrorNode): number {
  return sanitizeHtml(getHTMLFromFragment(doc.content, doc.type.schema)).length;
}

/**
 * Whether a document change may be committed, given what it would replace.
 *
 * A shrinking change is accepted even while over the cap. Without that
 * carve-out, content that arrived over the limit — an older document
 * written through the raw-markup textarea, or one whose every link grew by
 * 42 characters the first time it was sanitized — would be frozen: each
 * deletion rejected too, leaving no way out but deleting the section.
 */
export function acceptsDocChange(nextDoc: ProseMirrorNode, currentDoc: ProseMirrorNode): boolean {
  const next = sanitizedHtmlLength(nextDoc);
  if (next <= MAX_RICH_TEXT_HTML_LENGTH) return true;
  return next < sanitizedHtmlLength(currentDoc);
}

/**
 * Blocks after which StarterKit's trailing-node extension appends an empty
 * paragraph. Deliberately NOT `<p>`: TipTap never appends one after a
 * paragraph, so an empty `<p>` following another paragraph is a blank line
 * somebody pressed Enter for, and removing it would be the editor quietly
 * rewriting their spacing.
 */
const TRAILING_NODE_TRIGGERS = ["</ul>", "</ol>", "</blockquote>", "</h2>", "</h3>"];

/**
 * Drops the empty paragraph TipTap appends to a document that ends in a
 * block you cannot type after.
 *
 * That paragraph is a necessary escape hatch INSIDE the editor — without it
 * a couple whose invitation ends in a list could never add anything below
 * it. It has no business in the stored document, though: it renders as a
 * blank line at the bottom of the guest's invitation, for a paragraph
 * nobody wrote. Stripping it on the way to the store costs nothing, because
 * the editor puts it straight back the next time the document is opened.
 *
 * Exactly one is removed, so a blank line the couple typed above the
 * appended node survives.
 */
export function stripTrailingEmptyParagraph(html: string): string {
  if (!html.endsWith("<p></p>")) return html;
  const withoutTrailing = html.slice(0, -"<p></p>".length);
  if (!TRAILING_NODE_TRIGGERS.some((tag) => withoutTrailing.endsWith(tag))) return html;
  return withoutTrailing;
}

export interface RichTextLengthGuardOptions {
  /** Called on every document change with whether the cap just blocked it. */
  onLimit: (blocked: boolean) => void;
}

/**
 * Enforces `MAX_RICH_TEXT_HTML_LENGTH` by refusing the transaction.
 *
 * It has to be a ProseMirror PLUGIN. `filterTransaction` looks like an
 * `editorProps` key and is accepted there without complaint, but only
 * `EditorState.applyTransaction` consults it, and it reads it from plugin
 * specs — a guard passed through `editorProps` is silently never called,
 * which is exactly how the first version of this shipped past a green test
 * suite until a component test tried to cross the cap for real.
 */
export const RichTextLengthGuard = Extension.create<RichTextLengthGuardOptions>({
  name: "richTextLengthGuard",

  addOptions() {
    return { onLimit: () => {} };
  },

  addProseMirrorPlugins() {
    const { onLimit } = this.options;
    return [
      new Plugin({
        key: new PluginKey("richTextLengthGuard"),
        filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          const accepted = acceptsDocChange(transaction.doc, state.doc);
          onLimit(!accepted);
          return accepted;
        },
      }),
    ];
  },
});

/**
 * Turns what someone types into the link box into an href the sanitizer
 * will keep, or `null` if it never could be.
 *
 * A bare `example.com` gets `https://`, since that is plainly what was
 * meant, while anything that already carries a scheme is left alone so the
 * decision of whether that scheme is safe stays with `isSafeHref` — the
 * same allowlist `sanitizeHtml` applies. Validating here with a second,
 * separate rule is how the editor and the sanitizer would end up
 * disagreeing about what a valid link is.
 */
export function normalizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme || trimmed.startsWith("/") ? trimmed : `https://${trimmed}`;
  return isSafeHref(candidate) ? candidate : null;
}
