export type SignalType =
  | "hiring"
  | "funding"
  | "ipo"
  | "ma"
  | "new_license"
  | "new_business"
  | "new_market"
  | "factory_build"
  | "factory_expand"
  | "capacity_transfer"
  | "large_order"
  | "regional_hq"
  | "treasury_center"
  | "leadership_change"
  | "restructuring"
  | "layoff"
  | "closure"
  | "government_agreement"
  | "contact_enrichment"
  | "other";

export type ImpactLevel = "low" | "medium" | "high" | "critical" | "unknown";

export interface CompanySignal {
  signal_id: string;
  company_id: string;
  signal_type: SignalType;
  event_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  title: string;
  fact_summary: string;
  inference_summary: string | null;
  impact_level: ImpactLevel;
  primary_source_id: string | null;
  evidence_ids: string[];
  source_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export function isSignalType(value: string): value is SignalType {
  return [
    "hiring", "funding", "ipo", "ma", "new_license", "new_business", "new_market",
    "factory_build", "factory_expand", "capacity_transfer", "large_order", "regional_hq",
    "treasury_center", "leadership_change", "restructuring", "layoff", "closure",
    "government_agreement", "contact_enrichment", "other",
  ].includes(value);
}
