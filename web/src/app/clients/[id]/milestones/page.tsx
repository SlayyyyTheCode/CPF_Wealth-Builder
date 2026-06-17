"use client";
import { use, useEffect, useState } from "react";
import { simulate, getMember, getActivePolicy } from "@/lib/api";
import type { SimResult, Member } from "@/lib/types";
import { TargetTimeline } from "@/components/target-timeline";
import { PageHeading, MilestonesIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";

interface PolicySnapshot {
  bhs: number | string;
  frs: number | string;
  ers: number | string;
  assumptions?: { growth?: { sum_rate?: number; bhs_rate?: number } } | null;
  [key: string]: unknown;
}

/* Projected targets N years from now. BHS grows at bhs_rate, FRS/ERS at sum_rate. */
function ProjectionPanel({
  bhs,
  frs,
  ers,
  sumRate,
  bhsRate,
}: {
  bhs: number;
  frs: number;
  ers: number;
  sumRate: number;
  bhsRate: number;
}) {
  const [years, setYears] = useState(10);
  const targetYear = new Date().getFullYear() + years;
  const grow = (base: number, rate: number) => base * Math.pow(1 + rate, years);
  const rows = [
    { label: "BHS — Basic Healthcare Sum", today: bhs, proj: grow(bhs, bhsRate), rate: bhsRate },
    { label: "FRS — Full Retirement Sum", today: frs, proj: grow(frs, sumRate), rate: sumRate },
    { label: "ERS — Enhanced Retirement Sum", today: ers, proj: grow(ers, sumRate), rate: sumRate },
  ];

  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-bold text-[var(--color-fg)]">Project the targets forward</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Targets rise over time. Pick how many years ahead to see the projected sums you&apos;ll need to hit.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor="proj-years" className="mb-1 block text-xs font-medium">
          Years from now: <span className="font-bold text-[var(--color-primary)]">{years}</span> → Year {targetYear}
        </label>
        <input
          id="proj-years"
          type="range"
          min={0}
          max={40}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
          aria-label="Years from now to project targets"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
            <p className="text-xs font-medium text-[var(--color-muted)]">{r.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-fg)]">{sgd(Math.round(r.proj))}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Today {sgd(r.today)} · grows ~{(r.rate * 100).toFixed(1)}%/yr
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Projected as today&apos;s sum compounded at the policy growth assumptions. Actual future values are set by CPF each year.
      </p>
    </div>
  );
}

export default function MilestonesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [res, setRes] = useState<SimResult | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [policy, setPolicy] = useState<PolicySnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    const year = new Date().getFullYear();

    Promise.all([
      simulate(Number(id), 91),
      getMember(Number(id)),
      getActivePolicy(year).catch(() => null),
    ])
      .then(([simRun, mem, pol]) => {
        if (!ok) return;
        setRes(simRun.result);
        setMember(mem);
        if (pol) setPolicy(pol as PolicySnapshot);
        else setErr("No active CPF policy found for this year.");
      })
      .catch((e) => ok && setErr((e as Error).message));

    return () => {
      ok = false;
    };
  }, [id]);

  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  if (!res || !member || !policy)
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl bg-[var(--color-surface-raised)]"
          />
        ))}
      </div>
    );

  const bhs = Number(policy.bhs);
  const frs = Number(policy.frs);
  const ers = Number(policy.ers);
  const bal = member.balances;
  const m = res.milestones;

  const frsCurrentBal = Math.max(bal.SA, bal.RA);

  return (
    <>
      <PageHeading
        icon={<MilestonesIcon className="h-7 w-7" />}
        title="Milestones"
        subtitle="When each CPF target is reached, and how much more you need today to hit it."
      />

      <div className="flex flex-col gap-5">
        <TargetTimeline
          label="BHS — Basic Healthcare Sum"
          target={bhs}
          current={bal.MA}
          hitAge={m?.bhs_age ?? null}
        />
        <TargetTimeline
          label="FRS — Full Retirement Sum"
          target={frs}
          current={frsCurrentBal}
          hitAge={m?.frs_age ?? null}
        />
        <TargetTimeline
          label="ERS — Enhanced Retirement Sum"
          target={ers}
          current={bal.RA}
          hitAge={m?.ers_age ?? null}
        />
      </div>

      <ProjectionPanel
        bhs={bhs}
        frs={frs}
        ers={ers}
        sumRate={Number(policy.assumptions?.growth?.sum_rate ?? 0.035)}
        bhsRate={Number(policy.assumptions?.growth?.bhs_rate ?? 0.045)}
      />
    </>
  );
}
