// Shared "Top-up what-if" parameters, persisted per member so the Overview tab
// can combine the OA / SA / MA calculators. Stored in localStorage; absent or
// zero amounts mean "use the baseline projection" for that account.
import type { YearRow } from "@/lib/types";

export const OA_RATE = 0.025;
export const SA_RATE = 0.04;
export const MA_RATE = 0.04;

export interface OaParams { topup: number; startAge: number }
export interface MaParams { topup: number; startAge: number }
export interface SaParams { topup: number; transfer: number; startAge: number; years: number }

export interface WhatIfParams { oa?: OaParams; sa?: SaParams; ma?: MaParams }

const KEY = (id: number) => `cpf_whatif_${id}`;

export function getWhatIf(id: number): WhatIfParams {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY(id)) ?? "{}") as WhatIfParams; }
  catch { return {}; }
}

export function setWhatIf(id: number, patch: WhatIfParams) {
  if (typeof window === "undefined") return;
  const next = { ...getWhatIf(id), ...patch };
  localStorage.setItem(KEY(id), JSON.stringify(next));
}

/** Future value at `age` of a yearly `amt` paid from `startAge`, compounded. */
function annuityExtra(amt: number, startAge: number, age: number, rate: number): number {
  const k = age - startAge + 1;
  return amt > 0 && k > 0 ? amt * (((1 + rate) ** k - 1) / rate) : 0;
}

const retClosing = (y: YearRow) => (y.closing.RA > 0 ? y.closing.RA : y.closing.SA);

export interface ScenarioRow { age: number; base: number; scen: number }

/** Per-year combined CPF (OA+SA+MA+RA): baseline vs the what-if scenario.
 *  SA top-up + transfer are applied yearly within their window and stop at the
 *  FRS; OA/MA top-ups are simple yearly annuities. */
export function buildScenario(
  years: YearRow[],
  p: WhatIfParams,
  frsInfo: { frs: number; sumRate: number; baseYear: number },
): ScenarioRow[] {
  const projFrs = (year: number) =>
    frsInfo.frs * Math.pow(1 + frsInfo.sumRate, Math.max(year - frsInfo.baseYear, 0));

  // SA/RA extra pot, iterated with the FRS auto-stop.
  const saExtra = new Map<number, number>();
  let extraPrev = 0;
  let stopped = false;
  for (const y of years) {
    let extraEnd = extraPrev * (1 + SA_RATE);
    const sa = p.sa;
    const within = sa && y.age >= sa.startAge && y.age < sa.startAge + sa.years;
    if (sa && within && !stopped) extraEnd += sa.topup + sa.transfer;
    if (retClosing(y) + extraEnd >= projFrs(y.year)) stopped = true;
    saExtra.set(y.age, extraEnd);
    extraPrev = extraEnd;
  }

  return years.map((y) => {
    const base = y.closing.OA + y.closing.SA + y.closing.MA + y.closing.RA;
    const oaE = p.oa ? annuityExtra(p.oa.topup, p.oa.startAge, y.age, OA_RATE) : 0;
    const maE = p.ma ? annuityExtra(p.ma.topup, p.ma.startAge, y.age, MA_RATE) : 0;
    const saE = saExtra.get(y.age) ?? 0;
    return { age: y.age, base, scen: base + oaE + maE + saE };
  });
}
