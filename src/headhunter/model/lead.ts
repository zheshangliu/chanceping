export type LeadPool = "A_ACTIONABLE" | "B_ENRICHMENT" | "ARCHIVED";

export type RequirementClarity = "explicit_required" | "explicit_preferred" | "not_mentioned";

export type EmploymentStatus = "verified_current" | "likely_current" | "stale" | "unknown";

export type NeedBasis = "explicit_hiring" | "high_confidence_business_inference" | "general_business_inference";

export type GateStatus = "pass" | "fail";

export interface LeadEvidenceView {
  evidence_id: string;
  title: string;
  summary: string;
  source_name: string;
  source_type: string;
  source_url: string;
  published_at: string | null;
  evidence_level: string;
  is_first_party: boolean;
  cross_verified: boolean;
}

export interface LeadContactView {
  contact_id: string;
  name: string | null;
  title: string | null;
  organization: string | null;
  contact_type: string;
  url: string | null;
  email: string | null;
  phone: string | null;
  verification_status: string;
}

export interface OfficialContactEntryView {
  type: string;
  label: string;
  url?: string;
  email?: string;
  phone?: string;
}

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
  /** Company and business interpretation fields are persisted at run time. */
  company_name?: string;
  industry?: string | null;
  region?: string | null;
  primary_trigger?: { title: string; summary: string; event_date: string | null; source_name: string | null; source_url: string | null } | null;
  trigger_summary_zh?: string | null;
  why_now_zh?: string | null;
  talent_need_zh?: string | null;
  service_wedge_zh?: string | null;
  bd_action_zh?: string | null;
  first_touch_script_zh?: string | null;
  fact_summary_zh?: string | null;
  inference_summary_zh?: string | null;
  evidence_count?: number;
  evidence_ids?: string[];
  evidences?: LeadEvidenceView[];
  contacts?: LeadContactView[];
  official_contact_entries?: OfficialContactEntryView[];
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
