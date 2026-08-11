"use client";

import { useId, type ChangeEvent } from "react";
import { useDebouncedField } from "./useDebouncedField";

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  id?: string;
  error?: string;
  hint?: string;
}

/** Multi-line counterpart to `TextField`, same debounce/blur-flush behaviour. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  id,
  error,
  hint,
}: TextAreaFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { local, set, flush } = useDebouncedField(value, onChange);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    let next = event.target.value;
    if (maxLength !== undefined) next = next.slice(0, maxLength);
    set(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <textarea
        id={inputId}
        value={local}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        onChange={handleChange}
        onBlur={flush}
        aria-invalid={error ? true : undefined}
        className={`resize-y rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none ${
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
