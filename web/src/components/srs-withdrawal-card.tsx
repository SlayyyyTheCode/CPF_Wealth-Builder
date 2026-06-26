"use client";
import { useState } from "react";
import { sgd } from "@/lib/format";
import { incomeTax } from "@/lib/sg-tax";
import type { SrsWithdrawal, SrsWithdrawalLeg } from "@/lib/types";

// At/after the statutory retirement age, only 50% of each SRS withdrawal is
// chargeable to income tax (the spread concession). A premature withdrawal is
// 100% taxable plus a 5% penalty.
const TAXABLE_FRACTION = 0.5;
const PREMATURE_PENALTY = 0.05;
const SPREAD_YEARS = 10;
const ZERO_TAX_BAND = 20000; // first $20k of chargeable income is taxed at 0%

interface ScheduleRow {
  year: number;
  withdraw: number;
  tax: number;
  remainingAfter: number;   // SRS left to withdraw after this year's draw
  cumulativeTax: number;    // accumulated tax through this year
}

interface Optimal {
  totalSum: number;          // the chosen pot to draw down over 10 years
  evenDraw: number;          // equal yearly withdrawal (sum/10)
  taxFreePerYear: number;    // max draw/yr that stays untaxed, after income & reliefs
  taxFreeCapacity: number;   // tax-free draw over the full 10-year window
  totalTax: number;          // accumulated tax across the 10 years (minimum possible)
  fullyTaxFree: boolean;
  overTaxFree: number;       // sum above the 10-year tax-free ceiling (taxed)
  schedule: ScheduleRow[];   // year-by-year breakdown
}

/** Lowest-tax 10-year drawdown of `sum`. Income tax is convex (IRAS resident
 *  brackets), so equal yearly draws are provably the minimum-tax schedule for a
 *  fixed sum over fixed years. Only 50% of a draw is taxable at withdrawal age;
 *  reliefs and other income shift the chargeable income, so the tax-free draw/yr
 *  = (20k - (other income - reliefs)) / 0.5. */
function computeOptimal(sum: number, income: number, reliefs: number): Optimal {
  const evenDraw = sum / SPREAD_YEARS;
  const adj = income - reliefs;                       // adjusted other chargeable income
  // only TAXABLE_FRACTION of a draw counts, so the tax-free draw is grossed up
  const taxFreePerYear = Math.max(0, ZERO_TAX_BAND - adj) / TAXABLE_FRACTION;
  const baseTax = incomeTax(adj);                     // incomeTax floors at 0 for adj<=0
  const yearTax = Math.max(0, incomeTax(adj + evenDraw * TAXABLE_FRACTION) - baseTax);
  const taxFreeCapacity = taxFreePerYear * SPREAD_YEARS;

  const schedule: ScheduleRow[] = Array.from({ length: SPREAD_YEARS }, (_, i) => {
    const year = i + 1;
    return {
      year,
      withdraw: evenDraw,
      tax: yearTax,
      remainingAfter: Math.max(0, sum - evenDraw * year),
      cumulativeTax: yearTax * year,
    };
  });

  return {
    totalSum: sum,
    evenDraw,
    taxFreePerYear,
    taxFreeCapacity,
    totalTax: yearTax * SPREAD_YEARS,
    fullyTaxFree: sum <= taxFreeCapacity + 0.01,
    overTaxFree: Math.max(0, sum - taxFreeCapacity),
    schedule,
  };
}

/** Client-side SRS withdrawal cost. A spread (at-retirement) draw is 50%
 *  taxable each year; a premature draw is 100% taxable + a 5% penalty. */
function computeWithdrawal(balance: number, income: number, reliefs: number): SrsWithdrawal {
  const adj = income - reliefs;
  const baseTax = incomeTax(adj);

  const spreadDraw = balance / SPREAD_YEARS;
  const spreadTaxable = spreadDraw * TAXABLE_FRACTION;
  const spreadYearTax = Math.max(0, incomeTax(adj + spreadTaxable) - baseTax);
  const spreadTotal = spreadYearTax * SPREAD_YEARS;

  const premTax = Math.max(0, incomeTax(adj + balance) - baseTax);
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

export function SrsWithdrawalCard({ suggestedBalance, suggestedAltBalance }: { suggestedBalance?: number; suggestedAltBalance?: number } = {}) {
  const [balance, setBalance] = useState(suggestedBalance && suggestedBalance > 0 ? Math.round(suggestedBalance) : 0);
  const [reliefs, setReliefs] = useState(0);
  const [altBalance, setAltBalance] = useState(suggestedAltBalance && suggestedAltBalance > 0 ? Math.round(suggestedAltBalance) : 0);
  const [source, setSource] = useState<"srs" | "alt">("srs");
  const [result, setResult] = useState<SrsWithdrawal | null>(null);
  const [optimal, setOptimal] = useState<Optimal | null>(null);

  const suggested = suggestedBalance && suggestedBalance > 0 ? Math.round(suggestedBalance) : null;
  const suggestedAlt = suggestedAltBalance && suggestedAltBalance > 0 ? Math.round(suggestedAltBalance) : null;

  const sumFor = (s: "srs" | "alt") => (s === "srs" ? balance : altBalance);

  function compute() {
    setResult(computeWithdrawal(balance, 0, reliefs));
    setOptimal(computeOptimal(sumFor(source), 0, reliefs));
  }

  function changeSource(s: "srs" | "alt") {
    setSource(s);
    if (optimal) setOptimal(computeOptimal(sumFor(s), 0, reliefs));
  }

  const spreadBest = result ? result.spread_10y.total_cost <= result.premature.total_cost : false;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">SRS Withdrawal — Spread vs Premature</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          At withdrawal age only 50% of each spread draw is taxable, kept in low
          brackets; a premature cash-out is 100% taxable as one lump plus a 5%
          penalty. Compare the lifetime cost.
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
          <label htmlFor="srs-alt-bal" className="mt-3 mb-1 block text-xs font-medium">
            Alternative Balance at Retirement (S$)
          </label>
          <input
            id="srs-alt-bal"
            type="number"
            min={0}
            value={altBalance}
            onChange={(e) => setAltBalance(Math.max(0, Number(e.target.value)))}
            className={inputCls}
            aria-label="Alternative balance at retirement"
          />
          {suggestedAlt !== null && suggestedAlt !== altBalance && (
            <button
              type="button"
              onClick={() => setAltBalance(suggestedAlt)}
              className="mt-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Use projected alternative ({sgd(suggestedAlt)})
            </button>
          )}
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            From the User panel&apos;s alternative-investment projection.
          </p>
        </div>
        <div>
          <label htmlFor="srs-reliefs" className="mb-1 block text-xs font-medium">
            Reliefs / deductions / year (S$)
          </label>
          <input
            id="srs-reliefs"
            type="number"
            min={0}
            value={reliefs}
            onChange={(e) => setReliefs(Math.max(0, Number(e.target.value)))}
            className={inputCls}
            aria-label="Annual tax reliefs and deductions"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Parent relief, CPF top-up, etc. Widens the tax-free withdrawal band.
          </p>
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

      {optimal && (
        <div className="rounded-xl border border-[var(--color-primary)] bg-[var(--color-surface-raised)] p-4">
          <h4 className="text-sm font-semibold">Tax Hack for 10 Years Withdrawal</h4>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Income tax is progressive, so equal yearly draws minimise total tax.
            Only 50% of each withdrawal is taxable at withdrawal age, and the first
            {" "}{sgd(ZERO_TAX_BAND)} of chargeable income each year is tax-free
            (IRAS resident rates).
          </p>

          {/* choose which pot to draw down */}
          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-[var(--color-muted)]">Total sum to withdraw</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${source === "srs" ? "border-[var(--color-primary)] bg-[var(--color-surface)]" : "border-[var(--color-border)]"}`}>
                <input type="radio" name="srs-sum-source" checked={source === "srs"} onChange={() => changeSource("srs")} />
                SRS balance ({sgd(balance)})
              </label>
              <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${source === "alt" ? "border-[var(--color-primary)] bg-[var(--color-surface)]" : "border-[var(--color-border)]"}`}>
                <input type="radio" name="srs-sum-source" checked={source === "alt"} onChange={() => changeSource("alt")} />
                Alternative balance ({sgd(altBalance)})
              </label>
            </div>
          </fieldset>

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between border-b border-[var(--color-border)] pb-1">
              <dt className="font-medium">Total sum ({source === "srs" ? "SRS" : "Alternative"})</dt>
              <dd className="tabular-nums font-bold text-[var(--color-primary)]">{sgd(optimal.totalSum)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Withdraw each year (×10)</dt>
              <dd className="tabular-nums font-semibold">{sgd(optimal.evenDraw)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Tax-free draw / year</dt>
              <dd className="tabular-nums">{sgd(optimal.taxFreePerYear)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Tax-free over 10 years</dt>
              <dd className="tabular-nums">{sgd(optimal.taxFreeCapacity)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--color-border)] pt-1 font-medium">
              <dt>Total tax (over 10 years)</dt>
              <dd className="tabular-nums text-[var(--color-primary)]">{sgd(optimal.totalTax)}</dd>
            </div>
          </dl>

          {/* minimize-tax callout */}
          <div className={`mt-3 rounded-lg p-3 text-sm ${optimal.fullyTaxFree ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-[var(--color-surface)]"}`}>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Minimize tax
            </h5>
            <p className="mt-1">
              Max tax-free withdrawal:{" "}
              <span className="font-semibold tabular-nums">{sgd(optimal.taxFreePerYear)}/year</span>{" "}
              (<span className="tabular-nums">{sgd(optimal.taxFreeCapacity)}</span> over 10 years).
            </p>
            {optimal.fullyTaxFree ? (
              <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-300">
                ✓ {sgd(optimal.totalSum)} fits inside the tax-free capacity — spread it
                evenly over 10 years and pay <span className="tabular-nums">{sgd(0)}</span> tax.
              </p>
            ) : (
              <p className="mt-1">
                {sgd(optimal.totalSum)} is{" "}
                <span className="font-medium text-[var(--color-error)]">{sgd(optimal.overTaxFree)}</span>{" "}
                above the tax-free ceiling, so the minimum possible tax is{" "}
                <span className="font-semibold tabular-nums text-[var(--color-primary)]">{sgd(optimal.totalTax)}</span>{" "}
                (even spread is provably optimal). To reach {sgd(0)} tax: lower other
                income, add reliefs, or keep the withdrawn sum at or below{" "}
                <span className="tabular-nums">{sgd(optimal.taxFreeCapacity)}</span>.
              </p>
            )}
          </div>

          {/* year-by-year breakdown */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Year-by-year SRS withdrawal, tax, remaining balance and cumulative tax</caption>
              <thead>
                <tr className="text-xs text-[var(--color-muted)]">
                  <th scope="col" className="py-1 text-left font-medium">Year</th>
                  <th scope="col" className="py-1 text-right font-medium">Withdraw</th>
                  <th scope="col" className="py-1 text-right font-medium">Tax</th>
                  <th scope="col" className="py-1 text-right font-medium">Left to withdraw</th>
                  <th scope="col" className="py-1 text-right font-medium">Cumulative tax</th>
                </tr>
              </thead>
              <tbody>
                {optimal.schedule.map((row) => (
                  <tr key={row.year} className="border-t border-[var(--color-border)]">
                    <td className="py-1">{row.year}</td>
                    <td className="py-1 text-right tabular-nums">{sgd(row.withdraw)}</td>
                    <td className="py-1 text-right tabular-nums">{sgd(row.tax)}</td>
                    <td className="py-1 text-right tabular-nums">{sgd(row.remainingAfter)}</td>
                    <td className="py-1 text-right tabular-nums">{sgd(row.cumulativeTax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-medium">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right tabular-nums">{sgd(optimal.evenDraw * SPREAD_YEARS)}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-primary)]">{sgd(optimal.totalTax)}</td>
                  <td className="py-1 text-right tabular-nums">{sgd(0)}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-primary)]">{sgd(optimal.totalTax)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Withdraw the same amount each year so the chargeable income stays in
              the lowest possible bracket. The balance falls to {sgd(0)} after year
              10; cumulative tax reaches {sgd(optimal.totalTax)}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
