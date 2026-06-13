"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PolicyDiffTable } from "@/components/policy-diff-table";
import { SnapshotHistory } from "@/components/snapshot-history";
import { FormulaAssumptions } from "@/components/formula-assumptions";
import {
  ingestPolicy,
  listSnapshots,
  getActivePolicy,
  createSnapshot,
  approveSnapshot,
} from "@/lib/api";
import { sgd } from "@/lib/format";
import type { Assumptions, IngestResult, PolicyCore, SnapshotListItem } from "@/lib/types";

const CORE_FIELDS: { key: keyof PolicyCore; label: string; isYear?: boolean }[] =
  [
    { key: "effective_year", label: "Effective year", isYear: true },
    { key: "frs", label: "FRS" },
    { key: "brs", label: "BRS" },
    { key: "ers", label: "ERS" },
    { key: "bhs", label: "BHS" },
    { key: "ordinary_wage_ceiling", label: "OW ceiling" },
    { key: "additional_wage_ceiling", label: "AW ceiling" },
    { key: "cpf_life_eligibility_min", label: "CPF LIFE min" },
  ];

const DEFAULT_ASSUMPTIONS: Assumptions = {
  readiness: { w_sum: 0.7, w_ma: 0.3, on_track: 70, below_frs_pace: 40 },
  growth: { sum_rate: 0.035, bhs_rate: 0.045 },
  cpf_life: {
    longevity_age: 90,
    ra_rate: 0.04,
    escalating_rate: 0.02,
    basic_decline: 0.03,
    deferral_per_year: 0.07,
    deferral_cap: 0.35,
  },
};

export default function PolicyAdminPage() {
  const [history, setHistory] = useState<SnapshotListItem[] | null>(null);
  const [activePolicy, setActivePolicy] = useState<Record<string, unknown> | null>(
    null
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [edited, setEdited] = useState<PolicyCore | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Assumptions state — populated from active snapshot or defaults
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [assumptionsBusy, setAssumptionsBusy] = useState(false);
  const [assumptionsErr, setAssumptionsErr] = useState<string | null>(null);
  const [assumptionsSuccess, setAssumptionsSuccess] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // Load history + active policy on mount
  useEffect(() => {
    let ok = true;
    listSnapshots()
      .then((s) => ok && setHistory(s))
      .catch((e) => ok && setLoadErr((e as Error).message));
    getActivePolicy(new Date().getFullYear())
      .then((p) => {
        if (!ok) return;
        setActivePolicy(p);
        // Seed assumptions from the active snapshot if present, else keep defaults
        const a = (p?.assumptions as Assumptions | undefined);
        if (a) setAssumptions(a);
      })
      .catch(() => ok && setActivePolicy(null)); // tolerate 404
    return () => {
      ok = false;
    };
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFileErr(null);
    setIngestResult(null);
    setEdited(null);
    setSuccessMsg(null);
    try {
      const result = await ingestPolicy(file);
      setIngestResult(result);
      setEdited({ ...result.extracted });
    } catch (err) {
      setFileErr((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleEditedChange(key: keyof PolicyCore, raw: string) {
    if (!edited) return;
    const num = raw === "" ? 0 : Number(raw);
    setEdited({ ...edited, [key]: isNaN(num) ? edited[key] : num });
  }

  async function handleCreateApprove() {
    if (!edited || !ingestResult) return;
    setBusy(true);
    setFileErr(null);
    setSuccessMsg(null);
    try {
      const body = { ...ingestResult.carried_forward, ...edited } as Record<
        string,
        unknown
      >;
      const { id } = await createSnapshot(body);
      await approveSnapshot(id);
      setSuccessMsg(`Snapshot #${id} created and approved.`);
      setIngestResult(null);
      setEdited(null);
      if (fileRef.current) fileRef.current.value = "";
      // Refresh history + active
      const [updated, active] = await Promise.all([
        listSnapshots(),
        getActivePolicy(new Date().getFullYear()).catch(() => null),
      ]);
      setHistory(updated);
      if (active) {
        setActivePolicy(active);
        const a = (active?.assumptions as Assumptions | undefined);
        if (a) setAssumptions(a);
      }
    } catch (err) {
      setFileErr((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAssumptions() {
    if (!activePolicy) return;
    setAssumptionsBusy(true);
    setAssumptionsErr(null);
    setAssumptionsSuccess(null);
    try {
      // Build body from active snapshot, stripping server-only fields, then inject assumptions
      const body: Record<string, unknown> = { ...activePolicy, assumptions };
      delete body.id;
      delete body.status;
      delete body.created_at;
      delete body.approved_at;
      delete body.approved_by;
      const { id } = await createSnapshot(body);
      await approveSnapshot(id);
      setAssumptionsSuccess("Assumptions saved as new active snapshot.");
      // Refresh history + active
      const [updated, active] = await Promise.all([
        listSnapshots(),
        getActivePolicy(new Date().getFullYear()).catch(() => null),
      ]);
      setHistory(updated);
      if (active) {
        setActivePolicy(active);
        const a = (active?.assumptions as Assumptions | undefined);
        if (a) setAssumptions(a);
      }
    } catch (err) {
      setAssumptionsErr((err as Error).message);
    } finally {
      setAssumptionsBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold">Policy admin</h1>

      {loadErr && (
        <p role="alert" className="mb-4 text-[var(--color-error)]">
          {loadErr}
        </p>
      )}

      {/* ── Active snapshot ─────────────────────────────────── */}
      <section aria-label="Active snapshot" className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Active snapshot</h2>
        {activePolicy == null && !loadErr ? (
          <p className="text-sm text-[var(--color-muted)]">None found for this year.</p>
        ) : activePolicy ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm shadow-[var(--shadow-card)]">
            <span className="font-semibold">
              {String(activePolicy.effective_year ?? "—")}
            </span>
            <span className="ml-4 text-[var(--color-muted)]">
              FRS {sgd(activePolicy.frs as number | null)} · BHS{" "}
              {sgd(activePolicy.bhs as number | null)}
            </span>
          </div>
        ) : (
          <div className="h-10 w-64 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
        )}
      </section>

      {/* ── Formulas & assumptions ──────────────────────────── */}
      {activePolicy && (
        <section aria-label="Formulas and assumptions" className="mb-8">
          <h2 className="mb-3 text-base font-semibold">Formulas &amp; assumptions</h2>

          <FormulaAssumptions value={assumptions} onChange={setAssumptions} />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAssumptions}
              disabled={assumptionsBusy}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assumptionsBusy ? "Saving…" : "Save assumptions"}
            </button>

            {assumptionsErr && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {assumptionsErr}
              </p>
            )}
            {assumptionsSuccess && (
              <p role="status" className="text-sm font-medium text-[var(--color-success)]">
                {assumptionsSuccess}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Upload & extract ────────────────────────────────── */}
      <section aria-label="Upload and extract policy" className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Upload &amp; extract</h2>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Select a CPF policy PDF to extract parameters
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={handleFileChange}
            className="block w-full max-w-sm cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        {busy && (
          <div className="mb-4 space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-[var(--color-surface-raised)]" />
            <div className="h-32 animate-pulse rounded-xl bg-[var(--color-surface-raised)]" />
          </div>
        )}

        {fileErr && (
          <p role="alert" className="mb-4 text-sm text-[var(--color-error)]">
            {fileErr}
          </p>
        )}

        {successMsg && (
          <p role="status" className="mb-4 text-sm font-medium text-[var(--color-success)]">
            {successMsg}
          </p>
        )}

        {ingestResult && edited && (
          <div className="space-y-5">
            {/* Diff table */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                Field comparison
              </h3>
              <PolicyDiffTable rows={ingestResult.diff} />
            </div>

            {/* Editable fields */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">
                Review &amp; edit extracted values
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CORE_FIELDS.map(({ key, label, isYear }) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-[var(--color-muted)]">
                      {label}
                    </span>
                    <input
                      type="number"
                      min={isYear ? 2000 : 0}
                      step={isYear ? 1 : 100}
                      value={edited[key]}
                      onChange={(e) => handleEditedChange(key, e.target.value)}
                      disabled={busy}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Create & approve */}
            <button
              type="button"
              onClick={handleCreateApprove}
              disabled={busy}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Working…" : "Create & approve new snapshot"}
            </button>
          </div>
        )}
      </section>

      {/* ── Version history ──────────────────────────────────── */}
      <section aria-label="Version history">
        <h2 className="mb-3 text-base font-semibold">Version history</h2>
        {history == null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-xl bg-[var(--color-surface-raised)]"
              />
            ))}
          </div>
        ) : (
          <SnapshotHistory items={history} />
        )}
      </section>
    </AppShell>
  );
}
