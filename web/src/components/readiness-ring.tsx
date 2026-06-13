import type { Readiness } from "@/lib/types";
import { ReadinessBadge } from "./readiness-badge";

const RING_COLOR = {
  on_track: "var(--color-success)",
  below_frs_pace: "var(--color-warning)",
  below_brs: "var(--color-error)",
} as const;

export function ReadinessRing({ r }: { r: Readiness | null }) {
  if (!r) return <div className="text-sm text-[var(--color-muted)]">Projection doesn&apos;t reach age 55 — readiness unavailable.</div>;
  const deg = (r.score / 100) * 360;
  const color = RING_COLOR[r.band];
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid h-28 w-28 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${deg}deg, var(--color-border) ${deg}deg 360deg)` }}
        role="img" aria-label={`Readiness score ${r.score} of 100, ${r.band.replace(/_/g, " ")}`}>
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[var(--color-surface)] text-2xl font-bold">{r.score}</div>
      </div>
      <ReadinessBadge r={r} />
    </div>
  );
}
