"use client";
import { useEffect, useState } from "react";
import { createMember } from "@/lib/api";
import type { NewMember } from "@/lib/types";

const EMPTY: NewMember = {
  name: "", dob: "", monthly_gross_wage: 0, employment_status: "employee",
  balances: { OA: 0, SA: 0, MA: 0, RA: 0 },
  housing_data: { monthly_mortgage: 0 },
};

export function MemberFormDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState<NewMember>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Escape-to-close — declared before early return to satisfy hooks rules
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const valid = f.name.trim() && f.dob && f.monthly_gross_wage >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setErr("Name, date of birth and wage are required."); return; }
    setBusy(true); setErr(null);
    // DOB entered as month (YYYY-MM) → store as a real date (first of the month).
    const payload = { ...f, dob: /^\d{4}-\d{2}$/.test(f.dob) ? `${f.dob}-01` : f.dob };
    try { await createMember(payload); setF(EMPTY); onCreated(); }
    catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  const field = "mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New client"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-[560px] rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl"
      >
        <h2 className="text-xl font-bold">New client</h2>
        {err && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-error)]">
            {err}
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Name
            <input
              className={field}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Date of birth (MM/YYYY)
            <input
              type="month"
              className={field}
              value={f.dob}
              onChange={(e) => setF({ ...f, dob: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Monthly gross wage
            <input
              type="number"
              min={0}
              className={field}
              value={f.monthly_gross_wage}
              onChange={(e) =>
                setF({ ...f, monthly_gross_wage: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm">
            Monthly housing mortgage (S$)
            <input
              type="number"
              min={0}
              className={field}
              value={f.housing_data?.monthly_mortgage ?? 0}
              onChange={(e) =>
                setF({ ...f, housing_data: { monthly_mortgage: Math.max(0, Number(e.target.value)) } })
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Employment
            <select
              className={field}
              value={f.employment_status}
              onChange={(e) =>
                setF({ ...f, employment_status: e.target.value })
              }
            >
              <option value="employee">Employee</option>
              <option value="self-employed">Self-employed</option>
            </select>
          </label>
          {(["OA", "SA", "MA", "RA"] as const).map((k) => (
            <label key={k} className="text-sm">
              Current {k} Amount
              <input
                type="number"
                min={0}
                className={field}
                value={f.balances[k]}
                onChange={(e) =>
                  setF({
                    ...f,
                    balances: { ...f.balances, [k]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}
