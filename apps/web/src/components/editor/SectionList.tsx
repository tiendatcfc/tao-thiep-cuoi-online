"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SECTION_TYPES, type Section, type SectionType } from "@hpwd/schema";
import type { MouseEvent } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { SECTION_TYPE_LABELS } from "./section-labels";

/** Section types that may appear more than once in a document. */
const DUPLICABLE_TYPES: ReadonlySet<SectionType> = new Set(["text", "events"]);

/**
 * The exact descriptor array fed into `useSensors` below — pulled out to a
 * module-level constant so a test can assert keyboard support is wired up
 * (per dnd-kit's documented accessible-sortable-list pattern) without
 * having to simulate a real pointer/keyboard drag through jsdom.
 */
export const SECTION_LIST_SENSOR_DESCRIPTORS = [
  { sensor: PointerSensor },
  { sensor: KeyboardSensor, options: { coordinateGetter: sortableKeyboardCoordinates } },
] as const;

function SectionRow({ section }: { section: Section }) {
  const selectedSectionId = useEditorStore((state) => state.selectedSectionId);
  const selectSection = useEditorStore((state) => state.selectSection);
  const toggleSectionVisible = useEditorStore((state) => state.toggleSectionVisible);
  const removeSection = useEditorStore((state) => state.removeSection);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isSelected = selectedSectionId === section.id;

  function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    if (window.confirm("Xoá mục này khỏi thiệp?")) {
      removeSection(section.id);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      onClick={() => selectSection(section.id)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        isSelected ? "border-rose-400 bg-rose-50" : "border-gray-200 bg-white"
      }`}
    >
      <button
        type="button"
        aria-label="Kéo để sắp xếp"
        className="cursor-grab touch-none px-1 text-gray-400"
        {...attributes}
        {...listeners}
        onClick={(event) => {
          event.stopPropagation();
          listeners?.onClick?.(event);
        }}
      >
        ⠿
      </button>
      <span className="flex-1 truncate">{SECTION_TYPE_LABELS[section.type]}</span>
      <button
        type="button"
        aria-label={section.visible ? "Ẩn mục" : "Hiện mục"}
        onClick={(event) => {
          event.stopPropagation();
          toggleSectionVisible(section.id);
        }}
        className="px-1 text-gray-500 hover:text-gray-800"
      >
        {section.visible ? "👁" : "🚫"}
      </button>
      <button
        type="button"
        aria-label="Xoá mục"
        onClick={handleDelete}
        className="px-1 text-gray-500 hover:text-red-600"
      >
        🗑
      </button>
    </li>
  );
}

/**
 * Left pane of the editor: a draggable, sortable list of the document's
 * sections plus an "add section" control. Reordering goes through dnd-kit's
 * `SortableContext`/`useSortable`, wired with both `PointerSensor` and
 * `KeyboardSensor` (see `SECTION_LIST_SENSOR_DESCRIPTORS`) so the list is
 * reorderable without a mouse — focus a drag handle, Space to pick up,
 * arrow keys to move, Space to drop.
 */
export function SectionList() {
  const sections = useEditorStore((state) => state.document.sections);
  const reorderSections = useEditorStore((state) => state.reorderSections);
  const addSection = useEditorStore((state) => state.addSection);

  const sensors = useSensors(
    useSensor(SECTION_LIST_SENSOR_DESCRIPTORS[0].sensor),
    useSensor(SECTION_LIST_SENSOR_DESCRIPTORS[1].sensor, SECTION_LIST_SENSOR_DESCRIPTORS[1].options),
  );

  const sorted = sections.slice().sort((a, b) => a.order - b.order);
  const presentTypes = new Set(sections.map((s) => s.type));
  const addableTypes = SECTION_TYPES.filter(
    (type) => DUPLICABLE_TYPES.has(type) || !presentTypes.has(type),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderSections(String(active.id), String(over.id));
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {sorted.map((section) => (
              <SectionRow key={section.id} section={section} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div role="group" aria-label="Thêm mục" className="flex flex-col gap-2 border-t border-gray-200 pt-4">
        <span className="text-xs font-medium text-gray-500">+ Thêm mục</span>
        <div className="flex flex-wrap gap-2">
          {addableTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addSection(type)}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {SECTION_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
