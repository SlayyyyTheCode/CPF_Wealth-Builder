"use client";
import { use, useEffect, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { ReadinessRing } from "@/components/readiness-ring";
import { CpfLifeCard } from "@/components/cpf-life-card";
import { NetWorthChart } from "@/components/net-worth-chart";
import { AccountBreakdownChart } from "@/components/account-breakdown-chart";
import { GrowthChart } from "@/components/growth-chart";
import { PageHeading, OverviewIcon } from "@/components/icons";
import { getMember, simulate } from "@/lib/api";
import type { Member, SimResult, Balances } from "@/lib/types";
import { sgd, sgdCompact } from "@/lib/format";

const total = (b: Balances) => b.OA + b.SA + b.MA + b.RA;
const atAge = (r: SimResult, age: number) => {
  const row = r.years.find(y => y.age === age);
  return row ? sgdCompact(total(row.closing)) : "—";
};
const lifetimeInterest = (r: SimResult): number =>
  r.years.reduce((sum, y) => sum + (y.interest_base ?? 0) + (y.interest_extra ?? 0), 0);

export default function ClientDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<Member | null>(null);
  const [res, setRes] = useState<SimResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    Promise.all([getMember(Number(id)), simulate(Number(id), 91)])
      .then(([m, run]) => { if (ok) { setMember(m); setRes(run.result); } })
      .catch(e => ok && setErr((e as Error).message));
    return () => { ok = false; };
  }, [id]);

  if (err)
    return <p role="alert" className="text-[var(--color-error)]">Couldn&apos;t load: {err}</p>;

  if (!member || !res)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        ))}
      </div>
    );

  const totalInterest = lifetimeInterest(res);

  return (
    <>
      <PageHeading
        icon={<OverviewIcon className="h-7 w-7" />}
        title={member.name}
        subtitle="CPF net worth, projections and retirement readiness at a glance."
      />
      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard hero label="Total CPF now" value={sgd(total(member.balances))} />
        <KpiCard label="Projected at 55" value={atAge(res, 55)} />
        <KpiCard label="Projected at 65" value={atAge(res, 65)} />
        <KpiCard label="Projected at 90" value={atAge(res, 90)} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <NetWorthChart years={res.years} />
          <p className="mt-2 text-xs text-[var(--color-muted)]">Projected monthly: contributions are allocated to OA/SA/MA by age-band rates, overflow rules applied, then interest credited yearly.</p>
        </div>
        <div className="grid gap-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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
