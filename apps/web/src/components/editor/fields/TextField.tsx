"use client";

import { useId, type ChangeEvent } from "react";
import { useDebouncedField } from "./useDebouncedField";

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  error?: string;
  hint?: string;
  /**
   * Applied synchronously to every keystroke, before the value even hits
   * local state — so the displayed text is always already sanitized (no
   * flash of raw input while the debounce is pending). Used e.g. by
   * `GiftPanel` for digits-only account numbers and uppercase/no-diacritics
   * account names.
   */
  sanitize?: (raw: string) => string;
}

/**
 * Single-line controlled text input. Keystrokes update the visible value
 * immediately; the `onChange` callback (which typically feeds
 * `updateSectionProps` and re-renders the whole live preview) only fires
 * after a short debounce or on blur — see `useDebouncedField`.
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  id,
  error,
  hint,
  sanitize,
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { local, set, flush } = useDebouncedField(value, onChange);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    let next = sanitize ? sanitize(event.target.value) : event.target.value;
    if (maxLength !== undefined) next = next.slice(0, maxLength);
    set(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={local}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={handleChange}
        onBlur={flush}
        aria-invalid={error ? true : undefined}
        className={`rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none ${
          error ? "border-red-400" : "border-gray-300"
        }`}
      />
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : hint ? (
        <span className="text-xs text-gray-400">{hint}</span>
      ) : null}
    </div>
  );
}
