"use client";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-card)]"
    >
      <span
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ background: "var(--color-error)" }}
      >
        !
      </span>
      <p className="mt-3 font-semibold text-[var(--color-fg)]">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-muted)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
