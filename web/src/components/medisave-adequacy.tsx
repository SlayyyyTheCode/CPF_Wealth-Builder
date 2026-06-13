import type { SimResult } from "@/lib/types";
import { sgd } from "@/lib/format";

type Medisave = SimResult["medisave"];

export function MedisaveAdequacy({ medisave }: { medisave: Medisave }) {
  if (!medisave) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm text-[var(--color-muted)]">
          Indicative — insufficient projection data.
        </p>
      </div>
    );
  }

  const { adequate, surplus_at_85 } = medisave;

  let badgeClass: string;
  let badgeText: string;
  let description: string;

  if (adequate === true) {
    badgeClass =
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    badgeText = "Adequate to age 85";
    description =
      "Projected MediSave balance covers MediShield Life premiums through age 85.";
  } else if (adequate === false) {
    badgeClass = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    badgeText = "Projected shortfall by 85";
    description =
      "Projected MediSave balance may be insufficient to sustain MediShield Life premiums to age 85.";
  } else {
    badgeClass =
      "bg-[var(--color-surface-raised)] text-[var(--color-muted)]";
    badgeText = "Indicative — insufficient projection";
    description = "Adequacy could not be determined from the available projection data.";
  }

  const hasSurplus = typeof surplus_at_85 === "number";
  const surplusLabel =
    hasSurplus && surplus_at_85! >= 0 ? "Surplus at 85" : "Shortfall at 85";

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Adequacy assessment
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${badgeClass}`}
        >
          {badgeText}
        </span>
        {hasSurplus && (
          <span className="text-sm tabular-nums">
            <span className="text-[var(--color-muted)]">{surplusLabel}: </span>
            <span className="font-semibold">{sgd(surplus_at_85!)}</span>
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{description}</p>
    </div>
  );
}
