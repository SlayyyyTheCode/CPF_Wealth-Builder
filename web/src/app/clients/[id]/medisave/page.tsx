"use client";
import { use, useEffect, useState } from "react";
import { simulate } from "@/lib/api";
import type { SimResult } from "@/lib/types";
import { MaBhsChart } from "@/components/ma-bhs-chart";
import { MedisaveAdequacy } from "@/components/medisave-adequacy";
import { YearScrubber } from "@/components/year-scrubber";
import { PageHeading, MedisaveIcon } from "@/components/icons";
import { sgd } from "@/lib/format";

export default function MedisavePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [res, setRes] = useState<SimResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Insurance drawdown calculator state
  const [maNow, setMaNow] = useState(0);          // current MA balance
  const [withdraw, setWithdraw] = useState(0);     // amount drawn now
  const [drawYears, setDrawYears] = useState(10);
  const [drawRate, setDrawRate] = useState(4);
  const [drawResult, setDrawResult] = useState<
    { after: number; projected: number; interest: number } | null
  >(null);

  // Scrubber state
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    let ok = true;
    simulate(Number(id), 91)
      .then((r) => {
        if (!ok) return;
        setRes(r.result);
        if (r.result.years.length > 0) {
          setAge(r.result.years[0].age);
          setMaNow(Math.round(r.result.years[0].closing.MA));
        }
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => {
      ok = false;
    };
  }, [id]);

  if (err)
    return (
      <p role="alert" className="text-[var(--color-error)]">
        Could not load: {err}
      </p>
    );

  if (!res || age === null)
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" />
        <div className="h-12 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
      </div>
    );

  const medisave = res.medisave;

  if (!medisave) {
    return (
      <>
        <PageHeading icon={<MedisaveIcon className="h-7 w-7" />} title="Medisave (MA)" />
        <p className="text-sm text-[var(--color-muted)]">
          No projection available — run a simulation with end_age ≥ 85 to see
          MediSave projections.
        </p>
      </>
    );
  }

  const years = res.years;
  const ages = years.map((y) => y.age);

  const yr = years.find((y) => y.age === age);
  const ms = medisave.series.find((s) => s.age === age);

  // KPI values for selected year
  const maBalance = yr?.closing.MA ?? 0;
  const bhsThisYear = ms?.bhs ?? 0;
  const neededToBhs = Math.max(bhsThisYear - maBalance, 0);
  const maInterest = yr?.interest_by_account?.MA ?? 0;

  // Overflow values for selected year
  const overflow = yr?.overflow_out;
  const maToSa = overflow?.ma_to_sa ?? 0;
  const maToOa = overflow?.ma_to_oa ?? 0;
  const maToRa = overflow?.ma_to_ra ?? 0;
  const totalOverflow = maToSa + maToOa + maToRa;
  const hasOverflow = totalOverflow > 0;

  // Insurance drawdown calculator — committed on "Calculate"
  function calcDrawdown() {
    const r = drawRate / 100;
    const after = Math.max(maNow - withdraw, 0);
    const projected = after * (1 + r) ** drawYears;
    setDrawResult({ after, projected, interest: projected - after });
  }

  // Premium table — sampled every 10 years
  const premiumRows = medisave.premiums.filter((p) => p.age % 10 === 0);

  const cardClass =
    "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";
  const labelClass =
    "text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]";
  const kpiClass = "mt-1 text-2xl font-bold tabular-nums";
  const inputClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm w-full";

  return (
    <>
      {/* 1. Heading */}
      <PageHeading
        icon={<MedisaveIcon className="h-7 w-7" />}
        title="Medisave (MA)"
        subtitle="MediSave balance vs BHS over time, overflow once BHS is hit, and an insurance-drawdown calculator."
      />

      {/* 2. Year scrubber */}
      <div className={`${cardClass} mb-4`}>
        <p className={`${labelClass} mb-3`}>Select year</p>
        <YearScrubber ages={ages} value={age} onChange={setAge} />
      </div>

      {/* 3. Per-year KPI row */}
      {yr && ms && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* MA balance */}
          <div className={cardClass}>
            <p className={labelClass}>MA balance</p>
            <p className={kpiClass}>{sgd(maBalance)}</p>
          </div>

          {/* BHS for the selected year */}
          <div className={cardClass}>
            <p className={labelClass}>BHS for Year {yr.year}</p>
            <p className={kpiClass}>{sgd(bhsThisYear)}</p>
          </div>

          {/* Needed to hit BHS */}
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit BHS</p>
            {neededToBhs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">
                BHS reached
              </p>
            ) : (
              <p className={kpiClass}>{sgd(neededToBhs)}</p>
            )}
          </div>

          {/* MA interest earned */}
          <div className={cardClass}>
            <p className={labelClass}>MA interest earned</p>
            <p className={kpiClass}>{sgd(maInterest)}</p>
          </div>
        </div>
      )}

      {/* 4. MA overflow card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>MA overflow (age {age})</h3>
        {hasOverflow ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">→ SA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToSa)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">→ OA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToOa)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">→ RA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToRa)}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              <p className="text-sm">
                <span className="text-[var(--color-muted)]">Total out of MA: </span>
                <span className="font-semibold tabular-nums">{sgd(totalOverflow)}</span>
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            No overflow this year — MA has not yet exceeded the Basic Healthcare Sum.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Once MA exceeds the Basic Healthcare Sum, contributions overflow to SA/RA (before 55) or OA.
        </p>
      </div>

      {/* 5. MA vs BHS chart */}
      <div className="mb-4">
        <MaBhsChart series={medisave.series} />
      </div>

      {/* 6. Adequacy */}
      <div className="mb-4">
        <MedisaveAdequacy medisave={medisave} />
      </div>

      {/* 7. Insurance drawdown calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4 flex items-center gap-2`}>
          <MedisaveIcon className="h-5 w-5" />
          MediSave insurance drawdown
        </h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="ma-now" className="mb-1 block text-sm text-[var(--color-muted)]">
              Current MA balance (S$)
            </label>
            <input
              id="ma-now"
              type="number"
              min={0}
              step={100}
              value={maNow}
              onChange={(e) => setMaNow(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Current MediSave balance"
            />
          </div>
          <div>
            <label htmlFor="ma-withdraw" className="mb-1 block text-sm text-[var(--color-muted)]">
              Withdraw from MA now (S$)
            </label>
            <input
              id="ma-withdraw"
              type="number"
              min={0}
              step={100}
              value={withdraw}
              onChange={(e) => setWithdraw(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Amount withdrawn from MediSave now"
            />
          </div>
          <div>
            <label htmlFor="draw-years" className="mb-1 block text-sm text-[var(--color-muted)]">
              Years
            </label>
            <input
              id="draw-years"
              type="number"
              min={1}
              max={50}
              step={1}
              value={drawYears}
              onChange={(e) => setDrawYears(Math.max(1, Math.min(50, Number(e.target.value))))}
              className={inputClass}
              aria-label="Number of years to project"
            />
          </div>
          <div>
            <label htmlFor="draw-rate" className="mb-1 block text-sm text-[var(--color-muted)]">
              MA interest rate (%)
            </label>
            <input
              id="draw-rate"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={drawRate}
              onChange={(e) => setDrawRate(Math.max(0, Math.min(20, Number(e.target.value))))}
              className={inputClass}
              aria-label="Annual MediSave interest rate in percent"
            />
          </div>
        </div>

        <button
          onClick={calcDrawdown}
          className="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          Calculate
        </button>

        {drawResult && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3"
          >
            <div>
              <p className="text-xs text-[var(--color-muted)]">MA after withdrawal</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.after)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                Projected MA after {drawYears} yr{drawYears > 1 ? "s" : ""}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.projected)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">MA interest earned</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(drawResult.interest)}
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Projects your MediSave after deducting the withdrawal, compounding the remainder at the rate above. Prefilled with the current MA balance — edit any field, then Calculate.
        </p>
      </div>

      {/* Premium schedule table (sampled every 10y) */}
      {premiumRows.length > 0 && (
        <div className={cardClass}>
          <h3 className={`${labelClass} mb-3`}>
            MediShield Life premium schedule
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="pb-2 font-medium">Age</th>
                <th className="pb-2 text-right font-medium">Annual premium</th>
              </tr>
            </thead>
            <tbody>
              {premiumRows.map((p) => (
                <tr
                  key={p.age}
                  className="border-b border-[var(--color-border)] last:border-0"
                >
                  <td className="py-2">{p.age}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {sgd(p.annual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            MediShield Life premiums are indicative and drawn from MediSave in practice.
          </p>
        </div>
      )}
    </>
  );
}
