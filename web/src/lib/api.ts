import type { MemberSummary, Member, NewMember, SimRun, Analysis, IngestResult, SnapshotListItem, MemberUpdate, TaxEstimate, TaxRelief, Residency, SrsWithdrawal } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "cpf_token";

// localStorage so the admin session survives tab close / refresh (sessionStorage
// dropped it, forcing re-login and "can't save").
export const getToken = (): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Per-client access tokens (issued on a correct member password). Held only in
// memory — wiped on a page refresh/reload, so a protected client must re-enter
// its password every time the page is reloaded.
const _memberTokens = new Map<number, string>();
export const setMemberToken = (id: number, t: string) => { _memberTokens.set(id, t); };
export const getMemberToken = (id: number): string | null => _memberTokens.get(id) ?? null;

// ── tiny client cache: reuse one projection/member/policy across tab switches ──
const _cache = new Map<string, Promise<unknown>>();
// Resolved values kept alongside the promise so a tab can read warm data
// *synchronously* on mount (no skeleton flash when switching tabs).
const _settled = new Map<string, unknown>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!_cache.has(key)) {
    _cache.set(
      key,
      fn()
        .then((v) => { _settled.set(key, v); return v; })
        .catch((e) => { _cache.delete(key); throw e; }),
    );
  }
  return _cache.get(key) as Promise<T>;
}
/** Synchronously read an already-resolved cached value, else null. */
function peek<T>(key: string): T | null {
  return (_settled.get(key) as T) ?? null;
}
function invalidate(prefix: string) {
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
  for (const k of _settled.keys()) if (k.startsWith(prefix)) _settled.delete(k);
}
function invalidateMember(id: number) {
  invalidate(`member:${id}`);
  invalidate(`sim:${id}:`);
  invalidate(`analysis:${id}:`);
  invalidate("members");
}

// Prefer the admin token (superuser); else fall back to the member-access token
// for the client being addressed, so protected-profile calls carry their token.
function authHeaders(json = false, memberId?: number): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const t = getToken() ?? (memberId != null ? getMemberToken(memberId) : null);
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export async function apiGet<T>(path: string, memberId?: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", headers: authHeaders(false, memberId) });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, memberId?: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(true, memberId),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown, memberId?: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(true, memberId),
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
  cached(`member:${id}`, () => apiGet<Member>(`/members/${id}`, id));
export const createMember = (m: NewMember) =>
  apiPost<Member>("/members", m).then((r) => { invalidate("members"); return r; });
// Dashboard projections are read-only — persist:false skips the DB write. Cached
// so switching tabs (Overview/Milestones/Medisave/SA) reuses one result.
export const simulate = (id: number, end_age = 90) =>
  cached(`sim:${id}:${end_age}`, () =>
    apiPost<SimRun>(`/members/${id}/simulate`, { end_age, persist: false }, id));
// Optimisation tab's default analysis params — shared so warmClient's
// prefetch lands under the same cache key the page itself requests.
export const DEFAULT_ANALYSIS_PARAMS = { annual_assessable_income: 0, payout_age: 65, end_age: 90 };
export const getAnalysis = (id: number, body: Record<string, unknown> = {}) =>
  cached(`analysis:${id}:${JSON.stringify(body)}`, () =>
    apiPost<Analysis>(`/members/${id}/analysis`, body, id));

// Synchronous warm-cache reads — let a page render with data already on its
// first frame (set by warmClient on entering the client), skipping the loading
// skeleton on tab switches.
export const peekSim = (id: number, end_age = 91) => peek<SimRun>(`sim:${id}:${end_age}`);
export const peekMember = (id: number) => peek<Member>(`member:${id}`);
export const peekPolicy = (year: number) => peek<Record<string, unknown>>(`policy:${year}`);
export const peekAnalysis = (id: number, body: Record<string, unknown> = DEFAULT_ANALYSIS_PARAMS) =>
  peek<Analysis>(`analysis:${id}:${JSON.stringify(body)}`);

// Kick off every read-only cross-tab call as early as possible (on entering a
// client) so every tab reuses one cached result instead of paying its own
// round-trip on first visit. Fire-and-forget, run in parallel — none of these
// need the member profile to have resolved first.
export function warmClient(id: number) {
  simulate(id, 91).catch(() => {});
  getActivePolicy(new Date().getFullYear()).catch(() => {});
  getAnalysis(id, DEFAULT_ANALYSIS_PARAMS).catch(() => {});
}

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

export const verifyMemberPassword = async (id: number, password: string) => {
  const r = await apiPost<{ ok: boolean; token?: string | null }>(`/members/${id}/verify-password`, { password });
  if (r.ok && r.token) setMemberToken(id, r.token);  // unlock subsequent calls
  return r;
};
export const updateMember = (id: number, body: MemberUpdate) =>
  apiPut<Member>(`/members/${id}`, body, id).then((r) => { invalidateMember(id); return r; });
export const simulateWhatIf = (id: number, body: Record<string, unknown>) =>
  apiPost<SimRun>(`/members/${id}/simulate`, body, id);
export const taxEstimate = (income: number, deduction: number) =>
  apiPost<TaxEstimate>("/tax/estimate", { income, deduction });
export const taxReliefCalc = (body: { income: number; rstu_self?: number; rstu_family?: number; voluntary_cpf?: number; srs_contribution?: number; residency?: Residency }) =>
  apiPost<TaxRelief>("/tax/relief", body);
export const srsWithdrawal = (body: { balance: number; annual_income?: number }) =>
  apiPost<SrsWithdrawal>("/srs/withdrawal", body);
