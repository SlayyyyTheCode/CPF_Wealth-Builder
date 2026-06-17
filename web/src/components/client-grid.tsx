"use client";
import { useCallback, useEffect, useState } from "react";
import { listMembers } from "@/lib/api";
import type { MemberSummary } from "@/lib/types";
import { ClientCard } from "./client-card";
import { AdminBar } from "./admin-bar";
import { ErrorState } from "./error-state";
import { RocketIcon } from "./icons";
import { useAdmin } from "@/lib/admin";

export function ClientGrid({ onNew }: { onNew: () => void }) {
  const [rows, setRows] = useState<MemberSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { isAdmin, login, logout } = useAdmin();

  const load = useCallback(() => {
    listMembers().then(setRows).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <ErrorState message={err} onRetry={() => { setErr(null); load(); }} />;
  if (rows === null)
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map(i =>
      <div key={i} className="h-32 animate-pulse rounded-2xl bg-[var(--color-surface-raised)]" />)}</div>;

  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <AdminBar isAdmin={isAdmin} onLogin={login} onLogout={logout} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
          aria-label="Search clients"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:max-w-xs" />
        <button onClick={onNew}
          className="rounded-full bg-[var(--color-primary)] px-5 py-2 font-semibold text-white hover:bg-[var(--color-primary-hover)]">
          + New client
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center">
          <RocketIcon className="mx-auto mb-3 h-14 w-14" />
          <p className="font-semibold">No clients yet</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Add your first client to start projecting their CPF.</p>
          <button onClick={onNew} className="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-2 font-semibold text-white">+ New client</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => <ClientCard key={m.id} m={m} admin={isAdmin} onDeleted={load} />)}
        </div>
      )}
    </>
  );
}
