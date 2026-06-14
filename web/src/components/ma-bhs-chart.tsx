"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { sgd } from "@/lib/format";

type Series = { age: number; ma: number; bhs: number }[];

export function MaBhsChart({ series }: { series: Series }) {
  return (
    <div
      role="img"
      aria-label="MediSave balance versus Basic Healthcare Sum by age"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
    >
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        MA balance vs BHS
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBHS" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-grey)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--chart-grey)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              label={{ value: "Age", position: "insideBottom", offset: -2, fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
              }
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              width={52}
            />
            <Tooltip
              formatter={(value, name) => [
                sgd(typeof value === "number" ? value : null),
                name === "ma" ? "MediSave (MA)" : "Basic Healthcare Sum",
              ]}
              labelFormatter={(age) => `Age ${age}`}
              contentStyle={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend
              formatter={(value) =>
                value === "ma" ? "MediSave (MA)" : "Basic Healthcare Sum"
              }
              wrapperStyle={{ fontSize: "12px" }}
            />
            <Area isAnimationActive={false}
              type="monotone"
              dataKey="ma"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#gradMA)"
              dot={false}
            />
            <Area isAnimationActive={false}
              type="monotone"
              dataKey="bhs"
              stroke="var(--chart-grey)"
              strokeWidth={2}
              strokeDasharray="5 3"
              fill="url(#gradBHS)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
