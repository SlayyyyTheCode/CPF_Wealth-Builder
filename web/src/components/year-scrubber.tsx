"use client";

export function YearScrubber({ ages, value, onChange }: { ages: number[]; value: number; onChange: (age: number) => void }) {
  if (ages.length === 0) return null;
  const min = ages[0], max = ages[ages.length - 1];
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-muted)]">Age {min}</span>
      <input type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Select age"
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-surface-raised)] accent-[var(--color-primary)]" />
      <span className="text-xs text-[var(--color-muted)]">Age {max}</span>
      <span className="ml-2 rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">Age {value}</span>
    </div>
  );
}
