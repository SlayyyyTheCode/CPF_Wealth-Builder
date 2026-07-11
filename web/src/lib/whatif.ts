// Shared "Top-up what-if" parameters, persisted per member so the Overview tab
// can combine the OA / SA / MA calculators. Stored in localStorage; absent or
// zero amounts mean "use the baseline projection" for that account.
import type { YearRow } from "@/lib/types";

export const OA_RATE = 0.025;
export const SA_RATE = 0.04;
export const MA_RATE = 0.04;

export interface OaParams { topup: number; startAge: number }
export interface MaParams { topup: number; startAge: number }
export interface SaParams { topup: number; transfer: number; startAge: number; transferStartAge: number; years: number }

/** CPFIS-OA investment what-if (OA tab). `investible` is the lump moved out of
 *  OA into investments at `startAge`; `monthly` is fresh money invested every
 *  month from then on; `ratePct` is the assumed annual return. */
export interface OaInvestParams {
  investible: number;
  startAge: number;
  ratePct: number;
  monthly: number;
}

export interface WhatIfParams {
  oa?: OaParams;
  sa?: SaParams;
  ma?: MaParams;
  oaInvest?: OaInvestParams;
}

// ── CPFIS hard rules (cpf.gov.sg) ────────────────────────────────────────────
/** You may only invest OA savings ABOVE this floor. */
export const CPFIS_OA_FLOOR = 20_000;
/** Sub-limits, as a share of investible savings. */
export const CPFIS_STOCK_LIMIT = 0.35;
export const CPFIS_GOLD_LIMIT = 0.10;

/** Investible savings = OA balance above the $20k floor. */
export const investibleOa = (oa: number) => Math.max(oa - CPFIS_OA_FLOOR, 0);

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

/** Gross value of the CPFIS-OA investment pot at `age`: the lump compounded at
 *  the assumed return, plus the future value of the monthly contributions.
 *  This is what the OA tab's calculator displays. */
export function oaInvestValue(p: OaInvestParams, age: number): number {
  const r = p.ratePct / 100;
  const k = age - p.startAge;
  if (k < 0) return 0;
  const lump = p.investible > 0 ? p.investible * (1 + r) ** k : 0;
  const contrib = annuityExtra(p.monthly * 12, p.startAge, age, r);
  return lump + contrib;
}

/** Effect of the CPFIS-OA investment on the COMBINED total at `age`.
 *
 *  Not the same as the gross pot value above. The invested lump is OA money
 *  that the baseline projection is already growing at the 2.5% OA floor, so
 *  crediting the whole grown pot would count that principal twice (the same
 *  double-count the OA→SA transfer had). Only the *uplift* over what those
 *  dollars would have earned sitting in OA is new:
 *
 *      lump x [ (1+r)^k  -  (1+2.5%)^k ]
 *
 *  A return below 2.5% therefore correctly shows up as a NEGATIVE delta —
 *  investing can lose against the risk-free floor, and the app should say so.
 *  Monthly contributions are fresh money not present in the baseline, so their
 *  full future value is additive. */
export function oaInvestDelta(p: OaInvestParams, age: number): number {
  const r = p.ratePct / 100;
  const k = age - p.startAge;
  if (k < 0) return 0;
  const lumpUplift =
    p.investible > 0 ? p.investible * ((1 + r) ** k - (1 + OA_RATE) ** k) : 0;
  const contrib = annuityExtra(p.monthly * 12, p.startAge, age, r);
  return lumpUplift + contrib;
}

// MA can't fund a CPF LIFE payout (or general spending) — kept out of the
// "payout-eligible" base/scen total and reported separately.
export interface ScenarioRow {
  age: number;
  baseOa: number; scenOa: number;
  baseRa: number; scenRa: number;   // SA pre-55, RA post-55 (whichever holds the balance)
  baseMa: number; scenMa: number;
  base: number; scen: number;       // payout-eligible: OA + SA/RA, excludes MA
}

/** Per-year payout-eligible CPF (OA + SA/RA) and MediSave (MA), baseline vs
 *  the what-if scenario. SA top-up + transfer are applied yearly within their
 *  window and stop at the FRS; OA/MA top-ups are simple yearly annuities.
 *  `current`, if given, anchors the first row (today's age) to the member's
 *  actual current balances instead of that year's simulated year-END closing
 *  balance — so "Original total" at the default age matches "Total CPF now"
 *  exactly (minus MA, which is reported separately). Every later age is still
 *  a projection (year-end closing), same as the rest of the app. */
export function buildScenario(
  years: YearRow[],
  p: WhatIfParams,
  frsInfo: { frs: number; sumRate: number; baseYear: number },
  current?: { OA: number; SA: number; MA: number; RA: number },
): ScenarioRow[] {
  const projFrs = (year: number) =>
    frsInfo.frs * Math.pow(1 + frsInfo.sumRate, Math.max(year - frsInfo.baseYear, 0));

  // SA/RA extra pot, iterated with the FRS auto-stop. Row 0's threshold check
  // uses the same anchored "now" balance as its displayed base, so the stop
  // decision at today's age is consistent with what's actually shown.
  //
  // The OA→SA transfer MOVES money, it doesn't add any: every transferred
  // dollar that lands in the SA pot must also leave the OA. We track a
  // parallel "OA outflow" pot compounding at the OA rate — the balance (and
  // forgone 2.5% interest) the OA no longer has. Without this the combined
  // total double-counted each year's transfer as free new money.
  const saExtra = new Map<number, number>();
  const oaOut = new Map<number, number>();
  let extraPrev = 0;
  let outPrev = 0;
  let stopped = false;
  years.forEach((y, i) => {
    let extraEnd = extraPrev * (1 + SA_RATE);
    let outEnd = outPrev * (1 + OA_RATE);
    const sa = p.sa;
    if (sa && !stopped) {
      if (y.age >= sa.startAge && y.age < sa.startAge + sa.years) extraEnd += sa.topup;
      const tStart = sa.transferStartAge ?? sa.startAge;
      if (y.age >= tStart && y.age < tStart + sa.years) {
        extraEnd += sa.transfer;
        outEnd += sa.transfer;
      }
    }
    const raBase = i === 0 && current != null
      ? (current.RA > 0 ? current.RA : current.SA)
      : retClosing(y);
    // frsInfo.frs starts at 0 until the policy fetch resolves — guard against
    // treating that placeholder as "already at FRS" and zeroing the top-up out.
    if (frsInfo.frs > 0 && raBase + extraEnd >= projFrs(y.year)) stopped = true;
    saExtra.set(y.age, extraEnd);
    oaOut.set(y.age, outEnd);
    extraPrev = extraEnd;
    outPrev = outEnd;
  });

  return years.map((y, i) => {
    const isNow = i === 0 && current != null;
    const baseOa = isNow ? current!.OA : y.closing.OA;
    const baseRa = isNow ? (current!.RA > 0 ? current!.RA : current!.SA) : retClosing(y);
    const baseMa = isNow ? current!.MA : y.closing.MA;
    const oaE = p.oa ? annuityExtra(p.oa.topup, p.oa.startAge, y.age, OA_RATE) : 0;
    const maE = p.ma ? annuityExtra(p.ma.topup, p.ma.startAge, y.age, MA_RATE) : 0;
    const invE = p.oaInvest ? oaInvestDelta(p.oaInvest, y.age) : 0;
    const saE = saExtra.get(y.age) ?? 0;
    const outE = oaOut.get(y.age) ?? 0;
    // OA can't go below zero — a transfer bigger than the OA just drains it.
    const scenOa = Math.max(baseOa + oaE + invE - outE, 0);
    const scenRa = baseRa + saE;
    const scenMa = baseMa + maE;
    return {
      age: y.age,
      baseOa, scenOa,
      baseRa, scenRa,
      baseMa, scenMa,
      base: baseOa + baseRa,
      scen: scenOa + scenRa,
    };
  });
}
