"use client";

import { useId, type ChangeEvent } from "react";

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  id?: string;
  hint?: string;
}

/**
 * Plain `<select>`: the value always comes from a fixed `options` list, so
 * (unlike the text fields) it can never produce anything outside the
 * schema's enum — no sanitization/validation needed at this boundary.
 * Commits on every change, no debounce (a `<select>` doesn't fire on every
 * keystroke the way a text input does).
 */
export function SelectField({ label, value, onChange, options, id, hint }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={handleChange}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs text-gray-400">{hint}</span> : null}
    </div>
  );
}
