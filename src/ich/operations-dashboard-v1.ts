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
  const ds8Full = readJson<JsonRecord>(path.join(root, "docs/ich/DS8-全量复核动作账本_V1.0.json"));
  const duplicateGroups = Array.isArray(ds8?.published_primary_url_duplicate_groups) ? ds8.published_primary_url_duplicate_groups.length : 0;
  const fullResults = Array.isArray(ds8Full?.results) ? ds8Full.results.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  const fullDispositionCounts = ds8Full?.disposition_counts && typeof ds8Full.disposition_counts === "object" && !Array.isArray(ds8Full.disposition_counts) ? ds8Full.disposition_counts as JsonRecord : {};
  const ds5 = readJson<JsonRecord>(path.join(root, "docs/ich/DS5-规模化运营运行记录_V1.0.json"));
  const ds1b = readJson<JsonRecord>(path.join(root, "docs/ich/DS1-B-候选样本运行记录_V1.0.json"));
  const ds1c = readJson<JsonRecord>(path.join(root, "docs/ich/DS1-C-候选审计记录_V1.0.json"));
  const ds2 = readJson<JsonRecord>(path.join(root, "docs/ich/DS2-只读发现运行记录_V1.0.json"));
  const ds3 = readJson<JsonRecord>(path.join(root, "docs/ich/DS3-候选质量运行记录_V1.0.json"));
  const ds5Snapshot = (ds5?.formal_store_snapshot && typeof ds5.formal_store_snapshot === "object" ? ds5.formal_store_snapshot : {}) as JsonRecord;
  const dynamicHistorical = historical;
  const ds5Current = typeof ds5Snapshot.current === "number" ? ds5Snapshot.current : null;
  const ds5Historical = typeof ds5Snapshot.historical === "number" ? ds5Snapshot.historical : null;
  const ds2SourceRuns = Array.isArray(ds2?.source_runs) ? ds2.source_runs.filter((run): run is JsonRecord => Boolean(run && typeof run === "object" && !Array.isArray(run))) : [];
  const ds1cItems = Array.isArray(ds1c?.items) ? ds1c.items.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  const ds3Assessments = Array.isArray(ds3?.assessments) ? ds3.assessments.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  const sourceHealthItems = registry.sources.map((source) => {
    const run = ds2SourceRuns.find((item) => item.source_id === source.id);
    const candidates = ds1cItems.filter((item) => item.source_id === source.id);
    const assessments = ds3Assessments.filter((item) => item.source_id === source.id);
    const detailAccessible = candidates.filter((item) => item.source_is_detail_page === true).length;
    const fieldMissing = assessments.filter((item) => {
      const checks = item.checks && typeof item.checks === "object" && !Array.isArray(item.checks) ? item.checks as JsonRecord : {};
      return ["organizer_confirmed", "deadline_confirmed", "geography_confirmed", "category_confirmed"].some((key) => checks[key] !== true);
    }).length;
    const fieldRate = (key: string) => assessments.length > 0 ? Math.round(assessments.filter((item) => {
      const checks = item.checks && typeof item.checks === "object" && !Array.isArray(item.checks) ? item.checks as JsonRecord : {};
      return checks[key] !== true;
    }).length / assessments.length * 10000) / 100 : null;
    const duplicateCount = candidates.filter((item) => typeof item.duplicate_of_candidate_id === "string" && item.duplicate_of_candidate_id.length > 0).length;
    const candidateCount = typeof run?.candidate_count === "number" ? run.candidate_count : candidates.length;
    return {
      source_id: source.id,
      name: source.name,
      operational_status: source.operational_status,
      workflow_mode: ICH_DS7_SOURCE_WORKFLOWS.find((workflow) => workflow.source_id === source.id)?.mode ?? "unmapped",
      http_status: typeof run?.http_status === "number" ? run.http_status : null,
      last_successful_collection: run?.status === "completed" ? isoOrNull(run.finished_at) : null,
      candidate_count: candidateCount,
      detail_page_accessibility_rate: candidates.length > 0 ? Math.round(detailAccessible / candidates.length * 10000) / 100 : null,
      field_missing_rate: assessments.length > 0 ? Math.round(fieldMissing / assessments.length * 10000) / 100 : null,
      field_unconfirmed_rate: assessments.length > 0 ? Math.round(fieldMissing / assessments.length * 10000) / 100 : null,
      deadline_unconfirmed_rate: fieldRate("deadline_confirmed"),
      geography_unconfirmed_rate: fieldRate("geography_confirmed"),
      category_unconfirmed_rate: fieldRate("category_confirmed"),
      duplicate_rate: candidates.length > 0 ? Math.round(duplicateCount / candidates.length * 10000) / 100 : null,
      sample_count: candidates.length,
      action_required: source.operational_status === "planned" ? "manual_or_promotion_review" : source.operational_status === "adapter_ready" && run?.status !== "completed" ? "collection_check" : "none",
    };
  });
  const attemptedSources = sourceHealthItems.filter((item) => item.http_status !== null);
  const totalCandidates = sourceHealthItems.reduce((sum, item) => sum + item.candidate_count, 0);
  const totalAccessible = sourceHealthItems.reduce((sum, item) => sum + (item.sample_count > 0 ? Math.round(item.detail_page_accessibility_rate! * item.sample_count / 100) : 0), 0);
  const totalAssessments = ds3Assessments.length;
  const totalMissing = ds3Assessments.filter((item) => {
    const checks = item.checks && typeof item.checks === "object" && !Array.isArray(item.checks) ? item.checks as JsonRecord : {};
    return ["organizer_confirmed", "deadline_confirmed", "geography_confirmed", "category_confirmed"].some((key) => checks[key] !== true);
  }).length;
  const fieldRate = (key: string) => totalAssessments > 0 ? Math.round(ds3Assessments.filter((item) => {
    const checks = item.checks && typeof item.checks === "object" && !Array.isArray(item.checks) ? item.checks as JsonRecord : {};
    return checks[key] !== true;
  }).length / totalAssessments * 10000) / 100 : null;
  const totalDuplicates = ds1cItems.filter((item) => typeof item.duplicate_of_candidate_id === "string" && item.duplicate_of_candidate_id.length > 0).length;

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
    source_health: {
      snapshot_at: isoOrNull(ds2?.finished_at) ?? isoOrNull(ds1b?.ran_at),
      summary: {
        registered_sources: registry.sources.length,
        attempted_sources: attemptedSources.length,
        successful_sources: attemptedSources.filter((item) => item.last_successful_collection !== null).length,
        collection_success_rate: attemptedSources.length > 0 ? Math.round(attemptedSources.filter((item) => item.last_successful_collection !== null).length / attemptedSources.length * 10000) / 100 : null,
        candidate_total: totalCandidates,
        detail_page_accessibility_rate: totalCandidates > 0 ? Math.round(totalAccessible / totalCandidates * 10000) / 100 : null,
        field_missing_rate: totalAssessments > 0 ? Math.round(totalMissing / totalAssessments * 10000) / 100 : null,
        field_unconfirmed_rate: totalAssessments > 0 ? Math.round(totalMissing / totalAssessments * 10000) / 100 : null,
        deadline_unconfirmed_rate: fieldRate("deadline_confirmed"),
        geography_unconfirmed_rate: fieldRate("geography_confirmed"),
        category_unconfirmed_rate: fieldRate("category_confirmed"),
        duplicate_rate: ds1cItems.length > 0 ? Math.round(totalDuplicates / ds1cItems.length * 10000) / 100 : null,
        quality_note: "字段未确认率基于 DS3 checks，不等同于详情页正文缺失率；未确认字段不得进入正式发布。",
        planned_sources: sourceStatus.planned,
        manual_workflow_sources: ICH_DS7_SOURCE_WORKFLOWS.filter((workflow) => workflow.mode === "manual").length,
        sources_needing_action: sourceHealthItems.filter((item) => item.action_required !== "none").length,
      },
      items: sourceHealthItems,
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
      full_recheck: {
        stage: typeof ds8Full?.stage === "string" ? ds8Full.stage : "not_available",
        queue_total: typeof ds8Full?.queue_input_total === "number" ? ds8Full.queue_input_total : 0,
        processed: typeof ds8Full?.processed_count === "number" ? ds8Full.processed_count : fullResults.length,
        accessible: typeof ds8Full?.accessible_count === "number" ? ds8Full.accessible_count : 0,
        inaccessible: typeof ds8Full?.inaccessible_count === "number" ? ds8Full.inaccessible_count : 0,
        pending_actions: fullResults.filter((item) => item.formal_publish_blocked === true).length,
        disposition_counts: fullDispositionCounts,
        formal_store_unchanged: typeof ds8Full?.formal_store_before_sha256 === "string" && ds8Full.formal_store_before_sha256 === ds8Full.formal_store_after_sha256,
        gate: typeof ds8Full?.gate === "string" ? ds8Full.gate : "not_available",
      },
    },
    safety: {
      formal_store_write_from_dashboard: false,
      secrets_in_response: false,
      note: "运营面板只读；候选晋级仍需经过人工审核和受控发布门禁。",
    },
  };
}
