import type { Strategy } from "@/lib/types";
import { sgd } from "@/lib/format";

/** Heuristic: if the key name suggests money, format with sgd; else raw. */
const moneyKeys = /payout|topup|top_up|relief|saved|benefit|amount|cash|balance|sum|fund/i;

function formatValue(key: string, val: number): string {
  return moneyKeys.test(key) ? sgd(val) : val.toLocaleString("en-SG");
}

export function StrategyList({ strategies }: { strategies: Strategy[] }) {
  if (!strategies || strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-[var(--color-muted)]">
          No optimisations triggered for the current projection.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {strategies.map((s, i) => (
        <li
          key={s.name}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white"
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{s.name}</span>
                <span className="text-sm text-[var(--color-primary)] font-medium tabular-nums">
                  Est. benefit: {sgd(s.estimated_benefit)}
                </span>
              </div>

              {Object.keys(s.outputs).length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(s.outputs).map(([k, v]) => (
                    <li key={k} className="text-xs text-[var(--color-muted)]">
                      <span className="capitalize">{k.replace(/_/g, " ")}</span>
                      {": "}
                      <span className="font-medium text-[var(--color-fg)]">
                        {typeof v === "number" ? formatValue(k, v) : String(v)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
