"use client";
import { useState } from "react";
import Link from "next/link";
import type { MemberSummary } from "@/lib/types";
import { sgd, ageFromDob } from "@/lib/format";
import { ReadinessBadge } from "./readiness-badge";
import { deleteMember, warmClient, getMember } from "@/lib/api";
import { useToast } from "./toast";
import { useConfirm } from "./confirm-dialog";

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
  const toast = useToast();
  const confirm = useConfirm();

  // Warm member + projection on intent-to-open (hover / focus / touch) so the
  // dashboard renders from cache instantly. Skip locked clients (honour the
  // password gate). Fire-and-forget; results are cached in the api layer.
  const locked = m.has_password && !admin;
  const prefetch = () => {
    if (locked) return;
    getMember(m.id).catch(() => {});
    warmClient(m.id);
  };

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: `Delete ${m.name}?`,
      message: "This removes their profile and all simulations. This cannot be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMember(m.id);
      toast.success(`Deleted ${m.name}`);
      onDeleted?.();
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <Link
      href={`/clients/${m.id}`}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
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
      {m.has_password && !admin ? (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-muted)]">
          <span aria-hidden="true">🔒</span>
          <span>Balances hidden — unlock to view</span>
        </div>
      ) : (
        <div className="mt-3 flex justify-between border-t border-[var(--color-border)] pt-3 text-sm">
          <div><div className="text-xs uppercase text-[var(--color-muted)]">Total CPF</div>
            <div className="font-bold">{sgd(m.current_total)}</div></div>
          <div className="text-right"><div className="text-xs uppercase text-[var(--color-muted)]">CPF LIFE</div>
            <div className="font-bold">{m.latest_run?.cpf_life_monthly ? sgd(m.latest_run.cpf_life_monthly) : "—"}</div></div>
        </div>
      )}
    </Link>
  );
}
