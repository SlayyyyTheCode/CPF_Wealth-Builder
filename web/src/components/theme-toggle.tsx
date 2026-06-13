"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  if (!m) return <span className="h-9 w-9" aria-hidden />;
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
