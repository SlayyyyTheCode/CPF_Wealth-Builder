"use client";
import { use, useEffect, useState } from "react";
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
import { simulate, getMember, getActivePolicy } from "@/lib/api";
import type { SimResult, YearRow, Member } from "@/lib/types";
import { YearScrubber } from "@/components/year-scrubber";
import { PageHeading, SavingsIcon, RocketIcon } from "@/components/icons";
import { sgd } from "@/lib/format";

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

  const [res, setRes] = useState<SimResult | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [frs, setFrs] = useState<number>(0);   // base (today's) FRS
  const [ers, setErs] = useState<number>(0);   // base (today's) ERS
  const [sumRate, setSumRate] = useState<number>(0.035);
  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear());
  const [err, setErr] = useState<string | null>(null);

  // Scrubber
  const [age, setAge] = useState<number | null>(null);

  // Top-up what-if (yearly) — computed client-side
  const [topup, setTopup] = useState<number>(0);
  const [topupAge, setTopupAge] = useState<number>(0);
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
        if (simRun.result.years.length > 0) {
          setAge(simRun.result.years[0].age);
          setTopupAge(simRun.result.years[0].age);
        }
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => {
      ok = false;
    };
  }, [id]);

  // ── loading / error ────────────────────────────────────────────────────────

  if (err)
    return (
      <p role="alert" className="text-[var(--color-error)]">
        Could not load: {err}
      </p>
    );

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
  const curRetInt = yr ? retInt(yr) : 0;
  const selYear = yr?.year ?? baseYear;
  const frsTarget = proj(frs, selYear);
  const ersTarget = proj(ers, selYear);
  const neededFrs = Math.max(frsTarget - curRetBal, 0);
  const neededErs = Math.max(ersTarget - curRetBal, 0);

  const saToOa = yr?.overflow_out?.sa_to_oa ?? 0;
  const saToRa = yr?.overflow_out?.sa_to_ra ?? 0;
  const hasOverflow = saToOa > 0 || saToRa > 0;

  // Chart series — FRS/ERS projected per year
  const chartData = years.map((y) => ({
    age: y.age,
    balance: retBal(y),
    frs: Math.round(proj(frs, y.year)),
    ers: Math.round(proj(ers, y.year)),
  }));

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
      return {
        age: y.age,
        baseline: retBal(y),
        withTopup: retBal(y) + fv,
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

      {/* 3. KPI grid */}
      {yr && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* SA / retirement balance */}
          <div className={cardClass}>
            <p className={labelClass}>SA / retirement balance</p>
            <p className={kpiClass}>{sgd(curRetBal)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {yr.closing.RA > 0 ? "RA (post-55)" : "SA (pre-55)"}
            </p>
          </div>

          {/* FRS target — projected to the selected year */}
          <div className={cardClass}>
            <p className={labelClass}>FRS target for Year {selYear}</p>
            <p className={kpiClass}>{sgd(frsTarget)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Full Retirement Sum (today {sgd(frs)})
            </p>
          </div>

          {/* ERS target — projected to the selected year */}
          <div className={cardClass}>
            <p className={labelClass}>ERS target for Year {selYear}</p>
            <p className={kpiClass}>{sgd(ersTarget)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Enhanced Retirement Sum (today {sgd(ers)})
            </p>
          </div>

          {/* SA/RA interest earned */}
          <div className={cardClass}>
            <p className={labelClass}>SA / RA interest earned</p>
            <p className={kpiClass}>{sgd(curRetInt)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">this year</p>
          </div>

          {/* Needed to hit FRS */}
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit FRS</p>
            {neededFrs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">
                FRS reached
              </p>
            ) : (
              <p className={kpiClass}>{sgd(neededFrs)}</p>
            )}
          </div>

          {/* Needed to hit ERS */}
          <div className={cardClass}>
            <p className={labelClass}>Needed to hit ERS</p>
            {neededErs === 0 ? (
              <p className="mt-1 text-2xl font-bold text-[var(--color-primary)] tabular-nums">
                ERS reached
              </p>
            ) : (
              <p className={kpiClass}>{sgd(neededErs)}</p>
            )}
          </div>
        </div>
      )}

      {/* 4. SA overflow card */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>SA overflow (age {age})</h3>
        {hasOverflow ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">SA → OA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(saToOa)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">SA → RA</p>
                <p className="mt-0.5 font-semibold tabular-nums">{sgd(saToRa)}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            No SA overflow this year.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          At 55, amounts above your retirement sum move from SA to OA. SA
          contributions also overflow to OA once FRS is reached.
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

      {/* 6. SA growth chart */}
      <div
        role="img"
        aria-label="SA/RA balance versus FRS and ERS reference lines by age"
        className={`${cardClass} mb-4`}
      >
        <h3 className={`${labelClass} mb-3`}>SA / RA balance over time</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                label={{
                  value: "Age",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 11,
                }}
              />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                }
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                width={56}
              />
              <Tooltip
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    balance: "SA / RA balance",
                    frs: "Full Retirement Sum",
                    ers: "Enhanced Retirement Sum",
                  };
                  return [
                    sgd(typeof value === "number" ? value : null),
                    labels[String(name)] ?? String(name),
                  ];
                }}
                labelFormatter={(a) => `Age ${a}`}
                contentStyle={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    balance: "SA / RA balance",
                    frs: "Full Retirement Sum",
                    ers: "Enhanced Retirement Sum",
                  };
                  return labels[value] ?? value;
                }}
                wrapperStyle={{ fontSize: "12px" }}
              />
              <Line isAnimationActive={false}
                type="monotone"
                dataKey="balance"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={false}
                name="balance"
              />
              <Line isAnimationActive={false}
                type="monotone"
                dataKey="frs"
                stroke="var(--chart-3)"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                name="frs"
              />
              <Line isAnimationActive={false}
                type="monotone"
                dataKey="ers"
                stroke="var(--chart-4)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                name="ers"
              />
              {/* Mark selected age */}
              <ReferenceLine
                x={age}
                stroke="var(--color-primary)"
                strokeOpacity={0.4}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

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
              value={topup}
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
                FRS hit age (with top-up)
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
                Final balance (with top-up)
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
            aria-label="Projected SA/RA balance: baseline versus with yearly top-up"
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
                    name === "baseline" ? "Baseline" : name === "withTopup" ? "With yearly top-up" : "FRS",
                  ]}
                  labelFormatter={(a) => `Age ${a}`}
                  contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => (v === "baseline" ? "Baseline" : v === "withTopup" ? "With yearly top-up" : "FRS (projected)")} wrapperStyle={{ fontSize: "12px" }} />
                <Line isAnimationActive={false} type="monotone" dataKey="baseline" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="withTopup" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="frsLine" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Estimate: starting at the chosen age, each year&apos;s top-up is compounded at the ~4% SA floor rate and added to the projected balance. Top-ups are only allowed until the FRS is reached.
        </p>
      </div>
    </>
  );
}
