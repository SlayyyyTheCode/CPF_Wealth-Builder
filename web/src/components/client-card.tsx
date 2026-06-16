"use client";
import { useState } from "react";
import Link from "next/link";
import type { MemberSummary } from "@/lib/types";
import { sgd, ageFromDob } from "@/lib/format";
import { ReadinessBadge } from "./readiness-badge";
import { deleteMember } from "@/lib/api";

export function ClientCard({
  m,
  admin = false,
  onDeleted,
}: {
  m: MemberSummary;
  admin?: boolean;
  onDeleted?: () => void;
}) {
  const r = m.latest_run?.readiness ?? null;
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete client "${m.name}"? This removes their profile and all simulations. Cannot be undone.`))
      return;
    setBusy(true);
    try {
      await deleteMember(m.id);
      onDeleted?.();
    } catch (err) {
      window.alert(`Delete failed: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <Link
      href={`/clients/${m.id}`}
      className="relative block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition hover:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    >
      {admin && (
        <button
          onClick={handleDelete}
          disabled={busy}
          aria-label={`Delete ${m.name}`}
          className="absolute right-2 top-2 z-10 rounded-full bg-[var(--color-error)] px-2.5 py-1 text-xs font-semibold text-white opacity-90 hover:opacity-100 disabled:opacity-50"
        >
          {busy ? "…" : "Delete"}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            {m.name}{m.has_password && <span title="Password protected" aria-label="Password protected"> 🔒</span>}
          </div>
          <div className="text-sm text-[var(--color-muted)]">
            Age {ageFromDob(m.dob)} · {m.employment_status}
          </div>
          {r ? <div className="mt-1"><ReadinessBadge r={r} /></div>
             : <div className="mt-1 text-xs text-[var(--color-muted)]">Not projected yet</div>}
        </div>
        {r && (
          <div aria-label={`Readiness ${r.score} of 100`}
               className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white">
            {r.score}
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-between border-t border-[var(--color-border)] pt-3 text-sm">
        <div><div className="text-xs uppercase text-[var(--color-muted)]">Total CPF</div>
          <div className="font-bold">{sgd(m.current_total)}</div></div>
        <div className="text-right"><div className="text-xs uppercase text-[var(--color-muted)]">CPF LIFE</div>
          <div className="font-bold">{m.latest_run?.cpf_life_monthly ? sgd(m.latest_run.cpf_life_monthly) : "—"}</div></div>
      </div>
    </Link>
  );
}
