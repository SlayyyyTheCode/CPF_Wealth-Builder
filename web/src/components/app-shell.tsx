"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

interface TabDef {
  label: string;
  href: string | null; // null = coming soon, no link
}

function buildTabs(clientId: string): TabDef[] {
  return [
    { label: "Overview",            href: `/clients/${clientId}` },
    { label: "Milestones",          href: `/clients/${clientId}/milestones` },
    { label: "Ordinary Account (OA)", href: `/clients/${clientId}/oa` },
    { label: "Medisave (MA)",       href: `/clients/${clientId}/medisave` },
    { label: "Special Account (SA)", href: `/clients/${clientId}/sa` },
    { label: "Optimisation",        href: `/clients/${clientId}/optimisation` },
    { label: "Housing",             href: null },
    { label: "Settings",            href: `/clients/${clientId}/settings` },
  ];
}

export function AppShell({
  clientId,
  clientName,
  children,
}: {
  clientId?: string;
  clientName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tabs = clientId ? buildTabs(clientId) : [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="font-bold text-white">
            <Link href="/" className="hover:opacity-90 transition-opacity">CPF Builder</Link>
            {clientName && (
              <span className="text-white/80"> · {clientName}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/policy"
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              Policy admin
            </Link>
            <ThemeToggle />
          </div>
        </div>
        {clientId && (
          <nav
            className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6"
            aria-label="Dashboard sections"
          >
            <ul className="flex gap-1 pb-2 text-sm">
              {tabs.map((tab) => {
                // Overview is exact match; others also exact
                const isActive = tab.href !== null && pathname === tab.href;
                return (
                  <li key={tab.label}>
                    {tab.href !== null ? (
                      <Link
                        href={tab.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`inline-block whitespace-nowrap rounded-full px-4 py-1.5 transition-colors ${
                          isActive
                            ? "bg-white text-[var(--color-primary)] font-semibold"
                            : "text-white/80 hover:bg-white/15"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    ) : (
                      <span className="inline-block whitespace-nowrap rounded-full px-4 py-1.5 text-white/50 cursor-default select-none">
                        {tab.label} (soon)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
