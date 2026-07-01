"use client";
import { useState } from "react";

/** Number field that keeps a string buffer so typing is smooth: the value can
 *  be empty or partial while editing, the cursor never jumps, and no clamp
 *  fights the keystrokes. Emits a parsed number (empty → 0). Optional min/max
 *  are applied on blur, not on every keypress.
 *
 *  Requires the parent to store exactly what it emits (no transform), so that
 *  `value === prevValue` reliably means "the change came from here, not an
 *  external update" — that's how we avoid clobbering the user's in-progress
 *  text without needing an effect or a ref-during-render. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  className,
  id,
  placeholder,
  step,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  id?: string;
  placeholder?: string;
  step?: number;
  "aria-label"?: string;
}) {
  const [str, setStr] = useState(value === 0 ? "" : String(value));
  const [prevValue, setPrevValue] = useState(value);

  // Sync from an external change (e.g. prefill) during render. A change we made
  // ourselves already set prevValue, so value === prevValue and this is skipped.
  if (value !== prevValue) {
    setPrevValue(value);
    setStr(value === 0 ? "" : String(value));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      step={step}
      value={str}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => {
        const raw = e.target.value;
        // allow digits + one dot; empty is fine while editing
        if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
        setStr(raw);
        const n = raw === "" ? 0 : Number(raw);
        setPrevValue(n);
        onChange(n);
      }}
      onBlur={() => {
        let n = str === "" ? 0 : Number(str);
        if (Number.isNaN(n)) n = 0;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        setStr(n === 0 ? "" : String(n));
        setPrevValue(n);
        onChange(n);
      }}
    />
  );
}
