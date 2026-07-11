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
  /** Display-only: deflates the OA-tab chart into today's dollars. Not applied
   *  to the Overview scenario, which stays nominal like the rest of the app. */
  inflationPct?: number;
  /** Whether Overview's What-If Scenario should apply this investment.
   *
   *  Unlike the other calculators, this one has no natural "zero": its defaults
   *  (keep $20k, return 10%) describe a REAL investment, so simply opening the
   *  OA tab used to write an active scenario and silently inflate the Overview
   *  total with a 10% return the user never asked for. Absent/false means the
   *  calculator is a local preview only and contributes nothing. */
  enabled?: boolean;
}

/** Today's-dollars value of `nominal` received `years` from now. */
export const realValue = (nominal: number, inflationPct: number, years: number) =>
  years <= 0 || inflationPct <= 0
    ? nominal
    : nominal / (1 + inflationPct / 100) ** years;

/** Monthly housing mortgage paid out of the OA (OA tab). Persisted so the
 *  Overview's scenario drains the OA on exactly the same schedule the OA tab
 *  charts — otherwise the two disagree about how much OA there is to invest. */
export interface OaMortgageParams { monthly: number; startAge: number }

export interface WhatIfParams {
  oa?: OaParams;
  sa?: SaParams;
  ma?: MaParams;
  oaInvest?: OaInvestParams;
  oaMortgage?: OaMortgageParams;
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

/** RA interest for one year: the 4% floor plus the 55+ extra-interest tiers
 *  (+2% on the first $30k, +1% on the next $30k). */
function raYearInterest(bal: number): number {
  const b = Math.max(bal, 0);
  const tier1 = Math.min(b, 30_000);
  const tier2 = Math.min(Math.max(b - 30_000, 0), 30_000);
  return b * SA_RATE + 0.02 * tier1 + 0.01 * tier2;
}

export interface OaSplitRow {
  age: number;
  oaOnly: number;    // everything stays in OA
  retained: number;  // the kept-in-OA bucket
  invested: number;  // the CPFIS-OA bucket
  combined: number;  // retained + invested
  raOnly: number;    // RA built by the age-55 sweep, no-investing line
  raSplit: number;   // RA built by the age-55 sweep, investing line
  totalOnly: number; // oaOnly + raOnly       — nothing hidden
  totalSplit: number; // combined + raSplit   — nothing hidden
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
export function simulateOaSplit(
  years: YearRow[],
  p: OaInvestParams,
  mortgage?: OaMortgageParams,
  /** Cumulative OA (by age) already claimed by OTHER levers — today, the
   *  OA→SA transfer. Without it this split treats the full OA as investable
   *  while the transfer is moving the same dollars into the SA, so the scenario
   *  earns investment returns on money it also transferred away. */
  extraDrainByAge?: Map<number, number>,
): OaSplitRow[] {
  const r = p.ratePct / 100;
  const startIdx = years.findIndex((y) => y.age >= p.startAge);
  if (startIdx < 0) return [];

  // The OA you can actually split is the balance AFTER the housing mortgage has
  // taken its cut — the same figure the OA tab shows as the year's closing
  // balance. Seeding from the raw engine balance would let the scenario invest
  // money the mortgage has already spent.
  const mortAnnual = Math.max(mortgage?.monthly ?? 0, 0) * 12;
  const mortFrom = mortgage?.startAge ?? Infinity;
  const drainedBy = (age: number): number => {
    // Forgone OA (the payments plus the 2.5% they would have earned) by `age`.
    if (mortAnnual <= 0) return 0;
    let cum = 0;
    for (const y of years) {
      if (y.age > age) break;
      cum = cum * (1 + OA_RATE) + (y.age >= mortFrom ? mortAnnual : 0);
    }
    return cum;
  };

  // OA claimed by other levers (the OA→SA transfer) — same treatment as the
  // mortgage: it is gone from the OA, so it cannot also be invested.
  const otherDrain = (age: number) => extraDrainByAge?.get(age) ?? 0;

  const oaStart = Math.max(
    years[startIdx].closing.OA - drainedBy(years[startIdx].age) - otherDrain(years[startIdx].age),
    0,
  );
  let oaOnly = oaStart;
  let retained = Math.min(Math.max(p.keepInOa, 0), oaStart);
  let invested = Math.max(oaStart - Math.max(p.keepInOa, 0), 0);
  // RA balances built by the age-55 sweep, tracked per line so that money
  // leaving the OA is shown moving into the RA rather than disappearing.
  let raOnly = 0;
  let raSplit = 0;

  const rows: OaSplitRow[] = [
    {
      age: years[startIdx].age,
      oaOnly, retained, invested,
      raOnly, raSplit,
      combined: retained + invested,
      totalOnly: oaOnly,
      totalSplit: retained + invested,
    },
  ];

  for (let i = startIdx + 1; i < years.length; i++) {
    const y = years[i];
    // OA inflow is NOT just the wage allocation. Once the MA fills to the BHS
    // its excess cascades out — to the SA while that is under the FRS, then to
    // the OA — and from 55 the SA/RA slice above the FRS spills to the OA too.
    // The engine tracks that overflow SEPARATELY from contribution_by_account
    // (which is explicitly "before any overflow out"), so reading only the
    // contribution silently dropped every overflowed dollar. It matters: with a
    // full MA it is worth more than half the wage allocation again. The
    // overflow already carries the MA/SA 4% interest, since a full MA's
    // year-end interest overflows through the same path.
    const wageIn = y.contribution_by_account?.OA ?? 0;
    // sa_to_oa also carries the age-55 SA closure: once the SA has filled the
    // RA to the retirement sum, whatever is left over lands in the OA and keeps
    // earning the OA rate + extra interest.
    const overflowIn =
      (y.overflow_out?.ma_to_oa ?? 0) + (y.overflow_out?.sa_to_oa ?? 0);
    const contrib = wageIn + overflowIn;
    // Reroute at most what actually flows in — never create money.
    const toInvest = Math.min(Math.max(p.monthly, 0) * 12, contrib);
    const toOa = contrib - toInvest;

    // The mortgage is paid out of the OA in BOTH lines — it is a housing cost,
    // not an investment decision, so it must not tilt the comparison. Floored
    // at zero: the OA cannot go negative.
    const mort = y.age >= mortFrom ? mortAnnual : 0;

    // This year's OA→SA transfer. extraDrainByAge is CUMULATIVE and already
    // carries the forgone 2.5%, so take the increment net of that growth —
    // subtracting the cumulative every year would remove it over and over.
    const prevAge = years[i - 1].age;
    const transferOut = Math.max(
      otherDrain(y.age) - otherDrain(prevAge) * (1 + OA_RATE),
      0,
    );
    const drain = mort + transferOut;

    oaOnly = Math.max(oaOnly + oaYearInterest(oaOnly, y.age) + contrib - drain, 0);
    retained = Math.max(retained + oaYearInterest(retained, y.age) + toOa - drain, 0);
    invested = invested * (1 + r) + toInvest;

    // Age 55: the RA is filled from the SA first, and the OA is drawn on only
    // if the SA could not reach the retirement sum. That money is NOT lost —
    // it sits in the RA earning 4% + extra interest — but it does leave the OA,
    // so an OA chart that ignored it would overstate the balance from 55 on.
    //
    // The sweep takes CASH. CPFIS-OA holdings are not liquidated at 55, so the
    // invested bucket is untouched and only the OA cash can be drawn on (capped
    // at what is actually there). That is a real, material edge for investing,
    // and the chart now shows it instead of hiding it.
    const sweep = y.overflow_out?.oa_to_ra ?? 0;
    if (sweep > 0) {
      const fromOaOnly = Math.min(sweep, oaOnly);
      oaOnly -= fromOaOnly;
      raOnly += fromOaOnly;

      const fromRetained = Math.min(sweep, retained);
      retained -= fromRetained;
      raSplit += fromRetained;
    }
    // The RA keeps compounding at 4% + extra interest (from 55: +2% on the
    // first $30k, +1% on the next $30k) — counted so the two totals stay
    // comparable and no money appears to vanish at 55.
    raOnly += raYearInterest(raOnly);
    raSplit += raYearInterest(raSplit);

    rows.push({
      age: y.age,
      oaOnly, retained, invested,
      raOnly, raSplit,
      combined: retained + invested,
      totalOnly: oaOnly + raOnly,
      totalSplit: retained + invested + raSplit,
    });
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
  // Compare TOTALS (OA + RA + invested), not the OA alone. From 55 the sweep
  // moves OA cash into the RA; measuring only the OA would read that as a loss
  // when the money is simply sitting in another account. The two lines sweep
  // different amounts (CPFIS holdings are not liquidated, so the investing line
  // keeps more outside the RA), and the total-wealth gap is what Overview wants.
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

  // CPFIS-OA investing: take the GAP between the two lines of one simulation
  // (totals, so the age-55 RA sweep reads as a move rather than a loss), never
  // the invested pot on its own — its principal is OA money the baseline is
  // already growing, so adding the whole pot would double-count it.
  //
  // Gated on `enabled`: the defaults describe a real 10% investment, so an
  // un-engaged calculator must contribute nothing rather than silently inflate
  // the total. `oaOut` goes in as the drain so the split can only invest OA
  // that the OA→SA transfer has not already taken.
  const invGap = new Map<number, number>();
  if (p.oaInvest?.enabled) {
    for (const row of simulateOaSplit(years, p.oaInvest, p.oaMortgage, oaOut)) {
      invGap.set(row.age, row.totalSplit - row.totalOnly);
    }
  }

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
