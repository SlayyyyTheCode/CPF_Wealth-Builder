"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import { sgd } from "@/lib/format";

export interface SrsSeriesPoint { age: number; srs: number; alt: number }

// Label the final point of a line with its dollar value (the "amount").
function endLabel(lastIndex: number, color: string) {
  return function Label(props: { x?: number | string; y?: number | string; value?: number | string | boolean | null; index?: number }) {
    if (props.index !== lastIndex || props.x == null || props.y == null) return <text />;
    return (
      <text x={Number(props.x)} y={Number(props.y)} dy={-8} fontSize={11} fontWeight={600} textAnchor="end" fill={color}>
        {sgd(Number(props.value))}
      </text>
    );
  };
}

export function SrsGrowthChart({
  series,
  srsInterest,
  altInterest,
  altName,
}: {
  series: SrsSeriesPoint[];
  srsInterest: number;
  altInterest: number;
  altName: string;
}) {
  return (
    <div className="h-64" role="img" aria-label="Line chart comparing SRS cash growth against the alternative investment by age">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
          <XAxis dataKey="age" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={44} />
          <Tooltip formatter={(v) => typeof v === "number" ? `$${v.toLocaleString()}` : String(v)} />
          <Legend />
          <Line isAnimationActive={false} type="monotone" dataKey="srs" name={`SRS cash (${srsInterest}%)`} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }}>
            <LabelList dataKey="srs" content={endLabel(series.length - 1, "var(--chart-1)")} />
          </Line>
          <Line isAnimationActive={false} type="monotone" dataKey="alt" name={`${altName || "Alternative"} (${altInterest}%)`} stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 2 }}>
            <LabelList dataKey="alt" content={endLabel(series.length - 1, "var(--chart-2)")} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
