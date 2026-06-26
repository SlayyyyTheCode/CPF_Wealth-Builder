"use client";
import { use, useEffect, useState } from "react";
import { getAnalysis, getMember } from "@/lib/api";
import type { Analysis, Residency } from "@/lib/types";
import { ScenarioCards } from "@/components/scenario-cards";
import { StrategyList } from "@/components/strategy-list";
import { TaxMethods } from "@/components/tax-methods";
import { PageHeading, OptimiseIcon } from "@/components/icons";
import { ErrorState } from "@/components/error-state";

export default function OptimisationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [residency, setResidency] = useState<Residency>("citizen");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    getAnalysis(Number(id), {
      annual_assessable_income: 0,
      payout_age: 65,
      end_age: 90,
    })
      .then((a) => ok && setAnalysis(a))
      .catch((e) => ok && setErr((e as Error).message));
    getMember(Number(id))
      .then((m) => ok && setResidency(m.residency ?? "citizen"))
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [id]);

  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  if (!analysis)
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--color-surface-raised)]" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl bg-[var(--color-surface-raised)]"
            />
          ))}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
      </div>
    );

  return (
    <>
      <PageHeading
        icon={<OptimiseIcon className="h-7 w-7" />}
        title="Optimisation"
        subtitle="Tax estimates assume $0 declared assessable income — add income data for personalised figures."
      />

      <section aria-label="Scenario analysis" className="mb-6">
        <h2 className="mb-3 text-base font-semibold">Scenario analysis</h2>
        <ScenarioCards scenarios={analysis.scenarios} />
      </section>

      <section aria-label="Recommended strategies" className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Recommended strategies</h2>
        <StrategyList strategies={analysis.strategies} />
      </section>

      <TaxMethods initialResidency={residency} />
    </>
  );
}
