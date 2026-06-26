"use client";
import { use, useCallback, useEffect, useState } from "react";
import { getMember } from "@/lib/api";
import { ageFromDob } from "@/lib/format";
import type { Residency } from "@/lib/types";
import { PageHeading, SavingsIcon } from "@/components/icons";
import { SrsUserPanel } from "@/components/srs-user-panel";
import { SrsWithdrawalCard } from "@/components/srs-withdrawal-card";

export default function SrsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [currentAge, setCurrentAge] = useState<number | null>(null);
  const [residency, setResidency] = useState<Residency>("citizen");
  const [projectedBalance, setProjectedBalance] = useState(0);

  useEffect(() => {
    let ok = true;
    getMember(Number(id))
      .then((m) => {
        if (!ok) return;
        setCurrentAge(ageFromDob(m.dob));
        setResidency(m.residency ?? "citizen");
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [id]);

  const handleProjected = useCallback((n: number) => setProjectedBalance(n), []);

  return (
    <div>
      <PageHeading
        icon={<SavingsIcon className="h-6 w-6" />}
        title="Supplementary Retirement Scheme (SRS)"
        subtitle="Voluntary tax-deferred retirement savings"
      />

      <section aria-label="SRS projection" className="mb-8">
        <SrsUserPanel
          currentAge={currentAge}
          residency={residency}
          onProjectedBalance={handleProjected}
        />
      </section>

      <section aria-label="SRS withdrawal">
        <h2 className="mb-3 text-base font-semibold">SRS withdrawal strategy</h2>
        <SrsWithdrawalCard suggestedBalance={projectedBalance} />
      </section>
    </div>
  );
}
