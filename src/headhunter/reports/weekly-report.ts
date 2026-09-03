import type { WeeklySnapshot } from "../model/weekly-snapshot";
import type { HeadHunterRadarResult } from "../pipeline/radar-pipeline";

export function buildWeeklySnapshot(runResult: HeadHunterRadarResult): WeeklySnapshot {
  const now = new Date().toISOString();
  const leads = runResult.leads;
  const blockingReasons: Record<string, number> = {};
  for (const lead of leads.filter((item) => item.lead_pool === "B_ENRICHMENT")) {
    for (const reason of lead.b_reasons) blockingReasons[reason] = (blockingReasons[reason] ?? 0) + 1;
  }
  return {
    weekly_snapshot_id: `weekly-${runResult.week_key}`,
    week_key: runResult.week_key,
    radar_run_id: runResult.radar_run_id,
    published: false,
    published_at: null,
    lead_ids: runResult.leads.map((lead) => lead.id),
    trend_ids: runResult.trends.map((trend) => trend.trend_id),
    leads,
    trends: runResult.trends,
    markdown: null,
    created_at: now,
    updated_at: now,
    funnel_metrics: runResult.funnel_metrics,
  };
}
