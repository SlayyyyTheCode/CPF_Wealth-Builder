import { describe, expect, it } from "vitest";
import type { YearRow } from "@/lib/types";
import {
  OA_TOPUP_CAP,
  buildScenario,
  cappedTopup,
  investibleOa,
  realValue,
  simulateOaSplit,
} from "@/lib/whatif";

function year(
  age: number,
  closing: { OA: number; SA: number; MA: number; RA: number },
  extra: Partial<YearRow> = {},
): YearRow {
  return { year: 2026 + (age - 50), age, closing, ...extra };
}

describe("cappedTopup", () => {
  it("passes through an amount under the cap", () => {
    expect(cappedTopup({ topup: 3000, startAge: 45 })).toBe(3000);
  });
  it("clamps to the default cap", () => {
    expect(cappedTopup({ topup: 100_000, startAge: 45 })).toBe(OA_TOPUP_CAP);
  });
  it("clamps a negative amount to zero", () => {
    expect(cappedTopup({ topup: -500, startAge: 45 })).toBe(0);
  });
  it("returns 0 when no params given", () => {
    expect(cappedTopup(undefined)).toBe(0);
  });
});

describe("realValue", () => {
  it("returns the nominal value with no inflation or elapsed years", () => {
    expect(realValue(1000, 0, 10)).toBe(1000);
    expect(realValue(1000, 3, 0)).toBe(1000);
  });
  it("discounts nominal dollars back to today's dollars", () => {
    expect(realValue(1000, 100, 1)).toBeCloseTo(500, 6); // 100% inflation halves it in a year
  });
});

describe("investibleOa", () => {
  it("floors investible savings at the $20k CPFIS floor", () => {
    expect(investibleOa(15_000)).toBe(0);
    expect(investibleOa(25_000)).toBe(5_000);
  });
});

describe("buildScenario", () => {
  const years: YearRow[] = [
    year(50, { OA: 1000, SA: 2000, MA: 500, RA: 0 }),
    year(51, { OA: 1100, SA: 2200, MA: 550, RA: 0 }),
  ];
  const frsInfo = { frs: 220_400, sumRate: 0.035, baseYear: 2026 };

  it("with no levers set, the scenario equals the baseline", () => {
    const rows = buildScenario(years, {}, frsInfo);
    for (const r of rows) {
      expect(r.scenOa).toBe(r.baseOa);
      expect(r.scenRa).toBe(r.baseRa);
      expect(r.scenMa).toBe(r.baseMa);
      expect(r.scen).toBe(r.base);
    }
  });

  it("an OA top-up compounds at the OA rate from its start age", () => {
    const rows = buildScenario(years, { oa: { topup: 1000, startAge: 50 } }, frsInfo);
    // k=1: 1000 * ((1.025^1 - 1) / 0.025) = 1000
    expect(rows[0].scenOa).toBeCloseTo(1000 + 1000, 6);
    // k=2: 1000 * ((1.025^2 - 1) / 0.025) = 2025
    expect(rows[1].scenOa).toBeCloseTo(1100 + 2025, 6);
  });

  it("an OA top-up above the cap is clamped before it compounds", () => {
    const rows = buildScenario(years, { oa: { topup: 100_000, startAge: 50 } }, frsInfo);
    expect(rows[0].scenOa).toBeCloseTo(1000 + OA_TOPUP_CAP, 6);
  });

  it("a CPFIS-OA investment with enabled=false contributes nothing", () => {
    // Regression test: the calculator's own defaults describe a real 10%
    // investment, so merely opening the tab must not silently inflate the
    // Overview total — only an explicit `enabled: true` may do that.
    const rows = buildScenario(
      years,
      { oaInvest: { keepInOa: 500, startAge: 50, ratePct: 10, monthly: 100, enabled: false } },
      frsInfo,
    );
    for (const r of rows) expect(r.scenOa).toBe(r.baseOa);
  });
});

describe("simulateOaSplit", () => {
  it("conserves money and shows the invested line beating OA once returns exceed the OA rate", () => {
    const years: YearRow[] = [
      year(50, { OA: 1000, SA: 0, MA: 0, RA: 0 }, { contribution_by_account: { OA: 500, SA: 0, MA: 0, RA: 0 } }),
      year(51, { OA: 1500, SA: 0, MA: 0, RA: 0 }, { contribution_by_account: { OA: 500, SA: 0, MA: 0, RA: 0 } }),
      year(52, { OA: 2000, SA: 0, MA: 0, RA: 0 }, { contribution_by_account: { OA: 500, SA: 0, MA: 0, RA: 0 } }),
    ];
    const rows = simulateOaSplit(years, { keepInOa: 100, startAge: 50, ratePct: 10, monthly: 0 });

    expect(rows).toHaveLength(3);
    // Starting split: combined equals the un-split OA balance — no money
    // appears or disappears just from drawing the line.
    expect(rows[0].oaOnly).toBe(1000);
    expect(rows[0].combined).toBeCloseTo(1000, 6);
    expect(rows[0].totalOnly).toBe(rows[0].oaOnly);
    expect(rows[0].totalSplit).toBeCloseTo(rows[0].combined, 6);

    // Age<55, balances under the $20k CPFIS-extra-interest cap: OA effectively
    // earns 2.5% + 1% = 3.5% flat. Hand-computed against that rate.
    expect(rows[1].oaOnly).toBeCloseTo(1000 + 1000 * 0.035 + 500, 6); // 1535
    expect(rows[1].retained).toBeCloseTo(100 + 100 * 0.035 + 500, 6); // 603.5
    expect(rows[1].invested).toBeCloseTo(900 * 1.1, 6); // 990

    expect(rows[2].oaOnly).toBeCloseTo(1535 + 1535 * 0.035 + 500, 6);
    expect(rows[2].combined).toBeCloseTo(1124.6225 + 1089, 4);
    // The whole point of the split: a 10% return beats the ~3.5% OA rate.
    expect(rows[2].totalSplit).toBeGreaterThan(rows[2].totalOnly);
  });

  it("never reroutes more into the investment than actually flowed into the OA", () => {
    const years: YearRow[] = [
      year(50, { OA: 1000, SA: 0, MA: 0, RA: 0 }, { contribution_by_account: { OA: 200, SA: 0, MA: 0, RA: 0 } }),
      year(51, { OA: 1200, SA: 0, MA: 0, RA: 0 }, { contribution_by_account: { OA: 200, SA: 0, MA: 0, RA: 0 } }),
    ];
    // monthly=1000/mo => 12,000/yr requested, but only 200 actually flows in.
    const rows = simulateOaSplit(years, { keepInOa: 0, startAge: 50, ratePct: 5, monthly: 1000 });
    // invested can only have grown by the capped 200, not 12,000.
    expect(rows[1].invested).toBeCloseTo(1000 * 1.05 + 200, 6);
  });

  it("returns an empty series when startAge is never reached", () => {
    const years: YearRow[] = [year(50, { OA: 1000, SA: 0, MA: 0, RA: 0 })];
    expect(simulateOaSplit(years, { keepInOa: 0, startAge: 60, ratePct: 5, monthly: 0 })).toEqual([]);
  });
});
