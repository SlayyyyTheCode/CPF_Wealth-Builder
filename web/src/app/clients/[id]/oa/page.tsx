"use client";
import { memo, use, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { simulate, getMember, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { SimResult, YearRow, Member } from "@/lib/types";
import { YearScrubber } from "@/components/year-scrubber";
import { PageHeading, OrdinaryIcon, HousingIcon, RocketIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";

// OA base interest floor.
const OA_RATE = 0.025;

// Estimated extra interest earned on the OA portion of combined CPF balances.
// Below 55: +1% on the first $60k combined, OA counted first and capped at $20k.
// 55+:      +2% on the first $30k + 1% on the next $30k, OA still capped at $20k.
// OA is counted first, so its whole $20k slice sits in the top tier either way.
function oaExtraInterest(oa: number, age: number): number {
  const oaSlice = Math.min(oa, 20000);
  return age >= 55 ? 0.02 * oaSlice : 0.01 * oaSlice;
}

export default function OaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [res, setRes] = useState<SimResult | null>(() => peekSim(Number(id))?.result ?? null);
  const [member, setMember] = useState<Member | null>(() => peekMember(Number(id)));
  const [owCeiling, setOwCeiling] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  // Housing-withdrawal calculator state (monthly mortgage draw)
  const [oaNow, setOaNow] = useState(0);            // current OA balance
  const [withdrawMth, setWithdrawMth] = useState(0); // monthly amount drawn (housing)
  const [drawYears, setDrawYears] = useState(10);
  const [drawMonths, setDrawMonths] = useState(0);
  const [drawRate, setDrawRate] = useState(OA_RATE * 100);
  const [drawResult, setDrawResult] = useState<
    {
      projected: number;
      withdrawn: number;
      interest: number;
      months: number;
      series: { age: number; oa: number; oaAfter: number | null }[];
    } | null
  >(null);

  // Top-up what-if (yearly OA voluntary contribution from a chosen age)
  const [topup, setTopup] = useState<number>(0);
  const [topupAge, setTopupAge] = useState<number>(0);
  const [wiData, setWiData] = useState<
    { age: number; baseline: number; withTopup: number }[] | null
  >(null);

  // Monthly housing mortgage — diverts OA inflow each year, so the OA path and
  // its forgone interest shrink. Floored at $0 (can't pay more than the OA has).
  const [mortgageMth, setMortgageMth] = useState<number>(0);
  const [mortgageAge, setMortgageAge] = useState<number>(0);
  const [mortgageData, setMortgageData] = useState<
    { age: number; baseline: number; oaAfter: number }[] | null
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
        // Prefill the housing calculators from the client's monthly mortgage.
        setWithdrawMth(Math.max(0, Math.round(m.housing_data?.monthly_mortgage ?? 0)));
        setMortgageMth(Math.max(0, Math.round(m.housing_data?.monthly_mortgage ?? 0)));
        if (r.result.years.length > 0) {
          setAge(r.result.years[0].age);
          setOaNow(Math.round(r.result.years[0].closing.OA));
          setTopupAge(r.result.years[0].age);
          setMortgageAge(r.result.years[0].age);
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

  const years = res.years;
  const ages = years.map((y) => y.age);
  const yr = years.find((y) => y.age === age);

  // KPI values for the selected year
  const oaBalance = yr?.closing.OA ?? 0;
  const oaOpening = yr?.opening?.OA ?? 0;
  const oaInterest = yr?.interest_by_account?.OA ?? 0;
  const extraInterest = yr ? oaExtraInterest(oaBalance, age) : 0;
  const combined = yr
    ? yr.closing.OA + yr.closing.SA + yr.closing.MA + yr.closing.RA
    : 0;

  // OA → RA at 55: SA closes and OA tops the RA up to the FRS. Estimate the
  // amount of OA absorbed into the RA as the drop in OA across the 54→55 step.
  const oa54 = years.find((y) => y.age === 54)?.closing.OA ?? null;
  const oa55 = years.find((y) => y.age === 55)?.closing.OA ?? null;
  const oaIntoRa =
    oa54 !== null && oa55 !== null ? Math.max(oa54 - oa55, 0) : null;

  // OA contribution from wage (employee + employer) — exact engine figure for
  // the selected year, split per account.
  const oaAnnualIn = yr?.contribution_by_account?.OA ?? 0;
  const oaMonthlyIn = oaAnnualIn / 12;
  const cappedWage = Math.min(member.monthly_gross_wage, owCeiling > 0 ? owCeiling : member.monthly_gross_wage);

  // Housing-withdrawal calculator — monthly mortgage draw, compounded monthly.
  function calcWithdrawal() {
    const rm = drawRate / 100 / 12;
    const months = Math.max(drawYears * 12 + drawMonths, 0);
    const startAge = years[0].age;
    let bal = oaNow;
    let withdrawn = 0;
    const byAge: Record<number, number> = { [startAge]: Math.round(bal) };
    for (let m = 1; m <= months; m++) {
      bal = bal * (1 + rm);
      const w = Math.min(withdrawMth, bal);
      bal -= w;
      withdrawn += w;
      if (m % 12 === 0) byAge[startAge + m / 12] = Math.round(bal);
    }
    byAge[startAge + Math.ceil(months / 12)] = Math.round(bal); // final partial year
    const series = years.map((y) => ({
      age: y.age,
      oa: Math.round(y.closing.OA),
      oaAfter: y.age in byAge ? byAge[y.age] : null,
    }));
    setDrawResult({
      projected: bal,
      withdrawn,
      interest: bal + withdrawn - oaNow,
      months,
      series,
    });
  }

  // Yearly OA top-up from a chosen age, compounded at the OA floor (~2.5%/yr).
  // Estimate layered on the baseline projection; FV after k top-ups =
  // topup * ((1+r)^k - 1)/r where k = years since the chosen start age.
  function runWhatIf() {
    const data = years.map((y) => {
      const k = y.age - topupAge + 1; // number of yearly top-ups made by this age
      const fv = topup > 0 && k > 0 ? topup * (((1 + OA_RATE) ** k - 1) / OA_RATE) : 0;
      return {
        age: y.age,
        baseline: Math.round(y.closing.OA),
        withTopup: Math.round(y.closing.OA + fv),
      };
    });
    setWiData(data);
  }

  // Monthly housing mortgage paid out of OA inflow from `mortgageAge`. Each year
  // diverts 12 x mortgage that would otherwise stay in OA and compound at 2.5%,
  // so the reduction grows as an annuity. OA after = baseline - reduction, ≥ 0.
  function runMortgage() {
    const annual = mortgageMth * 12;
    const data = years.map((y) => {
      const k = y.age - mortgageAge + 1; // yearly mortgage outflows by this age
      const reduction =
        mortgageMth > 0 && k > 0 ? annual * (((1 + OA_RATE) ** k - 1) / OA_RATE) : 0;
      return {
        age: y.age,
        baseline: Math.round(y.closing.OA),
        oaAfter: Math.max(0, Math.round(y.closing.OA - reduction)),
      };
    });
    setMortgageData(data);
  }


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
        icon={<OrdinaryIcon className="h-7 w-7" />}
        title="Ordinary Account (OA)"
        subtitle="OA balance and 2.5% interest over time, extra interest, the move into RA at 55, and a housing-withdrawal calculator."
      />

      {/* 2. Year scrubber */}
      <div className={`${cardClass} mb-4`}>
        <p className={`${labelClass} mb-3`}>Select year</p>
        <YearScrubber ages={ages} value={age} onChange={setAge} />
      </div>

      {/* 3. Per-year KPI row */}
      {yr && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className={labelClass}>Current OA</p>
            <p className={kpiClass}>{sgd(oaOpening)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">start of year</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>OA interest earned</p>
            <p className={kpiClass}>{sgd(oaInterest)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">this year (base 2.5% + extra)</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Est. extra interest</p>
            <p className={kpiClass}>{sgd(extraInterest)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {age >= 55 ? "+2% on OA (capped $20k)" : "+1% on OA (capped $20k)"}
            </p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>End of the year OA balance</p>
            <p className={kpiClass}>{sgd(oaBalance)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">closing balance</p>
          </div>
        </div>
      )}

      {/* 3b. OA contribution from wage */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>OA contribution from salary (age {age})</h3>
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
            <p className="text-xs text-[var(--color-muted)]">Into OA / mth</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(oaMonthlyIn)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Into OA / yr</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(oaAnnualIn)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Employee + employer contribution flowing to OA this year (from the projection engine), on
          wage capped at the Ordinary Wage ceiling ({sgd(owCeiling)}/mth).
        </p>
      </div>

      {/* 3c. Combined CPF balance */}
      <div className={`${cardClass} mb-4`}>
        <p className={labelClass}>Combined CPF balance</p>
        <p className={kpiClass}>{sgd(combined)}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">OA + SA + MA + RA (age {age})</p>
      </div>

      {/* 4. Extra-interest explainer */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>Extra interest on CPF balances</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-sm font-semibold">Below 55</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              +1% on the first <span className="font-semibold">$60,000</span> of combined balances —
              of which OA counts for at most <span className="font-semibold">$20,000</span>.
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-raised)] p-3">
            <p className="text-sm font-semibold">55 and above</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              +2% on the first <span className="font-semibold">$30,000</span> and +1% on the next
              <span className="font-semibold"> $30,000</span> of combined balances — OA still capped at
              <span className="font-semibold"> $20,000</span>.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          OA is counted first towards these caps, so its slice always earns the top extra-interest
          tier. These figures are already included in the OA interest above.
        </p>
      </div>

      {/* 5. OA balance chart (memoised — unaffected by scrubber / calculator state) */}
      <OaBalanceChart years={years} cardClass={cardClass} labelClass={labelClass} />

      {/* 6. OA → RA at 55 card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>OA at age 55 — forms RA with SA</h3>
        {oa54 !== null && oa55 !== null ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--color-muted)]">OA at 54</p>
              <p className="mt-0.5 font-semibold tabular-nums">{sgd(oa54)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">OA at 55</p>
              <p className="mt-0.5 font-semibold tabular-nums">{sgd(oa55)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">OA → RA</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(oaIntoRa)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            This projection does not span age 55.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          At 55 the SA closes and merges into the new Retirement Account. SA is used first; if the
          Full Retirement Sum is not yet met, OA tops it up. Any remaining OA stays in the OA.
        </p>
      </div>

      {/* 7. Housing-withdrawal calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4 flex items-center gap-2`}>
          <HousingIcon className="h-5 w-5" />
          OA housing-withdrawal calculator
        </h3>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <label htmlFor="oa-now" className="mb-1 block text-sm text-[var(--color-muted)]">
              Current OA balance (S$)
            </label>
            <input
              id="oa-now"
              type="number"
              min={0}
              step={100}
              value={oaNow}
              onChange={(e) => setOaNow(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Current Ordinary Account balance"
            />
          </div>
          <div>
            <label htmlFor="oa-withdraw" className="mb-1 block text-sm text-[var(--color-muted)]">
              Withdraw for housing (S$/mth)
            </label>
            <input
              id="oa-withdraw"
              type="number"
              min={0}
              step={50}
              value={withdrawMth || ""}
              placeholder="0"
              onChange={(e) => setWithdrawMth(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Monthly amount withdrawn from OA for housing"
            />
          </div>
          <div>
            <label htmlFor="oa-draw-years" className="mb-1 block text-sm text-[var(--color-muted)]">
              Years
            </label>
            <input
              id="oa-draw-years"
              type="number"
              min={0}
              max={50}
              step={1}
              value={drawYears}
              onChange={(e) => setDrawYears(Math.max(0, Math.min(50, Number(e.target.value))))}
              className={inputClass}
              aria-label="Number of whole years to project"
            />
          </div>
          <div>
            <label htmlFor="oa-draw-months" className="mb-1 block text-sm text-[var(--color-muted)]">
              Months
            </label>
            <input
              id="oa-draw-months"
              type="number"
              min={0}
              max={11}
              step={1}
              value={drawMonths || ""}
              placeholder="0"
              onChange={(e) => setDrawMonths(Math.max(0, Math.min(11, Number(e.target.value))))}
              className={inputClass}
              aria-label="Additional months to project"
            />
          </div>
          <div>
            <label htmlFor="oa-draw-rate" className="mb-1 block text-sm text-[var(--color-muted)]">
              OA interest rate (%)
            </label>
            <input
              id="oa-draw-rate"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={drawRate}
              onChange={(e) => setDrawRate(Math.max(0, Math.min(20, Number(e.target.value))))}
              className={inputClass}
              aria-label="Annual OA interest rate in percent"
            />
          </div>
        </div>

        <button
          onClick={calcWithdrawal}
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
              <p className="text-xs text-[var(--color-muted)]">Total withdrawn for housing</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.withdrawn)}</p>
              <p className="text-xs text-[var(--color-muted)]">over {drawResult.months} mth{drawResult.months === 1 ? "" : "s"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Projected OA at end</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{sgd(drawResult.projected)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">OA interest earned</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(drawResult.interest)}
              </p>
            </div>
          </div>
        )}

        {drawResult && (
          <div
            role="img"
            aria-label="OA balance versus OA balance after housing withdrawal by age"
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
                    name === "oa" ? "OA balance" : "OA after withdrawal",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend
                  formatter={(v) => (v === "oa" ? "OA balance" : "OA after withdrawal")}
                  wrapperStyle={{ fontSize: "12px" }}
                />
                <Line isAnimationActive={false} type="monotone" dataKey="oa" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="oaAfter" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Draws the monthly housing amount from the OA each month, compounding the remaining balance
          monthly at the rate above over the chosen years and months. Prefilled with the current OA
          balance — edit any field, then Calculate.
        </p>
      </div>

      {/* 8. Top-up what-if calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4`}>Top-up what-if calculator</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="oa-topup" className="mb-1 block text-sm text-[var(--color-muted)]">
              Yearly OA top-up (S$)
            </label>
            <input
              id="oa-topup"
              type="number"
              min={0}
              step={1000}
              value={topup || ""}
              placeholder="0"
              onChange={(e) => setTopup(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Yearly OA top-up amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="oa-topup-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Start at age
            </label>
            <input
              id="oa-topup-age"
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
              <p className="text-xs text-[var(--color-muted)]">Final OA (baseline)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {sgd(wiData[wiData.length - 1].baseline)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Final OA (with top-up)</p>
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
            aria-label="Projected OA balance: baseline versus with yearly top-up"
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
                    name === "baseline" ? "Baseline" : "With yearly top-up",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : "With yearly top-up")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="withTopup" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Estimate: starting at the chosen age, each year&apos;s voluntary OA top-up is compounded at
          the 2.5% OA floor rate and added to the projected balance.
        </p>
      </div>

      {/* 8b. Monthly housing mortgage */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-1`}>Monthly Housing Mortgage (SGD)</h3>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Each month the mortgage is paid out of OA inflow; the rest stays in OA and
          keeps earning 2.5%. Larger mortgages divert more contributions, so the OA
          path (and its compounding) shrinks — floored at $0.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="oa-mortgage" className="mb-1 block text-sm text-[var(--color-muted)]">
              Monthly mortgage (S$)
            </label>
            <input
              id="oa-mortgage"
              type="number"
              min={0}
              step={100}
              value={mortgageMth || ""}
              placeholder="0"
              onChange={(e) => setMortgageMth(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Monthly housing mortgage paid from OA"
            />
          </div>
          <div>
            <label htmlFor="oa-mortgage-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Start at age
            </label>
            <input
              id="oa-mortgage-age"
              type="number"
              min={ages[0]}
              max={ages[ages.length - 1]}
              step={1}
              value={mortgageAge}
              onChange={(e) => setMortgageAge(Math.max(ages[0], Math.min(ages[ages.length - 1], Number(e.target.value))))}
              className={inputClass}
              aria-label="Age at which mortgage payments begin"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={runMortgage}
              className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
              aria-label="Recalculate with monthly mortgage"
            >
              Recalculate
            </button>
          </div>
        </div>

        {mortgageData && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3"
          >
            <div>
              <p className="text-xs text-[var(--color-muted)]">Final OA (baseline)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {sgd(mortgageData[mortgageData.length - 1].baseline)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Final OA (after mortgage)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(mortgageData[mortgageData.length - 1].oaAfter)}
              </p>
              <p className="text-xs text-[var(--color-error)]">
                −{sgd(mortgageData[mortgageData.length - 1].baseline - mortgageData[mortgageData.length - 1].oaAfter)} delta
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">OA depleted</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {(() => {
                  const d = mortgageData.find((r) => r.oaAfter <= 0);
                  return d ? `Age ${d.age}` : "Never";
                })()}
              </p>
            </div>
          </div>
        )}

        {mortgageData && (
          <div
            role="img"
            aria-label="Projected OA balance: baseline versus after monthly mortgage"
            className="mt-4 h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mortgageData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                    name === "baseline" ? "Baseline" : "After mortgage",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : "After mortgage")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="oaAfter" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 9. Allocation note */}
      <div
        className={`${cardClass} mb-4 flex items-start gap-3 bg-[var(--color-primary)]/10`}
        role="note"
      >
        <RocketIcon className="mt-0.5 h-8 w-8 shrink-0" />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">How OA is funded.</span>{" "}
          Of each monthly CPF contribution, the largest share goes to the OA when you are young and
          tapers with age (the rest flows to SA/RA and MA). The projection applies the current
          age-banded allocation rates automatically — younger members build OA fastest, which is what
          powers housing affordability.
        </p>
      </div>
    </>
  );
}

// Memoised OA balance chart — re-renders only when the projection changes, so
// the year scrubber and calculator inputs no longer re-render it.
const OaBalanceChart = memo(function OaBalanceChart({
  years, cardClass, labelClass,
}: { years: YearRow[]; cardClass: string; labelClass: string }) {
  const data = useMemo(
    () => years.map((y) => ({ age: y.age, oa: Math.round(y.closing.OA) })),
    [years],
  );
  return (
    <div role="img" aria-label="OA balance over time by age" className={`${cardClass} mb-4`}>
      <h3 className={`${labelClass} mb-3`}>OA balance over time</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
            <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={52} />
            <Tooltip formatter={(v) => [sgd(typeof v === "number" ? v : null), "OA balance"]} labelFormatter={(a) => `Age ${a}`} contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }} />
            <Line isAnimationActive={false} type="monotone" dataKey="oa" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
            <ReferenceLine x={55} stroke="var(--chart-4)" strokeDasharray="4 2" label={{ value: "55 → RA", fontSize: 10, fill: "var(--color-muted)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
