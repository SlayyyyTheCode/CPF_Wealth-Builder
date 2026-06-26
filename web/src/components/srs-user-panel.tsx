"use client";
import { useMemo, useState } from "react";
import { sgd } from "@/lib/format";

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const labelCls = "mb-1 block text-xs font-medium";
const cardCls =
  "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] flex flex-col gap-4";

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

export function SrsUserPanel({ currentAge }: { currentAge: number | null }) {
  const [withdrawalAge, setWithdrawalAge] = useState(63);
  const [initialAmount, setInitialAmount] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [freq, setFreq] = useState<Freq>("yearly");
  const [srsInterest, setSrsInterest] = useState(0.05);
  const [altName, setAltName] = useState("Alternative investment");
  const [altInterest, setAltInterest] = useState(4);

  const proj = useMemo(() => {
    const age = currentAge ?? 0;
    const years = Math.max(withdrawalAge - age, 0);
    const annualContribution = freq === "monthly" ? contribution * 12 : contribution;
    const totalContributed = initialAmount + annualContribution * years;
    const srsBalance = futureValue(initialAmount, annualContribution, srsInterest, years);
    const altBalance = futureValue(initialAmount, annualContribution, altInterest, years);
    return {
      years,
      totalContributed,
      srsBalance,
      altBalance,
      delta: altBalance - srsBalance,
    };
  }, [currentAge, withdrawalAge, initialAmount, contribution, freq, srsInterest, altInterest]);

  return (
    <div className={cardCls}>
      <div>
        <h3 className="font-semibold">User</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Project your SRS balance at withdrawal age. Uninvested SRS cash earns
          ~0.05%; investing it can grow the pot materially. Compare both.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="wd-age" className={labelCls}>Withdrawal age</label>
          <input id="wd-age" type="number" min={0} max={120} value={withdrawalAge}
            onChange={(e) => setWithdrawalAge(Math.max(0, Number(e.target.value)))}
            className={inputCls} aria-label="Withdrawal age" />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {currentAge !== null
              ? `Current age ${currentAge} · ${proj.years} years to grow`
              : "Current age unknown"}
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
