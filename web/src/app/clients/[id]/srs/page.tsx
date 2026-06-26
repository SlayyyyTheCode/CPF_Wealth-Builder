"use client";
import { use, useEffect, useState } from "react";
import { getMember } from "@/lib/api";
import { ageFromDob } from "@/lib/format";
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

  useEffect(() => {
    let ok = true;
    getMember(Number(id))
      .then((m) => ok && setCurrentAge(ageFromDob(m.dob)))
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [id]);

  return (
    <div>
      <PageHeading
        icon={<SavingsIcon className="h-6 w-6" />}
        title="Supplementary Retirement Scheme (SRS)"
        subtitle="Voluntary tax-deferred retirement savings"
      />

      <section aria-label="SRS projection" className="mb-8">
        <SrsUserPanel currentAge={currentAge} />
      </section>

      <section aria-label="SRS withdrawal">
        <h2 className="mb-3 text-base font-semibold">SRS withdrawal strategy</h2>
        <SrsWithdrawalCard />
      </section>
    </div>
  );
}
