import type { Readiness } from "@/lib/types";
const LABEL = { on_track: "On track", below_frs_pace: "Below FRS pace", below_brs: "Below BRS" } as const;
const CLS = {
  on_track: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  below_frs_pace: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  below_brs: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
} as const;
export function ReadinessBadge({ r }: { r: Readiness }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CLS[r.band]}`}>{LABEL[r.band]}</span>;
}
