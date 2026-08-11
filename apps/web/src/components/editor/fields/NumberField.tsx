"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function clamp(n: number, min?: number, max?: number): number {
  let result = n;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

/**
 * Number input kept as a raw string in local state (so an in-progress
 * "-" or "" doesn't get fought over) and only ever calls `onChange` with a
 * finite, min/max-clamped number — never `NaN`, which would otherwise land
 * directly in e.g. `AlbumImageSchema.width` and break `.int().positive()`.
 * Commits on blur; there's no debounce here since, unlike free text, a
 * half-typed number is exactly the case that must not reach the store.
 */
export function NumberField({ label, value, onChange, min, max, step }: NumberFieldProps) {
  const [local, setLocal] = useState(String(value));
  const generatedId = useId();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setLocal(event.target.value);
  }

  function commit() {
    const parsed = Number(local);
    if (local.trim() === "" || !Number.isFinite(parsed)) {
      setLocal(String(value));
      return;
    }
    const clamped = clamp(parsed, min, max);
    setLocal(String(clamped));
    if (clamped !== value) onChangeRef.current(clamped);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={generatedId} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <input
        id={generatedId}
        type="number"
        value={local}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
        onBlur={commit}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none"
      />
    </div>
  );
}
