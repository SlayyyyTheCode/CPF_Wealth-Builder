"use client";
import { useState } from "react";
import { ShieldCheckIcon } from "./icons";

export function AdminBar({
  isAdmin,
  onLogin,
  onLogout,
}: {
  isAdmin: boolean;
  onLogin: (id: string, pw: string) => boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (onLogin(id, pw)) {
      setOpen(false);
      setId("");
      setPw("");
      setErr(null);
    } else {
      setErr("Invalid ID or password.");
    }
  }

  if (isAdmin) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--chart-2)] bg-[var(--color-surface-raised)] px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
          <ShieldCheckIcon className="h-6 w-6" />
          Administrator mode — full control enabled
        </span>
        <button
          onClick={onLogout}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm font-medium hover:border-[var(--color-primary)]"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-fg)]"
        >
          <ShieldCheckIcon className="h-5 w-5" />
          Administrator sign in
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Administrator sign in"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl"
          >
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-8 w-8" />
              <h2 className="text-lg font-bold">Administrator sign in</h2>
            </div>

            <div>
              <label htmlFor="admin-id" className="mb-1 block text-xs font-medium">
                Administrator ID
              </label>
              <input
                id="admin-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div>
              <label htmlFor="admin-pw" className="mb-1 block text-xs font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-pw"
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--color-primary)]"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {err && (
              <p role="alert" className="text-sm text-[var(--color-error)]">
                {err}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                Sign in
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
