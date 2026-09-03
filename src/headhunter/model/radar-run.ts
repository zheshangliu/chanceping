export type RadarRunTriggerType = "scheduled" | "manual";

export type RadarRunStatus = "running" | "success" | "partial" | "failed";

export interface ProviderUsage {
  provider: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  known_cost: number | null;
  unknown_cost: boolean;
}

export interface RadarRun {
  radar_run_id: string;
  trigger_type: RadarRunTriggerType;
  started_at: string;
  finished_at: string | null;
  status: RadarRunStatus;
  queries: string[];
  provider_usage: ProviderUsage[];
  cost_summary: {
    known_cost: number;
    unknown_cost: boolean;
    unknown_providers?: string[];
    currency: string;
  };
  company_count: number;
  signal_count: number;
  lead_count: number;
  /** V1.2 stage-level observability. Optional for backward-compatible stored runs. */
  candidate_url_count?: number;
  company_candidate_count?: number;
  company_resolved_count?: number;
  company_review_count?: number;
  job_count?: number;
  person_candidate_count?: number;
  verified_person_count?: number;
  contact_count?: number;
  contact_gate_pass_count?: number;
  need_count?: number;
  a_count?: number;
  b_count?: number;
  stage_metrics?: Record<string, number>;
  provider_cost_known?: number | null;
  provider_cost_unknown?: boolean;
}

export function isRadarRunStatus(value: string): value is RadarRunStatus {
  return ["running", "success", "partial", "failed"].includes(value);
}
