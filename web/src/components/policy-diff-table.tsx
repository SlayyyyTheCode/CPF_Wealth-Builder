import type { DiffRow } from "@/lib/types";
import { sgd } from "@/lib/format";

const LABELS: Record<string, string> = {
  effective_year: "Effective year",
  frs: "FRS",
  brs: "BRS",
  ers: "ERS",
  bhs: "BHS",
  ordinary_wage_ceiling: "OW ceiling",
  additional_wage_ceiling: "AW ceiling",
  cpf_life_eligibility_min: "CPF LIFE min",
};

const fmt = (field: string, v: number | null) =>
  v == null ? "—" : field === "effective_year" ? String(v) : sgd(v);

export function PolicyDiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-raised)] text-[var(--color-muted)]">
          <tr>
            <th className="px-3 py-2 text-left">Field</th>
            <th className="px-3 py-2 text-right">Current</th>
            <th className="px-3 py-2 text-right">Extracted</th>
            <th className="px-3 py-2 text-center">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.field}
              className={`border-t border-[var(--color-border)] ${
                r.changed ? "bg-amber-50 dark:bg-amber-900/20" : ""
              }`}
            >
              <td className="px-3 py-2">{LABELS[r.field] ?? r.field}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(r.field, r.current)}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {fmt(r.field, r.extracted)}
              </td>
              <td className="px-3 py-2 text-center">
                {r.changed ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    changed
                  </span>
                ) : (
                  <span className="text-[var(--color-muted)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
