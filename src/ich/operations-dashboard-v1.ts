import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "./status";
import { IchOpportunityStore } from "./store";
import { getIchSourceRegistryV2 } from "./source-registry-v2";
import { ICH_PRIMARY_CATEGORIES } from "./types";
import { ICH_DS7_SOURCE_WORKFLOWS } from "./source-workflows-v1";

export const ICH_OPERATIONS_DASHBOARD_SCHEMA = "ich-operations-dashboard.v1" as const;

type JsonRecord = Record<string, unknown>;

function readJson<T extends JsonRecord>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as T : null;
  } catch {
    return null;
  }
}

function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export interface IchOperationsDashboardOptions {
  rootDirectory?: string;
  storePath?: string;
  now?: Date;
}

export function buildIchOperationsDashboard(options: IchOperationsDashboardOptions = {}) {
  const root = options.rootDirectory ?? process.cwd();
  const now = options.now ?? new Date();
  const storePath = options.storePath ?? process.env.CHANCEPING_ICH_STORE_PATH ?? path.join(root, "data/ich-opportunities.json");
  const entries = new IchOpportunityStore(storePath, path.join(root, "src/ich/opportunities.verified.json")).list();
  const publicEntries = entries.filter((entry) => entry.is_published && entry.classification_status !== "rejected" && entry.verification.verification_status !== "rejected");
  const historyStatuses = new Set(["expired", "ended", "cancelled", "source_unavailable"]);
  const statusCounts: Record<string, number> = {};
  let published = 0;
  let historical = 0;
  let withdrawn = 0;
  let staleRecheck = 0;
  for (const entry of publicEntries) {
    const status = computeIchOpportunityStatus(entry, now);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (entry.workflow.state === "published" && entry.is_published) published += 1;
    if (historyStatuses.has(status)) historical += 1;
    if (["withdrawn", "archived"].includes(entry.workflow.state)) withdrawn += 1;
    if (entry.verification.needs_recheck || (entry.verification.recheck_after && new Date(entry.verification.recheck_after).getTime() <= now.getTime())) staleRecheck += 1;
  }

  const registry = getIchSourceRegistryV2();
  const sourceStatus = Object.fromEntries(["planned", "adapter_ready", "discovery_only", "disabled"].map((status) => [
    status,
    registry.sources.filter((source) => source.operational_status === status).length,
  ]));
  const categoryCoverage = Object.fromEntries(ICH_PRIMARY_CATEGORIES.map((category) => [
    category,
    ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.categories.includes(category)).length,
  ]));

  const schedule = readJson<JsonRecord>(path.join(root, "ops/ich-ds6-schedule.json"));
  const ledger = readJson<JsonRecord>(path.join(root, "docs/ich/DS6-只读调度运行账本_V1.0.json"));
  const runs = Array.isArray(ledger?.runs) ? ledger.runs.filter((run): run is JsonRecord => Boolean(run && typeof run === "object" && !Array.isArray(run))) : [];
  const recentRuns = runs.slice(-5).map((run) => ({
    run_id: typeof run.run_id === "string" ? run.run_id : null,
    ran_at: isoOrNull(run.ran_at),
    gate: typeof run.gate === "string" ? run.gate : "unknown",
    readonly: run.readonly === true,
    formal_store_write: run.formal_store_write === true,
    formal_store_unchanged: run.formal_store_unchanged === true,
  }));
  const latestRun = recentRuns.at(-1) ?? null;
  const ds8 = readJson<JsonRecord>(path.join(root, "docs/ich/DS8-生命周期审计记录_V1.0.json"));
  const duplicateGroups = Array.isArray(ds8?.published_primary_url_duplicate_groups) ? ds8.published_primary_url_duplicate_groups.length : 0;
  const ds5 = readJson<JsonRecord>(path.join(root, "docs/ich/DS5-规模化运营运行记录_V1.0.json"));
  const ds5Snapshot = (ds5?.formal_store_snapshot && typeof ds5.formal_store_snapshot === "object" ? ds5.formal_store_snapshot : {}) as JsonRecord;
  const dynamicHistorical = historical;
  const ds5Current = typeof ds5Snapshot.current === "number" ? ds5Snapshot.current : null;
  const ds5Historical = typeof ds5Snapshot.historical === "number" ? ds5Snapshot.historical : null;

  return {
    schema_version: ICH_OPERATIONS_DASHBOARD_SCHEMA,
    generated_at: now.toISOString(),
    formal_store: {
      total: entries.length,
      published,
      current: Object.entries(statusCounts).filter(([status]) => !historyStatuses.has(status)).reduce((total, [, count]) => total + count, 0),
      historical,
      withdrawn,
      status_counts: statusCounts,
      stale_recheck: staleRecheck,
    },
    ds5_snapshot: {
      ran_at: isoOrNull(ds5?.ran_at),
      snapshot_current: ds5Current,
      snapshot_historical: ds5Historical,
      dynamic_current: Object.entries(statusCounts).filter(([status]) => !historyStatuses.has(status)).reduce((total, [, count]) => total + count, 0),
      dynamic_historical: dynamicHistorical,
      current_drift: ds5Current === null ? null : Object.entries(statusCounts).filter(([status]) => !historyStatuses.has(status)).reduce((total, [, count]) => total + count, 0) - ds5Current,
      historical_drift: ds5Historical === null ? null : dynamicHistorical - ds5Historical,
    },
    source_registry: {
      total: registry.sources.length,
      query_packs: registry.query_packs.length,
      status_counts: sourceStatus,
      primary_detail_page_required: registry.default_policy.primary_detail_page_required_for_formal_publish,
    },
    source_workflows: {
      total: ICH_DS7_SOURCE_WORKFLOWS.length,
      adapters: ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.mode === "adapter").length,
      manual: ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.mode === "manual").length,
      greater_bay_area: ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.geography.some((item) => ["guangzhou", "guangdong", "greater_bay_area"].includes(item))).length,
      international: ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.geography.includes("international")).length,
      category_coverage: categoryCoverage,
    },
    ds6_schedule: {
      enabled: schedule?.enabled === true,
      timezone: typeof schedule?.timezone === "string" ? schedule.timezone : null,
      interval_days: typeof schedule?.interval_days === "number" ? schedule.interval_days : null,
      run_mode: typeof schedule?.run_mode === "string" ? schedule.run_mode : null,
      formal_store_write: schedule?.formal_store_write === true,
      run_count: runs.length,
      latest_run: latestRun,
      recent_runs: recentRuns,
    },
    ds8_lifecycle: {
      gate: typeof ds8?.gate === "string" ? ds8.gate : "not_available",
      stale_recheck: typeof ds8?.stale_recheck_count === "number" ? ds8.stale_recheck_count : staleRecheck,
      duplicate_groups: duplicateGroups,
      max_batch_size: typeof (ds8?.batch_policy as JsonRecord | undefined)?.max_batch_size === "number" ? (ds8?.batch_policy as JsonRecord).max_batch_size : 10,
      formal_store_write: (ds8?.batch_policy as JsonRecord | undefined)?.formal_store_write === true,
    },
    safety: {
      formal_store_write_from_dashboard: false,
      secrets_in_response: false,
      note: "运营面板只读；候选晋级仍需经过人工审核和受控发布门禁。",
    },
  };
}
