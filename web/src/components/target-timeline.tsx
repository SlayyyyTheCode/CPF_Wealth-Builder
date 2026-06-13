import { sgd } from "@/lib/format";

const TRACK_MIN = 25;
const TRACK_MAX = 95;

export function TargetTimeline({
  label,
  target,
  current,
  hitAge,
  minAge = TRACK_MIN,
  maxAge = TRACK_MAX,
}: {
  label: string;
  target: number;
  current: number;
  hitAge: number | null;
  minAge?: number;
  maxAge?: number;
}) {
  const required = Math.max(target - current, 0);

  const pct =
    hitAge !== null
      ? Math.min(
          100,
          Math.max(0, ((hitAge - minAge) / (maxAge - minAge)) * 100)
        )
      : null;

  const ariaLabel = [
    `${label} target timeline.`,
    `Target: ${sgd(target)}.`,
    `Current balance: ${sgd(current)}.`,
    `Required now: ${sgd(required)}.`,
    hitAge !== null
      ? `Reached at age ${hitAge}.`
      : "Not reached within projection.",
  ].join(" ");

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-fg)]">{label}</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Target&nbsp;
            <span className="font-semibold text-[var(--color-primary)]">
              {sgd(target)}
            </span>
          </p>
        </div>

        {/* Side stat block */}
        <div className="flex gap-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)]">Current</p>
            <p className="text-sm font-semibold text-[var(--color-fg)]">
              {sgd(current)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)]">Required now</p>
            <p
              className={`text-sm font-bold ${
                required > 0
                  ? "text-[var(--color-error,#ef4444)]"
                  : "text-[var(--color-primary)]"
              }`}
            >
              {required > 0 ? sgd(required) : "Met ✓"}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline track */}
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative mt-2"
      >
        {/* Track line */}
        <div className="relative mx-4 h-1.5 rounded-full bg-[var(--color-border)]">
          {pct !== null && (
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pct}%` }}
            >
              {/* Dot */}
              <div className="h-4 w-4 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-primary)] shadow-md" />
              {/* Age label above */}
              <span
                className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                Age {hitAge}
              </span>
            </div>
          )}
        </div>

        {/* Axis labels */}
        <div
          className="mt-6 flex justify-between text-xs text-[var(--color-muted)]"
          aria-hidden="true"
        >
          <span>Age {minAge}</span>
          {pct === null && (
            <span className="font-medium text-[var(--color-muted)]">
              Not reached within projection
            </span>
          )}
          <span>Age {maxAge}</span>
        </div>
      </div>
    </div>
  );
}
