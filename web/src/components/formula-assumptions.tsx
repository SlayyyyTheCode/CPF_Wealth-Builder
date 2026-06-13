"use client";
import type { Assumptions } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DeepKeys<T> = T extends object
  ? { [K in keyof T]: `${string & K}` | `${string & K}.${DeepKeys<T[K]>}` }[keyof T]
  : never;

function setNested<T extends object>(obj: T, path: string, value: number): T {
  const [head, ...rest] = path.split(".");
  if (rest.length === 0) {
    return { ...obj, [head]: value };
  }
  return {
    ...obj,
    [head]: setNested((obj as Record<string, object>)[head], rest.join("."), value),
  };
}

interface FieldDef {
  key: string;
  label: string;
  step: number;
  min?: number;
  max?: number;
}

function NumInput({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------

function FormulaCard({
  title,
  formula,
  children,
}: {
  title: string;
  formula: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="mb-4 rounded-xl bg-[var(--color-surface-raised)] px-4 py-3 text-xs leading-relaxed">
        {formula}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FormulaAssumptions({
  value,
  onChange,
}: {
  value: Assumptions;
  onChange: (a: Assumptions) => void;
}) {
  function patch(path: string, v: number) {
    onChange(setNested(value, path, v) as Assumptions);
  }

  return (
    <div className="space-y-4">
      {/* ── Readiness ─────────────────────────────────────────── */}
      <FormulaCard
        title="Readiness score"
        formula={
          <>
            <code className="block font-mono text-[var(--color-primary)]">
              score = round(100 × (w_sum × min(RA@55 / FRS, 1) + w_ma × min(MA@55 / BHS, 1)))
            </code>
            <p className="mt-2 text-[var(--color-muted)]">
              Bands:{" "}
              <code className="font-mono">on_track</code> if score ≥ on_track;{" "}
              <code className="font-mono">below_frs_pace</code> if score ≥ below_frs_pace;
              else <code className="font-mono">below_brs</code>.
            </p>
          </>
        }
      >
        <NumInput
          label="w_sum — RA weight"
          value={value.readiness.w_sum}
          step={0.01}
          min={0}
          max={1}
          onChange={(v) => patch("readiness.w_sum", v)}
        />
        <NumInput
          label="w_ma — MA weight"
          value={value.readiness.w_ma}
          step={0.01}
          min={0}
          max={1}
          onChange={(v) => patch("readiness.w_ma", v)}
        />
        <NumInput
          label="on_track threshold (score)"
          value={value.readiness.on_track}
          step={1}
          min={0}
          max={100}
          onChange={(v) => patch("readiness.on_track", v)}
        />
        <NumInput
          label="below_frs_pace threshold (score)"
          value={value.readiness.below_frs_pace}
          step={1}
          min={0}
          max={100}
          onChange={(v) => patch("readiness.below_frs_pace", v)}
        />
      </FormulaCard>

      {/* ── Growth projection ──────────────────────────────────── */}
      <FormulaCard
        title="Growth projection"
        formula={
          <>
            <code className="block font-mono text-[var(--color-primary)]">
              FRS/BRS/ERS(year) = base × (1 + sum_rate)^(year − base_year)
            </code>
            <code className="mt-1 block font-mono text-[var(--color-primary)]">
              BHS(year) = base × (1 + bhs_rate)^(year − base_year)
            </code>
          </>
        }
      >
        <NumInput
          label="sum_rate — FRS/BRS/ERS annual growth"
          value={value.growth.sum_rate}
          step={0.001}
          min={0}
          onChange={(v) => patch("growth.sum_rate", v)}
        />
        <NumInput
          label="bhs_rate — BHS annual growth"
          value={value.growth.bhs_rate}
          step={0.001}
          min={0}
          onChange={(v) => patch("growth.bhs_rate", v)}
        />
      </FormulaCard>

      {/* ── CPF LIFE ───────────────────────────────────────────── */}
      <FormulaCard
        title="CPF LIFE"
        formula={
          <>
            <code className="block font-mono text-[var(--color-primary)]">
              monthly ≈ annuity(RA earning ra_rate, to age longevity_age)
            </code>
            <code className="mt-1 block font-mono text-[var(--color-primary)]">
              Escalating plan: payout grows +escalating_rate / yr
            </code>
            <code className="mt-1 block font-mono text-[var(--color-primary)]">
              Basic plan: payout declines −basic_decline / yr
            </code>
            <code className="mt-1 block font-mono text-[var(--color-primary)]">
              deferral bonus = min(deferral_per_year × (payout_age − 65), deferral_cap)
            </code>
          </>
        }
      >
        <NumInput
          label="longevity_age — pool life expectancy"
          value={value.cpf_life.longevity_age}
          step={1}
          min={70}
          max={120}
          onChange={(v) => patch("cpf_life.longevity_age", v)}
        />
        <NumInput
          label="ra_rate — RA interest rate"
          value={value.cpf_life.ra_rate}
          step={0.001}
          min={0}
          onChange={(v) => patch("cpf_life.ra_rate", v)}
        />
        <NumInput
          label="escalating_rate — annual payout growth"
          value={value.cpf_life.escalating_rate}
          step={0.001}
          min={0}
          onChange={(v) => patch("cpf_life.escalating_rate", v)}
        />
        <NumInput
          label="basic_decline — annual payout decline"
          value={value.cpf_life.basic_decline}
          step={0.001}
          min={0}
          onChange={(v) => patch("cpf_life.basic_decline", v)}
        />
        <NumInput
          label="deferral_per_year — bonus per deferred year"
          value={value.cpf_life.deferral_per_year}
          step={0.01}
          min={0}
          onChange={(v) => patch("cpf_life.deferral_per_year", v)}
        />
        <NumInput
          label="deferral_cap — max deferral bonus"
          value={value.cpf_life.deferral_cap}
          step={0.01}
          min={0}
          max={1}
          onChange={(v) => patch("cpf_life.deferral_cap", v)}
        />
      </FormulaCard>
    </div>
  );
}
