"use client";
import { use, useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { simulate, getMember } from "@/lib/api";
import type { SimResult, Member } from "@/lib/types";
import { PageHeading, MillionaireIcon } from "@/components/icons";
import { useAdmin } from "@/lib/admin";
import { sgd, sgdCompact } from "@/lib/format";

const MILESTONES = [1_000_000, 1_500_000, 2_000_000];

export default function MillionairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useAdmin();
  const [res, setRes] = useState<SimResult | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    const numId = Number(id);
    Promise.all([simulate(numId, 91), getMember(numId)])
      .then(([r, m]) => {
        if (!ok) return;
        setRes(r.result);
        setMember(m);
      })
      .catch((e) => ok && setErr((e as Error).message));
    return () => { ok = false; };
  }, [id]);

  if (err)
    return <p role="alert" className="text-[var(--color-error)]">Could not load: {err}</p>;

  if (!res || !member)
    return (
      <div className="space-y-3">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" />
        <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
      </div>
    );

  // Access gate: admin or a member the admin granted special access.
  const hasAccess = isAdmin || !!member.special_access;
  if (!hasAccess) {
    return (
      <>
        <PageHeading icon={<MillionaireIcon className="h-7 w-7" />} title="CPF Millionaire" />
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-card)]">
          <MillionaireIcon className="mx-auto h-12 w-12" />
          <h3 className="mt-3 text-base font-semibold">Restricted feature 🔒</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-muted)]">
            CPF Millionaire is available to the system administrator and clients
            granted special access. Ask the administrator to enable access for
            this client under Settings.
          </p>
        </div>
      </>
    );
  }

  const years = res.years;
  const data = years.map((y) => {
    const total = y.closing.OA + y.closing.SA + y.closing.MA + y.closing.RA;
    return { age: y.age, total: Math.round(total) };
  });

  const hitAge = (target: number) =>
    years.find((y) => y.closing.OA + y.closing.SA + y.closing.MA + y.closing.RA >= target)?.age ?? null;

  const finalTotal = data.length ? data[data.length - 1].total : 0;
  const currentTotal =
    member.balances.OA + member.balances.SA + member.balances.MA + member.balances.RA;

  const cardClass =
    "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";
  const labelClass =
    "text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]";
  const kpiClass = "mt-1 text-2xl font-bold tabular-nums";

  return (
    <>
      <PageHeading
        icon={<MillionaireIcon className="h-7 w-7" />}
        title="CPF Millionaire"
        subtitle="When this client's combined CPF (OA+SA+MA+RA) is projected to cross the millionaire milestones."
      />

      {/* KPI row */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <p className={labelClass}>CPF today</p>
          <p className={kpiClass}>{sgd(currentTotal)}</p>
        </div>
        <div className={cardClass}>
          <p className={labelClass}>Projected peak</p>
          <p className={kpiClass}>{sgdCompact(finalTotal)}</p>
        </div>
        <div className={cardClass}>
          <p className={labelClass}>$1M at age</p>
          <p className={kpiClass}>
            {hitAge(1_000_000) !== null ? hitAge(1_000_000) : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {hitAge(1_000_000) !== null ? "CPF millionaire 🎉" : "Not within projection"}
          </p>
        </div>
        <div className={cardClass}>
          <p className={labelClass}>$2M at age</p>
          <p className={kpiClass}>
            {hitAge(2_000_000) !== null ? hitAge(2_000_000) : "—"}
          </p>
        </div>
      </div>

      {/* Milestone table */}
      <div className={`${cardClass} mb-4`}>
        <h3 className={`${labelClass} mb-3`}>Millionaire milestones</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
              <th className="pb-2 font-medium">Milestone</th>
              <th className="pb-2 text-right font-medium">Reached at age</th>
            </tr>
          </thead>
          <tbody>
            {MILESTONES.map((t) => {
              const a = hitAge(t);
              return (
                <tr key={t} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 font-medium">{sgdCompact(t)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {a !== null ? `Age ${a}` : "Not within projection"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chart */}
      <div role="img" aria-label="Total CPF over time against millionaire milestones" className={cardClass}>
        <h3 className={`${labelClass} mb-3`}>Total CPF vs milestones</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis
                tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                width={52}
              />
              <Tooltip
                formatter={(v) => [sgd(typeof v === "number" ? v : null), "Total CPF"]}
                labelFormatter={(a) => `Age ${a}`}
                contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend formatter={() => "Total CPF"} wrapperStyle={{ fontSize: "12px" }} />
              <ReferenceLine y={1_000_000} stroke="var(--chart-4)" strokeDasharray="6 3" label={{ value: "$1M", fontSize: 10, fill: "var(--color-muted)", position: "insideTopRight" }} />
              <ReferenceLine y={2_000_000} stroke="var(--chart-3)" strokeDasharray="6 3" label={{ value: "$2M", fontSize: 10, fill: "var(--color-muted)", position: "insideTopRight" }} />
              <Line isAnimationActive={false} type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Combined OA + SA + MA + RA from the baseline projection. Reaching $1M in
          CPF generally requires early, consistent contributions and the power of
          compound interest at the CPF floor rates.
        </p>
      </div>
    </>
  );
}
