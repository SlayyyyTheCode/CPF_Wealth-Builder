"use client";
import { use, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getMember } from "@/lib/api";

export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [name, setName] = useState<string | undefined>(undefined);
  const [specialAccess, setSpecialAccess] = useState(false);

  useEffect(() => {
    let ok = true;
    getMember(Number(id))
      .then((m) => {
        if (!ok) return;
        setName(m.name);
        setSpecialAccess(!!m.special_access);
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [id]);

  return (
    <AppShell clientId={id} clientName={name ?? "…"} specialAccess={specialAccess}>
      {children}
    </AppShell>
  );
}
