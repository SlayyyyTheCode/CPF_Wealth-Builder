"use client";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ClientGrid } from "@/components/client-grid";
import { MemberFormDialog } from "@/components/member-form-dialog";
import { PageHeading, ClientsIcon } from "@/components/icons";

export default function Home() {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <AppShell>
      <PageHeading
        icon={<ClientsIcon className="h-7 w-7" />}
        title="Clients"
        subtitle="Select a client to view their CPF dashboard, or add a new one."
      />
      <ClientGrid key={reloadKey} onNew={() => setOpen(true)} />
      <MemberFormDialog open={open} onClose={() => setOpen(false)}
        onCreated={() => { setOpen(false); setReloadKey(k => k + 1); }} />
    </AppShell>
  );
}
