"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOpts = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};
type Pending = ConfirmOpts & { resolve: (ok: boolean) => void };

const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    lastFocused.current = (document.activeElement as HTMLElement) ?? null;
    return new Promise<boolean>((resolve) => setPending({ ...o, resolve }));
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
      lastFocused.current?.focus?.();
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Tab") {
        // simple focus trap within the dialog
        const dlg = document.getElementById("confirm-dialog");
        const f = dlg?.querySelectorAll<HTMLElement>("button");
        if (!f || f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => close(false)}
        >
          <div
            id="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[var(--color-fg)]">{pending.title}</h2>
            {pending.message && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">{pending.message}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:border-[var(--color-primary)]"
              >
                {pending.cancelText ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: pending.destructive ? "var(--color-error)" : "var(--color-primary)" }}
              >
                {pending.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
