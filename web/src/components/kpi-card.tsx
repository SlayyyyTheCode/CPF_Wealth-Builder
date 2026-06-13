export function KpiCard({ label, value, hero }: { label: string; value: string; hero?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-card)] ${hero
      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
      : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
      <div className={`text-xs uppercase tracking-wide ${hero ? "text-white/75" : "text-[var(--color-muted)]"}`}>{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
