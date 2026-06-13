"use client";
import { useEffect, useState } from "react";

/* Lightweight client-side admin gate. NOTE: this is a convenience lock for a
   local advisory tool, NOT real security — the credentials live in the bundle
   and anyone with dev tools can bypass it. Protect destructive ops server-side
   if this app is ever exposed beyond a trusted machine. */
const ADMIN_ID = "useradmin";
const ADMIN_PW = "P@ssw0rd2022";
const KEY = "cpf_admin";

export function checkCredentials(id: string, pw: string): boolean {
  return id === ADMIN_ID && pw === ADMIN_PW;
}

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem(KEY) === "1");
  }, []);

  function login(id: string, pw: string): boolean {
    if (checkCredentials(id, pw)) {
      sessionStorage.setItem(KEY, "1");
      setIsAdmin(true);
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem(KEY);
    setIsAdmin(false);
  }

  return { isAdmin, login, logout };
}
