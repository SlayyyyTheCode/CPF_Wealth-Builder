"use client";
import { useState } from "react";
import { taxEstimate, taxReliefCalc } from "@/lib/api";
import { sgd } from "@/lib/format";
import type { TaxEstimate, TaxRelief } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Shared input style                                                   */
/* ------------------------------------------------------------------ */
const inputCls =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

const btnCls =
  "rounded-full bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 active:scale-95 transition-all";

const cardCls =
  "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] flex flex-col gap-3";

/* ------------------------------------------------------------------ */
/* Singapore resident income-tax brackets (YA 2024 onwards).            */
/* Each entry: lower bound, cumulative tax at that bound, marginal rate */
/* on income above it. Mirrors the official "Gross Tax Payable" table.  */
/* ------------------------------------------------------------------ */
const TAX_BRACKETS = [
  { lower: 0, cum: 0, rate: 0 },
  { lower: 20000, cum: 0, rate: 0.02 },
  { lower: 30000, cum: 200, rate: 0.035 },
  { lower: 40000, cum: 550, rate: 0.07 },
  { lower: 80000, cum: 3350, rate: 0.115 },
  { lower: 120000, cum: 7950, rate: 0.15 },
  { lower: 160000, cum: 13950, rate: 0.18 },
  { lower: 200000, cum: 21150, rate: 0.19 },
  { lower: 240000, cum: 28750, rate: 0.195 },
  { lower: 280000, cum: 36550, rate: 0.2 },
  { lower: 320000, cum: 44550, rate: 0.22 },
  { lower: 500000, cum: 84150, rate: 0.23 },
  { lower: 1000000, cum: 199150, rate: 0.24 },
];

function computeIncomeTax(income: number): { tax: number; marginal: number } {
  if (income <= 0) return { tax: 0, marginal: 0 };
  let b = TAX_BRACKETS[0];
  for (const br of TAX_BRACKETS) if (income > br.lower) b = br;
  return { tax: b.cum + (income - b.lower) * b.rate, marginal: b.rate };
}

/* ------------------------------------------------------------------ */
/* Card 1 — SRS                                                         */
/* ------------------------------------------------------------------ */
function SrsCard({ income }: { income: number }) {
  const [amount, setAmount] = useState(15300);
  const [result, setResult] = useState<TaxEstimate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function estimate() {
    setErr(null);
    setLoading(true);
    try {
      const r = await taxEstimate(income, amount);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cardCls}>
      <div>
        <h3 className="font-semibold">Top up your SRS account</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Contribute to Supplementary Retirement Scheme. Cap S$15,300/yr
          (citizen/PR). Dollar-for-dollar tax deduction.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="srs-amount" className="text-xs font-medium">
          SRS amount (max S$15,300)
        </label>
        <input
          id="srs-amount"
          type="number"
          min={0}
          max={15300}
          value={amount}
          onChange={(e) => setAmount(Math.min(15300, Number(e.target.value)))}
          className={inputCls}
          aria-label="SRS top-up amount"
        />
        <button onClick={estimate} disabled={loading} className={btnCls}>
          {loading ? "Estimating…" : "Estimate"}
        </button>
      </div>
      {result && (
        <p role="status" className="text-sm font-medium text-[var(--color-primary)]">
          Est. tax saved: {sgd(result.estimated_tax_saved)}{" "}
          <span className="text-xs text-[var(--color-muted)] font-normal">
            (marginal rate {(result.marginal_rate * 100).toFixed(1)}%)
          </span>
        </p>
      )}
      {err && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {err}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2 — CPF RSTU                                                    */
/* ------------------------------------------------------------------ */
function CpfTopupCard({ income }: { income: number }) {
  const [amount, setAmount] = useState(8000);
  const [result, setResult] = useState<TaxRelief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function estimate() {
    setErr(null);
    setLoading(true);
    try {
      const r = await taxReliefCalc({ income, rstu_self: amount });
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cardCls}>
      <div>
        <h3 className="font-semibold">Top up your CPF account</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Cash top-up to SA/RA (RSTU). Cap S$8,000 self. Tax relief on the
          top-up.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="cpf-topup" className="text-xs font-medium">
          CPF top-up amount
        </label>
        <input
          id="cpf-topup"
          type="number"
          min={0}
          max={8000}
          value={amount}
          onChange={(e) => setAmount(Math.min(8000, Number(e.target.value)))}
          className={inputCls}
          aria-label="CPF RSTU top-up amount"
        />
        <button onClick={estimate} disabled={loading} className={btnCls}>
          {loading ? "Estimating…" : "Estimate"}
        </button>
      </div>
      {result && (
        <div role="status" className="space-y-0.5">
          <p className="text-sm font-medium text-[var(--color-primary)]">
            Est. tax saved: {sgd(result.estimated_tax_saved)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Relief earned: {sgd(result.relief_earned)} · Remaining cap:{" "}
            {sgd(result.remaining_cap)}
          </p>
        </div>
      )}
      {err && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {err}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards 3–5 — amount-driven tax-saving calculators                     */
/* deduction = amount * multiplier (e.g. charity IPC = 2.5x).           */
/* deductible=false → no income-tax relief (voluntary housing refund).  */
/* ------------------------------------------------------------------ */
function AmountTaxCard({
  title,
  description,
  inputLabel,
  defaultAmount,
  multiplier,
  income,
  deductible = true,
  note,
}: {
  title: string;
  description: string;
  inputLabel: string;
  defaultAmount: number;
  multiplier: number;
  income: number;
  deductible?: boolean;
  note?: string;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [result, setResult] = useState<TaxEstimate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const uid = title.replace(/\s+/g, "-").toLowerCase();

  async function estimate() {
    setErr(null);
    setLoading(true);
    try {
      const r = await taxEstimate(income, amount * multiplier);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cardCls}>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={uid} className="text-xs font-medium">
          {inputLabel}
        </label>
        <input
          id={uid}
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          className={inputCls}
          aria-label={inputLabel}
        />
        {deductible ? (
          <button onClick={estimate} disabled={loading} className={btnCls}>
            {loading ? "Estimating…" : "Estimate"}
          </button>
        ) : null}
      </div>
      {deductible && result && (
        <div role="status" className="space-y-0.5">
          <p className="text-sm font-medium text-[var(--color-primary)]">
            Est. tax saved: {sgd(result.estimated_tax_saved)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Deduction applied: {sgd(amount * multiplier)}
            {multiplier !== 1 ? ` (${multiplier}× amount)` : ""} · marginal rate{" "}
            {(result.marginal_rate * 100).toFixed(1)}%
          </p>
        </div>
      )}
      {!deductible && (
        <p role="status" className="text-sm font-medium text-[var(--color-primary)]">
          Est. income tax saved: {sgd(0)}
        </p>
      )}
      {note && (
        <p className="text-xs text-[var(--color-muted)]">{note}</p>
      )}
      {err && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {err}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export                                                           */
/* ------------------------------------------------------------------ */
export function TaxMethods() {
  const [income, setIncome] = useState(100000);
  const { tax, marginal } = computeIncomeTax(income);
  const effectiveRate = income > 0 ? (tax / income) * 100 : 0;

  return (
    <section aria-label="5 ways to reduce tax">
      <h2 className="mb-1 text-base font-semibold">5 ways to reduce tax</h2>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Enter your annual assessable income to get personalised estimates for the
        interactive options below.
      </p>

      {/* Shared income input + live income-tax payable */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <label htmlFor="tax-income" className="mb-1 block text-xs font-medium">
            Annual assessable income (S$)
          </label>
          <input
            id="tax-income"
            type="number"
            min={0}
            value={income}
            onChange={(e) => setIncome(Math.max(0, Number(e.target.value)))}
            className={inputCls}
            aria-label="Annual assessable income"
          />
        </div>
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3"
        >
          <p className="text-xs font-medium text-[var(--color-muted)]">
            Income tax payable
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--color-primary)]">
            {sgd(tax)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Effective {effectiveRate.toFixed(2)}% · marginal {(marginal * 100).toFixed(1)}% · resident rates (YA 2024+)
          </p>
        </div>
      </div>

      {/* 5-card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SrsCard income={income} />
        <CpfTopupCard income={income} />
        <AmountTaxCard
          income={income}
          title="Donate to charities"
          description="Donations to approved IPCs get a 250% tax deduction."
          inputLabel="Donation amount (S$)"
          defaultAmount={1000}
          multiplier={2.5}
        />
        <AmountTaxCard
          income={income}
          title="Take care of your ageing parents"
          description="Parent Relief: up to S$9,000 per parent (S$14,000 if living with you); higher for Handicapped Parent Relief. Conditions apply."
          inputLabel="Parent relief claimed (S$)"
          defaultAmount={9000}
          multiplier={1}
        />
        <AmountTaxCard
          income={income}
          title="Voluntary housing refund"
          description="Refund CPF used for housing (principal + accrued interest) back to your OA."
          inputLabel="Refund amount (S$)"
          defaultAmount={20000}
          multiplier={1}
          deductible={false}
          note="A voluntary housing refund is not income-tax deductible, so it saves no income tax. It restores your CPF savings and the accrued interest, boosting your retirement nest egg."
        />
      </div>
    </section>
  );
}
