"use client";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { YearRow } from "@/lib/types";

const COLORS = { OA: "var(--chart-1)", SA: "var(--chart-2)", MA: "var(--chart-3)", RA: "var(--chart-4)" };
const TOTAL_COLOR = "var(--chart-5)";
const ORDER = ["OA", "SA", "MA", "RA", "Total"];
// keep tooltip rows OA → Total (stacked charts otherwise reverse them)
const sortItems = (i: { dataKey?: unknown }) => ORDER.indexOf(String(i.dataKey));

export function AccountBreakdownChart({ years }: { years: YearRow[] }) {
  const data = years
    .filter((y) => y.age % 5 === 0)
    .map((y) => {
      const Total = y.closing.OA + y.closing.SA + y.closing.MA + y.closing.RA;
      return { age: y.age, ...y.closing, Total };
    });
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="mb-2 text-sm font-semibold">Account breakdown by age</h3>
      <div className="h-64" role="img" aria-label="Stacked bar chart of OA, SA, MA, RA balances every five years with a total line">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={40} />
            <Tooltip
              formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)}
              itemSorter={sortItems}
            />
            <Legend />
            {(["OA", "SA", "MA", "RA"] as const).map((k) =>
              <Bar isAnimationActive={false} key={k} dataKey={k} stackId="1" fill={COLORS[k]} />)}
            <Line isAnimationActive={false} type="monotone" dataKey="Total" stroke={TOTAL_COLOR} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
