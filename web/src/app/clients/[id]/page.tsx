"use client";
import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { KpiCard } from "@/components/kpi-card";
import { ReadinessRing } from "@/components/readiness-ring";
import { CpfLifeCard } from "@/components/cpf-life-card";
import { ChartSkeleton } from "@/components/chart-skeleton";

// Charts pull in recharts (~heavy). Load them as a separate async chunk so the
// KPIs and shell paint first — big win on mobile / slow networks.
const NetWorthChart = dynamic(
  () => import("@/components/net-worth-chart").then((m) => ({ default: m.NetWorthChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const AccountBreakdownChart = dynamic(
  () => import("@/components/account-breakdown-chart").then((m) => ({ default: m.AccountBreakdownChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const GrowthChart = dynamic(
  () => import("@/components/growth-chart").then((m) => ({ default: m.GrowthChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const WhatIfScenarioChart = dynamic(
  () => import("@/components/whatif-scenario-chart").then((m) => ({ default: m.WhatIfScenarioChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
import { PageHeading, OverviewIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { YearScrubber } from "@/components/year-scrubber";
import { getMember, simulate, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { Member, SimResult, Balances } from "@/lib/types";
import { sgd, sgdCompact } from "@/lib/format";
import { buildScenario, getWhatIf } from "@/lib/whatif";

const total = (b: Balances) => b.OA + b.SA + b.MA + b.RA;
const atAge = (r: SimResult, age: number) => {
  const row = r.years.find(y => y.age === age);
  return row ? sgdCompact(total(row.closing)) : "—";
};
const lifetimeInterest = (r: SimResult): number =>
  r.years.reduce((sum, y) => sum + (y.interest_base ?? 0) + (y.interest_extra ?? 0), 0);

export default function ClientDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<Member | null>(() => peekMember(Number(id)));
  const [res, setRes] = useState<SimResult | null>(() => peekSim(Number(id))?.result ?? null);
  const [frsInfo, setFrsInfo] = useState<{ frs: number; sumRate: number; baseYear: number }>(
    { frs: 0, sumRate: 0.035, baseYear: new Date().getFullYear() },
  );
  const [scenAge, setScenAge] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    Promise.all([getMember(Number(id)), simulate(Number(id), 91), getActivePolicy(new Date().getFullYear())])
      .then(([m, run, policy]) => {
        if (!ok) return;
        setMember(m);
        setRes(run.result);
        const growth = (policy.assumptions as { growth?: { sum_rate?: number } } | undefined)?.growth;
        setFrsInfo({
          frs: Number(policy.frs) || 0,
          sumRate: Number(growth?.sum_rate ?? 0.035),
          baseYear: Number(policy.effective_year) || new Date().getFullYear(),
        });
        setScenAge((a) => a ?? run.result.years[0]?.age ?? null);
      })
      .catch(e => ok && setErr((e as Error).message));
    return () => { ok = false; };
  }, [id]);

  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  if (!member || !res)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        ))}
      </div>
    );

  const totalInterest = lifetimeInterest(res);
  const yearAt = (age: number) => res.years.find((y) => y.age === age)?.year;

  // Combined what-if scenario, pulling each account's Top-up what-if params.
  const scenRows = buildScenario(res.years, getWhatIf(Number(id)), frsInfo);
  const ages = res.years.map((y) => y.age);
  const selAge = scenAge ?? ages[0];
  const selRow = scenRows.find((r) => r.age === selAge) ?? scenRows[0];
  const scenDelta = selRow ? selRow.scen - selRow.base : 0;
  const scenMaDelta = selRow ? selRow.scenMa - selRow.baseMa : 0;

  return (
    <>
      <PageHeading
        icon={<OverviewIcon className="h-7 w-7" />}
        title={member.name}
        subtitle="CPF net worth, projections and retirement readiness at a glance."
      />
      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard hero label="Total CPF now" value={sgd(total(member.balances))} sub="across OA · SA · MA · RA" />
        <KpiCard label="Projected at 55" value={atAge(res, 55)} sub={`RA forms${yearAt(55) ? ` · ${yearAt(55)}` : ""}`} />
        <KpiCard label="Projected at 65" value={atAge(res, 65)} sub={`CPF LIFE age${yearAt(65) ? ` · ${yearAt(65)}` : ""}`} />
        <KpiCard label="Projected at 90" value={atAge(res, 90)} sub={yearAt(90) ? `Year ${yearAt(90)}` : "lifetime"} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <NetWorthChart years={res.years} />
          <p className="mt-2 text-xs text-[var(--color-muted)]">Projected monthly: contributions are allocated to OA/SA/MA by age-band rates, overflow rules applied, then interest credited yearly.</p>
        </div>
        <div className="grid gap-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-sm font-semibold">Retirement readiness</h3>
            <ReadinessRing r={res.readiness} />
            <p className="mt-2 text-xs text-[var(--color-muted)]">Score = 70% × (RA at 55 ÷ FRS) + 30% × (MA at 55 ÷ BHS), capped at 100.</p>
          </div>
          <div>
            <CpfLifeCard c={res.cpf_life} />
            <p className="mt-2 text-xs text-[var(--color-muted)]">Estimated as an annuity on your RA earning 4% to age 90; not CPF&apos;s official actuarial figure.</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <AccountBreakdownChart years={res.years} />
        <p className="mt-2 text-xs text-[var(--color-muted)]">Account balances at each age after contributions, overflow and interest.</p>
      </div>
      {/* What-If Scenario — combines the OA / SA / MA top-up calculators */}
      <section aria-label="What-if scenario" className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <h3 className="text-sm font-semibold">What-If Scenario</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Combines the Top-up what-if calculators from OA and SA. Accounts you
          haven&apos;t set fall back to their projected balance. Drag to an age to
          compare the total. MediSave (MA) is shown separately below — it can&apos;t
          fund a CPF LIFE payout or general spending.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">Original total (age {selAge})</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{sgd(selRow?.base ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">With what-if (age {selAge})</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--color-primary)]">{sgd(selRow?.scen ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">Difference</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${scenDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {scenDelta > 0 ? "+" : ""}{sgd(scenDelta)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">OA + SA/RA only (payout-eligible).</p>

        <div className="mt-4">
          <YearScrubber ages={ages} value={selAge} onChange={setScenAge} />
        </div>

        <div className="mt-4">
          <WhatIfScenarioChart rows={scenRows} markerAge={selAge} />
        </div>

        {/* MediSave (MA) — separate, not payout-eligible */}
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            MediSave (MA) — age {selAge}, not payout-eligible
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--color-muted)]">Original</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(selRow?.baseMa ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">With what-if</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">{sgd(selRow?.scenMa ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Difference</p>
              <p className={`mt-0.5 text-lg font-bold tabular-nums ${scenMaDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {scenMaDelta > 0 ? "+" : ""}{sgd(scenMaDelta)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4">
        <GrowthChart years={res.years} />
        {totalInterest > 0 && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Total interest earned by age 90:{" "}
            <span className="font-semibold text-[var(--color-primary)]">{sgd(Math.round(totalInterest))}</span>
            {" "}— the portion of your final balance that CPF&apos;s compound interest added on top of what you put in.
          </p>
        )}
      </div>
    </>
  );
}
