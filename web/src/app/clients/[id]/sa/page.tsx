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
import { PageHeading, SavingsIcon, RocketIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";
import { sgd } from "@/lib/format";
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

  // Top-up what-if (yearly) — computed client-side
  const [topup, setTopup] = useState<number>(0);
  const [topupAge, setTopupAge] = useState<number>(0);
  // One-time OA -> SA transfer (irreversible; capped at FRS; earns 4% vs OA 2.5%)
  const [transferAmt, setTransferAmt] = useState<number>(0);
  const [transferAge, setTransferAge] = useState<number>(0);
  const [wiData, setWiData] = useState<
    { age: number; baseline: number; withTopup: number; frsLine: number }[] | null
  >(null);

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
          setTopupAge(simRun.result.years[0].age);
          setTransferAge(simRun.result.years[0].age);
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

  // Baseline FRS-hit age (against that year's projected FRS)
  const baseFrsAge = years.find((y) => retBal(y) >= proj(frs, y.year))?.age ?? null;

  // What-if derived (yearly top-up estimate)
  const wiFrsAge = wiData ? (wiData.find((d) => d.withTopup >= d.frsLine)?.age ?? null) : null;
  const wiFinalBal = wiData ? wiData[wiData.length - 1].withTopup : null;
  const baseFinalBal =
    years.length > 0 ? retBal(years[years.length - 1]) : null;

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
  function runWhatIf() {
    const data = years.map((y) => {
      const k = y.age - topupAge + 1; // yearly top-ups made by this age
      const fv = topup > 0 && k > 0 ? topup * (((1 + SA_RATE) ** k - 1) / SA_RATE) : 0;
      // One-time OA -> SA transfer: a lump that compounds at the SA rate from
      // the transfer age onward (it would have earned only 2.5% left in OA).
      const tk = y.age - transferAge; // years since the transfer
      const transferFv =
        transferAmt > 0 && tk >= 0 ? transferAmt * (1 + SA_RATE) ** tk : 0;
      return {
        age: y.age,
        baseline: retBal(y),
        withTopup: retBal(y) + fv + transferFv,
        frsLine: Math.round(proj(frs, y.year)),
      };
    });
    setWiData(data);
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
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="sa-topup"
              className="mb-1 block text-sm text-[var(--color-muted)]"
            >
              Yearly SA top-up (S$)
            </label>
            <input
              id="sa-topup"
              type="number"
              min={0}
              step={1000}
              value={topup || ""}
              placeholder="0"
              onChange={(e) => setTopup(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Yearly SA top-up amount in Singapore dollars"
            />
          </div>
          <div>
            <label
              htmlFor="sa-topup-age"
              className="mb-1 block text-sm text-[var(--color-muted)]"
            >
              Start at age
            </label>
            <input
              id="sa-topup-age"
              type="number"
              min={0}
              max={120}
              step={1}
              value={topupAge}
              onChange={(e) => setTopupAge(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Age at which yearly top-ups begin"
            />
          </div>
          <div className="hidden sm:block" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sa-transfer" className="mb-1 block text-sm text-[var(--color-muted)]">
              OA → SA transfer (S$)
            </label>
            <input
              id="sa-transfer"
              type="number"
              min={0}
              step={1000}
              value={transferAmt || ""}
              placeholder="0"
              onChange={(e) => setTransferAmt(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="One-time OA to SA transfer amount in Singapore dollars"
            />
          </div>
          <div>
            <label htmlFor="sa-transfer-age" className="mb-1 block text-sm text-[var(--color-muted)]">
              Transfer at age
            </label>
            <input
              id="sa-transfer-age"
              type="number"
              min={0}
              max={120}
              step={1}
              value={transferAge}
              onChange={(e) => setTransferAge(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              aria-label="Age at which the OA to SA transfer is made"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={runWhatIf}
              className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
              aria-label="Recalculate with top-up and transfer"
            >
              Recalculate
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs text-[var(--color-muted)]">
          OA → SA transfers are irreversible and capped at the FRS, but the moved
          funds earn 4% in SA instead of 2.5% in OA.
        </p>

        {wiData && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 grid gap-3 rounded-xl bg-[var(--color-surface-raised)] p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {/* FRS hit age — baseline */}
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                FRS hit age (baseline)
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {baseFrsAge !== null ? `Age ${baseFrsAge}` : "Not reached"}
              </p>
            </div>

            {/* FRS hit age — with top-up */}
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                FRS hit age (with changes)
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {wiFrsAge !== null ? `Age ${wiFrsAge}` : "Not reached"}
              </p>
              {baseFrsAge !== null && wiFrsAge !== null && wiFrsAge < baseFrsAge && (
                <p className="text-xs text-[var(--color-primary)]">
                  {baseFrsAge - wiFrsAge} yr{baseFrsAge - wiFrsAge > 1 ? "s" : ""} earlier
                </p>
              )}
            </div>

            {/* Final retirement balance — baseline */}
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                Final balance (baseline)
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">
                {sgd(baseFinalBal)}
              </p>
            </div>

            {/* Final retirement balance — with top-up */}
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                Final balance (with changes)
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--color-primary)]">
                {sgd(wiFinalBal)}
              </p>
              {baseFinalBal !== null && wiFinalBal !== null && (
                <p className="text-xs text-[var(--color-primary)]">
                  +{sgd(wiFinalBal - baseFinalBal)} delta
                </p>
              )}
            </div>
          </div>
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
                    name === "baseline" ? "Baseline" : name === "withTopup" ? "With top-up & transfer" : "FRS",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : v === "withTopup" ? "With top-up & transfer" : "FRS (projected)")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="withTopup" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="frsLine" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
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
