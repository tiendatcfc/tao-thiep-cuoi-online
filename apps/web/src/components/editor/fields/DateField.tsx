"use client";

import { useId, type ChangeEvent } from "react";

export interface DateFieldProps {
  label: string;
  /** Any string `new Date()` can parse (ISO with or without an offset) — the schema fields this binds to (`CoverProps.date`, `EventItem.date`) are plain `z.string()`, not a `.datetime()`, so anything round-trips through validation. */
  value: string;
  onChange: (value: string) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO-ish string -> the `YYYY-MM-DDTHH:mm` shape `<input type="datetime-local">` requires, in the browser's local time. Returns "" for anything unparseable so the input renders empty instead of "Invalid Date" or crashing. */
function toInputValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Wraps `<input type="datetime-local">`. The stored value is a plain ISO
 * string (`Date#toISOString()`), which every consumer downstream already
 * parses with `new Date(...)` — see `CoverSection`/`EventsSection`.
 */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const inputId = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    if (!raw) {
      onChange("");
      return;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    onChange(date.toISOString());
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <input
        id={inputId}
        type="datetime-local"
        value={toInputValue(value)}
        onChange={handleChange}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none"
      />
    </div>
  );
}
