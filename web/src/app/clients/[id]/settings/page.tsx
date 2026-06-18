"use client";
import { use, useCallback, useEffect, useState } from "react";
import { getMember, updateMember } from "@/lib/api";
import type { Member, MemberUpdate } from "@/lib/types";
import { dobMMYYYY, ageFromDob } from "@/lib/format";
import { PageHeading, SettingsIcon } from "@/components/icons";
import { AdminBar } from "@/components/admin-bar";
import { useAdmin } from "@/lib/admin";
import { useToast } from "@/components/toast";
import { ErrorState } from "@/components/error-state";

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [member, setMember] = useState<Member | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // form fields
  const [name, setName] = useState("");
  const [wage, setWage] = useState("");
  const [empStatus, setEmpStatus] = useState("employee");
  const [oa, setOa] = useState("");
  const [sa, setSa] = useState("");
  const [ma, setMa] = useState("");
  const [ra, setRa] = useState("");
  const [mortgage, setMortgage] = useState(""); // monthly housing mortgage → OA calc
  const [increment, setIncrement] = useState(""); // salary increment %/yr
  const [bonus, setBonus] = useState("");         // annual bonus in months
  const [password, setPassword] = useState(""); // set/replace per-client password
  const [access, setAccess] = useState(false); // CPF Millionaire + self-edit access

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const { isAdmin, login, logout } = useAdmin();
  const toast = useToast();

  const load = useCallback(() => {
    setErr(null);
    getMember(Number(id))
      .then((m) => {
        setMember(m);
        setName(m.name);
        setWage(String(m.monthly_gross_wage));
        setEmpStatus(m.employment_status);
        setOa(String(m.balances.OA));
        setSa(String(m.balances.SA));
        setMa(String(m.balances.MA));
        setRa(String(m.balances.RA));
        setMortgage(String(m.housing_data?.monthly_mortgage ?? 0));
        setIncrement(String((m.salary_increment_pct ?? 0) * 100));
        setBonus(String(m.bonus_months ?? 0));
        setAccess(!!m.special_access);
      })
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (err)
    return <ErrorState message={err} onRetry={load} />;

  if (!member)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-[var(--color-surface-raised)]" />
        ))}
      </div>
    );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setSaveErr(null);

    const body: MemberUpdate = {
      name,
      monthly_gross_wage: Number(wage),
      employment_status: empStatus,
      balances: {
        OA: Number(oa),
        SA: Number(sa),
        MA: Number(ma),
        RA: member && ageFromDob(member.dob) < 55 ? 0 : Number(ra),
      },
      housing_data: { monthly_mortgage: Number(mortgage) || 0 },
      salary_increment_pct: (Number(increment) || 0) / 100,
      bonus_months: Number(bonus) || 0,
      // Only set the password when the user typed a new one.
      ...(password ? { password } : {}),
      // Only the admin can grant/revoke access; the backend ignores it otherwise.
      ...(isAdmin ? { special_access: access } : {}),
    };

    try {
      const updated = await updateMember(Number(id), body);
      setMember(updated);
      setPassword("");
      setSaved(true);
      toast.success("Changes saved");
    } catch (e) {
      const msg = (e as Error).message;
      setSaveErr(msg);
      toast.error(`Save failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] dark:text-white";

  const labelCls = "block text-xs font-medium text-[var(--color-muted)] mb-1";

  const cardCls =
    "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]";

  // Any signed-in user may edit a client's values (per the app's access model).
  const canEdit = true;
  // RA only forms at age 55 — lock it to $0 for younger clients.
  const raLocked = ageFromDob(member.dob) < 55;

  return (
    <>
      <PageHeading
        icon={<SettingsIcon className="h-7 w-7" />}
        title="Settings"
        subtitle="Edit this client's CPF balances and profile. Changes affect all projections."
      />

      <AdminBar isAdmin={isAdmin} onLogin={login} onLogout={logout} />
      <p className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm text-[var(--color-muted)]">
        Edit this client&apos;s profile and CPF balances below. CPF Millionaire access is granted
        by a system administrator.
      </p>

      {/* Admin-only: grant CPF Millionaire access */}
      {isAdmin && (
        <div className={`${cardCls} mb-4`}>
          <h2 className="mb-2 text-base font-semibold">Access control</h2>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={access}
              onChange={(e) => setAccess(e.target.checked)}
              className="mt-0.5 h-4 w-4"
              aria-label="Grant CPF Millionaire and self-edit access"
            />
            <span>
              <span className="font-medium">Grant special access</span> — unlocks the
              <span className="font-medium"> CPF Millionaire</span> tab for this client and lets
              them edit their own Profile and CPF Balances here. Remember to Save.
            </span>
          </label>
        </div>
      )}

      <form onSubmit={handleSave} className="grid gap-4 lg:grid-cols-2">
        {/* Profile card */}
        <div className={cardCls}>
          <h2 className="mb-4 text-base font-semibold">Profile</h2>
          <div className="grid gap-4">
            <div>
              <label htmlFor="name" className={labelCls}>Full name</label>
              <input
                id="name"
                type="text"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="wage" className={labelCls}>Monthly gross wage (SGD)</label>
              <input
                id="wage"
                type="number"
                min="0"
                step="1"
                className={inputCls}
                value={wage}
                onChange={(e) => setWage(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="empStatus" className={labelCls}>Employment status</label>
              <select
                id="empStatus"
                className={inputCls}
                value={empStatus}
                onChange={(e) => setEmpStatus(e.target.value)}
              >
                <option value="employee">Employee</option>
                <option value="self-employed">Self-employed</option>
              </select>
            </div>

            <div>
              <label htmlFor="mortgage" className={labelCls}>Monthly housing mortgage (SGD)</label>
              <input
                id="mortgage"
                type="number"
                min="0"
                step="1"
                className={inputCls}
                value={mortgage}
                onChange={(e) => setMortgage(e.target.value)}
                disabled={!canEdit}
                aria-label="Monthly housing mortgage"
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Prefills the OA housing-withdrawal calculator.
              </p>
            </div>

            <div>
              <label htmlFor="increment" className={labelCls}>Salary increment (%/yr)</label>
              <input
                id="increment" type="number" min="0" step="0.5" className={inputCls}
                value={increment} onChange={(e) => setIncrement(e.target.value)}
                disabled={!canEdit} placeholder="0" aria-label="Salary increment percent per year"
              />
            </div>

            <div>
              <label htmlFor="bonus" className={labelCls}>Annual bonus (months)</label>
              <input
                id="bonus" type="number" min="0" step="0.5" className={inputCls}
                value={bonus} onChange={(e) => setBonus(e.target.value)}
                disabled={!canEdit} placeholder="0" aria-label="Annual bonus in months"
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Raises salary yearly and adds a bonus — both feed CPF contributions in every projection.
              </p>
            </div>

            <div>
              <label htmlFor="cpw" className={labelCls}>Password (optional)</label>
              <input
                id="cpw"
                type="password"
                autoComplete="new-password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!canEdit}
                placeholder={member.has_password ? "•••••• (set — type to change)" : "Set a password to protect this client"}
                aria-label="Client password"
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Protects this client&apos;s dashboard. Leave blank to keep the current password.
              </p>
            </div>

            <div>
              <p className={labelCls}>Date of birth (MM/YYYY)</p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-muted)]">
                {dobMMYYYY(member.dob)}
              </p>
            </div>
          </div>
        </div>

        {/* CPF Balances card */}
        <div className={cardCls}>
          <h2 className="mb-4 text-base font-semibold">CPF Balances</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="oa" className={labelCls}>Current OA Amount</label>
              <input
                id="oa"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={oa}
                onChange={(e) => setOa(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="sa" className={labelCls}>Current SA Amount</label>
              <input
                id="sa"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={sa}
                onChange={(e) => setSa(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="ma" className={labelCls}>Current MA Amount</label>
              <input
                id="ma"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={ma}
                onChange={(e) => setMa(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div>
              <label htmlFor="ra" className={labelCls}>Current RA Amount</label>
              <input
                id="ra"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={raLocked ? 0 : ra}
                onChange={(e) => setRa(e.target.value)}
                disabled={raLocked}
                aria-label="Current RA amount"
              />
              {raLocked && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  RA forms only at age 55 — $0 until then.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer row — full width */}
        <div className="lg:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="submit"
            disabled={busy || !canEdit}
            title={!canEdit ? "Administrator sign-in or granted access required" : undefined}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>

          {saved && (
            <p role="status" className="text-sm font-medium text-[var(--color-primary)]">
              Saved ✓
            </p>
          )}

          {saveErr && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              Error: {saveErr}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
