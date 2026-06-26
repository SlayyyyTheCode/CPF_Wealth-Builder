// Singapore resident income-tax (YA 2024+) — client-side mirror of the backend
// engine, so calculators work without a round-trip to the API.
// Each entry: lower bound, cumulative tax at that bound, marginal rate above it.
export const TAX_BRACKETS = [
  { lower: 0, cum: 0, rate: 0 },
  { lower: 20000, cum: 0, rate: 0.02 },
  { lower: 30000, cum: 200, rate: 0.035 },
  { lower: 40000, cum: 550, rate: 0.07 },
  { lower: 80000, cum: 3350, rate: 0.115 },
  { lower: 120000, cum: 7950, rate: 0.15 },
  { lower: 160000, cum: 13950, rate: 0.18 },
  { lower: 200000, cum: 21150, rate: 0.19 },
  { lower: 240000, cum: 28750, rate: 0.195 },
  { lower: 280000, cum: 36550, rate: 0.2 },
  { lower: 320000, cum: 44550, rate: 0.22 },
  { lower: 500000, cum: 84150, rate: 0.23 },
  { lower: 1000000, cum: 199150, rate: 0.24 },
];

/** Progressive income tax on chargeable income. */
export function incomeTax(income: number): number {
  if (income <= 0) return 0;
  let b = TAX_BRACKETS[0];
  for (const br of TAX_BRACKETS) if (income > br.lower) b = br;
  return b.cum + (income - b.lower) * b.rate;
}
