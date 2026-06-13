import type { SnapshotListItem } from "@/lib/types";

const BADGE: Record<string, string> = {
  active:
    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  draft:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  archived:
    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export function SnapshotHistory({ items }: { items: SnapshotListItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-sm text-[var(--color-muted)]">No snapshots yet.</p>
    );
  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)]">
      {items.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between px-4 py-2 text-sm"
        >
          <span className="font-semibold">{s.effective_year}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              BADGE[s.status] ?? BADGE.draft
            }`}
          >
            {s.status}
          </span>
          <span className="text-[var(--color-muted)]">
            {s.approved_at
              ? new Date(s.approved_at).toLocaleDateString()
              : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
