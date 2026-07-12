"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { sgd } from "@/lib/format";
import type { Residency } from "@/lib/types";
import { ChartSkeleton } from "@/components/chart-skeleton";

// Defer recharts so the inputs/projection paint first (faster on mobile).
const SrsGrowthChart = dynamic(
  () => import("@/components/srs-growth-chart").then((m) => ({ default: m.SrsGrowthChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const labelCls = "mb-1 block text-xs font-medium";
const cardCls =
  "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] flex flex-col gap-4";

const SRS_CAP: Record<Residency, number> = { citizen: 15300, pr: 15300, foreigner: 35700 };

type Freq = "monthly" | "yearly";

/** Future value of a starting balance plus level annual contributions,
 *  compounded annually. Handles the zero-rate edge. */
function futureValue(initial: number, annualContribution: number, ratePct: number, years: number): number {
  const r = ratePct / 100;
  if (years <= 0) return initial;
  if (r === 0) return initial + annualContribution * years;
  const growth = Math.pow(1 + r, years);
  return initial * growth + annualContribution * ((growth - 1) / r);
}

export function SrsUserPanel({
  initialAge,
  residency,
  onProjectedBalance,
  onProjectedAltBalance,
}: {
  initialAge: number | null;
  residency: Residency;
  onProjectedBalance?: (n: number) => void;
  onProjectedAltBalance?: (n: number) => void;
}) {
  const [age, setAge] = useState(35);
  const [ageTouched, setAgeTouched] = useState(false);
  // Statutory retirement age, which is what SRS locks the penalty-free
  // withdrawal age to. Raised 63 -> 64 on 1 Jul 2026. An SRS account keeps the
  // age prevailing at its FIRST contribution for life, so accounts opened
  // before that date stay at 63 — hence this is a default, not a constant.
  const [withdrawalAge, setWithdrawalAge] = useState(64);
  const [initialAmount, setInitialAmount] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [freq, setFreq] = useState<Freq>("yearly");
  const [srsInterest, setSrsInterest] = useState(0.05);
  const [altName, setAltName] = useState("Alternative investment");
  const [altInterest, setAltInterest] = useState(4);

  const cap = SRS_CAP[residency];

  // Show the member's age until the user overrides it (no effect needed).
  const effectiveAge = ageTouched ? age : (initialAge ?? age);

  const proj = useMemo(() => {
    const years = Math.max(withdrawalAge - effectiveAge, 0);
    const annualContribution = freq === "monthly" ? contribution * 12 : contribution;
    const totalContributed = initialAmount + annualContribution * years;
    const srsBalance = futureValue(initialAmount, annualContribution, srsInterest, years);
    const altBalance = futureValue(initialAmount, annualContribution, altInterest, years);
    // per-year series for the growth chart (age on the x-axis)
    const series = Array.from({ length: years + 1 }, (_, i) => ({
      age: age + i,
      srs: Math.round(futureValue(initialAmount, annualContribution, srsInterest, i)),
      alt: Math.round(futureValue(initialAmount, annualContribution, altInterest, i)),
    }));
    return { years, annualContribution, totalContributed, srsBalance, altBalance, series, delta: altBalance - srsBalance };
  }, [effectiveAge, age, withdrawalAge, initialAmount, contribution, freq, srsInterest, altInterest]);

  // feed the projected balances up to the page (→ withdrawal card prefill)
  useEffect(() => {
    onProjectedBalance?.(proj.srsBalance);
  }, [proj.srsBalance, onProjectedBalance]);
  useEffect(() => {
    onProjectedAltBalance?.(proj.altBalance);
  }, [proj.altBalance, onProjectedAltBalance]);

  const overCap = proj.annualContribution > cap;

  // Annual contribution needed to reach $1M by withdrawal age, growing the pot
  // at the alternative-investment rate (SRS cash at 0.05% can't realistically
  // get there). null = no runway; 0 = the initial amount already gets there.
  const MILLION = 1_000_000;
  const reqAnnualToMillion = useMemo(() => {
    const n = proj.years;
    if (n <= 0) return null;
    const r = altInterest / 100;
    const grownInitial = initialAmount * Math.pow(1 + r, n);
    const remaining = MILLION - grownInitial;
    if (remaining <= 0) return 0;
    const annuityFactor = r > 0 ? (Math.pow(1 + r, n) - 1) / r : n;
    return remaining / annuityFactor;
  }, [proj.years, altInterest, initialAmount]);
  const reqPerPeriod = reqAnnualToMillion === null || reqAnnualToMillion === 0
    ? reqAnnualToMillion
    : freq === "monthly" ? reqAnnualToMillion / 12 : reqAnnualToMillion;

  return (
    <div className={cardCls}>
      <div>
        <h3 className="font-semibold">Customized Client SRS Portfolio</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Project your SRS balance at withdrawal age. Uninvested SRS cash earns
          ~0.05%; investing it can grow the pot materially. Compare both.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="cur-age" className={labelCls}>Current age</label>
          <input id="cur-age" type="number" min={0} max={120} value={effectiveAge}
            onChange={(e) => { setAgeTouched(true); setAge(Math.max(0, Number(e.target.value))); }}
            className={inputCls} aria-label="Current age" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {initialAge !== null && !ageTouched ? "From client profile — editable" : " "}
          </p>
        </div>

        <div>
          <label htmlFor="wd-age" className={labelCls}>Withdrawal age</label>
          <input id="wd-age" type="number" min={0} max={120} value={withdrawalAge}
            onChange={(e) => setWithdrawalAge(Math.max(0, Number(e.target.value)))}
            className={inputCls} aria-label="Withdrawal age" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {proj.years} years to grow · statutory retirement age is 64 from 1 Jul 2026
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            SRS locks this to the age in force at your <em>first</em> contribution — if you opened
            the account before 1 Jul 2026, set 63.
          </p>
        </div>

        <div>
          <label htmlFor="init-amt" className={labelCls}>Initial amount (S$)</label>
          <input id="init-amt" type="number" min={0} value={initialAmount}
            onChange={(e) => setInitialAmount(Math.max(0, Number(e.target.value)))}
            className={inputCls} aria-label="Initial SRS amount" />
        </div>

        <div>
          <label htmlFor="contrib" className={labelCls}>Contribution (S$)</label>
          <div className="flex gap-2">
            <input id="contrib" type="number" min={0} value={contribution}
              onChange={(e) => setContribution(Math.max(0, Number(e.target.value)))}
              className={inputCls} aria-label="Contribution amount" />
            <select value={freq} onChange={(e) => setFreq(e.target.value as Freq)}
              className={inputCls + " w-28"} aria-label="Contribution frequency">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {reqPerPeriod === null
              ? "Set a withdrawal age above current age to target $1M."
              : reqPerPeriod === 0
                ? "🎯 Initial amount alone reaches $1M by withdrawal age."
                : <>🎯 Contribute ~<span className="font-semibold">{sgd(reqPerPeriod)}/{freq === "monthly" ? "mo" : "yr"}</span> at {altInterest}% to hit $1M by age {withdrawalAge}{reqAnnualToMillion! > cap ? ` (above SRS cap ${sgd(cap)})` : ""}.</>}
          </p>
        </div>

        <div>
          <label htmlFor="srs-int" className={labelCls}>SRS interest (%)</label>
          <input id="srs-int" type="number" min={0} step={0.01} value={srsInterest}
            onChange={(e) => setSrsInterest(Math.max(0, Number(e.target.value)))}
            className={inputCls} aria-label="SRS default interest rate" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">Default SRS cash rate is 0.05%.</p>
        </div>

        <div>
          <label htmlFor="alt-name" className={labelCls}>Alternative investment</label>
          <input id="alt-name" type="text" value={altName}
            onChange={(e) => setAltName(e.target.value)}
            className={inputCls} aria-label="Alternative investment name" />
        </div>

        <div>
          <label htmlFor="alt-int" className={labelCls}>Alt. investment interest (%)</label>
          <input id="alt-int" type="number" min={0} step={0.1} value={altInterest}
            onChange={(e) => setAltInterest(Math.max(0, Number(e.target.value)))}
            className={inputCls} aria-label="Alternative investment interest rate" />
        </div>
      </div>

      {/* contribution cap awareness */}
      {overCap && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-[var(--color-error)] dark:bg-red-900/20">
          ⚠ Yearly contribution {sgd(proj.annualContribution)} exceeds the {residency === "foreigner" ? "foreigner" : "citizen/PR"} SRS cap of {sgd(cap)}. Contributions above the cap are not allowed and earn no tax relief.
        </p>
      )}

      {/* projection output */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] p-3">
          <h4 className="text-sm font-semibold">SRS cash ({srsInterest}%)</h4>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-primary)]">
            {sgd(proj.srsBalance)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">balance at age {withdrawalAge}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-surface-raised)] p-3">
          <h4 className="text-sm font-semibold">{altName || "Alternative"} ({altInterest}%)</h4>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-primary)]">
            {sgd(proj.altBalance)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">balance at age {withdrawalAge}</p>
        </div>
      </div>

      {/* growth chart */}
      {proj.series.length > 1 && (
        <SrsGrowthChart
          series={proj.series}
          srsInterest={srsInterest}
          altInterest={altInterest}
          altName={altName}
        />
      )}

      <div className="rounded-xl bg-[var(--color-surface-raised)] p-3 text-sm">
        <div className="flex justify-between py-0.5">
          <span className="text-[var(--color-muted)]">Total contributed</span>
          <span className="tabular-nums">{sgd(proj.totalContributed)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--color-border)] py-0.5 pt-1 font-medium">
          <span>Uplift from investing</span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
            +{sgd(proj.delta)}
          </span>
        </div>
      </div>
    </div>
  );
}
