"use client";
import { useEffect, useState } from "react";
import { adminLogin, getToken, clearToken } from "@/lib/api";

/* Admin session backed by a server-issued JWT (see api/app/routers/auth.py).
   No credentials live in this bundle — login is verified server-side and the
   token is stored in sessionStorage. */
export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(!!getToken());
  }, []);

  /** Returns true on success, false on bad credentials. */
  async function login(username: string, password: string): Promise<boolean> {
    try {
      await adminLogin(username, password);
      setIsAdmin(true);
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    clearToken();
    setIsAdmin(false);
  }

  return { isAdmin, login, logout };
}
