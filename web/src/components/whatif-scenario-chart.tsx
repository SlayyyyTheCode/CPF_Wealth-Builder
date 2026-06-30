"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, CartesianGrid } from "recharts";
import { sgd } from "@/lib/format";
import type { ScenarioRow } from "@/lib/whatif";

export function WhatIfScenarioChart({ rows, markerAge }: { rows: ScenarioRow[]; markerAge: number }) {
  return (
    <div className="h-64" role="img" aria-label="Combined CPF: original projection versus the what-if scenario by age">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
          <YAxis tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={52} />
          <Tooltip
            formatter={(v, name) => [sgd(typeof v === "number" ? v : null), name === "base" ? "Original" : "With what-if"]}
            labelFormatter={(a) => `Age ${a}`}
            contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
          />
          <Legend formatter={(v) => (v === "base" ? "Original" : "With what-if")} wrapperStyle={{ fontSize: "12px" }} />
          <ReferenceLine x={markerAge} stroke="var(--chart-4)" strokeDasharray="4 2" />
          <Line isAnimationActive={false} type="monotone" dataKey="base" stroke="var(--chart-grey)" strokeWidth={2} dot={false} />
          <Line isAnimationActive={false} type="monotone" dataKey="scen" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
