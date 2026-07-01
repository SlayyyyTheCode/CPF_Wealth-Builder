"use client";
import { memo, use, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { simulate, getMember, getActivePolicy, peekMember, peekSim } from "@/lib/api";
import type { SimResult, YearRow, Member } from "@/lib/types";
import { YearScrubber } from "@/components/year-scrubber";
import { NumberInput } from "@/components/number-input";
import { PageHeading, SavingsIcon, RocketIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";
import { setWhatIf } from "@/lib/whatif";
import { extraInterestByAccount } from "@/lib/extra-interest";

// retirement-account opening balance for a year (RA post-55, else SA).
function retBalOpening(yr: YearRow): number {
  const ra = yr.opening?.RA ?? 0;
  return ra > 0 ? ra : yr.opening?.SA ?? 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function retBal(yr: YearRow): number {
  return yr.closing.RA > 0 ? yr.closing.RA : yr.closing.SA;
}

function retInt(yr: YearRow): number {
  return (yr.interest_by_account?.SA ?? 0) + (yr.interest_by_account?.RA ?? 0);
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function SaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [res, setRes] = useState<SimResult | null>(() => peekSim(Number(id))?.result ?? null);
  const [member, setMember] = useState<Member | null>(() => peekMember(Number(id)));
  const [frs, setFrs] = useState<number>(0);   // base (today's) FRS
  const [ers, setErs] = useState<number>(0);   // base (today's) ERS
  const [sumRate, setSumRate] = useState<number>(0.035);
  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear());
  const [owCeiling, setOwCeiling] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  // Scrubber — seed from warm cache so the page paints fully on tab switch.
  const [age, setAge] = useState<number | null>(() => peekSim(Number(id))?.result.years[0]?.age ?? null);

  // Top-up what-if (yearly) — computed client-side. Both the SA top-up and the
  // OA→SA transfer are applied every year from `startAge` for `yearsApplied`
  // years, and stop automatically once the FRS is reached.
  const [topup, setTopup] = useState<number>(0);
  const [transferAmt, setTransferAmt] = useState<number>(0);
  const [startAge, setStartAge] = useState<number>(0);
  const [yearsApplied, setYearsApplied] = useState<number>(40);

  // Persist SA what-if params so the Overview can combine all accounts.
  useEffect(() => {
    setWhatIf(Number(id), { sa: { topup, transfer: transferAmt, startAge, years: yearsApplied } });
  }, [id, topup, transferAmt, startAge, yearsApplied]);
  const [wiData, setWiData] = useState<
    {
      age: number; baseline: number; withTopup: number;
      opening: number; interest: number; frsLine: number; ersLine: number;
    }[] | null
  >(null);
  const [wiAge, setWiAge] = useState<number>(0); // scenario scrubber

  useEffect(() => {
    let ok = true;
    const numId = Number(id);
    Promise.all([
      simulate(numId, 91),
      getMember(numId),
      getActivePolicy(new Date().getFullYear()),
    ])
      .then(([simRun, m, policy]) => {
        if (!ok) return;
        setRes(simRun.result);
        setMember(m);
        setFrs(Number(policy.frs) || 0);
        setErs(Number(policy.ers) || 0);
        const growth = (policy.assumptions as { growth?: { sum_rate?: number } } | undefined)?.growth;
        setSumRate(Number(growth?.sum_rate ?? 0.035));
        setBaseYear(Number(policy.effective_year) || new Date().getFullYear());
        setOwCeiling(Number(policy.ordinary_wage_ceiling) || 0);
        if (simRun.result.years.length > 0) {
          setAge(simRun.result.years[0].age);
          setStartAge(simRun.result.years[0].age);
        }
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => {
      ok = false;
    };
  }, [id]);

  // ── loading / error ────────────────────────────────────────────────────────

  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  if (!res || !member || age === null)
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" />
        <div className="h-12 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
      </div>
    );

  // ── derived ────────────────────────────────────────────────────────────────

  const years = res.years;
  const ages = years.map((y) => y.age);
  const yr = years.find((y) => y.age === age);

  // FRS/ERS rise each year (~sum_rate). Project from the base-year value, like BHS.
  const proj = (base: number, year: number) =>
    base * Math.pow(1 + sumRate, Math.max(year - baseYear, 0));

  const curRetBal = yr ? retBal(yr) : 0;
  const openRetBal = yr ? retBalOpening(yr) : 0;
  const curRetInt = yr ? retInt(yr) : 0;
  // Est. extra interest on the retirement account (SA pre-55, RA post-55).
  const extra = yr ? extraInterestByAccount(yr.closing, age) : { OA: 0, SA: 0, MA: 0, RA: 0 };
  const saExtra = extra.SA + extra.RA;
  // SA/RA contribution from wage this year (engine figure).
  const saAnnualIn = (yr?.contribution_by_account?.SA ?? 0) + (yr?.contribution_by_account?.RA ?? 0);
  const saMonthlyIn = saAnnualIn / 12;
  const cappedWage = Math.min(member.monthly_gross_wage, owCeiling > 0 ? owCeiling : member.monthly_gross_wage);
  const combined = yr ? yr.closing.OA + yr.closing.SA + yr.closing.MA + yr.closing.RA : 0;
  const selYear = yr?.year ?? baseYear;
  const frsTarget = proj(frs, selYear);
  const ersTarget = proj(ers, selYear);
  const neededFrs = Math.max(frsTarget - curRetBal, 0);
  const neededErs = Math.max(ersTarget - curRetBal, 0);

  const saToOa = yr?.overflow_out?.sa_to_oa ?? 0;
  const saToRa = yr?.overflow_out?.sa_to_ra ?? 0;
  // MA overflows INTO the SA once the BHS is reached (pre-55). This inflow is
  // already part of the SA balance the projection reports.
  const maToSaYear = yr?.overflow_out?.ma_to_sa ?? 0;
  const hasOverflow = saToOa > 0 || saToRa > 0;
  // Cumulative MA→SA overflow up to & including the selected year.
  const maToSaCumulative = years
    .filter((y) => y.age <= age)
    .reduce((s, y) => s + (y.overflow_out?.ma_to_sa ?? 0), 0);

  // Baseline FRS/ERS-hit ages (against that year's projected sum)
  const baseFrsAge = years.find((y) => retBal(y) >= proj(frs, y.year))?.age ?? null;
  const baseErsAge = years.find((y) => retBal(y) >= proj(ers, y.year))?.age ?? null;

  // What-if scenario: hit ages + the KPI set for the selected scenario year.
  const wiFrsAge = wiData ? (wiData.find((d) => d.withTopup >= d.frsLine)?.age ?? null) : null;
  const wiErsAge = wiData ? (wiData.find((d) => d.withTopup >= d.ersLine)?.age ?? null) : null;
  const wiFinalBal = wiData ? wiData[wiData.length - 1].withTopup : null;
  const baseFinalBal = years.length > 0 ? retBal(years[years.length - 1]) : null;

  const wiAges = wiData ? wiData.map((d) => d.age) : [];
  const wiSel = wiData ? wiData.find((d) => d.age === wiAge) ?? null : null;
  const wiYr = wiData ? years.find((y) => y.age === wiAge) ?? null : null;
  // Scenario extra-interest: put the scenario balance into SA (pre-55) or RA.
  const wiExtra = (() => {
    if (!wiSel || !wiYr) return 0;
    const closing = { ...wiYr.closing, ...(wiAge >= 55 ? { RA: wiSel.withTopup } : { SA: wiSel.withTopup }) };
    const e = extraInterestByAccount(closing, wiAge);
    return e.SA + e.RA;
  })();
  const wiNeededFrs = wiSel ? Math.max(0, wiSel.frsLine - wiSel.withTopup) : 0;
  const wiNeededErs = wiSel ? Math.max(0, wiSel.ersLine - wiSel.withTopup) : 0;

  // ── styles ─────────────────────────────────────────────────────────────────

  const cardClass =
    "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";
  const labelClass =
    "text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]";
  const kpiClass = "mt-1 text-2xl font-bold tabular-nums";
  const inputClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm w-full";

  // ── handlers ───────────────────────────────────────────────────────────────

  // Yearly SA top-up, compounded at the SA floor rate (~4%/yr). Each year adds
  // `topup`; value after k years = topup * (((1+r)^k - 1)/r). Estimate layered
  // on the baseline projection.
  const SA_RATE = 0.04;
  // Iterate the extra SA/RA pot year by year. Both the yearly top-up and the
  // yearly OA→SA transfer are added every year inside the [startAge, startAge +
  // yearsApplied) window, and STOP once the scenario balance reaches the FRS
  // (no top-ups/transfers are allowed past the FRS). The pot compounds at ~4%.
  function runWhatIf() {
    let extraEndPrev = 0;
    let stopped = false;
    const data = years.map((y) => {
      const extraStart = extraEndPrev;
      let extraEnd = extraStart * (1 + SA_RATE);
      const withinWindow = y.age >= startAge && y.age < startAge + yearsApplied;
      if (withinWindow && !stopped) extraEnd += topup + transferAmt;
      const closing = retBal(y) + extraEnd;
      const frsLine = Math.round(proj(frs, y.year));
      if (closing >= frsLine) stopped = true; // reached FRS — stop adding
      extraEndPrev = extraEnd;
      return {
        age: y.age,
        baseline: retBal(y),
        withTopup: closing,
        opening: retBalOpening(y) + extraStart,
        interest: retInt(y) + SA_RATE * extraStart,
        frsLine,
        ersLine: Math.round(proj(ers, y.year)),
      };
    });
    setWiData(data);
    setWiAge(data[0]?.age ?? 0);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* 1. Heading */}
      <PageHeading
        icon={<SavingsIcon className="h-7 w-7" />}
        title="Special Account (SA)"
        subtitle="Progress to FRS/ERS, SA/RA interest and overflow, plus a top-up what-if."
      />

      {/* 2. Year scrubber */}
      <div className={`${cardClass} mb-4`}>
        <p className={`${labelClass} mb-3`}>Select year</p>
        <YearScrubber ages={ages} value={age} onChange={setAge} />
      </div>

      {/* 3. Per-year KPIs — two grouped boxes */}
      {yr && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {/* Start / end of year */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Start/End Account of the Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">Current SA</p>
                <p className={kpiClass}>{sgd(openRetBal)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  start of year · {yr.closing.RA > 0 ? "RA (post-55)" : "SA (pre-55)"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">End of the year SA balance</p>
                <p className={`${kpiClass} text-[var(--color-primary)]`}>{sgd(curRetBal)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">closing balance</p>
              </div>
            </div>
          </div>
          {/* Interest earned */}
          <div className={cardClass}>
            <p className={`${labelClass} mb-3`}>Interest earned of this Year</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">SA interest earned</p>
                <p className={kpiClass}>{sgd(curRetInt)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">base 4% + extra</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">Est. extra interest</p>
                <p className={kpiClass}>{sgd(saExtra)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {age >= 55 ? "+2%/+1% on first $60k band" : "+1% on first $60k band"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3a. Retirement-sum targets */}
      {yr && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className={labelClass}>FRS target for Year {selYear}</p>
            <p className={kpiClass}>{sgd(frsTarget)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Full Retirement Sum (today {sgd(frs)})</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>ERS target for Year {selYear}</p>
            <p className={kpiClass}>{sgd(ersTarget)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Enhanced Retirement Sum (today {sgd(ers)})</p>
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit FRS</p>
            {neededFrs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">FRS reached</p>
            ) : (
              <p className={kpiClass}>{sgd(neededFrs)}</p>
            )}
          </div>
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit ERS</p>
            {neededErs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">ERS reached</p>
            ) : (
              <p className={kpiClass}>{sgd(neededErs)}</p>
            )}
          </div>
        </div>
      )}

      {/* 3b. SA contribution from wage */}
      {yr && (
        <div className={`${cardClass} mb-4`}>
          <h3 className={`${labelClass} mb-3`}>SA contribution from salary (age {age})</h3>
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
              <p className="text-xs text-[var(--color-muted)]">Into SA/RA / mth</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(saMonthlyIn)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Into SA/RA / yr</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(saAnnualIn)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Employee + employer contribution flowing to the SA (or RA from 55) this year, on wage
            capped at the Ordinary Wage ceiling ({sgd(owCeiling)}/mth).
          </p>
        </div>
      )}

      {/* 3c. Combined CPF balance */}
      {yr && (
        <div className={`${cardClass} mb-4`}>
          <p className={labelClass}>Combined CPF balance</p>
          <p className={kpiClass}>{sgd(combined)}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">OA + SA + MA + RA (age {age})</p>
        </div>
      )}

      {/* 4. SA inflow/overflow card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>SA inflows &amp; overflow (age {age})</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--color-muted)]">MA → SA (BHS overflow)</p>
            <p className="mt-0.5 font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maToSaYear)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">SA → OA</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(saToOa)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-muted)]">SA → RA</p>
            <p className="mt-0.5 font-semibold tabular-nums">{sgd(saToRa)}</p>
          </div>
        </div>
        {maToSaCumulative > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-[var(--color-muted)]">MA → SA overflow to date: </span>
            <span className="font-semibold tabular-nums text-[var(--color-primary)]">{sgd(maToSaCumulative)}</span>
            <span className="text-[var(--color-muted)]"> (already inside the SA balance)</span>
          </p>
        )}
        {!hasOverflow && maToSaYear === 0 && (
          <p className="mt-3 text-sm text-[var(--color-muted)]">No SA inflow or overflow this year.</p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Once MediSave reaches the Basic Healthcare Sum (BHS), the excess overflows into the SA
          (before 55) and compounds at the SA rate. At 55, amounts above your retirement sum move
          from SA to OA; SA contributions also overflow to OA once FRS is reached. If your SA + OA
          can&apos;t meet the FRS at 55, up to $5,000 stays withdrawable in your OA.
        </p>
      </div>

      {/* 5. Compounding note */}
      <div
        className={`${cardClass} mb-4 flex items-start gap-3 bg-[var(--color-primary)]/10`}
        role="note"
      >
        <RocketIcon className="mt-0.5 h-8 w-8 shrink-0" />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Compounding works in your favour even after FRS.</span>{" "}
          After you hit the FRS, no further top-ups are allowed — but your
          Special / Retirement Account keeps earning compound interest each year,
          so the balance continues to grow.
        </p>
      </div>

      {/* 6. SA growth chart (memoised — unaffected by scrubber / calculator state) */}
      <SaBalanceChart years={years} frs={frs} ers={ers} sumRate={sumRate} baseYear={baseYear} cardClass={cardClass} labelClass={labelClass} />

      {/* 7. Top-up what-if calculator */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-4`}>Top-up what-if calculator</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="sa-topup" className="mb-1 block text-sm text-[var(--color-muted)]">
              Yearly SA top-up (S$)
            </label>
            <NumberInput
              id="sa-topup"
              min={0}
              step={1000}
              value={topup}
              placeholder="0"
              onChange={setTopup}
              className={inputClass}
              aria-label="Yearly SA top-up amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="sa-transfer" className="mb-1 block text-sm text-[var(--color-muted)]">
              Yearly OA → SA transfer (S$)
            </label>
            <NumberInput
              id="sa-transfer"
              min={0}
              step={1000}
              value={transferAmt}
              placeholder="0"
              onChange={setTransferAmt}
              className={inputClass}
              aria-label="Yearly OA to SA transfer amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="sa-start-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Start at age
            </label>
            <NumberInput
              id="sa-start-age"
              min={0}
              max={120}
              step={1}
              value={startAge}
              onChange={setStartAge}
              className={inputClass}
              aria-label="Age at which top-ups and transfers begin"
            />
          </div>
          <div>
            <label htmlFor="sa-years" className="mb-1 block text-sm text-[var(--color-muted)]">
              Years applied
            </label>
            <NumberInput
              id="sa-years"
              min={1}
              max={80}
              step={1}
              value={yearsApplied}
              onChange={setYearsApplied}
              className={inputClass}
              aria-label="How many years the top-up and transfer are applied"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={runWhatIf}
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
            aria-label="Recalculate with top-up and transfer"
          >
            Recalculate
          </button>
          <p className="text-xs text-[var(--color-muted)]">
            Both amounts are applied every year for the chosen span and stop
            automatically once the SA hits the FRS. Set a large &quot;years
            applied&quot; to model contributing continuously until FRS.
          </p>
        </div>

        {wiData && (
          <>
            {/* Headline: when FRS/ERS are hit under the scenario vs baseline */}
            <div className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--color-muted)]">FRS hit age</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                  {wiFrsAge !== null ? `Age ${wiFrsAge}` : "Not reached"}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  baseline {baseFrsAge !== null ? `age ${baseFrsAge}` : "—"}
                  {baseFrsAge !== null && wiFrsAge !== null && wiFrsAge < baseFrsAge
                    ? ` · ${baseFrsAge - wiFrsAge} yr earlier` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">ERS hit age</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                  {wiErsAge !== null ? `Age ${wiErsAge}` : "Not reached"}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  baseline {baseErsAge !== null ? `age ${baseErsAge}` : "—"}
                  {baseErsAge !== null && wiErsAge !== null && wiErsAge < baseErsAge
                    ? ` · ${baseErsAge - wiErsAge} yr earlier` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">Final balance</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                  {sgd(wiFinalBal)}
                </p>
                {baseFinalBal !== null && wiFinalBal !== null && (
                  <p className="text-xs text-[var(--color-muted)]">+{sgd(wiFinalBal - baseFinalBal)} vs baseline</p>
                )}
              </div>
            </div>

            {/* Scenario year scrubber */}
            <div className="mt-4">
              <p className={`${labelClass} mb-2`}>Scenario year</p>
              <YearScrubber ages={wiAges} value={wiAge} onChange={setWiAge} />
            </div>

            {/* Scenario KPI boxes for the selected year */}
            {wiSel && wiYr && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className={cardClass}>
                  <p className={`${labelClass} mb-3`}>Start/End Account of the Year</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Current (scenario)</p>
                      <p className={kpiClass}>{sgd(wiSel.opening)}</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">start of year</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">End of year (scenario)</p>
                      <p className={`${kpiClass} text-[var(--color-primary)]`}>{sgd(wiSel.withTopup)}</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">closing balance</p>
                    </div>
                  </div>
                </div>
                <div className={cardClass}>
                  <p className={`${labelClass} mb-3`}>Interest earned of this Year</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">SA interest earned</p>
                      <p className={kpiClass}>{sgd(wiSel.interest)}</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">base 4% + extra</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Est. extra interest</p>
                      <p className={kpiClass}>{sgd(wiExtra)}</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        {wiAge >= 55 ? "+2%/+1% on first $60k band" : "+1% on first $60k band"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className={cardClass}>
                  <p className={`${labelClass} mb-3`}>Retirement-sum targets (Year {wiYr.year})</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">FRS target for Year {wiYr.year}</p>
                      <p className={kpiClass}>{sgd(wiSel.frsLine)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">ERS target for Year {wiYr.year}</p>
                      <p className={kpiClass}>{sgd(wiSel.ersLine)}</p>
                    </div>
                  </div>
                </div>
                <div className={cardClass}>
                  <p className={`${labelClass} mb-3`}>Still needed (scenario)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Needed to hit FRS</p>
                      <p className={`${kpiClass} ${wiNeededFrs === 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {wiNeededFrs === 0 ? "Reached ✓" : sgd(wiNeededFrs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-muted)]">Needed to hit ERS</p>
                      <p className={`${kpiClass} ${wiNeededErs === 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {wiNeededErs === 0 ? "Reached ✓" : sgd(wiNeededErs)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {wiData && (
          <div
            role="img"
            aria-label="Projected SA/RA balance: baseline versus with top-up and OA-SA transfer"
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
                    name === "baseline" ? "Baseline"
                      : name === "withTopup" ? "With top-up & transfer"
                      : name === "ersLine" ? "ERS" : "FRS",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : v === "withTopup" ? "With top-up & transfer" : v === "ersLine" ? "ERS (projected)" : "FRS (projected)")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="withTopup" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="frsLine" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="ersLine" stroke="var(--chart-4)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Estimate: the baseline already includes the MA → SA overflow after the BHS is reached. On top of that, starting at the chosen age, each year&apos;s top-up is compounded at the ~4% SA floor rate. Top-ups are only allowed until the FRS is reached.
        </p>
      </div>
    </>
  );
}

// Memoised SA/RA balance chart — re-renders only when its data changes, so the
// year scrubber and calculator inputs no longer trigger a chart re-render.
const LABELS: Record<string, string> = {
  balance: "SA / RA balance",
  frs: "Full Retirement Sum",
  ers: "Enhanced Retirement Sum",
};
const SaBalanceChart = memo(function SaBalanceChart({
  years, frs, ers, sumRate, baseYear, cardClass, labelClass,
}: {
  years: YearRow[]; frs: number; ers: number; sumRate: number; baseYear: number;
  cardClass: string; labelClass: string;
}) {
  const data = useMemo(
    () => years.map((y) => ({
      age: y.age,
      balance: retBal(y),
      frs: Math.round(frs * (1 + sumRate) ** Math.max(y.year - baseYear, 0)),
      ers: Math.round(ers * (1 + sumRate) ** Math.max(y.year - baseYear, 0)),
    })),
    [years, frs, ers, sumRate, baseYear],
  );
  return (
    <div role="img" aria-label="SA/RA balance versus FRS and ERS reference lines by age" className={`${cardClass} mb-4`}>
      <h3 className={`${labelClass} mb-3`}>SA / RA balance over time</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} label={{ value: "Age", position: "insideBottom", offset: -2, fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={56} />
            <Tooltip formatter={(value, name) => [sgd(typeof value === "number" ? value : null), LABELS[String(name)] ?? String(name)]} labelFormatter={(a) => `Age ${a}`} contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }} />
            <Legend formatter={(value) => LABELS[value] ?? value} wrapperStyle={{ fontSize: "12px" }} />
            <Line isAnimationActive={false} type="monotone" dataKey="balance" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} name="balance" />
            <Line isAnimationActive={false} type="monotone" dataKey="frs" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="frs" />
            <Line isAnimationActive={false} type="monotone" dataKey="ers" stroke="var(--chart-4)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="ers" />
            <ReferenceLine x={55} stroke="var(--color-primary)" strokeOpacity={0.35} strokeDasharray="4 2" label={{ value: "55", fontSize: 10, fill: "var(--color-muted)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
