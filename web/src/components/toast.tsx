"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; msg: string };

type ToastApi = {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
};

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ACCENT: Record<ToastType, string> = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  info: "var(--color-primary)",
};
const ICON: Record<ToastType, string> = { success: "✓", error: "!", info: "i" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, msg: string) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, type, msg }]);
      // Success/info auto-dismiss; errors persist until dismissed.
      if (type !== "error") setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-40 flex flex-col items-center gap-2 sm:left-auto sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm shadow-[var(--shadow-card)] transition-all motion-reduce:transition-none"
            style={{ borderLeftWidth: 4, borderLeftColor: ACCENT[t.type] }}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: ACCENT[t.type] }}
            >
              {ICON[t.type]}
            </span>
            <p className="flex-1 leading-snug text-[var(--color-fg)]">{t.msg}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
