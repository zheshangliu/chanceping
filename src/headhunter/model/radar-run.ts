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
    currency: string;
  };
  company_count: number;
  signal_count: number;
  lead_count: number;
}

export function isRadarRunStatus(value: string): value is RadarRunStatus {
  return ["running", "success", "partial", "failed"].includes(value);
}
