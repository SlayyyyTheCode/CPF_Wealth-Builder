"use client";
import { memo, use, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { simulate, getMember, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { SimResult, Member } from "@/lib/types";
import { YearScrubber } from "@/components/year-scrubber";
import { NumberInput } from "@/components/number-input";
import { PageHeading, OrdinaryIcon, RocketIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";
import {
  getWhatIf, setWhatIf, simulateOaSplit,
  CPFIS_OA_FLOOR, CPFIS_STOCK_LIMIT, CPFIS_GOLD_LIMIT,
} from "@/lib/whatif";

// OA base interest floor.
const OA_RATE = 0.025;

// Stable identity for the "still loading" case — a fresh [] each render would
// invalidate the memos below on every pass.
const EMPTY_YEARS: SimResult["years"] = [];

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

  // Top-up what-if (yearly OA voluntary contribution from a chosen age)
  const savedOa = useMemo(() => getWhatIf(Number(id)).oa, [id]);
  const [topup, setTopup] = useState<number>(() => savedOa?.topup ?? 0);
  const [topupAge, setTopupAge] = useState<number>(() => savedOa?.startAge ?? 0);
  const [wiData, setWiData] = useState<
    { age: number; baseline: number; withTopup: number }[] | null
  >(null);

  // Persist OA what-if params so the Overview can combine all accounts.
  useEffect(() => {
    setWhatIf(Number(id), { oa: { topup, startAge: topupAge } });
  }, [id, topup, topupAge]);

  // CPFIS-OA investment what-if: keep N in the OA, invest everything above it.
  const savedInv = useMemo(() => getWhatIf(Number(id)).oaInvest, [id]);
  const [invKeep, setInvKeep] = useState<number>(() => savedInv?.keepInOa ?? CPFIS_OA_FLOOR);
  const [invAge, setInvAge] = useState<number>(() => savedInv?.startAge ?? 0);
  const [invRate, setInvRate] = useState<number>(() => savedInv?.ratePct ?? 10);
  const [invMonthly, setInvMonthly] = useState<number>(() => savedInv?.monthly ?? 0);

  // Persist so the Overview's What-If Scenario reflects this calculator too.
  useEffect(() => {
    setWhatIf(Number(id), {
      oaInvest: { keepInOa: invKeep, startAge: invAge, ratePct: invRate, monthly: invMonthly },
    });
  }, [id, invKeep, invAge, invRate, invMonthly]);

  // Monthly housing mortgage — paid from OA every month from `mortgageAge`,
  // reducing the OA balance/interest shown across the page.
  const [mortgageMth, setMortgageMth] = useState<number>(0);
  const [mortgageAge, setMortgageAge] = useState<number>(0);

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
        // Prefill the monthly mortgage from the client's profile.
        setMortgageMth(Math.max(0, Math.round(m.housing_data?.monthly_mortgage ?? 0)));
        if (r.result.years.length > 0) {
          const first = r.result.years[0].age;
          setAge(first);
          setTopupAge(first);
          setMortgageAge(first);
          // Only seed the investment age if the user hasn't already set one.
          setInvAge((prev) => (prev > 0 ? prev : first));
        }
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => {
      ok = false;
    };
  }, [id]);

  // Hooks must run on EVERY render, so these stay above the early returns
  // below. Previously they sat after them: on a cold load (no warm cache) the
  // first render bailed to the skeleton without calling them, and the render
  // after the data arrived called two extra hooks — "Rendered more hooks than
  // during the previous render." `years` falls back to a stable empty array so
  // the memo deps don't change identity while loading.
  const years = res?.years ?? EMPTY_YEARS;

  // Monthly housing mortgage is paid out of OA every month from `mortgageAge`.
  // Each year diverts 12 x mortgage that would otherwise compound at 2.5%, so we
  // carry a growing "forgone OA" and subtract it from each year's opening and
  // closing balance (floored at $0). Interest is the residual balance change net
  // of the after-mortgage contribution.
  const mortgageByAge = useMemo(() => {
    const map = new Map<number, { opening: number; closing: number; interest: number }>();
    let cumPrev = 0; // forgone OA (incl. lost interest) at the start of the year
    for (const y of years) {
      const annual = mortgageMth > 0 && y.age >= mortgageAge ? mortgageMth * 12 : 0;
      const cumThis = cumPrev * (1 + OA_RATE) + annual;
      const opening = Math.max(0, (y.opening?.OA ?? 0) - cumPrev);
      const closing = Math.max(0, y.closing.OA - cumThis);
      const netContribution = (y.contribution_by_account?.OA ?? 0) - annual;
      map.set(y.age, { opening, closing, interest: Math.max(0, closing - opening - netContribution) });
      cumPrev = cumThis;
    }
    return map;
  }, [years, mortgageMth, mortgageAge]);

  const oaSeries = useMemo(
    () => years.map((y) => ({ age: y.age, oa: Math.round(mortgageByAge.get(y.age)?.closing ?? y.closing.OA) })),
    [years, mortgageByAge],
  );

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

  const ages = years.map((y) => y.age);
  const yr = years.find((y) => y.age === age);

  // KPI values for the selected year (mortgage-adjusted)
  const adj = mortgageByAge.get(age);
  const oaBalance = adj ? adj.closing : (yr?.closing.OA ?? 0);
  const oaOpening = adj ? adj.opening : (yr?.opening?.OA ?? 0);
  const oaInterest = adj ? adj.interest : (yr?.interest_by_account?.OA ?? 0);
  const extraInterest = yr ? oaExtraInterest(oaBalance, age) : 0;
  // Combined CPF is the raw projection total (same across all account tabs);
  // the OA-only mortgage what-if does not change this cross-account figure.
  const combined = yr
    ? yr.closing.OA + yr.closing.SA + yr.closing.MA + yr.closing.RA
    : 0;

  // OA → RA at 55: SA closes and OA tops the RA up to the FRS. Estimate the
  // amount of OA absorbed into the RA as the drop in OA across the 54→55 step.
  const oa54 = mortgageByAge.get(54)?.closing ?? years.find((y) => y.age === 54)?.closing.OA ?? null;
  const oa55 = mortgageByAge.get(55)?.closing ?? years.find((y) => y.age === 55)?.closing.OA ?? null;
  const oaIntoRa =
    oa54 !== null && oa55 !== null ? Math.max(oa54 - oa55, 0) : null;

  // OA contribution from wage (employee + employer) — exact engine figure for
  // the selected year, split per account.
  const oaAnnualIn = yr?.contribution_by_account?.OA ?? 0;
  const oaMonthlyIn = oaAnnualIn / 12;
  const cappedWage = Math.min(member.monthly_gross_wage, owCeiling > 0 ? owCeiling : member.monthly_gross_wage);

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

  // ── CPFIS-OA investment what-if (derived) ──────────────────────────────────
  // Hypothetical: the real $20k CPFIS floor is NOT enforced here (you asked for
  // it to be lifted so any split can be modelled) — it is shown as guidance
  // instead. Both lines come from one simulation, so the gap is honest.
  const invParams = { keepInOa: invKeep, startAge: invAge, ratePct: invRate, monthly: invMonthly };
  const splitRows = simulateOaSplit(years, invParams);
  const oaAtInvAge = years.find((y) => y.age >= invAge)?.closing.OA ?? member.balances.OA;
  const investedAtStart = Math.max(oaAtInvAge - Math.max(invKeep, 0), 0);
  const splitSel = splitRows.find((r) => r.age === age) ?? splitRows[splitRows.length - 1] ?? null;
  // Compare TOTAL wealth (OA + RA + invested). From 55 the RA sweep moves OA
  // cash into the RA — comparing the OA alone would read that as a loss.
  const splitGap = splitSel ? splitSel.totalSplit - splitSel.totalOnly : 0;
  const swept = splitSel ? splitSel.raOnly > 0 || splitSel.raSplit > 0 : false;

  // Real-world CPFIS guidance (informational, not enforced).
  const cpfisInvestible = Math.max(oaAtInvAge - CPFIS_OA_FLOOR, 0);
  const invNotes: string[] = [];
  if (invKeep < CPFIS_OA_FLOOR)
    invNotes.push(
      `Hypothetical: in reality CPF requires ${sgd(CPFIS_OA_FLOOR)} to stay in the OA before you may invest, which would cap the invested amount at ${sgd(cpfisInvestible)} here. Not enforced in this scenario.`,
    );
  if (investedAtStart > cpfisInvestible * CPFIS_STOCK_LIMIT && cpfisInvestible > 0)
    invNotes.push(
      `In reality stocks are capped at 35% of investible savings (${sgd(cpfisInvestible * CPFIS_STOCK_LIMIT)}) and gold at 10% (${sgd(cpfisInvestible * CPFIS_GOLD_LIMIT)}); the rest must go into other CPFIS-included products.`,
    );
  if (invRate < 2.5 && investedAtStart > 0)
    invNotes.push(
      `A ${invRate}% return is below the 2.5% OA floor — investing leaves you worse off than leaving the money in the OA.`,
    );
  if (invMonthly * 12 > oaAnnualIn && invMonthly > 0)
    invNotes.push(
      `You can only reroute what actually flows into the OA (${sgd(oaAnnualIn)}/yr). The monthly amount is capped at that in the projection — CPFIS-OA can only be funded from the OA.`,
    );

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
        subtitle="OA balance and 2.5% interest over time, extra interest, the move into RA at 55, and the impact of a monthly housing mortgage."
      />

      {/* 2. Year scrubber + monthly mortgage control */}
      <div className={`${cardClass} mb-4`}>
        <p className={`${labelClass} mb-3`}>Select year</p>
        <YearScrubber ages={ages} value={age} onChange={setAge} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="oa-mortgage" className="mb-1 block text-sm text-[var(--color-muted)]">
              Monthly Housing Mortgage (SGD)
            </label>
            <NumberInput
              id="oa-mortgage"
              min={0}
              step={100}
              value={mortgageMth}
              placeholder="0"
              onChange={setMortgageMth}
              className={inputClass}
              aria-label="Monthly housing mortgage paid from OA"
            />
          </div>
          <div>
            <label htmlFor="oa-mortgage-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Mortgage starts at age
            </label>
            <NumberInput
              id="oa-mortgage-age"
              min={0}
              max={120}
              step={1}
              value={mortgageAge}
              onChange={setMortgageAge}
              className={inputClass}
              aria-label="Age at which mortgage payments begin"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Paid from OA every month — it reduces the OA balance, interest and the
          figures below (floored at $0).
        </p>
      </div>

      {/* 3. Per-year KPI row — two grouped boxes */}
      {yr && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Start / end of year */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Start/End Account of the Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">Current OA</p>
                <p className={kpiClass}>{sgd(oaOpening)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">start of year</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">End of the year OA balance</p>
                <p className={`${kpiClass} text-[var(--color-primary)]`}>{sgd(oaBalance)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">closing balance</p>
              </div>
            </div>
          </div>
          {/* Interest earned */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Interest earned of this Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">OA interest earned</p>
                <p className={kpiClass}>{sgd(oaInterest)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">base 2.5% + extra</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">Est. extra interest</p>
                <p className={kpiClass}>{sgd(extraInterest)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {age >= 55 ? "+2% on OA (capped $20k)" : "+1% on OA (capped $20k)"}
                </p>
              </div>
            </div>
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
      <OaBalanceChart data={oaSeries} cardClass={cardClass} labelClass={labelClass} />

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

      {/* 8. Top-up what-if calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4`}>Top-up what-if calculator</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="oa-topup" className="mb-1 block text-sm text-[var(--color-muted)]">
              Yearly OA top-up (S$)
            </label>
            <NumberInput
              id="oa-topup"
              min={0}
              step={1000}
              value={topup}
              placeholder="0"
              onChange={setTopup}
              className={inputClass}
              aria-label="Yearly OA top-up amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="oa-topup-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Start at age
            </label>
            <NumberInput
              id="oa-topup-age"
              min={0}
              max={120}
              step={1}
              value={topupAge}
              onChange={setTopupAge}
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

      {/* 8b. Top-up what-if calculator (CPF-OA Investment) */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-1`}>Top-up what-if calculator (CPF-OA Investment)</h3>
        <p className="mb-4 max-w-3xl text-sm text-[var(--color-muted)]">
          Keep an amount in the OA earning the 2.5% floor + extra interest, and invest everything
          above it through CPFIS-OA. Both lines below run through the <em>same</em> projection from
          your start age, so the gap between them is the effect of investing — nothing else.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="oa-inv-keep" className="mb-1 block text-sm text-[var(--color-muted)]">
              Keep in OA (S$)
            </label>
            <NumberInput
              id="oa-inv-keep"
              min={0}
              step={1000}
              value={invKeep}
              placeholder="0"
              onChange={setInvKeep}
              className={inputClass}
              aria-label="Amount kept in the OA in Singapore dollars"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Invests {sgd(investedAtStart)} at age {invAge}
            </p>
          </div>
          <div>
            <label htmlFor="oa-inv-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Specific Age (start investing)
            </label>
            <NumberInput
              id="oa-inv-age"
              min={0}
              max={120}
              step={1}
              value={invAge}
              onChange={setInvAge}
              className={inputClass}
              aria-label="Age at which investing begins"
            />
          </div>
          <div>
            <label htmlFor="oa-inv-rate" className="mb-1 block text-sm text-[var(--color-muted)]">
              Rate of Return (per year) %
            </label>
            <NumberInput
              id="oa-inv-rate"
              min={0}
              max={30}
              step={0.5}
              value={invRate}
              onChange={setInvRate}
              className={inputClass}
              aria-label="Assumed annual rate of return, percent"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">OA floor is 2.5%</p>
          </div>
          <div>
            <label htmlFor="oa-inv-mth" className="mb-1 block text-sm text-[var(--color-muted)]">
              Monthly into investment (S$)
            </label>
            <NumberInput
              id="oa-inv-mth"
              min={0}
              step={100}
              value={invMonthly}
              placeholder="0"
              onChange={setInvMonthly}
              className={inputClass}
              aria-label="Monthly amount routed from OA contributions into the investment"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Rerouted from your OA inflow ({sgd(oaAnnualIn / 12)}/mth)
            </p>
          </div>
        </div>

        {invNotes.length > 0 && (
          <ul role="note" className="mt-4 space-y-1">
            {invNotes.map((w) => (
              <li key={w} className="rounded-xl bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
                ⚠ {w}
              </li>
            ))}
          </ul>
        )}

        {/* Side-by-side result at the selected year */}
        {splitSel && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-x-6 gap-y-4 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3"
          >
            <div>
              <p className="text-xs text-[var(--color-muted)]">No investing — total (age {age})</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{sgd(splitSel.totalOnly)}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                OA {sgd(splitSel.oaOnly)}
                {swept && <> + RA {sgd(splitSel.raOnly)}</>}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Keep in OA + CPFIS-OA — total (age {age})</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(splitSel.totalSplit)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                OA {sgd(splitSel.retained)} + invested {sgd(splitSel.invested)}
                {swept && <> + RA {sgd(splitSel.raSplit)}</>}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Difference</p>
              <p
                className={`mt-0.5 text-2xl font-bold tabular-nums ${
                  splitGap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--color-error)]"
                }`}
              >
                {splitGap >= 0 ? "+" : ""}{sgd(splitGap)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Carried into the Overview What-If Scenario.
              </p>
            </div>
          </div>
        )}

        {/* Comparison chart */}
        {splitRows.length > 1 && (
          <div
            role="img"
            aria-label="Projected OA: leaving everything in the OA versus keeping an amount in the OA and investing the rest through CPFIS-OA"
            className="mt-4 h-72"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={splitRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
                <YAxis
                  tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  width={56}
                />
                <Tooltip
                  formatter={(v, name) => [
                    sgd(typeof v === "number" ? v : null),
                    name === "totalOnly"
                      ? "No investing (OA + RA)"
                      : name === "totalSplit"
                        ? "Keep in OA + CPFIS-OA (OA + RA + invested)"
                        : "…of which invested",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend
                  formatter={(v) =>
                    v === "totalOnly"
                      ? "No investing (OA + RA)"
                      : v === "totalSplit"
                        ? "Keep in OA + CPFIS-OA"
                        : "…of which invested"
                  }
                  wrapperStyle={{ fontSize: "12px" }}
                />
                {/* At 55 the RA forms: the SA fills it to the retirement sum and
                    the OA is drawn on only if the SA falls short. Totals include
                    the RA, so nothing appears to vanish here. */}
                <ReferenceLine
                  x={55}
                  stroke="var(--color-muted)"
                  strokeDasharray="4 4"
                  label={{ value: "55 · RA forms", position: "top", fontSize: 10, fill: "var(--color-muted)" }}
                />
                <Line isAnimationActive={false} type="monotone" dataKey="totalOnly" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="invested" stroke="var(--chart-4)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="totalSplit" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 max-w-3xl text-xs text-[var(--color-muted)]">
          <span className="font-semibold">How this is calculated.</span>{" "}
          From your start age the OA splits in two: the amount you keep earns 2.5% plus the extra
          interest (+1% on its first $20k below 55, +2% from 55) and receives your salary + employer
          OA contributions <em>and</em> any overflow — once MediSave fills to the BHS its excess
          cascades to the SA, then to the OA, carrying its 4% interest with it. Everything above the
          amount you keep compounds at your assumed return. The &ldquo;no investing&rdquo; line is
          the identical projection with no split, so the gap is purely the investing.{" "}
          <span className="font-semibold">Money is conserved</span> — CPFIS-OA can only be funded
          from the OA, so the monthly amount is <em>rerouted</em> from your OA inflow (capped at it),
          never added as new cash.{" "}
          <span className="font-semibold">At 55</span> the RA forms: the SA fills it up to the
          retirement sum and any SA left over spills into the OA; the OA is drawn on only if the SA
          falls short. Both lines show <em>totals including the RA</em>, so nothing vanishes at 55 —
          and because CPFIS-OA holdings are <em>not</em> liquidated at 55, invested money stays
          outside the RA. The RA then compounds at 4% + extra interest (+2% on its first $30k, +1% on
          the next $30k).{" "}
          <span className="font-semibold">Not modelled:</span> the housing mortgage above. The real
          $20,000 CPFIS floor is not enforced here — this is a hypothetical scenario.
        </p>
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
  data, cardClass, labelClass,
}: { data: { age: number; oa: number }[]; cardClass: string; labelClass: string }) {
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
