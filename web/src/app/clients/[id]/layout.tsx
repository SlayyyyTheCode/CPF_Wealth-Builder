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

  useEffect(() => {
    let ok = true;
    getMember(Number(id))
      .then((m) => ok && setName(m.name))
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [id]);

  return (
    <AppShell clientId={id} clientName={name ?? "…"}>
      {children}
    </AppShell>
  );
}
