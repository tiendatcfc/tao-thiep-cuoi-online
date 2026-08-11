"use client";

import { useEffect, useId, useState, type ChangeEvent } from "react";

export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const INVALID_HEX_MESSAGE = "Mã màu không hợp lệ, ví dụ: #A62B45";

/**
 * Two inputs kept in sync: a native `<input type="color">` swatch (always
 * valid by construction, browsers only ever emit a 6-digit hex from it) and
 * a plain text input for typing an exact hex value. The text input only
 * ever calls `onChange` for a syntactically valid hex color — an invalid
 * value shows a Vietnamese error and simply doesn't commit, rather than
 * pushing garbage into `theme.primary`/etc.
 */
export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [hexInput, setHexInput] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const colorId = useId();

  useEffect(() => {
    setHexInput(value);
    setError(null);
  }, [value]);

  function handlePickerChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setHexInput(next);
    setError(null);
    onChange(next);
  }

  function handleHexChange(event: ChangeEvent<HTMLInputElement>) {
    setHexInput(event.target.value);
  }

  function commitHex() {
    if (HEX_RE.test(hexInput)) {
      setError(null);
      if (hexInput !== value) onChange(hexInput);
    } else {
      setError(INVALID_HEX_MESSAGE);
    }
  }

  const pickerValue = HEX6_RE.test(value) ? value : "#000000";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={colorId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={colorId}
          type="color"
          value={pickerValue}
          onChange={handlePickerChange}
          className="h-9 w-9 cursor-pointer rounded border border-gray-300 p-0"
        />
        <input
          type="text"
          aria-label={`Mã màu ${label}`}
          value={hexInput}
          onChange={handleHexChange}
          onBlur={commitHex}
          className={`flex-1 rounded-lg border px-3 py-2 font-mono text-sm text-gray-900 focus:border-rose-400 focus:outline-none ${
            error ? "border-red-400" : "border-gray-300"
          }`}
        />
      </div>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
