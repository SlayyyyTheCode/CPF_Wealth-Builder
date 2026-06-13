import type { CpfLife } from "@/lib/types";
import { sgd } from "@/lib/format";
export function CpfLifeCard({ c }: { c: CpfLife | Record<string, never> }) {
  const eligible = "eligible" in c && c.eligible;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold">CPF LIFE payout</h3>
      {eligible ? (
        <>
          <div className="mt-2 text-3xl font-bold">{sgd((c as CpfLife).monthly_payout)}<span className="text-sm font-normal text-[var(--color-muted)]">/mo</span></div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">From age {(c as CpfLife).payout_age} · break-even ~{(c as CpfLife).break_even_age}</p>
        </>
      ) : <p className="mt-2 text-sm text-[var(--color-muted)]">Not yet eligible (RA below the minimum at payout age).</p>}
    </div>
  );
}
