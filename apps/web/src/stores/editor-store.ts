import { arrayMove } from "@dnd-kit/sortable";
import {
  createDefaultDocument,
  createSection,
  type InvitationDocument,
  type Music,
  type Opening,
  type Section,
  type SectionType,
  type Theme,
} from "@hpwd/schema";
import { create } from "zustand";

export type EditorState = {
  document: InvitationDocument;
  selectedSectionId: string | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  setDocument(doc: InvitationDocument): void;
  selectSection(id: string | null): void;
  updateSectionProps(id: string, patch: Record<string, unknown>): void;
  updateTheme(patch: Partial<Theme>): void;
  updateOpening(patch: Partial<Opening>): void;
  updateMusic(patch: Partial<Music>): void;
  reorderSections(activeId: string, overId: string): void;
  toggleSectionVisible(id: string): void;
  addSection(type: SectionType): void;
  removeSection(id: string): void;
  markSaved(at: number): void;
  setSaving(v: boolean): void;
};

/**
 * Single module-level store for the whole editor: the live document being
 * edited, the currently-selected section (for Task 16's property panel),
 * and the autosave bookkeeping (`dirty`/`saving`/`lastSavedAt`). Every
 * mutating action here must leave `document` passing
 * `InvitationDocumentSchema.parse` — nothing here should ever produce a
 * partially-shaped section, dangling id, or non-contiguous order that would
 * make `PATCH /api/invitations/[id]` reject the autosaved payload.
 */
export const useEditorStore = create<EditorState>()((set) => ({
  document: createDefaultDocument(),
  selectedSectionId: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,

  setDocument(doc) {
    // C6: `lastSavedAt` is a module-level singleton — without resetting it
    // here, opening invitation B right after editing invitation A shows A's
    // stale save timestamp until B's own first save. `EditorLayout` calls
    // `setDocument` exactly once, on mount, with whatever the server loaded
    // — that's a fresh load, never itself a "just saved" moment, so `null`
    // (not shown yet) is always the right value here.
    set({ document: doc, dirty: false, lastSavedAt: null });
  },

  selectSection(id) {
    set({ selectedSectionId: id });
  },

  updateSectionProps(id, patch) {
    set((state) => ({
      document: {
        ...state.document,
        sections: state.document.sections.map((section) =>
          section.id === id
            ? ({ ...section, props: { ...section.props, ...patch } } as Section)
            : section,
        ),
      },
      dirty: true,
    }));
  },

  updateTheme(patch) {
    set((state) => ({
      document: { ...state.document, theme: { ...state.document.theme, ...patch } },
      dirty: true,
    }));
  },

  updateOpening(patch) {
    set((state) => ({
      document: { ...state.document, opening: { ...state.document.opening, ...patch } },
      dirty: true,
    }));
  },

  updateMusic(patch) {
    set((state) => ({
      document: { ...state.document, music: { ...state.document.music, ...patch } },
      dirty: true,
    }));
  },

  reorderSections(activeId, overId) {
    set((state) => {
      const sorted = [...state.document.sections].sort((a, b) => a.order - b.order);
      const activeIndex = sorted.findIndex((s) => s.id === activeId);
      const overIndex = sorted.findIndex((s) => s.id === overId);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
        return state;
      }
      const reordered = arrayMove(sorted, activeIndex, overIndex).map((section, index) => ({
        ...section,
        order: index,
      }));
      return { document: { ...state.document, sections: reordered }, dirty: true };
    });
  },

  toggleSectionVisible(id) {
    set((state) => ({
      document: {
        ...state.document,
        sections: state.document.sections.map((section) =>
          section.id === id ? { ...section, visible: !section.visible } : section,
        ),
      },
      dirty: true,
    }));
  },

  addSection(type) {
    set((state) => {
      const maxOrder = state.document.sections.reduce((max, s) => Math.max(max, s.order), -1);
      const section = { ...createSection(type), order: maxOrder + 1 };
      return {
        document: { ...state.document, sections: [...state.document.sections, section] },
        selectedSectionId: section.id,
        dirty: true,
      };
    });
  },

  removeSection(id) {
    set((state) => ({
      document: {
        ...state.document,
        sections: state.document.sections.filter((section) => section.id !== id),
      },
      selectedSectionId: state.selectedSectionId === id ? null : state.selectedSectionId,
      dirty: true,
    }));
  },

  markSaved(at) {
    set({ dirty: false, lastSavedAt: at });
  },

  setSaving(v) {
    set({ saving: v });
  },
}));
