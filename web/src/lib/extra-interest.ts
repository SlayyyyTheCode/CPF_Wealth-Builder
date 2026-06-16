// Estimated CPF extra interest per account, mirroring the engine
// (api/app/engines/interest.py monthly_extra): the extra-interest band is
// filled in priority order RA → OA → SA → MA. OA counts at most $20,000.
// Below 55: +1% on the first $60,000 combined.
// 55+:      +2% on the first $30,000, +1% on the next $30,000.
import type { Balances } from "@/lib/types";

const OA_EXTRA_CAP = 20000;
const ORDER: (keyof Balances)[] = ["RA", "OA", "SA", "MA"];

export function extraInterestByAccount(b: Balances, age: number): Balances {
  const out: Balances = { OA: 0, SA: 0, MA: 0, RA: 0 };
  const avail = (a: keyof Balances) =>
    a === "OA" ? Math.min(b.OA, OA_EXTRA_CAP) : b[a];

  if (age >= 55) {
    let t1 = 30000; // +2% band
    let t2 = 30000; // +1% band
    for (const a of ORDER) {
      let bal = avail(a);
      const x1 = Math.min(bal, t1); t1 -= x1; bal -= x1; out[a] += x1 * 0.02;
      const x2 = Math.min(bal, t2); t2 -= x2; out[a] += x2 * 0.01;
    }
  } else {
    let cap = 60000; // +1% band
    for (const a of ORDER) {
      const x = Math.min(avail(a), cap); cap -= x; out[a] += x * 0.01;
    }
  }
  return out;
}
