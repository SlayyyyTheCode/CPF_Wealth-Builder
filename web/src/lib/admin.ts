"use client";
import { useSyncExternalStore } from "react";
import { adminLogin, getToken, clearToken, subscribeToken } from "@/lib/api";

/* Admin session backed by a server-issued JWT (see api/app/routers/auth.py).
   No credentials live in this bundle — login is verified server-side and the
   token is stored in sessionStorage. */

/** True while an admin token is present. Reads the token store directly rather
 *  than mirroring it into state from an effect: the effect version only picked
 *  up a login on a later render, so callers (e.g. the nav tabs) could stay
 *  locked after a successful sign-in. The server snapshot is `false` so the
 *  prerendered HTML matches the first client render — no hydration mismatch. */
export function useIsAdmin(): boolean {
  return useSyncExternalStore(
    subscribeToken,
    () => !!getToken(),
    () => false,
  );
}

export function useAdmin() {
  const isAdmin = useIsAdmin();

  /** Returns true on success, false on bad credentials. */
  async function login(username: string, password: string): Promise<boolean> {
    try {
      await adminLogin(username, password);  // setToken() notifies the store
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    clearToken();  // notifies the store
  }

  return { isAdmin, login, logout };
}
