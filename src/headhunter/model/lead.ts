export type LeadPool = "A_ACTIONABLE" | "B_ENRICHMENT" | "ARCHIVED";

export type RequirementClarity = "explicit_required" | "explicit_preferred" | "not_mentioned";

export type EmploymentStatus = "verified_current" | "likely_current" | "stale" | "unknown";

export type NeedBasis = "explicit_hiring" | "high_confidence_business_inference" | "general_business_inference";

export type GateStatus = "pass" | "fail";

export interface NeedInference {
  need_inference_id: string;
  company_id: string;
  weekly_lead_snapshot_id: string | null;
  need_type: string;
  role_family: string;
  basis: NeedBasis;
  confidence: number;
  fact_basis_ids: string[];
  signal_ids: string[];
  reasoning_summary: string;
}

export interface WeeklyLeadSnapshot {
  id: string;
  company_id: string;
  week_key: string;
  radar_run_id: string | null;
  source: "auto" | "manual";
  primary_trigger_id: string | null;
  supporting_signal_ids: string[];
  need_inference_ids: string[];
  contact_gate_status: GateStatus;
  evidence_gate_status: GateStatus;
  business_score: number;
  freshness_score: number;
  final_rank_score: number;
  lead_pool: LeadPool;
  b_reasons: string[];
  generated_action: string | null;
  manual_action: string | null;
  generated_outreach: string | null;
  manual_outreach: string | null;
  action_manually_edited: boolean;
  outreach_manually_edited: boolean;
  manual_edit: boolean;
  manual_pool_override: LeadPool | null;
  opportunity_summary?: string;
  cost_breakdown?: {
    search_request_count: number;
    provider_cost: number | null;
    read_cost: number | null;
    llm_cost: number | null;
    enrichment_cost: number | null;
    total_intelligence_cost: number | null;
  };
  created_at: string;
  updated_at: string;
}

export function isLeadPool(value: string): value is LeadPool {
  return ["A_ACTIONABLE", "B_ENRICHMENT", "ARCHIVED"].includes(value);
}

export function isRequirementClarity(value: string): value is RequirementClarity {
  return ["explicit_required", "explicit_preferred", "not_mentioned"].includes(value);
}

export function isEmploymentStatus(value: string): value is EmploymentStatus {
  return ["verified_current", "likely_current", "stale", "unknown"].includes(value);
}

export function isNeedBasis(value: string): value is NeedBasis {
  return ["explicit_hiring", "high_confidence_business_inference", "general_business_inference"].includes(value);
}
