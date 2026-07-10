"use client";
import { use, useEffect, useState } from "react";
import { simulate, getMember, getActivePolicy, peekMember, peekSim, peekPolicy } from "@/lib/api";
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
      <h2 className="text-lg font-bold text-[var(--color-fg)]">Projected CPF Figures across the Years</h2>
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

      {/* Columns divided by rules rather than nested cards — a card inside a
          card flattens the hierarchy instead of reinforcing it. */}
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-3 sm:divide-x sm:divide-[var(--color-border)]">
        {rows.map((r, i) => (
          <div key={r.label} className={i > 0 ? "sm:pl-6" : undefined}>
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
  const [res, setRes] = useState<SimResult | null>(() => peekSim(Number(id))?.result ?? null);
  const [member, setMember] = useState<Member | null>(() => peekMember(Number(id)));
  const [policy, setPolicy] = useState<PolicySnapshot | null>(
    () => (peekPolicy(new Date().getFullYear()) as PolicySnapshot | null) ?? null,
  );
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

      <AccelerationTips
        bhsGap={Math.max(bhs - bal.MA, 0)}
        frsGap={Math.max(frs - frsCurrentBal, 0)}
        ersGap={Math.max(ers - bal.RA, 0)}
        age={member ? new Date().getFullYear() - new Date(member.dob).getFullYear() : 0}
      />
    </>
  );
}

/* Actionable levers to reach each sum sooner, with today's remaining gaps. */
function AccelerationTips({
  bhsGap, frsGap, ersGap, age,
}: {
  bhsGap: number; frsGap: number; ersGap: number; age: number;
}) {
  const groups = [
    {
      title: "Hit the BHS sooner (MediSave)",
      gap: bhsGap,
      gapLabel: "MA gap today",
      tips: [
        "Make voluntary cash top-ups to MediSave (VC-MA) — dollar-for-dollar tax relief, and the balance earns 4%.",
        "Pay MediShield Life / Integrated Shield premiums with cash instead of MA where affordable, so the MA keeps compounding.",
        "Once MA reaches the BHS, all further MA contributions and interest overflow to SA (or OA after FRS) — hitting BHS early accelerates your FRS too.",
        "Note: the BHS itself rises ~4.5%/yr until age 65, so every year of delay raises the target.",
      ],
    },
    {
      title: "Hit the FRS sooner (SA/RA)",
      gap: frsGap,
      gapLabel: age >= 55 ? "RA gap today" : "SA gap today",
      tips: [
        "RSTU cash top-ups to SA — up to $8,000/yr of tax relief for self top-ups (another $8,000 for family), compounding at 4%.",
        "Transfer OA → SA (irreversible): the same dollars earn 4% instead of 2.5%. Model it in the SA tab's Top-up what-if calculator.",
        "Minimise OA outflows for housing where possible — every dollar kept earns interest and counts toward the FRS at 55; a Voluntary Housing Refund returns past housing withdrawals (plus accrued interest) to your OA.",
        "Start early: the first $60k of combined balances earns +1% extra interest — money added in your 30s compounds for decades.",
      ],
    },
    {
      title: "Reach the ERS (RA, from 55)",
      gap: ersGap,
      gapLabel: "RA gap to ERS today",
      tips: [
        "From 55, top the RA up to the Enhanced Retirement Sum (cash or OA) — the ERS is the maximum CPF LIFE base and roughly doubles the FRS payout.",
        "You can top up yearly as the ERS rises (~3.5%/yr) — each January the new ERS opens fresh top-up room.",
        "Defer CPF LIFE payouts to 70 (+7%/yr, up to +35% permanently) while the RA keeps compounding at 4%.",
        "Model all of this in the CPF Millionaire tab's planner and delay-payout cards.",
      ],
    },
  ];
  return (
    <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-bold text-[var(--color-fg)]">How to hit these targets faster</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        The levers that move each milestone, with this client&apos;s remaining gap today.
      </p>
      {/* Columns divided by rules rather than nested cards (see note above). */}
      <div className="mt-5 grid gap-x-6 gap-y-6 lg:grid-cols-3 lg:divide-x lg:divide-[var(--color-border)]">
        {groups.map((g, i) => (
          <div key={g.title} className={i > 0 ? "lg:pl-6" : undefined}>
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {g.gapLabel}:{" "}
              <span className={`font-semibold tabular-nums ${g.gap === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--color-fg)]"}`}>
                {g.gap === 0 ? "reached ✓" : sgd(g.gap)}
              </span>
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
              {g.tips.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden="true" className="text-[var(--color-primary)]">•</span>
                  <span className="text-pretty">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Top-ups are capped (SA at the FRS, MA at the BHS, RA at the ERS) and SA/OA→SA transfers are
        irreversible. Tax relief is subject to the $80,000 personal relief ceiling — see the
        Tax Relief Strategies tab.
      </p>
    </div>
  );
}
