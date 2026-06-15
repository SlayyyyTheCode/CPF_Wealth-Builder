"use client";
import { use, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { simulate, simulateWhatIf, getMember, getActivePolicy } from "@/lib/api";
import type { SimResult, Member } from "@/lib/types";
import { PageHeading, MillionaireIcon, RocketIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin";
import { sgd, sgdCompact } from "@/lib/format";

// ── CPF constants (mirror api/app/engines: interest.py / cpflife.py) ──────────
const OA_RATE = 0.025;
const RA_RATE = 0.04;
const LONGEVITY = 90;

type Plan = "Standard" | "Escalating";

// Annuity present-value factor matching cpflife.py (RA paid monthly to age 90).
function annuityPv(payoutAge: number, plan: Plan, raRate = RA_RATE): number {
  const r = raRate / 12;
  const n = (LONGEVITY - payoutAge) * 12;
  const esc = plan === "Escalating" ? 1.02 : 1;
  let pv = 0;
  for (let k = 1; k <= n; k++) {
    const shape = esc === 1 ? 1 : esc ** Math.floor((k - 1) / 12);
    pv += shape / (1 + r) ** k;
  }
  return pv;
}
const deferralBonus = (payoutAge: number) => Math.min(0.07 * (payoutAge - 65), 0.35);
// First-month payout from a given RA at payout (deferral applied).
function monthlyFromRA(ra: number, payoutAge: number, plan: Plan): number {
  return (ra * (1 + deferralBonus(payoutAge))) / annuityPv(payoutAge, plan);
}
// RA needed at payout to produce a target first-month payout.
function raForMonthly(target: number, payoutAge: number, plan: Plan): number {
  return (target * annuityPv(payoutAge, plan)) / (1 + deferralBonus(payoutAge));
}

// ── shared styles ─────────────────────────────────────────────────────────────
const cardClass =
  "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const kpiClass = "mt-1 text-2xl font-bold tabular-nums";
const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const btnClass =
  "rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] active:scale-95 transition-all disabled:opacity-50";
const tooltipStyle = {
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function MillionairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useAdmin();
  const [res, setRes] = useState<SimResult | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    const numId = Number(id);
    Promise.all([simulate(numId, 91), getMember(numId), getActivePolicy(new Date().getFullYear())])
      .then(([r, m, p]) => {
        if (!ok) return;
        setRes(r.result);
        setMember(m);
        setPolicy(p);
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => { ok = false; };
  }, [id]);

  if (err)
    return <p role="alert" className="text-[var(--color-error)]">Could not load: {err}</p>;

  if (!res || !member || !policy)
    return (
      <div className="space-y-3">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" />
        <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
      </div>
    );

  // Access gate: admin or a member the admin granted special access.
  if (!(isAdmin || !!member.special_access)) {
    return (
      <>
        <PageHeading icon={<MillionaireIcon className="h-7 w-7" />} title="CPF Millionaire" />
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-card)]">
          <MillionaireIcon className="mx-auto h-12 w-12" />
          <h3 className="mt-3 text-base font-semibold">Restricted feature 🔒</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-muted)]">
            CPF Millionaire is available to the system administrator and clients granted special
            access. Ask the administrator to enable access for this client under Settings.
          </p>
        </div>
      </>
    );
  }

  // ── derived policy + projection context ─────────────────────────────────────
  const frs = Number(policy.frs) || 0;
  const ers = Number(policy.ers) || 0;
  const brs = Number(policy.brs) || 0;
  const bhs = Number(policy.bhs) || 0;
  const assumptions = (policy.assumptions ?? {}) as {
    growth?: { sum_rate?: number };
    cpf_life?: { ra_rate?: number; longevity_age?: number };
  };
  const sumRate = Number(assumptions.growth?.sum_rate ?? 0.035);
  const baseYear = Number(policy.effective_year) || new Date().getFullYear();
  const proj = (base: number, year: number) => base * (1 + sumRate) ** Math.max(year - baseYear, 0);

  const years = res.years;
  const currentAge = years[0].age;
  const currentYear = years[0].year;
  const yearForAge = (age: number) => currentYear + (age - currentAge);

  return (
    <>
      <PageHeading
        icon={<MillionaireIcon className="h-7 w-7" />}
        title="CPF Millionaire"
        subtitle="How to build CPF into a lifelong retirement income — and the tools to get there."
      />

      <StrategySection brs={brs} frs={frs} ers={ers} proj={proj} yearForAge={yearForAge} />
      <IncomePlanner id={Number(id)} ers={ers} proj={proj} yearForAge={yearForAge} currentAge={currentAge} />
      <TransferCard member={member} frs={proj(frs, currentYear)} bhs={bhs} />
      <CpfisCard member={member} />
      <WhatIfCard ers={ers} proj={proj} yearForAge={yearForAge} memberRa={member.balances.RA} currentAge={currentAge} />

      <p className="mt-2 text-xs text-[var(--color-muted)]">
        Figures are a transparent annuity estimate, not CPF Board&apos;s pooled actuarial payout.
        Investment returns and top-up assumptions are illustrative, not guaranteed.
      </p>
    </>
  );
}

// ── 1. Strategy ────────────────────────────────────────────────────────────────
function StrategySection({
  brs, frs, ers, proj, yearForAge,
}: {
  brs: number; frs: number; ers: number;
  proj: (b: number, y: number) => number; yearForAge: (a: number) => number;
}) {
  const ersAt55 = proj(ers, yearForAge(55));
  const steps = [
    { t: "Hit the FRS as early as you can", d: `Use cash top-ups (RSTU, up to $8k/yr, tax-deductible) and OA→SA transfers to reach the Full Retirement Sum (today ${sgd(frs)}) early — every extra year compounds at 4%. SA top-ups stop once you reach the FRS.` },
    { t: "Keep the first $60k earning extra interest", d: "CPF pays +1% (below 55) / +2% then +1% (55+) on the first $60k of combined balances — keep it invested in CPF, not drawn down." },
    { t: "At 55, top the RA up to the ERS", d: `The Enhanced Retirement Sum (today ${sgd(ers)}, ~${sgd(ersAt55)} by the time you turn 55) is the maximum you can top up to. After ERS you can't top up more — but the RA keeps compounding at 4% with no upper cap.` },
    { t: "Choose your payout lever", d: "Defer CPF LIFE to age 70 (+7%/yr, up to +35%) and/or pick the Escalating plan to keep pace with inflation." },
    { t: "Beyond ~$12k/mth, invest outside CPF", d: "CPF's guaranteed 4% plus the ERS cap realistically tops out around $10–12k/mth. Higher income needs investing beyond CPF (e.g. CPFIS, SRS, private portfolios)." },
  ];
  return (
    <section className={`${cardClass} mb-4`} aria-label="Strategy to a lifelong CPF income">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <RocketIcon className="h-6 w-6" /> The strategy: max FRS → ERS → compound → defer
      </h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{s.t}</p>
              <p className="text-sm text-[var(--color-muted)]">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Retirement sums today — BRS {sgd(brs)} · FRS {sgd(frs)} · ERS {sgd(ers)} (rise ~3.5%/yr).
      </p>
    </section>
  );
}

// ── 2. Retirement Income Planner ───────────────────────────────────────────────
function IncomePlanner({
  id, ers, proj, yearForAge, currentAge,
}: {
  id: number; ers: number;
  proj: (b: number, y: number) => number; yearForAge: (a: number) => number; currentAge: number;
}) {
  const [target, setTarget] = useState(7000);
  const [payoutAge, setPayoutAge] = useState(65);
  const [plan, setPlan] = useState<Plan>("Standard");
  const [hitErsAge, setHitErsAge] = useState(55);
  const [result, setResult] = useState<{
    requiredRa: number; projectedRa: number; monthlyProj: number; target: number;
    payoutAge: number; engineMonthly: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function compute() {
    setLoading(true);
    try {
      const ersAtHit = proj(ers, yearForAge(Math.max(hitErsAge, currentAge)));
      const projectedRa = ersAtHit * (1 + RA_RATE) ** Math.max(payoutAge - hitErsAge, 0);
      const monthlyProj = monthlyFromRA(projectedRa, payoutAge, plan);
      const requiredRa = raForMonthly(target, payoutAge, plan);
      let engineMonthly: number | null = null;
      try {
        const r = await simulateWhatIf(id, {
          end_age: 91, retirement_sum_target: "ERS", payout_age: payoutAge,
          cpf_life_plan: plan, persist: false,
        });
        const cl = r.result.cpf_life as { monthly_payout?: number };
        engineMonthly = typeof cl?.monthly_payout === "number" ? cl.monthly_payout : null;
      } catch { /* cross-check is best-effort */ }
      setResult({ requiredRa, projectedRa, monthlyProj, target, payoutAge, engineMonthly });
    } finally {
      setLoading(false);
    }
  }

  const reachable = result && result.monthlyProj >= result.target;
  const beyondCpf = result && result.target > 12000;

  return (
    <section className={`${cardClass} mb-4`} aria-label="Retirement income planner">
      <h2 className="text-base font-semibold">Retirement income planner</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Set a monthly CPF LIFE income target ($7k–$20k) and see the RA you&apos;d need vs what the
        ERS path projects.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ip-target" className="mb-1 block text-xs font-medium">Target monthly payout (S$)</label>
          <input id="ip-target" type="number" min={0} step={500} value={target}
            onChange={(e) => setTarget(Math.max(0, Number(e.target.value)))} className={inputClass}
            aria-label="Target monthly payout" />
        </div>
        <div>
          <label htmlFor="ip-age" className="mb-1 block text-xs font-medium">Payout starts at age</label>
          <input id="ip-age" type="number" min={65} max={70} step={1} value={payoutAge}
            onChange={(e) => setPayoutAge(Math.max(65, Math.min(70, Number(e.target.value))))}
            className={inputClass} aria-label="Payout age" />
        </div>
        <div>
          <label htmlFor="ip-plan" className="mb-1 block text-xs font-medium">CPF LIFE plan</label>
          <select id="ip-plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)}
            className={inputClass} aria-label="CPF LIFE plan">
            <option value="Standard">Standard (level)</option>
            <option value="Escalating">Escalating (+2%/yr)</option>
          </select>
        </div>
        <div>
          <label htmlFor="ip-hit" className="mb-1 block text-xs font-medium">Reach ERS by age</label>
          <input id="ip-hit" type="number" min={currentAge} max={55} step={1} value={hitErsAge}
            onChange={(e) => setHitErsAge(Math.max(currentAge, Math.min(55, Number(e.target.value))))}
            className={inputClass} aria-label="Age RA reaches ERS" />
        </div>
      </div>

      <button onClick={compute} disabled={loading} className={`${btnClass} mt-4`}>
        {loading ? "Computing…" : "Compute"}
      </button>

      {result && (
        <div role="status" aria-live="polite" className="mt-4 space-y-3">
          <div className="grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--color-muted)]">RA needed at payout</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(result.requiredRa)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Projected RA (ERS path)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(result.projectedRa)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Projected monthly payout</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(result.monthlyProj)}
              </p>
              {result.engineMonthly !== null && (
                <p className="text-xs text-[var(--color-muted)]">engine check: {sgd(result.engineMonthly)}</p>
              )}
            </div>
          </div>
          <p className={`rounded-xl px-4 py-3 text-sm ${reachable ? "bg-[var(--color-primary)]/10" : "bg-[var(--color-surface-raised)]"}`}>
            {reachable
              ? `✓ The ERS path projects ${sgd(result.monthlyProj)}/mth — at or above your ${sgd(result.target)} target.`
              : beyondCpf
              ? `A ${sgd(result.target)}/mth income needs ${sgd(result.requiredRa)} in the RA — beyond what the ERS cap + CPF interest can reach. Close the gap by investing outside CPF.`
              : `The ERS path projects ${sgd(result.monthlyProj)}/mth, short of ${sgd(result.target)}. Reach ERS earlier, defer to 70, or top up beyond CPF.`}
          </p>
        </div>
      )}
    </section>
  );
}

// ── 3. Transfer from OA to SA/MA ────────────────────────────────────────────────
function TransferCard({ member, frs, bhs }: { member: Member; frs: number; bhs: number }) {
  const oa = member.balances.OA;
  const sa = member.balances.SA;
  const ma = member.balances.MA;
  const [toSa, setToSa] = useState(0);
  const [toMa, setToMa] = useState(0);

  const remainingOa = oa - toSa - toMa;
  const estSa = sa + toSa;
  const estMa = ma + toMa;
  const benefit = (toSa + toMa) * (RA_RATE - OA_RATE);

  const warnings: string[] = [];
  if (toSa + toMa > oa) warnings.push("Total transfer exceeds your current OA.");
  if (frs > 0 && estSa > frs) warnings.push(`SA would exceed the FRS (${sgd(frs)}) — OA→SA transfers are capped at the FRS.`);
  if (bhs > 0 && estMa > bhs) warnings.push(`MA would exceed the BHS (${sgd(bhs)}).`);

  const rows = [
    { acc: "OA (2.5%)", current: oa, change: -(toSa + toMa), est: remainingOa },
    { acc: "SA (4%)", current: sa, change: toSa, est: estSa },
    { acc: "MA (4%)", current: ma, change: toMa, est: estMa },
  ];

  return (
    <section className={`${cardClass} mb-4`} aria-label="Transfer from OA to SA or MA">
      <h2 className="text-base font-semibold">Transfer from OA to SA / MA</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Move OA (2.5%) into SA or MA (4%) to earn 1.5%/yr more. See the resulting balances.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tr-sa" className="mb-1 block text-xs font-medium">Transfer OA → SA (S$)</label>
          <input id="tr-sa" type="number" min={0} step={1000} value={toSa}
            onChange={(e) => setToSa(Math.max(0, Number(e.target.value)))} className={inputClass}
            aria-label="Amount to transfer from OA to SA" />
        </div>
        <div>
          <label htmlFor="tr-ma" className="mb-1 block text-xs font-medium">Transfer OA → MA (S$)</label>
          <input id="tr-ma" type="number" min={0} step={1000} value={toMa}
            onChange={(e) => setToMa(Math.max(0, Number(e.target.value)))} className={inputClass}
            aria-label="Amount to transfer from OA to MA" />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="pb-2 font-medium">Account</th>
              <th className="pb-2 text-right font-medium">Current</th>
              <th className="pb-2 text-right font-medium">Transfer</th>
              <th className="pb-2 text-right font-medium">Estimated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.acc} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 font-medium">{r.acc}</td>
                <td className="py-2 text-right tabular-nums">{sgd(r.current)}</td>
                <td className={`py-2 text-right tabular-nums ${r.change > 0 ? "text-[var(--color-primary)]" : r.change < 0 ? "text-[var(--color-muted)]" : ""}`}>
                  {r.change === 0 ? "—" : `${r.change > 0 ? "+" : ""}${sgd(r.change)}`}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{sgd(r.est)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm">
        <span className="text-[var(--color-muted)]">Remaining OA: </span>
        <span className="font-semibold tabular-nums">{sgd(remainingOa)}</span>
        <span className="text-[var(--color-muted)]"> · Extra interest gained: </span>
        <span className="font-semibold tabular-nums text-[var(--color-primary)]">{sgd(benefit)}/yr</span>
      </p>

      {warnings.length > 0 && (
        <div role="alert" className="mt-3 space-y-1">
          {warnings.map((w) => (
            <p key={w} className="text-sm text-[var(--color-error)]">⚠ {w}</p>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        OA→SA transfers are irreversible and capped at the FRS. A direct OA→MA transfer isn&apos;t a
        standard CPF action (MA is usually topped up with cash) — shown here for modelling.
      </p>
    </section>
  );
}

// ── 4. CPFIS-OA Investment ──────────────────────────────────────────────────────
function CpfisCard({ member }: { member: Member }) {
  const oa = member.balances.OA;
  const sa = member.balances.SA;
  const investible = Math.max(oa - 20000, 0);
  const maxStock = investible * 0.35;
  const maxGold = investible * 0.1;
  const saOk = sa >= 40000;

  const [invested, setInvested] = useState(Math.round(Math.min(maxStock, investible)));
  const [ret, setRet] = useState(6);
  const [result, setResult] = useState<
    { invested: number; ret: number; rows: { yr: number; investedVal: number; floor: number; total: number }[] } | null
  >(null);

  function compute() {
    const r = ret / 100;
    const floorBase = oa - invested; // kept $20k + uninvested OA, all at 2.5%
    const rows = [5, 10, 15, 20, 25, 30].map((yr) => {
      const investedVal = invested * (1 + r) ** yr;
      const floor = floorBase * (1 + OA_RATE) ** yr;
      return { yr, investedVal: Math.round(investedVal), floor: Math.round(floor), total: Math.round(investedVal + floor) };
    });
    setResult({ invested, ret, rows });
  }

  const warnings: string[] = [];
  if (!saOk) warnings.push(`You need at least $40,000 in SA to invest OA under CPFIS (current SA ${sgd(sa)}).`);
  if (invested > investible) warnings.push(`You can only invest OA above $20,000 — max ${sgd(investible)}.`);
  if (invested > maxStock) warnings.push(`Stocks are capped at 35% of investible OA (${sgd(maxStock)}); gold at 10% (${sgd(maxGold)}).`);

  return (
    <section className={`${cardClass} mb-4`} aria-label="CPFIS OA investment">
      <h2 className="text-base font-semibold">CPFIS-OA Investment</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Invest OA above $20,000 (SA must be ≥ $40,000; MA can&apos;t be touched). Stocks capped at 35%,
        gold at 10% of investible OA.
      </p>

      <div className="mt-3 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-[var(--color-muted)]">Investible OA (above $20k)</p><p className="font-semibold tabular-nums">{sgd(investible)}</p></div>
        <div><p className="text-xs text-[var(--color-muted)]">Max stocks (35%)</p><p className="font-semibold tabular-nums">{sgd(maxStock)}</p></div>
        <div><p className="text-xs text-[var(--color-muted)]">Max gold (10%)</p><p className="font-semibold tabular-nums">{sgd(maxGold)}</p></div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cp-amt" className="mb-1 block text-xs font-medium">Amount invested from OA (S$)</label>
          <input id="cp-amt" type="number" min={0} step={1000} value={invested}
            onChange={(e) => setInvested(Math.max(0, Number(e.target.value)))} className={inputClass}
            aria-label="Amount invested from OA" />
        </div>
        <div>
          <label htmlFor="cp-ret" className="mb-1 block text-xs font-medium">Expected annual return (%/yr)</label>
          <input id="cp-ret" type="number" min={0} max={30} step={0.5} value={ret}
            onChange={(e) => setRet(Math.max(0, Math.min(30, Number(e.target.value))))} className={inputClass}
            aria-label="Expected annual return percent" />
        </div>
      </div>

      {warnings.length > 0 && (
        <div role="alert" className="mt-3 space-y-1">
          {warnings.map((w) => <p key={w} className="text-sm text-[var(--color-error)]">⚠ {w}</p>)}
        </div>
      )}

      <button onClick={compute} className={`${btnClass} mt-4`}>Compute</button>

      {result && (
        <div role="status" aria-live="polite" className="mt-4 space-y-4">
          <div className="grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3">
            <div><p className="text-xs text-[var(--color-muted)]">Current OA</p><p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(oa)}</p></div>
            <div><p className="text-xs text-[var(--color-muted)]">Invested OA amount</p><p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(result.invested)}</p></div>
            <div><p className="text-xs text-[var(--color-muted)]">@ {result.ret}%/yr</p><p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">{sgdCompact(result.rows[result.rows.length - 1].total)} in 30y</p></div>
          </div>

          <div role="img" aria-label="Expected OA value across years" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="yr" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickFormatter={(v) => `${v}y`} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={52} />
                <Tooltip formatter={(v, n) => [sgd(typeof v === "number" ? v : null), n === "investedVal" ? "Invested (growth)" : n === "floor" ? "Uninvested OA (2.5%)" : "Total OA"]} labelFormatter={(y) => `After ${y} years`} contentStyle={tooltipStyle} />
                <Legend formatter={(v) => (v === "investedVal" ? "Invested (growth)" : v === "floor" ? "Uninvested OA (2.5%)" : "Total OA")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="floor" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="investedVal" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        Returns are your assumption, not guaranteed — CPFIS investments can lose money, unlike the
        2.5% OA floor.
      </p>
    </section>
  );
}

// ── 5. What-if Scenario (CPF LIFE deferral 65→70) ───────────────────────────────
function WhatIfCard({
  ers, proj, yearForAge, memberRa, currentAge,
}: {
  ers: number; proj: (b: number, y: number) => number; yearForAge: (a: number) => number;
  memberRa: number; currentAge: number;
}) {
  // Base RA at 55: projected ERS, or the member's current RA if already past 55.
  const defaultRa55 = currentAge >= 55 ? Math.round(memberRa) : Math.round(proj(ers, yearForAge(55)));
  const [ra55, setRa55] = useState(defaultRa55);
  const [plan, setPlan] = useState<Plan>("Standard");

  const raAtAge = (age: number) => ra55 * (1 + RA_RATE) ** Math.max(age - 55, 0);

  const payoutRows = useMemo(() => {
    const base = monthlyFromRA(raAtAge(65), 65, plan);
    return [65, 66, 67, 68, 69, 70].map((age) => {
      const monthly = monthlyFromRA(raAtAge(age), age, plan);
      return { age, ra: Math.round(raAtAge(age)), monthly: Math.round(monthly), uplift: base > 0 ? (monthly / base - 1) * 100 : 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ra55, plan]);

  const raSeries = useMemo(
    () => Array.from({ length: 90 - 55 + 1 }, (_, i) => 55 + i).map((age) => ({ age, ra: Math.round(raAtAge(age)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ra55],
  );

  return (
    <section className={`${cardClass} mb-4`} aria-label="What-if scenario: CPF LIFE deferral">
      <h2 className="text-base font-semibold">What-if: delay your CPF LIFE payouts (65 → 70)</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Every year you defer past 65 raises your payout by ~7% — up to +35% at age 70 — permanently.
        The RA also keeps compounding at 4% while you wait.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="wi-ra" className="mb-1 block text-xs font-medium">RA at age 55 (S$)</label>
          <input id="wi-ra" type="number" min={0} step={10000} value={ra55}
            onChange={(e) => setRa55(Math.max(0, Number(e.target.value)))} className={inputClass}
            aria-label="RA balance at age 55" />
        </div>
        <div>
          <label htmlFor="wi-plan" className="mb-1 block text-xs font-medium">CPF LIFE plan</label>
          <select id="wi-plan" value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={inputClass} aria-label="CPF LIFE plan">
            <option value="Standard">Standard (level)</option>
            <option value="Escalating">Escalating (+2%/yr)</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="pb-2 font-medium">Start age</th>
              <th className="pb-2 text-right font-medium">RA at payout</th>
              <th className="pb-2 text-right font-medium">Monthly payout</th>
              <th className="pb-2 text-right font-medium">vs age 65</th>
            </tr>
          </thead>
          <tbody>
            {payoutRows.map((r) => (
              <tr key={r.age} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 font-medium">{r.age}</td>
                <td className="py-2 text-right tabular-nums">{sgd(r.ra)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-[var(--color-primary)]">{sgd(r.monthly)}</td>
                <td className="py-2 text-right tabular-nums">{r.age === 65 ? "—" : `+${r.uplift.toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div role="img" aria-label="Total RA balance from age 55 to 90" className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={raSeries} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
            <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={52} />
            <Tooltip formatter={(v) => [sgd(typeof v === "number" ? v : null), "RA balance"]} labelFormatter={(a) => `Age ${a}`} contentStyle={tooltipStyle} />
            <Legend formatter={() => "RA balance (4% compounding)"} wrapperStyle={{ fontSize: "12px" }} />
            <ReferenceLine x={65} stroke="var(--chart-4)" strokeDasharray="4 2" label={{ value: "65", fontSize: 10, fill: "var(--color-muted)" }} />
            <ReferenceLine x={70} stroke="var(--chart-3)" strokeDasharray="4 2" label={{ value: "70", fontSize: 10, fill: "var(--color-muted)" }} />
            <Line isAnimationActive={false} type="monotone" dataKey="ra" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        RA shown growing at 4% to age 90. Once payouts begin, CPF LIFE annuitises the RA — the table
        gives the first-month payout for each start age.
      </p>
    </section>
  );
}
