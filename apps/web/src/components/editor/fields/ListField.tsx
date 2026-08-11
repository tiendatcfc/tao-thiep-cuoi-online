"use client";

import type { ReactNode } from "react";

export interface ListFieldProps<T> {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  /** Renders one item's own sub-fields. `updateItem` replaces the whole item (not a patch) — callers spread it themselves (`update({ ...item, title: v })`), which also lets this same component host primitive items (e.g. `string[]` options), where there's nothing to spread. */
  renderItem: (item: T, index: number, updateItem: (next: T) => void) => ReactNode;
  createItem: () => T;
  itemLabel?: (item: T, index: number) => string;
  addLabel?: string;
  emptyMessage?: string;
}

/**
 * The shared array editor for every `items`/`accounts`/`fields`/`images`
 * list across the panels (story beats, event entries, gift accounts, album
 * images, form fields, and form-field options). Deliberately no drag
 * handle/dnd-kit here — up/down buttons are simpler, keyboard-accessible by
 * default, and this is a short, rarely-reordered list, unlike the section
 * list itself.
 */
export function ListField<T>({
  label,
  items,
  onChange,
  renderItem,
  createItem,
  itemLabel,
  addLabel = "Thêm",
  emptyMessage,
}: ListFieldProps<T>) {
  function handleAdd() {
    onChange([...items, createItem()]);
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    onChange(next);
  }

  function handleUpdate(index: number, next: T) {
    onChange(items.map((item, i) => (i === index ? next : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-500">{label}</span>

      {items.length === 0 && emptyMessage ? <p className="text-xs text-gray-400">{emptyMessage}</p> : null}

      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          // No stable id in any of these schemas (whole-array replace from
          // the editor, same rationale as GiftSection's index keys) — index
          // is the only option.
          <li key={index} className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-gray-500">
                {itemLabel ? itemLabel(item, index) : `#${index + 1}`}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Lên"
                  disabled={index === 0}
                  onClick={() => handleMove(index, -1)}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Xuống"
                  disabled={index === items.length - 1}
                  onClick={() => handleMove(index, 1)}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Xoá"
                  onClick={() => handleRemove(index)}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              </div>
            </div>
            {renderItem(item, index, (next) => handleUpdate(index, next))}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleAdd}
        className="self-start rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        <span aria-hidden="true">+ </span>
        {addLabel}
      </button>
    </div>
  );
}
