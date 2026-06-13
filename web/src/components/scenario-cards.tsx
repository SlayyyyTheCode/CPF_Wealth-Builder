import { sgd } from "@/lib/format";

type Scenarios = Record<string, Record<string, unknown>>;

const num = (o: Record<string, unknown> | undefined, k: string): string =>
  typeof o?.[k] === "number" ? sgd(o[k] as number) : "—";

const bool = (o: Record<string, unknown> | undefined, k: string): boolean =>
  o?.[k] === true;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      }`}
    >
      {children}
    </span>
  );
}

export function ScenarioCards({ scenarios }: { scenarios: Scenarios }) {
  const brs = scenarios.below_brs ?? {};
  const prop = scenarios.property_pledge ?? {};
  const ers = scenarios.ers_optimisation ?? {};

  const brsTriggered = bool(brs, "triggered");
  const propEligible = bool(prop, "eligible");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Below BRS */}
      <Card title="Below BRS">
        {brsTriggered ? (
          <>
            <StatusBadge ok={false}>Shortfall detected</StatusBadge>
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              <Row label="Shortfall" value={num(brs, "shortfall")} />
              <Row label="Reduced payout" value={num(brs, "reduced_monthly_payout")} />
              <Row label="Recommended top-up" value={num(brs, "recommended_topup")} />
            </div>
          </>
        ) : (
          <>
            <StatusBadge ok={true}>RA on track for BRS</StatusBadge>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Projected RA balance meets or exceeds the Basic Retirement Sum.
              No top-up required at this time.
            </p>
          </>
        )}
      </Card>

      {/* Property Pledge */}
      <Card title="Property Pledge">
        {propEligible ? (
          <>
            <StatusBadge ok={true}>Eligible</StatusBadge>
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              <Row label="Freed cash" value={num(prop, "freed_cash")} />
              <Row label="Payout (FRS)" value={num(prop, "payout_full_frs")} />
              <Row label="Payout (BRS pledge)" value={num(prop, "payout_brs")} />
              <Row label="Payout difference" value={num(prop, "payout_difference")} />
            </div>
          </>
        ) : (
          <>
            <StatusBadge ok={true}>Not applicable</StatusBadge>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Not eligible — property lease does not extend to age 95 or
              no qualifying property is pledged.
            </p>
          </>
        )}
      </Card>

      {/* ERS Optimisation */}
      <Card title="ERS Optimisation">
        <div className="divide-y divide-[var(--color-border)]">
          <Row label="ERS top-up needed" value={num(ers, "ers_topup_needed")} />
          <Row label="Payout uplift" value={num(ers, "payout_uplift")} />
          <Row
            label="Tax relief eligible"
            value={
              typeof ers.tax_relief_eligible === "boolean"
                ? ers.tax_relief_eligible
                  ? "Yes"
                  : "No"
                : "—"
            }
          />
          <Row label="Est. tax saved" value={num(ers, "estimated_tax_saved")} />
        </div>
      </Card>
    </div>
  );
}
