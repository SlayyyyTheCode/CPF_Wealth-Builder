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
import { NumberInput } from "@/components/number-input";
import { getMember, simulate, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { Member, SimResult, Balances } from "@/lib/types";
import { sgd, sgdCompact } from "@/lib/format";
import { buildScenario, getWhatIf, setWhatIf, OA_TOPUP_CAP } from "@/lib/whatif";
import type { WhatIfParams } from "@/lib/whatif";

const total = (b: Balances) => b.OA + b.SA + b.MA + b.RA;

/* Consolidated top-up inputs for OA / SA / MA. Writes the same shared what-if
   store the account tabs read, so nothing about the maths changes — this only
   moves the controls into one place. */
function TopUpPlanner({
  whatIf, firstAge, inflow, onPatch,
}: {
  whatIf: WhatIfParams;
  firstAge: number;
  inflow: { OA: number; SA: number; MA: number; RA: number } | null;
  onPatch: (patch: WhatIfParams) => void;
}) {
  const oaTopup = whatIf.oa?.topup ?? 0;
  const oaStart = whatIf.oa?.startAge || firstAge;
  const saTopup = whatIf.sa?.topup ?? 0;
  const saStart = whatIf.sa?.startAge || firstAge;
  const saTransfer = whatIf.sa?.transfer ?? 0;
  const saTransferStart = whatIf.sa?.transferStartAge || firstAge;
  const saYears = whatIf.sa?.years ?? 40;
  const maTopup = whatIf.ma?.topup ?? 0;
  const maStart = whatIf.ma?.startAge || firstAge;

  // Each setter passes the WHOLE account slice, since the store merges at the
  // account level — omitting a field would wipe it.
  const setOa = (p: Partial<NonNullable<WhatIfParams["oa"]>>) =>
    onPatch({ oa: { topup: oaTopup, startAge: oaStart, capPerYear: OA_TOPUP_CAP, ...p } });
  const setSa = (p: Partial<NonNullable<WhatIfParams["sa"]>>) =>
    onPatch({ sa: { topup: saTopup, transfer: saTransfer, startAge: saStart, transferStartAge: saTransferStart, years: saYears, ...p } });
  const setMa = (p: Partial<NonNullable<WhatIfParams["ma"]>>) =>
    onPatch({ ma: { topup: maTopup, startAge: maStart, ...p } });

  const inCls = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm";
  const lblCls = "mb-1 block text-xs text-[var(--color-muted)]";
  const yr = (n: number) => `${sgd(Math.round(n))}/Yr`;

  return (
    <div className="mt-4 rounded-xl bg-[var(--color-surface-raised)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Top-Up Planner
      </p>
      <div className="mt-3 grid gap-x-6 gap-y-5 lg:grid-cols-3 lg:divide-x lg:divide-[var(--color-border)]">
        {/* OA */}
        <div>
          <h4 className="text-sm font-semibold">Ordinary Account (OA)</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tp-oa" className={lblCls}>Yearly Top-Up ($)</label>
              <NumberInput id="tp-oa" min={0} max={OA_TOPUP_CAP} step={1000} value={Math.min(oaTopup, OA_TOPUP_CAP)}
                onChange={(v) => setOa({ topup: Math.min(Math.max(v, 0), OA_TOPUP_CAP) })} className={inCls} aria-label="Yearly OA top-up" />
            </div>
            <div>
              <label htmlFor="tp-oa-age" className={lblCls}>From Age</label>
              <NumberInput id="tp-oa-age" min={0} max={120} step={1} value={oaStart}
                onChange={(v) => setOa({ startAge: v })} className={inCls} aria-label="OA top-up start age" />
            </div>
          </div>
          {inflow && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Salary + Employer: {yr(inflow.OA)} · Your Top-Up:{" "}
              <span className="font-semibold text-[var(--color-primary)]">+{yr(oaTopup)}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-muted)]">Max {sgd(OA_TOPUP_CAP)}/Yr (What-If Only).</p>
        </div>

        {/* SA */}
        <div className="lg:pl-6">
          <h4 className="text-sm font-semibold">Special Account (SA)</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tp-sa" className={lblCls}>Yearly Top-Up ($)</label>
              <NumberInput id="tp-sa" min={0} step={1000} value={saTopup}
                onChange={(v) => setSa({ topup: Math.max(v, 0) })} className={inCls} aria-label="Yearly SA top-up" />
            </div>
            <div>
              <label htmlFor="tp-sa-age" className={lblCls}>From Age</label>
              <NumberInput id="tp-sa-age" min={0} max={120} step={1} value={saStart}
                onChange={(v) => setSa({ startAge: v })} className={inCls} aria-label="SA top-up start age" />
            </div>
            <div>
              <label htmlFor="tp-sa-xfer" className={lblCls}>OA → SA Transfer ($)</label>
              <NumberInput id="tp-sa-xfer" min={0} step={1000} value={saTransfer}
                onChange={(v) => setSa({ transfer: Math.max(v, 0) })} className={inCls} aria-label="Yearly OA to SA transfer" />
            </div>
            <div>
              <label htmlFor="tp-sa-xfer-age" className={lblCls}>Transfer From Age</label>
              <NumberInput id="tp-sa-xfer-age" min={0} max={120} step={1} value={saTransferStart}
                onChange={(v) => setSa({ transferStartAge: v })} className={inCls} aria-label="OA to SA transfer start age" />
            </div>
            <div>
              <label htmlFor="tp-sa-yrs" className={lblCls}>For (Years)</label>
              <NumberInput id="tp-sa-yrs" min={1} max={60} step={1} value={saYears}
                onChange={(v) => setSa({ years: Math.max(v, 1) })} className={inCls} aria-label="Years applied" />
            </div>
          </div>
          {inflow && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Salary + Employer: {yr(inflow.SA + inflow.RA)} · Your Top-Up:{" "}
              <span className="font-semibold text-[var(--color-primary)]">+{yr(saTopup)}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-muted)]">Stops Automatically At The FRS.</p>
        </div>

        {/* MA */}
        <div className="lg:pl-6">
          <h4 className="text-sm font-semibold">MediSave (MA)</h4>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tp-ma" className={lblCls}>Yearly Top-Up ($)</label>
              <NumberInput id="tp-ma" min={0} step={1000} value={maTopup}
                onChange={(v) => setMa({ topup: Math.max(v, 0) })} className={inCls} aria-label="Yearly MA top-up" />
            </div>
            <div>
              <label htmlFor="tp-ma-age" className={lblCls}>From Age</label>
              <NumberInput id="tp-ma-age" min={0} max={120} step={1} value={maStart}
                onChange={(v) => setMa({ startAge: v })} className={inCls} aria-label="MA top-up start age" />
            </div>
          </div>
          {inflow && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Salary + Employer: {yr(inflow.MA)} · Your Top-Up:{" "}
              <span className="font-semibold text-[var(--color-primary)]">+{yr(maTopup)}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-muted)]">Shown In The MediSave Card Below.</p>
        </div>
      </div>
    </div>
  );
}
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
  // The Top-Up Planner edits these live. Seeded from the shared store so the
  // account-tab charts and Overview stay in sync; every edit persists back.
  const [whatIf, setWhatIfState] = useState<WhatIfParams>(() => getWhatIf(Number(id)));

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

  // Merge a patch into the what-if plan and persist it. Start ages default to
  // `firstAge` when unset so a top-up entered here without a chosen age behaves
  // like the account tabs (which seed the start age to the current age) rather
  // than annuitising from age 0.
  function patchWhatIf(patch: WhatIfParams) {
    setWhatIfState((prev) => {
      const next: WhatIfParams = { ...prev, ...patch };
      setWhatIf(Number(id), patch);
      return next;
    });
  }

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

  // Combined what-if scenario from the live plan state (not a fresh store read),
  // so the Top-Up Planner below updates the chart on every keystroke. Anchor the
  // first (current-age) row to the member's real balances so "Current Amount"
  // matches "Total CPF now" exactly (minus MA).
  const scenRows = buildScenario(res.years, whatIf, frsInfo, member.balances);
  const ages = res.years.map((y) => y.age);
  const firstAge = ages[0];
  const selAge = scenAge ?? ages[0];
  const selRow = scenRows.find((r) => r.age === selAge) ?? scenRows[0];
  const scenDelta = selRow ? selRow.scen - selRow.base : 0;
  const scenMaDelta = selRow ? selRow.scenMa - selRow.baseMa : 0;

  return (
    <>
      <PageHeading
        icon={<OverviewIcon className="h-7 w-7" />}
        title={member.name}
        subtitle="Your CPF today, where it's heading, and whether you're on track."
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
          <p className="mt-2 text-xs text-[var(--color-muted)]">Your CPF is split by age across OA, SA and MediSave, with interest added yearly.</p>
        </div>
        <div className="grid gap-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-sm font-semibold">Retirement readiness</h3>
            <ReadinessRing r={res.readiness} />
            <p className="mt-2 text-xs text-[var(--color-muted)]">How close you are to the Full Retirement Sum (70%) and your MediSave target (30%).</p>
          </div>
          <div>
            <CpfLifeCard c={res.cpf_life} />
            <p className="mt-2 text-xs text-[var(--color-muted)]">Estimated monthly payout for life. CPF&apos;s official figure may differ.</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <AccountBreakdownChart years={res.years} />
        <p className="mt-2 text-xs text-[var(--color-muted)]">What each account holds at every age.</p>
      </div>
      {/* What-If Scenario — combines the OA / SA / MA top-up calculators */}
      <section aria-label="What-if scenario" className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <h3 className="text-sm font-semibold">What-If Scenario</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Plan Extra Top-Ups To Your OA, SA And MA All In One Place, And See The Combined Result.
          Each Forecast Is Your <span className="font-semibold text-[var(--color-fg)]">Existing
          Salary + Employer CPF Plus Your Top-Up</span> — Your Top-Ups Are Added On Top, Never
          Instead.{" "}
          <span className="font-semibold text-[var(--color-fg)]">MediSave Isn&apos;t Counted</span>{" "}
          In The Total — It&apos;s For Healthcare Only, And Has Its Own Card Below.
        </p>

        <TopUpPlanner
          whatIf={whatIf}
          firstAge={firstAge}
          inflow={res.years[0]?.contribution_by_account ?? null}
          onPatch={patchWhatIf}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">Current Amount (w/o MA) (age {selAge})</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{sgd(selRow?.base ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">What-If (w/o MA) (age {selAge})</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--color-primary)]">{sgd(selRow?.scen ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-xs text-[var(--color-muted)]">Difference</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${scenDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {scenDelta > 0 ? "+" : ""}{sgd(scenDelta)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">OA and SA/RA only — the money that can fund your retirement.</p>

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
