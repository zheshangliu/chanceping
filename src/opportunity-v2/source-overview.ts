import fs from "node:fs";
import path from "node:path";
import { filterOpportunityV2Radar, opportunityV2LiveStatus } from "./radar-view";
import { readOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources } from "./source-pool";
import { getOpportunityV2SourcePermission, getOpportunityV2SourcePermissionEvidence, isOpportunityV2SourceRunnable, sourceFreshness, type OpportunityV2FreshnessStatus, type OpportunityV2SourcePermission } from "./source-governance";
import type { OpportunityV2Source, OpportunityV2SourceHealth } from "./types";

export interface OpportunityV2SourceOverviewRow extends OpportunityV2Source {
  module_labels: string[];
  last_attempt_at: string | null;
  last_success_at: string | null;
  parser: string;
  items_seen: number;
  current_contribution: number;
  publishable_contribution: number;
  failure_reason: string | null;
  permission_state: OpportunityV2SourcePermission;
  permission_basis: string;
  permission_evidence_url: string | null;
  freshness_status: OpportunityV2FreshnessStatus;
  freshness_age_hours: number | null;
  stale_after_hours: number;
  effective_status: string;
  last_verified_content_at: string | null;
  partial: boolean;
  next_page: number | string | null;
}

function readHealth(filePath?: string): OpportunityV2SourceHealth[] {
  const configured = filePath ?? process.env.CHANCEPING_OPPORTUNITY_V2_HEALTH_PATH;
  const target = configured ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/source-health.json" : "data/opportunity-v2/source-health.json");
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(target), "utf8")) as { sources?: OpportunityV2SourceHealth[] };
    return Array.isArray(value.sources) ? value.sources : [];
  } catch {
    return [];
  }
}

function moduleLabel(value: string): string {
  const labels: Record<string, string> = { competition: "赛事", cultural_creative: "文创", craft: "手工艺", heritage: "非遗", open_call: "征集", exhibition: "展览", market: "市集", procurement: "采购", residency: "驻地", grant: "资助", fellowship: "研修", mobility: "交流" };
  return labels[value] ?? value;
}

export function buildOpportunityV2SourceOverview(options: { sourcesPath?: string; poolPath?: string; healthPath?: string; now?: Date } = {}): { summary: Record<string, number>; next_run_at: string | null; rows: OpportunityV2SourceOverviewRow[] } {
  const now = options.now ?? new Date();
  const sources = readOpportunityV2Sources(options.sourcesPath);
  const health = readHealth(options.healthPath);
  const pool = readOpportunityV2Pool(options.poolPath).opportunities;
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const currentPool = filterOpportunityV2Radar(pool, sources);
  const rows = sources.map((source) => {
    const latest = healthById.get(source.id);
    const currentContribution = getOpportunityV2SourcePermission(source.id) === "COMPLIANCE_HOLD" ? 0 : currentPool.filter((item) => item.discovered_by_sources.includes(source.id) && opportunityV2LiveStatus(item) !== "EXPIRED").length;
    const lastSuccess = source.last_fetch_at ?? (latest?.ok ? latest.fetched_at : null);
    const freshness = sourceFreshness(lastSuccess, now);
    const permission = getOpportunityV2SourcePermission(source.id);
    const permissionEvidence = getOpportunityV2SourcePermissionEvidence(source.id);
    const effectiveStatus = permission === "COMPLIANCE_HOLD" ? "COMPLIANCE_HOLD" : freshness.status === "STALE" ? "STALE" : source.status;
    return { ...source, module_labels: source.types.map(moduleLabel), last_attempt_at: latest?.fetched_at ?? null, last_success_at: lastSuccess, parser: latest?.format ?? "—", items_seen: latest?.items_seen ?? 0, current_contribution: currentContribution, publishable_contribution: currentContribution, failure_reason: latest?.ok ? null : latest?.error ?? null, permission_state: permission, permission_basis: permissionEvidence.basis, permission_evidence_url: permissionEvidence.url, freshness_status: freshness.status, freshness_age_hours: freshness.age_hours, stale_after_hours: freshness.stale_after_hours, effective_status: effectiveStatus, last_verified_content_at: latest?.verified_content_at ?? null, partial: latest?.partial ?? false, next_page: latest?.next_page ?? null };
  });
  const summary = { registered: sources.length, enabled: sources.filter((source) => source.enabled).length, runnable: sources.filter(isOpportunityV2SourceRunnable).length, recent_success: rows.filter((row) => row.freshness_status === "FRESH").length, stale: rows.filter((row) => row.freshness_status === "STALE").length, never_succeeded: rows.filter((row) => row.freshness_status === "NEVER_SUCCEEDED").length, compliance_hold: rows.filter((row) => row.permission_state === "COMPLIANCE_HOLD").length, failed: sources.filter((source) => source.status === "FAILED").length, needs_adapter: sources.filter((source) => source.status === "NEEDS_ADAPTER").length, current_contribution: currentPool.length };
  let next_run_at: string | null = null;
  const schedulerPath = process.env.CHANCEPING_OPPORTUNITY_V2_SCHEDULER_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/scheduler.json" : "data/opportunity-v2/scheduler.json");
  try { next_run_at = (JSON.parse(fs.readFileSync(path.resolve(schedulerPath), "utf8")) as { next_run_at?: string }).next_run_at ?? null; } catch { /* optional in a fresh local checkout */ }
  return { summary, next_run_at, rows };
}
