"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export default function HealthPage() {
  const [status, setStatus] = useState("checking…");
  const setApiHealthy = useAppStore((s) => s.setApiHealthy);

  useEffect(() => {
    apiGet<{ status: string }>("/health")
      .then((d) => {
        setStatus(`API: ${d.status}`);
        setApiHealthy(true);
      })
      .catch((e) => {
        setStatus(`API error: ${e.message}`);
        setApiHealthy(false);
      });
  }, [setApiHealthy]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-xl font-medium">{status}</p>
    </main>
  );
}
