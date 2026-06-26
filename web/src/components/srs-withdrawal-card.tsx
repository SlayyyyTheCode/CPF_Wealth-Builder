"use client";
import { useState } from "react";
import { sgd } from "@/lib/format";
import { incomeTax } from "@/lib/sg-tax";
import type { SrsWithdrawal, SrsWithdrawalLeg } from "@/lib/types";

// SRS policy constants (mirror SRS_2026): 50% of a spread draw is taxable,
// premature is 100% taxable + 5% penalty, spread runs over 10 years.
const TAXABLE_FRACTION = 0.5;
const PREMATURE_PENALTY = 0.05;
const SPREAD_YEARS = 10;

/** Client-side mirror of the backend SRS withdrawal engine. */
function computeWithdrawal(balance: number, income: number): SrsWithdrawal {
  const baseTax = incomeTax(income);

  const spreadDraw = balance / SPREAD_YEARS;
  const spreadTaxable = spreadDraw * TAXABLE_FRACTION;
  const spreadYearTax = incomeTax(income + spreadTaxable) - baseTax;
  const spreadTotal = spreadYearTax * SPREAD_YEARS;

  const premTax = incomeTax(income + balance) - baseTax;
  const premPenalty = balance * PREMATURE_PENALTY;
  const premTotal = premTax + premPenalty;

  const leg = (
    mode: string, years: number, draw: number, taxable: number,
    yearTax: number, lifetime: number, penalty: number,
  ): SrsWithdrawalLeg => ({
    mode,
    years: Array.from({ length: years }, (_, i) => ({
      year: i + 1, draw, taxable, tax: yearTax,
    })),
    lifetime_tax: lifetime,
    penalty,
    total_cost: lifetime + penalty,
    effective_rate: balance > 0 ? (lifetime + penalty) / balance : 0,
  });

  return {
    spread_10y: leg("spread_10y", SPREAD_YEARS, spreadDraw, spreadTaxable, spreadYearTax, spreadTotal, 0),
    premature: leg("premature", 1, balance, balance, premTax, premTax, premPenalty),
    premature_extra_cost: premTotal - spreadTotal,
  };
}

const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
const btnCls =
  "rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-95 transition-all";

function Leg({ title, leg, best }: { title: string; leg: SrsWithdrawalLeg; best: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        best
          ? "border-[var(--color-primary)] bg-[var(--color-surface-raised)]"
          : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        {best && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Lower cost
          </span>
        )}
      </div>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Lifetime tax</dt>
          <dd className="tabular-nums">{sgd(leg.lifetime_tax)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Penalty</dt>
          <dd className="tabular-nums">{sgd(leg.penalty)}</dd>
        </div>
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1 font-medium">
          <dt>Total cost</dt>
          <dd className="tabular-nums text-[var(--color-primary)]">{sgd(leg.total_cost)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-muted)]">Effective rate</dt>
          <dd className="tabular-nums">{(leg.effective_rate * 100).toFixed(2)}%</dd>
        </div>
      </dl>
    </div>
  );
}

export function SrsWithdrawalCard({ suggestedBalance }: { suggestedBalance?: number } = {}) {
  const [balance, setBalance] = useState(suggestedBalance && suggestedBalance > 0 ? Math.round(suggestedBalance) : 0);
  const [income, setIncome] = useState(0);
  const [result, setResult] = useState<SrsWithdrawal | null>(null);

  const suggested = suggestedBalance && suggestedBalance > 0 ? Math.round(suggestedBalance) : null;

  function compute() {
    setResult(computeWithdrawal(balance, income));
  }

  const spreadBest = result ? result.spread_10y.total_cost <= result.premature.total_cost : false;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">SRS withdrawal — spread vs premature</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Spreading over 10 years taxes only 50% of each draw; a premature cash-out
          is 100% taxable plus a 5% penalty. Compare the lifetime cost.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="srs-bal" className="mb-1 block text-xs font-medium">
            SRS balance at retirement (S$)
          </label>
          <input
            id="srs-bal"
            type="number"
            min={0}
            value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))}
            className={inputCls}
            aria-label="SRS balance at retirement"
          />
          {suggested !== null && suggested !== balance && (
            <button
              type="button"
              onClick={() => setBalance(suggested)}
              className="mt-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Use projected balance ({sgd(suggested)})
            </button>
          )}
        </div>
        <div>
          <label htmlFor="srs-other-inc" className="mb-1 block text-xs font-medium">
            Other income / withdrawal year (S$)
          </label>
          <input
            id="srs-other-inc"
            type="number"
            min={0}
            value={income}
            onChange={(e) => setIncome(Math.max(0, Number(e.target.value)))}
            className={inputCls}
            aria-label="Other chargeable income per withdrawal year"
          />
        </div>
      </div>
      <button onClick={compute} className={btnCls}>
        Compare
      </button>

      {result && (
        <div role="status" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Leg title="Spread over 10 years" leg={result.spread_10y} best={spreadBest} />
            <Leg title="Premature cash-out" leg={result.premature} best={!spreadBest} />
          </div>
          <p className="text-sm font-medium">
            Cashing out early costs{" "}
            <span className="text-[var(--color-error)]">
              {sgd(result.premature_extra_cost)}
            </span>{" "}
            more over the lifetime.
          </p>
        </div>
      )}
    </div>
  );
}
