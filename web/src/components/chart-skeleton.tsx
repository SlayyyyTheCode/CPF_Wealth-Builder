/** Placeholder shown while a chart's JS chunk (recharts) loads. Keeps layout
 *  stable and lets the rest of the page paint first. */
export function ChartSkeleton({ className = "h-64" }: { className?: string }) {
  return (
    <div
      className={`${className} animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]`}
      aria-hidden="true"
    />
  );
}
