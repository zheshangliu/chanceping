import type { TrendIntelligence } from "./trend";
import type { WeeklyLeadSnapshot } from "./lead";

export interface WeeklySnapshot {
  weekly_snapshot_id: string;
  week_key: string;
  radar_run_id: string | null;
  published: boolean;
  published_at: string | null;
  lead_ids: string[];
  trend_ids: string[];
  leads: WeeklyLeadSnapshot[];
  trends: TrendIntelligence[];
  markdown: string | null;
  created_at: string;
  updated_at: string;
  /** V1.2 funnel explains both positive and zero-A runs. */
  funnel_metrics?: {
    candidate_url_count: number;
    company_candidate_count: number;
    company_resolved_count: number;
    signal_count: number;
    job_count: number;
    person_candidate_count: number;
    contact_count: number;
    need_count: number;
    a_count: number;
    b_count: number;
    blocking_reasons?: Record<string, number>;
  };
}

/** Returns the ISO-8601 week in Asia/Shanghai, formatted as YYYY-Www. */
export function computeWeekKey(date: Date, timeZone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function createTestWeeklyLeadSnapshot(): WeeklyLeadSnapshot {
  const now = "2026-09-07T00:00:00+08:00";
  return {
    id: "lead-test-1",
    company_id: "company-test-1",
    week_key: computeWeekKey(new Date(now)),
    radar_run_id: null,
    source: "auto",
    primary_trigger_id: null,
    supporting_signal_ids: [],
    need_inference_ids: [],
    contact_gate_status: "fail",
    evidence_gate_status: "pass",
    business_score: 55,
    freshness_score: 50,
    final_rank_score: 54,
    lead_pool: "B_ENRICHMENT",
    b_reasons: ["missing_contact"],
    generated_action: null,
    manual_action: null,
    generated_outreach: null,
    manual_outreach: null,
    action_manually_edited: false,
    outreach_manually_edited: false,
    manual_edit: false,
    manual_pool_override: null,
    created_at: now,
    updated_at: now,
  };
}
