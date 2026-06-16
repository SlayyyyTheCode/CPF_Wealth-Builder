"use client";
import { useEffect, useState } from "react";
import { createMember } from "@/lib/api";
import type { NewMember } from "@/lib/types";

type FormState = {
  name: string; dob: string; wage: string; emp: string;
  oa: string; sa: string; ma: string; ra: string;
  mortgage: string; password: string;
};
const EMPTY: FormState = {
  name: "", dob: "", wage: "", emp: "employee",
  oa: "", sa: "", ma: "", ra: "", mortgage: "", password: "",
};

// Age this calendar year from a "MM/YYYY" birth month.
function ageFromMMYYYY(s: string): number | null {
  const m = /^(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return new Date().getFullYear() - Number(m[2]);
}

export function MemberFormDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const age = ageFromMMYYYY(f.dob);
  const raLocked = age !== null && age < 55; // RA only forms at 55
  const dobValid = /^(0[1-9]|1[0-2])\/\d{4}$/.test(f.dob.trim());
  const valid = f.name.trim() && dobValid && Number(f.wage) >= 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setErr("Name, date of birth (MM/YYYY) and wage are required."); return; }
    setBusy(true); setErr(null);
    const [mm, yyyy] = f.dob.trim().split("/");
    const num = (s: string) => Math.max(0, Number(s) || 0);
    const payload: NewMember = {
      name: f.name.trim(),
      dob: `${yyyy}-${mm}-01`,
      monthly_gross_wage: num(f.wage),
      employment_status: f.emp,
      balances: { OA: num(f.oa), SA: num(f.sa), MA: num(f.ma), RA: raLocked ? 0 : num(f.ra) },
      housing_data: { monthly_mortgage: num(f.mortgage) },
      ...(f.password ? { password: f.password } : {}),
    };
    try { await createMember(payload); setF(EMPTY); onCreated(); }
    catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  const field = "mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
  const balKeys: { k: keyof FormState; label: string }[] = [
    { k: "oa", label: "Current OA Amount" },
    { k: "sa", label: "Current SA Amount" },
    { k: "ma", label: "Current MA Amount" },
    { k: "ra", label: "Current RA Amount" },
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog" aria-modal="true" aria-label="New client" onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-[var(--color-surface)] p-6 shadow-xl"
      >
        <h2 className="text-xl font-bold">New client</h2>
        {err && <p role="alert" className="mt-2 text-sm text-[var(--color-error)]">{err}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            Name
            <input className={field} value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>

          <label className="text-sm">
            Date of birth (MM/YYYY)
            <input className={field} value={f.dob} inputMode="numeric" placeholder="MM/YYYY"
              onChange={(e) => setF({ ...f, dob: e.target.value })} />
          </label>

          <label className="text-sm">
            Monthly gross wage (S$)
            <input type="number" min={0} className={field} value={f.wage} placeholder="0"
              onChange={(e) => setF({ ...f, wage: e.target.value })} />
          </label>

          <label className="text-sm">
            Monthly housing mortgage (S$)
            <input type="number" min={0} className={field} value={f.mortgage} placeholder="0"
              onChange={(e) => setF({ ...f, mortgage: e.target.value })} />
          </label>

          <label className="text-sm">
            Employment
            <select className={field} value={f.emp}
              onChange={(e) => setF({ ...f, emp: e.target.value })}>
              <option value="employee">Employee</option>
              <option value="self-employed">Self-employed</option>
            </select>
          </label>

          {balKeys.map(({ k, label }) => {
            const locked = k === "ra" && raLocked;
            return (
              <label key={k} className="text-sm">
                {label}
                <input type="number" min={0} className={field}
                  value={locked ? 0 : (f[k] as string)} placeholder="0"
                  disabled={locked}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                {locked && (
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    RA forms only at age 55 — $0 until then.
                  </span>
                )}
              </label>
            );
          })}

          <label className="text-sm sm:col-span-2">
            Password (optional — protects this client&apos;s dashboard)
            <input type="password" className={field} value={f.password} autoComplete="new-password"
              placeholder="Leave blank for no password"
              onChange={(e) => setF({ ...f, password: e.target.value })} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-4 py-2">Cancel</button>
          <button type="submit" disabled={busy}
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Create client"}
          </button>
        </div>
      </form>
    </div>
  );
}
