import { useEffect, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Shared local-state-plus-debounce behaviour for every text-like field
 * (`TextField`, `TextAreaField`, `NumberField`, ...): keeps the input
 * responsive on every keystroke (`local` updates synchronously) while only
 * pushing to the store — and, transitively, re-rendering the whole live
 * preview — after `delayMs` of no further typing. `flush()` commits
 * immediately (wired to the input's `onBlur`), and is also called
 * automatically on unmount so switching to a different section (which
 * unmounts the whole panel tree) never silently drops a pending edit that
 * hadn't debounced yet.
 *
 * `value`/`onChange` mirror the field's own controlled props: `value` is
 * re-synced into `local` whenever it changes externally (e.g. the store
 * updates from elsewhere, or a different section's data now flows through
 * the same mounted field instance).
 */
export function useDebouncedField<T>(
  value: T,
  onChange: (value: T) => void,
  delayMs = DEFAULT_DEBOUNCE_MS,
) {
  const [local, setLocal] = useState(value);
  const localRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
    localRef.current = value;
  }, [value]);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function set(next: T) {
    setLocal(next);
    localRef.current = next;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onChangeRef.current(next);
    }, delayMs);
  }

  function flush() {
    if (timerRef.current === null) return;
    clearTimer();
    onChangeRef.current(localRef.current);
  }

  useEffect(() => {
    return () => flush();
    // Deliberately empty: this is the unmount-flush described above, not a
    // per-render effect — it must run its cleanup exactly once, reading
    // whatever `localRef`/`onChangeRef` hold at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { local, set, flush };
}
