"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { YearRow } from "@/lib/types";

const SERIES = [
  { key: "OA interest", color: "var(--chart-1)" },
  { key: "SA interest", color: "var(--chart-2)" },
  { key: "MA interest", color: "var(--chart-3)" },
  { key: "RA interest", color: "var(--chart-4)" },
  { key: "Total interest", color: "var(--chart-5)" },
  { key: "Total contribution", color: "var(--chart-grey)" },
] as const;

export function GrowthChart({ years }: { years: YearRow[] }) {
  const cum = { OA: 0, SA: 0, MA: 0, RA: 0, contrib: 0 };
  const data = years.map((y) => {
    const ib = y.interest_by_account ?? { OA: 0, SA: 0, MA: 0, RA: 0 };
    cum.OA += ib.OA ?? 0;
    cum.SA += ib.SA ?? 0;
    cum.MA += ib.MA ?? 0;
    cum.RA += ib.RA ?? 0;
    cum.contrib += y.total_contributions ?? 0;
    const totalInt = cum.OA + cum.SA + cum.MA + cum.RA;
    return {
      age: y.age,
      "OA interest": Math.round(cum.OA),
      "SA interest": Math.round(cum.SA),
      "MA interest": Math.round(cum.MA),
      "RA interest": Math.round(cum.RA),
      "Total interest": Math.round(totalInt),
      "Total contribution": Math.round(cum.contrib),
    };
  });
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-1 text-sm font-semibold">How your money grows</h3>
      <p className="mb-2 text-xs text-[var(--color-muted)]">Cumulative interest earned per account (OA/SA/MA/RA), total interest, and total contributions by age.</p>
      <div className="h-72" role="img" aria-label="Cumulative interest earned per CPF account, total interest and total contributions by age">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={40} />
            <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
            <Legend wrapperStyle={{ fontSize: "12px" }} itemSorter={null} />
            {SERIES.map((s) => (
              <Line isAnimationActive={false}
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={s.key.startsWith("Total") ? 2.5 : 1.5}
                strokeDasharray={s.key === "Total contribution" ? "6 3" : undefined}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
