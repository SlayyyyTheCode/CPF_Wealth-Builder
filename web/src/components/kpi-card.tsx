export function KpiCard({
  label, value, hero, sub,
}: { label: string; value: string; hero?: boolean; sub?: string }) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none ${
        hero
          ? "border-transparent bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className={`text-xs font-semibold uppercase tracking-wide ${hero ? "text-white/80" : "text-[var(--color-muted)]"}`}>
        {label}
      </div>
      <div className={`mt-1 font-bold tabular-nums ${hero ? "text-3xl" : "text-2xl"}`}>{value}</div>
      {sub && (
        <div className={`mt-1 text-xs ${hero ? "text-white/70" : "text-[var(--color-muted)]"}`}>{sub}</div>
      )}
    </div>
  );
}
