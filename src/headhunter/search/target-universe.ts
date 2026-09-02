export type TargetSegment = "hk_finance" | "gba_company" | "outbound_manufacturing" | "other";

export interface TargetCompany {
  company_id: string;
  name: string;
  segment: TargetSegment;
}

export function limitTargetUniverse(companies: TargetCompany[], max = 20): TargetCompany[] { return companies.slice(0, max); }
