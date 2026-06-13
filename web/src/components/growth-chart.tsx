"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { YearRow } from "@/lib/types";

export function GrowthChart({ years }: { years: YearRow[] }) {
  let cc = 0, ci = 0;
  const data = years.map((y) => {
    cc += y.total_contributions ?? 0;
    ci += (y.interest_base ?? 0) + (y.interest_extra ?? 0);
    return { age: y.age, Contributions: Math.round(cc), Interest: Math.round(ci) };
  });
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-1 text-sm font-semibold">How your money grows</h3>
      <p className="mb-2 text-xs text-[var(--color-muted)]">Cumulative CPF contributions vs interest earned, by age. Interest is your money working for you — it compounds over time.</p>
      <div className="h-64" role="img" aria-label="Stacked area chart of cumulative contributions versus cumulative interest by age">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={40} />
            <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
            <Legend />
            <Area type="monotone" dataKey="Contributions" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" />
            <Area type="monotone" dataKey="Interest" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
