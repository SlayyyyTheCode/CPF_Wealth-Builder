"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getMember, warmClient, verifyMemberPassword, getToken } from "@/lib/api";
import type { Member } from "@/lib/types";

const unlockKey = (id: string) => `cpf_unlock_${id}`;

export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [member, setMember] = useState<Member | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let ok = true;
    warmClient(Number(id));
    const isAdmin = !!getToken();
    const alreadyUnlocked =
      typeof window !== "undefined" && sessionStorage.getItem(unlockKey(id)) === "1";
    setUnlocked(isAdmin || alreadyUnlocked);
    getMember(Number(id))
      .then((m) => ok && setMember(m))
      .catch(() => {});
    return () => { ok = false; };
  }, [id]);

  async function submitPw(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setPwErr(null);
    try {
      const { ok } = await verifyMemberPassword(Number(id), pw);
      if (ok) {
        sessionStorage.setItem(unlockKey(id), "1");
        setUnlocked(true);
      } else {
        setPwErr("Incorrect password.");
      }
    } catch (e2) {
      setPwErr((e2 as Error).message);
    } finally {
      setChecking(false);
    }
  }

  // Locked dashboard: password set, viewer is not admin, not yet unlocked.
  const needGate = member?.has_password && !unlocked;

  if (needGate) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <form
          onSubmit={submitPw}
          className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]"
        >
          <h1 className="text-lg font-bold">🔒 Protected client</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Enter the password to view {member?.name ?? "this client"}&apos;s dashboard.
          </p>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            aria-label="Client password"
          />
          {pwErr && <p role="alert" className="mt-2 text-sm text-[var(--color-error)]">{pwErr}</p>}
          <div className="mt-4 flex items-center justify-between">
            <Link href="/" className="text-sm text-[var(--color-muted)] hover:underline">← Back to clients</Link>
            <button
              type="submit"
              disabled={checking || !pw}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? "Checking…" : "Unlock"}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          App-level gate. Data is not encrypted server-side.
        </p>
      </div>
    );
  }

  return (
    <AppShell clientId={id} clientName={member?.name ?? "…"} specialAccess={!!member?.special_access}>
      {children}
    </AppShell>
  );
}
