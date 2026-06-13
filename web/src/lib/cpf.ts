// Indicative CPF allocation — share of (capped) monthly wage that flows to each
// account, combining the employee and employer portions, by age band. These are
// indicative figures for a transparency estimate; the projection engine applies
// the precise, policy-versioned rates. Post-55 the SA share is paid into the RA.
export interface AllocShares {
  OA: number;
  SA: number;
  MA: number;
}

export function allocShares(age: number): AllocShares {
  if (age <= 35) return { OA: 0.23, SA: 0.06, MA: 0.08 }; // total 37%
  if (age <= 45) return { OA: 0.21, SA: 0.07, MA: 0.09 };
  if (age <= 50) return { OA: 0.19, SA: 0.08, MA: 0.10 };
  if (age <= 55) return { OA: 0.15, SA: 0.115, MA: 0.105 };
  if (age <= 60) return { OA: 0.12, SA: 0.035, MA: 0.105 }; // SA share -> RA
  if (age <= 65) return { OA: 0.035, SA: 0.025, MA: 0.105 };
  if (age <= 70) return { OA: 0.01, SA: 0.025, MA: 0.105 };
  return { OA: 0.005, SA: 0.01, MA: 0.105 };
}

// Monthly inflow to one account: capped wage x that account's share.
export function monthlyContribution(
  grossWage: number,
  age: number,
  account: keyof AllocShares,
  owCeiling: number,
): number {
  const cappedWage = Math.min(grossWage, owCeiling > 0 ? owCeiling : grossWage);
  return cappedWage * allocShares(age)[account];
}
