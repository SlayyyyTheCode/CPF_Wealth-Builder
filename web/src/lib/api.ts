import type { MemberSummary, Member, NewMember, SimRun, Analysis, IngestResult, SnapshotListItem, MemberUpdate, TaxEstimate, TaxRelief } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "cpf_token";

// localStorage so the admin session survives tab close / refresh (sessionStorage
// dropped it, forcing re-login and "can't save").
export const getToken = (): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ── tiny client cache: reuse one projection/member/policy across tab switches ──
const _cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!_cache.has(key)) {
    _cache.set(key, fn().catch((e) => { _cache.delete(key); throw e; }));
  }
  return _cache.get(key) as Promise<T>;
}
function invalidate(prefix: string) {
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}
function invalidateMember(id: number) {
  invalidate(`member:${id}`);
  invalidate(`sim:${id}:`);
  invalidate("members");
}

function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  if (res.status === 401) { clearToken(); throw new Error("Session expired — sign in as administrator again."); }
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  if (res.status === 401) { clearToken(); throw new Error("Session expired — sign in as administrator again."); }
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

/** Admin login — stores JWT on success, throws on bad credentials. */
export async function adminLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid ID or password." : `Login failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  setToken(data.access_token);
}

export const listMembers = () => cached("members", () => apiGet<MemberSummary[]>("/members"));
export const deleteMember = (id: number) =>
  apiDelete(`/members/${id}`).then(() => invalidateMember(id));
export const getMember = (id: number) =>
  cached(`member:${id}`, () => apiGet<Member>(`/members/${id}`));
export const createMember = (m: NewMember) =>
  apiPost<Member>("/members", m).then((r) => { invalidate("members"); return r; });
// Dashboard projections are read-only — persist:false skips the DB write. Cached
// so switching tabs (Overview/Milestones/Medisave/SA) reuses one result.
export const simulate = (id: number, end_age = 90) =>
  cached(`sim:${id}:${end_age}`, () =>
    apiPost<SimRun>(`/members/${id}/simulate`, { end_age, persist: false }));
export const getAnalysis = (id: number, body: Record<string, unknown> = {}) =>
  apiPost<Analysis>(`/members/${id}/analysis`, body);

export async function ingestPolicy(file: File): Promise<IngestResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/policy/ingest`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Ingest failed: ${res.status}`);
  return res.json() as Promise<IngestResult>;
}
export const listSnapshots = () => apiGet<SnapshotListItem[]>("/policy/snapshots");
export const getActivePolicy = (year: number) =>
  cached(`policy:${year}`, () => apiGet<Record<string, unknown>>(`/policy/active?year=${year}`));
export const createSnapshot = (body: Record<string, unknown>) =>
  apiPost<{ id: number }>("/policy/snapshots", body);
export const approveSnapshot = (id: number) =>
  apiPost<{ id: number; status: string }>(`/policy/snapshots/${id}/approve`, {});

export const updateMember = (id: number, body: MemberUpdate) =>
  apiPut<Member>(`/members/${id}`, body).then((r) => { invalidateMember(id); return r; });
export const simulateWhatIf = (id: number, body: Record<string, unknown>) =>
  apiPost<SimRun>(`/members/${id}/simulate`, body);
export const taxEstimate = (income: number, deduction: number) =>
  apiPost<TaxEstimate>("/tax/estimate", { income, deduction });
export const taxReliefCalc = (body: { income: number; rstu_self?: number; rstu_family?: number; voluntary_cpf?: number }) =>
  apiPost<TaxRelief>("/tax/relief", body);
