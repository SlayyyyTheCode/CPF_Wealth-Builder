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
  getWhatIf, setWhatIf, simulateOaSplit, realValue,
  CPFIS_OA_FLOOR, CPFIS_STOCK_LIMIT, CPFIS_GOLD_LIMIT, OA_TOPUP_CAP,
} from "@/lib/whatif";

// OA base interest floor.
const OA_RATE = 0.025;

// Stable identity for the "still loading" case — a fresh [] each render would
// invalidate the memos below on every pass.
const EMPTY_YEARS: SimResult["years"] = [];

// Estimated extra interest earned on the OA portion of combined CPF balances.
// The band fills in priority order RA -> OA (OA capped at $20k). Below 55 there
// is no RA, so OA sits first in the +1% band. From 55 the RA fills the +2%/+1%
// tiers FIRST, so a large RA leaves little or no band room for the OA.
function oaExtraInterest(oa: number, age: number, ra = 0): number {
  const oaSlice = Math.min(Math.max(oa, 0), 20000);
  if (age < 55) return 0.01 * oaSlice;
  const t1Room = Math.max(30000 - Math.max(ra, 0), 0);
  const t2Room = Math.max(30000 - Math.max(ra - 30000, 0), 0);
  const inT1 = Math.min(oaSlice, t1Room);
  const inT2 = Math.min(oaSlice - inT1, t2Room);
  return 0.02 * inT1 + 0.01 * inT2;
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
    setWhatIf(Number(id), {
      oa: { topup, startAge: topupAge, capPerYear: OA_TOPUP_CAP },
    });
  }, [id, topup, topupAge]);

  // Hypothetical top-up: clamp to the cap on entry so no path can exceed it.
  const setTopupCapped = (v: number) =>
    setTopup(Math.min(Math.max(v, 0), OA_TOPUP_CAP));

  // CPFIS-OA investment what-if: keep N in the OA, invest everything above it.
  const savedInv = useMemo(() => getWhatIf(Number(id)).oaInvest, [id]);
  const [invKeep, setInvKeep] = useState<number>(() => savedInv?.keepInOa ?? CPFIS_OA_FLOOR);
  const [invAge, setInvAge] = useState<number>(() => savedInv?.startAge ?? 0);
  const [invRate, setInvRate] = useState<number>(() => savedInv?.ratePct ?? 10);
  const [invMonthly, setInvMonthly] = useState<number>(() => savedInv?.monthly ?? 0);
  const [invInflation, setInvInflation] = useState<number>(() => savedInv?.inflationPct ?? 3);
  // Whether the Overview's What-If Scenario applies this investment. Default OFF:
  // the defaults here (keep $20k, 10% return) describe a REAL investment, not a
  // no-op, so merely opening this tab must not silently inflate the Overview
  // total. Editing any investment input opts in automatically.
  const [invEnabled, setInvEnabled] = useState<boolean>(() => savedInv?.enabled ?? false);
  // The card's own timeline — independent of the page-wide "Select year" above.
  const [invViewAge, setInvViewAge] = useState<number | null>(null);

  // Monthly housing mortgage — paid from OA every month from `mortgageAge`,
  // reducing the OA balance/interest shown across the page.
  const [mortgageMth, setMortgageMth] = useState<number>(0);
  const [mortgageAge, setMortgageAge] = useState<number>(0);

  // Persist so the Overview's What-If Scenario reflects this calculator too.
  // The mortgage goes in as well: it decides how much OA is actually left to
  // invest, so the two tabs must drain the OA on the same schedule.
  useEffect(() => {
    setWhatIf(Number(id), {
      oaInvest: {
        keepInOa: invKeep, startAge: invAge, ratePct: invRate,
        monthly: invMonthly, inflationPct: invInflation, enabled: invEnabled,
      },
      oaMortgage: { monthly: mortgageMth, startAge: mortgageAge },
    });
  }, [id, invKeep, invAge, invRate, invMonthly, invInflation, invEnabled, mortgageMth, mortgageAge]);

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
  const extraInterest = yr ? oaExtraInterest(oaBalance, age, yr.closing.RA) : 0;
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

  // ── OA inflows & overflow (mirrors the SA tab's card) ──────────────────────
  // Same overflow_out fields the SA tab reads, so the two cards always agree:
  // what the SA tab shows leaving the SA is exactly what this shows arriving.
  //
  // OA is the END of the cascade. MediSave overflows once it hits the BHS —
  // into the SA while that is still below the FRS, and into the OA once the SA
  // is full. So OA only receives MA money when BOTH caps are reached.
  const maToOaYear = yr?.overflow_out?.ma_to_oa ?? 0;   // MA past BHS, SA past FRS
  const saToOaYear = yr?.overflow_out?.sa_to_oa ?? 0;   // SA past FRS (+ the 55 closure)
  const oaToRaYear = yr?.overflow_out?.oa_to_ra ?? 0;   // age-55 sweep OUT of the OA
  const oaTotalIn = oaAnnualIn + maToOaYear + saToOaYear;
  const oaNetFlow = oaTotalIn - oaToRaYear;
  const upTo = (a: number) => years.filter((y) => y.age <= a);
  const maToOaCumulative = upTo(age).reduce((s, y) => s + (y.overflow_out?.ma_to_oa ?? 0), 0);
  const saToOaCumulative = upTo(age).reduce((s, y) => s + (y.overflow_out?.sa_to_oa ?? 0), 0);
  const hasOaOverflow = maToOaYear > 0 || saToOaYear > 0 || oaToRaYear > 0;
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
  // ── When does the SA/MA overflow actually start? ───────────────────────────
  // Derived from the projection, NOT from a rule of thumb. The intuition
  // "SA hits FRS => SA spills to OA" is wrong below 55: the SA keeps taking
  // mandatory contributions past the FRS. What the FRS really gates is the
  // ROUTING of the MediSave overflow — a full MA skips a full SA and lands in
  // the OA instead — plus the 55+ RA spill. Reading the first non-zero year
  // straight from the engine's own numbers avoids guessing.
  const firstAgeWith = (pick: (y: (typeof years)[number]) => number) =>
    years.find((y) => pick(y) > 0)?.age ?? null;
  const maToOaStart = firstAgeWith((y) => y.overflow_out?.ma_to_oa ?? 0);
  const saToOaStart = firstAgeWith((y) => y.overflow_out?.sa_to_oa ?? 0);
  const bhsAge = res.milestones?.bhs_age ?? null;
  const frsAge = res.milestones?.frs_age ?? null;
  const overflowStart =
    maToOaStart !== null && saToOaStart !== null
      ? Math.min(maToOaStart, saToOaStart)
      : maToOaStart ?? saToOaStart;

  const invMortgage = { monthly: mortgageMth, startAge: mortgageAge };
  const invParams = { keepInOa: invKeep, startAge: invAge, ratePct: invRate, monthly: invMonthly };
  // The voluntary top-up feeds the split too, so topped-up dollars are
  // investable like any other OA dollar.
  const invTopup = { topup, startAge: topupAge, capPerYear: OA_TOPUP_CAP };
  const splitRows = simulateOaSplit(years, invParams, invMortgage, undefined, invTopup);

  // The OA available to split is the year's CLOSING balance from "Start/End
  // Account of the Year" — i.e. AFTER the housing mortgage has taken its cut,
  // and after interest. Reading the raw engine balance instead would offer up
  // money the mortgage has already spent. Rounded to whole dollars: the raw
  // balance carries cents, and deriving one input from the other was pushing
  // that noise into the fields as long decimal tails.
  const oaAtInvAge = Math.round(
    mortgageByAge.get(invAge)?.closing ??
    years.find((y) => y.age >= invAge)?.closing.OA ??
    member.balances.OA,
  );

  // "Initial investment" is the other side of the same split: CPFIS-OA can only
  // be funded from the OA, so investing more means keeping less. Both fields are
  // editable and each derives the other, clamped to the OA actually available —
  // so no entry can invent money.
  const investedAtStart = Math.max(oaAtInvAge - Math.max(Math.round(invKeep), 0), 0);
  // Touching any investment input opts the scenario into the Overview — the
  // user has clearly engaged with it, so they shouldn't have to find a toggle.
  const setKeepInOa = (v: number) => {
    setInvKeep(Math.round(Math.min(Math.max(v, 0), oaAtInvAge)));
    setInvEnabled(true);
  };
  const setInitialInvestment = (v: number) => {
    setInvKeep(Math.round(Math.max(oaAtInvAge - Math.min(Math.max(v, 0), oaAtInvAge), 0)));
    setInvEnabled(true);
  };
  const setRateOfReturn = (v: number) => { setInvRate(v); setInvEnabled(true); };
  const setMonthlyInvest = (v: number) => { setInvMonthly(v); setInvEnabled(true); };

  // Card-local timeline (defaults to the last projected age).
  const invAges = splitRows.map((r) => r.age);
  const viewAge = invViewAge ?? invAges[invAges.length - 1] ?? age;
  const splitSel = splitRows.find((r) => r.age === viewAge) ?? splitRows[splitRows.length - 1] ?? null;
  // Compare TOTAL wealth (OA + RA + invested). From 55 the RA sweep moves OA
  // cash into the RA — comparing the OA alone would read that as a loss.
  const splitGap = splitSel ? splitSel.totalSplit - splitSel.totalOnly : 0;
  const swept = splitSel ? splitSel.raOnly > 0 || splitSel.raSplit > 0 : false;

  // Inflation-adjusted (today's dollars) view of the same two lines.
  const realRows = splitRows.map((r) => ({
    age: r.age,
    realOnly: realValue(r.totalOnly, invInflation, r.age - invAge),
    realSplit: realValue(r.totalSplit, invInflation, r.age - invAge),
  }));
  const realSel = realRows.find((r) => r.age === viewAge) ?? realRows[realRows.length - 1] ?? null;

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
                  {age >= 55 ? "band room left after RA, OA capped $20k" : "+1% on OA (capped $20k)"}
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
        <p className="mt-3 max-w-3xl text-xs text-[var(--color-muted)]">
          Employee + employer contribution flowing to OA this year (from the projection engine).{" "}
          <span className="font-semibold">
            The {sgd(owCeiling)}/mth Ordinary Wage ceiling caps the WAGE, not the contribution
          </span>{" "}
          — CPF is charged as a percentage of the capped wage, so salary above {sgd(owCeiling)}/mth
          attracts no CPF at all and is simply paid to you as cash.
        </p>
      </div>

      {/* 3b-ii. OA inflows & overflow — mirrors the SA tab's card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>OA inflows &amp; overflow (age {age})</h3>

        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Into the OA
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Salary + employer → OA</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(oaAnnualIn)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">age-band allocation</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">MA → OA</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maToOaYear)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">MA past BHS &amp; SA past FRS</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">SA → OA</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(saToOaYear)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">SA past FRS</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">Total in</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(oaTotalIn)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">before interest</p>
          </div>
        </div>

        <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Out of the OA
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">OA → RA (at 55)</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(oaToRaYear)}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {oaToRaYear > 0 ? "SA fell short of the sum" : "SA covered the sum"}
            </p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-xs text-[var(--color-muted)]">Net flow this year</p>
            <p
              className={`mt-0.5 font-semibold tabular-nums ${
                oaNetFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--color-error)]"
              }`}
            >
              {oaNetFlow >= 0 ? "+" : ""}{sgd(oaNetFlow)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">in − out, excluding interest</p>
          </div>
        </div>

        {(maToOaCumulative > 0 || saToOaCumulative > 0) && (
          <div className="mt-4 space-y-1 text-sm">
            {maToOaCumulative > 0 && (
              <p>
                <span className="text-[var(--color-muted)]">MA → OA overflow to date: </span>
                <span className="font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maToOaCumulative)}</span>
                <span className="text-[var(--color-muted)]"> (already inside the OA balance)</span>
              </p>
            )}
            {saToOaCumulative > 0 && (
              <p>
                <span className="text-[var(--color-muted)]">SA → OA overflow to date: </span>
                <span className="font-semibold tabular-nums text-[var(--color-primary)]">{sgd(saToOaCumulative)}</span>
                <span className="text-[var(--color-muted)]"> (already inside the OA balance)</span>
              </p>
            )}
          </div>
        )}

        {!hasOaOverflow && (
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            No overflow into or out of the OA this year — MediSave is still below the BHS, or the SA
            is still below the FRS, so the cascade has not reached the OA yet.
          </p>
        )}

        <p className="mt-4 max-w-3xl text-xs text-[var(--color-muted)]">
          <span className="font-semibold">The OA is the end of the cascade.</span>{" "}
          MediSave overflows once it reaches the BHS — but into the <em>SA</em> while the SA is still
          below the FRS. Only when <em>both</em> caps are full does that money reach the OA. The same
          applies to the SA&apos;s own contributions once it passes the FRS. Overflowed money carries
          the 4% it earned on the way, then compounds at the OA rate (2.5% + extra interest) from
          here. At 55 the RA is formed from the SA first, and the OA is drawn on only if the SA falls
          short of the retirement sum.{" "}
          <span className="font-semibold">
            These are the same figures the SA tab reports leaving the SA
          </span>{" "}
          — one engine, so the two tabs always reconcile.
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
              max={OA_TOPUP_CAP}
              step={1000}
              value={Math.min(topup, OA_TOPUP_CAP)}
              placeholder="0"
              onChange={setTopupCapped}
              className={inputClass}
              aria-label="Yearly OA top-up amount in Singapore dollars"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Capped at {sgd(OA_TOPUP_CAP)}/yr — a top-up limit, unrelated to the {sgd(owCeiling)}
              /month wage ceiling above
            </p>
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

        <p className="mt-3 max-w-3xl text-xs text-[var(--color-muted)]">
          Estimate: starting at the chosen age, each year&apos;s voluntary OA top-up is compounded at
          the 2.5% OA floor rate and added to the projected balance. It also feeds the CPF-OA
          Investment calculator below, so topped-up dollars can be invested like any other OA dollar.{" "}
          <span className="font-semibold">Hypothetical:</span> CPF has no OA-only voluntary top-up.
          The {sgd(OA_TOPUP_CAP)} figure is the RSTU relief cap, and RSTU goes to the SA/RA — the only
          way to put cash into the OA is a Voluntary Contribution across all three accounts, split by
          age band and capped by the CPF Annual Limit. Modelled here as a flat yearly amount for
          scenario work.
        </p>
      </div>

      {/* 8a. When the SA/MA overflow starts feeding the OA */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>When SA / MA overflow starts feeding the OA</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-muted)]">MA reaches BHS</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {bhsAge !== null ? `Age ${bhsAge}` : "Not reached"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">SA reaches FRS</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {frsAge !== null ? `Age ${frsAge}` : "Not reached"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">MA → OA begins</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">
              {maToOaStart !== null ? `Age ${maToOaStart}` : "Never"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">SA → OA begins</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">
              {saToOaStart !== null ? `Age ${saToOaStart}` : "Never"}
            </p>
          </div>
        </div>

        {overflowStart !== null ? (
          <p className="mt-3 text-sm">
            <span className="text-[var(--color-muted)]">Overflow first reaches your OA at </span>
            <span className="font-semibold text-[var(--color-primary)]">age {overflowStart}</span>
            <span className="text-[var(--color-muted)]">
              {" "}— from then on it compounds at 2.5% + extra interest, and is already included in
              every projection on this page.
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            No overflow reaches the OA in this projection — MediSave stays below the BHS, or the SA
            still has room below the FRS.
          </p>
        )}

        <p className="mt-3 max-w-3xl text-xs text-[var(--color-muted)]">
          These ages are read from your own projection rather than assumed.{" "}
          <span className="font-semibold">Worth knowing:</span> the SA reaching the FRS does{" "}
          <em>not</em> by itself push money into the OA before 55 — the SA keeps taking its mandatory
          contributions past the FRS. What the FRS actually gates is the <em>routing</em> of the
          MediSave overflow: once the MA is full at the BHS, its excess goes to the SA while the SA
          still has room, and only lands in the OA once the SA is full too. From 55, the SA/RA slice
          above the retirement sum spills to the OA as well.
        </p>
      </div>

      {/* 8b. Top-up what-if calculator (CPF-OA Investment) */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-1`}>Top-up what-if calculator (CPF-OA Investment)</h3>
        <p className="mb-4 max-w-3xl text-sm text-[var(--color-muted)]">
          Keep an amount in the OA earning the 2.5% floor + extra interest, and invest everything
          above it through CPFIS-OA. Both lines below run through the <em>same</em> projection from
          your start age, so the gap between them is the effect of investing — nothing else. Drag the
          timeline to compare at any age.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="oa-inv-keep" className="mb-1 block text-sm text-[var(--color-muted)]">
              Keep in OA (S$)
            </label>
            <NumberInput
              id="oa-inv-keep"
              min={0}
              max={oaAtInvAge}
              step={1000}
              value={Math.min(Math.round(invKeep), oaAtInvAge)}
              placeholder="0"
              onChange={setKeepInOa}
              className={inputClass}
              aria-label="Amount kept in the OA in Singapore dollars"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              OA at age {invAge}: {sgd(oaAtInvAge)}
              {mortgageMth > 0 && <> (after mortgage)</>}
            </p>
          </div>
          <div>
            <label htmlFor="oa-inv-initial" className="mb-1 block text-sm text-[var(--color-muted)]">
              Initial investment (S$)
            </label>
            <NumberInput
              id="oa-inv-initial"
              min={0}
              max={oaAtInvAge}
              step={1000}
              value={investedAtStart}
              placeholder="0"
              onChange={setInitialInvestment}
              className={inputClass}
              aria-label="Initial amount invested through CPFIS-OA, in Singapore dollars"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Funded from the OA — raising this lowers &ldquo;Keep in OA&rdquo;
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
              onChange={setRateOfReturn}
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
              onChange={setMonthlyInvest}
              className={inputClass}
              aria-label="Monthly amount routed from OA contributions into the investment"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Rerouted from your OA inflow ({sgd(oaAnnualIn / 12)}/mth), added on top of the initial
            </p>
          </div>
          <div>
            <label htmlFor="oa-inv-infl" className="mb-1 block text-sm text-[var(--color-muted)]">
              Inflation (per year) %
            </label>
            <NumberInput
              id="oa-inv-infl"
              min={0}
              max={20}
              step={0.5}
              value={invInflation}
              onChange={setInvInflation}
              className={inputClass}
              aria-label="Assumed annual inflation rate, percent"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Used by the today&apos;s-dollars chart only
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

        {/* Opt-in to the Overview scenario. Off by default — see invEnabled. */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--color-surface-raised)] p-3">
          <input
            type="checkbox"
            checked={invEnabled}
            onChange={(e) => setInvEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
            aria-label="Apply this investment to the Overview What-If Scenario"
          />
          <span className="text-sm">
            <span className="font-semibold">Apply to the Overview What-If Scenario</span>
            <span className="block text-xs text-[var(--color-muted)]">
              {invEnabled
                ? "Included in the Overview total. Untick to keep this card as a preview only."
                : "Off — this card is a preview only and does not change the Overview total. Editing any field above turns it on."}
            </span>
          </span>
        </label>

        {/* Drag timeline — this card's own age selector */}
        {invAges.length > 1 && (
          <div className="mt-5">
            <p className={`${labelClass} mb-2`}>Drag to compare at any age</p>
            <YearScrubber ages={invAges} value={viewAge} onChange={setInvViewAge} />
          </div>
        )}

        {/* Side-by-side result at the selected year */}
        {splitSel && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-x-6 gap-y-4 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3"
          >
            <div>
              <p className="text-xs text-[var(--color-muted)]">No investing — total (age {viewAge})</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{sgd(splitSel.totalOnly)}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                OA {sgd(splitSel.oaOnly)}
                {swept && <> + RA {sgd(splitSel.raOnly)}</>}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Keep in OA + CPFIS-OA — total (age {viewAge})</p>
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

        {/* Inflation-adjusted view — same two lines, in today's dollars */}
        {realRows.length > 1 && invInflation > 0 && (
          <>
            <div className="mt-6 border-t border-[var(--color-border)] pt-4">
              <h4 className="text-sm font-semibold">
                In today&apos;s dollars — after {invInflation}% inflation
              </h4>
              <p className="mt-1 max-w-3xl text-sm text-[var(--color-muted)]">
                The same two lines, deflated to what they would actually <em>buy</em> today. This is
                the number that matters: the OA floor of 2.5% is close to typical inflation, so
                uninvested savings barely hold their purchasing power.
              </p>
            </div>

            {realSel && (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 grid gap-x-6 gap-y-4 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-3"
              >
                <div>
                  <p className="text-xs text-[var(--color-muted)]">No investing — real (age {viewAge})</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{sgd(realSel.realOnly)}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    nominal {sgd(splitSel?.totalOnly ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Keep in OA + CPFIS-OA — real (age {viewAge})</p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--color-primary)]">
                    {sgd(realSel.realSplit)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    nominal {sgd(splitSel?.totalSplit ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Real difference</p>
                  <p
                    className={`mt-0.5 text-xl font-bold tabular-nums ${
                      realSel.realSplit - realSel.realOnly >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-[var(--color-error)]"
                    }`}
                  >
                    {realSel.realSplit - realSel.realOnly >= 0 ? "+" : ""}
                    {sgd(realSel.realSplit - realSel.realOnly)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">purchasing power gained</p>
                </div>
              </div>
            )}

            <div
              role="img"
              aria-label="Inflation-adjusted comparison in today's dollars: no investing versus keeping an amount in the OA and investing the rest"
              className="mt-4 h-72"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={realRows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                      name === "realOnly" ? "No investing (real)" : "Keep in OA + CPFIS-OA (real)",
                    ]}
                    labelFormatter={(a) => `Age ${a} — today's dollars`}
                    contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend
                    formatter={(v) =>
                      v === "realOnly" ? "No investing (real)" : "Keep in OA + CPFIS-OA (real)"
                    }
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <ReferenceLine
                    x={55}
                    stroke="var(--color-muted)"
                    strokeDasharray="4 4"
                    label={{ value: "55", position: "top", fontSize: 10, fill: "var(--color-muted)" }}
                  />
                  <Line isAnimationActive={false} type="monotone" dataKey="realOnly" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="realSplit" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        <p className="mt-3 max-w-3xl text-xs text-[var(--color-muted)]">
          <span className="font-semibold">How this is calculated.</span>{" "}
          From your start age the OA splits in two: the amount you keep earns 2.5% plus the extra
          interest (+1% on its first $20k below 55, +2% from 55) and receives your salary + employer
          OA contributions, <em>any overflow</em> — once MediSave fills to the BHS its excess
          cascades to the SA, then to the OA, carrying its 4% interest with it — <em>and</em> your
          voluntary OA top-up from the calculator above, so topped-up dollars are investable like any
          other OA dollar. Everything above the amount you keep compounds at your assumed return. The
          &ldquo;no investing&rdquo; line is the identical projection with no split, so the gap is
          purely the investing.{" "}
          <span className="font-semibold">Money is conserved</span> — CPFIS-OA can only be funded
          from the OA, so the monthly amount is <em>rerouted</em> from your OA inflow (capped at it),
          never added as new cash.{" "}
          <span className="font-semibold">At 55</span> the RA forms: the SA fills it up to the
          retirement sum and any SA left over spills into the OA; the OA is drawn on only if the SA
          falls short. Both lines show <em>totals including the RA</em>, so nothing vanishes at 55 —
          and because CPFIS-OA holdings are <em>not</em> liquidated at 55, invested money stays
          outside the RA. The RA then compounds at 4% + extra interest (+2% on its first $30k, +1% on
          the next $30k).{" "}
          <span className="font-semibold">Initial investment</span> is the other side of the split,
          not extra cash: CPFIS-OA can only be funded from the OA, so raising it lowers what you
          keep. The monthly amount is then added on top of it each year.{" "}
          <span className="font-semibold">Today&apos;s dollars</span> divides each year by
          (1&nbsp;+&nbsp;inflation)<sup>years</sup> — it shows what the balance would actually buy,
          which is the figure that matters when the OA floor (2.5%) sits close to inflation itself.{" "}
          <span className="font-semibold">The housing mortgage is included.</span>{" "}
          &ldquo;Keep in OA&rdquo; is measured against the year&apos;s closing balance from
          <em> Start/End Account of the Year</em> above — the OA <em>after</em> the mortgage has
          taken its cut and interest has been credited — so the scenario never offers up money the
          mortgage has already spent. The mortgage then keeps draining the OA in <em>both</em> lines,
          since it is a housing cost rather than an investment decision and must not tilt the
          comparison.{" "}
          <span className="font-semibold">Not enforced:</span> the real $20,000 CPFIS floor — this is
          a hypothetical scenario.
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
