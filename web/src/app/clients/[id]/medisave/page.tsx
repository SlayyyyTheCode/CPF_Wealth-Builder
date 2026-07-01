"use client";
import { use, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { simulate, getMember, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { SimResult, Member } from "@/lib/types";
import { MaBhsChart } from "@/components/ma-bhs-chart";
import { MedisaveAdequacy } from "@/components/medisave-adequacy";
import { YearScrubber } from "@/components/year-scrubber";
import { PageHeading, MedisaveIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";
import { getWhatIf, setWhatIf } from "@/lib/whatif";
import { extraInterestByAccount } from "@/lib/extra-interest";

// MA earns the 4% floor rate.
const MA_RATE = 0.04;

export default function MedisavePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [res, setRes] = useState<SimResult | null>(() => peekSim(Number(id))?.result ?? null);
  const [member, setMember] = useState<Member | null>(() => peekMember(Number(id)));
  const [owCeiling, setOwCeiling] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  // Top-up what-if (yearly MA voluntary contribution from a chosen age)
  const savedMa = useMemo(() => getWhatIf(Number(id)).ma, [id]);
  const [topup, setTopup] = useState<number>(() => savedMa?.topup ?? 0);
  const [topupAge, setTopupAge] = useState<number>(() => savedMa?.startAge ?? 0);
  const [wiData, setWiData] = useState<
    { age: number; baseline: number; withTopup: number; bhs: number }[] | null
  >(null);

  // Persist MA what-if params so the Overview can combine all accounts.
  useEffect(() => {
    setWhatIf(Number(id), { ma: { topup, startAge: topupAge } });
  }, [id, topup, topupAge]);

  // Insurance drawdown calculator state
  const [maNow, setMaNow] = useState(0);          // current MA balance
  const [withdraw, setWithdraw] = useState(0);     // annual insurance withdrawal (S$/yr)
  const [drawYears, setDrawYears] = useState(10);
  const [drawRate, setDrawRate] = useState(4);
  const [drawResult, setDrawResult] = useState<
    {
      projected: number;
      totalWithdrawn: number;
      contributions: number;
      interest: number;
      series: { age: number; ma: number; bhs: number; maAfter: number | null }[];
    } | null
  >(null);

  // Scrubber state — seed from warm cache so the page paints fully on tab switch.
  const [age, setAge] = useState<number | null>(() => peekSim(Number(id))?.result.years[0]?.age ?? null);

  useEffect(() => {
    let ok = true;
    const numId = Number(id);
    Promise.all([
      simulate(numId, 91),
      getMember(numId),
      getActivePolicy(new Date().getFullYear()),
    ])
      .then(([r, m, policy]) => {
        if (!ok) return;
        setRes(r.result);
        setMember(m);
        setOwCeiling(Number(policy.ordinary_wage_ceiling) || 0);
        if (r.result.years.length > 0) {
          setAge(r.result.years[0].age);
          setMaNow(Math.round(r.result.years[0].closing.MA));
          setTopupAge(r.result.years[0].age);
        }
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => {
      ok = false;
    };
  }, [id]);

  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  if (!res || !member || age === null)
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
  const maOpening = yr?.opening?.MA ?? 0;
  const bhsThisYear = ms?.bhs ?? 0;
  const neededToBhs = Math.max(bhsThisYear - maBalance, 0);
  const maInterest = yr?.interest_by_account?.MA ?? 0;
  const maExtra = yr ? extraInterestByAccount(yr.closing, age).MA : 0;
  const combined = yr ? yr.closing.OA + yr.closing.SA + yr.closing.MA + yr.closing.RA : 0;

  // Overflow values for selected year
  const overflow = yr?.overflow_out;
  const maToSa = overflow?.ma_to_sa ?? 0;
  const maToOa = overflow?.ma_to_oa ?? 0;
  const maToRa = overflow?.ma_to_ra ?? 0;
  const totalOverflow = maToSa + maToOa + maToRa;
  const hasOverflow = totalOverflow > 0;

  // Insurance drawdown calculator — committed on "Calculate".
  // Each year: MA compounds monthly at the MA rate + receives the engine's MA
  // contribution (capped at that year's BHS), then a one-off insurance premium
  // is withdrawn. Recurring for `drawYears`.
  function calcDrawdown() {
    if (!medisave) return;
    const rm = drawRate / 100 / 12;
    const startAge = years[0].age;
    let ma = maNow;
    let totalWithdrawn = 0;
    let contributions = 0;
    let interest = 0;
    const proj: Record<number, number> = { [startAge]: Math.round(ma) };
    for (let i = 0; i < drawYears; i++) {
      const a = startAge + i;
      const monthlyContrib = (years.find((y) => y.age === a)?.contribution_by_account?.MA ?? 0) / 12;
      const bhs = medisave.series.find((s) => s.age === a)?.bhs ?? Infinity;
      for (let m = 0; m < 12; m++) {
        // Interest earned on the running balance (always positive), credited
        // before contribution. BHS cap only sheds the excess of contribution
        // (overflow leaves MA) — it never negates interest already earned.
        const gain = ma * rm;
        interest += gain;
        ma = Math.min(ma + gain + monthlyContrib, bhs);
        contributions += monthlyContrib;
      }
      const w = Math.min(withdraw, ma);
      ma -= w;
      totalWithdrawn += w;
      proj[a + 1] = Math.round(ma);
    }
    const series = medisave.series.map((s) => ({
      age: s.age,
      ma: s.ma,
      bhs: s.bhs,
      maAfter: s.age in proj ? proj[s.age] : null,
    }));
    setDrawResult({
      projected: ma,
      totalWithdrawn,
      contributions,
      interest,
      series,
    });
  }

  // MA contribution from wage (employee + employer) — exact engine figure for
  // the selected year.
  const maAnnualIn = yr?.contribution_by_account?.MA ?? 0;
  const maMonthlyIn = maAnnualIn / 12;
  const cappedWage = Math.min(
    member.monthly_gross_wage,
    owCeiling > 0 ? owCeiling : member.monthly_gross_wage,
  );

  // Yearly MA top-up from a chosen age, compounded at the MA floor (4%/yr).
  // FV after k top-ups = topup * ((1+r)^k - 1)/r, k = years since the start age.
  function runWhatIf() {
    if (!medisave) return;
    const data = years.map((y) => {
      const k = y.age - topupAge + 1;
      const fv = topup > 0 && k > 0 ? topup * (((1 + MA_RATE) ** k - 1) / MA_RATE) : 0;
      const s = medisave.series.find((p) => p.age === y.age);
      return {
        age: y.age,
        baseline: Math.round(y.closing.MA),
        withTopup: Math.round(y.closing.MA + fv),
        bhs: Math.round(s?.bhs ?? 0),
      };
    });
    setWiData(data);
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

      {/* 3. Per-year KPIs — two grouped boxes */}
      {yr && ms && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Start / end of year */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Start/End Account of the Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">Current MA</p>
                <p className={kpiClass}>{sgd(maOpening)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">start of year</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">End of the year MA balance</p>
                <p className={`${kpiClass} text-[var(--color-primary)]`}>{sgd(maBalance)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">closing balance</p>
              </div>
            </div>
          </div>
          {/* Interest earned */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Interest earned of this Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">MA interest earned</p>
                <p className={kpiClass}>{sgd(maInterest)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">base 4% + extra</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">Est. extra interest</p>
                <p className={kpiClass}>{sgd(maExtra)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {age >= 55 ? "+2%/+1% on first $60k band" : "+1% on first $60k band"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3a. BHS targets */}
      {yr && ms && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className={cardClass}>
            <p className={labelClass}>BHS for Year {yr.year}</p>
            <p className={kpiClass}>{sgd(bhsThisYear)}</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit BHS</p>
            {neededToBhs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">BHS reached</p>
            ) : (
              <p className={kpiClass}>{sgd(neededToBhs)}</p>
            )}
          </div>
        </div>
      )}

      {/* 3b. MA contribution from wage */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>MA contribution from salary (age {age})</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Gross wage / mth</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(member.monthly_gross_wage)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">CPF-able wage / mth</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(cappedWage)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Into MA / mth</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maMonthlyIn)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Into MA / yr</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maAnnualIn)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Employee + employer contribution flowing to MA this year (from the projection engine), on
          wage capped at the Ordinary Wage ceiling ({sgd(owCeiling)}/mth). MA inflow stops once the
          BHS is reached and overflows out.
        </p>
      </div>

      {/* 3c. Combined CPF balance */}
      <div className={`${cardClass} mb-4`}>
        <p className={labelClass}>Combined CPF balance</p>
        <p className={kpiClass}>{sgd(combined)}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">OA + SA + MA + RA (age {age})</p>
      </div>

      {/* 4. MA overflow card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>MA overflow (age {age})</h3>
        {hasOverflow ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              {age < 55 ? (
                <div>
                  <p className="text-xs text-[var(--color-muted)]">→ SA</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToSa)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-[var(--color-muted)]">→ RA</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToRa)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--color-muted)]">→ OA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(maToOa)}</p>
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
          Once MA exceeds the BHS, overflow goes to SA before 55 — and to RA from age 55, when the SA closes and merges into the RA. Any remainder above the retirement sum goes to OA.
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
              Annual insurance withdrawal (S$/yr)
            </label>
            <input
              id="ma-withdraw"
              type="number"
              min={0}
              step={100}
              value={withdraw || ""}
              placeholder="0"
              onChange={(e) => setWithdraw(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Annual insurance withdrawal from MediSave per year"
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
              <p className="text-xs text-[var(--color-muted)]">
                Projected MA after {drawYears} yr{drawYears > 1 ? "s" : ""}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.projected)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Total withdrawn for insurance</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.totalWithdrawn)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">MA interest earned</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(drawResult.interest)}
              </p>
            </div>
          </div>
        )}

        {drawResult && (
          <div
            role="img"
            aria-label="MA balance versus BHS versus MA balance after withdrawal by age"
            className="mt-4 h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={drawResult.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                <YAxis
                  tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  width={52}
                />
                <Tooltip
                  formatter={(v, name) => [
                    sgd(typeof v === "number" ? v : null),
                    name === "ma" ? "MA balance" : name === "bhs" ? "BHS" : "MA after yearly withdrawals",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend
                  formatter={(v) => (v === "ma" ? "MA balance" : v === "bhs" ? "BHS" : "MA after yearly withdrawals")}
                  wrapperStyle={{ fontSize: "12px" }}
                />
                <Line isAnimationActive={false} type="monotone" dataKey="ma" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="bhs" stroke="var(--chart-grey)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="maAfter" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Each year the insurance premium is withdrawn from MA; in between, the balance keeps earning
          the MA rate (monthly) and receiving the projected MA contribution, capped at that year&apos;s
          BHS. Prefilled with the current MA balance — edit any field, then Calculate.
        </p>
      </div>

      {/* 8. Top-up what-if calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4`}>Top-up what-if calculator</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="ma-topup" className="mb-1 block text-sm text-[var(--color-muted)]">
              Yearly MA top-up (S$)
            </label>
            <input
              id="ma-topup"
              type="number"
              min={0}
              step={1000}
              value={topup || ""}
              placeholder="0"
              onChange={(e) => setTopup(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Yearly MA top-up amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="ma-topup-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Start at age
            </label>
            <input
              id="ma-topup-age"
              type="number"
              min={ages[0]}
              max={ages[ages.length - 1]}
              step={1}
              value={topupAge}
              onChange={(e) => setTopupAge(Math.max(ages[0], Math.min(ages[ages.length - 1], Number(e.target.value))))}
              className={inputClass}
              aria-label="Age at which yearly top-ups begin"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={runWhatIf}
              className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
              aria-label="Recalculate with yearly top-up"
            >
              Recalculate
            </button>
          </div>
        </div>

        {wiData && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-2"
          >
            <div>
              <p className="text-xs text-[var(--color-muted)]">Final MA (baseline)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {sgd(wiData[wiData.length - 1].baseline)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Final MA (with top-up)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(wiData[wiData.length - 1].withTopup)}
              </p>
              <p className="text-xs text-[var(--color-primary)]">
                +{sgd(wiData[wiData.length - 1].withTopup - wiData[wiData.length - 1].baseline)} delta
              </p>
            </div>
          </div>
        )}

        {wiData && (
          <div
            role="img"
            aria-label="Projected MA balance: baseline versus with yearly top-up, against BHS"
            className="mt-4 h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wiData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                <YAxis
                  tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  width={52}
                />
                <Tooltip
                  formatter={(v, name) => [
                    sgd(typeof v === "number" ? v : null),
                    name === "baseline" ? "Baseline" : name === "withTopup" ? "With yearly top-up" : "BHS",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : v === "withTopup" ? "With yearly top-up" : "BHS")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="withTopup" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="bhs" stroke="var(--chart-grey)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Estimate: starting at the chosen age, each year&apos;s voluntary MA top-up is compounded at
          the 4% MA floor rate and added to the projected balance. MA top-ups are only accepted up to
          the prevailing BHS.
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
