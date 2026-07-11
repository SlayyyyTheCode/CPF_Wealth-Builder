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

/** CPFIS-OA investment what-if (OA tab).
 *  At `startAge` the OA is split: `keepInOa` stays in the OA earning the 2.5%
 *  floor + extra interest, and everything ABOVE it is invested at `ratePct`.
 *  `monthly` is the amount rerouted from the monthly OA contribution into the
 *  investment (CPFIS-OA can only be funded from OA, so this is not new money —
 *  it is subtracted from what reaches the OA bucket). */
export interface OaInvestParams {
  keepInOa: number;
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

/** One year of OA interest: the 2.5% floor plus the extra interest.
 *  Extra interest: OA is counted FIRST toward the combined-balance tiers and is
 *  capped at $20k, so its whole slice always sits in the top tier — +1% below
 *  55, +2% from 55 (where the top tier is the first $30k of combined). */
export const OA_EXTRA_CAP = 20_000;
function oaYearInterest(bal: number, age: number): number {
  const extraRate = age >= 55 ? 0.02 : 0.01;
  return bal * OA_RATE + extraRate * Math.min(Math.max(bal, 0), OA_EXTRA_CAP);
}

export interface OaSplitRow {
  age: number;
  oaOnly: number;    // everything stays in OA
  retained: number;  // the kept-in-OA bucket
  invested: number;  // the CPFIS-OA bucket
  combined: number;  // retained + invested
}

/** Side-by-side projection: leaving everything in the OA vs. keeping
 *  `keepInOa` in the OA and investing the rest through CPFIS-OA.
 *
 *  BOTH lines run through this same loop, seeded from the same OA balance at
 *  `startAge` and fed the same engine contributions. That is deliberate: if the
 *  "OA only" line came from the engine projection while the invested line was
 *  hand-rolled here, every difference between the two models would masquerade
 *  as an investment gain. Same loop => the only difference between the lines is
 *  the investing itself, and the gap is honest.
 *
 *  Money is conserved. CPFIS-OA can only be funded FROM the OA, so `monthly` is
 *  the slice of each year's OA contribution REROUTED into the investment, not
 *  fresh cash — it is subtracted from what reaches the OA bucket, and capped at
 *  the actual contribution so it can never invent dollars.
 *
 *  Not modelled: the housing mortgage (an OA-tab-local input) and the age-55
 *  OA->RA sweep. Both would hit the two lines identically, so the GAP between
 *  them — which is what the comparison is for, and what Overview consumes —
 *  stays correct; only the absolute levels past 55 run high. */
export function simulateOaSplit(years: YearRow[], p: OaInvestParams): OaSplitRow[] {
  const r = p.ratePct / 100;
  const startIdx = years.findIndex((y) => y.age >= p.startAge);
  if (startIdx < 0) return [];

  const oaStart = years[startIdx].closing.OA;
  let oaOnly = oaStart;
  let retained = Math.min(Math.max(p.keepInOa, 0), oaStart);
  let invested = Math.max(oaStart - Math.max(p.keepInOa, 0), 0);

  const rows: OaSplitRow[] = [
    { age: years[startIdx].age, oaOnly, retained, invested, combined: retained + invested },
  ];

  for (let i = startIdx + 1; i < years.length; i++) {
    const y = years[i];
    const contrib = y.contribution_by_account?.OA ?? 0;
    // Reroute at most what actually flows in — never create money.
    const toInvest = Math.min(Math.max(p.monthly, 0) * 12, contrib);
    const toOa = contrib - toInvest;

    oaOnly = oaOnly + oaYearInterest(oaOnly, y.age) + contrib;
    retained = retained + oaYearInterest(retained, y.age) + toOa;
    invested = invested * (1 + r) + toInvest;

    rows.push({ age: y.age, oaOnly, retained, invested, combined: retained + invested });
  }
  return rows;
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
  // CPFIS-OA investing: take the GAP between the two lines of the same
  // simulation (combined - oaOnly), never the invested pot on its own. The
  // invested principal is OA money the baseline already grows at 2.5%, so
  // adding the whole pot on top would double-count it — the same bug the
  // OA->SA transfer had. Using the gap also cancels any drift between this
  // loop's interest model and the engine's, since both lines share the loop.
  const invGap = new Map<number, number>();
  if (p.oaInvest) {
    for (const row of simulateOaSplit(years, p.oaInvest)) {
      invGap.set(row.age, row.combined - row.oaOnly);
    }
  }

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
    const invE = invGap.get(y.age) ?? 0;
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
