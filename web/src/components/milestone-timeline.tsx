"use client";
import type { SimResult } from "@/lib/types";

type Milestones = NonNullable<SimResult["milestones"]>;

interface MilestoneItem {
  key: keyof Milestones;
  label: string;
  age: number | null;
}

const TRACK_MIN = 25;
const TRACK_MAX = 95;

function toPercent(age: number): number {
  return ((age - TRACK_MIN) / (TRACK_MAX - TRACK_MIN)) * 100;
}

function buildAriaLabel(items: MilestoneItem[]): string {
  const parts = items.map((m) =>
    m.age !== null ? `${m.label} at ${m.age}` : `${m.label} not reached`
  );
  return `Milestone timeline: ${parts.join(", ")}`;
}

interface Props {
  milestones: SimResult["milestones"];
}

export function MilestoneTimeline({ milestones }: Props) {
  const items: MilestoneItem[] = [
    { key: "bhs_age", label: "BHS", age: milestones?.bhs_age ?? null },
    { key: "frs_age", label: "FRS", age: milestones?.frs_age ?? null },
    { key: "ers_age", label: "ERS", age: milestones?.ers_age ?? null },
    {
      key: "cpf_life_eligible_age",
      label: "CPF LIFE",
      age: milestones?.cpf_life_eligible_age ?? null,
    },
  ];

  const reached = items.filter((m) => m.age !== null);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-4 text-base font-semibold text-[var(--color-fg)]">
        Milestone Timeline
      </h2>

      {/* Visual track — wrapped in role="img" for accessibility */}
      <div
        role="img"
        aria-label={buildAriaLabel(items)}
        className="relative mb-6 mt-2"
      >
        {/* Age axis line */}
        <div className="relative mx-4 h-1 rounded-full bg-[var(--color-border)]">
          {/* Markers for reached milestones */}
          {reached.map((m) => {
            const pct = toPercent(m.age as number);
            return (
              <div
                key={m.key}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pct}%` }}
              >
                {/* Dot */}
                <div className="h-4 w-4 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-primary)]" />
                {/* Label above */}
                <span
                  className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[var(--color-primary)]"
                  aria-hidden="true"
                >
                  {m.label}
                </span>
                {/* Age below */}
                <span
                  className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-[var(--color-muted)]"
                  aria-hidden="true"
                >
                  {m.age}
                </span>
              </div>
            );
          })}
        </div>

        {/* Axis labels */}
        <div className="mt-8 flex justify-between text-xs text-[var(--color-muted)]" aria-hidden="true">
          <span>Age {TRACK_MIN}</span>
          <span>Age {TRACK_MAX}</span>
        </div>
      </div>

      {/* Accessible text list — carries full info on all screen sizes */}
      <ul className="mt-2 divide-y divide-[var(--color-border)]">
        {items.map((m) => (
          <li
            key={m.key}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span className="font-medium text-[var(--color-fg)]">
              {m.label}
            </span>
            {m.age !== null ? (
              <span className="text-[var(--color-fg)]">
                age{" "}
                <span className="font-semibold text-[var(--color-primary)]">
                  {m.age}
                </span>
              </span>
            ) : (
              <span className="text-[var(--color-muted)]">
                Not reached within projection
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
