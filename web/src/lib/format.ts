export const sgd = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("en-SG", {
    style: "currency", currency: "SGD", maximumFractionDigits: 0,
  }).format(n);

export const sgdK = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`;
};

// Compact, human-readable money. 1,000,000 -> "$1 Mil"; 1,250,000 -> "$1.25 Mil";
// 12,000 -> "$12k"; 950 -> "$950". Avoids hard-to-read figures like "$1000k".
export const sgdCompact = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = Math.round((abs / 1_000_000) * 100) / 100; // 2 dp, trimmed
    return `${sign}$${m} Mil`;
  }
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
};

// ISO date "YYYY-MM-DD" → "MM/YYYY" (month precision for birth date).
export const dobMMYYYY = (dob: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(dob);
  return m ? `${m[2]}/${m[1]}` : dob;
};

export const ageFromDob = (dob: string): number => {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() ||
      (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
};
