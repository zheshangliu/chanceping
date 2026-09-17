import fs from "node:fs";
import path from "node:path";
import { filterOpportunityV2Radar, opportunityV2LiveStatus } from "./radar-view";
import { readOpportunityV2Pool } from "./opportunity-pool";
import { readOpportunityV2Sources } from "./source-pool";
import type { OpportunityV2Source, OpportunityV2SourceHealth } from "./types";

export interface OpportunityV2SourceOverviewRow extends OpportunityV2Source {
  module_labels: string[];
  last_attempt_at: string | null;
  last_success_at: string | null;
  parser: string;
  items_seen: number;
  current_contribution: number;
  failure_reason: string | null;
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

export function buildOpportunityV2SourceOverview(options: { sourcesPath?: string; poolPath?: string; healthPath?: string } = {}): { summary: Record<string, number>; next_run_at: string | null; rows: OpportunityV2SourceOverviewRow[] } {
  const sources = readOpportunityV2Sources(options.sourcesPath);
  const health = readHealth(options.healthPath);
  const pool = readOpportunityV2Pool(options.poolPath).opportunities;
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const currentPool = filterOpportunityV2Radar(pool, sources);
  const rows = sources.map((source) => {
    const latest = healthById.get(source.id);
    const currentContribution = currentPool.filter((item) => item.discovered_by_sources.includes(source.id) && opportunityV2LiveStatus(item) !== "EXPIRED").length;
    return { ...source, module_labels: source.types.map(moduleLabel), last_attempt_at: latest?.fetched_at ?? null, last_success_at: latest?.ok ? latest.fetched_at : source.last_fetch_at, parser: latest?.format ?? "—", items_seen: latest?.items_seen ?? 0, current_contribution: currentContribution, failure_reason: latest?.ok ? null : latest?.error ?? null };
  });
  const enabled = sources.filter((source) => source.enabled);
  const summary = { registered: sources.length, enabled: enabled.length, recent_success: health.filter((row) => row.ok).length, failed: sources.filter((source) => source.status === "FAILED").length, needs_adapter: sources.filter((source) => source.status === "NEEDS_ADAPTER").length, current_contribution: currentPool.length };
  let next_run_at: string | null = null;
  const schedulerPath = process.env.CHANCEPING_OPPORTUNITY_V2_SCHEDULER_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/scheduler.json" : "data/opportunity-v2/scheduler.json");
  try { next_run_at = (JSON.parse(fs.readFileSync(path.resolve(schedulerPath), "utf8")) as { next_run_at?: string }).next_run_at ?? null; } catch { /* optional in a fresh local checkout */ }
  return { summary, next_run_at, rows };
}
