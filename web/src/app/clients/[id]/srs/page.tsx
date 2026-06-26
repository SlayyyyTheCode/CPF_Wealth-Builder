"use client";
import { use } from "react";
import { PageHeading, SavingsIcon } from "@/components/icons";

export default function SrsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  use(params);
  return (
    <div>
      <PageHeading
        icon={<SavingsIcon className="h-6 w-6" />}
        title="Supplementary Retirement Scheme (SRS)"
        subtitle="Voluntary tax-deferred retirement savings"
      />
      <p className="text-sm text-[var(--color-muted)]">
        SRS projections coming soon.
      </p>
    </div>
  );
}
