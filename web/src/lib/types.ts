export interface Readiness { score: number; band: "on_track" | "below_frs_pace" | "below_brs"; }
export interface LatestRun {
  readiness: Readiness | null;
  total_at_payout: number | null;
  cpf_life_monthly: number | null;
}
export interface MemberSummary {
  id: number; name: string; dob: string;
  employment_status: string; current_total: number; latest_run: LatestRun | null;
  has_password?: boolean;
}
export interface Balances { OA: number; SA: number; MA: number; RA: number; }
export interface HousingData { monthly_mortgage?: number }
export interface Member {
  id: number; name: string; dob: string; monthly_gross_wage: number;
  employment_status: string; balances: Balances; special_access?: boolean;
  housing_data?: HousingData | null; has_password?: boolean;
  salary_increment_pct?: number; bonus_months?: number;
}
export interface YearRow {
  year: number; age: number;
  opening?: Balances; closing: Balances;
  total_contributions?: number; interest_base?: number; interest_extra?: number;
  interest_by_account?: { OA: number; SA: number; MA: number; RA: number };
  contribution_by_account?: { OA: number; SA: number; MA: number; RA: number };
  overflow_out?: { ma_to_sa: number; ma_to_oa: number; ma_to_ra: number; sa_to_oa: number; sa_to_ra: number };
}
export interface CpfLife {
  eligible: boolean; monthly_payout: number; annual_payout: number;
  lifetime_payout: number; break_even_age: number; payout_age: number;
}
export interface SimResult {
  final: Balances; years: YearRow[]; cpf_life: CpfLife | Record<string, never>;
  readiness: Readiness | null;
  milestones?: {
    bhs_age: number | null; frs_age: number | null;
    ers_age: number | null; cpf_life_eligible_age: number | null;
  };
  medisave?: {
    series: { age: number; ma: number; bhs: number }[];
    premiums: { age: number; annual: number }[];
    ma_at_85: number | null; premium_at_85: number | null;
    surplus_at_85: number | null; adequate: boolean | null;
  };
}
export interface SimRun { id: number; member_id: number; result: SimResult; }
export interface NewMember {
  name: string; dob: string; monthly_gross_wage: number;
  employment_status: string; balances: Balances; housing_data?: HousingData | null;
  password?: string; salary_increment_pct?: number; bonus_months?: number;
}
export interface Strategy {
  name: string; trigger_met: boolean;
  outputs: Record<string, number>; estimated_benefit: number;
}
export interface Analysis {
  scenarios: Record<string, Record<string, unknown>>;
  strategies: Strategy[];
}
export interface PolicyCore {
  effective_year: number; frs: number; brs: number; ers: number; bhs: number;
  ordinary_wage_ceiling: number; additional_wage_ceiling: number; cpf_life_eligibility_min: number;
}
export interface DiffRow { field: string; current: number | null; extracted: number | null; changed: boolean; }
export interface IngestResult { extracted: PolicyCore; diff: DiffRow[]; carried_forward: Record<string, unknown>; }
export interface SnapshotListItem { id: number; effective_year: number; status: string; created_at: string; approved_at: string | null; }
export interface MemberUpdate { name?: string; dob?: string; monthly_gross_wage?: number; employment_status?: string; balances?: Balances; special_access?: boolean; housing_data?: HousingData | null; password?: string; salary_increment_pct?: number; bonus_months?: number; }
export interface TaxEstimate { estimated_tax_saved: number; marginal_rate: number; }
export type Residency = "citizen" | "pr" | "foreigner";
export interface TaxRelief { relief_earned: number; remaining_cap: number; estimated_tax_saved: number; marginal_rate: number; srs_relief: number; srs_remaining_cap: number; total_relief: number; personal_cap_hit: boolean; }
export interface Assumptions {
  readiness: { w_sum: number; w_ma: number; on_track: number; below_frs_pace: number };
  growth: { sum_rate: number; bhs_rate: number };
  cpf_life: { longevity_age: number; ra_rate: number; escalating_rate: number; basic_decline: number; deferral_per_year: number; deferral_cap: number };
}
